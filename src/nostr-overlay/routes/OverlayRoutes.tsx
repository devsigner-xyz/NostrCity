import type { ComponentProps } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { RelayDetailRoute } from '../components/RelayDetailRoute';
import { RelaysRoute } from '../components/RelaysRoute';
import { SettingsAboutRoute } from '../components/settings-routes/SettingsAboutRoute';
import { SettingsAdvancedRoute } from '../components/settings-routes/SettingsAdvancedRoute';
import { SettingsShortcutsRoute } from '../components/settings-routes/SettingsShortcutsRoute';
import { SettingsZapsRoute } from '../components/settings-routes/SettingsZapsRoute';
import { AgoraRouteContainer, type AgoraRouteContainerProps } from './AgoraRouteContainer';
import { ArticleDetailRouteContainer, type ArticleDetailRouteContainerProps } from './ArticleDetailRouteContainer';
import { ArticlesRouteContainer, type ArticlesRouteContainerProps } from './ArticlesRouteContainer';
import { ChatsRouteContainer, type ChatsRouteContainerProps } from './ChatsRouteContainer';
import { CityStatsRouteContainer, type CityStatsRouteContainerProps } from './CityStatsRouteContainer';
import { DiscoverRouteContainer, type DiscoverRouteContainerProps } from './DiscoverRouteContainer';
import { NotificationsRouteContainer, type NotificationsRouteContainerProps } from './NotificationsRouteContainer';
import { ProfileRouteContainer, type ProfileRouteContainerProps } from './ProfileRouteContainer';
import { SettingsRouteContainer, type SettingsRouteContainerProps } from './SettingsRouteContainer';
import { UserSearchRouteContainer, type UserSearchRouteContainerProps } from './UserSearchRouteContainer';
import { WalletRouteContainer, type WalletRouteContainerProps } from './WalletRouteContainer';

export interface OverlayRoutesProps {
    showLoginGate: boolean;
    sessionRestorationResolved: boolean;
    locationSearch: string;
    agora: AgoraRouteContainerProps;
    articles: ArticlesRouteContainerProps;
    articleDetail: ArticleDetailRouteContainerProps;
    cityStats: CityStatsRouteContainerProps;
    notifications: NotificationsRouteContainerProps;
    chats: ChatsRouteContainerProps;
    relays: ComponentProps<typeof RelaysRoute>;
    relayDetail: ComponentProps<typeof RelayDetailRoute>;
    discover: DiscoverRouteContainerProps;
    wallet: WalletRouteContainerProps;
    profile: ProfileRouteContainerProps;
    userSearch: UserSearchRouteContainerProps;
    settings: SettingsRouteContainerProps;
}

export function OverlayRoutes({
    showLoginGate,
    sessionRestorationResolved,
    locationSearch,
    agora,
    articles,
    articleDetail,
    cityStats,
    notifications,
    chats,
    relays,
    relayDetail,
    discover,
    wallet,
    profile,
    userSearch,
    settings,
}: OverlayRoutesProps) {
    return (
        <Routes>
            {showLoginGate ? (
                <>
                    <Route path="/login" element={null} />
                    <Route
                        path="*"
                        element={sessionRestorationResolved ? <Navigate to="/login" replace /> : null}
                    />
                </>
            ) : (
                <>
                    <Route path="/agora" element={<AgoraRouteContainer {...agora} />} />
                    <Route path="/agora/articles" element={<ArticlesRouteContainer {...articles} />} />
                    <Route path="/agora/articles/:eventId" element={<ArticleDetailRouteContainer {...articleDetail} />} />
                    <Route path="/estadisticas" element={<CityStatsRouteContainer {...cityStats} />} />
                    <Route path="/notificaciones" element={<NotificationsRouteContainer {...notifications} />} />
                    <Route path="/chats" element={<ChatsRouteContainer {...chats} />} />
                    <Route path="/relays" element={<RelaysRoute {...relays} />} />
                    <Route path="/relays/detail" element={<RelayDetailRoute {...relayDetail} />} />
                    <Route path="/descubre" element={<DiscoverRouteContainer {...discover} />} />
                    <Route path="/wallet" element={<WalletRouteContainer {...wallet} />} />
                    <Route path="/perfil" element={<ProfileRouteContainer {...profile} />} />
                    <Route path="/buscar-usuarios" element={<UserSearchRouteContainer {...userSearch} />} />
                    <Route path="/settings" element={<SettingsRouteContainer {...settings} />}>
                        <Route index element={<Navigate to="zaps" replace />} />
                        <Route path="shortcuts" element={<SettingsShortcutsRoute />} />
                        <Route path="zaps" element={<SettingsZapsRoute />} />
                        <Route path="about" element={<SettingsAboutRoute />} />
                        <Route path="advanced" element={<SettingsAdvancedRoute />} />
                        <Route path="*" element={<Navigate to="zaps" replace />} />
                    </Route>
                    <Route path="/settings/relays" element={<Navigate to="/relays" replace />} />
                    <Route path="/settings/relays/detail" element={<Navigate to={`/relays/detail${locationSearch}`} replace />} />
                    <Route path="/settings/:view" element={<Navigate to="/settings/zaps" replace />} />
                    <Route path="/login" element={<Navigate to="/" replace />} />
                    <Route path="/" element={null} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </>
            )}
        </Routes>
    );
}
