import { describe, expect, test } from 'vitest';

import {
    resolveMobileAppBarTitle,
    resolveMobileBackBehavior,
    shouldShowMobileBack,
} from './mobile-navigation';

const articleId = 'a'.repeat(64);
const noteEventId = 'note-event-id';

describe('mobile navigation route metadata', () => {
    test('uses the product title on the map route', () => {
        expect(resolveMobileAppBarTitle({ pathname: '/', language: 'es' })).toBe('Nostr City');
        expect(shouldShowMobileBack('/')).toBe(false);
    });

    test('uses localized titles for top-level overlay routes', () => {
        expect(resolveMobileAppBarTitle({ pathname: '/agora', language: 'es' })).toBe('Ágora');
        expect(resolveMobileAppBarTitle({ pathname: '/chats', language: 'es' })).toBe('Chats');
        expect(resolveMobileAppBarTitle({ pathname: '/notifications', language: 'es' })).toBe('Notificaciones');
        expect(resolveMobileAppBarTitle({ pathname: '/wallet', language: 'es' })).toBe('Wallet');
    });

    test('uses parent titles for detail routes', () => {
        expect(resolveMobileAppBarTitle({ pathname: `/agora/notes/${noteEventId}`, language: 'es' })).toBe('Nota');
        expect(resolveMobileAppBarTitle({ pathname: `/agora/articles/${articleId}`, language: 'es' })).toBe('Artículos');
        expect(resolveMobileAppBarTitle({ pathname: '/relays/detail', language: 'es' })).toBe('Relays');
    });

    test('uses settings title for settings routes', () => {
        expect(resolveMobileAppBarTitle({ pathname: '/settings/zaps', language: 'es' })).toBe('Ajustes');
    });

    test('falls back to product title for unknown routes while preserving back visibility', () => {
        expect(resolveMobileAppBarTitle({ pathname: '/unknown', language: 'es' })).toBe('Nostr City');
        expect(shouldShowMobileBack('/unknown')).toBe(true);
    });
});

describe('mobile navigation back behavior', () => {
    test('closes an active Agora thread before leaving the Agora route', () => {
        expect(resolveMobileBackBehavior({ pathname: '/agora', search: '', hasActiveAgoraThread: true })).toEqual({
            type: 'closeAgoraThread',
        });
    });

    test('returns article detail to the articles list', () => {
        expect(resolveMobileBackBehavior({ pathname: `/agora/articles/${articleId}`, search: '' })).toEqual({
            type: 'navigate',
            to: '/agora/articles',
        });
    });

    test('closes Agora note detail routes', () => {
        expect(resolveMobileBackBehavior({ pathname: `/agora/notes/${noteEventId}`, search: '' })).toEqual({
            type: 'closeNoteDetail',
        });
    });

    test('closes global search routes', () => {
        expect(resolveMobileBackBehavior({ pathname: '/user-search', search: '' })).toEqual({
            type: 'closeGlobalSearch',
        });
    });

    test('returns relay detail to the relays list', () => {
        expect(resolveMobileBackBehavior({ pathname: '/relays/detail', search: '?url=wss%3A%2F%2Frelay.example' })).toEqual({
            type: 'navigate',
            to: '/relays',
        });
    });

    test('returns an active chat conversation to the chat list', () => {
        expect(resolveMobileBackBehavior({ pathname: '/chats', search: '?peer=abc' })).toEqual({ type: 'openChatList' });
    });

    test('uses navigation stack for top-level routes', () => {
        expect(resolveMobileBackBehavior({ pathname: '/notifications', search: '' })).toEqual({ type: 'stack' });
    });
});
