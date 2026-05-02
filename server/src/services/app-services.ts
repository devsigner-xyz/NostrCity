import { SimplePool } from 'nostr-tools';

import { createContentService, type ContentService } from '../modules/content/content.service';
import { createDmService, type DmService } from '../modules/dm/dm.service';
import { createGraphService, type GraphService } from '../modules/graph/graph.service';
import { createGroupsService, type GroupsService } from '../modules/groups/groups.service';
import { createIdentityService, type IdentityService } from '../modules/identity/identity.service';
import {
  createNotificationsService,
  type NotificationsService,
} from '../modules/notifications/notifications.service';
import { createPublishService, type PublishService } from '../modules/publish/publish.service';
import { createSocialService, type SocialService } from '../modules/social/social.service';
import { createUsersService, type UsersService } from '../modules/users/users.service';
import { createRelayQueryExecutor, type RelayQueryExecutor } from '../relay/relay-query-executor';

const DEFAULT_BOOTSTRAP_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

export interface AppServices {
  relayQueryExecutor: RelayQueryExecutor;
  identityService: IdentityService;
  graphService: GraphService;
  groupsService: GroupsService;
  contentService: ContentService;
  socialService: SocialService;
  notificationsService: NotificationsService;
  usersService: UsersService;
  dmService: DmService;
  publishService: PublishService;
}

export interface CreateAppServicesOptions {
  pool?: SimplePool;
  bootstrapRelays?: string[];
  relayQueryExecutor?: RelayQueryExecutor;
}

export const createAppServices = (options: CreateAppServicesOptions = {}): AppServices => {
  const pool = options.pool ?? new SimplePool();
  const bootstrapRelays = options.bootstrapRelays ?? DEFAULT_BOOTSTRAP_RELAYS;
  const relayQueryExecutor = options.relayQueryExecutor ?? createRelayQueryExecutor({ pool });

  return {
    relayQueryExecutor,
    identityService: createIdentityService({ pool, bootstrapRelays }),
    graphService: createGraphService({ pool, bootstrapRelays, relayQueryExecutor }),
    groupsService: createGroupsService({ pool }),
    contentService: createContentService({ pool, bootstrapRelays, relayQueryExecutor }),
    socialService: createSocialService({ pool, bootstrapRelays }),
    notificationsService: createNotificationsService({ pool, bootstrapRelays, relayQueryExecutor }),
    usersService: createUsersService({ pool, bootstrapRelays, relayQueryExecutor }),
    dmService: createDmService({ pool, bootstrapRelays }),
    publishService: createPublishService(),
  };
};
