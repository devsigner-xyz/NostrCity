// @vitest-environment node

import type { SimplePool } from 'nostr-tools';
import { describe, expect, it, vi } from 'vitest';

import { createDmService } from './dm.service';

const OWNER_PUBKEY = 'a'.repeat(64);
const PEER_PUBKEY = 'b'.repeat(64);
const OTHER_PUBKEY = 'c'.repeat(64);

const makeEvent = (event: {
  id: string;
  pubkey: string;
  kind: number;
  createdAt: number;
  tags: string[][];
}) => ({
  id: event.id,
  pubkey: event.pubkey,
  kind: event.kind,
  created_at: event.createdAt,
  tags: event.tags,
  content: 'ciphertext',
});

describe('dm service filtering behavior', () => {
  it('re-fetches inbox events for repeated identical queries', async () => {
    const fetchInboxEvents = vi.fn(async () => ({
      items: [],
      hasMore: false,
      nextSince: null,
    }));

    const service = createDmService({
      fetchInboxEvents,
    });

    await service.getInboxEvents({ ownerPubkey: OWNER_PUBKEY, limit: 10, since: 0 });
    await service.getInboxEvents({ ownerPubkey: OWNER_PUBKEY, limit: 10, since: 0 });

    expect(fetchInboxEvents).toHaveBeenCalledTimes(2);
  });

  it('keeps only allowed DM kinds in inbox and only owner-participant events', async () => {
    const ownerToPeerId = '1'.repeat(64);
    const peerToOwnerId = '2'.repeat(64);

    const querySyncSpy = vi
      .fn()
      .mockImplementationOnce(async () => [
        makeEvent({
          id: ownerToPeerId,
          pubkey: OWNER_PUBKEY,
          kind: 1059,
          createdAt: 200,
          tags: [['p', PEER_PUBKEY]],
        }),
        makeEvent({
          id: '3'.repeat(64),
          pubkey: OWNER_PUBKEY,
          kind: 1,
          createdAt: 198,
          tags: [['p', PEER_PUBKEY]],
        }),
      ])
      .mockImplementationOnce(async () => [
        makeEvent({
          id: peerToOwnerId,
          pubkey: PEER_PUBKEY,
          kind: 4,
          createdAt: 199,
          tags: [['p', OWNER_PUBKEY]],
        }),
        makeEvent({
          id: '4'.repeat(64),
          pubkey: OTHER_PUBKEY,
          kind: 1059,
          createdAt: 197,
          tags: [['p', OTHER_PUBKEY]],
        }),
        makeEvent({
          id: peerToOwnerId,
          pubkey: PEER_PUBKEY,
          kind: 4,
          createdAt: 199,
          tags: [['p', OWNER_PUBKEY]],
        }),
      ]);

    const pool = {
      querySync: querySyncSpy,
    } as unknown as SimplePool;

    const service = createDmService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getInboxEvents({
      ownerPubkey: OWNER_PUBKEY,
      limit: 10,
      since: 200,
    });

    const authorFilter = querySyncSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    const pTagFilter = querySyncSpy.mock.calls[1]?.[1] as Record<string, unknown>;

    expect(authorFilter.kinds).toEqual([1059, 4]);
    expect(authorFilter.until).toBe(200);
    expect(pTagFilter.kinds).toEqual([1059, 4]);
    expect(pTagFilter.until).toBe(200);

    expect(result.items.map((item) => item.id)).toEqual([ownerToPeerId, peerToOwnerId]);
    expect(result.items.map((item) => item.kind)).toEqual([1059, 4]);
    expect(result.hasMore).toBe(false);
    expect(result.nextSince).toBeNull();
  });

  it('filters conversation to owner-peer events in both directions', async () => {
    const ownerToPeerId = '5'.repeat(64);
    const peerToOwnerId = '6'.repeat(64);

    const querySyncSpy = vi
      .fn()
      .mockImplementationOnce(async () => [
        makeEvent({
          id: ownerToPeerId,
          pubkey: OWNER_PUBKEY,
          kind: 1059,
          createdAt: 210,
          tags: [['p', PEER_PUBKEY]],
        }),
        makeEvent({
          id: '7'.repeat(64),
          pubkey: OWNER_PUBKEY,
          kind: 1059,
          createdAt: 205,
          tags: [['p', OTHER_PUBKEY]],
        }),
      ])
      .mockImplementationOnce(async () => [
        makeEvent({
          id: peerToOwnerId,
          pubkey: PEER_PUBKEY,
          kind: 4,
          createdAt: 209,
          tags: [['p', OWNER_PUBKEY]],
        }),
        makeEvent({
          id: '8'.repeat(64),
          pubkey: PEER_PUBKEY,
          kind: 1,
          createdAt: 208,
          tags: [['p', OWNER_PUBKEY]],
        }),
        makeEvent({
          id: '9'.repeat(64),
          pubkey: OTHER_PUBKEY,
          kind: 1059,
          createdAt: 207,
          tags: [['p', OWNER_PUBKEY]],
        }),
      ]);

    const pool = {
      querySync: querySyncSpy,
    } as unknown as SimplePool;

    const service = createDmService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getConversationEvents({
      ownerPubkey: OWNER_PUBKEY,
      peerPubkey: PEER_PUBKEY,
      limit: 1,
      since: 300,
    });

    const ownerFilter = querySyncSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    const peerFilter = querySyncSpy.mock.calls[1]?.[1] as Record<string, unknown>;

    expect(ownerFilter.kinds).toEqual([1059, 4]);
    expect(ownerFilter.until).toBe(300);
    expect(peerFilter.kinds).toEqual([1059, 4]);
    expect(peerFilter.until).toBe(300);

    expect(result.items.map((item) => item.id)).toEqual([ownerToPeerId]);
    expect(result.hasMore).toBe(true);
    expect(result.nextSince).toBe(209);
  });
});
