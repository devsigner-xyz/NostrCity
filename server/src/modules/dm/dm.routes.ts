import type { FastifyPluginAsync } from 'fastify';

import { writeSseChunk } from '../../sse/sse-writer';
import {
  dmConversationQuerySchema,
  dmEventsResponseSchema,
  dmInboxQuerySchema,
  dmStreamQuerySchema,
  type DmConversationQuery,
  type DmInboxQuery,
  type DmStreamQuery,
} from './dm.schemas';
import { createDmService, type DmService } from './dm.service';

export interface DmRoutesOptions {
  service?: DmService;
}

export const dmRoutes: FastifyPluginAsync<DmRoutesOptions> = async (app, options) => {
  const service = options.service ?? createDmService();
  const eventIdPattern = /^[0-9a-f]{64}$/;

  app.get<{
    Querystring: DmInboxQuery;
  }>(
    '/dm/events/inbox',
    {
      preHandler: app.verifyOwnerAuth,
      schema: {
        querystring: dmInboxQuerySchema,
        response: {
          200: dmEventsResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getInboxEvents(request.query);
    },
  );

  app.get<{
    Querystring: DmConversationQuery;
  }>(
    '/dm/events/conversation',
    {
      preHandler: app.verifyOwnerAuth,
      schema: {
        querystring: dmConversationQuerySchema,
        response: {
          200: dmEventsResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getConversationEvents(request.query);
    },
  );

  app.get<{
    Querystring: DmStreamQuery;
  }>(
    '/dm/stream',
    {
      preHandler: app.verifyOwnerAuth,
      schema: {
        querystring: dmStreamQuerySchema,
      },
    },
    async (request, reply) => {
      const abortController = new AbortController();
      const abortStream = () => {
        if (!abortController.signal.aborted) {
          abortController.abort();
        }
      };

      request.raw.on('aborted', abortStream);
      request.raw.on('close', abortStream);
      reply.raw.on('close', abortStream);
      reply.raw.on('error', abortStream);

      reply.hijack();
      reply.raw.setHeader('content-type', 'text/event-stream; charset=utf-8');
      reply.raw.setHeader('cache-control', 'no-cache, no-store, must-revalidate');
      reply.raw.setHeader('connection', 'keep-alive');
      reply.raw.setHeader('x-accel-buffering', 'no');

      await writeSseChunk(': connected\n\n', reply);

      try {
        for await (const item of service.streamDmEvents(request.query, abortController.signal)) {
          if (request.raw.aborted || reply.raw.writableEnded) {
            abortStream();
            break;
          }

          if (!eventIdPattern.test(item.id)) {
            continue;
          }

          const payload = JSON.stringify(item);

          const idWritten = await writeSseChunk(`id: ${item.id}\n`, reply);
          if (!idWritten) {
            abortStream();
            break;
          }

          const eventWritten = await writeSseChunk('event: dm\n', reply);
          if (!eventWritten) {
            abortStream();
            break;
          }

          const dataWritten = await writeSseChunk(`data: ${payload}\n\n`, reply);
          if (!dataWritten) {
            abortStream();
            break;
          }
        }
      } catch (error) {
        const disconnected = abortController.signal.aborted || request.raw.aborted;

        if (!disconnected && !reply.raw.writableEnded && !reply.raw.destroyed) {
          app.log.error(error, 'dm stream failed');
          await writeSseChunk('event: error\n', reply);
          await writeSseChunk('data: {"type":"error","message":"stream failed"}\n\n', reply);
        }
      } finally {
        abortStream();
        request.raw.off('aborted', abortStream);
        request.raw.off('close', abortStream);
        reply.raw.off('close', abortStream);
        reply.raw.off('error', abortStream);
      }

      if (!reply.raw.writableEnded) {
        reply.raw.end();
      }
    },
  );
};
