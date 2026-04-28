// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  InMemoryAuthReplayStore,
  RedisAuthReplayStore,
  connectRedisAuthReplayClient,
  resolveAuthReplayStoreMode,
  type RedisAuthReplayClient,
} from './auth-replay-store';

describe('auth replay store mode', () => {
  it('uses memory outside production', () => {
    expect(resolveAuthReplayStoreMode({ NODE_ENV: 'test' })).toBe('memory');
  });

  it('uses Redis when rate limiting already selected Redis', () => {
    expect(resolveAuthReplayStoreMode({
      NODE_ENV: 'production',
      BFF_RATE_LIMIT_STORE: 'redis',
    })).toBe('redis');
  });

  it('fails closed in production without Redis replay protection', () => {
    expect(() => resolveAuthReplayStoreMode({ NODE_ENV: 'production' })).toThrow(
      'BFF_AUTH_REPLAY_STORE',
    );
  });
});

describe('in-memory auth replay store', () => {
  it('consumes a proof once and then reports replay', async () => {
    const store = new InMemoryAuthReplayStore({ nowSeconds: () => 1_000 });

    await expect(store.consume({
      pubkey: 'a'.repeat(64),
      eventId: 'b'.repeat(64),
      ttlSeconds: 120,
    })).resolves.toBe('consumed');

    await expect(store.consume({
      pubkey: 'a'.repeat(64),
      eventId: 'b'.repeat(64),
      ttlSeconds: 120,
    })).resolves.toBe('replayed');
  });
});

describe('Redis auth replay store', () => {
  it('uses SET NX EX with a hashed replay key', async () => {
    const calls: Array<{ key: string; value: string; options: unknown }> = [];
    const client: RedisAuthReplayClient = {
      set: async (key, value, options) => {
        calls.push({ key, value, options });
        return 'OK';
      },
      ping: async () => 'PONG',
      quit: async () => undefined,
    };
    const store = new RedisAuthReplayStore(client, {
      keyPrefix: 'nostr-city:test:bff:auth-replay:v1:',
      keyHashSecret: 'x'.repeat(32),
    });

    await expect(store.consume({
      pubkey: 'a'.repeat(64),
      eventId: 'b'.repeat(64),
      ttlSeconds: 120,
    })).resolves.toBe('consumed');

    expect(calls).toEqual([
      {
        key: expect.stringMatching(/^nostr-city:test:bff:auth-replay:v1:[a-f0-9]{64}$/),
        value: '1',
        options: {
          condition: 'NX',
          expiration: { type: 'EX', value: 120 },
        },
      },
    ]);
    expect(calls[0]?.key).not.toContain('a'.repeat(64));
    expect(calls[0]?.key).not.toContain('b'.repeat(64));
  });

  it('reports replay when Redis SET NX returns null', async () => {
    const client: RedisAuthReplayClient = {
      set: async () => null,
      ping: async () => 'PONG',
      quit: async () => undefined,
    };
    const store = new RedisAuthReplayStore(client, {
      keyPrefix: 'nostr-city:test:bff:auth-replay:v1:',
      keyHashSecret: 'x'.repeat(32),
    });

    await expect(store.consume({
      pubkey: 'a'.repeat(64),
      eventId: 'b'.repeat(64),
      ttlSeconds: 120,
    })).resolves.toBe('replayed');
  });

  it('wraps Redis failures so callers can fail closed', async () => {
    const client: RedisAuthReplayClient = {
      set: async () => {
        throw new Error('redis unavailable');
      },
      ping: async () => 'PONG',
      quit: async () => undefined,
    };
    const store = new RedisAuthReplayStore(client, {
      keyPrefix: 'nostr-city:test:bff:auth-replay:v1:',
      keyHashSecret: 'x'.repeat(32),
    });

    await expect(store.consume({
      pubkey: 'a'.repeat(64),
      eventId: 'b'.repeat(64),
      ttlSeconds: 120,
    })).rejects.toThrow('Redis auth replay store failed');
  });

  it('times out pending Redis replay checks so callers can fail closed', async () => {
    const client: RedisAuthReplayClient = {
      set: async () => new Promise((resolve) => {
        setTimeout(() => resolve('OK'), 50);
      }),
      ping: async () => 'PONG',
      quit: async () => undefined,
    };
    const store = new RedisAuthReplayStore(client, {
      commandTimeoutMs: 1,
      keyPrefix: 'nostr-city:test:bff:auth-replay:v1:',
      keyHashSecret: 'x'.repeat(32),
    });

    await expect(store.consume({
      pubkey: 'a'.repeat(64),
      eventId: 'b'.repeat(64),
      ttlSeconds: 120,
    })).rejects.toThrow('Redis auth replay store failed');
  });

  it('times out Redis startup health checks', async () => {
    const client = {
      connect: async () => new Promise((resolve) => {
        setTimeout(resolve, 50);
      }),
      set: async () => 'OK' as const,
      ping: async () => 'PONG',
      quit: async () => undefined,
    };

    await expect(connectRedisAuthReplayClient(client, 1)).rejects.toThrow(
      'Redis auth replay store failed',
    );
  });
});
