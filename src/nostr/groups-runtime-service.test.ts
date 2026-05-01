import { describe, expect, test, vi } from 'vitest';
import {
    GROUP_ADMINS_KIND,
    GROUP_JOIN_REQUEST_KIND,
    GROUP_LEAVE_REQUEST_KIND,
    GROUP_MEMBERS_KIND,
    GROUP_MESSAGE_KIND,
    GROUP_METADATA_KIND,
    GROUP_ROLES_KIND,
    PUBLIC_SAVED_GROUPS_KIND,
} from './groups';
import { createGroupsRuntimeService, type GroupsTransport, type RelayAuthoredGroupMetadataKind } from './groups-runtime-service';
import { fetchNip11RelayInfo } from './groups-transport';
import type { PublishResult } from './dm-types';
import type { NostrEvent, NostrFilter, NostrUnsignedEvent } from './types';

const SELF_PUBKEY = 'f'.repeat(64);
const OTHER_PUBKEY = 'a'.repeat(64);

function event(overrides: Partial<NostrEvent> & Pick<NostrEvent, 'id' | 'kind' | 'created_at'>): NostrEvent {
    return {
        pubkey: SELF_PUBKEY,
        tags: [['h', 'maps'], ['d', 'maps']],
        content: '{}',
        ...overrides,
    };
}

function relayAuthoredEvent(kind: RelayAuthoredGroupMetadataKind, overrides: Partial<NostrEvent> = {}): NostrEvent {
    return event({
        id: `meta-${kind}`,
        kind,
        created_at: kind,
        ...overrides,
    });
}

function createTransport(options: {
    self?: string;
    metadataEvents?: NostrEvent[];
    timelineEvents?: NostrEvent[];
} = {}): GroupsTransport & { fetchRelayInfo: ReturnType<typeof vi.fn>; fetchGroupEvents: ReturnType<typeof vi.fn> } {
    return {
        fetchRelayInfo: vi.fn(async () => (options.self === undefined ? {} : { self: options.self })),
        fetchGroupEvents: vi.fn(async (_relay: string, filters: NostrFilter[]) => {
            const kinds = new Set(filters.flatMap((filter) => filter.kinds ?? []));
            return kinds.has(GROUP_MESSAGE_KIND) ? options.timelineEvents ?? [] : options.metadataEvents ?? [];
        }),
    };
}

