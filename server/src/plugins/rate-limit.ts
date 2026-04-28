import type { FastifyPluginAsync } from 'fastify';
import { createClient } from '@redis/client';

import { isProductionRuntime } from '../production-config';
import {
  buildRedisKey,
  digestRedisKeyPart,
  resolveRedisKeyHashSecret,
  resolveRedisKeyPrefix,
  resolveRedisUrl,
  type EnvLike,
} from '../redis/redis-security';

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 120;
const DEFAULT_MAX_STORE_ENTRIES = 10_000;
const DEFAULT_REDIS_COMMAND_TIMEOUT_MS = 500;
const REDIS_RATE_LIMIT_NAMESPACE = 'rate-limit:v1';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

interface RateLimitStore {
  increment(key: string, now: number, windowMs: number): Promise<RateLimitEntry>;
  deleteExpired(now: number): void;
  trim(maxEntries: number): void;
}

export interface RedisRateLimitClient {
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown>;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
}

export interface RedisRateLimitConnectionClient extends RedisRateLimitClient {
  connect(): Promise<unknown>;
}

type RedisRateLimitStoreOptions = {
  commandTimeoutMs?: number;
  keyPrefix?: string;
  keyHashSecret?: string;
};

class InMemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, RateLimitEntry>();

  async increment(key: string, now: number, windowMs: number): Promise<RateLimitEntry> {
    const entry = this.entries.get(key);
    if (!entry || now >= entry.resetAt) {
      const nextEntry = {
        count: 1,
        resetAt: now + windowMs,
      };
      this.entries.set(key, nextEntry);
      return nextEntry;
    }

    entry.count += 1;
    return entry;
  }

  deleteExpired(now: number): void {
    for (const [key, entry] of this.entries.entries()) {
      if (now >= entry.resetAt) {
        this.entries.delete(key);
      }
    }
  }

  trim(maxEntries: number): void {
    while (this.entries.size > maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }

      this.entries.delete(oldestKey);
    }
  }
}

