import type { QueryKey } from '@tanstack/react-query';

export interface FollowingFeedQueryInput {
    ownerPubkey?: string;
    follows: string[];
    hashtag?: string;
    pageSize?: number;
}

export interface ArticlesFeedQueryInput {
    ownerPubkey?: string;
    follows: string[];
    hashtags?: string[];
    pageSize?: number;
}

export interface ArticleDetailQueryInput {
    eventId: string;
}

export interface ThreadQueryInput {
    rootEventId: string;
    pageSize?: number;
}

export interface EngagementQueryInput {
    eventIds: string[];
}

export interface ViewerReactionsQueryInput {
    ownerPubkey: string;
    eventIds: string[];
}

export interface ViewerZapsQueryInput {
    ownerPubkey: string;
    eventIds: string[];
}

export interface ViewerRepliesQueryInput {
    ownerPubkey: string;
    eventIds: string[];
}

export interface NotificationsQueryInput {
    ownerPubkey: string;
    limit?: number;
    since?: number;
}

export interface DirectMessagesListQueryInput {
    ownerPubkey: string;
}

export interface DirectMessagesConversationQueryInput {
    ownerPubkey: string;
    conversationId: string;
}

export interface OverlayGroupsQueryInput {
    ownerPubkey: string;
    configuredRelays: string[];
    hasGroupRelaysConfigured: boolean;
    selectedGroupKey?: string;
}

export interface OverlayGroupDetailQueryInput {
    ownerPubkey: string;
    groupKey: string;
}

export interface ActiveProfilePostsQueryInput {
    pubkey: string;
    pageSize: number;
}

export interface ActiveProfileByPubkeyQueryInput {
    pubkey: string;
}

export interface Nip05BatchQueryInput {
    ownerPubkey: string;
    checks: string[];
}

export interface RelayMetadataQueryInput {
    relayUrl: string;
}

export interface RelayGroupsQueryInput {
    relayUrl: string;
}

export type NostrOverlayQueryKey = QueryKey & readonly ['nostr-overlay', ...readonly unknown[]];
