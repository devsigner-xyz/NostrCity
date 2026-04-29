import { createTtlCache } from './cache';
import type { NostrClient, NostrEvent, NostrProfile, NostrProfileBirthday } from './types';

const profileCache = createTtlCache<NostrProfile | null>({
    ttlMs: 5 * 60_000,
    maxEntries: 5000,
});

export function __resetProfileCacheForTests(): void {
    profileCache.clear();
}

export function cacheProfile(profile: NostrProfile): void {
    profileCache.set(`profile:${profile.pubkey}`, profile);
}

interface MetadataContent {
    name?: string;
    display_name?: string;
    about?: string;
    picture?: string;
    banner?: string;
    website?: string;
    nip05?: string;
    lud16?: string;
    lud06?: string;
    bot?: boolean;
    birthday?: NostrProfileBirthday;
    github?: string;
    twitter?: string;
    mastodon?: string;
    telegram?: string;
}

export interface EditableProfileMetadataInput {
    name?: string;
    displayName?: string;
    about?: string;
    picture?: string;
    banner?: string;
    website?: string;
    nip05?: string;
    lud16?: string;
    lud06?: string;
    bot?: boolean;
    birthday?: NostrProfileBirthday;
}

const SUPPORTED_METADATA_FIELDS = [
    'name',
    'display_name',
    'about',
    'picture',
    'banner',
    'website',
    'nip05',
    'lud16',
    'lud06',
    'bot',
    'birthday',
] as const;

const DEPRECATED_METADATA_FIELDS = ['displayName', 'username'] as const;

function extractExternalIdentities(parsed: MetadataContent): string[] | undefined {
    const identities = [
        parsed.github ? `github:${parsed.github}` : null,
        parsed.twitter ? `twitter:${parsed.twitter}` : null,
        parsed.mastodon ? `mastodon:${parsed.mastodon}` : null,
        parsed.telegram ? `telegram:${parsed.telegram}` : null,
    ].filter((value): value is string => Boolean(value));

    if (identities.length === 0) {
        return undefined;
    }

    return [...new Set(identities)];
}

export function parseProfileMetadataContent(content: string): Record<string, unknown> {
    try {
        const parsed: unknown = JSON.parse(content);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }

        return parsed as Record<string, unknown>;
    } catch {
        return {};
    }
}

export function buildProfileMetadataContent(previousContent: string | undefined, input: EditableProfileMetadataInput): string {
    const metadata = { ...parseProfileMetadataContent(previousContent ?? '{}') };

    for (const field of SUPPORTED_METADATA_FIELDS) {
        delete metadata[field];
    }
    for (const field of DEPRECATED_METADATA_FIELDS) {
        delete metadata[field];
    }

    assignNonEmptyString(metadata, 'name', input.name);
    assignNonEmptyString(metadata, 'display_name', input.displayName);
    assignNonEmptyString(metadata, 'about', input.about);
    assignNonEmptyString(metadata, 'picture', input.picture);
    assignNonEmptyString(metadata, 'banner', input.banner);
    assignNonEmptyString(metadata, 'website', input.website);
    assignNonEmptyString(metadata, 'nip05', input.nip05);
    assignNonEmptyString(metadata, 'lud16', input.lud16);
    assignNonEmptyString(metadata, 'lud06', input.lud06);

    if (input.bot === true) {
        metadata.bot = true;
    }

    const birthday = normalizeBirthday(input.birthday);
    if (birthday) {
        metadata.birthday = birthday;
    }

    return JSON.stringify(metadata);
}

export function parseProfileMetadata(event: NostrEvent): NostrProfile {
    const parsed = parseProfileMetadataContent(event.content) as MetadataContent;

    const profile: NostrProfile = {
        pubkey: event.pubkey,
    };

    if (typeof parsed.name === 'string') {
        profile.name = parsed.name;
    }
    if (typeof parsed.display_name === 'string') {
        profile.displayName = parsed.display_name;
    }
    if (typeof parsed.about === 'string') {
        profile.about = parsed.about;
    }
    if (typeof parsed.picture === 'string') {
        profile.picture = parsed.picture;
    }
    if (typeof parsed.banner === 'string') {
        profile.banner = parsed.banner;
    }
    if (typeof parsed.website === 'string') {
        profile.website = parsed.website;
    }
    if (typeof parsed.nip05 === 'string') {
        profile.nip05 = parsed.nip05;
    }
    if (typeof parsed.lud16 === 'string') {
        profile.lud16 = parsed.lud16;
    }
    if (typeof parsed.lud06 === 'string') {
        profile.lud06 = parsed.lud06;
    }
    if (typeof parsed.bot === 'boolean') {
        profile.bot = parsed.bot;
    }
    const birthday = normalizeBirthday(parsed.birthday);
    if (birthday) {
        profile.birthday = birthday;
    }

    const externalIdentities = extractExternalIdentities(parsed);
    if (externalIdentities !== undefined) {
        profile.externalIdentities = externalIdentities;
    }

    return profile;
}

function assignNonEmptyString(metadata: Record<string, unknown>, key: string, value: string | undefined): void {
    const normalized = value?.trim();
    if (normalized) {
        metadata[key] = normalized;
    }
}

function normalizeBirthday(value: unknown): NostrProfileBirthday | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    const record = value as Record<string, unknown>;
    const birthday: NostrProfileBirthday = {};

    if (isPositiveInteger(record.year)) {
        birthday.year = record.year;
    }
    if (isPositiveInteger(record.month) && record.month >= 1 && record.month <= 12) {
        birthday.month = record.month;
    }
    if (isPositiveInteger(record.day) && record.day >= 1 && record.day <= 31) {
        birthday.day = record.day;
    }

    return Object.keys(birthday).length > 0 ? birthday : undefined;
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export async function fetchProfiles(pubkeys: string[], client: NostrClient): Promise<Record<string, NostrProfile>> {
    if (pubkeys.length === 0) {
        return {};
    }

    const uniquePubkeys = [...new Set(pubkeys)];
    const profiles: Record<string, NostrProfile> = {};
    const missingPubkeys: string[] = [];

    for (const pubkey of uniquePubkeys) {
        const cached = profileCache.get(`profile:${pubkey}`);
        if (cached === undefined) {
            missingPubkeys.push(pubkey);
            continue;
        }

        if (cached !== null) {
            profiles[pubkey] = cached;
        }
    }

    if (missingPubkeys.length === 0) {
        return profiles;
    }

    await client.connect();
    const events = await client.fetchEvents({
        authors: missingPubkeys,
        kinds: [0],
        limit: missingPubkeys.length * 2,
    });

    const latestByPubkey = new Map<string, NostrEvent>();
    for (const event of events) {
        const existing = latestByPubkey.get(event.pubkey);
        if (!existing || event.created_at > existing.created_at) {
            latestByPubkey.set(event.pubkey, event);
        }
    }

    for (const pubkey of missingPubkeys) {
        const latest = latestByPubkey.get(pubkey);
        if (!latest) {
            profileCache.set(`profile:${pubkey}`, null);
            continue;
        }

        const parsed = parseProfileMetadata(latest);
        profileCache.set(`profile:${pubkey}`, parsed);
        profiles[pubkey] = parsed;
    }

    return profiles;
}
