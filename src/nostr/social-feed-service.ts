import type { NostrEvent } from './types';
import { isLongFormArticleEvent } from './articles';

export type SocialFeedItemKind = 'note' | 'repost' | 'article';

export interface SocialFeedItem {
    id: string;
    pubkey: string;
    createdAt: number;
    content: string;
    kind: SocialFeedItemKind;
    eventKind?: number;
    targetEventId?: string;
    rawEvent: NostrEvent;
}

export interface SocialFeedPage {
    items: SocialFeedItem[];
    nextUntil?: number;
    hasMore: boolean;
}

export interface SocialThreadItem {
    id: string;
    pubkey: string;
    createdAt: number;
    eventKind: number;
    content: string;
    targetEventId?: string;
    rawEvent: NostrEvent;
}

export interface SocialThreadPage {
    root: SocialThreadItem | null;
    replies: SocialThreadItem[];
    nextUntil?: number;
    hasMore: boolean;
}

export interface LoadFollowingFeedInput {
    follows: string[];
    limit?: number;
    until?: number;
}

export interface LoadArticlesFeedInput {
    authors: string[];
    limit?: number;
    until?: number;
}

export interface LoadArticleByIdInput {
    eventId: string;
}

export interface LoadHashtagFeedInput {
    hashtag: string;
    limit?: number;
    until?: number;
}

export interface LoadThreadInput {
    rootEventId: string;
    limit?: number;
    until?: number;
}

export interface LoadEngagementInput {
    eventIds: string[];
    limit?: number;
    until?: number;
}

export interface LoadViewerReactionsInput {
    ownerPubkey: string;
    eventIds: string[];
    limit?: number;
}

export interface SocialEngagementMetrics {
    replies: number;
    reposts: number;
    reactions: number;
    zaps: number;
    zapSats: number;
}

export type SocialEngagementByEventId = Record<string, SocialEngagementMetrics>;

export interface ViewerReaction {
    eventId: string;
    reactionEventId: string;
    emoji: string;
    createdAt: number;
}

export type ViewerReactionByEventId = Record<string, ViewerReaction>;

export interface SocialFeedService {
    loadFollowingFeed(input: LoadFollowingFeedInput): Promise<SocialFeedPage>;
    loadArticlesFeed(input: LoadArticlesFeedInput): Promise<SocialFeedPage>;
    loadArticleById(input: LoadArticleByIdInput): Promise<NostrEvent | null>;
    loadHashtagFeed(input: LoadHashtagFeedInput): Promise<SocialFeedPage>;
    loadThread(input: LoadThreadInput): Promise<SocialThreadPage>;
    loadEngagement(input: LoadEngagementInput): Promise<SocialEngagementByEventId>;
    loadViewerReactions(input: LoadViewerReactionsInput): Promise<ViewerReactionByEventId>;
}

function tagValue(tag: string[] | undefined): string | undefined {
    if (!tag || tag.length < 2) {
        return undefined;
    }

    const value = tag[1];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function tagMarker(tag: string[] | undefined): string | undefined {
    if (!tag || tag.length < 4) {
        return undefined;
    }

    const marker = tag[3];
    return typeof marker === 'string' && marker.length > 0 ? marker : undefined;
}

function getTags(event: NostrEvent, key: string): string[][] {
    return event.tags.filter((tag) => Array.isArray(tag) && tag[0] === key);
}

export function extractTargetEventId(event: NostrEvent): string | undefined {
    if (event.kind === 6 || event.kind === 16) {
        const qTags = getTags(event, 'q')
            .map((tag) => tagValue(tag))
            .filter((value): value is string => Boolean(value));

        if (qTags.length > 0) {
            return qTags[qTags.length - 1];
        }
    }

    const eTags = getTags(event, 'e')
        .map((tag) => tagValue(tag))
        .filter((value): value is string => Boolean(value));

    if (eTags.length === 0) {
        return undefined;
    }

    return eTags[eTags.length - 1];
}

export function isReplyEvent(event: NostrEvent): boolean {
    if (event.kind !== 1) {
        return false;
    }

    const eTags = getTags(event, 'e');
    const aTags = getTags(event, 'a');

    const hasReplyMarker = [...eTags, ...aTags].some((tag) => {
        const marker = tagMarker(tag);
        return marker === 'root' || marker === 'reply';
    });

    if (hasReplyMarker) {
        return true;
    }

    const eTagCount = eTags.filter((tag) => Boolean(tagValue(tag))).length;
    return eTagCount >= 2;
}

export function isMainFeedEvent(event: NostrEvent): boolean {
    if (event.kind === 6 || event.kind === 16) {
        return true;
    }

    if (event.kind === 1) {
        return !isReplyEvent(event);
    }

    return false;
}

export function toSocialFeedItem(event: NostrEvent): SocialFeedItem | null {
    if (!isMainFeedEvent(event)) {
        return null;
    }

    const item: SocialFeedItem = {
        id: event.id,
        pubkey: event.pubkey,
        createdAt: event.created_at,
        content: event.content,
        kind: event.kind === 1 ? 'note' : 'repost',
        eventKind: event.kind,
        rawEvent: event,
    };

    const targetEventId = extractTargetEventId(event);
    if (targetEventId !== undefined) {
        item.targetEventId = targetEventId;
    }

    return item;
}

export function toArticleFeedItem(event: NostrEvent): SocialFeedItem | null {
    if (!isLongFormArticleEvent(event)) {
        return null;
    }

    return {
        id: event.id,
        pubkey: event.pubkey,
        createdAt: event.created_at,
        content: event.content,
        kind: 'article',
        eventKind: event.kind,
        rawEvent: event,
    };
}

export function toSocialThreadItem(event: NostrEvent): SocialThreadItem {
    const item: SocialThreadItem = {
        id: event.id,
        pubkey: event.pubkey,
        createdAt: event.created_at,
        eventKind: event.kind,
        content: event.content,
        rawEvent: event,
    };

    const targetEventId = extractTargetEventId(event);
    if (targetEventId !== undefined) {
        item.targetEventId = targetEventId;
    }

    return item;
}
