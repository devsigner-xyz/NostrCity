// @vitest-environment node

import type { SimplePool } from 'nostr-tools';
import { describe, expect, it, vi } from 'vitest';

import type { RelayGateway } from '../../relay/relay-gateway.types';
import type { RelayQueryExecutor } from '../../relay/relay-query-executor';
import type {
  NotificationItemDto,
  NotificationsQuery,
  NotificationsResponseDto,
  NotificationsStreamQuery,
} from './notifications.schemas';
import { createNotificationsService } from './notifications.service';

const OWNER_PUBKEY = 'a'.repeat(64);
const ACTOR_PUBKEY = 'b'.repeat(64);
const TARGET_EVENT_ID = 'c'.repeat(64);

const makeEvent = (event: { id: string; createdAt: number; kind?: number }) => ({
  id: event.id,
  pubkey: ACTOR_PUBKEY,
  sig: 'f'.repeat(128),
  kind: event.kind ?? 1,
  created_at: event.createdAt,
  tags: [
    ['p', OWNER_PUBKEY],
    ['e', TARGET_EVENT_ID],
  ],
  content: 'mention',
});

const makeItem = (item: { id: string; createdAt: number; kind?: number }): NotificationItemDto => ({
  id: item.id,
  kind: item.kind ?? 1,
  actorPubkey: ACTOR_PUBKEY,
  createdAt: item.createdAt,
  targetEventId: TARGET_EVENT_ID,
  targetPubkey: OWNER_PUBKEY,
  rawEvent: {
    id: item.id,
    pubkey: ACTOR_PUBKEY,
    kind: item.kind ?? 1,
    createdAt: item.createdAt,
    content: 'mention',
    tags: [
      ['p', OWNER_PUBKEY],
      ['e', TARGET_EVENT_ID],
    ],
  },
});

