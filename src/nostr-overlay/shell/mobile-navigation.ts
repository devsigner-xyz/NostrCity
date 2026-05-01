import type { AppMessageKey } from '@/i18n/catalog';
import { translate } from '@/i18n/translate';
import type { AppLocale } from '@/i18n/types';
import { noteDetailEventIdFromPathname } from '../routes/note-detail-routing';

const PRODUCT_TITLE = 'Nostr City';

interface MobileAppBarTitleInput {
    pathname: string;
    language: AppLocale;
}

interface MobileBackBehaviorInput {
    pathname: string;
    search: string;
    hasActiveAgoraThread?: boolean;
}

export type MobileBackBehavior =
    | { type: 'closeAgoraThread' }
    | { type: 'closeNoteDetail' }
    | { type: 'closeGlobalSearch' }
    | { type: 'openChatList' }
    | { type: 'navigate'; to: string }
    | { type: 'stack' };

function titleFromMessage(language: AppLocale, key: AppMessageKey): string {
    return translate(language, key);
}

export function shouldShowMobileBack(pathname: string): boolean {
    return pathname !== '/';
}

export function resolveMobileAppBarTitle({ pathname, language }: MobileAppBarTitleInput): string {
    if (pathname === '/') {
        return PRODUCT_TITLE;
    }

    if (noteDetailEventIdFromPathname(pathname)) {
        return titleFromMessage(language, 'feed.noteTitle');
    }

    if (pathname === '/agora') {
        return titleFromMessage(language, 'sidebar.agora');
    }

    if (pathname === '/agora/articles' || pathname.startsWith('/agora/articles/')) {
        return titleFromMessage(language, 'articles.title');
    }

    if (pathname === '/chats') {
        return titleFromMessage(language, 'chats.title');
    }

    if (pathname === '/notifications') {
        return titleFromMessage(language, 'notifications.title');
    }

    if (pathname === '/wallet') {
        return titleFromMessage(language, 'wallet.title');
    }

    if (pathname === '/relays' || pathname.startsWith('/relays/')) {
        return titleFromMessage(language, 'sidebar.relays');
    }

    if (pathname === '/user-search') {
        return titleFromMessage(language, 'userSearch.title');
    }

    if (pathname === '/city-stats') {
        return titleFromMessage(language, 'cityStats.title');
    }

    if (pathname === '/discover') {
        return titleFromMessage(language, 'discover.title');
    }

    if (pathname === '/settings' || pathname.startsWith('/settings/')) {
        return titleFromMessage(language, 'sidebar.settings');
    }

    if (pathname === '/profile') {
        return titleFromMessage(language, 'profileEditor.title');
    }

    return PRODUCT_TITLE;
}

export function resolveMobileBackBehavior({
    pathname,
    search,
    hasActiveAgoraThread = false,
}: MobileBackBehaviorInput): MobileBackBehavior {
    if (pathname === '/agora' && hasActiveAgoraThread) {
        return { type: 'closeAgoraThread' };
    }

    if (noteDetailEventIdFromPathname(pathname)) {
        return { type: 'closeNoteDetail' };
    }

    if (pathname === '/user-search') {
        return { type: 'closeGlobalSearch' };
    }

    if (pathname.startsWith('/agora/articles/')) {
        return { type: 'navigate', to: '/agora/articles' };
    }

    if (pathname === '/relays/detail') {
        return { type: 'navigate', to: '/relays' };
    }

    if (pathname === '/chats' && new URLSearchParams(search).has('peer')) {
        return { type: 'openChatList' };
    }

    return { type: 'stack' };
}
