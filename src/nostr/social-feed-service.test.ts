import { describe, expect, expectTypeOf, test } from 'vitest';
import type { NostrEvent, NostrFilter } from './types';
import { LONG_FORM_ARTICLE_KIND } from './articles';
import {
    extractTargetEventId,
    isMainFeedEvent,
    isReplyEvent,
    type SocialEngagementMetrics,
    type SocialFeedService,
    toArticleFeedItem,
    toSocialFeedItem,
} from './social-feed-service';

function event(input: {
    id: string;
    pubkey?: string;
    kind: number;
    createdAt?: number;
    tags?: string[][];
    content?: string;
}): NostrEvent {
    return {
        id: input.id,
        pubkey: input.pubkey ?? 'a'.repeat(64),
        kind: input.kind,
        created_at: input.createdAt ?? 100,
        tags: input.tags ?? [],
        content: input.content ?? '',
    };
}

describe('social-feed-service domain helpers', () => {
    test('includes standalone notes in main feed', () => {
        const note = event({
            id: 'note-1',
            kind: 1,
            content: 'hola mundo',
        });

        expect(isReplyEvent(note)).toBe(false);
        expect(isMainFeedEvent(note)).toBe(true);
        expect(toSocialFeedItem(note)).toMatchObject({
            kind: 'note',
            id: 'note-1',
        });
    });

    test('excludes replies from main feed and keeps them for thread view', () => {
        const reply = event({
            id: 'reply-1',
            kind: 1,
            tags: [
                ['e', 'root-event', '', 'root'],
                ['e', 'parent-event', '', 'reply'],
            ],
            content: 'respuesta',
        });

        expect(isReplyEvent(reply)).toBe(true);
        expect(isMainFeedEvent(reply)).toBe(false);
        expect(extractTargetEventId(reply)).toBe('parent-event');
        expect(toSocialFeedItem(reply)).toBeNull();
    });

    test('keeps single-reference notes in main feed', () => {
        const noteWithReference = event({
            id: 'note-ref-1',
            kind: 1,
            tags: [['e', 'quoted-event']],
            content: 'mira este evento',
        });

        expect(isReplyEvent(noteWithReference)).toBe(false);
        expect(isMainFeedEvent(noteWithReference)).toBe(true);
        expect(toSocialFeedItem(noteWithReference)).toMatchObject({
            id: 'note-ref-1',
            kind: 'note',
        });
    });

    test('includes reposts in main feed', () => {
        const repost = event({
            id: 'repost-1',
            kind: 6,
            tags: [
                ['e', 'target-note'],
                ['p', 'b'.repeat(64)],
            ],
        });

        expect(isReplyEvent(repost)).toBe(false);
        expect(isMainFeedEvent(repost)).toBe(true);
        expect(extractTargetEventId(repost)).toBe('target-note');
        expect(toSocialFeedItem(repost)).toMatchObject({
            kind: 'repost',
            targetEventId: 'target-note',
        });
    });

    test('prefers q tag as target event id for generic reposts', () => {
        const genericRepost = event({
            id: 'generic-repost-1',
            kind: 16,
            tags: [
                ['q', 'quoted-target-event'],
                ['e', 'legacy-fallback-target'],
            ],
        });

        expect(extractTargetEventId(genericRepost)).toBe('quoted-target-event');
        expect(toSocialFeedItem(genericRepost)).toMatchObject({
            kind: 'repost',
            targetEventId: 'quoted-target-event',
        });
    });

    test('ignores non timeline events', () => {
        const reaction = event({
            id: 'reaction-1',
            kind: 7,
            tags: [['e', 'target-note']],
            content: '+',
        });

        expect(isMainFeedEvent(reaction)).toBe(false);
        expect(toSocialFeedItem(reaction)).toBeNull();
    });

    test('maps long-form articles to article feed items', () => {
        const article = event({
            id: 'article-1',
            kind: LONG_FORM_ARTICLE_KIND,
            content: 'Article body',
        });

        expect(toArticleFeedItem(article)).toMatchObject({
            id: 'article-1',
            kind: 'article',
            eventKind: LONG_FORM_ARTICLE_KIND,
        });
    });

    test('excludes short notes from article feed items', () => {
        expect(toArticleFeedItem(event({ id: 'note-article-ignore', kind: 1 }))).toBeNull();
    });
});

describe('social-feed-service contracts', () => {
    test('includes zapSats in social engagement metrics', () => {
        expectTypeOf<SocialEngagementMetrics>().toEqualTypeOf<{
            replies: number;
            reposts: number;
            reactions: number;
            zaps: number;
            zapSats: number;
        }>();
    });

    test('supports hashtag and quote filters in nostr filter', () => {
        expectTypeOf<NostrFilter>().toEqualTypeOf<{
            ids?: string[];
            authors?: string[];
            kinds?: number[];
            search?: string;
            '#e'?: string[];
            '#p'?: string[];
            '#t'?: string[];
            '#q'?: string[];
            '#h'?: string[];
            '#d'?: string[];
            '#a'?: string[];
            since?: number;
            until?: number;
            limit?: number;
        }>();
    });

    test('exposes hashtag feed loading on social feed service', () => {
        expectTypeOf<SocialFeedService>().toEqualTypeOf<{
            loadFollowingFeed: SocialFeedService['loadFollowingFeed'];
            loadArticlesFeed: SocialFeedService['loadArticlesFeed'];
            loadArticleById: SocialFeedService['loadArticleById'];
            loadThread: SocialFeedService['loadThread'];
            loadEngagement: SocialFeedService['loadEngagement'];
            loadViewerReactions: SocialFeedService['loadViewerReactions'];
            loadViewerZaps: SocialFeedService['loadViewerZaps'];
            loadViewerReplies: SocialFeedService['loadViewerReplies'];
            loadHashtagFeed: SocialFeedService['loadHashtagFeed'];
        }>();
    });
});
