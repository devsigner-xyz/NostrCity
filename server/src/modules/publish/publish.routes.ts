import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { verifyNostrHttpAuth } from '../../nostr/http-auth-verify';
import {
  publishForwardBodySchema,
  publishForwardResponseSchema,
  type PublishForwardRequestDto,
} from './publish.schemas';
import {
  createPublishService,
  type PublishService,
  validatePublishForwardRequest,
} from './publish.service';

export interface PublishRoutesOptions {
  service?: PublishService;
}

export const publishRoutes: FastifyPluginAsync<PublishRoutesOptions> = async (app, options) => {
  if (!app.hasDecorator('consumeAuthReplayProof')) {
    throw new Error('publishRoutes requires ownerAuthPlugin to be registered first.');
  }

  const service = options.service ?? createPublishService();
  const lowerHex64Pattern = /^[0-9a-f]{64}$/;
  const authProofReplayTtlSeconds = 120;

  const verifyPublishOwnerAuth = async (
    request: FastifyRequest<{ Body: PublishForwardRequestDto }>,
  ): Promise<void> => {
    const authResult = verifyNostrHttpAuth(request);
    if (!authResult.ok) {
      const error = new Error('Missing or invalid Nostr auth proof') as Error & {
        statusCode: number;
        code: string;
      };
      error.statusCode = 401;
      error.code = 'OWNER_AUTH_INVALID';
      throw error;
    }

    const authenticatedPubkey = authResult.pubkey.trim().toLowerCase();
    await app.consumeAuthReplayProof({
      pubkey: authenticatedPubkey,
      eventId: authResult.event.id,
      ttlSeconds: authProofReplayTtlSeconds,
    });

    const eventPubkey = request.body.event.pubkey.trim().toLowerCase();

    if (
      !lowerHex64Pattern.test(authenticatedPubkey) ||
      !lowerHex64Pattern.test(eventPubkey) ||
      authenticatedPubkey !== eventPubkey
    ) {
      const error = new Error('event.pubkey mismatch') as Error & {
        statusCode: number;
        code: string;
      };
      error.statusCode = 403;
      error.code = 'OWNER_PUBKEY_MISMATCH';
      throw error;
    }
  };

  app.post<{
    Body: PublishForwardRequestDto;
  }>(
    '/publish/forward',
    {
      preHandler: verifyPublishOwnerAuth,
      config: {
        rateLimit: {
          max: 20,
          windowMs: 60_000,
        },
      },
      schema: {
        body: publishForwardBodySchema,
        response: {
          200: publishForwardResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const validationResult = validatePublishForwardRequest(request.body);
      if (!validationResult.ok) {
        return reply.status(400).send({
          error: {
            code: validationResult.error.code,
            message: validationResult.error.message,
            requestId: request.id,
          },
        });
      }

      return service.forward(validationResult.value);
    },
  );
};
