import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '../../nostr/types';
import type {
    SocialEngagementByEventId,
    SocialFeedPage,
    SocialFeedService,
    SocialThreadPage,
    ViewerReactionByEventId,
    ViewerReplyByEventId,
    ViewerZapByEventId,
} from '../../nostr/social-feed-service';
import { nostrOverlayQueryKeys } from './keys';
import { createSocialQueryOptions } from './options';
import { normalizeEventIds } from './following-feed.selectors';

const DEFAULT_FEED_PAGE_SIZE = 20;
const DEFAULT_THREAD_PAGE_SIZE = 25;
const HEX_EVENT_ID_PATTERN = /^[0-9a-f]{64}$/;

interface UseFollowingFeedInfiniteQueryOptions {
    ownerPubkey?: string;
    follows: string[];
    hashtag?: string;
    service: SocialFeedService;
    enabled: boolean;
    pageSize?: number;
}

interface UseArticlesFeedInfiniteQueryOptions {
    ownerPubkey?: string;
    follows: string[];
    hashtag?: string;
    service: SocialFeedService;
    enabled: boolean;
    pageSize?: number;
}

interface UseArticleDetailQueryOptions {
    eventId: string | null;
    service: SocialFeedService;
    enabled: boolean;
}

interface UseThreadInfiniteQueryOptions {
    rootEventId: string | null;
    service: SocialFeedService;
    enabled: boolean;
    pageSize?: number;
}

interface UseFollowingFeedEngagementQueryOptions {
    eventIds: string[];
    service: SocialFeedService;
    enabled: boolean;
}

interface UseViewerReactionsQueryOptions {
    ownerPubkey?: string;
    eventIds: string[];
    service: SocialFeedService;
    enabled: boolean;
}

interface UseViewerZapsQueryOptions {
    ownerPubkey?: string;
    eventIds: string[];
    service: SocialFeedService;
    enabled: boolean;
}

interface UseViewerRepliesQueryOptions {
    ownerPubkey?: string;
    eventIds: string[];
    service: SocialFeedService;
    enabled: boolean;
}

function normalizeHashtag(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalized = value.trim().replace(/^#+/, '').toLowerCase();
    return normalized.length > 0 ? normalized : undefined;
}

export function useFollowingFeedInfiniteQuery(options: UseFollowingFeedInfiniteQueryOptions) {
    const follows = normalizeEventIds(options.follows);
    const hashtag = normalizeHashtag(options.hashtag);
    const pageSize = Math.max(1, options.pageSize ?? DEFAULT_FEED_PAGE_SIZE);

    return useInfiniteQuery<SocialFeedPage, Error>(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.followingFeed({
            ...(options.ownerPubkey ? { ownerPubkey: options.ownerPubkey } : {}),
            follows,
            ...(hashtag ? { hashtag } : {}),
            pageSize,
        }),
        queryFn: ({ pageParam }: { pageParam: unknown }) => {
            const until = typeof pageParam === 'number' ? pageParam : undefined;
            if (hashtag) {
                return options.service.loadHashtagFeed({
                    hashtag,
                    limit: pageSize,
                    ...(until !== undefined ? { until } : {}),
                });
            }

            return options.service.loadFollowingFeed({
                follows,
                limit: pageSize,
                ...(until !== undefined ? { until } : {}),
            });
        },
        enabled: options.enabled && (Boolean(hashtag) || follows.length > 0),
        initialPageParam: undefined,
        getNextPageParam: (lastPage: SocialFeedPage) => (lastPage.hasMore ? lastPage.nextUntil : undefined),
    }));
}

export function useArticlesFeedInfiniteQuery(options: UseArticlesFeedInfiniteQueryOptions) {
    const follows = normalizeEventIds(options.follows);
    const hashtag = normalizeHashtag(options.hashtag);
    const pageSize = Math.max(1, options.pageSize ?? DEFAULT_FEED_PAGE_SIZE);

    return useInfiniteQuery<SocialFeedPage, Error>(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.articlesFeed({
            ...(options.ownerPubkey ? { ownerPubkey: options.ownerPubkey } : {}),
            follows,
            ...(hashtag ? { hashtag } : {}),
            pageSize,
        }),
        queryFn: ({ pageParam }: { pageParam: unknown }) => {
            const until = typeof pageParam === 'number' ? pageParam : undefined;
            return options.service.loadArticlesFeed({
                authors: follows,
                ...(hashtag ? { hashtag } : {}),
                limit: pageSize,
                ...(until !== undefined ? { until } : {}),
            });
        },
        enabled: options.enabled && follows.length > 0,
        initialPageParam: undefined,
        getNextPageParam: (lastPage: SocialFeedPage) => (lastPage.hasMore ? lastPage.nextUntil : undefined),
    }));
}

