import { beforeEach, describe, expect, test, vi } from 'vitest';
import { buildContactListTags, fetchFollowsByNpub, fetchFollowsByPubkey, parseFollowsFromKind3, __resetFollowsCacheForTests } from './follows';
import type { NostrClient, NostrEvent } from './types';

vi.mock('./npub', () => ({
    decodeNpubToHex: () => 'f'.repeat(64),
}));

describe('parseFollowsFromKind3', () => {
    test('extracts unique pubkeys from kind 3 p-tags', () => {
        const event: NostrEvent = {
            id: 'event-id',
            pubkey: 'f'.repeat(64),
            kind: 3,
            created_at: 1,
            content: '',
            tags: [
                ['p', 'a'.repeat(64)],
                ['p', 'b'.repeat(64), 'wss://relay.damus.io'],
                ['p', 'a'.repeat(64)],
                ['e', 'not-a-pubkey'],
            ],
        };

        expect(parseFollowsFromKind3(event)).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
    });

    test('returns empty list when event is not kind 3', () => {
        const event: NostrEvent = {
            id: 'event-id',
            pubkey: 'f'.repeat(64),
            kind: 1,
            created_at: 1,
            content: '',
            tags: [['p', 'a'.repeat(64)]],
        };

        expect(parseFollowsFromKind3(event)).toEqual([]);
    });
});

describe('buildContactListTags', () => {
    test('preserves retained p-tag metadata, removes unfollowed tags, filters invalid pubkeys, dedupes, and appends new follows', () => {
        const retained = 'a'.repeat(64);
        const duplicateRetained = 'b'.repeat(64);
        const unfollowed = 'c'.repeat(64);
        const appended = 'd'.repeat(64);

        const tags = buildContactListTags([
            retained,
            'not-a-pubkey',
            duplicateRetained,
            retained,
            appended,
        ], [
            ['p', retained, 'wss://relay.example', 'Alice'],
            ['p', duplicateRetained, 'wss://relay.one', 'First Bob'],
            ['p', duplicateRetained, 'wss://relay.two', 'Second Bob'],
            ['p', unfollowed, 'wss://relay.example', 'Carol'],
            ['p', 'not-a-pubkey', 'wss://relay.example', 'Invalid'],
            ['e', '1'.repeat(64)],
        ]);

        expect(tags).toEqual([
            ['p', retained, 'wss://relay.example', 'Alice'],
            ['p', duplicateRetained, 'wss://relay.one', 'First Bob'],
            ['p', appended],
        ]);
    });

    test('keeps the deduped follows order when preserved tags are ordered differently', () => {
        const first = 'a'.repeat(64);
        const second = 'b'.repeat(64);

        expect(buildContactListTags([second, first], [
            ['p', first, 'wss://relay.example', 'Alice'],
            ['p', second, 'wss://relay.example', 'Bob'],
        ])).toEqual([
            ['p', second, 'wss://relay.example', 'Bob'],
            ['p', first, 'wss://relay.example', 'Alice'],
        ]);
    });
});

describe('fetchFollowsByNpub cache', () => {
    beforeEach(() => {
        __resetFollowsCacheForTests();
    });

    test('reuses cached follows result within ttl', async () => {
        const clientCalls = {
            connect: 0,
            fetchLatestReplaceableEvent: 0,
        };

        const client: NostrClient = {
            connect: async () => {
                clientCalls.connect += 1;
            },
            fetchLatestReplaceableEvent: async () => {
                clientCalls.fetchLatestReplaceableEvent += 1;
                return {
                    id: '1',
                    pubkey: 'f'.repeat(64),
                    kind: 3,
                    created_at: 1,
                    tags: [['p', 'a'.repeat(64)]],
                    content: '',
                };
            },
            fetchEvents: async () => [],
        };

        const npub = 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw';
        const first = await fetchFollowsByNpub(npub, client);
        const second = await fetchFollowsByNpub(npub, client);

        expect(first).toEqual(second);
        expect(clientCalls.connect).toBe(1);
        expect(clientCalls.fetchLatestReplaceableEvent).toBe(1);
    });

    test('fetches follows by pubkey directly and reuses cache', async () => {
        const clientCalls = {
            connect: 0,
            fetchLatestReplaceableEvent: 0,
        };

        const client: NostrClient = {
            connect: async () => {
                clientCalls.connect += 1;
            },
            fetchLatestReplaceableEvent: async () => {
                clientCalls.fetchLatestReplaceableEvent += 1;
                return {
                    id: '1',
                    pubkey: 'f'.repeat(64),
                    kind: 3,
                    created_at: 1,
                    tags: [['p', 'a'.repeat(64)]],
                    content: '',
                };
            },
            fetchEvents: async () => [],
        };

        const pubkey = 'f'.repeat(64);
        const first = await fetchFollowsByPubkey(pubkey, client);
        const second = await fetchFollowsByPubkey(pubkey, client);

        expect(first).toEqual(second);
        expect(first.ownerPubkey).toBe(pubkey);
        expect(clientCalls.connect).toBe(1);
        expect(clientCalls.fetchLatestReplaceableEvent).toBe(1);
    });

    test('fails fast when relay query hangs indefinitely', async () => {
        vi.useFakeTimers();

        try {
            const client: NostrClient = {
                connect: async () => {},
                fetchLatestReplaceableEvent: () => new Promise(() => {}),
                fetchEvents: async () => [],
            };

            let outcome: 'resolved' | 'rejected' | null = null;
            let rejection: unknown;

            void fetchFollowsByPubkey('f'.repeat(64), client).then(
                () => {
                    outcome = 'resolved';
                },
                (error) => {
                    outcome = 'rejected';
                    rejection = error;
                }
            );

            await vi.advanceTimersByTimeAsync(12_000);

            expect(outcome).toBe('rejected');
            expect(rejection).toBeInstanceOf(Error);
            expect((rejection as Error).message.toLowerCase()).toContain('timeout');
        } finally {
            vi.useRealTimers();
        }
    });
});
