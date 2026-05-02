import { normalizeRelayUrl } from './relay-policy';
import type { NostrEvent, NostrUnsignedEvent } from './types';
import { verifyEvent } from 'nostr-tools/pure';

export const GROUP_MESSAGE_KIND = 9;
export const TEXT_NOTE_KIND = 1;
export const GROUP_TIMELINE_KINDS = [GROUP_MESSAGE_KIND, TEXT_NOTE_KIND] as const;
export const GROUP_METADATA_KIND = 39000;
export const GROUP_ADMINS_KIND = 39001;
export const GROUP_MEMBERS_KIND = 39002;
export const GROUP_ROLES_KIND = 39003;
export const GROUP_JOIN_REQUEST_KIND = 9021;
export const GROUP_LEAVE_REQUEST_KIND = 9022;
export const PUBLIC_SAVED_GROUPS_KIND = 10009;

export interface GroupAddressInput {
    relay: string;
    id: string;
}

export interface CanonicalGroupAddress {
    relay: string;
    id: string;
    key: string;
    external: string;
}

export interface GroupMetadata {
    id: string;
    name?: string;
    picture?: string;
    about?: string;
    private: boolean;
    restricted: boolean;
    hidden: boolean;
    closed: boolean;
}

export interface GroupPubkeyList {
    id: string;
    pubkeys: string[];
    admins?: GroupAdmin[];
}

export interface GroupAdmin {
    pubkey: string;
    roles: string[];
}

export interface GroupRole {
    id: string;
    description?: string;
}

export interface GroupRoleList {
    id: string;
    roles: GroupRole[];
}

type GroupAddressLike = GroupAddressInput | string;

const GROUP_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function normalizeExternalRelayHost(host: string): string {
    return host.includes('://') ? host : `wss://${host}`;
}

function relayHost(relay: string): string {
    const parsed = new URL(relay);
    return parsed.host.toLowerCase();
}

function parseGroupAddressInput(input: GroupAddressLike): GroupAddressInput {
    if (typeof input !== 'string') {
        return input;
    }

    const [relay = '', id = '_'] = input.split("'");
    return { relay: normalizeExternalRelayHost(relay), id };
}

export function canonicalizeGroupAddress(input: GroupAddressLike): CanonicalGroupAddress {
    const parsed = parseGroupAddressInput(input);
    const relay = normalizeRelayUrl(parsed.relay);
    if (!relay) {
        throw new Error('Invalid group relay');
    }

    if (!GROUP_ID_PATTERN.test(parsed.id)) {
        throw new Error('Invalid group id');
    }

    return {
        relay,
        id: parsed.id,
        key: `${relay}'${parsed.id}`,
        external: `${relayHost(relay)}'${parsed.id}`,
    };
}

export function buildGroupMessageEvent(input: {
    group: GroupAddressLike;
    content: string;
    ownPubkey: string;
    recentTimeline?: NostrEvent[];
    tags?: string[][];
    now?: () => number;
}): NostrUnsignedEvent {
    const group = canonicalizeGroupAddress(input.group);
    const previousTags = [...(input.recentTimeline ?? [])]
        .filter((event) => event.pubkey !== input.ownPubkey)
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, 3)
        .map((event) => ['previous', event.id.slice(0, 8)]);

    return {
        kind: GROUP_MESSAGE_KIND,
        created_at: timestamp(input.now),
        content: input.content,
        tags: [['h', group.id], ...(input.tags ?? []), ...previousTags],
    };
}

export function buildGroupJoinRequestEvent(input: {
    group: GroupAddressLike;
    code?: string;
    now?: () => number;
}): NostrUnsignedEvent {
    const group = canonicalizeGroupAddress(input.group);
    const tags = [['h', group.id]];
    if (input.code) {
        tags.push(['code', input.code]);
    }

    return {
        kind: GROUP_JOIN_REQUEST_KIND,
        created_at: timestamp(input.now),
        content: '',
        tags,
    };
}

export function buildGroupLeaveRequestEvent(input: { group: GroupAddressLike; now?: () => number }): NostrUnsignedEvent {
    const group = canonicalizeGroupAddress(input.group);
    return {
        kind: GROUP_LEAVE_REQUEST_KIND,
        created_at: timestamp(input.now),
        content: '',
        tags: [['h', group.id]],
    };
}

export function buildPublicSavedGroupsEvent(input: { groups: GroupAddressLike[]; relays?: string[]; now?: () => number }): NostrUnsignedEvent {
    const groups = dedupeGroups(input.groups.map((value) => canonicalizeGroupAddress(value)));
    const relays = unique([
        ...groups.map((group) => group.relay),
        ...(input.relays ?? []).map((relay) => normalizeRelayUrl(relay)).filter((relay): relay is string => Boolean(relay)),
    ]);

    return {
        kind: PUBLIC_SAVED_GROUPS_KIND,
        created_at: timestamp(input.now),
        content: '',
        tags: [
            ...groups.map((group) => ['group', group.external]),
            ...relays.map((relay) => ['r', relay]),
        ],
    };
}

