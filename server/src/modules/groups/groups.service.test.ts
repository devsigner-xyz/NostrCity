// @vitest-environment node

import type { SimplePool } from 'nostr-tools';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { describe, expect, it, vi } from 'vitest';

import { createGroupsService } from './groups.service';

const SELF_SECRET_KEY = new Uint8Array(32).fill(12);
const OTHER_SECRET_KEY = new Uint8Array(32).fill(13);
const SELF_PUBKEY = getPublicKey(SELF_SECRET_KEY);

function signedGroupMetadata(input: {
  groupId: string;
  name?: string;
  about?: string;
  picture?: string;
  flags?: string[];
  createdAt?: number;
  secretKey?: Uint8Array;
}) {
  const tags = [['d', input.groupId]];
  if (input.name) {
    tags.push(['name', input.name]);
  }
  if (input.about) {
    tags.push(['about', input.about]);
  }
  if (input.picture) {
    tags.push(['picture', input.picture]);
  }
  for (const flag of input.flags ?? []) {
    tags.push([flag]);
  }

  return finalizeEvent({
    kind: 39000,
    created_at: input.createdAt ?? 100,
    content: '',
    tags,
  }, input.secretKey ?? SELF_SECRET_KEY);
}

describe('groups service', () => {
  it('rejects invalid relay URLs before querying relays', async () => {
    const querySync = vi.fn(async () => []);
    const service = createGroupsService({
      pool: { querySync } as unknown as SimplePool,
      fetchRelayInfo: vi.fn(async () => ({ self: SELF_PUBKEY })),
    });

    await expect(service.getRelayGroups({ relay: 'https://not-a-nostr-relay' })).rejects.toThrow('Invalid group relay');
    expect(querySync).not.toHaveBeenCalled();
  });

  it('returns only metadata signed by NIP-11 self when self is valid', async () => {
    const spoofed = signedGroupMetadata({ groupId: 'spoofed', secretKey: OTHER_SECRET_KEY });
    const trusted = signedGroupMetadata({
      groupId: 'maps',
      name: 'Map makers',
      about: 'Cities and transit.',
      picture: 'https://example.test/map.png',
      flags: ['restricted'],
    });
    const querySync = vi.fn(async () => [spoofed, trusted]);
    const service = createGroupsService({
      pool: { querySync } as unknown as SimplePool,
      fetchRelayInfo: vi.fn(async () => ({ self: SELF_PUBKEY })),
    });

    await expect(service.getRelayGroups({ relay: 'wss://groups.example' })).resolves.toEqual({
      relay: 'wss://groups.example',
      verifiedRelaySelf: true,
      groups: [
        {
          relay: 'wss://groups.example',
          id: 'maps',
          name: 'Map makers',
          description: 'Cities and transit.',
          picture: 'https://example.test/map.png',
          private: false,
          restricted: true,
          hidden: false,
          closed: false,
          metadataVerified: true,
        },
      ],
    });
    expect(querySync).toHaveBeenCalledWith(['wss://groups.example'], { kinds: [39000], authors: [SELF_PUBKEY] });
  });

  it('returns signed metadata as unverified when NIP-11 self is missing', async () => {
    const querySync = vi.fn(async () => [
      signedGroupMetadata({ groupId: 'maps', name: 'Maps', flags: ['private', 'hidden'] }),
    ]);
    const service = createGroupsService({
      pool: { querySync } as unknown as SimplePool,
      fetchRelayInfo: vi.fn(async () => ({})),
    });

    await expect(service.getRelayGroups({ relay: 'wss://groups.example/' })).resolves.toEqual({
      relay: 'wss://groups.example',
      verifiedRelaySelf: false,
      groups: [
        {
          relay: 'wss://groups.example',
          id: 'maps',
          name: 'Maps',
          private: true,
          restricted: false,
          hidden: true,
          closed: false,
          metadataVerified: false,
        },
      ],
    });
    expect(querySync).toHaveBeenCalledWith(['wss://groups.example'], { kinds: [39000] });
  });

  it('dedupes groups by id and caches public relay results', async () => {
    const first = signedGroupMetadata({ groupId: 'maps', name: 'Old maps' });
    const newest = signedGroupMetadata({ groupId: 'maps', name: 'New maps', createdAt: 200 });
    const querySync = vi.fn(async () => [first, newest]);
    const service = createGroupsService({
      pool: { querySync } as unknown as SimplePool,
      fetchRelayInfo: vi.fn(async () => ({ self: SELF_PUBKEY })),
    });

    const firstResult = await service.getRelayGroups({ relay: 'wss://groups.example' });
    const secondResult = await service.getRelayGroups({ relay: 'wss://groups.example' });

    expect(firstResult.groups).toHaveLength(1);
    expect(firstResult.groups[0]?.name).toBe('New maps');
    expect(secondResult).toEqual(firstResult);
    expect(querySync).toHaveBeenCalledTimes(1);
  });
});
