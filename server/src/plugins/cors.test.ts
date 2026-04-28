// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';

import { buildApp } from '../app';
import { resolveAllowedOrigins } from './cors';
import { corsPlugin } from './cors';

const futureReviewDate = (): string => {
  const reviewDate = new Date();
  reviewDate.setUTCDate(reviewDate.getUTCDate() + 30);
  return reviewDate.toISOString().slice(0, 10);
};

describe('cors plugin', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows configured origin and sets CORS headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: {
        origin: 'http://localhost:5173',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers.vary).toBe('Origin');
  });

  it('rejects disallowed origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: {
        origin: 'https://not-allowed.example',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: 'FORBIDDEN_ORIGIN',
      },
    });
  });
});

describe('cors plugin in production', () => {
  it('uses only explicit production origins', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousCors = process.env.BFF_CORS_ORIGINS;
    const previousTrustProxy = process.env.FASTIFY_TRUST_PROXY;
    const previousRateLimitRisk = process.env.BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK;
    const previousRateLimitRiskOwner = process.env.BFF_RATE_LIMIT_IN_MEMORY_RISK_OWNER;
    const previousRateLimitRiskReviewDate = process.env.BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE;

    process.env.NODE_ENV = 'production';
    process.env.BFF_CORS_ORIGINS = 'https://nostrcity.xyz';
    process.env.FASTIFY_TRUST_PROXY = 'loopback';
    process.env.BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK = 'true';
    process.env.BFF_RATE_LIMIT_IN_MEMORY_RISK_OWNER = 'security@example.com';
    process.env.BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE = futureReviewDate();

    const productionApp = Fastify({ logger: false });
    productionApp.register(corsPlugin);
    productionApp.get('/v1/health', async () => ({ ok: true }));

    try {
      await productionApp.ready();

      const allowed = await productionApp.inject({
        method: 'GET',
        url: '/v1/health',
        headers: {
          origin: 'https://nostrcity.xyz',
        },
      });
      const disallowed = await productionApp.inject({
        method: 'GET',
        url: '/v1/health',
        headers: {
          origin: 'http://localhost:5173',
        },
      });

      expect(allowed.statusCode).toBe(200);
      expect(allowed.headers['access-control-allow-origin']).toBe('https://nostrcity.xyz');
      expect(disallowed.statusCode).toBe(403);
    } finally {
      await productionApp.close();
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousCors === undefined) delete process.env.BFF_CORS_ORIGINS;
      else process.env.BFF_CORS_ORIGINS = previousCors;
      if (previousTrustProxy === undefined) delete process.env.FASTIFY_TRUST_PROXY;
      else process.env.FASTIFY_TRUST_PROXY = previousTrustProxy;
      if (previousRateLimitRisk === undefined) {
        delete process.env.BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK;
      } else {
        process.env.BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK = previousRateLimitRisk;
      }
      if (previousRateLimitRiskOwner === undefined) {
        delete process.env.BFF_RATE_LIMIT_IN_MEMORY_RISK_OWNER;
      } else {
        process.env.BFF_RATE_LIMIT_IN_MEMORY_RISK_OWNER = previousRateLimitRiskOwner;
      }
      if (previousRateLimitRiskReviewDate === undefined) {
        delete process.env.BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE;
      } else {
        process.env.BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE = previousRateLimitRiskReviewDate;
      }
    }
  });
});

describe('resolveAllowedOrigins', () => {
  it('uses localhost defaults outside production', () => {
    const origins = resolveAllowedOrigins({ NODE_ENV: 'test' });

    expect(origins.has('http://localhost:5173')).toBe(true);
  });

  it('fails closed when production cors origins are missing', () => {
    expect(() => resolveAllowedOrigins({ NODE_ENV: 'production' })).toThrow(
      'BFF_CORS_ORIGINS',
    );
  });

  it('uses explicit production origins', () => {
    const origins = resolveAllowedOrigins({
      NODE_ENV: 'production',
      BFF_CORS_ORIGINS: 'https://nostrcity.xyz, https://www.nostrcity.xyz',
    });

    expect([...origins]).toEqual(['https://nostrcity.xyz', 'https://www.nostrcity.xyz']);
  });
});
