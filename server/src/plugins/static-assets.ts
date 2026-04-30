import fastifyStatic from '@fastify/static';
import { access, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';

export interface StaticAssetsOptions {
  rootPath?: string;
}

const defaultAssetsRoot = join(__dirname, '..', '..', '..', 'dist');

const fileExists = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const landingCandidates = ['index.html', join('app', 'index.html')];
const appRoutePatterns = [
  '/agora',
  '/agora/*',
  '/city-stats',
  '/notifications',
  '/chats',
  '/relays',
  '/relays/*',
  '/discover',
  '/wallet',
  '/profile',
  '/user-search',
  '/settings',
  '/settings/*',
  '/login',
];

export const staticAssetsPlugin: FastifyPluginAsync<StaticAssetsOptions> = async (
  app,
  options,
) => {
  const rootPath = options.rootPath ?? defaultAssetsRoot;

  if (!(await pathExists(rootPath))) {
    return;
  }

  await app.register(fastifyStatic, {
    root: rootPath,
    prefix: '/',
  });

  app.get('/', async (_request, reply) => {
    for (const candidate of landingCandidates) {
      if (await fileExists(join(rootPath, candidate))) {
        return reply.sendFile(candidate);
      }
    }

    reply.callNotFound();
  });

  app.get('/index.html', async (_request, reply) => {
    for (const candidate of landingCandidates) {
      if (await fileExists(join(rootPath, candidate))) {
        return reply.sendFile(candidate);
      }
    }

    reply.callNotFound();
  });

  app.get('/docs/*', async (request, reply) => {
    const rawPath = (request.params as { '*': string })['*'];
    const cleanPath = rawPath.replace(/^\/+/, '');

    if (cleanPath.split(/[\\/]/).includes('..')) {
      reply.callNotFound();
      return;
    }

    const candidates = cleanPath.endsWith('/')
      ? [join('docs', cleanPath, 'index.html')]
      : [join('docs', cleanPath), join('docs', `${cleanPath}.html`), join('docs', cleanPath, 'index.html')];

    for (const candidate of candidates) {
      if (await fileExists(join(rootPath, candidate))) {
        return reply.sendFile(candidate);
      }
    }

    reply.callNotFound();
  });

  const sendAppShell = async (reply: FastifyReply) => {
    const appShellPath = join(rootPath, 'app', 'index.html');
    if (!(await fileExists(appShellPath))) {
      reply.callNotFound();
      return;
    }

    return reply.sendFile('app/index.html');
  };

  app.get('/app/*', async (_request, reply) => sendAppShell(reply));

  for (const pattern of appRoutePatterns) {
    app.get(pattern, async (_request, reply) => sendAppShell(reply));
  }
};
