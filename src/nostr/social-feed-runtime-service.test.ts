import { describe, expect, test, vi } from 'vitest';
import { LONG_FORM_ARTICLE_KIND } from './articles';
import { createRuntimeSocialFeedService } from './social-feed-runtime-service';
import type { NostrEvent } from './types';
import { createTransportPool } from './transport-pool';

const FOLLOW_A = 'a'.repeat(64);
const FOLLOW_B = 'b'.repeat(64);

function noteEvent(input: {
    id: string;
    pubkey: string;
    createdAt: number;
    kind?: number;
    tags?: string[][];
    content?: string;
}): NostrEvent {
    return {
        id: input.id,
        pubkey: input.pubkey,
        kind: input.kind ?? 1,
        created_at: input.createdAt,
        tags: input.tags ?? [],
        content: input.content ?? '',
    };
}

function createTransportMock(events: NostrEvent[]) {
    return {
        publishToRelays: vi.fn(async () => ({ ackedRelays: [], failedRelays: [], timeoutRelays: [] })),
        subscribe: vi.fn(() => ({
            unsubscribe() {
                return;
            },
        })),
        fetchBackfill: vi.fn(async () => events),
    };
}

function buildReply(id: string, pubkey: string, createdAt: number, rootEventId: string): NostrEvent {
    return noteEvent({
        id,
        pubkey,
        createdAt,
        tags: [['e', rootEventId, '', 'reply']],
        content: 'reply',
    });
}

function buildZapReceipt(id: string, targetEventId: string, msats: number): NostrEvent {
    return noteEvent({
        id,
        pubkey: FOLLOW_A,
        kind: 9735,
        createdAt: 800,
        tags: [
            ['e', targetEventId],
            ['description', JSON.stringify({
                kind: 9734,
                tags: [['amount', String(msats)]],
            })],
        ],
    });
}

