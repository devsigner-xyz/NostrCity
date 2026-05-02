// @vitest-environment node

import type { SimplePool } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { describe, expect, it, vi } from 'vitest';

import type { RelayGateway } from '../../relay/relay-gateway.types';
import type { RelayQueryExecutor } from '../../relay/relay-query-executor';
import type { UsersSearchQuery, UsersSearchResponseDto } from './users.schemas';
import { createUsersService } from './users.service';
import { DEFAULT_SEARCH_RELAYS } from './search-relay-defaults';

const OWNER_A = 'a'.repeat(64);
const OWNER_B = 'b'.repeat(64);
const EXACT_PUBKEY = 'c'.repeat(64);
const TEXT_PUBKEY_A = 'd'.repeat(64);
const TEXT_PUBKEY_B = 'e'.repeat(64);

const makeMetadataEvent = ({
  id,
  pubkey,
  createdAt,
  content,
}: {
  id: string;
  pubkey: string;
  createdAt: number;
  content: string;
}) => ({
  id,
  pubkey,
  sig: 'f'.repeat(128),
  kind: 0,
  created_at: createdAt,
  tags: [],
  content,
});

describe('users service', () => {
  it('uses an injected relay query executor for user search lookups', async () => {
    const query = vi.fn(async <TEvent>() => [
      makeMetadataEvent({
        id: '1'.repeat(64),
        pubkey: TEXT_PUBKEY_A,
        createdAt: 120,
        content: JSON.stringify({ name: 'alice' }),
      }) as TEvent,
    ]);
    const pool = { querySync: vi.fn(async () => []) } as unknown as SimplePool;

    const service = createUsersService({
      pool,
      bootstrapRelays: ['wss://bootstrap.one'],
      relayQueryExecutor: { query } as RelayQueryExecutor,
    });

    const result = await service.searchUsers({
      ownerPubkey: OWNER_A,
      q: 'alice',
      limit: 5,
      searchRelays: ['wss://search.nos.today'],
    });

    expect(result.pubkeys).toEqual([TEXT_PUBKEY_A]);
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      relays: ['wss://search.nos.today'],
      filter: expect.objectContaining({
        kinds: [0],
        search: 'alice',
      }),
    }));
    expect(pool.querySync).not.toHaveBeenCalled();
  });

  it('includes exact npub match even when no metadata is found', async () => {
    const querySyncSpy = vi.fn<SimplePool['querySync']>(async () => []);
    const pool = {
      querySync: querySyncSpy,
    } as unknown as SimplePool;

    const service = createUsersService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const npub = nip19.npubEncode(EXACT_PUBKEY);
    const result = await service.searchUsers({
      ownerPubkey: OWNER_A,
      q: npub,
      limit: 5,
    });

    expect(result.pubkeys).toEqual([EXACT_PUBKEY]);
    expect(result.profiles[EXACT_PUBKEY]).toEqual({
      pubkey: EXACT_PUBKEY,
      createdAt: 0,
    });

    const exactFilter = querySyncSpy.mock.calls
      .map((call) => call[1] as Record<string, unknown> | undefined)
      .find((candidate) => Array.isArray(candidate?.authors));
    expect(exactFilter?.authors).toEqual([EXACT_PUBKEY]);
  });

  it('uses normalized query text for relay search filter', async () => {
    const querySyncSpy = vi.fn<SimplePool['querySync']>(async () => []);
    const pool = {
      querySync: querySyncSpy,
    } as unknown as SimplePool;

    const service = createUsersService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    await service.searchUsers({
      ownerPubkey: OWNER_A,
      q: '  Alice  ',
      limit: 5,
    });

    const firstSearchCall = querySyncSpy.mock.calls[0];
    expect(firstSearchCall).toBeDefined();
    const searchFilter = firstSearchCall?.[1] as Record<string, unknown> | undefined;
    expect(searchFilter?.search).toBe('alice');
    expect(firstSearchCall?.[0]).toEqual([...DEFAULT_SEARCH_RELAYS]);
  });

  it('uses dedicated search relays for text search when provided', async () => {
    const querySyncSpy = vi.fn<SimplePool['querySync']>(async () => []);
    const pool = {
      querySync: querySyncSpy,
    } as unknown as SimplePool;

    const service = createUsersService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    await service.searchUsers({
      ownerPubkey: OWNER_A,
      q: 'alice',
      limit: 5,
      searchRelays: ['wss://search.nos.today', 'wss://relay.noswhere.com'],
    });

    expect(querySyncSpy.mock.calls[0]?.[0]).toEqual([
      'wss://search.nos.today',
      'wss://relay.noswhere.com',
    ]);
  });

  it('falls back to curated defaults when no search relays are provided', async () => {
    const querySyncSpy = vi.fn<SimplePool['querySync']>(async () => []);
    const pool = {
      querySync: querySyncSpy,
    } as unknown as SimplePool;

    const service = createUsersService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    await service.searchUsers({
      ownerPubkey: OWNER_A,
      q: 'alice',
      limit: 5,
    });

    expect(querySyncSpy.mock.calls[0]?.[0]).toEqual([...DEFAULT_SEARCH_RELAYS]);
  });

  it('normalizes, deduplicates, and caps incoming search relays', async () => {
    const querySyncSpy = vi.fn<SimplePool['querySync']>(async () => []);
    const pool = {
      querySync: querySyncSpy,
    } as unknown as SimplePool;

    const service = createUsersService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    await service.searchUsers({
      ownerPubkey: OWNER_A,
      q: 'alice',
      limit: 5,
      searchRelays: [
        'wss://search.nos.today/',
        'wss://search.nos.today',
        'ws://search.nos.today',
        'https://invalid.example',
        'wss://localhost',
        'wss://192.168.1.5',
        'wss://user:pass@relay.example',
        'wss://relay.noswhere.com',
        'wss://filter.nostr.wine',
        'wss://extra-1.example',
        'wss://extra-2.example',
        'wss://extra-3.example',
        'wss://extra-4.example',
        'wss://extra-5.example',
        'wss://extra-6.example',
        'wss://extra-7.example',
      ],
    });

    expect(querySyncSpy.mock.calls[0]?.[0]).toEqual([
      'wss://search.nos.today',
      'wss://relay.noswhere.com',
      'wss://filter.nostr.wine',
      'wss://extra-1.example',
      'wss://extra-2.example',
      'wss://extra-3.example',
      'wss://extra-4.example',
      'wss://extra-5.example',
      'wss://extra-6.example',
      'wss://extra-7.example',
    ]);
  });

  it('falls back to curated defaults when provided search relays normalize to zero valid entries', async () => {
    const querySyncSpy = vi.fn<SimplePool['querySync']>(async () => []);
    const pool = {
      querySync: querySyncSpy,
    } as unknown as SimplePool;

    const service = createUsersService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    await service.searchUsers({
      ownerPubkey: OWNER_A,
      q: 'alice',
      limit: 5,
      searchRelays: ['https://invalid.example', 'ws://relay.example', 'wss://localhost'],
    });

    expect(querySyncSpy.mock.calls[0]?.[0]).toEqual([...DEFAULT_SEARCH_RELAYS]);
  });

  it('keeps exact matches first and ranks text matches by recency', async () => {
    const querySyncSpy = vi
      .fn<SimplePool['querySync']>()
      .mockImplementationOnce(async () => [
        makeMetadataEvent({
          id: '1'.repeat(64),
          pubkey: EXACT_PUBKEY,
          createdAt: 50,
          content: JSON.stringify({ name: 'exact-user' }),
        }),
      ])
      .mockImplementationOnce(async () => [
        makeMetadataEvent({
          id: '2'.repeat(64),
          pubkey: TEXT_PUBKEY_A,
          createdAt: 120,
          content: JSON.stringify({ name: 'alice high', about: EXACT_PUBKEY }),
        }),
        makeMetadataEvent({
          id: '3'.repeat(64),
          pubkey: TEXT_PUBKEY_B,
          createdAt: 100,
          content: JSON.stringify({ display_name: 'Alice low', about: EXACT_PUBKEY }),
        }),
      ]);

    const pool = {
      querySync: querySyncSpy,
    } as unknown as SimplePool;

    const service = createUsersService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.searchUsers({
      ownerPubkey: OWNER_A,
      q: EXACT_PUBKEY,
      limit: 3,
    });

    expect(result.pubkeys).toEqual([EXACT_PUBKEY, TEXT_PUBKEY_A, TEXT_PUBKEY_B]);
    expect(result.profiles[EXACT_PUBKEY]?.name).toBe('exact-user');
    expect(result.profiles[TEXT_PUBKEY_A]?.name).toBe('alice high');
    expect(result.profiles[TEXT_PUBKEY_B]?.displayName).toBe('Alice low');
  });

  it('builds cache key with owner pubkey scope', async () => {
    const usersGatewayQuery = vi.fn<RelayGateway<UsersSearchQuery, UsersSearchResponseDto>['query']>(
      async () => ({
        pubkeys: [],
        profiles: {},
      }),
    );

    const service = createUsersService({
      usersGateway: {
        query: usersGatewayQuery,
        clearCache: vi.fn(),
      },
    });

    await service.searchUsers({
      ownerPubkey: OWNER_A,
      q: 'alice',
      limit: 5,
    });

    await service.searchUsers({
      ownerPubkey: OWNER_B,
      q: 'alice',
      limit: 5,
    });

    expect(usersGatewayQuery).toHaveBeenCalledTimes(2);
    expect(usersGatewayQuery.mock.calls[0]?.[0].key).not.toBe(usersGatewayQuery.mock.calls[1]?.[0].key);
  });

  it('builds distinct cache keys for different search relay sets', async () => {
    const usersGatewayQuery = vi.fn<RelayGateway<UsersSearchQuery, UsersSearchResponseDto>['query']>(
      async () => ({
        pubkeys: [],
        profiles: {},
      }),
    );

    const service = createUsersService({
      usersGateway: {
        query: usersGatewayQuery,
        clearCache: vi.fn(),
      },
    });

    await service.searchUsers({
      ownerPubkey: OWNER_A,
      q: 'alice',
      limit: 5,
      searchRelays: ['wss://search.nos.today'],
    });

    await service.searchUsers({
      ownerPubkey: OWNER_A,
      q: 'alice',
      limit: 5,
      searchRelays: ['wss://relay.noswhere.com'],
    });

    expect(usersGatewayQuery).toHaveBeenCalledTimes(2);
    expect(usersGatewayQuery.mock.calls[0]?.[0].key).not.toBe(usersGatewayQuery.mock.calls[1]?.[0].key);
  });

  it('truncates oversized profile fields to safe lengths', async () => {
    const veryLong = 'x'.repeat(5_000);
    const querySyncSpy = vi.fn(async () => [
      makeMetadataEvent({
        id: '4'.repeat(64),
        pubkey: TEXT_PUBKEY_A,
        createdAt: 150,
        content: JSON.stringify({
          name: veryLong,
          display_name: veryLong,
          about: veryLong,
          nip05: veryLong,
          picture: veryLong,
          banner: veryLong,
          lud16: veryLong,
        }),
      }),
    ]);

    const pool = {
      querySync: querySyncSpy,
    } as unknown as SimplePool;

    const service = createUsersService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.searchUsers({
      ownerPubkey: OWNER_A,
      q: 'x',
      limit: 5,
    });

    expect(result.pubkeys).toEqual([TEXT_PUBKEY_A]);
    expect(result.profiles[TEXT_PUBKEY_A]?.name?.length).toBe(128);
    expect(result.profiles[TEXT_PUBKEY_A]?.displayName?.length).toBe(128);
    expect(result.profiles[TEXT_PUBKEY_A]?.about?.length).toBe(2_048);
    expect(result.profiles[TEXT_PUBKEY_A]?.nip05?.length).toBe(320);
    expect(result.profiles[TEXT_PUBKEY_A]?.picture?.length).toBe(2_048);
    expect(result.profiles[TEXT_PUBKEY_A]?.banner?.length).toBe(2_048);
    expect(result.profiles[TEXT_PUBKEY_A]?.lud16?.length).toBe(320);
  });
});
