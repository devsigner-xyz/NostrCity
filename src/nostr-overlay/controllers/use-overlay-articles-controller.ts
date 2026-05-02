import { useMemo } from 'react';
import type { SocialFeedService } from '../../nostr/social-feed-service';
import { useArticlesFeedInfiniteQuery } from '../query/following-feed.query';

interface UseOverlayArticlesControllerOptions {
    ownerPubkey?: string;
    follows: string[];
    activeHashtags?: string[];
    isArticlesRoute: boolean;
    service: SocialFeedService;
    pageSize?: number;
}

export function useOverlayArticlesController(options: UseOverlayArticlesControllerOptions) {
    const canAccessArticles = Boolean(options.ownerPubkey);
    const query = useArticlesFeedInfiniteQuery({
        ...(options.ownerPubkey ? { ownerPubkey: options.ownerPubkey } : {}),
        follows: options.follows,
        ...(options.activeHashtags && options.activeHashtags.length > 0 ? { hashtags: options.activeHashtags } : {}),
        service: options.service,
        enabled: canAccessArticles && options.isArticlesRoute,
        pageSize: options.pageSize ?? 10,
    });

    const items = useMemo(
        () => query.data?.pages.flatMap((page) => page.items) ?? [],
        [query.data]
    );

    return {
        canAccessArticles,
        items,
        isLoading: query.isLoading,
        isRefreshing: query.isRefetching,
        isLoadingMore: query.isFetchingNextPage,
        error: query.error?.message ?? null,
        hasMore: Boolean(query.hasNextPage),
        loadMore: async () => { await query.fetchNextPage(); },
        refresh: async () => { await query.refetch(); },
    };
}
