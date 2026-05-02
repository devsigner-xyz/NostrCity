import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { noteDetailEventIdFromPathname } from '../routes/note-detail-routing';
import { buildSettingsPath, settingsViewFromPathname, type SettingsRouteView } from '../settings/settings-routing';
import { buildLocationTarget, routeReturnStateFromUnknown } from './route-return-state';

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

function activeArticlesHashtagFromLocation(pathname: string, search: string): string | undefined {
    if (pathname !== '/agora/articles') {
        return undefined;
    }

    return normalizeHashtag(new URLSearchParams(search).get('tag'));
}

function hasRouteReturnState(state: ReturnType<typeof routeReturnStateFromUnknown>): boolean {
    return Boolean(state.returnTo || state.returnFocusEventId);
}

function nestedRouteReturnStateFromUnknown(value: unknown): ReturnType<typeof routeReturnStateFromUnknown> {
    if (value === null || typeof value !== 'object') {
        return {};
    }

    return routeReturnStateFromUnknown((value as Record<string, unknown>).returnState);
}

export function useOverlayRouteState() {
    const navigate = useNavigate();
    const location = useLocation();
    const [isUiSettingsDialogOpen, setIsUiSettingsDialogOpen] = useState(false);

    const activeAgoraHashtag = activeAgoraHashtagFromLocation(location.pathname, location.search);
    const activeArticlesHashtag = activeArticlesHashtagFromLocation(location.pathname, location.search);
    const activeAgoraNoteEventId = noteDetailEventIdFromPathname(location.pathname);
    const activeSettingsView = settingsViewFromPathname(location.pathname);

    const isMapRoute = location.pathname === '/';
    const isAgoraRoute = location.pathname === '/agora' || Boolean(activeAgoraNoteEventId);
    const isArticlesRoute = location.pathname === '/agora/articles';
    const isArticleDetailRoute = location.pathname.startsWith('/agora/articles/');
    const isChatsRoute = location.pathname === '/chats';
    const isGroupsRoute = location.pathname === '/groups';
    const isNotificationsRoute = location.pathname === '/notifications';

    useEffect(() => {
        if (!location.pathname.startsWith('/settings/')) {
            return;
        }

        if (location.pathname.startsWith('/settings/relays')) {
            return;
        }

        if (!activeSettingsView) {
            navigate(buildSettingsPath('shortcuts'), { replace: true });
        }
    }, [location.pathname, activeSettingsView, navigate]);

    const openUiSettingsDialog = (): void => {
        setIsUiSettingsDialogOpen(true);
    };

    const closeUiSettingsDialog = (): void => {
        setIsUiSettingsDialogOpen(false);
    };

    const openSettingsPage = (view: SettingsRouteView = 'shortcuts'): void => {
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
        const returnState = routeReturnStateFromUnknown(location.state);

        navigate('/user-search', {
            state: {
                returnTo: buildLocationTarget(location),
                ...(hasRouteReturnState(returnState) ? { returnState } : {}),
            },
        });
    };

    const closeGlobalUserSearch = (): void => {
        const { returnTo } = routeReturnStateFromUnknown(location.state);
        const returnState = nestedRouteReturnStateFromUnknown(location.state);

        if (hasRouteReturnState(returnState)) {
            navigate(returnTo ?? '/', { state: returnState });
            return;
        }

        navigate(returnTo ?? '/');
    };

    return {
        navigate,
        location,
        activeAgoraHashtag,
        activeArticlesHashtag,
        activeAgoraNoteEventId,
        activeSettingsView,
        isMapRoute,
        isAgoraRoute,
        isArticlesRoute,
        isArticleDetailRoute,
        isChatsRoute,
        isGroupsRoute,
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
