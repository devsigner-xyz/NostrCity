import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    _requestContext: {
      requestId: string;
      authenticatedPubkey?: string;
    } | null;
    context: {
      requestId: string;
      authenticatedPubkey?: string;
    };
    _requestStartTimeMs: number | null;
  }
}

const LOGGABLE_FIELD_KEYS = new Set([
  'limit',
  'since',
  'until',
  'relayScope',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const pickLoggableFields = (value: unknown): Record<string, string | number | boolean> => {
  if (!isRecord(value)) {
    return {};
  }

  const output: Record<string, string | number | boolean> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!LOGGABLE_FIELD_KEYS.has(key)) {
      continue;
    }

    if (
      typeof candidate === 'string' ||
      typeof candidate === 'number' ||
      typeof candidate === 'boolean'
    ) {
      output[key] = candidate;
    }
  }

  return output;
};

const addDerivedSensitiveFieldMetadata = (
  sanitized: Record<string, unknown>,
  value: Record<string, unknown>,
): void => {
  if (typeof value.ownerPubkey === 'string') {
    sanitized.hasOwnerPubkey = true;
  }

  if (typeof value.peerPubkey === 'string') {
    sanitized.hasPeerPubkey = true;
  }

  if (typeof value.q === 'string') {
    sanitized.queryLength = value.q.trim().length;
  }

  if (typeof value.hashtag === 'string') {
    sanitized.hasHashtag = value.hashtag.trim().length > 0;
  }
};

export const sanitizeRequestBody = (body: unknown): Record<string, unknown> | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {
    ...pickLoggableFields(body),
  };

  addDerivedSensitiveFieldMetadata(sanitized, body);

  if (isRecord(body.event) && typeof body.event.kind === 'number') {
    sanitized.eventKind = body.event.kind;
  }

  if (Array.isArray(body.relays)) {
    sanitized.relayCount = body.relays.length;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
};

export const sanitizeRequestQuery = (
  query: FastifyRequest['query'],
): Record<string, string | number | boolean> | undefined => {
  const sanitized = pickLoggableFields(query);
  if (isRecord(query)) {
    addDerivedSensitiveFieldMetadata(sanitized, query);
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
};

export const sanitizeRequestHeaders = (
  headers: FastifyRequest['headers'],
): Record<string, string> | undefined => {
  void headers;
  return undefined;
};

export const requestContextPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest('_requestContext', null);
  app.decorateRequest('_requestStartTimeMs', null);
  app.decorateRequest('context', {
    getter(this: FastifyRequest) {
      if (!this._requestContext) {
        this._requestContext = {
          requestId: this.id,
        };
      }

      return this._requestContext;
    },
    setter(this: FastifyRequest, value: FastifyRequest['context']) {
      this._requestContext = value;
    },
  });

  app.addHook('onRequest', async (request, reply) => {
    request.context = { requestId: request.id };
    request._requestStartTimeMs = Date.now();

    reply.header('x-request-id', request.id);
  });

  app.addHook('onResponse', async (request, reply) => {
    const startedAt = request._requestStartTimeMs ?? Date.now();
    const durationMs = Math.max(0, Date.now() - startedAt);

    request.log.info({
      event: 'request.completed',
      requestId: request.id,
      method: request.method,
      path: request.url.split('?')[0],
      statusCode: reply.statusCode,
      durationMs,
      query: sanitizeRequestQuery(request.query),
      body: sanitizeRequestBody(request.body),
      headers: sanitizeRequestHeaders(request.headers),
      authenticated: Boolean(request.context.authenticatedPubkey),
    });
  });
};

(requestContextPlugin as FastifyPluginAsync & { [key: symbol]: boolean })[
  Symbol.for('skip-override')
] = true;
