import { describe, expect, test } from 'vitest';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import {
    buildGroupLeaveRequestEvent,
    buildGroupJoinRequestEvent,
    buildGroupMessageEvent,
    buildPublicSavedGroupsEvent,
    canonicalizeGroupAddress,
    isVerifiedPublicSavedGroupsEvent,
    parseGroupAdminsEvent,
    parseGroupMembersEvent,
    parseGroupMetadataEvent,
    parseGroupRolesEvent,
    parsePublicSavedGroupRelaysEvent,
    parsePublicSavedGroupsEvent,
} from './groups';
import type { NostrEvent, NostrFilter } from './types';

function event(input: Partial<NostrEvent> = {}): NostrEvent {
    return {
        id: input.id ?? 'e'.repeat(64),
        pubkey: input.pubkey ?? 'p'.repeat(64),
        kind: input.kind ?? 39000,
        created_at: input.created_at ?? 100,
        tags: input.tags ?? [],
        content: input.content ?? '',
    };
}

const OWNER_SECRET_KEY = new Uint8Array(32).fill(9);
const OWNER_PUBKEY = getPublicKey(OWNER_SECRET_KEY);

function signedPublicSavedGroupsEvent(input: { pubkey?: string; kind?: number } = {}): NostrEvent {
    const signed = finalizeEvent({
        kind: input.kind ?? 10009,
        created_at: 100,
        content: '',
        tags: [['group', "relay.example'maps"]],
    }, OWNER_SECRET_KEY);
    return input.pubkey ? { ...signed, pubkey: input.pubkey } : signed;
}

