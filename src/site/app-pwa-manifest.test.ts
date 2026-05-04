// @vitest-environment node

import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

interface WebAppManifest {
  name?: string;
  short_name?: string;
  id?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  orientation?: string;
  icons?: Array<{
    src?: string;
    sizes?: string;
    type?: string;
    purpose?: string;
  }>;
}

const readText = async (path: string): Promise<string> => {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
};

const readManifest = async (): Promise<WebAppManifest> => {
  return JSON.parse(await readText('public/site.webmanifest')) as WebAppManifest;
};

describe('app PWA manifest', () => {
  it('scopes the installable app experience to /app/ in standalone portrait mode', async () => {
    const manifest = await readManifest();

    expect(manifest).toMatchObject({
      name: 'Nostr City',
      short_name: 'Nostr City',
      id: '/app/',
      start_url: '/app/',
      scope: '/app/',
      display: 'standalone',
      orientation: 'portrait',
    });
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: '/icon-light-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        }),
        expect.objectContaining({
          src: '/icon-light-512x512.png',
          sizes: '512x512',
          type: 'image/png',
        }),
      ]),
    );
  });

  it('links the manifest from the app entry only', async () => {
    const appHtml = await readText('app/index.html');
    const landingHtml = await readText('index.html');
    const docsConfig = await readText('docs/.vitepress/config.mts');

    expect(appHtml).toContain('<link rel="manifest" href="/site.webmanifest" />');
    expect(landingHtml).not.toContain('rel="manifest"');
    expect(docsConfig).not.toContain("rel: 'manifest'");
  });

  it('declares mobile app chrome hints on the app entry', async () => {
    const appHtml = await readText('app/index.html');

    expect(appHtml).toContain('<meta name="theme-color" content="#f8fafc" />');
    expect(appHtml).toContain('<meta name="mobile-web-app-capable" content="yes" />');
    expect(appHtml).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(appHtml).toContain('<meta name="apple-mobile-web-app-title" content="Nostr City" />');
    expect(appHtml).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />');
  });
});
