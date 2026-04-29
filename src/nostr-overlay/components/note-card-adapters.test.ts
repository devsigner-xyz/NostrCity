import { describe, expect, test } from 'vitest';
import {
    fromFeedItem,
    fromThreadItem,
    fromPostPreview,
    fromEmbeddedRepost,
    fromResolvedReferenceEvent,
} from './note-card-adapters';

const feedItemFixture = {
    id: 'note-1',
    pubkey: 'a'.repeat(64),
    createdAt: 100,
    content: 'hola',
    kind: 'note' as const,
    rawEvent: { id: 'note-1', pubkey: 'a'.repeat(64), kind: 1, created_at: 100, tags: [] as string[][], content: 'hola' },
};

const rootFixture = {
    id: 'root-1',
    pubkey: 'b'.repeat(64),
    createdAt: 101,
    content: 'root',
    eventKind: 1,
    rawEvent: { id: 'root-1', pubkey: 'b'.repeat(64), kind: 1, created_at: 101, tags: [] as string[][], content: 'root' },
};

const replyFixture = {
    id: 'reply-1',
    pubkey: 'c'.repeat(64),
    createdAt: 102,
    content: 'reply',
    eventKind: 1,
    rawEvent: { id: 'reply-1', pubkey: 'c'.repeat(64), kind: 1, created_at: 102, tags: [] as string[][], content: 'reply' },
};

const referenceEventFixture = {
    id: 'ref-1',
    pubkey: 'd'.repeat(64),
    kind: 1,
    created_at: 103,
    tags: [] as string[][],
    content: 'referencia',
};

const validEmbeddedFixture = {
    id: 'emb-1',
    pubkey: 'e'.repeat(64),
    createdAt: 99,
    content: 'embedded',
    tags: [] as string[][],
};

const actionStateFixture = {
    canWrite: true,
    isReactionActive: false,
    isRepostActive: false,
    isZapActive: false,
    isReplyActive: false,
    isReactionPending: false,
    isRepostPending: false,
    replies: 1,
    reactions: 2,
    reposts: 3,
    zapSats: 210,
    onReply: () => {},
    onToggleReaction: async () => true,
    onRepost: async () => true,
    onQuote: () => {},
};

describe('note-card-adapters', () => {
    test('fromPostPreview sets readonly defaults', () => {
        const model = fromPostPreview({ id: 'p1', pubkey: 'a'.repeat(64), createdAt: 100, content: 'hola' });
        expect(model?.tags).toEqual([]);
        expect(model?.actions).toBeUndefined();
        expect(model?.showCopyId).toBe(true);
        expect(model?.nestingLevel).toBe(0);
    });

    test('fromPostPreview returns null on missing critical fields', () => {
        expect(fromPostPreview({ id: '', pubkey: 'a'.repeat(64), createdAt: 100, content: 'hola' } as any)).toBeNull();
    });

    test('fromFeedItem maps engagement actions contract', () => {
        const model = fromFeedItem(feedItemFixture, actionStateFixture);
        expect(model?.variant).toBe('default');
        expect(model?.kindLabel).toBeUndefined();
        expect(model?.showCopyId).toBe(true);
        expect(model?.nestingLevel).toBe(0);
        expect(model?.tags).toEqual([]);
        expect(model?.actions?.canWrite).toBe(true);
        expect(typeof model?.actions?.onToggleReaction).toBe('function');
    });

    test('fromThreadItem maps root/reply labels', () => {
        expect(fromThreadItem(rootFixture, 'root', actionStateFixture)?.kindLabel).toBe('Raiz');
        expect(fromThreadItem(rootFixture, 'root', actionStateFixture)?.showCopyId).toBe(true);
        expect(fromThreadItem(replyFixture, 'reply', actionStateFixture)?.kindLabel).toBe('Reply');
        expect(fromThreadItem(replyFixture, 'reply', actionStateFixture)?.nestingLevel).toBe(0);
    });

    test('fromResolvedReferenceEvent returns nested readonly model', () => {
        const model = fromResolvedReferenceEvent(referenceEventFixture, 1);
        expect(model?.variant).toBe('nested');
        expect(model?.showCopyId).toBe(true);
        expect(model?.nestingLevel).toBe(1);
        expect(model?.actions).toBeUndefined();
    });

    test('fromResolvedReferenceEvent defaults nestingLevel to 1', () => {
        const model = fromResolvedReferenceEvent(referenceEventFixture);
        expect(model?.nestingLevel).toBe(1);
    });

    test('fromEmbeddedRepost returns nested readonly model on valid payload', () => {
        const model = fromEmbeddedRepost(validEmbeddedFixture, 1);
        expect(model?.variant).toBe('nested');
        expect(model?.showCopyId).toBe(true);
        expect(model?.nestingLevel).toBe(1);
        expect(model?.actions).toBeUndefined();
    });

    test('adapters return null when critical fields are missing', () => {
        expect(fromResolvedReferenceEvent({ ...referenceEventFixture, id: '' }, 1)).toBeNull();
        expect(fromEmbeddedRepost({ ...validEmbeddedFixture, pubkey: '' }, 1)).toBeNull();
    });

    test('fromEmbeddedRepost returns null on invalid payload', () => {
        expect(fromEmbeddedRepost({ id: '', pubkey: '', createdAt: Number.NaN, content: '', tags: [] })).toBeNull();
    });
});