describe('groups', () => {
    test('canonicalizes object, external, and implicit-default group addresses', () => {
        expect(canonicalizeGroupAddress({ relay: 'wss://Relay.Example/', id: 'city_hall' })).toEqual({
            relay: 'wss://relay.example',
            id: 'city_hall',
            key: "wss://relay.example'city_hall",
            external: "relay.example'city_hall",
        });

        expect(canonicalizeGroupAddress("relay.example'parks")).toEqual({
            relay: 'wss://relay.example',
            id: 'parks',
            key: "wss://relay.example'parks",
            external: "relay.example'parks",
        });

        expect(canonicalizeGroupAddress('relay.example')).toEqual({
            relay: 'wss://relay.example',
            id: '_',
            key: "wss://relay.example'_",
            external: "relay.example'_",
        });
    });

    test('keeps the same id on different relays distinct and rejects invalid ids', () => {
        expect(canonicalizeGroupAddress({ relay: 'wss://one.example', id: 'maps' }).key).toBe("wss://one.example'maps");
        expect(canonicalizeGroupAddress({ relay: 'wss://two.example', id: 'maps' }).key).toBe("wss://two.example'maps");

        expect(() => canonicalizeGroupAddress({ relay: 'wss://one.example', id: 'Bad' })).toThrow('Invalid group id');
        expect(() => canonicalizeGroupAddress({ relay: 'wss://one.example', id: 'bad.id' })).toThrow('Invalid group id');
        expect(() => canonicalizeGroupAddress({ relay: 'https://one.example', id: 'maps' })).toThrow('Invalid group relay');
    });

    test('builds group messages with h and up to three previous tags excluding own events', () => {
        const built = buildGroupMessageEvent({
            group: "relay.example'maps",
            content: 'hello group',
            ownPubkey: 'own',
            now: () => 123,
            recentTimeline: [
                event({ id: 'old', pubkey: 'other', created_at: 1 }),
                event({ id: 'own-event', pubkey: 'own', created_at: 5 }),
                event({ id: 'newest', pubkey: 'other', created_at: 10 }),
                event({ id: 'middle', pubkey: 'other', created_at: 7 }),
                event({ id: 'third', pubkey: 'other', created_at: 3 }),
            ],
        });

        expect(built).toEqual({
            kind: 9,
            created_at: 123,
            content: 'hello group',
            tags: [
                ['h', 'maps'],
                ['previous', 'newest'],
                ['previous', 'middle'],
                ['previous', 'third'],
            ],
        });
    });

    test('uses the first 8 chars of long event ids in previous tags', () => {
        const built = buildGroupMessageEvent({
            group: "relay.example'maps",
            content: 'hello group',
            ownPubkey: 'own',
            now: () => 124,
            recentTimeline: [
                event({ id: '1111111122222222333333334444444455555555666666667777777788888888', pubkey: 'other', created_at: 1 }),
                event({ id: 'aaaaaaaa22222222333333334444444455555555666666667777777788888888', pubkey: 'other', created_at: 2 }),
            ],
        });

        expect(built.tags).toEqual([
            ['h', 'maps'],
            ['previous', 'aaaaaaaa'],
            ['previous', '11111111'],
        ]);
    });

    test('builds join, leave, and public saved groups events', () => {
        const group = { relay: 'wss://relay.example/', id: 'maps' };

        expect(buildGroupJoinRequestEvent({ group, code: 'invite-123', now: () => 200 })).toEqual({
            kind: 9021,
            created_at: 200,
            content: '',
            tags: [
                ['h', 'maps'],
                ['code', 'invite-123'],
            ],
        });
        expect(buildGroupLeaveRequestEvent({ group, now: () => 201 })).toEqual({
            kind: 9022,
            created_at: 201,
            content: '',
            tags: [['h', 'maps']],
        });
        expect(buildPublicSavedGroupsEvent({
            groups: [group, "relay-two.example'parks"],
            relays: ['wss://groups.extra.example/'],
            now: () => 202,
        })).toEqual({
            kind: 10009,
            created_at: 202,
            content: '',
            tags: [
                ['group', "relay.example'maps"],
                ['group', "relay-two.example'parks"],
                ['r', 'wss://relay.example'],
                ['r', 'wss://relay-two.example'],
                ['r', 'wss://groups.extra.example'],
            ],
        });
    });

    test('builds public saved group relay tags from explicit relays', () => {
        expect(buildPublicSavedGroupsEvent({
            groups: [{ relay: 'wss://groups.fiatjaf.com', id: 'maps' }],
            relays: ['wss://groups.fiatjaf.com', 'wss://groups.0xchat.com'],
        }).tags).toEqual([
            ['group', "groups.fiatjaf.com'maps"],
            ['r', 'wss://groups.fiatjaf.com'],
            ['r', 'wss://groups.0xchat.com'],
        ]);
    });

    test('parses group metadata from tags and JSON content flags', () => {
        const metadata = parseGroupMetadataEvent(event({
            kind: 39000,
            tags: [
                ['d', 'maps'],
                ['name', 'Map makers'],
                ['picture', 'https://example.com/group.png'],
                ['about', 'A place for cartographers'],
                ['private'],
                ['closed'],
            ],
            content: JSON.stringify({ restricted: true, hidden: true }),
        }));

        expect(metadata).toEqual({
            id: 'maps',
            name: 'Map makers',
            picture: 'https://example.com/group.png',
            about: 'A place for cartographers',
            private: true,
            restricted: true,
            hidden: true,
            closed: true,
        });
    });

    test('parses admin, member, and role lists', () => {
        expect(parseGroupAdminsEvent(event({
            kind: 39001,
            tags: [['d', 'maps'], ['p', 'alice'], ['p', 'bob'], ['p', 'alice'], ['x', 'ignored']],
        }))).toEqual({ id: 'maps', pubkeys: ['alice', 'bob'] });

        expect(parseGroupMembersEvent(event({
            kind: 39002,
            tags: [['d', 'maps'], ['p', 'carol'], ['p', 'dave']],
        }))).toEqual({ id: 'maps', pubkeys: ['carol', 'dave'] });

        expect(parseGroupRolesEvent(event({
            kind: 39003,
            tags: [['d', 'maps'], ['role', 'moderator', 'Can moderate'], ['role', 'admin']],
        }))).toEqual({
            id: 'maps',
            roles: [
                { id: 'moderator', description: 'Can moderate' },
                { id: 'admin' },
            ],
        });
    });

    test('preserves admin roles from p tags', () => {
        expect(parseGroupAdminsEvent(event({
            kind: 39001,
            tags: [
                ['d', 'maps'],
                ['p', 'alice', 'moderator', 'owner'],
                ['p', 'bob'],
            ],
        }))).toEqual({
            id: 'maps',
            pubkeys: ['alice', 'bob'],
            admins: [
                { pubkey: 'alice', roles: ['moderator', 'owner'] },
                { pubkey: 'bob', roles: [] },
            ],
        });
    });

    test('parses public saved groups while discarding invalid entries individually', () => {
        const parsed = parsePublicSavedGroupsEvent(event({
            kind: 10009,
            tags: [
                ['group', "relay.example'maps"],
                ['group', 'parks', 'wss://relay-two.example', 'Parks'],
                ['group', 'relay.example'],
                ['group', "relay.example'Bad"],
                ['group', "https://bad.example'parks"],
                ['r', 'wss://relay.example'],
            ],
        }));

        expect(parsed.map((group) => group.key)).toEqual([
            "wss://relay.example'maps",
            "wss://relay-two.example'parks",
            "wss://relay.example'_",
        ]);
    });

    test('deduplicates public saved groups and relay tags when building', () => {
        expect(buildPublicSavedGroupsEvent({
            groups: [
                { relay: 'wss://groups.fiatjaf.com', id: 'maps' },
                "groups.fiatjaf.com'maps",
            ],
            relays: ['wss://groups.fiatjaf.com/'],
        }).tags).toEqual([
            ['group', "groups.fiatjaf.com'maps"],
            ['r', 'wss://groups.fiatjaf.com'],
        ]);
    });

    test('parses public saved group relay tags while discarding invalid and duplicate entries', () => {
        const parsed = parsePublicSavedGroupRelaysEvent(event({
            kind: 10009,
            tags: [
                ['r', 'wss://groups.fiatjaf.com/'],
                ['r', 'https://invalid.example'],
                ['r', 'wss://groups.fiatjaf.com'],
            ],
        }));

        expect(parsed).toEqual(['wss://groups.fiatjaf.com']);
    });

    test('verifies public saved groups events before trusting public group and relay tags', () => {
        expect(isVerifiedPublicSavedGroupsEvent(signedPublicSavedGroupsEvent(), OWNER_PUBKEY)).toBe(true);
        expect(isVerifiedPublicSavedGroupsEvent(event({ kind: 10009, pubkey: OWNER_PUBKEY }), OWNER_PUBKEY)).toBe(false);
        expect(isVerifiedPublicSavedGroupsEvent(signedPublicSavedGroupsEvent({ pubkey: 'a'.repeat(64) }), OWNER_PUBKEY)).toBe(false);
        expect(isVerifiedPublicSavedGroupsEvent(signedPublicSavedGroupsEvent({ kind: 1 }), OWNER_PUBKEY)).toBe(false);
    });

    test('types filters with group, parameterized, and address tags', () => {
        const filter: NostrFilter = {
            kinds: [9, 39000, 10009],
            '#h': ['maps'],
            '#d': ['maps'],
            '#a': ['39000:relay.example:maps'],
        };

        expect(filter['#h']).toEqual(['maps']);
    });
});
