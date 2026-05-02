import {
    buildGroupJoinRequestEvent,
    buildGroupLeaveRequestEvent,
    buildGroupMessageEvent,
    buildPublicSavedGroupsEvent,
    canonicalizeGroupAddress,
    GROUP_ADMINS_KIND,
    GROUP_MEMBERS_KIND,
    GROUP_METADATA_KIND,
    GROUP_ROLES_KIND,
    GROUP_TIMELINE_KINDS,
    parseGroupAdminsEvent,
    parseGroupMembersEvent,
    parseGroupMetadataEvent,
    parseGroupRolesEvent,
    type CanonicalGroupAddress,
    type GroupAddressInput,
    type GroupMetadata,
    type GroupPubkeyList,
    type GroupRoleList,
} from './groups';
import { normalizeGroupRelayPublishResult, type GroupRelayPublishResult, type GroupsTransport } from './groups-transport';
import type { PublishResult } from './dm-types';
import { isHexKey } from './npub';
import { normalizeRelayUrl } from './relay-policy';
import type { NostrEvent, NostrFilter, NostrUnsignedEvent } from './types';
import { verifyEvent as verifyNostrEvent } from 'nostr-tools/pure';

export type { GroupsTransport } from './groups-transport';

export type RelayAuthoredGroupMetadataKind =
    | typeof GROUP_METADATA_KIND
    | typeof GROUP_ADMINS_KIND
    | typeof GROUP_MEMBERS_KIND
    | typeof GROUP_ROLES_KIND;

export interface GroupsRuntimeSnapshot {
    group: CanonicalGroupAddress;
    metadata: GroupMetadata | undefined;
    metadataVerified: boolean;
    admins: GroupPubkeyList | undefined;
    members: GroupPubkeyList | undefined;
    roles: GroupRoleList | undefined;
    timeline: NostrEvent[];
}

export interface GroupPublishResponse {
    event: NostrEvent;
    publish: GroupRelayPublishResult;
}

interface WriteGateway {
    publishEvent(event: NostrUnsignedEvent): Promise<NostrEvent>;
}

interface CreateGroupsRuntimeServiceOptions {
    transport: GroupsTransport;
    writeGateway?: WriteGateway;
    publishToGroupRelay?: (event: NostrEvent, relayUrls: string[]) => Promise<PublishResult>;
    ownPubkey?: string;
    now?: () => number;
    verifyEvent?: (event: NostrEvent) => boolean;
}

const RELAY_AUTHORED_METADATA_KINDS: RelayAuthoredGroupMetadataKind[] = [
    GROUP_METADATA_KIND,
    GROUP_ADMINS_KIND,
    GROUP_MEMBERS_KIND,
    GROUP_ROLES_KIND,
];

const DISPLAY_METADATA_KINDS: RelayAuthoredGroupMetadataKind[] = [GROUP_METADATA_KIND, GROUP_MEMBERS_KIND];

function emptyPublishResult(): PublishResult {
    return { ackedRelays: [], failedRelays: [], timeoutRelays: [] };
}

function sortTimeline(events: NostrEvent[]): NostrEvent[] {
    const byId = new Map<string, NostrEvent>();
    for (const event of events) {
        if ((GROUP_TIMELINE_KINDS as readonly number[]).includes(event.kind)) {
            byId.set(event.id, event);
        }
    }

    return [...byId.values()].sort((left, right) => {
        if (left.created_at !== right.created_at) {
            return right.created_at - left.created_at;
        }

        return left.id.localeCompare(right.id);
    });
}

function newestByKind(events: NostrEvent[], kind: RelayAuthoredGroupMetadataKind): NostrEvent | undefined {
    return events
        .filter((event) => event.kind === kind)
        .sort((left, right) => {
            if (left.created_at !== right.created_at) {
                return right.created_at - left.created_at;
            }

            return left.id.localeCompare(right.id);
        })[0];
}

