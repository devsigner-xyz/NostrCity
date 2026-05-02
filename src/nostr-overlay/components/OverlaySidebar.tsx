import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
    BellIcon,
    ChartColumnIcon,
    ChevronDownIcon,
    ChevronsUpDownIcon,
    CompassIcon,
    LogOutIcon,
    MapPinIcon,
    MessageCircleIcon,
    NewspaperIcon,
    PenSquareIcon,
    RadioTowerIcon,
    SearchIcon,
    Settings2Icon,
    UserRoundIcon,
    UsersIcon,
    WalletIcon,
} from 'lucide-react';
import { encodeHexToNpub } from '../../nostr/npub';
import type { AuthSessionState } from '../../nostr/auth/session';
import type { NostrProfile } from '../../nostr/types';
import type { ResolvedOverlayTheme } from '../hooks/useOverlayTheme';
import { settingsViewFromPathname, type SettingsRouteView } from '../settings/settings-routing';
import { useLocation } from 'react-router';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/utils';
import { OverlayUnreadIndicator } from './OverlayUnreadIndicator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { sanitizeImageUrl } from '../media/image-url-policy';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuBadge,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    SidebarProvider,
    SidebarRail,
    SidebarTrigger,
    useSidebar,
} from '@/components/ui/sidebar';
import { MobileBottomNavigation } from '../shell/MobileBottomNavigation';
import { shouldShowMobileBottomNavigation } from '../shell/mobile-navigation';
import { MobileOverlayAppBar } from '../shell/MobileOverlayAppBar';

export const OVERLAY_SIDEBAR_EXPANDED_WIDTH = 300;
export const OVERLAY_SIDEBAR_COLLAPSED_WIDTH = 56;
type SettingsMenuView = SettingsRouteView | 'ui';

interface OverlaySidebarProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    resolvedTheme: ResolvedOverlayTheme;
    authSession?: AuthSessionState;
    ownerPubkey?: string;
    ownerProfile?: NostrProfile;
    canWrite: boolean;
    canAccessDirectMessages: boolean;
    canAccessSocialNotifications: boolean;
    canAccessFollowingFeed: boolean;
    chatHasUnread: boolean;
    notificationsHasUnread: boolean;
    followingFeedHasUnread: boolean;
    onOpenMap: () => void;
    onOpenCityStats: () => void;
    onOpenChat: () => void;
    onOpenGroups: () => void;
    onOpenRelays: () => void;
    onOpenNotifications: () => void;
    onOpenFollowingFeed: () => void;
    onOpenArticles: () => void;
    onOpenGlobalSearch: () => void;
    onOpenWallet: () => void;
    onOpenPublish: () => void;
    onOpenSettings: (view: SettingsMenuView) => void;
    isUiSettingsOpen: boolean;
    onLogout?: () => void | Promise<void>;
    onCopyOwnerNpub?: (value: string) => void | Promise<void>;
    onLocateOwner?: () => void;
    onViewOwnerDetails?: () => void;
    onOpenProfileEditor?: () => void;
    missionsDiscoveredCount: number;
    missionsTotal: number;
    relaysConnectedCount: number;
    relaysTotal: number;
    onOpenMissions: () => void;
    mobileAppBarTitle: string;
    mobileAppBarShowBack: boolean;
    onMobileAppBarBack: () => void;
    children: ReactNode;
}

function resolveDisplayName(profile: NostrProfile | undefined, fallback: string): string {
    return profile?.displayName ?? profile?.name ?? fallback;
}

function resolveInitials(profile: NostrProfile | undefined, fallback: string): string {
    return resolveDisplayName(profile, fallback).slice(0, 2).toUpperCase();
}

