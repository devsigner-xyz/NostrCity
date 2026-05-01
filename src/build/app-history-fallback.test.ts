import type { Plugin } from 'vite';
import { describe, expect, it } from 'vitest';
import { createAppHistoryFallbackPlugin } from './app-history-fallback';

type Middleware = (request: { url?: string | undefined }, response: unknown, next: () => void) => void;

function appHistoryFallbackPlugin(): Plugin {
  const plugin = createAppHistoryFallbackPlugin();

  if (plugin.name !== 'nostr-city-app-history-fallback') {
    throw new Error('App history fallback plugin not found');
  }

  return plugin;
}

function configuredServerMiddleware(plugin: Plugin, hook: 'configureServer' | 'configurePreviewServer'): Middleware {
  let middleware: Middleware | undefined;
  const fakeServer = {
    middlewares: {
      use: (nextMiddleware: Middleware) => {
        middleware = nextMiddleware;
      },
    },
  };

  const configure = plugin[hook];
  if (typeof configure !== 'function') {
    throw new Error(`${hook} hook not found`);
  }

  configure.call({} as never, fakeServer as never);

  if (!middleware) {
    throw new Error(`${hook} middleware not registered`);
  }

  return middleware;
}

describe('app history fallback Vite plugin', () => {
  it('rewrites app route requests to the app document in the dev server', () => {
    const middleware = configuredServerMiddleware(appHistoryFallbackPlugin(), 'configureServer');
    const request = { url: '/app/wallet?source=smoke' };
    let continued = false;

    middleware(request, {}, () => {
      continued = true;
    });

    expect(request.url).toBe('/app/index.html');
    expect(continued).toBe(true);
  });

  it('rewrites app route requests to the app document in preview', () => {
    const middleware = configuredServerMiddleware(appHistoryFallbackPlugin(), 'configurePreviewServer');
    const request = { url: '/app/relays/detail?url=wss%3A%2F%2Frelay.one' };

    middleware(request, {}, () => {});

    expect(request.url).toBe('/app/index.html');
  });

  it('leaves static assets and non-app requests unchanged', () => {
    const middleware = configuredServerMiddleware(appHistoryFallbackPlugin(), 'configureServer');
    const requests = [
      { url: '/app/assets/index.js' },
      { url: '/app/' },
      { url: '/v1/health' },
    ];

    for (const request of requests) {
      const originalUrl = request.url;
      middleware(request, {}, () => {});
      expect(request.url).toBe(originalUrl);
    }
  });
});
