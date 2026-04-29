// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import type { SimplePool } from 'nostr-tools';

import { createSocialService } from './social.service';

const OWNER = 'a'.repeat(64);
const ROOT_EVENT_ID = 'b'.repeat(64);
const FOLLOW = 'c'.repeat(64);

describe('social service pagination', () => {
  it('computes feed hasMore and nextUntil using limit+1 strategy', async () => {
    const pool = {
      querySync: vi.fn(async (_relays: string[], filter: Record<string, unknown>) => {
        if (Array.isArray(filter.kinds) && filter.kinds[0] === 3) {
          return [
            {
              id: '1'.repeat(64),
              pubkey: OWNER,
              kind: 3,
              created_at: 100,
              tags: [['p', FOLLOW]],
              content: '',
            },
          ];
        }

        return [
          {
            id: '2'.repeat(64),
            pubkey: FOLLOW,
            kind: 1,
            created_at: 30,
            tags: [],
            content: 'n1',
          },
          {
            id: '3'.repeat(64),
            pubkey: FOLLOW,
            kind: 1,
            created_at: 20,
            tags: [],
            content: 'n2',
          },
          {
            id: '4'.repeat(64),
            pubkey: FOLLOW,
            kind: 1,
            created_at: 10,
            tags: [],
            content: 'n3',
          },
        ];
      }),
    } as unknown as SimplePool;

    const service = createSocialService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getFollowingFeed({
      ownerPubkey: OWNER,
      limit: 2,
      until: 999,
    });

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextUntil).toBe(19);
  });

  it('computes thread hasMore and nextUntil using limit+1 strategy', async () => {
    const pool = {
      querySync: vi.fn(async (_relays: string[], filter: Record<string, unknown>) => {
        if (Array.isArray(filter.ids)) {
          return [
            {
              id: ROOT_EVENT_ID,
              pubkey: OWNER,
              kind: 1,
              created_at: 90,
              tags: [],
              content: 'root',
            },
          ];
        }

        return [
          {
            id: '5'.repeat(64),
            pubkey: FOLLOW,
            kind: 1,
            created_at: 40,
            tags: [['e', ROOT_EVENT_ID]],
            content: 'r1',
          },
          {
            id: '6'.repeat(64),
            pubkey: FOLLOW,
            kind: 1,
            created_at: 30,
            tags: [['e', ROOT_EVENT_ID]],
            content: 'r2',
          },
          {
            id: '7'.repeat(64),
            pubkey: FOLLOW,
            kind: 1,
            created_at: 20,
            tags: [['e', ROOT_EVENT_ID]],
            content: 'r3',
          },
        ];
      }),
    } as unknown as SimplePool;

    const service = createSocialService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getThread({
      rootEventId: ROOT_EVENT_ID,
      limit: 2,
      until: 999,
    });

    expect(result.root?.id).toBe(ROOT_EVENT_ID);
    expect(result.replies).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextUntil).toBe(29);
  });

  it('loads articles from followed authors with NIP-23 kind', async () => {
    const pool = {
      querySync: vi.fn(async (_relays: string[], filter: Record<string, unknown>) => {
        if (Array.isArray(filter.kinds) && filter.kinds[0] === 3) {
          return [
            {
              id: '1'.repeat(64),
              pubkey: OWNER,
              kind: 3,
              created_at: 100,
              tags: [['p', FOLLOW]],
              content: '',
            },
          ];
        }

        return [
          {
            id: '2'.repeat(64),
            pubkey: FOLLOW,
            kind: 30023,
            created_at: 30,
            tags: [['title', 'Article']],
            content: '# Article',
          },
        ];
      }),
    } as unknown as SimplePool;

    const service = createSocialService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getArticlesFeed({
      ownerPubkey: OWNER,
      limit: 2,
      until: 999,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.kind).toBe(30023);
    expect(pool.querySync).toHaveBeenLastCalledWith(
      ['wss://relay.damus.io'],
      expect.objectContaining({
        authors: [FOLLOW],
        kinds: [30023],
        until: 999,
        limit: 3,
      }),
    );
  });

  it('loads article detail by id with NIP-23 kind guard', async () => {
    const pool = {
      querySync: vi.fn(async () => [
        {
          id: ROOT_EVENT_ID,
          pubkey: FOLLOW,
          kind: 30023,
          created_at: 30,
          tags: [['title', 'Article']],
          content: '# Article',
        },
      ]),
    } as unknown as SimplePool;

    const service = createSocialService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getArticleById({ eventId: ROOT_EVENT_ID });

    expect(result.event?.id).toBe(ROOT_EVENT_ID);
    expect(result.event?.kind).toBe(30023);
    expect(pool.querySync).toHaveBeenCalledWith(
      ['wss://relay.damus.io'],
      {
        ids: [ROOT_EVENT_ID],
        kinds: [30023],
        limit: 1,
      },
    );
  });

  it('aggregates engagement counters by event id', async () => {
    const eventA = 'd'.repeat(64);
    const eventB = 'e'.repeat(64);

    const pool = {
      querySync: vi.fn(async (_relays: string[], filter: Record<string, unknown>) => {
        if (!Array.isArray(filter.kinds)) {
          return [];
        }

        const kind = filter.kinds[0];
        if (kind === 1) {
          return [
            {
              id: '8'.repeat(64),
              pubkey: FOLLOW,
              kind: 1,
              created_at: 10,
              tags: [['e', eventA]],
              content: 'reply',
            },
          ];
        }

        if (kind === 6) {
          return [
            {
              id: '9'.repeat(64),
              pubkey: FOLLOW,
              kind: 6,
              created_at: 10,
              tags: [['e', eventA]],
              content: '',
            },
          ];
        }

        if (kind === 7) {
          return [
            {
              id: 'f'.repeat(64),
              pubkey: FOLLOW,
              kind: 7,
              created_at: 10,
              tags: [
                ['e', eventA, '', 'root'],
                ['e', eventB, '', 'reply'],
              ],
              content: '+',
            },
          ];
        }

        if (kind === 9735) {
          return [
            {
              id: '1'.repeat(64),
              pubkey: FOLLOW,
              kind: 9735,
              created_at: 10,
              tags: [
                ['e', eventA],
                ['amount', '21000'],
              ],
              content: '',
            },
            {
              id: '2'.repeat(64),
              pubkey: FOLLOW,
              kind: 9735,
              created_at: 11,
              tags: [
                ['e', eventB],
                ['amount', '3000'],
              ],
              content: '',
            },
          ];
        }

        return [];
      }),
    } as unknown as SimplePool;

    const service = createSocialService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getEngagement({
      eventIds: [eventA, eventB],
      until: 999,
    });

    expect(result.byEventId[eventA]).toEqual({
      replies: 1,
      reposts: 1,
      reactions: 0,
      zaps: 1,
      zapSats: 21,
    });
    expect(result.byEventId[eventB]).toEqual({
      replies: 0,
      reposts: 0,
      reactions: 1,
      zaps: 1,
      zapSats: 3,
    });
  });

  it('parses zap sats from receipt description when amount tag is missing', async () => {
    const eventA = 'd'.repeat(64);

    const pool = {
      querySync: vi.fn(async (_relays: string[], filter: Record<string, unknown>) => {
        if (!Array.isArray(filter.kinds) || filter.kinds[0] !== 9735) {
          return [];
        }

        return [
          {
            id: '3'.repeat(64),
            pubkey: FOLLOW,
            kind: 9735,
            created_at: 12,
            tags: [
              ['e', eventA],
              ['description', JSON.stringify({
                kind: 9734,
                tags: [
                  ['e', eventA],
                  ['amount', '21000'],
                ],
              })],
            ],
            content: '',
          },
        ];
      }),
    } as unknown as SimplePool;

    const service = createSocialService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getEngagement({
      eventIds: [eventA],
      until: 999,
    });

    expect(result.byEventId[eventA]).toEqual({
      replies: 0,
      reposts: 0,
      reactions: 0,
      zaps: 1,
      zapSats: 21,
    });
  });

  it('prefers top-level amount tag over description amount when both are present', async () => {
    const eventA = 'd'.repeat(64);

    const pool = {
      querySync: vi.fn(async (_relays: string[], filter: Record<string, unknown>) => {
        if (!Array.isArray(filter.kinds) || filter.kinds[0] !== 9735) {
          return [];
        }

        return [
          {
            id: '4'.repeat(64),
            pubkey: FOLLOW,
            kind: 9735,
            created_at: 13,
            tags: [
              ['e', eventA],
              ['amount', '21000'],
              ['description', JSON.stringify({
                kind: 9734,
                tags: [
                  ['e', eventA],
                  ['amount', '64000'],
                ],
              })],
            ],
            content: '',
          },
        ];
      }),
    } as unknown as SimplePool;

    const service = createSocialService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getEngagement({
      eventIds: [eventA],
      until: 999,
    });

    expect(result.byEventId[eventA]).toEqual({
      replies: 0,
      reposts: 0,
      reactions: 0,
      zaps: 1,
      zapSats: 21,
    });
  });

  it('loads latest viewer emoji reactions by target event id', async () => {
    const eventA = 'd'.repeat(64);
    const eventB = 'e'.repeat(64);
    const eventC = 'f'.repeat(64);
    const reactionAOld = '4'.repeat(64);
    const reactionANew = '5'.repeat(64);
    const reactionB = '6'.repeat(64);
    const reactionC = '8'.repeat(64);

    const pool = {
      querySync: vi.fn(async (_relays: string[], filter: Record<string, unknown>) => {
        if (!Array.isArray(filter.kinds) || filter.kinds[0] !== 7) {
          return [];
        }

        return [
          {
            id: reactionAOld,
            pubkey: OWNER,
            kind: 7,
            created_at: 10,
            tags: [['e', eventA]],
            content: '👏',
          },
          {
            id: reactionANew,
            pubkey: OWNER,
            kind: 7,
            created_at: 20,
            tags: [['e', eventA]],
            content: '🔥',
          },
          {
            id: reactionB,
            pubkey: OWNER,
            kind: 7,
            created_at: 15,
            tags: [['e', eventB]],
            content: '+',
          },
          {
            id: reactionC,
            pubkey: OWNER,
            kind: 7,
            created_at: 12,
            tags: [['e', eventA, '', 'root'], ['e', eventC]],
            content: '🤯',
          },
          {
            id: '7'.repeat(64),
            pubkey: FOLLOW,
            kind: 7,
            created_at: 30,
            tags: [['e', eventA]],
            content: '😢',
          },
        ];
      }),
    } as unknown as SimplePool;

    const service = createSocialService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getViewerReactions({
      ownerPubkey: OWNER,
      eventIds: [eventA, eventB, eventC],
    });

    expect(result.byEventId).toEqual({
      [eventA]: {
        eventId: eventA,
        reactionEventId: reactionANew,
        emoji: '🔥',
        createdAt: 20,
      },
      [eventB]: {
        eventId: eventB,
        reactionEventId: reactionB,
        emoji: '❤️',
        createdAt: 15,
      },
      [eventC]: {
        eventId: eventC,
        reactionEventId: reactionC,
        emoji: '🤯',
        createdAt: 12,
      },
    });
  });

  it('suppresses latest viewer reactions deleted by the owner', async () => {
    const eventId = 'd'.repeat(64);
    const reactionOld = '4'.repeat(64);
    const reactionNew = '5'.repeat(64);

    const pool = {
      querySync: vi.fn(async (_relays: string[], filter: Record<string, unknown>) => {
        if (!Array.isArray(filter.kinds)) {
          return [];
        }

        if (filter.kinds[0] === 7) {
          return [
            {
              id: reactionOld,
              pubkey: OWNER,
              kind: 7,
              created_at: 10,
              tags: [['e', eventId]],
              content: '😂',
            },
            {
              id: reactionNew,
              pubkey: OWNER,
              kind: 7,
              created_at: 20,
              tags: [['e', eventId]],
              content: '🔥',
            },
          ];
        }

        if (filter.kinds[0] === 5) {
          return [
            {
              id: '6'.repeat(64),
              pubkey: OWNER,
              kind: 5,
              created_at: 30,
              tags: [['e', reactionNew], ['k', '7']],
              content: '',
            },
          ];
        }

        return [];
      }),
    } as unknown as SimplePool;

    const service = createSocialService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getViewerReactions({
      ownerPubkey: OWNER,
      eventIds: [eventId],
    });

    expect(result.byEventId).toEqual({});
  });

  it('loads viewer zaps from NIP-57 receipt sender tags', async () => {
    const eventId = 'd'.repeat(64);
    const receiptId = '8'.repeat(64);

    const pool = {
      querySync: vi.fn(async (_relays: string[], filter: Record<string, unknown>) => {
        if (!Array.isArray(filter.kinds) || filter.kinds[0] !== 9735) {
          return [];
        }

        return [
          {
            id: receiptId,
            pubkey: FOLLOW,
            kind: 9735,
            created_at: 20,
            tags: [
              ['e', eventId],
              ['P', OWNER],
              ['amount', '21000'],
            ],
            content: '',
          },
          {
            id: '9'.repeat(64),
            pubkey: FOLLOW,
            kind: 9735,
            created_at: 30,
            tags: [
              ['e', eventId],
              ['P', FOLLOW],
              ['amount', '42000'],
            ],
            content: '',
          },
        ];
      }),
    } as unknown as SimplePool;

    const service = createSocialService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getViewerZaps({
      ownerPubkey: OWNER,
      eventIds: [eventId],
    });

    expect(result.byEventId).toEqual({
      [eventId]: {
        eventId,
        zapReceiptEventId: receiptId,
        amountSats: 21,
        createdAt: 20,
      },
    });
  });

  it('loads latest viewer replies by direct target event id', async () => {
    const eventId = 'd'.repeat(64);
    const replyId = '8'.repeat(64);

    const pool = {
      querySync: vi.fn(async (_relays: string[], filter: Record<string, unknown>) => {
        if (!Array.isArray(filter.kinds) || filter.kinds[0] !== 1) {
          return [];
        }

        return [
          {
            id: replyId,
            pubkey: OWNER,
            kind: 1,
            created_at: 20,
            tags: [['e', eventId, '', 'root'], ['e', eventId, '', 'reply']],
            content: 'mine',
          },
          {
            id: '9'.repeat(64),
            pubkey: OWNER,
            kind: 1,
            created_at: 30,
            tags: [['e', eventId, '', 'root'], ['e', 'a'.repeat(64), '', 'reply']],
            content: 'deep reply',
          },
          {
            id: 'b'.repeat(64),
            pubkey: OWNER,
            kind: 1,
            created_at: 40,
            tags: [['e', eventId]],
            content: 'mention, not a reply',
          },
          {
            id: 'c'.repeat(64),
            pubkey: FOLLOW,
            kind: 1,
            created_at: 50,
            tags: [['e', eventId, '', 'reply']],
            content: 'other',
          },
        ];
      }),
    } as unknown as SimplePool;

    const service = createSocialService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getViewerReplies({
      ownerPubkey: OWNER,
      eventIds: [eventId],
    });

    expect(result.byEventId).toEqual({
      [eventId]: {
        eventId,
        replyEventId: replyId,
        createdAt: 20,
      },
    });
  });
});
