// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPublicKey } from 'nostr-tools';

import { buildApp } from '../../app';
import type { UsersService } from './users.service';

const HOST = 'api.local.test';
const OWNER_SECRET_KEY = Uint8Array.from(Array.from({ length: 32 }, () => 0x11));
const OWNER_PUBKEY = getPublicKey(OWNER_SECRET_KEY);
const FOUND_PUBKEY = 'a'.repeat(64);
const OTHER_FOUND_PUBKEY = 'b'.repeat(64);

describe('users routes', () => {
  const usersService: UsersService = {
    searchUsers: async () => ({
      pubkeys: [FOUND_PUBKEY, OTHER_FOUND_PUBKEY],
      profiles: {
        [FOUND_PUBKEY]: {
          pubkey: FOUND_PUBKEY,
          createdAt: 1_719_000_100,
          name: 'alice',
          displayName: 'Alice',
          about: 'nostr mapper',
          nip05: 'alice@example.com',
          picture: 'https://example.com/alice.png',
          banner: 'https://example.com/alice-banner.png',
          lud16: 'alice@getalby.com',
        },
        [OTHER_FOUND_PUBKEY]: {
          pubkey: OTHER_FOUND_PUBKEY,
          createdAt: 1_719_000_000,
          name: 'bob',
        },
      },
    }),
  };
  const app = buildApp({ usersService });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns user search response contract for a valid query', async () => {
    const url = `/v1/users/search?ownerPubkey=${OWNER_PUBKEY}&q=alice&limit=20`;
    const response = await app.inject({
      method: 'GET',
      url,
      headers: {
        host: HOST,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      pubkeys: [FOUND_PUBKEY, OTHER_FOUND_PUBKEY],
      profiles: {
        [FOUND_PUBKEY]: {
          pubkey: FOUND_PUBKEY,
          createdAt: 1_719_000_100,
          name: 'alice',
          displayName: 'Alice',
          about: 'nostr mapper',
          nip05: 'alice@example.com',
          picture: 'https://example.com/alice.png',
          banner: 'https://example.com/alice-banner.png',
          lud16: 'alice@getalby.com',
        },
        [OTHER_FOUND_PUBKEY]: {
          pubkey: OTHER_FOUND_PUBKEY,
          createdAt: 1_719_000_000,
          name: 'bob',
        },
      },
    });
  });

  it('accepts repeated searchRelays query params', async () => {
    const url = `/v1/users/search?ownerPubkey=${OWNER_PUBKEY}&q=alice&limit=20&searchRelays=wss%3A%2F%2Fsearch.nos.today&searchRelays=wss%3A%2F%2Frelay.noswhere.com`;
    const response = await app.inject({
      method: 'GET',
      url,
      headers: {
        host: HOST,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('returns 400 when searchRelays uses ws scheme', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/users/search?ownerPubkey=${OWNER_PUBKEY}&q=alice&limit=20&searchRelays=${encodeURIComponent('ws://relay.example')}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when query is missing q', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/users/search?ownerPubkey=${OWNER_PUBKEY}&limit=20`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when query is missing ownerPubkey', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/users/search?q=alice&limit=20',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when query has invalid limit', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/users/search?ownerPubkey=${OWNER_PUBKEY}&q=alice&limit=0`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when query q is only whitespace', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/users/search?ownerPubkey=${OWNER_PUBKEY}&q=%20%20%20&limit=20`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });
});
