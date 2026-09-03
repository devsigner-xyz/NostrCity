import type { FastifyPluginAsync } from 'fastify';

import { isProductionRuntime } from '../production-config';

type EnvLike = Partial<Record<string, string | undefined>>;

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

export const resolveAllowedOrigins = (env: EnvLike = process.env): Set<string> => {
  const configuredOrigins = env.BFF_CORS_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins && configuredOrigins.length > 0) {
    return new Set(configuredOrigins);
  }

  if (isProductionRuntime(env)) {
    throw new Error('BFF_CORS_ORIGINS must be set in production');
  }

  return new Set(DEFAULT_ALLOWED_ORIGINS);
};

const CORS_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const CORS_HEADERS = 'Content-Type,Authorization,X-Request-Id';
export const corsPlugin: FastifyPluginAsync = async (app) => {
  const allowedOrigins = resolveAllowedOrigins();

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;

    if (!origin) {
      return;
    }

    if (!allowedOrigins.has(origin)) {
      reply.status(403).send({
        error: {
          code: 'FORBIDDEN_ORIGIN',
          message: 'Origin is not allowed',
          requestId: request.id,
        },
      });
      return;
    }

    reply.header('access-control-allow-origin', origin);
    reply.header('vary', 'Origin');
    reply.header('access-control-allow-methods', CORS_METHODS);
    reply.header('access-control-allow-headers', CORS_HEADERS);
    reply.header('access-control-max-age', '600');

    if (request.method === 'OPTIONS') {
      reply.code(204).send();
    }
  });
};

(corsPlugin as FastifyPluginAsync & { [key: symbol]: boolean })[
  Symbol.for('skip-override')
] = true;
