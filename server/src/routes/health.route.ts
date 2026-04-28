import type { FastifyPluginAsync } from 'fastify';

import {
  readinessCheckNames,
  type ReadinessChecks,
  type ReadinessCheckName,
  type ReadinessCheckStatus,
} from '../readiness';

const READINESS_CACHE_TTL_MS = 5_000;

type HealthRouteOptions = {
  readinessChecks?: ReadinessChecks;
};

type ReadinessResponse = {
  status: 'ok' | 'degraded';
  checks: Record<ReadinessCheckName, ReadinessCheckStatus>;
};

type CachedReadinessResponse = {
  body: ReadinessResponse;
  expiresAt: number;
  statusCode: 200 | 503;
};

const toLoggableReadinessError = (error: unknown): Record<string, unknown> => {
  if (!(error instanceof Error)) {
    return { message: 'Unknown readiness error' };
  }

  return {
    name: error.name,
    message: error.message,
    ...(typeof (error as Error & { code?: unknown }).code === 'string'
      ? { code: (error as Error & { code: string }).code }
      : {}),
  };
};

export const healthRoute: FastifyPluginAsync<HealthRouteOptions> = async (app, options) => {
  let cachedReadinessResponse: CachedReadinessResponse | undefined;

  app.get('/health', { config: { rateLimit: false } }, async () => {
    return {
      status: 'ok',
    };
  });

  app.get('/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    const now = Date.now();
    if (cachedReadinessResponse && cachedReadinessResponse.expiresAt > now) {
      reply.code(cachedReadinessResponse.statusCode);
      return cachedReadinessResponse.body;
    }

    const checks = {} as Record<ReadinessCheckName, ReadinessCheckStatus>;
    let hasFailure = false;

    for (const checkName of readinessCheckNames) {
      const check = options.readinessChecks?.[checkName];
      if (!check) {
        checks[checkName] = 'not_configured';
        continue;
      }

      try {
        await check();
        checks[checkName] = 'ok';
      } catch (error) {
        hasFailure = true;
        checks[checkName] = 'failed';
        app.log.error({ check: checkName, error: toLoggableReadinessError(error) }, 'Readiness check failed');
      }
    }

    const statusCode = hasFailure ? 503 : 200;
    reply.code(statusCode);

    const body: ReadinessResponse = {
      status: hasFailure ? 'degraded' : 'ok',
      checks,
    };

    cachedReadinessResponse = {
      body,
      expiresAt: now + READINESS_CACHE_TTL_MS,
      statusCode,
    };

    return body;
  });
};
