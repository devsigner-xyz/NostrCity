import type { SocialFeedItem } from '../../nostr/social-feed-service';
import type { NostrProfile } from '../../nostr/types';
import type { AgoraFeedLayout } from '../../nostr/ui-settings';
import { ArticlesSurface } from '../components/ArticlesSurface';

export interface ArticlesRouteContainerProps {
    items: SocialFeedItem[];
    profilesByPubkey: Record<string, NostrProfile>;
    isLoading: boolean;
    isRefreshing: boolean;
    isLoadingMore: boolean;
    error: string | null;
    hasMore: boolean;
    agoraFeedLayout: AgoraFeedLayout;
    isMobile?: boolean;
    onAgoraFeedLayoutChange: (layout: AgoraFeedLayout) => void;
    onRefresh: () => Promise<void> | void;
    onLoadMore: () => Promise<void> | void;
    onOpenArticle: (eventId: string) => void;
}

export function ArticlesRouteContainer(_props: ArticlesRouteContainerProps) {
    return <ArticlesSurface {..._props} />;
}
