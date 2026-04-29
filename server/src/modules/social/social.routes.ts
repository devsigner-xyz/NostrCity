import type { FastifyPluginAsync } from 'fastify';

import {
  articleParamsSchema,
  articleResponseSchema,
  articlesFeedQuerySchema,
  type ArticleParams,
  type ArticlesFeedQuery,
  engagementBodySchema,
  engagementResponseSchema,
  type EngagementBody,
  followingFeedResponseSchema,
  followingFeedQuerySchema,
  type FollowingFeedQuery,
  threadResponseSchema,
  threadParamsSchema,
  threadQuerySchema,
  type ThreadParams,
  type ThreadQuery,
  viewerReactionsBodySchema,
  viewerReactionsResponseSchema,
  type ViewerReactionsBody,
  viewerRepliesBodySchema,
  viewerRepliesResponseSchema,
  type ViewerRepliesBody,
  viewerZapsBodySchema,
  viewerZapsResponseSchema,
  type ViewerZapsBody,
} from './social.schemas';
import { createSocialService, type SocialService } from './social.service';

export interface SocialRoutesOptions {
  service?: SocialService;
}

export const socialRoutes: FastifyPluginAsync<SocialRoutesOptions> = async (
  app,
  options,
) => {
  const service = options.service ?? createSocialService();

  app.get<{
    Querystring: FollowingFeedQuery;
  }>(
    '/social/feed/following',
    {
      schema: {
        querystring: followingFeedQuerySchema,
        response: {
          200: followingFeedResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getFollowingFeed(request.query);
    },
  );

  app.get<{
    Querystring: ArticlesFeedQuery;
  }>(
    '/social/feed/articles',
    {
      schema: {
        querystring: articlesFeedQuerySchema,
        response: {
          200: followingFeedResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getArticlesFeed(request.query);
    },
  );

  app.get<{
    Params: ArticleParams;
  }>(
    '/social/articles/:eventId',
    {
      schema: {
        params: articleParamsSchema,
        response: {
          200: articleResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getArticleById(request.params);
    },
  );

  app.get<{
    Params: ThreadParams;
    Querystring: ThreadQuery;
  }>(
    '/social/thread/:rootEventId',
    {
      schema: {
        params: threadParamsSchema,
        querystring: threadQuerySchema,
        response: {
          200: threadResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getThread({
        rootEventId: request.params.rootEventId,
        limit: request.query.limit,
        until: request.query.until,
      });
    },
  );

  app.post<{
    Body: EngagementBody;
  }>(
    '/social/engagement',
    {
      schema: {
        body: engagementBodySchema,
        response: {
          200: engagementResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getEngagement(request.body);
    },
  );

  app.post<{
    Body: ViewerReactionsBody;
  }>(
    '/social/viewer-reactions',
    {
      schema: {
        body: viewerReactionsBodySchema,
        response: {
          200: viewerReactionsResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getViewerReactions(request.body);
    },
  );

  app.post<{
    Body: ViewerZapsBody;
  }>(
    '/social/viewer-zaps',
    {
      schema: {
        body: viewerZapsBodySchema,
        response: {
          200: viewerZapsResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getViewerZaps(request.body);
    },
  );

  app.post<{
    Body: ViewerRepliesBody;
  }>(
    '/social/viewer-replies',
    {
      schema: {
        body: viewerRepliesBodySchema,
        response: {
          200: viewerRepliesResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getViewerReplies(request.body);
    },
  );
};
