import { describe, expect, test } from 'vitest';

import {
    resolveMobileAppBarTitle,
    resolveMobileBackBehavior,
    shouldShowMobileMenu,
    shouldShowMobileBottomNavigation,
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
        expect(resolveMobileAppBarTitle({ pathname: '/groups', language: 'es' })).toBe('Grupos');
        expect(resolveMobileAppBarTitle({ pathname: '/notifications', language: 'es' })).toBe('Notificaciones');
        expect(resolveMobileAppBarTitle({ pathname: '/wallet', language: 'es' })).toBe('Wallet');
    });

    test('hides mobile back on bottom navigation routes', () => {
        expect(shouldShowMobileBack('/')).toBe(false);
        expect(shouldShowMobileBack('/agora')).toBe(false);
        expect(shouldShowMobileBack('/relays')).toBe(false);
        expect(shouldShowMobileBack('/notifications')).toBe(false);
    });

    test('shows bottom navigation only on exact bottom navigation routes', () => {
        expect(shouldShowMobileBottomNavigation('/')).toBe(true);
        expect(shouldShowMobileBottomNavigation('/agora')).toBe(true);
        expect(shouldShowMobileBottomNavigation('/relays')).toBe(true);
        expect(shouldShowMobileBottomNavigation('/notifications')).toBe(true);

        expect(shouldShowMobileBottomNavigation(`/agora/notes/${noteEventId}`)).toBe(false);
        expect(shouldShowMobileBottomNavigation('/agora/articles')).toBe(false);
        expect(shouldShowMobileBottomNavigation('/relays/detail')).toBe(false);
        expect(shouldShowMobileBottomNavigation('/chats')).toBe(false);
        expect(shouldShowMobileBottomNavigation('/settings/shortcuts')).toBe(false);
    });

    test('uses parent titles for detail routes', () => {
        expect(resolveMobileAppBarTitle({ pathname: `/agora/notes/${noteEventId}`, language: 'es' })).toBe('Nota');
        expect(resolveMobileAppBarTitle({ pathname: `/agora/articles/${articleId}`, language: 'es' })).toBe('Artículos');
        expect(resolveMobileAppBarTitle({ pathname: '/relays/detail', language: 'es' })).toBe('Relays');
    });

    test('hides the mobile menu on article detail routes only', () => {
        expect(shouldShowMobileMenu('/agora/articles')).toBe(true);
        expect(shouldShowMobileMenu(`/agora/articles/${articleId}`)).toBe(false);
        expect(shouldShowMobileMenu(`/agora/notes/${noteEventId}`)).toBe(true);
    });

    test('uses settings title for settings routes', () => {
        expect(resolveMobileAppBarTitle({ pathname: '/settings/shortcuts', language: 'es' })).toBe('Ajustes');
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

    test('returns an active group detail to the groups list', () => {
        expect(resolveMobileBackBehavior({ pathname: '/groups', search: '?relay=wss%3A%2F%2Frelay.example&group=gardeners' })).toEqual({
            type: 'navigate',
            to: '/groups',
        });
        expect(shouldShowMobileBack('/groups', '?relay=wss%3A%2F%2Frelay.example&group=gardeners')).toBe(true);
        expect(shouldShowMobileBottomNavigation('/groups', '?relay=wss%3A%2F%2Frelay.example&group=gardeners')).toBe(false);
    });

    test('uses navigation stack for top-level routes', () => {
        expect(resolveMobileBackBehavior({ pathname: '/notifications', search: '' })).toEqual({ type: 'stack' });
    });
});
