import type { AuthSessionState } from '../../nostr/auth/session';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import type { ResolvedOverlayTheme } from '../hooks/useOverlayTheme';
import type { SettingsRouteView } from '../settings/settings-routing';
import { OverlaySidebar, OVERLAY_SIDEBAR_COLLAPSED_WIDTH, OVERLAY_SIDEBAR_EXPANDED_WIDTH } from '../components/OverlaySidebar';
import { SocialSidebar } from '../components/SocialSidebar';

export { OVERLAY_SIDEBAR_COLLAPSED_WIDTH, OVERLAY_SIDEBAR_EXPANDED_WIDTH };

export type OverlaySidebarSettingsView = SettingsRouteView | 'ui';

interface OverlaySidebarLayerProps {
    showLoginGate: boolean;
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
    onOpenRelays: () => void;
    onOpenNotifications: () => void;
    onOpenFollowingFeed: () => void;
    onOpenArticles: () => void;
    onOpenGlobalSearch: () => void;
    onOpenWallet: () => void;
    onOpenPublish: () => void;
    onOpenSettings: (view: OverlaySidebarSettingsView) => void;
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
    follows: string[];
    profiles: Record<string, NostrProfile>;
    followers: string[];
    followerProfiles: Record<string, NostrProfile>;
    followersLoading: boolean;
    selectedPubkey?: string;
    onSelectFollowing?: (pubkey: string) => void;
    onLocateFollowing?: (pubkey: string) => void;
    onMessagePerson?: (pubkey: string) => void | Promise<void>;
    onFollowPerson?: (pubkey: string) => void | Promise<void>;
    onViewPersonDetails?: (pubkey: string) => void;
    zapAmounts: number[];
    onZapPerson?: (pubkey: string, amount: number) => void | Promise<void>;
    onConfigureZapAmounts: () => void;
    verificationByPubkey: Record<string, Nip05ValidationResult | undefined>;
}

export function OverlaySidebarLayer({
    showLoginGate,
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
    follows,
    profiles,
    followers,
    followerProfiles,
    followersLoading,
    selectedPubkey,
    onSelectFollowing,
    onLocateFollowing,
    onMessagePerson,
    onFollowPerson,
    onViewPersonDetails: onViewPersonDetailsFromSocialSidebar,
    zapAmounts,
    onZapPerson,
    onConfigureZapAmounts,
    verificationByPubkey,
}: OverlaySidebarLayerProps) {
    if (showLoginGate) {
        return null;
    }

    return (
        <OverlaySidebar
            open={open}
            onOpenChange={onOpenChange}
            resolvedTheme={resolvedTheme}
            {...(authSession ? { authSession } : {})}
            {...(ownerPubkey ? { ownerPubkey } : {})}
            {...(ownerProfile ? { ownerProfile } : {})}
            canWrite={canWrite}
            canAccessDirectMessages={canAccessDirectMessages}
            canAccessSocialNotifications={canAccessSocialNotifications}
            canAccessFollowingFeed={canAccessFollowingFeed}
            chatHasUnread={chatHasUnread}
            notificationsHasUnread={notificationsHasUnread}
            followingFeedHasUnread={followingFeedHasUnread}
            onOpenMap={onOpenMap}
            onOpenCityStats={onOpenCityStats}
            onOpenChat={onOpenChat}
            onOpenRelays={onOpenRelays}
            onOpenNotifications={onOpenNotifications}
            onOpenFollowingFeed={onOpenFollowingFeed}
            onOpenArticles={onOpenArticles}
            onOpenGlobalSearch={onOpenGlobalSearch}
            onOpenWallet={onOpenWallet}
            onOpenPublish={onOpenPublish}
            onOpenSettings={onOpenSettings}
            isUiSettingsOpen={isUiSettingsOpen}
            {...(onLogout ? { onLogout } : {})}
            {...(onCopyOwnerNpub ? { onCopyOwnerNpub } : {})}
            {...(onLocateOwner ? { onLocateOwner } : {})}
            {...(onViewOwnerDetails ? { onViewOwnerDetails } : {})}
            {...(onOpenProfileEditor ? { onOpenProfileEditor } : {})}
            missionsDiscoveredCount={missionsDiscoveredCount}
            missionsTotal={missionsTotal}
            relaysConnectedCount={relaysConnectedCount}
            relaysTotal={relaysTotal}
            onOpenMissions={onOpenMissions}
        >
            <SocialSidebar
                follows={follows}
                profiles={profiles}
                followers={followers}
                followerProfiles={followerProfiles}
                followersLoading={followersLoading}
                {...(selectedPubkey ? { selectedFollowingPubkey: selectedPubkey } : {})}
                {...(onSelectFollowing ? { onSelectFollowing } : {})}
                {...(onLocateFollowing ? { onLocateFollowing } : {})}
                {...(onMessagePerson ? { onMessagePerson } : {})}
                {...(onFollowPerson ? { onFollowPerson } : {})}
                {...(onViewPersonDetailsFromSocialSidebar ? { onViewPersonDetails: onViewPersonDetailsFromSocialSidebar } : {})}
                zapAmounts={zapAmounts}
                {...(onZapPerson ? { onZapPerson } : {})}
                onConfigureZapAmounts={onConfigureZapAmounts}
                {...(onCopyOwnerNpub ? { onCopyOwnerNpub } : {})}
                verificationByPubkey={verificationByPubkey}
            />
        </OverlaySidebar>
    );
}
