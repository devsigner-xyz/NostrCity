// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  buildRedisKey,
  digestRedisKeyPart,
  resolveRedisKeyHashSecret,
  resolveRedisKeyPrefix,
  resolveRedisUrl,
} from './redis-security';

const productionEnv = {
  NODE_ENV: 'production',
  BFF_REDIS_KEY_PREFIX: 'nostr-city:test:bff:',
  BFF_REDIS_KEY_HASH_SECRET: 'x'.repeat(32),
};

describe('Redis security helpers', () => {
  it('rejects public production Redis URLs without TLS', () => {
    expect(() => resolveRedisUrl({
      ...productionEnv,
      REDIS_URL: 'redis://:secret@cache.example.com:6379',
    })).toThrow('rediss://');
  });

  it('rejects public production Redis URLs without a password', () => {
    expect(() => resolveRedisUrl({
      ...productionEnv,
      REDIS_URL: 'rediss://default@cache.example.com:6379',
    })).toThrow('password');
  });

  it('allows local Redis URLs outside production', () => {
    expect(resolveRedisUrl({ REDIS_URL: 'redis://127.0.0.1:6379' })).toBe(
      'redis://127.0.0.1:6379',
    );
  });

  it('requires a Redis key prefix in production', () => {
    expect(() => resolveRedisKeyPrefix({ NODE_ENV: 'production' })).toThrow(
      'BFF_REDIS_KEY_PREFIX',
    );
  });

  it('rejects Redis key prefixes with unsafe characters', () => {
    expect(() => resolveRedisKeyPrefix({
      NODE_ENV: 'production',
      BFF_REDIS_KEY_PREFIX: 'nostr city prod ',
    })).toThrow('BFF_REDIS_KEY_PREFIX');
  });

  it('requires a hash secret when Redis security keys are enabled', () => {
    expect(() => resolveRedisKeyHashSecret({ NODE_ENV: 'production' })).toThrow(
      'BFF_REDIS_KEY_HASH_SECRET',
    );
  });

  it('hashes user-derived key parts without leaking the input value', () => {
    const digest = digestRedisKeyPart('x'.repeat(32), '203.0.113.42:/v1/health');

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain('203.0.113.42');
    expect(digest).not.toContain('/v1/health');
  });

  it('builds colon-delimited Redis keys without duplicate separators', () => {
    expect(buildRedisKey('nostr-city:test:bff:', 'rate-limit:v1:', 'abc123')).toBe(
      'nostr-city:test:bff:rate-limit:v1:abc123',
    );
  });
});