describe('notifications service list behavior', () => {
  it('re-fetches notifications for repeated identical queries', async () => {
    const fetchNotifications = vi.fn(async () => ({
      items: [],
      hasMore: false,
      nextSince: null,
    }));

    const service = createNotificationsService({
      fetchNotifications,
    });

    await service.getNotifications({ ownerPubkey: OWNER_PUBKEY, limit: 10, since: 0 });
    await service.getNotifications({ ownerPubkey: OWNER_PUBKEY, limit: 10, since: 0 });

    expect(fetchNotifications).toHaveBeenCalledTimes(2);
  });

  it('uses an injected relay query executor for list lookups', async () => {
    const id = '1'.repeat(64);
    const query = vi.fn(async <TEvent>() => [
      makeEvent({ id, createdAt: 40 }) as TEvent,
    ]);
    const pool = { querySync: vi.fn(async () => []) } as unknown as SimplePool;

    const service = createNotificationsService({
      pool,
      bootstrapRelays: ['wss://bootstrap.one'],
      relayQueryExecutor: { query } as RelayQueryExecutor,
    });

    const result = await service.getNotifications({
      ownerPubkey: OWNER_PUBKEY,
      limit: 10,
      since: 0,
    });

    expect(result.items.map((item) => item.id)).toEqual([id]);
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      relays: ['wss://bootstrap.one'],
      filter: expect.objectContaining({
        '#p': [OWNER_PUBKEY],
        kinds: expect.arrayContaining([1, 6, 7, 16, 9735]),
      }),
    }));
    expect(pool.querySync).not.toHaveBeenCalled();
  });

  it('sorts deterministically, dedupes by id, and computes pagination using limit+1', async () => {
    const idA = '1'.repeat(64);
    const idB = '2'.repeat(64);
    const idC = '3'.repeat(64);
    const querySyncSpy = vi.fn<SimplePool['querySync']>(async () => [
      makeEvent({ id: idB, createdAt: 40 }),
      makeEvent({ id: idC, createdAt: 50 }),
      makeEvent({ id: idA, createdAt: 40 }),
      makeEvent({ id: idB, createdAt: 40 }),
    ]);

    const pool = {
      querySync: querySyncSpy,
    } as unknown as SimplePool;

    const service = createNotificationsService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getNotifications({
      ownerPubkey: OWNER_PUBKEY,
      limit: 2,
      since: 0,
    });

    const firstListCall = querySyncSpy.mock.calls[0];
    expect(firstListCall).toBeDefined();
    const listFilter = firstListCall?.[1] as Record<string, unknown> | undefined;

    expect(result.items.map((item) => item.id)).toEqual([idC, idA]);
    expect(result.hasMore).toBe(true);
    expect(result.nextSince).toBe(39);
    expect(listFilter?.until).toBeUndefined();
  });

  it('returns hasMore false and nextSince null when page size does not exceed limit', async () => {
    const querySyncSpy = vi.fn<SimplePool['querySync']>(async () => [
      makeEvent({ id: '4'.repeat(64), createdAt: 30 }),
      makeEvent({ id: '5'.repeat(64), createdAt: 20 }),
    ]);

    const pool = {
      querySync: querySyncSpy,
    } as unknown as SimplePool;

    const service = createNotificationsService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getNotifications({
      ownerPubkey: OWNER_PUBKEY,
      limit: 2,
      since: 55,
    });

    const firstListCall = querySyncSpy.mock.calls[0];
    expect(firstListCall).toBeDefined();
    const listFilter = firstListCall?.[1] as Record<string, unknown> | undefined;

    expect(result.hasMore).toBe(false);
    expect(result.nextSince).toBeNull();
    expect(listFilter?.until).toBe(55);
  });

  it('includes repost kind 16 in the notifications relay filter', async () => {
    const querySyncSpy = vi.fn<SimplePool['querySync']>(async () => [
      makeEvent({ id: '6'.repeat(64), createdAt: 30, kind: 16 }),
    ]);

    const pool = {
      querySync: querySyncSpy,
    } as unknown as SimplePool;

    const service = createNotificationsService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getNotifications({
      ownerPubkey: OWNER_PUBKEY,
      limit: 10,
      since: 0,
    });

    const firstListCall = querySyncSpy.mock.calls[0];
    expect(firstListCall).toBeDefined();
    const listFilter = firstListCall?.[1] as Record<string, unknown> | undefined;

    expect(result.items[0]).toMatchObject({ kind: 16 });
    expect(listFilter?.kinds).toEqual(expect.arrayContaining([1, 6, 7, 16, 9735]));
  });

  it('sanitizes malformed relay tag values before building notification DTOs', async () => {
    const id = '7'.repeat(64);
    const querySyncSpy = vi.fn<SimplePool['querySync']>(async () => [
      {
        ...makeEvent({ id, createdAt: 30, kind: 16 }),
        tags: [
          ['p', OWNER_PUBKEY],
          ['e', 'nevent1invalid'],
          ['p', 'not-a-pubkey'],
          ['k', 1],
          ['a', null],
        ],
      },
    ] as unknown as Awaited<ReturnType<SimplePool['querySync']>>);

    const pool = {
      querySync: querySyncSpy,
    } as unknown as SimplePool;

    const service = createNotificationsService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getNotifications({
      ownerPubkey: OWNER_PUBKEY,
      limit: 10,
      since: 0,
    });

    expect(result.items[0]).toMatchObject({
      id,
      kind: 16,
      targetEventId: null,
      targetPubkey: OWNER_PUBKEY,
    });
    expect(result.items[0]?.rawEvent.tags).toEqual([
      ['p', OWNER_PUBKEY],
      ['e', 'nevent1invalid'],
      ['p', 'not-a-pubkey'],
      ['k'],
      ['a'],
    ]);
  });
});

