import {
    toArticleFeedItem,
    toSocialFeedItem,
    toSocialThreadItem,
    type SocialEngagementByEventId,
    type SocialFeedPage,
    type SocialFeedService,
    type SocialThreadPage,
    type ViewerReactionByEventId,
    type ViewerReplyByEventId,
    type ViewerZapByEventId,
} from '../nostr/social-feed-service';
import type { NostrEvent } from '../nostr/types';
import { createHttpClient, type HttpClient } from './http-client';

interface SocialEventDto {
    id: string;
    pubkey: string;
    kind: number;
    createdAt: number;
    content: string;
    tags: string[][];
    sig?: string;
}

interface FollowingFeedResponseDto {
    items: SocialEventDto[];
    hasMore: boolean;
    nextUntil: number | null;
}

interface ThreadResponseDto {
    root: SocialEventDto | null;
    replies: SocialEventDto[];
    hasMore: boolean;
    nextUntil: number | null;
}

interface EngagementMetricsDto {
    replies: number;
    reposts: number;
    reactions: number;
    zaps: number;
    zapSats: number;
}

interface EngagementResponseDto {
    byEventId: Record<string, EngagementMetricsDto>;
}

interface ViewerReactionDto {
    eventId: string;
    reactionEventId: string;
    emoji: string;
    createdAt: number;
}

interface ViewerReactionsResponseDto {
    byEventId: Record<string, ViewerReactionDto>;
}

interface ViewerZapDto {
    eventId: string;
    zapReceiptEventId: string;
    amountSats: number;
    createdAt: number;
}

interface ViewerZapsResponseDto {
    byEventId: Record<string, ViewerZapDto>;
}

interface ViewerReplyDto {
    eventId: string;
    replyEventId: string;
    createdAt: number;
}

interface ViewerRepliesResponseDto {
    byEventId: Record<string, ViewerReplyDto>;
}

interface ArticleDetailResponseDto {
    event: SocialEventDto | null;
}

export interface CreateSocialFeedApiServiceOptions {
    client?: HttpClient;
    resolveOwnerPubkey?: () => string | undefined;
    now?: () => number;
}

function toNostrEvent(dto: SocialEventDto): NostrEvent {
    return {
        id: dto.id,
        pubkey: dto.pubkey,
        kind: dto.kind,
        created_at: dto.createdAt,
        content: dto.content,
        tags: dto.tags,
        ...(typeof dto.sig === 'string' ? { sig: dto.sig } : {}),
    };
}

function mapFeedResponse(dto: FollowingFeedResponseDto): SocialFeedPage {
    const items = dto.items
        .map((item) => toSocialFeedItem(toNostrEvent(item)))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const page: SocialFeedPage = {
        items,
        hasMore: dto.hasMore,
    };

    if (typeof dto.nextUntil === 'number') {
        page.nextUntil = dto.nextUntil;
    }

    return page;
}

function mapArticlesFeedResponse(dto: FollowingFeedResponseDto): SocialFeedPage {
    const items = dto.items
        .map((item) => toArticleFeedItem(toNostrEvent(item)))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const page: SocialFeedPage = {
        items,
        hasMore: dto.hasMore,
    };

    if (typeof dto.nextUntil === 'number') {
        page.nextUntil = dto.nextUntil;
    }

    return page;
}

function mapThreadResponse(dto: ThreadResponseDto): SocialThreadPage {
    const page: SocialThreadPage = {
        root: dto.root ? toSocialThreadItem(toNostrEvent(dto.root)) : null,
        replies: dto.replies.map((item) => toSocialThreadItem(toNostrEvent(item))),
        hasMore: dto.hasMore,
    };

    if (typeof dto.nextUntil === 'number') {
        page.nextUntil = dto.nextUntil;
    }

    return page;
}

function resolveOwnerPubkeyOrThrow(resolveOwnerPubkey?: () => string | undefined): string {
    const ownerPubkey = resolveOwnerPubkey?.()?.trim();
    if (!ownerPubkey) {
        throw new Error('ownerPubkey is required for social feed API requests');
    }

    return ownerPubkey;
}