describe('social-feed-runtime-service', () => {
    test('reuses a single transport instance across feed operations for the same relay set', async () => {
        const transport = createTransportMock([]);
        const createTransport = vi.fn(() => transport as any);
        const service = createRuntimeSocialFeedService({
            createTransport,
            resolveRelays: () => ['wss://relay.one'],
            transportPool: createTransportPool(),
        });

        await service.loadFollowingFeed({
            follows: [FOLLOW_A],
            limit: 1,
        });

        await service.loadThread({
            rootEventId: 'root-1',
            limit: 1,
        });

        await service.loadEngagement({
            eventIds: ['note-1'],
            limit: 10,
        });

        expect(createTransport).toHaveBeenCalledTimes(1);
    });

    test('falls back to secondary relay set when primary feed request fails', async () => {
        const primaryTransport = {
            publishToRelays: vi.fn(async () => ({ ackedRelays: [], failedRelays: [], timeoutRelays: [] })),
            subscribe: vi.fn(() => ({ unsubscribe() { return; } })),
            fetchBackfill: vi.fn(async () => {
                throw new Error('relay timeout');
            }),
        };
        const fallbackTransport = createTransportMock([
            noteEvent({ id: 'note-fallback', pubkey: FOLLOW_A, createdAt: 500, content: 'fallback' }),
        ]);
        const createTransport = vi.fn((relays: string[]) => {
            if (relays.includes('wss://primary.relay')) {
                return primaryTransport as any;
            }

            return fallbackTransport as any;
        });

        const service = createRuntimeSocialFeedService({
            createTransport,
            resolveRelays: () => ['wss://primary.relay'],
            resolveFallbackRelays: () => ['wss://fallback.relay'],
            transportPool: createTransportPool(),
        });

        const page = await service.loadFollowingFeed({
            follows: [FOLLOW_A],
            limit: 10,
        });

        expect(page.items.map((item) => item.id)).toEqual(['note-fallback']);
        expect(createTransport).toHaveBeenCalledTimes(2);
    });

    test('falls back to secondary relays when primary backfill hangs beyond timeout', async () => {
        const primaryTransport = {
            publishToRelays: vi.fn(async () => ({ ackedRelays: [], failedRelays: [], timeoutRelays: [] })),
            subscribe: vi.fn(() => ({ unsubscribe() { return; } })),
            fetchBackfill: vi.fn(async () => new Promise<NostrEvent[]>(() => {
                return;
            })),
        };
        const fallbackTransport = createTransportMock([
            noteEvent({ id: 'note-timeout-fallback', pubkey: FOLLOW_A, createdAt: 600, content: 'fallback-timeout' }),
        ]);
        const createTransport = vi.fn((relays: string[]) => {
            if (relays.includes('wss://primary.relay')) {
                return primaryTransport as any;
            }

            return fallbackTransport as any;
        });

        const service = createRuntimeSocialFeedService({
            createTransport,
            resolveRelays: () => ['wss://primary.relay'],
            resolveFallbackRelays: () => ['wss://fallback.relay'],
            transportPool: createTransportPool(),
            backfillTimeoutMs: 25,
        } as any);

        const outcome = await Promise.race<any>([
            service.loadFollowingFeed({
                follows: [FOLLOW_A],
                limit: 10,
            }),
            new Promise<'guard-timeout'>((resolve) => {
                setTimeout(() => resolve('guard-timeout'), 120);
            }),
        ]);

        expect(outcome).not.toBe('guard-timeout');
        expect(outcome).toMatchObject({
            items: [
                expect.objectContaining({ id: 'note-timeout-fallback' }),
            ],
        });
        expect(createTransport).toHaveBeenCalledTimes(2);
    });

    test('returns timeout error when primary and fallback backfills hang', async () => {
        const hangingTransport = {
            publishToRelays: vi.fn(async () => ({ ackedRelays: [], failedRelays: [], timeoutRelays: [] })),
            subscribe: vi.fn(() => ({ unsubscribe() { return; } })),
            fetchBackfill: vi.fn(async () => new Promise<NostrEvent[]>(() => {
                return;
            })),
        };
        const createTransport = vi.fn(() => hangingTransport as any);

        const service = createRuntimeSocialFeedService({
            createTransport,
            resolveRelays: () => ['wss://primary.relay'],
            resolveFallbackRelays: () => ['wss://fallback.relay'],
            transportPool: createTransportPool(),
            backfillTimeoutMs: 20,
        } as any);

        const outcome = await Promise.race<'rejected' | 'guard-timeout'>([
            service.loadFollowingFeed({
                follows: [FOLLOW_A],
                limit: 5,
            }).then(() => 'guard-timeout' as const).catch((error: unknown) => {
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message.toLowerCase()).toContain('timeout');
                return 'rejected' as const;
            }),
            new Promise<'guard-timeout'>((resolve) => {
                setTimeout(() => resolve('guard-timeout'), 120);
            }),
        ]);

        expect(outcome).toBe('rejected');
    });

    test('loads following feed, excludes replies and keeps notes/reposts sorted', async () => {
        const transport = createTransportMock([
            noteEvent({
                id: 'reply-1',
                pubkey: FOLLOW_A,
                createdAt: 420,
                tags: [['e', 'root-1', '', 'reply']],
                content: 'reply',
            }),
            noteEvent({ id: 'note-1', pubkey: FOLLOW_A, createdAt: 410, content: 'note' }),
            noteEvent({ id: 'repost-1', pubkey: FOLLOW_B, kind: 6, createdAt: 405, tags: [['e', 'note-1']] }),
        ]);

        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const page = await service.loadFollowingFeed({
            follows: [FOLLOW_A, FOLLOW_B],
            limit: 10,
        });

        expect(page.items.map((item) => item.id)).toEqual(['note-1', 'repost-1']);
        expect(page.items.map((item) => item.kind)).toEqual(['note', 'repost']);
        expect(page.hasMore).toBe(false);

        expect(transport.fetchBackfill).toHaveBeenCalledWith([
            expect.objectContaining({
                authors: [FOLLOW_A, FOLLOW_B],
                kinds: [1, 6, 16],
            }),
        ]);
    });

    test('dedupes/sorts feed and exposes pagination cursor', async () => {
        const transport = createTransportMock([
            noteEvent({ id: 'note-older', pubkey: FOLLOW_A, createdAt: 300 }),
            noteEvent({ id: 'note-newer', pubkey: FOLLOW_A, createdAt: 500 }),
            noteEvent({ id: 'note-mid', pubkey: FOLLOW_B, createdAt: 420 }),
            noteEvent({ id: 'note-mid', pubkey: FOLLOW_B, createdAt: 420 }),
        ]);

        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const page = await service.loadFollowingFeed({
            follows: [FOLLOW_A, FOLLOW_B],
            limit: 2,
            until: 777,
        });

        expect(page.items.map((item) => item.id)).toEqual(['note-newer', 'note-mid']);
        expect(page.hasMore).toBe(true);
        expect(page.nextUntil).toBe(419);
        expect(transport.fetchBackfill).toHaveBeenCalledWith([
            expect.objectContaining({
                until: 777,
            }),
        ]);
    });

    test('loads article feed with long-form article filters', async () => {
        const transport = createTransportMock([
            noteEvent({ id: 'article-1', pubkey: FOLLOW_A, kind: LONG_FORM_ARTICLE_KIND, createdAt: 500 }),
        ]);
        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const page = await service.loadArticlesFeed({
            authors: [FOLLOW_A, FOLLOW_B],
            limit: 10,
        });

        expect(page.items.map((item) => item.kind)).toEqual(['article']);
        expect(transport.fetchBackfill).toHaveBeenCalledWith([
            expect.objectContaining({
                authors: [FOLLOW_A, FOLLOW_B],
                kinds: [LONG_FORM_ARTICLE_KIND],
            }),
        ]);
    });

    test('dedupes and sorts article feed items', async () => {
        const transport = createTransportMock([
            noteEvent({ id: 'article-old', pubkey: FOLLOW_A, kind: LONG_FORM_ARTICLE_KIND, createdAt: 300 }),
            noteEvent({ id: 'article-new', pubkey: FOLLOW_A, kind: LONG_FORM_ARTICLE_KIND, createdAt: 500 }),
            noteEvent({ id: 'article-new', pubkey: FOLLOW_A, kind: LONG_FORM_ARTICLE_KIND, createdAt: 500 }),
            noteEvent({ id: 'note-ignore', pubkey: FOLLOW_A, kind: 1, createdAt: 600 }),
        ]);
        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const page = await service.loadArticlesFeed({
            authors: [FOLLOW_A],
            limit: 10,
        });

        expect(page.items.map((item) => item.id)).toEqual(['article-new', 'article-old']);
    });

    test('sets article feed cursor when more items are available', async () => {
        const transport = createTransportMock([
            noteEvent({ id: 'article-new', pubkey: FOLLOW_A, kind: LONG_FORM_ARTICLE_KIND, createdAt: 500 }),
            noteEvent({ id: 'article-old', pubkey: FOLLOW_A, kind: LONG_FORM_ARTICLE_KIND, createdAt: 300 }),
        ]);
        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const page = await service.loadArticlesFeed({
            authors: [FOLLOW_A],
            limit: 1,
            until: 777,
        });

        expect(page.items.map((item) => item.id)).toEqual(['article-new']);
        expect(page.hasMore).toBe(true);
        expect(page.nextUntil).toBe(499);
        expect(transport.fetchBackfill).toHaveBeenCalledWith([
            expect.objectContaining({ until: 777 }),
        ]);
    });

    test('returns empty article feed when authors are empty', async () => {
        const transport = createTransportMock([
            noteEvent({ id: 'article-1', pubkey: FOLLOW_A, kind: LONG_FORM_ARTICLE_KIND, createdAt: 500 }),
        ]);
        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        await expect(service.loadArticlesFeed({ authors: [], limit: 10 })).resolves.toEqual({
            items: [],
            hasMore: false,
        });
        expect(transport.fetchBackfill).not.toHaveBeenCalled();
    });

    test('loads thread root and paginated replies by #e', async () => {
        const root = noteEvent({ id: 'root-1', pubkey: FOLLOW_A, createdAt: 500, content: 'root' });
        const replyA = noteEvent({
            id: 'reply-a',
            pubkey: FOLLOW_B,
            createdAt: 450,
            tags: [['e', 'root-1', '', 'reply']],
            content: 'reply-a',
        });
        const replyB = noteEvent({
            id: 'reply-b',
            pubkey: FOLLOW_A,
            createdAt: 430,
            tags: [['e', 'root-1', '', 'reply']],
            content: 'reply-b',
        });
        const unrelated = noteEvent({ id: 'unrelated', pubkey: FOLLOW_A, createdAt: 410, content: 'ignore' });

        const transport = createTransportMock([root, replyA, replyB, unrelated]);

        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const page = await service.loadThread({
            rootEventId: 'root-1',
            limit: 1,
            until: 600,
        });

        expect(page.root?.id).toBe('root-1');
        expect(page.replies.map((item) => item.id)).toEqual(['reply-a']);
        expect(page.hasMore).toBe(true);
        expect(page.nextUntil).toBe(449);
        expect(transport.fetchBackfill).toHaveBeenCalledWith([
            expect.objectContaining({ ids: ['root-1'], limit: 1 }),
            expect.objectContaining({ '#e': ['root-1'], kinds: [1], until: 600 }),
        ]);
    });

    test('loads hashtag feed and excludes reply events', async () => {
        const transport = createTransportMock([
            noteEvent({
                id: 'reply-hashtag-1',
                pubkey: FOLLOW_A,
                createdAt: 470,
                tags: [
                    ['e', 'root-1', '', 'reply'],
                    ['t', 'nostrcity'],
                ],
                content: 'reply',
            }),
            noteEvent({
                id: 'note-hashtag-1',
                pubkey: FOLLOW_A,
                createdAt: 500,
                tags: [['t', 'nostrcity']],
                content: 'hola #nostrcity',
            }),
            noteEvent({
                id: 'repost-hashtag-1',
                pubkey: FOLLOW_B,
                kind: 16,
                createdAt: 490,
                tags: [
                    ['q', 'note-hashtag-1'],
                    ['t', 'nostrcity'],
                ],
                content: '',
            }),
        ]);

        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const page = await service.loadHashtagFeed({
            hashtag: 'NostrCity',
            limit: 10,
            until: 600,
        });

        expect(page.items.map((item) => item.id)).toEqual(['note-hashtag-1', 'repost-hashtag-1']);
        expect(page.items.map((item) => item.kind)).toEqual(['note', 'repost']);
        expect(transport.fetchBackfill).toHaveBeenCalledWith([
            expect.objectContaining({
                '#t': ['nostrcity'],
                kinds: [1, 6, 16],
                until: 600,
            }),
        ]);
    });

    test('keeps feed pagination window aligned when author filters are chunked', async () => {
        const highAuthor = 'd'.repeat(64);
        const lowAuthor = 'e'.repeat(64);
        const follows = [
            highAuthor,
            ...Array.from({ length: 119 }, (_, index) => `${(index + 1).toString(16).padStart(2, '0')}`.repeat(32).slice(0, 64)),
            lowAuthor,
        ];

        const transport = {
            publishToRelays: vi.fn(async () => ({ ackedRelays: [], failedRelays: [], timeoutRelays: [] })),
            subscribe: vi.fn(() => ({
                unsubscribe() {
                    return;
                },
            })),
            fetchBackfill: vi.fn(async (filters: Array<{ authors?: string[]; limit?: number; until?: number }>) => {
                const filter = filters[0];
                if (!filter) {
                    return [];
                }

                const authors = filter.authors ?? [];
                const limit = filter.limit ?? 24;

                if (authors.includes(highAuthor)) {
                    if (typeof filter.until === 'number') {
                        if (filter.until > 500) {
                            return [noteEvent({ id: 'note-850', pubkey: highAuthor, createdAt: 850 })];
                        }

                        return [];
                    }

                    return [
                        buildReply('reply-1000', highAuthor, 1000, 'root-1'),
                        noteEvent({ id: 'note-900', pubkey: highAuthor, createdAt: 900 }),
                        ...Array.from({ length: Math.max(0, limit - 2) }, (_, index) =>
                            buildReply(`reply-extra-${index}`, highAuthor, 899 - index, 'root-1')
                        ),
                    ];
                }

                if (authors.includes(lowAuthor)) {
                    if (typeof filter.until === 'number' && filter.until < 500) {
                        return [];
                    }

                    return [noteEvent({ id: 'note-500', pubkey: lowAuthor, createdAt: 500 })];
                }

                return [];
            }),
        };

        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const page = await service.loadFollowingFeed({
            follows,
            limit: 2,
        });

        expect(page.items.map((item) => item.id)).toEqual(['note-900', 'note-850']);
        expect(page.hasMore).toBe(true);
        expect(page.nextUntil).toBe(849);
    });

    test('keeps hasMore true when capped by internal pass limit', async () => {
        const highAuthor = 'f'.repeat(64);

        const transport = {
            publishToRelays: vi.fn(async () => ({ ackedRelays: [], failedRelays: [], timeoutRelays: [] })),
            subscribe: vi.fn(() => ({
                unsubscribe() {
                    return;
                },
            })),
            fetchBackfill: vi.fn(async (filters: Array<{ authors?: string[]; limit?: number; until?: number }>) => {
                const filter = filters[0];
                if (!filter) {
                    return [];
                }

                const limit = filter.limit ?? 24;
                const until = typeof filter.until === 'number' ? filter.until : 1000;

                if (typeof filter.until !== 'number') {
                    const replies = Array.from({ length: limit - 1 }, (_, index) =>
                        buildReply(`reply-cap-first-${index}`, highAuthor, until - 1 - index, 'root-cap')
                    );
                    return [noteEvent({ id: 'note-cap', pubkey: highAuthor, createdAt: 1000 }), ...replies];
                }

                const replies = Array.from({ length: limit }, (_, index) =>
                    buildReply(`reply-cap-${until}-${index}`, highAuthor, until - 1 - index, 'root-cap')
                );
                return replies;
            }),
        };

        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const page = await service.loadFollowingFeed({
            follows: [highAuthor],
            limit: 5,
        });

        expect(page.items.map((item) => item.id)).toEqual(['note-cap']);
        expect(page.hasMore).toBe(true);
        expect(typeof page.nextUntil).toBe('number');
    });

    test('loads engagement counters by target event id', async () => {
        const transport = createTransportMock([
            noteEvent({ id: 'reaction-1', pubkey: FOLLOW_A, kind: 7, createdAt: 900, tags: [['e', 'note-1']], content: '+' }),
            noteEvent({ id: 'reaction-2', pubkey: FOLLOW_B, kind: 7, createdAt: 890, tags: [['e', 'note-1']], content: '+' }),
            noteEvent({ id: 'repost-1', pubkey: FOLLOW_A, kind: 6, createdAt: 880, tags: [['e', 'note-1']] }),
            noteEvent({ id: 'reply-1', pubkey: FOLLOW_B, createdAt: 870, tags: [['e', 'note-1', '', 'reply']], content: 'reply' }),
            noteEvent({ id: 'zap-1', pubkey: FOLLOW_A, kind: 9735, createdAt: 860, tags: [['e', 'note-1']] }),
            noteEvent({ id: 'reaction-3', pubkey: FOLLOW_A, kind: 7, createdAt: 850, tags: [['e', 'note-2']], content: '+' }),
        ]);

        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const engagement = await service.loadEngagement({
            eventIds: ['note-1', 'note-2'],
            until: 999,
        });

        expect(engagement['note-1']).toEqual({
            replies: 1,
            reposts: 1,
            reactions: 2,
            zaps: 1,
            zapSats: 0,
        });
        expect(engagement['note-2']).toEqual({
            replies: 0,
            reposts: 0,
            reactions: 1,
            zaps: 0,
            zapSats: 0,
        });
        const filters = (transport.fetchBackfill as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Array<Record<string, unknown>>;
        expect(filters.some((filter) => Array.isArray(filter['#e']))).toBe(true);
        expect(filters.some((filter) => Array.isArray(filter['#q']))).toBe(true);
    });

    test('loads latest viewer reactions by target event id', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const transport = createTransportMock([
            noteEvent({ id: 'older-reaction', pubkey: ownerPubkey, kind: 7, createdAt: 800, tags: [['e', 'note-1']], content: '😂' }),
            noteEvent({ id: 'latest-reaction', pubkey: ownerPubkey, kind: 7, createdAt: 900, tags: [['e', 'note-1']], content: '🔥' }),
            noteEvent({ id: 'like-reaction', pubkey: ownerPubkey, kind: 7, createdAt: 890, tags: [['e', 'note-2']], content: '+' }),
            noteEvent({ id: 'other-viewer-reaction', pubkey: FOLLOW_A, kind: 7, createdAt: 910, tags: [['e', 'note-1']], content: '👏' }),
            noteEvent({ id: 'outside-targets', pubkey: ownerPubkey, kind: 7, createdAt: 920, tags: [['e', 'note-3']], content: '🤯' }),
        ]);

        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const reactions = await service.loadViewerReactions({
            ownerPubkey,
            eventIds: ['note-1', 'note-2'],
        });

        expect(reactions).toEqual({
            'note-1': {
                eventId: 'note-1',
                reactionEventId: 'latest-reaction',
                emoji: '🔥',
                createdAt: 900,
            },
            'note-2': {
                eventId: 'note-2',
                reactionEventId: 'like-reaction',
                emoji: '❤️',
                createdAt: 890,
            },
        });
        const filters = (transport.fetchBackfill as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Array<Record<string, unknown>>;
        expect(filters[0]).toMatchObject({
            authors: [ownerPubkey],
            kinds: [7],
            '#e': ['note-1', 'note-2'],
        });
    });

    test('suppresses viewer reactions deleted by the owner', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const transport = createTransportMock([
            noteEvent({ id: 'latest-reaction', pubkey: ownerPubkey, kind: 7, createdAt: 900, tags: [['e', 'note-1']], content: '🔥' }),
            noteEvent({ id: 'older-reaction', pubkey: ownerPubkey, kind: 7, createdAt: 800, tags: [['e', 'note-1']], content: '😂' }),
            noteEvent({ id: 'delete-reaction', pubkey: ownerPubkey, kind: 5, createdAt: 910, tags: [['e', 'latest-reaction'], ['k', '7']] }),
        ]);

        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const reactions = await service.loadViewerReactions({
            ownerPubkey,
            eventIds: ['note-1'],
        });

        expect(reactions).toEqual({});
    });

    test('loads viewer zaps from NIP-57 receipt P tags by target event id', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const transport = createTransportMock([
            noteEvent({
                id: 'viewer-zap',
                pubkey: FOLLOW_A,
                kind: 9735,
                createdAt: 900,
                tags: [
                    ['e', 'note-1'],
                    ['p', FOLLOW_B],
                    ['P', ownerPubkey],
                    ['amount', '21000'],
                    ['description', JSON.stringify({ kind: 9734, pubkey: ownerPubkey, tags: [['amount', '21000'], ['e', 'note-1'], ['p', FOLLOW_B]] })],
                ],
            }),
            noteEvent({
                id: 'other-viewer-zap',
                pubkey: FOLLOW_A,
                kind: 9735,
                createdAt: 910,
                tags: [
                    ['e', 'note-1'],
                    ['P', FOLLOW_A],
                    ['amount', '42000'],
                ],
            }),
        ]);

        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const zaps = await (service as any).loadViewerZaps({
            ownerPubkey,
            eventIds: ['note-1'],
        });

        expect(zaps).toEqual({
            'note-1': {
                eventId: 'note-1',
                zapReceiptEventId: 'viewer-zap',
                amountSats: 21,
                createdAt: 900,
            },
        });
        const filters = (transport.fetchBackfill as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Array<Record<string, unknown>>;
        expect(filters[0]).toMatchObject({
            kinds: [9735],
            '#e': ['note-1'],
        });
        expect(filters[0]).not.toHaveProperty('authors');
    });

    test('loads viewer zaps from NIP-57 description pubkey fallback', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const transport = createTransportMock([
            noteEvent({
                id: 'viewer-zap-description',
                pubkey: FOLLOW_A,
                kind: 9735,
                createdAt: 900,
                tags: [
                    ['e', 'note-1'],
                    ['description', JSON.stringify({ kind: 9734, pubkey: ownerPubkey, tags: [['amount', '128000'], ['e', 'note-1']] })],
                ],
            }),
        ]);

        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const zaps = await (service as any).loadViewerZaps({
            ownerPubkey,
            eventIds: ['note-1'],
        });

        expect(zaps['note-1']).toMatchObject({
            eventId: 'note-1',
            zapReceiptEventId: 'viewer-zap-description',
            amountSats: 128,
            createdAt: 900,
        });
    });

    test('ignores viewer zap receipts from other senders or malformed descriptions', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const transport = createTransportMock([
            noteEvent({
                id: 'other-sender-zap',
                pubkey: FOLLOW_A,
                kind: 9735,
                createdAt: 900,
                tags: [
                    ['e', 'note-1'],
                    ['P', FOLLOW_A],
                    ['amount', '21000'],
                ],
            }),
            noteEvent({
                id: 'malformed-zap',
                pubkey: FOLLOW_A,
                kind: 9735,
                createdAt: 910,
                tags: [
                    ['e', 'note-1'],
                    ['description', '{bad-json'],
                ],
            }),
        ]);

        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const zaps = await (service as any).loadViewerZaps({
            ownerPubkey,
            eventIds: ['note-1'],
        });

        expect(zaps).toEqual({});
    });

    test('loads latest viewer replies by direct target event id', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const transport = createTransportMock([
            noteEvent({
                id: 'viewer-reply-root',
                pubkey: ownerPubkey,
                createdAt: 900,
                tags: [['e', 'note-1', '', 'root'], ['e', 'note-1', '', 'reply']],
                content: 'mine',
            }),
            noteEvent({
                id: 'viewer-reply-deep',
                pubkey: ownerPubkey,
                createdAt: 910,
                tags: [['e', 'note-1', '', 'root'], ['e', 'reply-parent', '', 'reply']],
                content: 'deep reply',
            }),
            noteEvent({
                id: 'other-reply',
                pubkey: FOLLOW_A,
                createdAt: 920,
                tags: [['e', 'note-1', '', 'reply']],
                content: 'other',
            }),
        ]);

        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const replies = await (service as any).loadViewerReplies({
            ownerPubkey,
            eventIds: ['note-1'],
        });

        expect(replies).toEqual({
            'note-1': {
                eventId: 'note-1',
                replyEventId: 'viewer-reply-root',
                createdAt: 900,
            },
        });
        const filters = (transport.fetchBackfill as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Array<Record<string, unknown>>;
        expect(filters[0]).toMatchObject({
            authors: [ownerPubkey],
            kinds: [1],
            '#e': ['note-1'],
        });
    });

    test('dedupes engagement events and ignores unsupported note kinds', async () => {
        const invalid = {
            id: 'invalid',
            pubkey: FOLLOW_A,
            kind: 7,
            created_at: 800,
            tags: [['e', 'note-1'], [123 as any]],
            content: '+',
        } as NostrEvent;

        const transport = createTransportMock([
            noteEvent({ id: 'dup-reaction', pubkey: FOLLOW_A, kind: 7, createdAt: 810, tags: [['e', 'note-1']], content: '+' }),
            noteEvent({ id: 'dup-reaction', pubkey: FOLLOW_A, kind: 7, createdAt: 810, tags: [['e', 'note-1']], content: '+' }),
            noteEvent({ id: 'mention-note', pubkey: FOLLOW_B, createdAt: 805, tags: [['e', 'note-1']], content: 'not a reply' }),
            invalid,
        ]);

        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const engagement = await service.loadEngagement({
            eventIds: ['note-1', 'note-1'],
            limit: 50,
        });

        expect(engagement).toEqual({
            'note-1': {
                replies: 0,
                reposts: 0,
                reactions: 1,
                zaps: 0,
                zapSats: 0,
            },
        });
    });

    test('counts quote reposts, marker-based replies and zap sats from zap request description', async () => {
        const transport = createTransportMock([
            noteEvent({
                id: 'quote-1',
                pubkey: FOLLOW_B,
                kind: 16,
                createdAt: 910,
                tags: [['q', 'note-1']],
                content: 'quote repost',
            }),
            noteEvent({
                id: 'reply-root-1',
                pubkey: FOLLOW_B,
                createdAt: 900,
                tags: [
                    ['e', 'note-1', '', 'root'],
                    ['e', 'note-parent', '', 'reply'],
                ],
                content: 'reply chain',
            }),
            buildZapReceipt('zap-sats-1', 'note-1', 21_000),
            noteEvent({
                id: 'zap-invalid-1',
                pubkey: FOLLOW_A,
                kind: 9735,
                createdAt: 890,
                tags: [
                    ['e', 'note-1'],
                    ['description', '{bad-json'],
                ],
            }),
        ]);

        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const engagement = await service.loadEngagement({
            eventIds: ['note-1'],
            limit: 80,
        });

        expect(engagement['note-1']).toEqual({
            replies: 1,
            reposts: 1,
            reactions: 0,
            zaps: 2,
            zapSats: 21,
        });
    });

    test('chunks large engagement requests while querying both #e and #q tags', async () => {
        const eventIds = Array.from({ length: 121 }, (_, index) => `note-${index + 1}`);
        const transport = createTransportMock([
            noteEvent({
                id: 'reaction-last',
                pubkey: FOLLOW_A,
                kind: 7,
                createdAt: 920,
                tags: [['e', 'note-121']],
                content: '+',
            }),
            noteEvent({
                id: 'quote-first',
                pubkey: FOLLOW_B,
                kind: 16,
                createdAt: 910,
                tags: [['q', 'note-1']],
            }),
        ]);

        const service = createRuntimeSocialFeedService({
            createTransport: () => transport as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        const engagement = await service.loadEngagement({
            eventIds,
            limit: 180,
        });

        expect(engagement['note-1']).toMatchObject({ reposts: 1 });
        expect(engagement['note-121']).toMatchObject({ reactions: 1 });

        const allFilters = (transport.fetchBackfill as ReturnType<typeof vi.fn>).mock.calls
            .flatMap((call) => (call[0] as Array<Record<string, unknown>>) ?? []);
        const eFilters = allFilters.filter((filter) => Array.isArray(filter['#e']));
        const qFilters = allFilters.filter((filter) => Array.isArray(filter['#q']));

        expect(eFilters.length).toBeGreaterThan(0);
        expect(qFilters.length).toBeGreaterThan(0);
        expect(eFilters.every((filter) => ((filter['#e'] as string[]).length <= 120))).toBe(true);
        expect(qFilters.every((filter) => ((filter['#q'] as string[]).length <= 120))).toBe(true);
    });
});
