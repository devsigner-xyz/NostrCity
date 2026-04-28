// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { finalizeEvent } from 'nostr-tools';
import { createHash } from 'node:crypto';
import Fastify from 'fastify';

import { buildApp } from '../app';
import type { IdentityService } from '../modules/identity/identity.service';
import type { PublishService } from '../modules/publish/publish.service';
import {
  RedisRateLimitStore,
  connectRedisRateLimitClient,
  rateLimitPlugin,
  registerRedisRateLimitReadinessCheck,
  resolveRedisRateLimitUrl,
  resolveRateLimitStoreMode,
  type RedisRateLimitClient,
} from './rate-limit';
import type { ReadinessChecks } from '../readiness';

const futureReviewDate = (): string => {
  const reviewDate = new Date();
  reviewDate.setUTCDate(reviewDate.getUTCDate() + 30);
  return reviewDate.toISOString().slice(0, 10);
};

const withEnv = async (
  overrides: Record<string, string | undefined>,
  run: () => Promise<void> | void,
): Promise<void> => {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(overrides)) {
    previous.set(key, process.env[key]);
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

describe('rate limit plugin', () => {
  const HOST = 'api.local.test';
  const previousWindow = process.env.BFF_RATE_LIMIT_WINDOW_MS;
  const previousMax = process.env.BFF_RATE_LIMIT_MAX;

  process.env.BFF_RATE_LIMIT_WINDOW_MS = '60000';
  process.env.BFF_RATE_LIMIT_MAX = '2';

  const publishService: PublishService = {
    forward: async () => ({
      ackedRelays: ['wss://relay.damus.io'],
      failedRelays: [],
      timeoutRelays: [],
    }),
  };

  const identityService: IdentityService = {
    verifyNip05Batch: async (input) => ({
      results: input.checks.map((check) => ({
        pubkey: check.pubkey,
        nip05: check.nip05,
        status: 'verified' as const,
        identifier: check.nip05.toLowerCase(),
        displayIdentifier: check.nip05.toLowerCase(),
        resolvedPubkey: check.pubkey,
        checkedAt: 1_719_000_100,
      })),
    }),
    resolveProfiles: async (input) => ({
      profiles: Object.fromEntries(
        input.pubkeys.map((pubkey) => [pubkey, { pubkey, createdAt: 1_719_000_100 }]),
      ),
    }),
  };

  const app = buildApp({ identityService, publishService });

  const payload = {
    event: finalizeEvent(
      {
        kind: 1,
        created_at: 1_719_000_000,
        tags: [],
        content: 'rate-limit-test',
      },
      Uint8Array.from(Array.from({ length: 32 }, () => 0x45)),
    ),
    relayScope: 'social' as const,
    relays: ['wss://relay.damus.io'],
  };

  const buildNostrAuthHeader = (method: string, url: string, bodyPayload?: unknown): string => {
    const normalizedMethod = method.toUpperCase();
    const tags: string[][] = [
      ['u', url],
      ['method', normalizedMethod],
      ['nonce', `nonce-${Math.random().toString(16).slice(2, 12)}`],
    ];

    if (bodyPayload !== undefined && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) {
      const serializedPayload = JSON.stringify(bodyPayload);
      const payloadHash = createHash('sha256').update(serializedPayload).digest('hex');
      tags.push(['payload', payloadHash]);
    }

    const authEvent = finalizeEvent(
      {
        kind: 27_235,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: '',
      },
      Uint8Array.from(Array.from({ length: 32 }, () => 0x45)),
    );

    return `Nostr ${Buffer.from(JSON.stringify(authEvent)).toString('base64')}`;
  };

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();

    if (previousWindow === undefined) {
      delete process.env.BFF_RATE_LIMIT_WINDOW_MS;
    } else {
      process.env.BFF_RATE_LIMIT_WINDOW_MS = previousWindow;
    }

    if (previousMax === undefined) {
      delete process.env.BFF_RATE_LIMIT_MAX;
    } else {
      process.env.BFF_RATE_LIMIT_MAX = previousMax;
    }
  });

  it('returns 429 with retry-after when rate limit is exceeded', async () => {
    const url = '/v1/identity/profiles?pubkeys=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    await app.inject({ method: 'GET', url, remoteAddress: '1.2.3.4' });
    await app.inject({ method: 'GET', url, remoteAddress: '1.2.3.4' });

    const limited = await app.inject({
      method: 'GET',
      url,
      remoteAddress: '1.2.3.4',
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.json()).toMatchObject({
      error: {
        code: 'RATE_LIMITED',
      },
    });
  });

  it('does not rate limit health and readiness checks', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const health = await app.inject({ method: 'GET', url: '/v1/health', remoteAddress: '2.2.2.2' });
      const ready = await app.inject({ method: 'GET', url: '/v1/ready', remoteAddress: '2.2.2.2' });

      expect(health.statusCode).toBe(200);
      expect(ready.statusCode).toBe(200);
    }
  });

  it('uses route-specific rate limit overrides when configured', async () => {
    const url = '/v1/publish/forward';

    const first = await app.inject({
      method: 'POST',
      url,
      remoteAddress: '5.6.7.8',
      payload,
      headers: {
        authorization: buildNostrAuthHeader('POST', `http://${HOST}${url}`, payload),
        host: HOST,
      },
    });
    const second = await app.inject({
      method: 'POST',
      url,
      remoteAddress: '5.6.7.8',
      payload,
      headers: {
        authorization: buildNostrAuthHeader('POST', `http://${HOST}${url}`, payload),
        host: HOST,
      },
    });
    const third = await app.inject({
      method: 'POST',
      url,
      remoteAddress: '5.6.7.8',
      payload,
      headers: {
        authorization: buildNostrAuthHeader('POST', `http://${HOST}${url}`, payload),
        host: HOST,
      },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(200);
  });

  it('uses NIP-05 route-specific rate limit override when configured', async () => {
    const url = '/v1/identity/nip05/verify-batch';
    const requestPayload = {
      ownerPubkey: 'b'.repeat(64),
      checks: [{ pubkey: 'a'.repeat(64), nip05: 'alice@example.com' }],
    };

    const first = await app.inject({
      method: 'POST',
      url,
      remoteAddress: '9.8.7.6',
      payload: requestPayload,
    });
    const second = await app.inject({
      method: 'POST',
      url,
      remoteAddress: '9.8.7.6',
      payload: requestPayload,
    });
    const third = await app.inject({
      method: 'POST',
      url,
      remoteAddress: '9.8.7.6',
      payload: requestPayload,
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(200);
  });

  it('uses forwarded client IP only through bounded trusted proxies', async () => {
    const proxyAwareApp = Fastify({ logger: false, trustProxy: ['127.0.0.1'] });
    proxyAwareApp.register(rateLimitPlugin);
    proxyAwareApp.get('/limited', async () => ({ ok: true }));

    await proxyAwareApp.ready();

    try {
      await proxyAwareApp.inject({
        method: 'GET',
        url: '/limited',
        remoteAddress: '127.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.10' },
      });
      await proxyAwareApp.inject({
        method: 'GET',
        url: '/limited',
        remoteAddress: '127.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.10' },
      });

      const limited = await proxyAwareApp.inject({
        method: 'GET',
        url: '/limited',
        remoteAddress: '127.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.10' },
      });

      const differentClient = await proxyAwareApp.inject({
        method: 'GET',
        url: '/limited',
        remoteAddress: '127.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.11' },
      });

      expect(limited.statusCode).toBe(429);
      expect(differentClient.statusCode).toBe(200);
    } finally {
      await proxyAwareApp.close();
    }
  });

  it('ignores spoofed forwarded IP from untrusted remotes', async () => {
    const proxyAwareApp = Fastify({ logger: false, trustProxy: ['127.0.0.1'] });
    proxyAwareApp.register(rateLimitPlugin);
    proxyAwareApp.get('/limited', async () => ({ ok: true }));

    await proxyAwareApp.ready();

    try {
      await proxyAwareApp.inject({
        method: 'GET',
        url: '/limited',
        remoteAddress: '198.51.100.1',
        headers: { 'x-forwarded-for': '203.0.113.10' },
      });
      await proxyAwareApp.inject({
        method: 'GET',
        url: '/limited',
        remoteAddress: '198.51.100.1',
        headers: { 'x-forwarded-for': '203.0.113.11' },
      });

      const limited = await proxyAwareApp.inject({
        method: 'GET',
        url: '/limited',
        remoteAddress: '198.51.100.1',
        headers: { 'x-forwarded-for': '203.0.113.12' },
      });

      expect(limited.statusCode).toBe(429);
    } finally {
      await proxyAwareApp.close();
    }
  });

  it('fails closed in production when only in-memory rate limiting is configured', async () => {
    await withEnv({
      NODE_ENV: 'production',
      BFF_RATE_LIMIT_STORE: undefined,
      BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK: undefined,
    }, async () => {
      const productionApp = Fastify({ logger: false });
      productionApp.register(rateLimitPlugin);
      let readyError: unknown;
      try {
        await productionApp.ready();
      } catch (error) {
        readyError = error;
      } finally {
        await productionApp.close();
      }

      expect(readyError).toBeInstanceOf(Error);
      expect((readyError as Error).message).toContain('BFF_RATE_LIMIT_STORE');
    });
  });

  it('allows in-memory rate limiting in production only with explicit risk acceptance', async () => {
    await withEnv({
      NODE_ENV: 'production',
      BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK: 'true',
      BFF_RATE_LIMIT_IN_MEMORY_RISK_OWNER: 'security@example.com',
      BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE: futureReviewDate(),
    }, async () => {
      const productionApp = Fastify({ logger: false });
      productionApp.register(rateLimitPlugin);
      await productionApp.ready();
      await productionApp.close();
    });
  });
});