export function useArticleDetailQuery(options: UseArticleDetailQueryOptions) {
    const eventId = options.eventId?.trim() || null;

    return useQuery<NostrEvent | null, Error>(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.articleDetail({ eventId: eventId ?? '__none__' }),
        queryFn: () => eventId ? options.service.loadArticleById({ eventId }) : Promise.resolve(null),
        enabled: options.enabled && Boolean(eventId),
    }));
}

export function useThreadInfiniteQuery(options: UseThreadInfiniteQueryOptions) {
    const rootEventId = options.rootEventId;
    const pageSize = Math.max(1, options.pageSize ?? DEFAULT_THREAD_PAGE_SIZE);

    return useInfiniteQuery<SocialThreadPage, Error>(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.thread({
            rootEventId: rootEventId || '__none__',
            pageSize,
        }),
        queryFn: ({ pageParam }: { pageParam: unknown }) => {
            if (!rootEventId) {
                return Promise.resolve({
                    root: null,
                    replies: [],
                    hasMore: false,
                });
            }

            const until = typeof pageParam === 'number' ? pageParam : undefined;

            return options.service.loadThread({
                rootEventId,
                limit: pageSize,
                ...(until !== undefined ? { until } : {}),
            });
        },
        enabled: options.enabled && Boolean(rootEventId),
        initialPageParam: undefined,
        getNextPageParam: (lastPage: SocialThreadPage) => (lastPage.hasMore ? lastPage.nextUntil : undefined),
    }));
}

export function normalizeEngagementEventIds(eventIds: string[]): string[] {
    return normalizeEventIds(eventIds).filter((eventId) => HEX_EVENT_ID_PATTERN.test(eventId));
}

export function useFollowingFeedEngagementQuery(options: UseFollowingFeedEngagementQueryOptions) {
    const eventIds = normalizeEngagementEventIds(options.eventIds);

    return useQuery<SocialEngagementByEventId, Error, SocialEngagementByEventId, ReturnType<typeof nostrOverlayQueryKeys.engagement>>(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.engagement({ eventIds }),
        queryFn: () => options.service.loadEngagement({ eventIds }),
        enabled: options.enabled && eventIds.length > 0,
    }));
}

export function useViewerReactionsQuery(options: UseViewerReactionsQueryOptions) {
    const ownerPubkey = options.ownerPubkey?.trim() ?? '';
    const eventIds = normalizeEngagementEventIds(options.eventIds);

    return useQuery<ViewerReactionByEventId, Error, ViewerReactionByEventId, ReturnType<typeof nostrOverlayQueryKeys.viewerReactions>>(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.viewerReactions({ ownerPubkey: ownerPubkey || '__anonymous__', eventIds }),
        queryFn: () => options.service.loadViewerReactions({ ownerPubkey, eventIds }),
        enabled: options.enabled && Boolean(ownerPubkey) && eventIds.length > 0,
    }));
}

export function useViewerZapsQuery(options: UseViewerZapsQueryOptions) {
    const ownerPubkey = options.ownerPubkey?.trim() ?? '';
    const eventIds = normalizeEngagementEventIds(options.eventIds);

    return useQuery<ViewerZapByEventId, Error, ViewerZapByEventId, ReturnType<typeof nostrOverlayQueryKeys.viewerZaps>>(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.viewerZaps({ ownerPubkey: ownerPubkey || '__anonymous__', eventIds }),
        queryFn: () => options.service.loadViewerZaps({ ownerPubkey, eventIds }),
        enabled: options.enabled && Boolean(ownerPubkey) && eventIds.length > 0,
    }));
}

export function useViewerRepliesQuery(options: UseViewerRepliesQueryOptions) {
    const ownerPubkey = options.ownerPubkey?.trim() ?? '';
    const eventIds = normalizeEngagementEventIds(options.eventIds);

    return useQuery<ViewerReplyByEventId, Error, ViewerReplyByEventId, ReturnType<typeof nostrOverlayQueryKeys.viewerReplies>>(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.viewerReplies({ ownerPubkey: ownerPubkey || '__anonymous__', eventIds }),
        queryFn: () => options.service.loadViewerReplies({ ownerPubkey, eventIds }),
        enabled: options.enabled && Boolean(ownerPubkey) && eventIds.length > 0,
    }));
}
