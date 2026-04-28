import type {
  FastifyPluginAsync,
  FastifyRequest,
  preHandlerHookHandler,
} from 'fastify';
import { createClient } from '@redis/client';

import { verifyNostrHttpAuth } from '../nostr/http-auth-verify';
import { isProductionRuntime } from '../production-config';
import { resolveRedisUrl } from '../redis/redis-security';
import {
  InMemoryAuthReplayStore,
  RedisAuthReplayStore,
  connectRedisAuthReplayClient,
  resolveAuthReplayStoreMode,
  type AuthReplayStore,
  type RedisAuthReplayClient,
  type RedisAuthReplayConnectionClient,
} from '../security/auth-replay-store';

type StringRecord = Record<string, unknown>;

declare module 'fastify' {
  interface FastifyInstance {
    verifyOwnerAuth: preHandlerHookHandler;
    consumeAuthReplayProof(input: {
      pubkey: string;
      eventId: string;
      ttlSeconds: number;
    }): Promise<void>;
  }
}

const isLowerHexPubkey = (value: string): boolean =>
  value.length === 64 && /^[0-9a-f]+$/.test(value);

const normalizePubkey = (value: string): string => value.trim().toLowerCase();

const toRecord = (value: unknown): StringRecord | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as StringRecord;
};

const pushOwnerCandidate = (source: StringRecord | null, out: string[]): void => {
  if (!source || !(Object.hasOwn(source, 'ownerPubkey'))) {
    return;
  }

  const value = source.ownerPubkey;
  if (typeof value === 'string') {
    out.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        out.push(item);
      }
    }
  }
};

const readOwnerPubkeys = (request: FastifyRequest): string[] => {
  const pubkeys: string[] = [];

  pushOwnerCandidate(toRecord(request.params), pubkeys);
  pushOwnerCandidate(toRecord(request.query), pubkeys);
  pushOwnerCandidate(toRecord(request.body), pubkeys);

  return pubkeys
    .map(normalizePubkey)
    .filter((pubkey, index, list) => pubkey.length > 0 && list.indexOf(pubkey) === index);
};

const buildHttpError = (
  statusCode: number,
  code: string,
  message: string,
): Error & { statusCode: number; code: string } => {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const AUTH_PROOF_REPLAY_TTL_SECONDS = 120;
const DEFAULT_REDIS_COMMAND_TIMEOUT_MS = 500;

export interface OwnerAuthPluginOptions {
  authReplayStore?: AuthReplayStore;
}

const toLoggableRedisError = (error: unknown): Record<string, unknown> => {
  if (!(error instanceof Error)) {
    return { message: 'Unknown Redis error' };
  }

  return {
    name: error.name,
    message: error.message,
    ...(typeof (error as Error & { code?: unknown }).code === 'string'
      ? { code: (error as Error & { code: string }).code }
      : {}),
  };
};

export const ownerAuthPlugin: FastifyPluginAsync<OwnerAuthPluginOptions> = async (app, options) => {
  let authReplayStore = options.authReplayStore;
  let ownsAuthReplayStore = false;

  if (authReplayStore && isProductionRuntime()) {
    throw new Error('Injected auth replay stores are not allowed in production. Use Redis-backed replay protection.');
  }

  if (!authReplayStore) {
    const storeMode = resolveAuthReplayStoreMode();
    if (storeMode === 'redis') {
      const redisClient = createClient({
        url: resolveRedisUrl(),
        disableOfflineQueue: true,
        socket: {
          connectTimeout: DEFAULT_REDIS_COMMAND_TIMEOUT_MS,
          reconnectStrategy: false,
        },
      });
      redisClient.on('error', (error: unknown) => {
        app.log.error({ error: toLoggableRedisError(error) }, 'Redis auth replay client error');
      });
      const redisReplayStore = new RedisAuthReplayStore(redisClient as RedisAuthReplayClient);
      try {
        await connectRedisAuthReplayClient(
          redisClient as RedisAuthReplayConnectionClient,
          DEFAULT_REDIS_COMMAND_TIMEOUT_MS,
        );
      } catch (error) {
        await redisClient.quit().catch(() => undefined);
        throw error;
      }
      authReplayStore = redisReplayStore;
      ownsAuthReplayStore = true;
    } else {
      authReplayStore = new InMemoryAuthReplayStore();
      ownsAuthReplayStore = true;
    }
  }

  app.addHook('onClose', async () => {
    if (ownsAuthReplayStore) {
      await authReplayStore.close();
    }
  });

  app.decorate('consumeAuthReplayProof', async (input) => {
    let replayResult: 'consumed' | 'replayed';
    try {
      replayResult = await authReplayStore.consume(input);
    } catch (error) {
      app.log.error({ error: toLoggableRedisError(error) }, 'Auth replay store failed');
      throw buildHttpError(401, 'OWNER_AUTH_REPLAY_STORE_FAILED', 'Nostr auth proof replay check failed');
    }

    if (replayResult === 'replayed') {
      throw buildHttpError(401, 'OWNER_AUTH_REPLAY', 'Nostr auth proof already used');
    }
  });

  app.decorate('verifyOwnerAuth', async (request) => {
    const authResult = verifyNostrHttpAuth(request);
    if (!authResult.ok) {
      throw buildHttpError(
        401,
        'OWNER_AUTH_INVALID',
        'Missing or invalid Nostr auth proof',
      );
    }

    const authenticatedPubkey = normalizePubkey(authResult.pubkey);
    if (!isLowerHexPubkey(authenticatedPubkey)) {
      throw buildHttpError(401, 'OWNER_AUTH_INVALID', 'Missing or invalid Nostr auth proof');
    }

    await app.consumeAuthReplayProof({
      pubkey: authenticatedPubkey,
      eventId: authResult.event.id,
      ttlSeconds: AUTH_PROOF_REPLAY_TTL_SECONDS,
    });

    const ownerPubkeys = readOwnerPubkeys(request);
    if (ownerPubkeys.length === 0) {
      throw buildHttpError(403, 'OWNER_PUBKEY_MISMATCH', 'ownerPubkey mismatch');
    }

    const hasMismatch = ownerPubkeys.some((ownerPubkey) => {
      if (!isLowerHexPubkey(ownerPubkey)) {
        return true;
      }

      return ownerPubkey !== authenticatedPubkey;
    });

    if (hasMismatch) {
      throw buildHttpError(403, 'OWNER_PUBKEY_MISMATCH', 'ownerPubkey mismatch');
    }

    const context = (request as FastifyRequest & { context?: {
      requestId: string;
      authenticatedPubkey?: string;
    } }).context;
    if (context) {
      context.authenticatedPubkey = authenticatedPubkey;
    }
  });
};

(ownerAuthPlugin as FastifyPluginAsync & { [key: symbol]: boolean })[
  Symbol.for('skip-override')
] = true;