describe('rate limit store mode', () => {
  it('uses memory store outside production', () => {
    expect(resolveRateLimitStoreMode({ NODE_ENV: 'test' })).toBe('memory');
  });

  it('requires explicit production limiter posture', () => {
    expect(() => resolveRateLimitStoreMode({ NODE_ENV: 'production' })).toThrow(
      'BFF_RATE_LIMIT_STORE',
    );
  });

  it('allows documented in-memory risk acceptance in production', () => {
    expect(resolveRateLimitStoreMode({
      NODE_ENV: 'production',
      BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK: 'true',
      BFF_RATE_LIMIT_IN_MEMORY_RISK_OWNER: 'security@example.com',
      BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE: futureReviewDate(),
    })).toBe('memory-risk-accepted');
  });

  it('requires owner and review date for in-memory risk acceptance', () => {
    expect(() => resolveRateLimitStoreMode({
      NODE_ENV: 'production',
      BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK: 'true',
    })).toThrow('BFF_RATE_LIMIT_IN_MEMORY_RISK_OWNER');
  });

  it('requires a valid risk review date', () => {
    expect(() => resolveRateLimitStoreMode({
      NODE_ENV: 'production',
      BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK: 'true',
      BFF_RATE_LIMIT_IN_MEMORY_RISK_OWNER: 'security@example.com',
      BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE: 'not-a-date',
    })).toThrow('BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE');
  });

  it('rejects stale risk review dates', () => {
    expect(() => resolveRateLimitStoreMode({
      NODE_ENV: 'production',
      BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK: 'true',
      BFF_RATE_LIMIT_IN_MEMORY_RISK_OWNER: 'security@example.com',
      BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE: '2000-01-01',
    })).toThrow('BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE');
  });

  it('treats Railway prod aliases as production', () => {
    expect(() => resolveRateLimitStoreMode({ RAILWAY_ENVIRONMENT_NAME: 'prod' })).toThrow(
      'BFF_RATE_LIMIT_STORE',
    );
  });

  it('recognizes redis store mode in production', () => {
    expect(resolveRateLimitStoreMode({
      NODE_ENV: 'production',
      BFF_RATE_LIMIT_STORE: 'redis',
    })).toBe('redis');
  });
});

