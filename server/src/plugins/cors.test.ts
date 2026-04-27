// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app';
import { resolveAllowedOrigins } from './cors';

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

    process.env.NODE_ENV = 'production';
    process.env.BFF_CORS_ORIGINS = 'https://nostrcity.xyz';
    process.env.FASTIFY_TRUST_PROXY = 'loopback';

    const productionApp = buildApp();

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