export function createSocialFeedApiService(options: CreateSocialFeedApiServiceOptions = {}): SocialFeedService {
    const client = options.client ?? createHttpClient();
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));

    return {
        async loadFollowingFeed(input) {
            if (!input.follows || input.follows.length === 0) {
                return {
                    items: [],
                    hasMore: false,
                };
            }

            const ownerPubkey = resolveOwnerPubkeyOrThrow(options.resolveOwnerPubkey);
            const response = await client.getJson<FollowingFeedResponseDto>('/social/feed/following', {
                query: {
                    ownerPubkey,
                    limit: input.limit ?? 20,
                    until: input.until ?? now(),
                },
            });

            return mapFeedResponse(response);
        },

        async loadHashtagFeed(input) {
            const ownerPubkey = resolveOwnerPubkeyOrThrow(options.resolveOwnerPubkey);
            const response = await client.getJson<FollowingFeedResponseDto>('/social/feed/following', {
                query: {
                    ownerPubkey,
                    limit: input.limit ?? 20,
                    until: input.until ?? now(),
                    hashtag: input.hashtag,
                },
            });

            return mapFeedResponse(response);
        },

        async loadArticlesFeed(input) {
            if (!input.authors || input.authors.length === 0) {
                return {
                    items: [],
                    hasMore: false,
                };
            }

            const ownerPubkey = resolveOwnerPubkeyOrThrow(options.resolveOwnerPubkey);
            const response = await client.getJson<FollowingFeedResponseDto>('/social/feed/articles', {
                query: {
                    ownerPubkey,
                    limit: input.limit ?? 20,
                    until: input.until ?? now(),
                    ...(input.hashtag ? { hashtag: input.hashtag } : {}),
                },
            });

            return mapArticlesFeedResponse(response);
        },

        async loadArticleById(input) {
            const eventId = input.eventId.trim();
            if (!eventId) {
                return null;
            }

            const response = await client.getJson<ArticleDetailResponseDto>(`/social/articles/${encodeURIComponent(eventId)}`);
            return response.event ? toNostrEvent(response.event) : null;
        },

        async loadThread(input) {
            const encodedRootEventId = encodeURIComponent(input.rootEventId);
            const response = await client.getJson<ThreadResponseDto>(`/social/thread/${encodedRootEventId}`, {
                query: {
                    limit: input.limit ?? 25,
                    until: input.until ?? now(),
                },
            });

            return mapThreadResponse(response);
        },

        async loadEngagement(input): Promise<SocialEngagementByEventId> {
            if (!input.eventIds || input.eventIds.length === 0) {
                return {};
            }

            const response = await client.postJson<EngagementResponseDto>('/social/engagement', {
                body: {
                    eventIds: input.eventIds,
                    until: input.until,
                },
            });

            return response.byEventId;
        },

        async loadViewerReactions(input): Promise<ViewerReactionByEventId> {
            if (!input.ownerPubkey || !input.eventIds || input.eventIds.length === 0) {
                return {};
            }

            const response = await client.postJson<ViewerReactionsResponseDto>('/social/viewer-reactions', {
                body: {
                    ownerPubkey: input.ownerPubkey,
                    eventIds: input.eventIds,
                },
                includeAuth: true,
            });

            return response.byEventId;
        },

        async loadViewerZaps(input): Promise<ViewerZapByEventId> {
            if (!input.ownerPubkey || !input.eventIds || input.eventIds.length === 0) {
                return {};
            }

            const response = await client.postJson<ViewerZapsResponseDto>('/social/viewer-zaps', {
                body: {
                    ownerPubkey: input.ownerPubkey,
                    eventIds: input.eventIds,
                },
                includeAuth: true,
            });

            return response.byEventId;
        },

        async loadViewerReplies(input): Promise<ViewerReplyByEventId> {
            if (!input.ownerPubkey || !input.eventIds || input.eventIds.length === 0) {
                return {};
            }

            const response = await client.postJson<ViewerRepliesResponseDto>('/social/viewer-replies', {
                body: {
                    ownerPubkey: input.ownerPubkey,
                    eventIds: input.eventIds,
                },
                includeAuth: true,
            });

            return response.byEventId;
        },
    };
}
