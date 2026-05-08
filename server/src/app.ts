import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';

import { contentRoutes } from './modules/content/content.routes';
import type { ContentService } from './modules/content/content.service';
import { graphRoutes } from './modules/graph/graph.routes';
import type { GraphService } from './modules/graph/graph.service';
import { groupsRoutes } from './modules/groups/groups.routes';
import type { GroupsService } from './modules/groups/groups.service';
import { identityRoutes } from './modules/identity/identity.routes';
import type { IdentityService } from './modules/identity/identity.service';
import { dmRoutes } from './modules/dm/dm.routes';
import type { DmService } from './modules/dm/dm.service';
import { notificationsRoutes } from './modules/notifications/notifications.routes';
import type { NotificationsService } from './modules/notifications/notifications.service';
import { publishRoutes } from './modules/publish/publish.routes';
import type { PublishService } from './modules/publish/publish.service';
import { socialRoutes } from './modules/social/social.routes';
import type { SocialService } from './modules/social/social.service';
import { usersRoutes } from './modules/users/users.routes';
import type { UsersService } from './modules/users/users.service';
import type { AuthReplayStore } from './security/auth-replay-store';
import { corsPlugin } from './plugins/cors';
import { errorHandlerPlugin } from './plugins/error-handler';
import { ownerAuthPlugin } from './plugins/owner-auth';
import { rateLimitPlugin } from './plugins/rate-limit';
import { requestContextPlugin } from './plugins/request-context';
import { securityHeadersPlugin } from './plugins/security-headers';
import { staticAssetsPlugin } from './plugins/static-assets';
import { validateProductionSecurityConfig } from './production-config';
import { isPublicDemoMode } from './public-demo-mode';
import type { ReadinessChecks } from './readiness';
import { healthRoute } from './routes/health.route';
import { nip05WellKnownRoute } from './routes/nip05-well-known.route';
import { createAppServices } from './services/app-services';

export interface BuildAppOptions {
  identityService?: IdentityService;
  graphService?: GraphService;
  groupsService?: GroupsService;
  contentService?: ContentService;
  socialService?: SocialService;
  notificationsService?: NotificationsService;
  usersService?: UsersService;
  dmService?: DmService;
  publishService?: PublishService;
  authReplayStore?: AuthReplayStore;
  readinessChecks?: ReadinessChecks;
  staticAssetsPath?: string;
  publicDemoMode?: boolean;
}

const resolveTrustProxy = (): FastifyServerOptions['trustProxy'] => {
  const configured = process.env.FASTIFY_TRUST_PROXY?.trim();
  if (!configured) {
    return 'loopback';
  }

  if (configured === 'true') {
    return true;
  }

  if (configured === 'false') {
    return false;
  }

  const allowList = configured
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return allowList.length > 0 ? allowList : 'loopback';
};

export const buildApp = (options: BuildAppOptions = {}): FastifyInstance => {
  validateProductionSecurityConfig();

  const app = Fastify({ logger: false, trustProxy: resolveTrustProxy() });
  const defaultServices = createAppServices();
  const readinessChecks: ReadinessChecks = { ...options.readinessChecks };
  const publicDemoMode = options.publicDemoMode ?? isPublicDemoMode();

  app.register(requestContextPlugin);
  app.register(corsPlugin);
  app.register(securityHeadersPlugin);
  app.register(rateLimitPlugin, { readinessChecks });
  if (!publicDemoMode) {
    app.register(ownerAuthPlugin, { authReplayStore: options.authReplayStore });
  }
  app.register(errorHandlerPlugin);

  app.register(nip05WellKnownRoute);
  app.register(healthRoute, { prefix: '/v1', readinessChecks });
  app.register(identityRoutes, {
    prefix: '/v1',
    service: options.identityService ?? defaultServices.identityService,
  });
  app.register(graphRoutes, {
    prefix: '/v1',
    service: options.graphService ?? defaultServices.graphService,
  });
  app.register(groupsRoutes, {
    prefix: '/v1',
    service: options.groupsService ?? defaultServices.groupsService,
  });
  app.register(contentRoutes, {
    prefix: '/v1',
    service: options.contentService ?? defaultServices.contentService,
  });
  app.register(socialRoutes, {
    prefix: '/v1',
    service: options.socialService ?? defaultServices.socialService,
    publicDemoMode,
  });
  app.register(usersRoutes, {
    prefix: '/v1',
    service: options.usersService ?? defaultServices.usersService,
  });

  if (!publicDemoMode) {
    app.register(notificationsRoutes, {
      prefix: '/v1',
      service: options.notificationsService ?? defaultServices.notificationsService,
    });
    app.register(dmRoutes, {
      prefix: '/v1',
      service: options.dmService ?? defaultServices.dmService,
    });
    app.register(publishRoutes, {
      prefix: '/v1',
      service: options.publishService ?? defaultServices.publishService,
    });
  }

  app.register(staticAssetsPlugin, { rootPath: options.staticAssetsPath });

  return app;
};