function SigningRequiredTooltip({ enabled, label, children }: { enabled: boolean; label: string; children: ReactNode }) {
    if (!enabled) {
        return <>{children}</>;
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="block" title={label}>{children}</span>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                    {label}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

function SidebarActionsMenu({
    isReadonlySession,
    canAccessDirectMessages,
    canAccessSocialNotifications,
    canAccessFollowingFeed,
    chatHasUnread,
    notificationsHasUnread,
    followingFeedHasUnread,
    onOpenMap,
    onOpenCityStats,
    onOpenChat,
    onOpenGroups,
    onOpenRelays,
    onOpenNotifications,
    onOpenFollowingFeed,
    onOpenArticles,
    onOpenGlobalSearch,
    onOpenWallet,
    onOpenSettings,
    isUiSettingsOpen,
    missionsDiscoveredCount,
    missionsTotal,
    relaysConnectedCount,
    relaysTotal,
    onOpenMissions,
}: Omit<OverlaySidebarProps, 'open' | 'onOpenChange' | 'resolvedTheme' | 'authSession' | 'ownerPubkey' | 'ownerProfile' | 'canWrite' | 'onCopyOwnerNpub' | 'onLocateOwner' | 'onViewOwnerDetails' | 'onLogout' | 'onOpenPublish' | 'mobileAppBarTitle' | 'mobileAppBarShowBack' | 'onMobileAppBarBack' | 'children'> & { isReadonlySession: boolean }) {
    const { t } = useI18n();
    const { state, isMobile, setOpenMobile } = useSidebar();
    const location = useLocation();
    const collapsed = !isMobile && state === 'collapsed';
    const activePath = location.pathname;
    const showPrimaryActionsInSidebar = !isMobile || !shouldShowMobileBottomNavigation(activePath);

    const activeSettingsView = useMemo<SettingsRouteView | null>(() => settingsViewFromPathname(activePath), [activePath]);
    const isRelaysRoute = activePath === '/relays' || activePath.startsWith('/relays/');
    const isAgoraActive = activePath === '/agora' || activePath.startsWith('/agora/notes/');
    const isArticlesActive = activePath === '/agora/articles' || activePath.startsWith('/agora/articles/');
    const disconnectedRelaysCount = Math.max(0, relaysTotal - relaysConnectedCount);
    const readonlyReason = t('auth.readOnlySignInRequired');
    const relaysBadgeTitle = t('sidebar.relaysSummary', {
        total: relaysTotal,
        connected: relaysConnectedCount,
        disconnected: disconnectedRelaysCount,
    });

    const isSettingsActive = activeSettingsView !== null || isUiSettingsOpen;
    const [settingsExpanded, setSettingsExpanded] = useState(isSettingsActive);

    useEffect(() => {
        if (isSettingsActive) {
            setSettingsExpanded(true);
        }
    }, [isSettingsActive]);

    const closeMobileSidebar = (): void => {
        if (isMobile) {
            setOpenMobile(false);
        }
    };

    const runNavigationAction = (action: () => void): void => {
        action();
        closeMobileSidebar();
    };

    return (
        <SidebarGroup className="pt-1 pb-0">
            <SidebarMenu className={cn('nostr-panel-toolbar flex flex-col gap-1.5', collapsed && 'nostr-compact-toolbar gap-1')}>
                {showPrimaryActionsInSidebar ? (
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={activePath === '/'}>
                            <button
                                type="button"
                                aria-label={t('sidebar.openMap')}
                                title={t('sidebar.map')}
                                onClick={() => runNavigationAction(onOpenMap)}
                            >
                                <MapPinIcon />
                                <span>{t('sidebar.map')}</span>
                            </button>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ) : null}

                {showPrimaryActionsInSidebar && canAccessFollowingFeed ? (
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={isAgoraActive}>
                            <button
                                type="button"
                                className="nostr-following-feed-icon-button relative"
                                aria-label={t('sidebar.openAgora')}
                                aria-description={followingFeedHasUnread ? t('sidebar.unreadActivity') : undefined}
                                title={t('sidebar.agora')}
                                onClick={() => runNavigationAction(onOpenFollowingFeed)}
                            >
                                <UsersIcon />
                                <span>{t('sidebar.agora')}</span>
                                {followingFeedHasUnread ? <OverlayUnreadIndicator variant="overlay" className="nostr-following-feed-unread-dot" srLabel={t('sidebar.agoraUnread')} /> : null}
                            </button>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ) : null}

                {canAccessFollowingFeed ? (
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={isArticlesActive}>
                            <button
                                type="button"
                                aria-label={t('sidebar.openArticles')}
                                title={t('sidebar.articles')}
                                onClick={() => runNavigationAction(onOpenArticles)}
                            >
                                <NewspaperIcon />
                                <span>{t('sidebar.articles')}</span>
                            </button>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ) : null}

                {canAccessDirectMessages || isReadonlySession ? (
                    <SidebarMenuItem>
                        <SigningRequiredTooltip enabled={isReadonlySession} label={readonlyReason}>
                            <SidebarMenuButton asChild isActive={activePath === '/chats'}>
                                <button
                                    type="button"
                                    className="nostr-chat-icon-button relative"
                                    aria-label={t('sidebar.openChats')}
                                    aria-description={chatHasUnread ? t('sidebar.unreadMessages') : undefined}
                                    title={isReadonlySession ? readonlyReason : t('sidebar.openChats')}
                                    disabled={isReadonlySession}
                                    onClick={() => runNavigationAction(onOpenChat)}
                                >
                                    <MessageCircleIcon />
                                    <span>{t('sidebar.chats')}</span>
                                    {chatHasUnread ? <OverlayUnreadIndicator variant="overlay" className="nostr-chat-unread-dot" srLabel={t('sidebar.chatsUnread')} /> : null}
                                </button>
                            </SidebarMenuButton>
                        </SigningRequiredTooltip>
                    </SidebarMenuItem>
                ) : null}

                <SidebarMenuItem>
                    <SigningRequiredTooltip enabled={isReadonlySession} label={readonlyReason}>
                        <SidebarMenuButton asChild isActive={activePath === '/groups'}>
                            <button
                                type="button"
                                aria-label={t('sidebar.openGroups')}
                                title={isReadonlySession ? readonlyReason : t('sidebar.groups')}
                                disabled={isReadonlySession}
                                onClick={() => runNavigationAction(onOpenGroups)}
                            >
                                <UsersIcon />
                                <span>{t('sidebar.groups')}</span>
                            </button>
                        </SidebarMenuButton>
                    </SigningRequiredTooltip>
                </SidebarMenuItem>

                {showPrimaryActionsInSidebar ? (
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={isRelaysRoute}>
                            <button
                                type="button"
                                aria-label={t('sidebar.openRelays')}
                                title={relaysBadgeTitle}
                                onClick={() => runNavigationAction(onOpenRelays)}
                            >
                                <RadioTowerIcon />
                                <span>{t('sidebar.relays')}</span>
                            </button>
                        </SidebarMenuButton>
                        {!collapsed ? (
                            <SidebarMenuBadge>
                                {`${relaysConnectedCount}/${relaysTotal}`}
                            </SidebarMenuBadge>
                        ) : null}
                    </SidebarMenuItem>
                ) : null}

                {showPrimaryActionsInSidebar && (canAccessSocialNotifications || isReadonlySession) ? (
                    <SidebarMenuItem>
                        <SigningRequiredTooltip enabled={isReadonlySession} label={readonlyReason}>
                            <SidebarMenuButton asChild isActive={activePath === '/notifications'}>
                                <button
                                    type="button"
                                    className="nostr-notifications-icon-button relative"
                                    aria-label={t('sidebar.openNotifications')}
                                    aria-description={notificationsHasUnread ? t('sidebar.unreadPending') : undefined}
                                    title={isReadonlySession ? readonlyReason : t('sidebar.notifications')}
                                    disabled={isReadonlySession}
                                    onClick={() => runNavigationAction(onOpenNotifications)}
                                >
                                    <BellIcon />
                                    <span>{t('sidebar.notifications')}</span>
                                    {notificationsHasUnread ? <OverlayUnreadIndicator variant="overlay" className="nostr-notifications-unread-dot" srLabel={t('sidebar.notificationsUnread')} /> : null}
                                </button>
                            </SidebarMenuButton>
                        </SigningRequiredTooltip>
                    </SidebarMenuItem>
                ) : null}

                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={activePath === '/user-search'}>
                        <button
                            type="button"
                            aria-label={t('sidebar.openUserSearch')}
                            title={t('sidebar.userSearch')}
                            onClick={() => runNavigationAction(onOpenGlobalSearch)}
                        >
                            <SearchIcon />
                            <span>{t('sidebar.userSearch')}</span>
                        </button>
                    </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={activePath === '/city-stats'}>
                        <button
                            type="button"
                            aria-label={t('sidebar.openCityStats')}
                            title={t('sidebar.cityStatsTitle')}
                            onClick={() => runNavigationAction(onOpenCityStats)}
                        >
                            <ChartColumnIcon />
                            <span>{t('sidebar.cityStats')}</span>
                        </button>
                    </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={activePath === '/discover'}>
                        <button
                            type="button"
                            aria-label={t('sidebar.openDiscover')}
                            title={t('sidebar.discover')}
                            onClick={() => runNavigationAction(onOpenMissions)}
                        >
                            <CompassIcon />
                            <span>{t('sidebar.discover')}</span>
                        </button>
                    </SidebarMenuButton>
                    {!collapsed ? (
                        <SidebarMenuBadge>{`${missionsDiscoveredCount}/${missionsTotal}`}</SidebarMenuBadge>
                    ) : null}
                </SidebarMenuItem>

                <SidebarMenuItem>
                    <SigningRequiredTooltip enabled={isReadonlySession} label={readonlyReason}>
                        <SidebarMenuButton asChild isActive={activePath === '/wallet'}>
                            <button
                                type="button"
                                aria-label={t('sidebar.openWallet')}
                                title={isReadonlySession ? readonlyReason : t('sidebar.wallet')}
                                disabled={isReadonlySession}
                                onClick={() => runNavigationAction(onOpenWallet)}
                            >
                                <WalletIcon />
                                <span>{t('sidebar.wallet')}</span>
                            </button>
                        </SidebarMenuButton>
                    </SigningRequiredTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                    <SidebarMenuButton
                        asChild
                        isActive={isSettingsActive}
                    >
                        <button
                            type="button"
                            aria-label={t('sidebar.openSettings')}
                            title={t('sidebar.settings')}
                            onClick={() => {
                                if (collapsed) {
                                    runNavigationAction(() => onOpenSettings('ui'));
                                    return;
                                }

                                setSettingsExpanded((value) => !value);
                            }}
                        >
                            <Settings2Icon />
                            <span>{t('sidebar.settings')}</span>
                            {!collapsed ? (
                                <ChevronDownIcon className={cn('ml-auto transition-transform', settingsExpanded ? 'rotate-180' : '')} />
                            ) : null}
                        </button>
                    </SidebarMenuButton>
                </SidebarMenuItem>

                {!collapsed && settingsExpanded ? (
                        <SidebarMenuSub>
                            <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isUiSettingsOpen}>
                                <button type="button" aria-label={t('sidebar.settingsUi')} onClick={() => runNavigationAction(() => onOpenSettings('ui'))}>
                                    <span>{t('sidebar.ui')}</span>
                                </button>
                            </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={activeSettingsView === 'zaps'}>
                                <button type="button" aria-label={t('sidebar.settingsZaps')} onClick={() => runNavigationAction(() => onOpenSettings('zaps'))}>
                                    <span>{t('sidebar.zaps')}</span>
                                </button>
                            </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={activeSettingsView === 'shortcuts'}>
                                <button type="button" aria-label={t('sidebar.settingsShortcuts')} onClick={() => runNavigationAction(() => onOpenSettings('shortcuts'))}>
                                    <span>{t('sidebar.shortcuts')}</span>
                                </button>
                            </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={activeSettingsView === 'about'}>
                                <button type="button" aria-label={t('sidebar.settingsAbout')} onClick={() => runNavigationAction(() => onOpenSettings('about'))}>
                                    <span>{t('sidebar.about')}</span>
                                </button>
                            </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={activeSettingsView === 'advanced'}>
                                <button type="button" aria-label={t('sidebar.settingsAdvanced')} onClick={() => runNavigationAction(() => onOpenSettings('advanced'))}>
                                    <span>{t('sidebar.advanced')}</span>
                                </button>
                            </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                    </SidebarMenuSub>
                ) : null}
            </SidebarMenu>
        </SidebarGroup>
    );
}

function SidebarPublishButton({
    canWrite,
    isReadonlySession,
    onOpenPublish,
}: Pick<OverlaySidebarProps, 'canWrite' | 'onOpenPublish'> & { isReadonlySession: boolean }) {
    const { t } = useI18n();
    const { state, isMobile, setOpenMobile } = useSidebar();
    const activePath = useLocation().pathname;
    const collapsed = !isMobile && state === 'collapsed';
    const readonlyReason = t('auth.readOnlySignInRequired');

    if ((isMobile && shouldShowMobileBottomNavigation(activePath)) || (!canWrite && !isReadonlySession)) {
        return null;
    }

    const publish = (): void => {
        onOpenPublish();
        if (isMobile) {
            setOpenMobile(false);
        }
    };

    return (
        <SidebarMenu className="py-2">
            <SidebarMenuItem>
                <SigningRequiredTooltip enabled={isReadonlySession} label={readonlyReason}>
                    <Button
                        type="button"
                        className={cn(!collapsed && 'w-full', collapsed && 'mx-auto')}
                        size={collapsed ? 'icon' : 'default'}
                        aria-label={t('sidebar.openPublish')}
                        title={isReadonlySession ? readonlyReason : t('sidebar.publish')}
                        disabled={isReadonlySession}
                        onClick={publish}
                    >
                        <PenSquareIcon data-icon="inline-start" />
                        {!collapsed ? <span>{t('sidebar.publish')}</span> : null}
                    </Button>
                </SigningRequiredTooltip>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

function SidebarPlatformHeader({ resolvedTheme }: { resolvedTheme: ResolvedOverlayTheme }) {
    const { t } = useI18n();
    const { state, isMobile } = useSidebar();
    const collapsed = !isMobile && state === 'collapsed';
    const platformLogoSrc = resolvedTheme === 'dark' ? '/icon-dark-48x48.png' : '/icon-light-48x48.png';

    return (
        <SidebarHeader className="relative border-b border-sidebar-border/60 pb-2">
            {!collapsed ? (
                <SidebarTrigger
                    className="absolute top-2 right-2 z-10"
                    aria-label={isMobile ? t('sidebar.closeNavigation') : t('sidebar.hidePanel')}
                    title={isMobile ? t('sidebar.closeNavigation') : t('sidebar.hidePanel')}
                />
            ) : null}
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton size="lg" className="pr-10 hover:bg-transparent active:bg-transparent">
                        <Avatar className="size-8 rounded-lg" data-testid="sidebar-platform-avatar">
                            <img
                                data-slot="avatar-image"
                                className="aspect-square size-full rounded-lg object-cover"
                                src={platformLogoSrc}
                                alt={t('sidebar.platformAvatarAlt')}
                            />
                        </Avatar>
                        <div className="grid flex-1 text-left text-sm leading-tight">
                            <span className="truncate font-semibold">Nostr City</span>
                            <span className="truncate text-xs text-muted-foreground">{t('sidebar.platformSubtitle')}</span>
                        </div>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarHeader>
    );
}

function SidebarCollapsedTrigger() {
    const { t } = useI18n();
    const { state, isMobile } = useSidebar();

    if (isMobile || state !== 'collapsed') {
        return null;
    }

    return (
        <div className="flex px-2 pt-2">
            <SidebarTrigger
                aria-label={t('sidebar.showPanel')}
                title={t('sidebar.showPanel')}
            />
        </div>
    );
}

function SidebarUserMenu({
    authSession,
    ownerPubkey,
    ownerProfile,
    onCopyOwnerNpub,
    onLocateOwner,
    onViewOwnerDetails,
    onOpenProfileEditor,
    onLogout,
}: Pick<OverlaySidebarProps, 'authSession' | 'ownerPubkey' | 'ownerProfile' | 'onCopyOwnerNpub' | 'onLocateOwner' | 'onViewOwnerDetails' | 'onOpenProfileEditor' | 'onLogout'>) {
    const { t } = useI18n();
    const { isMobile, setOpenMobile } = useSidebar();
    const resolvedOwnerPubkey = ownerPubkey ?? authSession?.pubkey;
    const isReadonlySession = Boolean(authSession?.readonly);
    const readonlyReason = t('auth.readOnlySignInRequired');

    if (!resolvedOwnerPubkey) {
        return null;
    }

    const shortPubkey = `${resolvedOwnerPubkey.slice(0, 10)}...${resolvedOwnerPubkey.slice(-6)}`;
    const ownerName = resolveDisplayName(ownerProfile, shortPubkey);
    const ownerFallback = resolveInitials(ownerProfile, resolvedOwnerPubkey);
    const ownerPicture = sanitizeImageUrl(ownerProfile?.picture);
    let ownerNpub: string | undefined;
    try {
        ownerNpub = encodeHexToNpub(resolvedOwnerPubkey);
    } catch {
        ownerNpub = undefined;
    }

    const ownerLabel = ownerNpub
        ? `${ownerNpub.slice(0, 14)}...${ownerNpub.slice(-6)}`
        : shortPubkey;

    const closeMobileSidebar = (): void => {
        if (isMobile) {
            setOpenMobile(false);
        }
    };

    return (
        <SidebarMenu className="mt-1 border-t border-sidebar-border/60 pt-2">
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                            aria-label={t('sidebar.openUserMenu')}
                            title={t('sidebar.profileActions')}
                        >
                            <Avatar className="h-8 w-8 rounded-lg">
                                {ownerPicture ? <AvatarImage src={ownerPicture} alt={t('sidebar.profileAvatarAlt')} /> : null}
                                <AvatarFallback className="rounded-lg">{ownerFallback}</AvatarFallback>
                            </Avatar>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-medium">{ownerName}</span>
                                <div className="flex items-center gap-1">
                                    <span className="truncate text-xs">{ownerLabel}</span>
                                    {authSession?.readonly ? <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">{t('sidebar.readOnly')}</Badge> : null}
                                </div>
                            </div>
                            <ChevronsUpDownIcon className="ml-auto" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="min-w-56 rounded-lg"
                        side={isMobile ? 'bottom' : 'right'}
                        align="end"
                    >
                        <DropdownMenuItem onSelect={() => {
                            void onCopyOwnerNpub?.(ownerNpub || resolvedOwnerPubkey);
                        }}>
                            <UserRoundIcon />
                            {t('sidebar.copyNpub')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            disabled={isReadonlySession}
                            aria-disabled={isReadonlySession ? 'true' : undefined}
                            title={isReadonlySession ? readonlyReason : undefined}
                            onSelect={(event) => {
                                if (isReadonlySession) {
                                    event.preventDefault();
                                    return;
                                }
                                closeMobileSidebar();
                                onOpenProfileEditor?.();
                            }}
                        >
                            <UserRoundIcon />
                            {t('sidebar.editProfile')}
                        </DropdownMenuItem>
                        {ownerPubkey ? (
                            <DropdownMenuItem onSelect={() => {
                                closeMobileSidebar();
                                onLocateOwner?.();
                            }}>
                                <MapPinIcon />
                                {t('sidebar.locateOnMap')}
                            </DropdownMenuItem>
                        ) : null}
                        {ownerPubkey ? (
                            <DropdownMenuItem onSelect={() => {
                                closeMobileSidebar();
                                onViewOwnerDetails?.();
                            }}>
                                <SearchIcon />
                                {t('sidebar.viewDetails')}
                            </DropdownMenuItem>
                        ) : null}
                        {authSession ? (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() => {
                                        closeMobileSidebar();
                                        void onLogout?.();
                                    }}
                                >
                                    <LogOutIcon />
                                    {t('sidebar.logout')}
                                </DropdownMenuItem>
                            </>
                        ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

function SidebarSocialContent({ children }: { children: ReactNode }) {
    const { state, isMobile } = useSidebar();

    if (!isMobile && state === 'collapsed') {
        return null;
    }

    return <>{children}</>;
}

export function OverlaySidebar({
    open,
    onOpenChange,
    resolvedTheme,
    authSession,
    ownerPubkey,
    ownerProfile,
    canWrite,
    canAccessDirectMessages,
    canAccessSocialNotifications,
    canAccessFollowingFeed,
    chatHasUnread,
    notificationsHasUnread,
    followingFeedHasUnread,
    onOpenMap,
    onOpenCityStats,
    onOpenChat,
    onOpenGroups,
    onOpenRelays,
    onOpenNotifications,
    onOpenFollowingFeed,
    onOpenArticles,
    onOpenGlobalSearch,
    onOpenWallet,
    onOpenPublish,
    onOpenSettings,
    isUiSettingsOpen,
    onLogout,
    onCopyOwnerNpub,
    onLocateOwner,
    onViewOwnerDetails,
    onOpenProfileEditor,
    missionsDiscoveredCount,
    missionsTotal,
    relaysConnectedCount,
    relaysTotal,
    onOpenMissions,
    mobileAppBarTitle,
    mobileAppBarShowBack,
    onMobileAppBarBack,
    children,
}: OverlaySidebarProps) {
    const { t } = useI18n();
    const location = useLocation();
    const providerStyle = useMemo(() => ({
        '--sidebar-width': `${OVERLAY_SIDEBAR_EXPANDED_WIDTH}px`,
        '--sidebar-width-icon': `${OVERLAY_SIDEBAR_COLLAPSED_WIDTH}px`,
    }) as CSSProperties, []);

    return (
        <SidebarProvider open={open} onOpenChange={onOpenChange} style={providerStyle}>
            <MobileOverlayAppBar
                title={mobileAppBarTitle}
                showBack={mobileAppBarShowBack}
                onBack={onMobileAppBarBack}
            />
            <Sidebar
                collapsible="icon"
                mobileTitle={t('sidebar.navigationTitle')}
                mobileDescription={t('sidebar.navigationDescription')}
            >
                <SidebarPlatformHeader resolvedTheme={resolvedTheme} />
                <SidebarCollapsedTrigger />
                <SidebarContent>
                    <SidebarGroup className="min-h-0 flex-1 pt-1">
                        <SidebarSocialContent>{children}</SidebarSocialContent>
                    </SidebarGroup>
                </SidebarContent>
                <SidebarFooter className="pt-0">
                    <SidebarActionsMenu
                        isReadonlySession={Boolean(authSession?.readonly)}
                        canAccessDirectMessages={canAccessDirectMessages}
                        canAccessSocialNotifications={canAccessSocialNotifications}
                        canAccessFollowingFeed={canAccessFollowingFeed}
                        chatHasUnread={chatHasUnread}
                        notificationsHasUnread={notificationsHasUnread}
                        followingFeedHasUnread={followingFeedHasUnread}
                        onOpenMap={onOpenMap}
                        onOpenCityStats={onOpenCityStats}
                        onOpenChat={onOpenChat}
                        onOpenGroups={onOpenGroups}
                        onOpenRelays={onOpenRelays}
                        onOpenNotifications={onOpenNotifications}
                        onOpenFollowingFeed={onOpenFollowingFeed}
                        onOpenArticles={onOpenArticles}
                        onOpenGlobalSearch={onOpenGlobalSearch}
                        onOpenWallet={onOpenWallet}
                        onOpenSettings={onOpenSettings}
                        isUiSettingsOpen={isUiSettingsOpen}
                        missionsDiscoveredCount={missionsDiscoveredCount}
                        missionsTotal={missionsTotal}
                        relaysConnectedCount={relaysConnectedCount}
                        relaysTotal={relaysTotal}
                        onOpenMissions={onOpenMissions}
                    />
                    <SidebarPublishButton
                        canWrite={canWrite}
                        isReadonlySession={Boolean(authSession?.readonly)}
                        onOpenPublish={onOpenPublish}
                    />
                    <SidebarUserMenu
                        {...(authSession ? { authSession } : {})}
                        {...(ownerPubkey ? { ownerPubkey } : {})}
                        {...(ownerProfile ? { ownerProfile } : {})}
                        {...(onCopyOwnerNpub ? { onCopyOwnerNpub } : {})}
                        {...(onLocateOwner ? { onLocateOwner } : {})}
                        {...(onViewOwnerDetails ? { onViewOwnerDetails } : {})}
                        {...(onOpenProfileEditor ? { onOpenProfileEditor } : {})}
                        {...(onLogout ? { onLogout } : {})}
                    />
                </SidebarFooter>
                <SidebarRail />
            </Sidebar>
            <MobileBottomNavigation
                activePath={location.pathname}
                canWrite={canWrite}
                canAccessFollowingFeed={canAccessFollowingFeed}
                canAccessSocialNotifications={canAccessSocialNotifications}
                followingFeedHasUnread={followingFeedHasUnread}
                notificationsHasUnread={notificationsHasUnread}
                relaysConnectedCount={relaysConnectedCount}
                relaysTotal={relaysTotal}
                onOpenMap={onOpenMap}
                onOpenFollowingFeed={onOpenFollowingFeed}
                onOpenPublish={onOpenPublish}
                onOpenRelays={onOpenRelays}
                onOpenNotifications={onOpenNotifications}
            />
        </SidebarProvider>
    );
}
