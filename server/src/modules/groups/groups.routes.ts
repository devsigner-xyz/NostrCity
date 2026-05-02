import type { FastifyPluginAsync } from 'fastify';

import {
  relayGroupsQuerySchema,
  relayGroupsResponseSchema,
  type RelayGroupsQuery,
} from './groups.schemas';
import { createGroupsService, type GroupsService } from './groups.service';

export interface GroupsRoutesOptions {
  service?: GroupsService;
}

export const groupsRoutes: FastifyPluginAsync<GroupsRoutesOptions> = async (app, options) => {
  const service = options.service ?? createGroupsService();

  app.get<{
    Querystring: RelayGroupsQuery;
  }>(
    '/groups/relay-groups',
    {
      config: {
        rateLimit: {
          max: 90,
          windowMs: 60_000,
        },
      },
      schema: {
        querystring: relayGroupsQuerySchema,
        response: {
          200: relayGroupsResponseSchema,
        },
      },
      preHandler: async (request, reply) => {
        const query = new URL(request.url, 'http://localhost').searchParams;
        const hasPrivateContext = [...query.keys()].some((key) => key !== 'relay');
        if (hasPrivateContext) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'group discovery only accepts relay',
            },
          });
        }
      },
    },
    async (request) => service.getRelayGroups(request.query),
  );
};