const REDIS_INCREMENT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  ttl = tonumber(ARGV[2])
end
return { current, tonumber(ARGV[1]) + ttl }
`;

const parseRedisRateLimitResult = (result: unknown): RateLimitEntry => {
  if (!Array.isArray(result) || result.length !== 2) {
    throw new Error('Redis rate limit store returned an invalid result.');
  }

  const [count, resetAt] = result;
  const parsedCount = Number(count);
  const parsedResetAt = Number(resetAt);
  if (!Number.isFinite(parsedCount) || !Number.isFinite(parsedResetAt)) {
    throw new Error('Redis rate limit store returned non-numeric counters.');
  }

  return {
    count: parsedCount,
    resetAt: parsedResetAt,
  };
};

const wrapRedisRateLimitError = (error: unknown): Error => {
  const wrappedError = new Error('Redis rate limit store failed');
  (wrappedError as Error & { cause?: unknown }).cause = error;
  return wrappedError;
};

const withRedisTimeout = async <T>(operation: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('Redis rate limit command timed out'));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    throw wrapRedisRateLimitError(error);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

export const connectRedisRateLimitClient = async (
  client: RedisRateLimitConnectionClient,
  timeoutMs = DEFAULT_REDIS_COMMAND_TIMEOUT_MS,
): Promise<void> => {
  await withRedisTimeout(client.connect(), timeoutMs);
  await withRedisTimeout(client.ping(), timeoutMs);
};

export class RedisRateLimitStore implements RateLimitStore {
  private readonly commandTimeoutMs: number;
  private readonly keyPrefix: string;
  private readonly keyHashSecret: string;

  constructor(
    private readonly client: RedisRateLimitClient,
    options: RedisRateLimitStoreOptions = {},
  ) {
    this.commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_REDIS_COMMAND_TIMEOUT_MS;
    this.keyPrefix = options.keyPrefix ?? buildRedisKey(resolveRedisKeyPrefix(), REDIS_RATE_LIMIT_NAMESPACE);
    this.keyHashSecret = options.keyHashSecret ?? resolveRedisKeyHashSecret();
  }

  async increment(key: string, now: number, windowMs: number): Promise<RateLimitEntry> {
    const keyDigest = digestRedisKeyPart(this.keyHashSecret, key);
    const result = await withRedisTimeout(
      this.client.eval(REDIS_INCREMENT_SCRIPT, {
        keys: [buildRedisKey(this.keyPrefix, keyDigest)],
        arguments: [`${now}`, `${windowMs}`],
      }),
      this.commandTimeoutMs,
    );
    return parseRedisRateLimitResult(result);
  }

  deleteExpired(_now: number): void {}

  trim(_maxEntries: number): void {}
}

type RouteRateLimitConfig = {
  max?: unknown;
  windowMs?: unknown;
};

export type RateLimitStoreMode = 'memory' | 'memory-risk-accepted' | 'redis';

const hasNonEmptyValue = (value: string | undefined): boolean => {
  return typeof value === 'string' && value.trim().length > 0;
};

const isValidDateOnly = (value: string | undefined): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const isStaleDateOnly = (value: string): boolean => {
  return value < new Date().toISOString().slice(0, 10);
};

export const resolveRedisRateLimitUrl = (env: EnvLike = process.env): string => {
  return resolveRedisUrl(env);
};

const toLoggableRedisError = (error: unknown): Record<string, unknown> => {
  if (!(error instanceof Error)) {
    return { message: 'Unknown Redis error' };
  }

  return {
    name: error.name,
    message: error.message,
    ...(typeof (error as Error & { code?: unknown }).code === 'string'
      ? { code: (error as Error & { code: string }).code }
      : {}),
  };
};

export const resolveRateLimitStoreMode = (
  env: EnvLike = process.env,
): RateLimitStoreMode => {
  const configuredStore = env.BFF_RATE_LIMIT_STORE?.trim().toLowerCase();
  if (configuredStore === 'redis') {
    return 'redis';
  }

  if (!isProductionRuntime(env)) {
    return 'memory';
  }

  if (env.BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK === 'true') {
    const riskReviewDate = env.BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE;
    const missingRiskMetadata: string[] = [];
    if (!hasNonEmptyValue(env.BFF_RATE_LIMIT_IN_MEMORY_RISK_OWNER)) {
      missingRiskMetadata.push('BFF_RATE_LIMIT_IN_MEMORY_RISK_OWNER');
    }
    if (!hasNonEmptyValue(riskReviewDate)) {
      missingRiskMetadata.push('BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE');
    }

    if (missingRiskMetadata.length > 0) {
      throw new Error(
        `BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK=true requires documented risk acceptance: ${missingRiskMetadata.join(', ')}`,
      );
    }

    if (!isValidDateOnly(riskReviewDate)) {
      throw new Error(
        'BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE must use YYYY-MM-DD format.',
      );
    }

    if (isStaleDateOnly(riskReviewDate)) {
      throw new Error(
        'BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE must not be earlier than today.',
      );
    }

    return 'memory-risk-accepted';
  }

  throw new Error(
    'BFF_RATE_LIMIT_STORE=redis is required in production, or set BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK=true with documented risk acceptance.',
  );
};

const parsePositiveInt = (
  rawValue: string | undefined,
  fallback: number,
): number => {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const parsePositiveIntUnknown = (rawValue: unknown, fallback: number): number => {
  if (typeof rawValue === 'number') {
    if (!Number.isInteger(rawValue) || rawValue <= 0) {
      return fallback;
    }

    return rawValue;
  }

  if (typeof rawValue === 'string') {
    return parsePositiveInt(rawValue, fallback);
  }

  return fallback;
};

export const rateLimitPlugin: FastifyPluginAsync = async (app) => {
  const storeMode = resolveRateLimitStoreMode();
  const windowMs = parsePositiveInt(
    process.env.BFF_RATE_LIMIT_WINDOW_MS,
    DEFAULT_WINDOW_MS,
  );
  const maxRequests = parsePositiveInt(
    process.env.BFF_RATE_LIMIT_MAX,
    DEFAULT_MAX_REQUESTS,
  );
  const maxStoreEntries = parsePositiveInt(
    process.env.BFF_RATE_LIMIT_MAX_STORE_ENTRIES,
    DEFAULT_MAX_STORE_ENTRIES,
  );
  let store: RateLimitStore;

  if (storeMode === 'redis') {
    const redisUrl = resolveRedisRateLimitUrl();
    const redisKeyPrefix = buildRedisKey(resolveRedisKeyPrefix(), REDIS_RATE_LIMIT_NAMESPACE);
    const redisKeyHashSecret = resolveRedisKeyHashSecret();

    const redisClient = createClient({
      url: redisUrl,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: DEFAULT_REDIS_COMMAND_TIMEOUT_MS,
        reconnectStrategy: false,
      },
    });
    redisClient.on('error', (error: unknown) => {
      app.log.error({ error: toLoggableRedisError(error) }, 'Redis rate limit client error');
    });
    await connectRedisRateLimitClient(
      redisClient as RedisRateLimitConnectionClient,
      DEFAULT_REDIS_COMMAND_TIMEOUT_MS,
    );
    app.addHook('onClose', async () => {
      await redisClient.quit();
    });
    store = new RedisRateLimitStore(redisClient as RedisRateLimitClient, {
      keyPrefix: redisKeyPrefix,
      keyHashSecret: redisKeyHashSecret,
    });
  } else {
    store = new InMemoryRateLimitStore();
  }

  let lastSweepAt = 0;

  const sweepExpiredEntries = (now: number): void => {
    store.deleteExpired(now);
    lastSweepAt = now;
  };

  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'OPTIONS') {
      return;
    }

    const routeRateLimitConfig = (request.routeOptions.config as { rateLimit?: RouteRateLimitConfig } | undefined)?.rateLimit;

    const effectiveWindowMs = parsePositiveIntUnknown(
      routeRateLimitConfig?.windowMs,
      windowMs,
    );

    const effectiveMaxRequests = parsePositiveIntUnknown(
      routeRateLimitConfig?.max,
      maxRequests,
    );

    const now = Date.now();
    if (now - lastSweepAt >= Math.min(windowMs, effectiveWindowMs)) {
      sweepExpiredEntries(now);
    }

    const key = `${request.ip}:${request.routeOptions.url}:${effectiveWindowMs}:${effectiveMaxRequests}`;
    let incrementedEntry: RateLimitEntry;
    try {
      incrementedEntry = await store.increment(key, now, effectiveWindowMs);
    } catch (error) {
      app.log.error({
        error: toLoggableRedisError(error),
        route: request.routeOptions.url,
        storeMode,
      }, 'Rate limit store failed');
      throw error;
    }
    store.trim(maxStoreEntries);

    if (incrementedEntry.count <= effectiveMaxRequests) {
      return;
    }

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((incrementedEntry.resetAt - now) / 1000),
    );

    reply.header('retry-after', `${retryAfterSeconds}`);

    const error = new Error('Rate limit exceeded') as Error & {
      statusCode: number;
      code: string;
    };
    error.statusCode = 429;
    error.code = 'RATE_LIMITED';
    throw error;
  });
};

(rateLimitPlugin as FastifyPluginAsync & { [key: symbol]: boolean })[
  Symbol.for('skip-override')
] = true;