async function fetchSafely(transport: GroupsTransport, relay: string, filters: NostrFilter[]): Promise<NostrEvent[]> {
    try {
        return await transport.fetchGroupEvents(relay, filters);
    } catch {
        return [];
    }
}

function unique(values: string[]): string[] {
    return [...new Set(values)];
}

function normalizeRelayList(relays: string[]): string[] {
    return unique(relays.map((relay) => normalizeRelayUrl(relay)).filter((relay): relay is string => Boolean(relay)));
}

function firstTagValue(tags: string[][], name: string): string | undefined {
    return tags.find((tag) => tag[0] === name && Boolean(tag[1]))?.[1];
}

function requireWriteGateway(gateway: WriteGateway | undefined): WriteGateway {
    if (!gateway) {
        throw new Error('Groups write gateway is required');
    }

    return gateway;
}

function isValidRelayAuthoredEvent(event: NostrEvent, self: string, verifyEvent: (event: NostrEvent) => boolean): boolean {
    if (event.pubkey !== self) {
        return false;
    }

    try {
        return verifyEvent(event);
    } catch {
        return false;
    }
}

function isSignatureValidEvent(event: NostrEvent, verifyEvent: (event: NostrEvent) => boolean): boolean {
    try {
        return verifyEvent(event);
    } catch {
        return false;
    }
}

function isValidGroupTimelineEvent(event: NostrEvent, groupId: string, verifyEvent: (event: NostrEvent) => boolean): boolean {
    if (!(GROUP_TIMELINE_KINDS as readonly number[]).includes(event.kind) || firstTagValue(event.tags, 'h') !== groupId) {
        return false;
    }

    try {
        return verifyEvent(event);
    } catch {
        return false;
    }
}