export function parseGroupMetadataEvent(event: NostrEvent): GroupMetadata | null {
    if (event.kind !== GROUP_METADATA_KIND) {
        return null;
    }

    const id = firstTagValue(event.tags, 'd');
    if (!id || !GROUP_ID_PATTERN.test(id)) {
        return null;
    }

    const content = parseJsonRecord(event.content);
    return {
        id,
        ...optionalString('name', firstTagValue(event.tags, 'name') ?? contentString(content, 'name')),
        ...optionalString('picture', firstTagValue(event.tags, 'picture') ?? contentString(content, 'picture')),
        ...optionalString('about', firstTagValue(event.tags, 'about') ?? contentString(content, 'about')),
        private: hasTag(event.tags, 'private') || content.private === true,
        restricted: hasTag(event.tags, 'restricted') || content.restricted === true,
        hidden: hasTag(event.tags, 'hidden') || content.hidden === true,
        closed: hasTag(event.tags, 'closed') || content.closed === true,
    };
}

export function parseGroupAdminsEvent(event: NostrEvent): GroupPubkeyList | null {
    if (event.kind !== GROUP_ADMINS_KIND) {
        return null;
    }

    const id = firstTagValue(event.tags, 'd');
    if (!id || !GROUP_ID_PATTERN.test(id)) {
        return null;
    }

    const pTags = event.tags.filter((tag) => tag[0] === 'p' && Boolean(tag[1]));
    const result: GroupPubkeyList = {
        id,
        pubkeys: unique(pTags.map((tag) => tag[1] as string)),
    };

    if (pTags.some((tag) => tag.length > 2)) {
        result.admins = result.pubkeys.map((pubkey) => {
            const tag = pTags.find((value) => value[1] === pubkey);
            return { pubkey, roles: tag ? tag.slice(2).filter((role) => role.length > 0) : [] };
        });
    }

    return result;
}

export function parseGroupMembersEvent(event: NostrEvent): GroupPubkeyList | null {
    return parsePubkeyListEvent(event, GROUP_MEMBERS_KIND);
}

export function parseGroupRolesEvent(event: NostrEvent): GroupRoleList | null {
    if (event.kind !== GROUP_ROLES_KIND) {
        return null;
    }

    const id = firstTagValue(event.tags, 'd');
    if (!id || !GROUP_ID_PATTERN.test(id)) {
        return null;
    }

    return {
        id,
        roles: event.tags
            .filter((tag) => tag[0] === 'role' && Boolean(tag[1]))
            .map((tag) => ({
                id: tag[1] as string,
                ...optionalString('description', tag[2]),
            })),
    };
}

export function parsePublicSavedGroupsEvent(event: NostrEvent): CanonicalGroupAddress[] {
    if (event.kind !== PUBLIC_SAVED_GROUPS_KIND) {
        return [];
    }

    const groups: CanonicalGroupAddress[] = [];
    for (const tag of event.tags) {
        if (tag[0] !== 'group' || !tag[1]) {
            continue;
        }

        try {
            groups.push(canonicalizeSavedGroupTag(tag));
        } catch {
            // Invalid saved group tags should not invalidate the whole list.
        }
    }

    return dedupeGroups(groups);
}

export function parsePublicSavedGroupRelaysEvent(event: NostrEvent): string[] {
    if (event.kind !== PUBLIC_SAVED_GROUPS_KIND) {
        return [];
    }

    return unique(event.tags
        .filter((tag) => tag[0] === 'r' && Boolean(tag[1]))
        .map((tag) => normalizeRelayUrl(tag[1] as string))
        .filter((relay): relay is string => Boolean(relay)));
}

export function isVerifiedPublicSavedGroupsEvent(event: NostrEvent, ownerPubkey: string): boolean {
    return event.kind === PUBLIC_SAVED_GROUPS_KIND
        && event.pubkey === ownerPubkey
        && verifyEvent(event as Parameters<typeof verifyEvent>[0]);
}

function parsePubkeyListEvent(event: NostrEvent, kind: number): GroupPubkeyList | null {
    if (event.kind !== kind) {
        return null;
    }

    const id = firstTagValue(event.tags, 'd');
    if (!id || !GROUP_ID_PATTERN.test(id)) {
        return null;
    }

    return {
        id,
        pubkeys: unique(event.tags
            .filter((tag) => tag[0] === 'p' && Boolean(tag[1]))
            .map((tag) => tag[1] as string)),
    };
}

function canonicalizeSavedGroupTag(tag: string[]): CanonicalGroupAddress {
    if (tag[2]) {
        return canonicalizeGroupAddress({ relay: tag[2], id: tag[1] as string });
    }

    return canonicalizeGroupAddress(tag[1] as string);
}

function timestamp(now: (() => number) | undefined): number {
    return now ? now() : Math.floor(Date.now() / 1000);
}

function firstTagValue(tags: string[][], name: string): string | undefined {
    const value = tags.find((tag) => tag[0] === name)?.[1]?.trim();
    return value ? value : undefined;
}

function hasTag(tags: string[][], name: string): boolean {
    return tags.some((tag) => tag[0] === name);
}

function parseJsonRecord(content: string): Record<string, unknown> {
    try {
        const parsed: unknown = JSON.parse(content);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

function contentString(content: Record<string, unknown>, key: string): string | undefined {
    const value = content[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalString<Key extends string>(key: Key, value: string | undefined): Partial<Record<Key, string>> {
    return value ? { [key]: value } as Record<Key, string> : {};
}

function unique(values: string[]): string[] {
    return [...new Set(values)];
}

function dedupeGroups(groups: CanonicalGroupAddress[]): CanonicalGroupAddress[] {
    const seen = new Set<string>();
    return groups.filter((group) => {
        if (seen.has(group.key)) {
            return false;
        }

        seen.add(group.key);
        return true;
    });
}
