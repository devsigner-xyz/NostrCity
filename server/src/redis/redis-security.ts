import { createHmac } from 'node:crypto';

import { isProductionRuntime } from '../production-config';

export type EnvLike = Partial<Record<string, string | undefined>>;

const DEFAULT_LOCAL_REDIS_KEY_PREFIX = 'nostr-city:local:bff:';
const DEFAULT_LOCAL_REDIS_KEY_HASH_SECRET = 'local-development-redis-key-hash-secret';
const REDIS_KEY_PREFIX_PATTERN = /^[a-zA-Z0-9:_-]+:$/;
const MIN_HASH_SECRET_LENGTH = 32;

const hasNonEmptyValue = (value: string | undefined): boolean => {
  return typeof value === 'string' && value.trim().length > 0;
};

const isPrivateRedisHost = (hostname: string): boolean => {
  const normalizedHost = hostname.toLowerCase();
  if (
    normalizedHost === 'localhost'
    || normalizedHost === '127.0.0.1'
    || normalizedHost === '::1'
    || normalizedHost.endsWith('.internal')
  ) {
    return true;
  }

  const octets = normalizedHost.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }

  return (
    octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
  );
};

export const resolveRedisUrl = (env: EnvLike = process.env): string => {
  const redisUrl = env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error('REDIS_URL is required when Redis integration is enabled.');
  }

  let parsed: URL;
  try {
    parsed = new URL(redisUrl);
  } catch {
    throw new Error('REDIS_URL must be a valid Redis connection URL.');
  }

  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use redis:// or rediss://.');
  }

  const privateHost = isPrivateRedisHost(parsed.hostname);
  if (isProductionRuntime(env) && parsed.protocol !== 'rediss:' && !privateHost) {
    throw new Error('Production REDIS_URL must use rediss:// unless Redis is on a private/internal host.');
  }

  if (isProductionRuntime(env) && !privateHost && !hasNonEmptyValue(parsed.password)) {
    throw new Error('Production public REDIS_URL requires a Redis password.');
  }

  return redisUrl;
};

export const resolveRedisKeyPrefix = (env: EnvLike = process.env): string => {
  const configuredPrefix = env.BFF_REDIS_KEY_PREFIX?.trim();
  const prefix = configuredPrefix || (isProductionRuntime(env) ? undefined : DEFAULT_LOCAL_REDIS_KEY_PREFIX);

  if (!prefix || !REDIS_KEY_PREFIX_PATTERN.test(prefix)) {
    throw new Error(
      'BFF_REDIS_KEY_PREFIX is required and must contain only letters, numbers, colons, underscores, or hyphens, ending with a colon.',
    );
  }

  return prefix;
};

export const resolveRedisKeyHashSecret = (env: EnvLike = process.env): string => {
  const configuredSecret = env.BFF_REDIS_KEY_HASH_SECRET?.trim();
  const secret = configuredSecret || (isProductionRuntime(env) ? undefined : DEFAULT_LOCAL_REDIS_KEY_HASH_SECRET);

  if (!secret || secret.length < MIN_HASH_SECRET_LENGTH) {
    throw new Error(
      `BFF_REDIS_KEY_HASH_SECRET is required and must be at least ${MIN_HASH_SECRET_LENGTH} characters long.`,
    );
  }

  return secret;
};

export const digestRedisKeyPart = (secret: string, value: string): string => {
  return createHmac('sha256', secret).update(value).digest('hex');
};

export const buildRedisKey = (...parts: string[]): string => {
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => part.replace(/^:+|:+$/g, ''))
    .filter((part) => part.length > 0)
    .join(':');
};
