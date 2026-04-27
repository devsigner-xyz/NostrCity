// @vitest-environment node

import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from './app';

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