export function createGroupsRuntimeService(options: CreateGroupsRuntimeServiceOptions) {
    async function loadGroup(groupInput: GroupAddressInput | string): Promise<GroupsRuntimeSnapshot> {
        const group = canonicalizeGroupAddress(groupInput);
        const relayInfo = await options.transport.fetchRelayInfo(group.relay).catch(() => ({ self: undefined }));
        const relayAuthoredKinds = relayInfo.self && isHexKey(relayInfo.self) ? RELAY_AUTHORED_METADATA_KINDS : DISPLAY_METADATA_KINDS;
        const metadataEvents = await fetchSafely(options.transport, group.relay, [
            { kinds: relayAuthoredKinds, '#d': [group.id], limit: 20 },
        ]);
        const rawTimeline = await fetchSafely(options.transport, group.relay, [
            { kinds: [...GROUP_TIMELINE_KINDS], '#h': [group.id], limit: 50 },
        ]);

        const self = relayInfo.self;
        const metadataVerified = typeof self === 'string' && isHexKey(self);
        const groupMetadataEvents = metadataEvents.filter((event) => firstTagValue(event.tags, 'd') === group.id);
        const verifyEvent = options.verifyEvent ?? ((event: NostrEvent) => verifyNostrEvent(event as Parameters<typeof verifyNostrEvent>[0]));
        const timeline = sortTimeline(rawTimeline.filter((event) => isValidGroupTimelineEvent(event, group.id, verifyEvent)));
        const trustedEvents = metadataVerified ? groupMetadataEvents.filter((event) => isValidRelayAuthoredEvent(event, self, verifyEvent)) : [];
        const trustedDecisionEvents = metadataVerified ? trustedEvents : [];
        const displayEvents = metadataVerified
            ? trustedEvents
            : groupMetadataEvents.filter((event) => (DISPLAY_METADATA_KINDS as number[]).includes(event.kind) && isSignatureValidEvent(event, verifyEvent));
        const trustedOrDisplayMemberEvents = metadataVerified ? trustedDecisionEvents : displayEvents;
        const displayMetadataEvents = displayEvents.filter((event) => event.kind === GROUP_METADATA_KIND);
        const metadataEvent = newestByKind(displayMetadataEvents, GROUP_METADATA_KIND);
        const adminsEvent = newestByKind(trustedDecisionEvents, GROUP_ADMINS_KIND);
        const membersEvent = newestByKind(trustedOrDisplayMemberEvents, GROUP_MEMBERS_KIND);
        const rolesEvent = newestByKind(trustedDecisionEvents, GROUP_ROLES_KIND);

        return {
            group,
            metadata: metadataEvent ? parseGroupMetadataEvent(metadataEvent) ?? undefined : undefined,
            metadataVerified,
            admins: adminsEvent ? parseGroupAdminsEvent(adminsEvent) ?? undefined : undefined,
            members: membersEvent ? parseGroupMembersEvent(membersEvent) ?? undefined : undefined,
            roles: rolesEvent ? parseGroupRolesEvent(rolesEvent) ?? undefined : undefined,
            timeline,
        };
    }

    async function publishSignedEvent(event: NostrEvent, relays: string[]): Promise<GroupPublishResponse> {
        const relayUrls = unique(relays);
        const rawPublish = options.publishToGroupRelay ? await options.publishToGroupRelay(event, relayUrls) : emptyPublishResult();
        return { event, publish: normalizeGroupRelayPublishResult(rawPublish) };
    }

    async function signAndPublish(unsignedEvent: NostrUnsignedEvent, relays: string[]): Promise<GroupPublishResponse> {
        const signed = await requireWriteGateway(options.writeGateway).publishEvent(unsignedEvent);
        return publishSignedEvent(signed, relays);
    }

    return {
        loadGroup,

        async publishMessage(input: {
            group: GroupAddressInput | string;
            content: string;
            tags?: string[][];
            recentTimeline?: NostrEvent[];
        }): Promise<GroupPublishResponse> {
            if (!options.ownPubkey) {
                throw new Error('Own pubkey is required to publish group messages');
            }

            const group = canonicalizeGroupAddress(input.group);
            const eventInput: Parameters<typeof buildGroupMessageEvent>[0] = {
                group,
                content: input.content,
                ownPubkey: options.ownPubkey,
            };
            if (input.tags) {
                eventInput.tags = input.tags;
            }
            if (input.recentTimeline) {
                eventInput.recentTimeline = input.recentTimeline;
            }
            if (options.now) {
                eventInput.now = options.now;
            }

            return signAndPublish(buildGroupMessageEvent(eventInput), [group.relay]);
        },

        async requestJoin(input: { group: GroupAddressInput | string; code?: string }): Promise<GroupPublishResponse> {
            const group = canonicalizeGroupAddress(input.group);
            const eventInput: Parameters<typeof buildGroupJoinRequestEvent>[0] = { group };
            if (input.code) {
                eventInput.code = input.code;
            }
            if (options.now) {
                eventInput.now = options.now;
            }

            return signAndPublish(buildGroupJoinRequestEvent(eventInput), [group.relay]);
        },

        async requestLeave(input: { group: GroupAddressInput | string }): Promise<GroupPublishResponse> {
            const group = canonicalizeGroupAddress(input.group);
            const eventInput: Parameters<typeof buildGroupLeaveRequestEvent>[0] = { group };
            if (options.now) {
                eventInput.now = options.now;
            }

            return signAndPublish(buildGroupLeaveRequestEvent(eventInput), [group.relay]);
        },

        async savePublicGroups(input: {
            groups: Array<GroupAddressInput | string>;
            relays?: string[];
            publishRelays?: string[];
        }): Promise<GroupPublishResponse> {
            const groups = input.groups.map((group) => canonicalizeGroupAddress(group));
            const eventInput: Parameters<typeof buildPublicSavedGroupsEvent>[0] = { groups };
            if (input.relays) {
                eventInput.relays = input.relays;
            }
            if (options.now) {
                eventInput.now = options.now;
            }
            const fallbackPublishRelays = groups.length > 0 ? groups.map((group) => group.relay) : input.relays ?? [];
            const publishRelays = normalizeRelayList(input.publishRelays ?? fallbackPublishRelays);

            return signAndPublish(buildPublicSavedGroupsEvent(eventInput), publishRelays);
        },
    };
}
