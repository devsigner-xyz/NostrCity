// @vitest-environment node

import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';

import {
  resolveSecurityHeaders,
  securityHeadersPlugin,
} from './security-headers';

describe('resolveSecurityHeaders', () => {
  it('includes production browser isolation and transport headers', () => {
    const headers = resolveSecurityHeaders({ isProduction: true });

    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("object-src 'none'");
    expect(headers['content-security-policy']).toContain(
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    );
    expect(headers['content-security-policy']).toContain(
      "font-src 'self' data: https://fonts.gstatic.com",
    );
    expect(headers['content-security-policy']).toContain(
      'upgrade-insecure-requests',
    );
    expect(headers['content-security-policy']).not.toContain("'unsafe-eval'");
    expect(headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
  });

  it('omits hsts outside production-like contexts', () => {
    const headers = resolveSecurityHeaders({ isProduction: false });

    expect(headers['strict-transport-security']).toBeUndefined();
    expect(headers['content-security-policy']).toContain("default-src 'self'");
  });
});

describe('securityHeadersPlugin', () => {
  it('sets security headers on responses without overwriting existing headers', async () => {
    const app = Fastify({ logger: false });
    app.register(securityHeadersPlugin);
    app.get('/headers', async (_request, reply) => {
      reply.header('x-frame-options', 'SAMEORIGIN');
      return { ok: true };
    });

    const response = await app.inject({ method: 'GET', url: '/headers' });
    await app.close();

    expect(response.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('sets hsts in production-like runtime contexts', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const app = Fastify({ logger: false });
      app.register(securityHeadersPlugin);
      app.get('/headers', async () => ({ ok: true }));

      const response = await app.inject({ method: 'GET', url: '/headers' });
      await app.close();

      expect(response.headers['strict-transport-security']).toBe(
        'max-age=31536000; includeSubDomains',
      );
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }
  });
});
