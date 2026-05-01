import type { GraphApiService } from '../../nostr-api/graph-api-service';
import type { IdentityApiService } from '../../nostr-api/identity-api-service';
import type { UserSearchApiService } from '../../nostr-api/user-search-api-service';
import type { SocialFeedService } from '../../nostr/social-feed-service';
import type { SocialNotificationsService } from '../../nostr/social-notifications-service';
import type { OverlayGroupsService } from '../controllers/use-overlay-groups-controller';
import type { OverlaySessionAuthService } from '../controllers/use-overlay-session-controller';
import type { NostrOverlayServices } from '../hooks/useNostrOverlay';
import type { DirectMessagesService } from '../query/direct-messages.query';
import type { SocialPublisher } from '../social-publisher';

export interface OverlayServices extends NostrOverlayServices {
    graphApiService?: GraphApiService;
    socialFeedService?: SocialFeedService;
    socialNotificationsService?: SocialNotificationsService;
    directMessagesService?: DirectMessagesService;
    identityApiService?: IdentityApiService;
    userSearchApiService?: UserSearchApiService;
    socialPublisher?: SocialPublisher;
    authService?: OverlaySessionAuthService;
    groupsService?: OverlayGroupsService;
}

export function createOverlayServices(input: OverlayServices): OverlayServices {
    return input;
}
