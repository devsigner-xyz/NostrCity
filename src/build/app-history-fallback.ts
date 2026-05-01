import type { Plugin } from 'vite';

type Middleware = (request: { url?: string | undefined }, response: unknown, next: () => void) => void;

function shouldRewriteToAppDocument(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  const { pathname } = new URL(url, 'http://localhost');
  if (!pathname.startsWith('/app/') || pathname === '/app/') {
    return false;
  }

  const lastSegment = pathname.split('/').pop() ?? '';
  return !lastSegment.includes('.');
}

function createMiddleware(): Middleware {
  return (request, _response, next) => {
    if (shouldRewriteToAppDocument(request.url)) {
      request.url = '/app/index.html';
    }

    next();
  };
}

export function createAppHistoryFallbackPlugin(): Plugin {
  return {
    name: 'nostr-city-app-history-fallback',
    configureServer(server) {
      const middleware = createMiddleware();
      server.middlewares.use((request, response, next) => middleware(request, response, next));
    },
    configurePreviewServer(server) {
      const middleware = createMiddleware();
      server.middlewares.use((request, response, next) => middleware(request, response, next));
    },
  };
}