describe('groups runtime service', () => {
    test('queries metadata and timeline only on the group relay', async () => {
        const transport = createTransport({ self: SELF_PUBKEY });
        const service = createGroupsRuntimeService({ transport, verifyEvent: () => true });

        await service.loadGroup({ relay: 'wss://relay.example/', id: 'maps' });

        expect(transport.fetchRelayInfo).toHaveBeenCalledWith('wss://relay.example');
        expect(transport.fetchGroupEvents).toHaveBeenCalledTimes(2);
        expect(transport.fetchGroupEvents.mock.calls.map((call) => call[0])).toEqual([
            'wss://relay.example',
            'wss://relay.example',
        ]);
    });

    test('validates relay-authored metadata against NIP-11 self pubkey', async () => {
        const transport = createTransport({
            self: SELF_PUBKEY,
            metadataEvents: [
                relayAuthoredEvent(GROUP_METADATA_KIND, { content: '{"name":"Maps"}' }),
                relayAuthoredEvent(GROUP_ADMINS_KIND, { tags: [['d', 'maps'], ['p', OTHER_PUBKEY, 'owner']] }),
                relayAuthoredEvent(GROUP_MEMBERS_KIND, { tags: [['d', 'maps'], ['p', OTHER_PUBKEY]] }),
                relayAuthoredEvent(GROUP_ROLES_KIND, { tags: [['d', 'maps'], ['role', 'owner', 'Owner']] }),
                relayAuthoredEvent(GROUP_METADATA_KIND, {
                    id: 'spoofed',
                    pubkey: OTHER_PUBKEY,
                    created_at: 99,
                    content: '{"name":"Spoofed"}',
                }),
            ],
        });

        const service = createGroupsRuntimeService({ transport, verifyEvent: () => true });
        const result = await service.loadGroup({ relay: 'wss://relay.example', id: 'maps' });

        expect(result.metadataVerified).toBe(true);
        expect(result.metadata?.name).toBe('Maps');
        expect(result.admins?.admins).toEqual([{ pubkey: OTHER_PUBKEY, roles: ['owner'] }]);
        expect(result.members?.pubkeys).toEqual([OTHER_PUBKEY]);
        expect(result.roles?.roles).toEqual([{ id: 'owner', description: 'Owner' }]);
    });

    test('ignores discovered relay-authored metadata when it is not authored by NIP-11 self', async () => {
        const transport = createTransport({
            self: SELF_PUBKEY,
            metadataEvents: [
                relayAuthoredEvent(GROUP_METADATA_KIND, {
                    id: 'spoofed',
                    pubkey: OTHER_PUBKEY,
                    created_at: 99,
                    content: '{"name":"Spoofed"}',
                }),
            ],
        });

        const service = createGroupsRuntimeService({ transport, verifyEvent: () => true });
        const result = await service.loadGroup({ relay: 'wss://relay.example', id: 'maps' });

        expect(result.metadataVerified).toBe(true);
        expect(result.metadata).toBeUndefined();
    });

    test('ignores relay-authored metadata when event signature validation fails', async () => {
        const verifyEvent = vi.fn(() => false);
        const transport = createTransport({
            self: SELF_PUBKEY,
            metadataEvents: [
                relayAuthoredEvent(GROUP_METADATA_KIND, { content: '{"name":"Spoofed"}' }),
                relayAuthoredEvent(GROUP_ADMINS_KIND, { tags: [['d', 'maps'], ['p', OTHER_PUBKEY, 'owner']] }),
            ],
        });

        const service = createGroupsRuntimeService({ transport, verifyEvent });
        const result = await service.loadGroup({ relay: 'wss://relay.example', id: 'maps' });

        expect(result.metadataVerified).toBe(true);
        expect(result.metadata).toBeUndefined();
        expect(result.admins).toBeUndefined();
        expect(verifyEvent).toHaveBeenCalled();
    });

    test('ignores newer self-authored metadata for a different group id', async () => {
        const transport = createTransport({
            self: SELF_PUBKEY,
            metadataEvents: [
                relayAuthoredEvent(GROUP_METADATA_KIND, {
                    id: 'correct-group',
                    created_at: 10,
                    content: '{"name":"Maps"}',
                    tags: [['d', 'maps']],
                }),
                relayAuthoredEvent(GROUP_METADATA_KIND, {
                    id: 'wrong-group',
                    created_at: 99,
                    content: '{"name":"Wrong group"}',
                    tags: [['d', 'parks']],
                }),
            ],
        });

        const service = createGroupsRuntimeService({ transport, verifyEvent: () => true });
        const result = await service.loadGroup({ relay: 'wss://relay.example', id: 'maps' });

        expect(result.metadata?.name).toBe('Maps');
    });

    test('fetches NIP-11 relay self metadata from the relay HTTP endpoint', async () => {
        const fetchFn = vi.fn(async () => ({
            ok: true,
            json: async () => ({ self: SELF_PUBKEY, name: 'Relay' }),
        }));

        await expect(fetchNip11RelayInfo('wss://relay.example/', { fetch: fetchFn, timeoutMs: 1_000 })).resolves.toEqual({
            self: SELF_PUBKEY,
        });

        expect(fetchFn).toHaveBeenCalledWith('https://relay.example/', expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({ Accept: 'application/nostr+json, application/json;q=0.9' }),
        }));
    });

    test('displays unverified metadata and member count when relay self is missing', async () => {
        const transport = createTransport({
            metadataEvents: [
                relayAuthoredEvent(GROUP_METADATA_KIND, { content: '{"name":"Private maps"}', tags: [['d', 'maps'], ['private']] }),
                relayAuthoredEvent(GROUP_ADMINS_KIND, { tags: [['d', 'maps'], ['p', OTHER_PUBKEY, 'owner']] }),
                relayAuthoredEvent(GROUP_MEMBERS_KIND, { tags: [['d', 'maps'], ['p', OTHER_PUBKEY]] }),
                relayAuthoredEvent(GROUP_ROLES_KIND, { tags: [['d', 'maps'], ['role', 'owner', 'Owner']] }),
            ],
            timelineEvents: [event({ id: 'msg', kind: GROUP_MESSAGE_KIND, created_at: 20, content: 'visible partial' })],
        });

        const service = createGroupsRuntimeService({ transport, verifyEvent: () => true });
        const result = await service.loadGroup({ relay: 'wss://relay.example', id: 'maps' });

        expect(result.metadataVerified).toBe(false);
        expect(result.metadata?.name).toBe('Private maps');
        expect(result.metadata?.private).toBe(true);
        expect(result.admins).toBeUndefined();
        expect(result.members?.pubkeys).toEqual([OTHER_PUBKEY]);
        expect(result.roles).toBeUndefined();
        expect(result.timeline.map((item) => item.id)).toEqual(['msg']);
    });

    test('uses newest valid unverified metadata for the target group only', async () => {
        const transport = createTransport({
            metadataEvents: [
                relayAuthoredEvent(GROUP_METADATA_KIND, { id: 'old', created_at: 10, content: '{"name":"Old maps"}', tags: [['d', 'maps']] }),
                relayAuthoredEvent(GROUP_METADATA_KIND, { id: 'new', created_at: 20, content: '{"name":"New maps"}', tags: [['d', 'maps']] }),
                relayAuthoredEvent(GROUP_METADATA_KIND, { id: 'wrong', created_at: 30, content: '{"name":"Wrong"}', tags: [['d', 'parks']] }),
            ],
        });

        const service = createGroupsRuntimeService({ transport, verifyEvent: (candidate) => candidate.id !== 'old' });
        const result = await service.loadGroup({ relay: 'wss://relay.example', id: 'maps' });

        expect(result.metadataVerified).toBe(false);
        expect(result.metadata?.name).toBe('New maps');
    });

    test('degrades safely when private or hidden groups return only partial data', async () => {
        const transport = createTransport({ self: SELF_PUBKEY, metadataEvents: [], timelineEvents: [] });
        const service = createGroupsRuntimeService({ transport });

        await expect(service.loadGroup({ relay: 'wss://relay.example', id: 'maps' })).resolves.toMatchObject({
            metadata: undefined,
            admins: undefined,
            members: undefined,
            roles: undefined,
            timeline: [],
        });
    });

    test('sorts timeline by created_at descending and id ascending for ties', async () => {
        const transport = createTransport({
            self: SELF_PUBKEY,
            timelineEvents: [
                event({ id: 'b', kind: GROUP_MESSAGE_KIND, created_at: 10 }),
                event({ id: 'c', kind: GROUP_MESSAGE_KIND, created_at: 20 }),
                event({ id: 'a', kind: GROUP_MESSAGE_KIND, created_at: 10 }),
            ],
        });
        const service = createGroupsRuntimeService({ transport, verifyEvent: () => true });

        const result = await service.loadGroup({ relay: 'wss://relay.example', id: 'maps' });

        expect(result.timeline.map((item) => item.id)).toEqual(['c', 'a', 'b']);
    });

    test('ignores unsigned or cross-group timeline messages before display', async () => {
        const verifyEvent = vi.fn((candidate: NostrEvent) => candidate.id !== 'forged');
        const transport = createTransport({
            self: SELF_PUBKEY,
            timelineEvents: [
                event({ id: 'valid', kind: GROUP_MESSAGE_KIND, created_at: 20, content: 'shown' }),
                event({ id: 'forged', kind: GROUP_MESSAGE_KIND, created_at: 30, content: 'hidden' }),
                event({ id: 'wrong-group', kind: GROUP_MESSAGE_KIND, created_at: 40, tags: [['h', 'parks']] }),
            ],
        });
        const service = createGroupsRuntimeService({ transport, verifyEvent });

        const result = await service.loadGroup({ relay: 'wss://relay.example', id: 'maps' });

        expect(result.timeline.map((item) => item.id)).toEqual(['valid']);
        expect(verifyEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'valid' }));
        expect(verifyEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'forged' }));
    });

    test('publishes kind 9 messages to the group relay with up to 3 previous tags', async () => {
        const signed = event({ id: 'signed', kind: GROUP_MESSAGE_KIND, created_at: 50, pubkey: OTHER_PUBKEY });
        const publishEvent = vi.fn(async (unsigned: NostrUnsignedEvent) => ({ ...signed, ...unsigned, id: signed.id, pubkey: signed.pubkey }));
        const publishToGroupRelay = vi.fn(async (_event: NostrEvent, _relays: string[]): Promise<PublishResult> => ({
            ackedRelays: ['wss://relay.example'],
            failedRelays: [],
            timeoutRelays: [],
        }));
        const service = createGroupsRuntimeService({
            transport: createTransport({ self: SELF_PUBKEY }),
            writeGateway: { publishEvent },
            publishToGroupRelay,
            ownPubkey: SELF_PUBKEY,
            now: () => 123,
        });

        const result = await service.publishMessage({
            group: { relay: 'wss://relay.example', id: 'maps' },
            content: 'hello',
            recentTimeline: [
                event({ id: '33333333cccc', kind: GROUP_MESSAGE_KIND, created_at: 3, pubkey: OTHER_PUBKEY }),
                event({ id: '11111111aaaa', kind: GROUP_MESSAGE_KIND, created_at: 1, pubkey: OTHER_PUBKEY }),
                event({ id: '44444444dddd', kind: GROUP_MESSAGE_KIND, created_at: 4, pubkey: SELF_PUBKEY }),
                event({ id: '22222222bbbb', kind: GROUP_MESSAGE_KIND, created_at: 2, pubkey: OTHER_PUBKEY }),
                event({ id: '55555555eeee', kind: GROUP_MESSAGE_KIND, created_at: 5, pubkey: OTHER_PUBKEY }),
            ],
        });

        expect(publishEvent).toHaveBeenCalledWith({
            kind: GROUP_MESSAGE_KIND,
            created_at: 123,
            content: 'hello',
            tags: [['h', 'maps'], ['previous', '55555555'], ['previous', '33333333'], ['previous', '22222222']],
        });
        expect(publishToGroupRelay).toHaveBeenCalledWith(expect.objectContaining({ id: 'signed' }), ['wss://relay.example']);
        expect(result.publish.ackedRelays).toEqual(['wss://relay.example']);
    });

    test('publishes group actions through injected write gateway and targets group relay when applicable', async () => {
        const publishEvent = vi.fn(async (unsigned: NostrUnsignedEvent) => event({
            id: `signed-${unsigned.kind}`,
            kind: unsigned.kind,
            created_at: unsigned.created_at,
            content: unsigned.content,
            tags: unsigned.tags,
        }));
        const publishToGroupRelay = vi.fn(async (_event: NostrEvent, _relays: string[]): Promise<PublishResult> => ({
            ackedRelays: ['wss://relay.example'],
            failedRelays: [],
            timeoutRelays: [],
        }));
        const service = createGroupsRuntimeService({
            transport: createTransport({ self: SELF_PUBKEY }),
            writeGateway: { publishEvent },
            publishToGroupRelay,
            ownPubkey: SELF_PUBKEY,
            now: () => 456,
        });

        await service.requestJoin({ group: { relay: 'wss://relay.example', id: 'maps' }, code: 'invite-code' });
        await service.requestLeave({ group: { relay: 'wss://relay.example', id: 'maps' } });
        await service.savePublicGroups({ groups: [{ relay: 'wss://relay.example', id: 'maps' }] });

        expect(publishEvent.mock.calls.map((call) => call[0].kind)).toEqual([
            GROUP_JOIN_REQUEST_KIND,
            GROUP_LEAVE_REQUEST_KIND,
            PUBLIC_SAVED_GROUPS_KIND,
        ]);
        expect(publishToGroupRelay.mock.calls.map((call) => call[1])).toEqual([
            ['wss://relay.example'],
            ['wss://relay.example'],
            ['wss://relay.example'],
        ]);
    });

    test('saves public groups with explicit relay tags and publish targets', async () => {
        const publishEvent = vi.fn(async (unsigned: NostrUnsignedEvent) => event({
            id: 'signed-10009',
            kind: unsigned.kind,
            created_at: unsigned.created_at,
            tags: unsigned.tags,
        }));
        const publishToGroupRelay = vi.fn(async (_event: NostrEvent, _relays: string[]): Promise<PublishResult> => ({
            ackedRelays: ['wss://publish.example'],
            failedRelays: [],
            timeoutRelays: [],
        }));
        const service = createGroupsRuntimeService({
            transport: createTransport({ self: SELF_PUBKEY }),
            writeGateway: { publishEvent },
            publishToGroupRelay,
        });

        await service.savePublicGroups({
            groups: [{ relay: 'wss://groups.fiatjaf.com', id: 'maps' }],
            relays: ['wss://groups.fiatjaf.com', 'wss://groups.0xchat.com'],
            publishRelays: ['wss://publish.example'],
        });

        expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({
            kind: PUBLIC_SAVED_GROUPS_KIND,
            tags: [
                ['group', "groups.fiatjaf.com'maps"],
                ['r', 'wss://groups.fiatjaf.com'],
                ['r', 'wss://groups.0xchat.com'],
            ],
        }));
        expect(publishToGroupRelay).toHaveBeenCalledWith(expect.objectContaining({ id: 'signed-10009' }), ['wss://publish.example']);
    });

    test('uses explicit public group relays as fallback publish targets when no groups are saved', async () => {
        const publishEvent = vi.fn(async (unsigned: NostrUnsignedEvent) => event({
            id: 'signed-relays-only',
            kind: unsigned.kind,
            created_at: unsigned.created_at,
            tags: unsigned.tags,
        }));
        const publishToGroupRelay = vi.fn(async (_event: NostrEvent, _relays: string[]): Promise<PublishResult> => ({
            ackedRelays: ['wss://groups.fiatjaf.com', 'wss://groups.0xchat.com'],
            failedRelays: [],
            timeoutRelays: [],
        }));
        const service = createGroupsRuntimeService({
            transport: createTransport({ self: SELF_PUBKEY }),
            writeGateway: { publishEvent },
            publishToGroupRelay,
        });

        await service.savePublicGroups({
            groups: [],
            relays: ['wss://groups.fiatjaf.com/', 'wss://groups.0xchat.com'],
        });

        expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({
            kind: PUBLIC_SAVED_GROUPS_KIND,
            tags: [
                ['r', 'wss://groups.fiatjaf.com'],
                ['r', 'wss://groups.0xchat.com'],
            ],
        }));
        expect(publishToGroupRelay).toHaveBeenCalledWith(expect.objectContaining({ id: 'signed-relays-only' }), [
            'wss://groups.fiatjaf.com',
            'wss://groups.0xchat.com',
        ]);
    });

    test('returns sanitized relay publish failures to UI callers', async () => {
        const publishEvent = vi.fn(async (unsigned: NostrUnsignedEvent) => event({ id: 'signed', kind: unsigned.kind, created_at: 1 }));
        const publishToGroupRelay = vi.fn(async (_event: NostrEvent, _relays: string[]): Promise<PublishResult> => ({
            ackedRelays: [],
            failedRelays: [{ relay: 'wss://relay.example', reason: 'restricted: invite code leaked details' }],
            timeoutRelays: [],
        }));
        const service = createGroupsRuntimeService({
            transport: createTransport({ self: SELF_PUBKEY }),
            writeGateway: { publishEvent },
            publishToGroupRelay,
            ownPubkey: SELF_PUBKEY,
        });

        await expect(service.requestJoin({ group: { relay: 'wss://relay.example', id: 'maps' } })).resolves.toMatchObject({
            publish: {
                failedRelays: [
                    { relay: 'wss://relay.example', error: { code: 'restricted', message: 'This group is restricted.' } },
                ],
            },
        });
    });
});
