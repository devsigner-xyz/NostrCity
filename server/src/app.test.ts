// @vitest-environment node

import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from './app';

const expectRouteNotFound = async (
  appInstance: ReturnType<typeof buildApp>,
  method: 'GET' | 'POST',
  url: string,
  payload?: Record<string, unknown>,
): Promise<void> => {
  const response = await appInstance.inject({ method, url, payload });
  expect(response.statusCode).toBe(404);
};

describe('buildApp', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns health status for GET /v1/health', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
    });
    expect(response.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('returns readiness status for GET /v1/ready', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      checks: {
        redisRateLimit: 'not_configured',
      },
    });
  });

  it('returns degraded readiness when a readiness dependency fails', async () => {
    const degradedApp = buildApp({
      readinessChecks: {
        redisRateLimit: async () => {
          throw new Error('redis unavailable');
        },
      },
    });
    await degradedApp.ready();

    try {
      const response = await degradedApp.inject({
        method: 'GET',
        url: '/v1/ready',
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        status: 'degraded',
        checks: {
          redisRateLimit: 'failed',
        },
      });
    } finally {
      await degradedApp.close();
    }
  });

  it('caches readiness check results briefly', async () => {
    let readinessCalls = 0;
    const cachedApp = buildApp({
      readinessChecks: {
        redisRateLimit: async () => {
          readinessCalls += 1;
        },
      },
    });
    await cachedApp.ready();

    try {
      const first = await cachedApp.inject({ method: 'GET', url: '/v1/ready' });
      const second = await cachedApp.inject({ method: 'GET', url: '/v1/ready' });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(readinessCalls).toBe(1);
    } finally {
      await cachedApp.close();
    }
  });

  it('returns not found for POST /v1/health', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/health',
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns not found for GET /health without prefix', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(404);
  });

  it('does not register private routes in public demo mode', async () => {
    const publicDemoApp = buildApp({ publicDemoMode: true });
    await publicDemoApp.ready();

    try {
      await expectRouteNotFound(
        publicDemoApp,
        'GET',
        `/v1/dm/events/inbox?ownerPubkey=${'a'.repeat(64)}&limit=1&since=1`,
      );
      await expectRouteNotFound(
        publicDemoApp,
        'GET',
        `/v1/dm/stream?ownerPubkey=${'a'.repeat(64)}`,
      );
      await expectRouteNotFound(
        publicDemoApp,
        'GET',
        `/v1/notifications?ownerPubkey=${'a'.repeat(64)}&limit=1&since=1`,
      );
      await expectRouteNotFound(
        publicDemoApp,
        'GET',
        `/v1/notifications/stream?ownerPubkey=${'a'.repeat(64)}&since=1`,
      );
      await expectRouteNotFound(publicDemoApp, 'POST', '/v1/publish/forward', {
        event: {
          id: 'b'.repeat(64),
          pubkey: 'a'.repeat(64),
          created_at: 1,
          kind: 1,
          tags: [],
          content: '',
          sig: 'c'.repeat(128),
        },
        relays: ['wss://relay.example'],
      });
    } finally {
      await publicDemoApp.close();
    }
  });
});

describe('buildApp static assets', () => {
  it('serves production landing and app assets without intercepting API routes', async () => {
    const assetsRoot = await mkdtemp(join(tmpdir(), 'nostr-city-dist-'));

    try {
      await mkdir(join(assetsRoot, 'app'), { recursive: true });
      await mkdir(join(assetsRoot, 'docs', 'assets'), { recursive: true });
      await mkdir(join(assetsRoot, 'docs', 'empezar'), { recursive: true });
      await writeFile(join(assetsRoot, 'index.html'), '<h1>Landing</h1>');
      await writeFile(join(assetsRoot, 'app', 'index.html'), '<h1>App</h1>');
      await writeFile(join(assetsRoot, 'docs', 'index.html'), '<h1>Docs</h1>');
      await writeFile(join(assetsRoot, 'docs', 'empezar', 'primeros-pasos.html'), '<h1>Primeros pasos</h1>');
      await writeFile(join(assetsRoot, 'docs', 'assets', 'style.css'), 'body{}');
      await writeFile(join(assetsRoot, 'asset.txt'), 'asset');

      const staticApp = buildApp({ staticAssetsPath: assetsRoot });
      await staticApp.ready();

      try {
        const landing = await staticApp.inject({ method: 'GET', url: '/' });
        const landingIndex = await staticApp.inject({ method: 'GET', url: '/index.html' });
        const appShell = await staticApp.inject({ method: 'GET', url: '/app/' });
        const appFallback = await staticApp.inject({ method: 'GET', url: '/app/profile/alice' });
        const overlayRootFallback = await staticApp.inject({ method: 'GET', url: '/notifications' });
        const overlayNestedFallback = await staticApp.inject({ method: 'GET', url: '/settings/zaps' });
        const docs = await staticApp.inject({ method: 'GET', url: '/docs/' });
        const docsCleanUrl = await staticApp.inject({ method: 'GET', url: '/docs/empezar/primeros-pasos' });
        const docsAsset = await staticApp.inject({ method: 'GET', url: '/docs/assets/style.css' });
        const asset = await staticApp.inject({ method: 'GET', url: '/asset.txt' });
        const health = await staticApp.inject({ method: 'GET', url: '/v1/health' });

        expect(landing.statusCode).toBe(200);
        expect(landing.body).toContain('Landing');
        expect(landingIndex.statusCode).toBe(200);
        expect(landingIndex.body).toContain('Landing');
        expect(appShell.statusCode).toBe(200);
        expect(appShell.body).toContain('App');
        expect(appFallback.statusCode).toBe(200);
        expect(appFallback.body).toContain('App');
        expect(overlayRootFallback.statusCode).toBe(200);
        expect(overlayRootFallback.body).toContain('App');
        expect(overlayNestedFallback.statusCode).toBe(200);
        expect(overlayNestedFallback.body).toContain('App');
        expect(docs.statusCode).toBe(200);
        expect(docs.body).toContain('Docs');
        expect(docsCleanUrl.statusCode).toBe(200);
        expect(docsCleanUrl.body).toContain('Primeros pasos');
        expect(docsAsset.statusCode).toBe(200);
        expect(docsAsset.body).toBe('body{}');
        expect(asset.statusCode).toBe(200);
        expect(asset.body).toBe('asset');
        expect(health.statusCode).toBe(200);
        expect(health.json()).toEqual({ status: 'ok' });
      } finally {
        await staticApp.close();
      }
    } finally {
      await rm(assetsRoot, { recursive: true, force: true });
    }
  });

  it('serves the app shell at root when the landing document is missing', async () => {
    const assetsRoot = await mkdtemp(join(tmpdir(), 'nostr-city-dist-'));

    try {
      await mkdir(join(assetsRoot, 'app'), { recursive: true });
      await writeFile(join(assetsRoot, 'app', 'index.html'), '<h1>App</h1>');

      const staticApp = buildApp({ staticAssetsPath: assetsRoot });
      await staticApp.ready();

      try {
        const landing = await staticApp.inject({ method: 'GET', url: '/' });
        const landingIndex = await staticApp.inject({ method: 'GET', url: '/index.html' });

        expect(landing.statusCode).toBe(200);
        expect(landing.body).toContain('App');
        expect(landingIndex.statusCode).toBe(200);
        expect(landingIndex.body).toContain('App');
      } finally {
        await staticApp.close();
      }
    } finally {
      await rm(assetsRoot, { recursive: true, force: true });
    }
  });
});