describe('notifications service stream behavior', () => {
  it('evicts the oldest seen notification ids after the cap is reached', async () => {
    const oldestId = '1'.repeat(64);
    const firstBatch = [
      makeItem({ id: oldestId, createdAt: 10_000 }),
      ...Array.from({ length: 5_000 }, (_, index) =>
        makeItem({
          id: (index + 2).toString(16).padStart(64, '0'),
          createdAt: 9_999 - index,
        }))
      ,
    ];
    const streamQueryMock = vi
      .fn<RelayGateway<NotificationsStreamQuery, NotificationItemDto[]>['query']>()
      .mockImplementationOnce(async () => firstBatch)
      .mockImplementationOnce(async () => [makeItem({ id: oldestId, createdAt: 10_001 })]);

    const listGateway: RelayGateway<NotificationsQuery, NotificationsResponseDto> = {
      query: vi.fn(async () => ({
        items: [],
        hasMore: false,
        nextSince: null,
      })),
      clearCache: vi.fn(),
    };

    const streamGateway: RelayGateway<NotificationsStreamQuery, NotificationItemDto[]> = {
      query: streamQueryMock,
      clearCache: vi.fn(),
    };

    const service = createNotificationsService({
      listGateway,
      streamGateway,
    });

    const collected: string[] = [];
    const abortController = new AbortController();

    for await (const item of service.streamNotifications(
      { ownerPubkey: OWNER_PUBKEY, since: 0 },
      abortController.signal,
    )) {
      collected.push(item.id);
      if (collected.length === 5_002) {
        abortController.abort();
      }
    }

    expect(collected[0]).toBe(oldestId);
    expect(collected.at(-1)).toBe(oldestId);
    expect(streamQueryMock).toHaveBeenCalledTimes(2);
  });

  it('dedupes events by id across polls and forwards abort signal to gateway', async () => {
    const streamQueryMock = vi
      .fn<RelayGateway<NotificationsStreamQuery, NotificationItemDto[]>['query']>()
      .mockImplementationOnce(async () => [
        makeItem({ id: '6'.repeat(64), createdAt: 100 }),
        makeItem({ id: '6'.repeat(64), createdAt: 100 }),
        makeItem({ id: '7'.repeat(64), createdAt: 99 }),
      ])
      .mockImplementationOnce(async () => [
        makeItem({ id: '9'.repeat(64), createdAt: 100 }),
        makeItem({ id: '7'.repeat(64), createdAt: 99 }),
        makeItem({ id: '8'.repeat(64), createdAt: 98 }),
      ]);

    const listGateway: RelayGateway<NotificationsQuery, NotificationsResponseDto> = {
      query: vi.fn(async () => ({
        items: [],
        hasMore: false,
        nextSince: null,
      })),
      clearCache: vi.fn(),
    };

    const streamGateway: RelayGateway<NotificationsStreamQuery, NotificationItemDto[]> = {
      query: streamQueryMock,
      clearCache: vi.fn(),
    };

    const service = createNotificationsService({
      listGateway,
      streamGateway,
    });

    const collected: string[] = [];
    const abortController = new AbortController();

    for await (const item of service.streamNotifications(
      { ownerPubkey: OWNER_PUBKEY, since: 0 },
      abortController.signal,
    )) {
      collected.push(item.id);
      if (collected.length === 4) {
        abortController.abort();
      }
    }

    expect(collected).toEqual(['6'.repeat(64), '7'.repeat(64), '9'.repeat(64), '8'.repeat(64)]);
    expect(streamQueryMock).toHaveBeenCalledTimes(2);
    expect(streamQueryMock.mock.calls[0]?.[0]).toMatchObject({
      signal: abortController.signal,
      bypassCache: true,
    });
  });

  it('exits immediately without polling when signal is already aborted', async () => {
    const streamGateway: RelayGateway<NotificationsStreamQuery, NotificationItemDto[]> = {
      query: vi.fn(async () => []),
      clearCache: vi.fn(),
    };

    const listGateway: RelayGateway<NotificationsQuery, NotificationsResponseDto> = {
      query: vi.fn(async () => ({
        items: [],
        hasMore: false,
        nextSince: null,
      })),
      clearCache: vi.fn(),
    };

    const service = createNotificationsService({
      listGateway,
      streamGateway,
    });

    const abortController = new AbortController();
    abortController.abort();

    const emitted: NotificationItemDto[] = [];
    for await (const item of service.streamNotifications(
      { ownerPubkey: OWNER_PUBKEY, since: 0 },
      abortController.signal,
    )) {
      emitted.push(item);
    }

    expect(emitted).toEqual([]);
    expect(streamGateway.query).not.toHaveBeenCalled();
  });
});
