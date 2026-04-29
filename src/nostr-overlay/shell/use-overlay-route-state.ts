import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { buildSettingsPath, settingsViewFromPathname, type SettingsRouteView } from '../settings/settings-routing';

export function normalizeHashtag(value: string | null): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalized = value.trim().replace(/^#+/, '').toLowerCase();
    return normalized.length > 0 ? normalized : undefined;
}

function activeAgoraHashtagFromLocation(pathname: string, search: string): string | undefined {
    if (pathname !== '/agora') {
        return undefined;
    }

    return normalizeHashtag(new URLSearchParams(search).get('tag'));
}

export function useOverlayRouteState() {
    const navigate = useNavigate();
    const location = useLocation();
    const [isUiSettingsDialogOpen, setIsUiSettingsDialogOpen] = useState(false);

    const activeAgoraHashtag = activeAgoraHashtagFromLocation(location.pathname, location.search);
    const activeSettingsView = settingsViewFromPathname(location.pathname);

    const isMapRoute = location.pathname === '/';
    const isAgoraRoute = location.pathname === '/agora';
    const isArticlesRoute = location.pathname === '/agora/articles';
    const isArticleDetailRoute = location.pathname.startsWith('/agora/articles/');
    const isChatsRoute = location.pathname === '/chats';
    const isNotificationsRoute = location.pathname === '/notifications';

    useEffect(() => {
        if (!location.pathname.startsWith('/settings/')) {
            return;
        }

        if (location.pathname.startsWith('/settings/relays')) {
            return;
        }

        if (!activeSettingsView) {
            navigate(buildSettingsPath('zaps'), { replace: true });
        }
    }, [location.pathname, activeSettingsView, navigate]);

    const openUiSettingsDialog = (): void => {
        setIsUiSettingsDialogOpen(true);
    };

    const closeUiSettingsDialog = (): void => {
        setIsUiSettingsDialogOpen(false);
    };

    const openSettingsPage = (view: SettingsRouteView = 'zaps'): void => {
        navigate(buildSettingsPath(view));
    };

    const openSettingsDestination = (view: SettingsRouteView | 'ui'): void => {
        if (view === 'ui') {
            openUiSettingsDialog();
            return;
        }

        closeUiSettingsDialog();
        openSettingsPage(view);
    };

    const openGlobalUserSearch = (): void => {
        navigate('/user-search');
    };

    const closeGlobalUserSearch = (): void => {
        navigate('/');
    };

    return {
        navigate,
        location,
        activeAgoraHashtag,
        activeSettingsView,
        isMapRoute,
        isAgoraRoute,
        isArticlesRoute,
        isArticleDetailRoute,
        isChatsRoute,
        isNotificationsRoute,
        isUiSettingsDialogOpen,
        openUiSettingsDialog,
        closeUiSettingsDialog,
        openSettingsPage,
        openSettingsDestination,
        openGlobalUserSearch,
        closeGlobalUserSearch,
    };
}
