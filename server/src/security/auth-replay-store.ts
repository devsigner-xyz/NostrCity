import {
  buildRedisKey,
  digestRedisKeyPart,
  resolveRedisKeyHashSecret,
  resolveRedisKeyPrefix,
  type EnvLike,
} from '../redis/redis-security';
import { isProductionRuntime } from '../production-config';

const DEFAULT_REDIS_COMMAND_TIMEOUT_MS = 500;
const DEFAULT_MAX_AUTH_PROOFS = 5_000;
const AUTH_REPLAY_NAMESPACE = 'auth-replay:v1';

export type AuthReplayStoreMode = 'memory' | 'redis';
export type AuthReplayConsumeResult = 'consumed' | 'replayed';

export interface AuthReplayStore {
  consume(input: {
    pubkey: string;
    eventId: string;
    ttlSeconds: number;
  }): Promise<AuthReplayConsumeResult>;
  close(): Promise<void>;
}

export interface RedisAuthReplaySetOptions {
  condition: 'NX';
  expiration: {
    type: 'EX';
    value: number;
  };
}

export interface RedisAuthReplayClient {
  set(key: string, value: string, options: RedisAuthReplaySetOptions): Promise<'OK' | null>;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
}

export interface RedisAuthReplayConnectionClient extends RedisAuthReplayClient {
  connect(): Promise<unknown>;
}

type RedisAuthReplayStoreOptions = {
  commandTimeoutMs?: number;
  keyPrefix?: string;
  keyHashSecret?: string;
};

export const resolveAuthReplayStoreMode = (env: EnvLike = process.env): AuthReplayStoreMode => {
  const configuredStore = env.BFF_AUTH_REPLAY_STORE?.trim().toLowerCase();
  const rateLimitStore = env.BFF_RATE_LIMIT_STORE?.trim().toLowerCase();

  if (configuredStore === 'redis' || rateLimitStore === 'redis') {
    return 'redis';
  }

  if (!isProductionRuntime(env)) {
    return 'memory';
  }

  throw new Error(
    'BFF_AUTH_REPLAY_STORE=redis is required in production, or use BFF_RATE_LIMIT_STORE=redis to share the Redis security store.',
  );
};

const wrapRedisAuthReplayError = (error: unknown): Error => {
  const wrappedError = new Error('Redis auth replay store failed');
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
          reject(new Error('Redis auth replay command timed out'));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    throw wrapRedisAuthReplayError(error);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

export const connectRedisAuthReplayClient = async (
  client: RedisAuthReplayConnectionClient,
  timeoutMs = DEFAULT_REDIS_COMMAND_TIMEOUT_MS,
): Promise<void> => {
  await withRedisTimeout(client.connect(), timeoutMs);
  await withRedisTimeout(client.ping(), timeoutMs);
};

export class InMemoryAuthReplayStore implements AuthReplayStore {
  private readonly entries = new Map<string, number>();
  private readonly nowSeconds: () => number;
  private readonly maxEntries: number;

  constructor(options: { nowSeconds?: () => number; maxEntries?: number } = {}) {
    this.nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_AUTH_PROOFS;
  }

  async consume(input: { pubkey: string; eventId: string; ttlSeconds: number }): Promise<AuthReplayConsumeResult> {
    const nowSeconds = this.nowSeconds();
    this.deleteExpired(nowSeconds);

    const replayKey = `${input.pubkey}:${input.eventId}`;
    if (this.entries.has(replayKey)) {
      return 'replayed';
    }

    this.entries.set(replayKey, nowSeconds + Math.max(1, Math.floor(input.ttlSeconds)));
    this.trim();
    return 'consumed';
  }

  async close(): Promise<void> {}

  private deleteExpired(nowSeconds: number): void {
    for (const [key, expiresAt] of this.entries.entries()) {
      if (expiresAt <= nowSeconds) {
        this.entries.delete(key);
      }
    }
  }

  private trim(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }

      this.entries.delete(oldestKey);
    }
  }
}

export class RedisAuthReplayStore implements AuthReplayStore {
  private readonly commandTimeoutMs: number;
  private readonly keyPrefix: string;
  private readonly keyHashSecret: string;

  constructor(
    private readonly client: RedisAuthReplayClient,
    options: RedisAuthReplayStoreOptions = {},
  ) {
    this.commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_REDIS_COMMAND_TIMEOUT_MS;
    this.keyPrefix = options.keyPrefix ?? buildRedisKey(resolveRedisKeyPrefix(), AUTH_REPLAY_NAMESPACE);
    this.keyHashSecret = options.keyHashSecret ?? resolveRedisKeyHashSecret();
  }

  async consume(input: { pubkey: string; eventId: string; ttlSeconds: number }): Promise<AuthReplayConsumeResult> {
    const keyDigest = digestRedisKeyPart(this.keyHashSecret, `${input.pubkey}:${input.eventId}`);
    const result = await withRedisTimeout(
      this.client.set(buildRedisKey(this.keyPrefix, keyDigest), '1', {
        condition: 'NX',
        expiration: {
          type: 'EX',
          value: Math.max(1, Math.floor(input.ttlSeconds)),
        },
      }),
      this.commandTimeoutMs,
    );

    return result === 'OK' ? 'consumed' : 'replayed';
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}