describe('Redis rate limit store', () => {
  it('requires REDIS_URL when redis store is configured', async () => {
    await withEnv({
      NODE_ENV: 'production',
      BFF_RATE_LIMIT_STORE: 'redis',
      REDIS_URL: undefined,
    }, async () => {
      const productionApp = Fastify({ logger: false });
      productionApp.register(rateLimitPlugin);
      let readyError: unknown;
      try {
        await productionApp.ready();
      } catch (error) {
        readyError = error;
      } finally {
        await productionApp.close();
      }

      expect(readyError).toBeInstanceOf(Error);
      expect((readyError as Error).message).toContain('REDIS_URL');
    });
  });

  it('increments counters atomically with Redis', async () => {
    const calls: Array<{ keys: string[]; arguments: string[] }> = [];
    const client: RedisRateLimitClient = {
      eval: async (_script, options) => {
        calls.push(options);
        return [2, 1_719_000_060_000];
      },
      ping: async () => 'PONG',
      quit: async () => undefined,
    };

    const store = new RedisRateLimitStore(client);
    const entry = await store.increment('client:/v1/health:60000:120', 1_719_000_000_000, 60_000);

    expect(entry).toEqual({ count: 2, resetAt: 1_719_000_060_000 });
    expect(calls).toEqual([
      {
        keys: [expect.stringMatching(/^nostr-city:local:bff:rate-limit:v1:[a-f0-9]{64}$/)],
        arguments: ['1719000000000', '60000'],
      },
    ]);
    expect(calls[0]?.keys[0]).not.toContain('client');
    expect(calls[0]?.keys[0]).not.toContain('/v1/health');
  });

  it('hashes user-derived Redis rate limit key material', async () => {
    const calls: Array<{ keys: string[]; arguments: string[] }> = [];
    const client: RedisRateLimitClient = {
      eval: async (_script, options) => {
        calls.push(options);
        return [1, 1_719_000_060_000];
      },
      ping: async () => 'PONG',
      quit: async () => undefined,
    };

    const store = new RedisRateLimitStore(client, {
      keyPrefix: 'nostr-city:test:bff:rate-limit:v1:',
      keyHashSecret: 'x'.repeat(32),
    });

    await store.increment('203.0.113.42:/v1/health:60000:120', 1_719_000_000_000, 60_000);

    const redisKey = calls[0]?.keys[0] ?? '';
    expect(redisKey).toMatch(/^nostr-city:test:bff:rate-limit:v1:[a-f0-9]{64}$/);
    expect(redisKey).not.toContain('203.0.113.42');
    expect(redisKey).not.toContain('/v1/health');
  });

  it('rejects insecure public Redis URLs in production', () => {
    expect(() => resolveRedisRateLimitUrl({
      NODE_ENV: 'production',
      REDIS_URL: 'redis://cache.example.com:6379',
    })).toThrow('rediss://');
  });

  it('rejects unauthenticated public Redis URLs in production', () => {
    expect(() => resolveRedisRateLimitUrl({
      NODE_ENV: 'production',
      REDIS_URL: 'rediss://cache.example.com:6379',
    })).toThrow('password');
  });

  it('times out Redis startup health checks', async () => {
    const client = {
      connect: async () => new Promise((resolve) => {
        setTimeout(resolve, 50);
      }),
      eval: async () => [1, 1_719_000_060_000],
      ping: async () => 'PONG',
      quit: async () => undefined,
    };

    await expect(connectRedisRateLimitClient(client, 1)).rejects.toThrow(
      'Redis rate limit store failed',
    );
  });

  it('times out pending Redis increments to fail closed', async () => {
    const client: RedisRateLimitClient = {
      eval: async () => new Promise((resolve) => {
        setTimeout(() => resolve([1, 1_719_000_060_000]), 50);
      }),
      ping: async () => 'PONG',
      quit: async () => undefined,
    };

    const store = new RedisRateLimitStore(client, { commandTimeoutMs: 1 });

    await expect(store.increment('client:/v1/health:60000:120', 1_719_000_000_000, 60_000)).rejects.toThrow(
      'Redis rate limit store failed',
    );
  });

  it('fails closed when Redis increment fails', async () => {
    const client: RedisRateLimitClient = {
      eval: async () => {
        throw new Error('redis unavailable');
      },
      ping: async () => 'PONG',
      quit: async () => undefined,
    };

    const store = new RedisRateLimitStore(client);

    await expect(store.increment('client:/v1/health:60000:120', 1_719_000_000_000, 60_000)).rejects.toThrow(
      'Redis rate limit store failed',
    );
  });

  it('registers Redis rate limit readiness checks with a bounded ping', async () => {
    let pingCalls = 0;
    const readinessChecks: ReadinessChecks = {};
    const client: RedisRateLimitClient = {
      eval: async () => [1, 1_719_000_060_000],
      ping: async () => {
        pingCalls += 1;
        return 'PONG';
      },
      quit: async () => undefined,
    };

    registerRedisRateLimitReadinessCheck(readinessChecks, client, 10);

    await expect(readinessChecks.redisRateLimit?.()).resolves.toBeUndefined();
    expect(pingCalls).toBe(1);
  });
});
