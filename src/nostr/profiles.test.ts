import { afterEach, describe, expect, test, vi } from 'vitest';
import { __resetProfileCacheForTests, buildProfileMetadataContent, cacheProfile, fetchProfiles, parseProfileMetadata, parseProfileMetadataContent } from './profiles';
import type { NostrClient, NostrEvent } from './types';

function buildMetadataEvent(content: Record<string, unknown>): NostrEvent {
    return {
        id: 'metadata-1',
        pubkey: 'a'.repeat(64),
        kind: 0,
        created_at: 1_700_000_000,
        tags: [],
        content: JSON.stringify(content),
        sig: 'b'.repeat(128),
    };
}

describe('parseProfileMetadata', () => {
    afterEach(() => {
        __resetProfileCacheForTests();
    });

    test('parses profile about and optional NIP-24 style fields', () => {
        const profile = parseProfileMetadata(buildMetadataEvent({
            name: 'alice',
            display_name: 'Alice',
            about: 'Building with Nostr',
            picture: 'https://example.com/avatar.png',
            banner: 'https://example.com/banner.png',
            website: 'https://example.com',
            nip05: 'alice@example.com',
            lud16: 'alice@getalby.com',
            lud06: 'lnurl1dp68gurn8ghj7',
            bot: true,
            birthday: { year: 1990, month: 5, day: 9 },
            github: 'alice',
            mastodon: 'nostr.example/@alice',
        }));

        expect(profile.name).toBe('alice');
        expect(profile.displayName).toBe('Alice');
        expect(profile.about).toBe('Building with Nostr');
        expect(profile.picture).toBe('https://example.com/avatar.png');
        expect(profile.banner).toBe('https://example.com/banner.png');
        expect(profile.website).toBe('https://example.com');
        expect(profile.nip05).toBe('alice@example.com');
        expect(profile.lud16).toBe('alice@getalby.com');
        expect(profile.lud06).toBe('lnurl1dp68gurn8ghj7');
        expect(profile.bot).toBe(true);
        expect(profile.birthday).toEqual({ year: 1990, month: 5, day: 9 });
        expect(profile.externalIdentities).toEqual(['github:alice', 'mastodon:nostr.example/@alice']);
    });

    test('parses malformed metadata content as an empty object', () => {
        expect(parseProfileMetadataContent('{')).toEqual({});
    });

    test('builds editable metadata while preserving unknown fields and removing empty supported fields', () => {
        const content = buildProfileMetadataContent(JSON.stringify({
            unknown: 'preserve me',
            username: 'deprecated-user',
            displayName: 'Deprecated Name',
            about: 'old about',
            picture: 'https://example.com/old.png',
        }), {
            name: 'alice',
            displayName: 'Alice Doe',
            about: '',
            picture: 'https://example.com/avatar.png',
            banner: 'https://example.com/banner.png',
            website: 'https://example.com',
            nip05: 'alice@example.com',
            lud16: 'alice@getalby.com',
            lud06: 'lnurl1dp68gurn8ghj7',
            bot: true,
            birthday: { month: 5, day: 9 },
        });

        expect(JSON.parse(content)).toEqual({
            unknown: 'preserve me',
            name: 'alice',
            display_name: 'Alice Doe',
            picture: 'https://example.com/avatar.png',
            banner: 'https://example.com/banner.png',
            website: 'https://example.com',
            nip05: 'alice@example.com',
            lud16: 'alice@getalby.com',
            lud06: 'lnurl1dp68gurn8ghj7',
            bot: true,
            birthday: { month: 5, day: 9 },
        });
        expect(content).not.toContain('displayName');
        expect(content).not.toContain('username');
        expect(content).not.toContain('old about');
    });

    test('caches a locally saved profile for subsequent profile reads', async () => {
        const pubkey = 'a'.repeat(64);
        const client: NostrClient = {
            connect: vi.fn(async () => undefined),
            fetchLatestReplaceableEvent: vi.fn(async () => null),
            fetchEvents: vi.fn(async () => []),
        };

        cacheProfile({
            pubkey,
            name: 'alice',
            displayName: 'Alice Local',
        });

        await expect(fetchProfiles([pubkey], client)).resolves.toEqual({
            [pubkey]: {
                pubkey,
                name: 'alice',
                displayName: 'Alice Local',
            },
        });
        expect(client.connect).not.toHaveBeenCalled();
        expect(client.fetchEvents).not.toHaveBeenCalled();
    });
});
