import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    DEFAULT_STREET_LABELS_ZOOM_LEVEL,
    getDefaultUiSettings,
    loadUiSettings,
    saveUiSettings,
    UI_SETTINGS_STORAGE_KEY,
    type UiTheme,
    type UiSettingsState,
} from '../nostr/ui-settings';
import { loadZapSettings, type ZapSettingsState } from '../nostr/zap-settings';
import { useNostrOverlay } from './hooks/useNostrOverlay';
import { useNip05Verification } from './hooks/useNip05Verification';
import { useOverlaySocialFeedController } from './controllers/use-overlay-social-feed-controller';
import { useOverlayArticlesController } from './controllers/use-overlay-articles-controller';
import { useOverlayNotificationsController } from './controllers/use-overlay-notifications-controller';
import { useOverlayDmController } from './controllers/use-overlay-dm-controller';
import { useWalletZapController, type ZapIntentInput } from './controllers/use-wallet-zap-controller';
import { useEasterEggDiscoveryController } from './hooks/useEasterEggDiscoveryController';
import { useFollowingFeedEngagementQuery } from './query/following-feed.query';
import { useActiveProfileQuery } from './query/active-profile.query';
import {
    addOptimisticZapEntry,
    applyLocalViewerZapState,
    applyOptimisticZapMetrics,
    pruneCaughtUpOptimisticZapEntries,
    selectChatConversationSummaries,
    selectChatDetailMessages,
    selectDiscoveredMissionsCount,
    selectEngagementWithFallback,
    selectMapLoaderStageLabel,
    selectOptimisticZapBaseByEventId,
    selectPostEventIds,
    selectRelaySetKey,
    selectRichContentProfilesByPubkey,
    selectVerificationProfilesByPubkey,
    selectVerificationTargetPubkeys,
    selectVerifiedBuildingIndexes,
    type LocalViewerZapEntry,
    type OptimisticZapEntry,
} from './app.selectors';
import type { SocialComposeSubmitInput } from './components/SocialComposeDialog';
import { uploadImageToBlossom, type UploadedImageAttachment } from './media/blossom-image-upload';
import { uploadImageBlobToBlossom } from './media/blossom-upload';
import type { MapBridge } from './map-bridge';
import { extractStreetLabelUsernames } from './domain/street-label-users';
import { EASTER_EGG_MISSIONS } from './easter-eggs/missions';
import {
    addRelay,
    loadRelaySettings,
    saveRelaySettings,
    type RelaySettingsState,
    type RelayType,
} from '../nostr/relay-settings';
import type { NostrEvent } from '../nostr/types';
import { useRelayConnectionSummary } from './hooks/useRelayConnectionSummary';
import { useOverlayTheme } from './hooks/useOverlayTheme';
import { OverlayAppShell } from './shell/OverlayAppShell';
import {
    OverlaySidebarLayer,
    OVERLAY_SIDEBAR_COLLAPSED_WIDTH,
    OVERLAY_SIDEBAR_EXPANDED_WIDTH,
} from './shell/OverlaySidebarLayer';
import { OverlayDialogLayer } from './shell/OverlayDialogLayer';
import { OverlayMapInteractionLayer } from './shell/OverlayMapInteractionLayer';
import { normalizeHashtag, useOverlayRouteState } from './shell/use-overlay-route-state';
import {
    resolveMobileAppBarTitle,
    resolveMobileBackBehavior,
    shouldShowMobileBack,
} from './shell/mobile-navigation';
import { useOverlayNavigationStack } from './shell/use-overlay-navigation-stack';
import { OverlayRoutes } from './routes/OverlayRoutes';
import type { NoteCardModel } from './components/note-card-model';
import { decodeNpubToHex } from '../nostr/npub';
import { useIsMobile } from '@/hooks/use-mobile';
import { Toaster, toast } from 'sonner';
import { translate } from '@/i18n/translate';
import { SITE_THEME_CHANGE_EVENT } from '@/site/theme-preference';
import type { OverlayServices } from './services/overlay-services';

interface AppProps {
    mapBridge: MapBridge | null;
    services: OverlayServices;
}

interface SocialComposeState {
    mode: 'post' | 'quote';
    quoteTarget?: NoteCardModel;
}

const STRHODLER_DONATION_PUBKEY = decodeNpubToHex('npub1dd3k7ku95jhpyh9y7pgx9qrh2ykvtfl5lnncqzzt2gyhgw0a04ysm4paad');

function isWalletReadyForDonation(settings: ReturnType<typeof useWalletZapController>['walletSettings']): boolean {
    const connection = settings.activeConnection;
    return Boolean(connection?.capabilities.payInvoice && connection.restoreState === 'connected');
}

function canCreateZapRequest(input: { writeGateway: unknown; relaySettingsSnapshot: RelaySettingsState }): boolean {
    return Boolean(
        input.writeGateway
        && (
            input.relaySettingsSnapshot.byType.nip65Both.length > 0
            || input.relaySettingsSnapshot.byType.nip65Write.length > 0
        )
    );
}

export function App({ mapBridge, services }: AppProps) {
    const {
        navigate,
        location,
        activeAgoraHashtag,
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
    } = useOverlayRouteState();
    const { goBackWithinApp } = useOverlayNavigationStack({
        location,
        navigate,
        fallbackPath: '/',
    });
    const overlay = useNostrOverlay({ mapBridge, services });
    const activeProfileData = useActiveProfileQuery({
        ...(overlay.activeProfilePubkey ? { pubkey: overlay.activeProfilePubkey } : {}),
        service: overlay.activeProfileService,
    });
    const relaySettingsOwnerPubkey = overlay.authSession?.pubkey;
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [relaySettingsSnapshot, setRelaySettingsSnapshot] = useState<RelaySettingsState>(() => loadRelaySettings(
        relaySettingsOwnerPubkey ? { ownerPubkey: relaySettingsOwnerPubkey } : undefined
    ));
    const [uiSettings, setUiSettings] = useState<UiSettingsState>(() => loadUiSettings());
    const [zapSettings, setZapSettings] = useState<ZapSettingsState>(() => loadZapSettings());
    const [optimisticZapByEventId, setOptimisticZapByEventId] = useState<Record<string, OptimisticZapEntry>>({});
    const [localViewerZapByEventId, setLocalViewerZapByEventId] = useState<Record<string, LocalViewerZapEntry>>({});
    const [socialComposeState, setSocialComposeState] = useState<SocialComposeState | null>(null);
    const [isSubmittingSocialCompose, setIsSubmittingSocialCompose] = useState(false);
    const userSearchRelaySetKey = useMemo(
        () => selectRelaySetKey(relaySettingsSnapshot.byType.search),
        [relaySettingsSnapshot.byType.search]
    );
    const [eventReferencesById, setEventReferencesById] = useState<Record<string, NostrEvent>>({});
    const isMobile = useIsMobile();
    const lastTrafficParticlesCountRef = useRef(
        Math.max(
            1,
            uiSettings.trafficParticlesCount > 0
                ? uiSettings.trafficParticlesCount
                : getDefaultUiSettings().trafficParticlesCount
        )
    );
    const loginDisabled = overlay.status !== 'idle' && overlay.status !== 'success' && overlay.status !== 'error';
    const mapLoaderText = selectMapLoaderStageLabel(overlay.mapLoaderStage, uiSettings.language);
    const mobileAppBarTitle = resolveMobileAppBarTitle({
        pathname: location.pathname,
        language: uiSettings.language,
    });
    const mobileAppBarShowBack = shouldShowMobileBack(location.pathname);
    const sessionRestorationResolved = overlay.sessionRestorationResolved;

    useEffect(() => {
        const syncUiSettings = (event?: Event): void => {
            if (event instanceof StorageEvent && event.key && event.key !== UI_SETTINGS_STORAGE_KEY) {
                return;
            }

            setUiSettings(loadUiSettings());
        };

        window.addEventListener('storage', syncUiSettings);
        window.addEventListener(SITE_THEME_CHANGE_EVENT, syncUiSettings);

        return () => {
            window.removeEventListener('storage', syncUiSettings);
            window.removeEventListener(SITE_THEME_CHANGE_EVENT, syncUiSettings);
        };
    }, []);

    const isAppReady = Boolean(overlay.authSession) && overlay.status === 'success' && !overlay.authSession?.locked;
    const showLoginGate = !sessionRestorationResolved || !isAppReady;
    const lastErrorToastRef = useRef<string | undefined>(undefined);
    const streetLabelUsernames = useMemo(() => extractStreetLabelUsernames({
        occupancyByBuildingIndex: overlay.occupancyByBuildingIndex,
        profiles: overlay.profiles,
    }), [overlay.occupancyByBuildingIndex, overlay.profiles]);
    const verificationProfilesByPubkey = useMemo(() => selectVerificationProfilesByPubkey({
        profiles: overlay.profiles,
        followerProfiles: overlay.followerProfiles,
        networkProfiles: activeProfileData.networkProfiles,
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
        ...(overlay.ownerProfile ? { ownerProfile: overlay.ownerProfile } : {}),
        ...(overlay.activeProfilePubkey ? { activeProfilePubkey: overlay.activeProfilePubkey } : {}),
        ...(overlay.activeProfile ? { activeProfile: overlay.activeProfile } : {}),
    }), [
        overlay.profiles,
        overlay.followerProfiles,
        activeProfileData.networkProfiles,
        overlay.ownerPubkey,
        overlay.ownerProfile,
        overlay.activeProfilePubkey,
        overlay.activeProfile,
    ]);
    const verificationTargetPubkeys = useMemo(() => selectVerificationTargetPubkeys({
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
        follows: overlay.follows,
        followers: overlay.followers,
        occupancyByBuildingIndex: overlay.occupancyByBuildingIndex,
        ...(overlay.activeProfilePubkey ? { activeProfilePubkey: overlay.activeProfilePubkey } : {}),
    }), [
        overlay.ownerPubkey,
        overlay.follows,
        overlay.followers,
        overlay.occupancyByBuildingIndex,
        overlay.activeProfilePubkey,
    ]);
    const verificationByPubkey = useNip05Verification({
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
        profilesByPubkey: verificationProfilesByPubkey,
        targetPubkeys: verificationTargetPubkeys,
    });
    const verifiedBuildingIndexes = useMemo(() => selectVerifiedBuildingIndexes({
        enabled: uiSettings.verifiedBuildingsOverlayEnabled,
        occupancyByBuildingIndex: overlay.occupancyByBuildingIndex,
        verificationByPubkey,
    }), [uiSettings.verifiedBuildingsOverlayEnabled, overlay.occupancyByBuildingIndex, verificationByPubkey]);
    const mapViewportInsetLeft = isMobile
        ? 0
        : sidebarOpen
            ? OVERLAY_SIDEBAR_EXPANDED_WIDTH
            : OVERLAY_SIDEBAR_COLLAPSED_WIDTH;
    const {
        easterEggProgress,
        activeEasterEgg,
        easterEggCelebrationNonce,
        closeActiveEasterEgg,
        resetEasterEggProgress,
    } = useEasterEggDiscoveryController({
        mapBridge,
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
    });
    const discoveredMissionsCount = useMemo(
        () => selectDiscoveredMissionsCount(easterEggProgress.discoveredIds),
        [easterEggProgress.discoveredIds]
    );

    useEffect(() => {
        setZapSettings(loadZapSettings(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : undefined));
    }, [overlay.ownerPubkey]);

    useEffect(() => {
        if (uiSettings.trafficParticlesCount > 0) {
            lastTrafficParticlesCountRef.current = uiSettings.trafficParticlesCount;
        }
    }, [uiSettings.trafficParticlesCount]);

    useEffect(() => {
        if (overlay.status !== 'error' || !overlay.error) {
            lastErrorToastRef.current = undefined;
            return;
        }

        if (lastErrorToastRef.current === overlay.error) {
            return;
        }

        lastErrorToastRef.current = overlay.error;
        toast.error(overlay.error, { duration: 2200 });
    }, [overlay.status, overlay.error]);

    const {
        chatState,
        canAccessDirectMessages,
        chatPinnedConversationId,
        chatActiveConversationId,
        chatComposerFocusKey,
        setChatPinnedConversationId,
        setChatComposerFocusKey,
    } = useOverlayDmController({
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
        canDirectMessages: overlay.canDirectMessages,
        isChatsRoute,
        locationSearch: location.search,
        navigate,
        service: overlay.directMessagesService,
    });
    const {
        socialState,
        canAccessSocialNotifications,
    } = useOverlayNotificationsController({
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
        canWrite: overlay.canWrite,
        isNotificationsRoute,
        service: overlay.socialNotificationsService,
    });
    const handleFollowPerson = useCallback(async (pubkey: string): Promise<void> => {
        if (!pubkey || !overlay.canWrite) {
            return;
        }

        try {
            await overlay.followPerson(pubkey);
        } catch (error) {
            const message = error instanceof Error ? error.message : translate(uiSettings.language, 'app.toast.followUpdateFailed');
            toast.error(message, { duration: 2200 });
        }
    }, [overlay.canWrite, overlay.followPerson, uiSettings.language]);
    const socialFeed = useOverlaySocialFeedController({
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
        follows: overlay.follows,
        ...(activeAgoraHashtag ? { activeAgoraHashtag } : {}),
        isAgoraRoute,
        canWrite: overlay.canWrite,
        service: overlay.socialFeedService,
        ...((overlay.socialPublisher ?? overlay.writeGateway) ? { writeGateway: overlay.socialPublisher ?? overlay.writeGateway } : {}),
        onFollowPerson: handleFollowPerson,
    });
    const articles = useOverlayArticlesController({
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
        follows: overlay.follows,
        isArticlesRoute: isArticlesRoute || isArticleDetailRoute,
        service: overlay.socialFeedService,
    });
    const followingFeed = socialFeed.followingFeed;
    const followPerson = socialFeed.followPerson;
    const activeProfilePostEventIds = useMemo(
        () => selectPostEventIds(activeProfileData.posts),
        [activeProfileData.posts]
    );
    const activeProfileEngagementQuery = useFollowingFeedEngagementQuery({
        eventIds: activeProfilePostEventIds,
        service: overlay.socialFeedService,
        enabled: Boolean(overlay.activeProfilePubkey),
    });
    const activeProfileEngagementByEventId = useMemo(() => selectEngagementWithFallback({
        eventIds: activeProfilePostEventIds,
        ...(activeProfileEngagementQuery.data ? { data: activeProfileEngagementQuery.data } : {}),
    }), [activeProfileEngagementQuery.data, activeProfilePostEventIds]);
    const activeProfileEngagementWithOptimisticByEventId = useMemo(
        () => applyOptimisticZapMetrics(activeProfileEngagementByEventId, optimisticZapByEventId),
        [activeProfileEngagementByEventId, optimisticZapByEventId],
    );
    const followingFeedEngagementByEventId = useMemo(
        () => applyOptimisticZapMetrics(followingFeed.engagementByEventId, optimisticZapByEventId),
        [followingFeed.engagementByEventId, optimisticZapByEventId],
    );
    const followingFeedViewerZapByEventId = useMemo(
        () => applyLocalViewerZapState(followingFeed.viewerZapByEventId, localViewerZapByEventId),
        [followingFeed.viewerZapByEventId, localViewerZapByEventId],
    );
    const activeProfileViewerZapByEventId = useMemo(
        () => applyLocalViewerZapState(followingFeed.viewerZapByEventId, localViewerZapByEventId),
        [followingFeed.viewerZapByEventId, localViewerZapByEventId],
    );
    const optimisticZapBaseByEventId = useMemo(() => selectOptimisticZapBaseByEventId({
        activeProfileEngagementByEventId,
        followingFeedEngagementByEventId: followingFeed.engagementByEventId,
    }), [activeProfileEngagementByEventId, followingFeed.engagementByEventId]);
    useEffect(() => {
        setOptimisticZapByEventId((current) => pruneCaughtUpOptimisticZapEntries(current, optimisticZapBaseByEventId));
    }, [optimisticZapBaseByEventId]);
    const richContentProfilesByPubkey = useMemo(() => selectRichContentProfilesByPubkey({
        profiles: overlay.profiles,
        followerProfiles: overlay.followerProfiles,
        networkProfiles: activeProfileData.networkProfiles,
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
        ...(overlay.ownerProfile ? { ownerProfile: overlay.ownerProfile } : {}),
        ...(overlay.activeProfilePubkey ? { activeProfilePubkey: overlay.activeProfilePubkey } : {}),
        ...(overlay.activeProfile ? { activeProfile: overlay.activeProfile } : {}),
    }), [
        activeProfileData.networkProfiles,
        overlay.activeProfile,
        overlay.activeProfilePubkey,
        overlay.followerProfiles,
        overlay.ownerProfile,
        overlay.ownerPubkey,
        overlay.profiles,
    ]);

    const chatConversations = useMemo(() => selectChatConversationSummaries({
        conversations: chatState.conversations,
        profiles: overlay.profiles,
        followerProfiles: overlay.followerProfiles,
        verificationByPubkey,
        pinnedConversationId: chatPinnedConversationId,
    }), [chatState.conversations, overlay.profiles, overlay.followerProfiles, chatPinnedConversationId, verificationByPubkey]);

    const chatMessages = useMemo(() => selectChatDetailMessages({
        conversations: chatState.conversations,
        activeConversationId: chatActiveConversationId,
    }), [chatState.conversations, chatActiveConversationId]);

    const canAccessFollowingFeed = socialFeed.canAccessFollowingFeed;
    const relayStatusTargets = relaySettingsSnapshot.relays;
    const relayConnectionSummary = useRelayConnectionSummary(relayStatusTargets, {
        enabled: relayStatusTargets.length > 0,
        maxConcurrentProbes: 3,
    });
    const resolvedOverlayTheme = useOverlayTheme(uiSettings.theme as UiTheme);
    const followingFeedHasUnread = socialFeed.followingFeedHasUnread;
    const canSendChatMessages = canAccessDirectMessages;
    const activeProfileVerification = overlay.activeProfilePubkey
        ? verificationByPubkey[overlay.activeProfilePubkey]
        : undefined;

    useEffect(() => {
        setRelaySettingsSnapshot(loadRelaySettings(
            relaySettingsOwnerPubkey ? { ownerPubkey: relaySettingsOwnerPubkey } : undefined
        ));
    }, [relaySettingsOwnerPubkey]);

    useEffect(() => {
        setEventReferencesById({});
        setLocalViewerZapByEventId({});
    }, [overlay.ownerPubkey]);

    const copyText = async (value: string, successMessage: string): Promise<void> => {
        if (!value) {
            return;
        }

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            toast.success(successMessage, { duration: 1600 });
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            toast.success(successMessage, { duration: 1600 });
        } finally {
            textarea.remove();
        }
    };

    const copyOwnerIdentifier = async (value: string): Promise<void> => {
        await copyText(value, translate(uiSettings.language, 'profile.toast.npubCopied'));
    };

    const copyNoteIdentifier = async (value: string): Promise<void> => {
        await copyText(value, translate(uiSettings.language, 'profile.toast.noteIdCopied'));
    };

    const locateOwnerOnMap = (): void => {
        if (!mapBridge || overlay.ownerBuildingIndex === undefined) {
            return;
        }

        mapBridge.focusBuilding(overlay.ownerBuildingIndex);
    };

    const locateFollowingOnMap = (pubkey: string): void => {
        if (!mapBridge || !pubkey) {
            return;
        }

        const match = Object.entries(overlay.occupancyByBuildingIndex).find(([, assignedPubkey]) => assignedPubkey === pubkey);
        if (!match) {
            return;
        }

        const buildingIndex = Number(match[0]);
        if (!Number.isInteger(buildingIndex)) {
            return;
        }

        if (!isMapRoute) {
            navigate('/');
        }

        mapBridge.focusBuilding(buildingIndex);
    };

    const selectSidebarPerson = (pubkey: string): void => {
        if (!pubkey) {
            return;
        }

        overlay.selectFollowing(pubkey);

        if (!isMapRoute) {
            navigate('/');
        }
    };

    const addRelaySuggestionToSettings = (relayUrl: string, relayTypes: RelayType[]): void => {
        const ownerInput = relaySettingsOwnerPubkey ? { ownerPubkey: relaySettingsOwnerPubkey } : undefined;
        const currentRelaySettings = loadRelaySettings(ownerInput);
        let nextRelaySettings = currentRelaySettings;

        for (const relayType of relayTypes) {
            nextRelaySettings = addRelay(nextRelaySettings, relayUrl, relayType);
        }

        const savedRelaySettings = saveRelaySettings(nextRelaySettings, ownerInput);
        setRelaySettingsSnapshot(savedRelaySettings);
    };

    const addAllRelaySuggestionsToSettings = (rows: Array<{ relayUrl: string; relayTypes: RelayType[] }>): void => {
        if (!rows || rows.length === 0) {
            return;
        }

        const ownerInput = relaySettingsOwnerPubkey ? { ownerPubkey: relaySettingsOwnerPubkey } : undefined;
        const currentRelaySettings = loadRelaySettings(ownerInput);
        let nextRelaySettings = currentRelaySettings;

        for (const row of rows) {
            for (const relayType of row.relayTypes) {
                nextRelaySettings = addRelay(nextRelaySettings, row.relayUrl, relayType);
            }
        }

        const savedRelaySettings = saveRelaySettings(nextRelaySettings, ownerInput);
        setRelaySettingsSnapshot(savedRelaySettings);
    };

    const openChatList = (): void => {
        if (!canAccessDirectMessages) {
            return;
        }

        chatState.openList();
        setChatPinnedConversationId(null);
        navigate('/chats');
    };

    const openChatConversation = (conversationId: string, focusComposer: boolean = false): void => {
        if (!canAccessDirectMessages) {
            return;
        }

        chatState.openConversation(conversationId);
        setChatPinnedConversationId(conversationId);
        const params = new URLSearchParams({ peer: conversationId });
        if (focusComposer) {
            params.set('compose', '1');
        }
        navigate(`/chats?${params.toString()}`);
        if (focusComposer) {
            setChatComposerFocusKey(`${conversationId}:${Date.now()}`);
        }
    };

    const openNotifications = (): void => {
        if (!canAccessSocialNotifications) {
            return;
        }

        navigate('/notifications');
    };

    const openFollowingFeed = (): void => {
        if (!canAccessFollowingFeed) {
            return;
        }

        navigate('/agora');
    };

    const openArticles = (): void => {
        if (!canAccessFollowingFeed) {
            return;
        }

        navigate('/agora/articles');
    };

    const openPublishComposer = (): void => {
        if (!overlay.canWrite) {
            return;
        }

        setSocialComposeState({ mode: 'post' });
    };

    const openQuoteComposer = (note: NoteCardModel): void => {
        if (!overlay.canWrite) {
            return;
        }

        setSocialComposeState({ mode: 'quote', quoteTarget: note });
    };

    const closeSocialCompose = (): void => {
        if (isSubmittingSocialCompose) {
            return;
        }

        setSocialComposeState(null);
    };

    const selectFollowingFeedHashtag = (hashtag: string): void => {
        const normalized = normalizeHashtag(hashtag);
        if (!normalized) {
            return;
        }

        navigate(`/agora?tag=${encodeURIComponent(normalized)}`);
    };

    const selectProfilePostHashtag = (hashtag: string): void => {
        const normalized = normalizeHashtag(hashtag);
        if (!normalized) {
            return;
        }

        overlay.closeActiveProfileDialog();
        navigate(`/agora?tag=${encodeURIComponent(normalized)}`);
    };

    const openThreadFromProfileDialog = (eventId: string): void => {
        if (!eventId) {
            return;
        }

        overlay.closeActiveProfileDialog();
        openFollowingFeed();
        void followingFeed.openThread(eventId);
    };

    const handleToggleRepost = useCallback(async (input: Parameters<typeof followingFeed.toggleRepost>[0]): Promise<boolean> => {
        const wasActive = Boolean(followingFeed.repostByEventId[input.eventId]);
        const succeeded = await followingFeed.toggleRepost(input);

        if (succeeded) {
            toast.success(translate(uiSettings.language, wasActive ? 'feed.toast.repostRemoved' : 'feed.toast.repostPublished'), { duration: 1800 });
            return true;
        }

        toast.error(translate(uiSettings.language, wasActive ? 'feed.toast.repostRemoveFailed' : 'feed.toast.repostPublishFailed'), { duration: 2200 });
        return false;
    }, [followingFeed.repostByEventId, followingFeed.toggleRepost, uiSettings.language]);

    const uploadComposeImage = useCallback(async (image: { file: File } | undefined): Promise<UploadedImageAttachment | undefined> => {
        if (!image) {
            return undefined;
        }

        try {
            return await uploadImageToBlossom(image.file, {
                signEvent: (event) => overlay.writeGateway.publishEvent(event),
            });
        } catch {
            toast.error(translate(uiSettings.language, 'feed.toast.imageUploadFailed'), { duration: 2200 });
            return undefined;
        }
    }, [overlay.writeGateway, uiSettings.language]);

    const uploadProfileImage = useCallback(async (file: File): Promise<string> => {
        const uploaded = await uploadImageBlobToBlossom(file, {
            signEvent: (event) => overlay.writeGateway.publishEvent(event),
        });

        return uploaded.url;
    }, [overlay.writeGateway]);

    const loadLatestProfileMetadata = useCallback(async (): Promise<string | undefined> => {
        if (!overlay.ownerPubkey) {
            return undefined;
        }

        try {
            const client = services.createClient(overlay.relayHints);
            await client.connect();
            return (await client.fetchLatestReplaceableEvent(overlay.ownerPubkey, 0))?.content;
        } catch {
            return undefined;
        }
    }, [overlay.ownerPubkey, overlay.relayHints, services]);

    const publishReplyWithImage = useCallback(async (input: Omit<Parameters<typeof followingFeed.publishReply>[0], 'image'> & { image?: { file: File } }): Promise<boolean> => {
        const { image: selectedImage, ...replyInput } = input;
        const image = await uploadComposeImage(selectedImage);
        if (selectedImage && !image) {
            return false;
        }

        return followingFeed.publishReply({
            ...replyInput,
            ...(image ? { image } : {}),
        });
    }, [followingFeed.publishReply, uploadComposeImage]);

    const submitSocialCompose = useCallback(async (input: SocialComposeSubmitInput): Promise<void> => {
        if (!socialComposeState) {
            return;
        }

        const content = input.content;

        setIsSubmittingSocialCompose(true);
        try {
            const image = await uploadComposeImage(input.image);
            if (input.image && !image) {
                return;
            }

            if (socialComposeState.mode === 'post') {
                const succeeded = await followingFeed.publishPost({
                    content,
                    ...(image ? { image } : {}),
                });
                if (succeeded) {
                    toast.success(translate(uiSettings.language, 'feed.toast.postPublished'), { duration: 1800 });
                    setSocialComposeState(null);
                    return;
                }

                toast.error(translate(uiSettings.language, 'feed.toast.postPublishFailed'), { duration: 2200 });
                return;
            }

            const quoteTarget = socialComposeState.quoteTarget;
            if (!quoteTarget) {
                toast.error(translate(uiSettings.language, 'feed.toast.quotePublishFailed'), { duration: 2200 });
                return;
            }

            const succeeded = await followingFeed.publishQuote({
                targetEventId: quoteTarget.id,
                targetPubkey: quoteTarget.pubkey,
                content,
                ...(image ? { image } : {}),
            });

            if (succeeded) {
                toast.success(translate(uiSettings.language, 'feed.toast.quotePublished'), { duration: 1800 });
                setSocialComposeState(null);
                return;
            }

            toast.error(translate(uiSettings.language, 'feed.toast.quotePublishFailed'), { duration: 2200 });
        } finally {
            setIsSubmittingSocialCompose(false);
        }
    }, [followingFeed.publishPost, followingFeed.publishQuote, socialComposeState, uiSettings.language, uploadComposeImage]);

    const openMentionedProfile = (pubkey: string): void => {
        if (!pubkey) {
            return;
        }

        overlay.openActiveProfile(pubkey);
    };

    const resolveMentionProfiles = async (pubkeys: string[]): Promise<void> => {
        if (!pubkeys || pubkeys.length === 0) {
            return;
        }

        await overlay.loadProfilesByPubkeys(pubkeys);
    };

    const openReferencedEventFromFeed = (eventId: string): void => {
        if (!eventId) {
            return;
        }

        void followingFeed.openThread(eventId);
    };

    const openNotificationThread = (eventId: string): void => {
        if (!eventId) {
            return;
        }

        openFollowingFeed();
        void followingFeed.openThread(eventId);
    };

    const resolveEventReferences = async (
        eventIds: string[],
        options?: { relayHintsByEventId?: Record<string, string[]> }
    ): Promise<Record<string, NostrEvent>> => {
        if (!eventIds || eventIds.length === 0) {
            return {};
        }

        const loadedEvents = await overlay.loadEventsByIds(eventIds, options);
        if (Object.keys(loadedEvents).length === 0) {
            return {};
        }

        setEventReferencesById((current) => ({
            ...current,
            ...loadedEvents,
        }));

        return loadedEvents;
    };

    const clearFollowingFeedHashtagFilter = (): void => {
        if (!activeAgoraHashtag) {
            return;
        }

        navigate('/agora');
    };

    const openRelaysPage = (): void => {
        navigate('/relays');
    };

    const handleMobileAppBarBack = (): void => {
        const behavior = resolveMobileBackBehavior({
            pathname: location.pathname,
            search: location.search,
            hasActiveAgoraThread: Boolean(followingFeed.activeThread),
        });

        if (behavior.type === 'closeAgoraThread') {
            followingFeed.closeThread();
            return;
        }

        if (behavior.type === 'openChatList') {
            openChatList();
            return;
        }

        if (behavior.type === 'navigate') {
            navigate(behavior.to);
            return;
        }

        goBackWithinApp();
    };

    const setStreetLabelsQuickToggle = (enabled: boolean): void => {
        setUiSettings((currentSettings) => saveUiSettings({
            ...currentSettings,
            streetLabelsEnabled: enabled,
            streetLabelsZoomLevel: enabled
                ? Math.min(
                    currentSettings.streetLabelsZoomLevel,
                    Math.max(
                        DEFAULT_STREET_LABELS_ZOOM_LEVEL,
                        Math.max(1, Math.min(20, Math.floor(mapBridge?.getZoom() ?? 1)))
                    )
                )
                : currentSettings.streetLabelsZoomLevel,
        }));
        toast.success(translate(uiSettings.language, enabled ? 'app.toast.streetLabelsEnabled' : 'app.toast.streetLabelsDisabled'), { duration: 1800 });
    };

    const setSpecialMarkersQuickToggle = (enabled: boolean): void => {
        setUiSettings((currentSettings) => saveUiSettings({
            ...currentSettings,
            specialMarkersEnabled: enabled,
        }));
        toast.success(translate(uiSettings.language, enabled ? 'app.toast.specialIconsEnabled' : 'app.toast.specialIconsDisabled'), { duration: 1800 });
    };

    const setCarsQuickToggle = (enabled: boolean): void => {
        setUiSettings((currentSettings) => {
            if (enabled) {
                const restoredCount = currentSettings.trafficParticlesCount > 0
                    ? currentSettings.trafficParticlesCount
                    : Math.max(1, lastTrafficParticlesCountRef.current);
                return saveUiSettings({
                    ...currentSettings,
                    trafficParticlesCount: restoredCount,
                });
            }

            if (currentSettings.trafficParticlesCount > 0) {
                lastTrafficParticlesCountRef.current = currentSettings.trafficParticlesCount;
            }

            return saveUiSettings({
                ...currentSettings,
                trafficParticlesCount: 0,
            });
        });
        toast.success(translate(uiSettings.language, enabled ? 'app.toast.carsEnabled' : 'app.toast.carsDisabled'), { duration: 1800 });
    };

    const setThemeQuickToggle = (theme: Extract<UiTheme, 'light' | 'dark'>): void => {
        setUiSettings((currentSettings) => saveUiSettings({
            ...currentSettings,
            theme,
        }));
    };

    const setAgoraFeedLayout = (layout: UiSettingsState['agoraFeedLayout']): void => {
        setUiSettings((currentSettings) => saveUiSettings({
            ...currentSettings,
            agoraFeedLayout: layout,
        }));
    };

    const persistUiSettings = (nextState: UiSettingsState): void => {
        setUiSettings(saveUiSettings(nextState));
    };

    const openDmFromContextMenu = async (pubkey: string): Promise<void> => {
        if (!canAccessDirectMessages) {
            return;
        }

        overlay.closeActiveProfileDialog();
        openChatConversation(pubkey, true);
    };

    const recordOptimisticZap = useCallback((input: { eventId?: string; amount: number }) => {
        setOptimisticZapByEventId((current) => addOptimisticZapEntry(current, optimisticZapBaseByEventId, input));
        if (input.eventId) {
            setLocalViewerZapByEventId((current) => ({
                ...current,
                [input.eventId as string]: {
                    amountSats: input.amount,
                    createdAt: Math.floor(Date.now() / 1000),
                },
            }));
        }
    }, [optimisticZapBaseByEventId]);

    const walletZapController = useWalletZapController({
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
        location,
        navigate,
        language: uiSettings.language,
        createClient: services.createClient,
        relaySettingsSnapshot,
        profiles: overlay.profiles,
        followerProfiles: overlay.followerProfiles,
        ...(overlay.ownerProfile ? { ownerProfile: overlay.ownerProfile } : {}),
        ...(overlay.writeGateway ? { writeGateway: overlay.writeGateway } : {}),
        onRecordOptimisticZap: recordOptimisticZap,
    });
    const {
        walletSettings,
        walletActivity,
        walletNwcUriInput,
        setWalletNwcUriInput,
        connectWebLnWallet,
        connectNwcWallet,
        disconnectWallet,
        refreshWallet,
    } = walletZapController;
    const requestZapPayment: (input: ZapIntentInput) => Promise<void> = walletZapController.handleZapIntent;
    const strhodlerDonationProfile = useMemo(() => {
        if (!STRHODLER_DONATION_PUBKEY) {
            return undefined;
        }

        if (overlay.activeProfilePubkey === STRHODLER_DONATION_PUBKEY && overlay.activeProfile) {
            return overlay.activeProfile;
        }

        return overlay.profiles[STRHODLER_DONATION_PUBKEY]
            ?? overlay.followerProfiles[STRHODLER_DONATION_PUBKEY]
            ?? (overlay.ownerPubkey === STRHODLER_DONATION_PUBKEY ? overlay.ownerProfile : undefined);
    }, [overlay.activeProfile, overlay.activeProfilePubkey, overlay.followerProfiles, overlay.ownerProfile, overlay.ownerPubkey, overlay.profiles]);
    const canDonateWithWallet = overlay.canWrite && isWalletReadyForDonation(walletSettings) && canCreateZapRequest({
        writeGateway: overlay.writeGateway,
        relaySettingsSnapshot,
    });
    const requestDonationPayment = useCallback((input: { pubkey: string; amount: number }) => (
        requestZapPayment({ targetPubkey: input.pubkey, amount: input.amount })
    ), [requestZapPayment]);

    const handleLogout = async (): Promise<void> => {
        await overlay.logoutSession?.();
        resetEasterEggProgress();
        setZapSettings(loadZapSettings());
        navigate('/');
    };

    return (
        <OverlayAppShell
            sidebar={(
                <OverlaySidebarLayer
                    showLoginGate={showLoginGate}
                    open={sidebarOpen}
                    onOpenChange={setSidebarOpen}
                    resolvedTheme={resolvedOverlayTheme}
                    {...(overlay.authSession ? { authSession: overlay.authSession } : {})}
                    {...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {})}
                    {...(overlay.ownerProfile ? { ownerProfile: overlay.ownerProfile } : {})}
                    canWrite={overlay.canWrite}
                    canAccessDirectMessages={canAccessDirectMessages}
                    canAccessSocialNotifications={canAccessSocialNotifications}
                    canAccessFollowingFeed={canAccessFollowingFeed}
                    chatHasUnread={chatState.hasUnreadGlobal}
                    notificationsHasUnread={socialState.hasUnread}
                    followingFeedHasUnread={followingFeedHasUnread}
                    onOpenMap={() => navigate('/')}
                    onOpenCityStats={() => navigate('/city-stats')}
                    onOpenChat={openChatList}
                    onOpenRelays={openRelaysPage}
                    onOpenNotifications={openNotifications}
                    onOpenFollowingFeed={openFollowingFeed}
                    onOpenArticles={openArticles}
                    onOpenGlobalSearch={openGlobalUserSearch}
                    onOpenWallet={() => navigate('/wallet')}
                    onOpenPublish={openPublishComposer}
                    onOpenProfileEditor={() => navigate('/profile')}
                    onOpenSettings={openSettingsDestination}
                    isUiSettingsOpen={isUiSettingsDialogOpen}
                    onLogout={handleLogout}
                    onCopyOwnerNpub={copyOwnerIdentifier}
                    onLocateOwner={locateOwnerOnMap}
                    onViewOwnerDetails={() => {
                        if (overlay.ownerPubkey) {
                            overlay.openActiveProfile(overlay.ownerPubkey, overlay.ownerBuildingIndex);
                        }
                    }}
                    missionsDiscoveredCount={discoveredMissionsCount}
                    missionsTotal={EASTER_EGG_MISSIONS.length}
                    relaysConnectedCount={relayConnectionSummary.connectedRelays}
                    relaysTotal={relayConnectionSummary.totalRelays}
                    onOpenMissions={() => navigate('/discover')}
                    mobileAppBarTitle={mobileAppBarTitle}
                    mobileAppBarShowBack={mobileAppBarShowBack}
                    onMobileAppBarBack={handleMobileAppBarBack}
                    follows={overlay.follows}
                    profiles={overlay.profiles}
                    followers={overlay.followers}
                    followerProfiles={overlay.followerProfiles}
                    followersLoading={overlay.followersLoading}
                    {...(overlay.selectedPubkey ? { selectedPubkey: overlay.selectedPubkey } : {})}
                    onSelectFollowing={selectSidebarPerson}
                    onLocateFollowing={locateFollowingOnMap}
                    {...(canAccessDirectMessages ? { onMessagePerson: openDmFromContextMenu } : {})}
                    {...(overlay.canWrite ? { onFollowPerson: followPerson } : {})}
                    onViewPersonDetails={(pubkey) => overlay.openActiveProfile(pubkey)}
                    zapAmounts={zapSettings.amounts}
                    {...(overlay.canWrite ? { onZapPerson: (pubkey: string, amount: number) => requestZapPayment({ targetPubkey: pubkey, amount }) } : {})}
                    onConfigureZapAmounts={() => openSettingsPage('zaps')}
                    verificationByPubkey={verificationByPubkey}
                />
            )}
            mapControls={(
                <>
                    <OverlayMapInteractionLayer
                        mapBridge={mapBridge}
                        isMapRoute={isMapRoute}
                        showLoginGate={showLoginGate}
                        viewportInsetLeft={mapViewportInsetLeft}
                        resolvedOverlayTheme={resolvedOverlayTheme}
                        mapLoaderText={mapLoaderText}
                        language={uiSettings.language}
                        streetLabelsEnabled={uiSettings.streetLabelsEnabled}
                        streetLabelsZoomLevel={uiSettings.streetLabelsZoomLevel}
                        streetLabelUsernames={streetLabelUsernames}
                        trafficParticlesCount={uiSettings.trafficParticlesCount}
                        trafficParticlesSpeed={uiSettings.trafficParticlesSpeed}
                        verifiedBuildingIndexes={verifiedBuildingIndexes}
                        specialMarkersEnabled={uiSettings.specialMarkersEnabled}
                        profiles={overlay.profiles}
                        followerProfiles={overlay.followerProfiles}
                        {...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {})}
                        {...(overlay.ownerProfile ? { ownerProfile: overlay.ownerProfile } : {})}
                        canWrite={overlay.canWrite}
                        canAccessDirectMessages={canAccessDirectMessages}
                        zapAmounts={zapSettings.amounts}
                        onRegenerateMap={overlay.regenerateMap}
                        onThemeChange={setThemeQuickToggle}
                        onCarsEnabledChange={setCarsQuickToggle}
                        onStreetLabelsEnabledChange={setStreetLabelsQuickToggle}
                        onSpecialMarkersEnabledChange={setSpecialMarkersQuickToggle}
                        onCopyNpub={copyOwnerIdentifier}
                        onOpenDirectMessage={openDmFromContextMenu}
                        onOpenProfile={overlay.openActiveProfile}
                        onRequestZapPayment={requestZapPayment}
                        onConfigureZapAmounts={() => openSettingsPage('zaps')}
                    />

                    <Toaster richColors position="bottom-center" closeButton={false} theme={resolvedOverlayTheme} />
                </>
            )}
            main={(
                <OverlayRoutes
                    showLoginGate={showLoginGate}
                    sessionRestorationResolved={sessionRestorationResolved}
                    locationSearch={location.search}
                    agora={{
                        isMobile,
                        agoraFeedLayout: uiSettings.agoraFeedLayout,
                        onAgoraFeedLayoutChange: setAgoraFeedLayout,
                        followingFeed: {
                            items: followingFeed.items,
                            pendingNewCount: followingFeed.pendingNewCount,
                            hasPendingNewItems: followingFeed.hasPendingNewItems,
                            hasFollows: followingFeed.hasFollows,
                            ...(followingFeed.activeHashtag ? { activeHashtag: followingFeed.activeHashtag } : {}),
                            isLoadingFeed: followingFeed.isLoadingFeed,
                            isRefreshingFeed: followingFeed.isRefreshingFeed,
                            feedError: followingFeed.feedError,
                            hasMoreFeed: followingFeed.hasMoreFeed,
                            activeThread: followingFeed.activeThread,
                            isPublishingPost: followingFeed.isPublishingPost,
                            isPublishingReply: followingFeed.isPublishingReply,
                            publishError: followingFeed.publishError,
                            reactionByEventId: followingFeed.reactionByEventId,
                            viewerReactionByEventId: followingFeed.viewerReactionByEventId,
                            viewerZapByEventId: followingFeedViewerZapByEventId,
                            viewerReplyByEventId: followingFeed.viewerReplyByEventId,
                            repostByEventId: followingFeed.repostByEventId,
                            pendingReactionByEventId: followingFeed.pendingReactionByEventId,
                            pendingRepostByEventId: followingFeed.pendingRepostByEventId,
                            loadNextFeedPage: followingFeed.loadNextFeedPage,
                            applyPendingNewItems: followingFeed.applyPendingNewItems,
                            refreshFeed: followingFeed.refreshFeed,
                            openThread: followingFeed.openThread,
                            closeThread: followingFeed.closeThread,
                            loadNextThreadPage: followingFeed.loadNextThreadPage,
                            publishPost: followingFeed.publishPost,
                            publishReply: publishReplyWithImage,
                            toggleReaction: followingFeed.toggleReaction,
                        },
                        profilesByPubkey: richContentProfilesByPubkey,
                        engagementByEventId: followingFeedEngagementByEventId,
                        onClearHashtag: clearFollowingFeedHashtagFilter,
                        onSelectHashtag: selectFollowingFeedHashtag,
                        onSelectProfile: openMentionedProfile,
                        onResolveProfiles: resolveMentionProfiles,
                        onSelectEventReference: openReferencedEventFromFeed,
                        onResolveEventReferences: resolveEventReferences,
                        eventReferencesById,
                        onCopyNoteId: copyNoteIdentifier,
                        canWrite: overlay.canWrite,
                        onToggleRepost: handleToggleRepost,
                        onOpenQuoteComposer: openQuoteComposer,
                        requestZapPayment,
                        zapAmounts: zapSettings.amounts,
                        onConfigureZapAmounts: () => openSettingsPage('zaps'),
                        onSearchUsers: overlay.searchUsers,
                        ownerPubkey: overlay.ownerPubkey,
                        searchRelaySetKey: userSearchRelaySetKey,
                    }}
                    articles={{
                        items: articles.items,
                        profilesByPubkey: richContentProfilesByPubkey,
                        isLoading: articles.isLoading,
                        isRefreshing: articles.isRefreshing,
                        isLoadingMore: articles.isLoadingMore,
                        error: articles.error,
                        hasMore: articles.hasMore,
                        onRefresh: articles.refresh,
                        onLoadMore: articles.loadMore,
                        onOpenArticle: (eventId) => navigate(`/agora/articles/${eventId}`),
                    }}
                    articleDetail={{
                        items: articles.items,
                        service: overlay.socialFeedService,
                        enabled: Boolean(overlay.ownerPubkey),
                        onBack: () => navigate('/agora/articles'),
                    }}
                    cityStats={{
                        buildingsCount: overlay.buildingsCount,
                        occupiedBuildingsCount: overlay.assignedCount,
                        followedPubkeys: overlay.follows,
                        followerPubkeys: overlay.followers,
                        profilesByPubkey: overlay.profiles,
                        verificationByPubkey,
                        parkCount: overlay.parkCount,
                    }}
                    notifications={{
                        canAccessSocialNotifications,
                        hasUnread: socialState.hasUnread,
                        pendingSnapshot: socialState.pendingSnapshot,
                        items: socialState.items,
                        hasMore: socialState.hasMore,
                        isLoadingMore: socialState.isLoadingMore,
                        profilesByPubkey: overlay.profiles,
                        eventReferencesById,
                        onResolveProfiles: resolveMentionProfiles,
                        onResolveEventReferences: resolveEventReferences,
                        onLoadMore: socialState.loadMore,
                        onOpenThread: openNotificationThread,
                        onOpenProfile: (pubkey) => overlay.openActiveProfile(pubkey),
                    }}
                    chats={{
                        hasUnreadGlobal: chatState.hasUnreadGlobal,
                        isLoadingConversations: chatState.isBootstrapping,
                        conversations: chatConversations,
                        messages: chatMessages,
                        activeConversationId: chatActiveConversationId,
                        ...(chatComposerFocusKey ? { composerAutoFocusKey: chatComposerFocusKey } : {}),
                        canSendChatMessages,
                        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
                        canDirectMessages: overlay.canDirectMessages,
                        onOpenConversation: (conversationId) => openChatConversation(conversationId),
                        sendMessage: async (conversationId, plaintext) => {
                            await chatState.sendMessage(conversationId, plaintext);
                        },
                    }}
                    relays={{
                        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
                        suggestedRelays: overlay.suggestedRelays,
                        suggestedRelaysByType: overlay.suggestedRelaysByType,
                        onRelaySettingsChange: setRelaySettingsSnapshot,
                    }}
                    relayDetail={{
                        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
                        suggestedRelays: overlay.suggestedRelays,
                        suggestedRelaysByType: overlay.suggestedRelaysByType,
                    }}
                    discover={{
                        discoveredIds: easterEggProgress.discoveredIds,
                    }}
                    wallet={{
                        canWrite: overlay.canWrite,
                        walletSettings,
                        walletActivity,
                        walletNwcUriInput,
                        setWalletNwcUriInput,
                        connectNwcWallet,
                        connectWebLnWallet,
                        disconnectWallet,
                        refreshWallet,
                    }}
                    profile={{
                        ownerPubkey: overlay.ownerPubkey ?? '',
                        ...(overlay.ownerProfile ? { ownerProfile: overlay.ownerProfile } : {}),
                        canWrite: overlay.canWrite && Boolean(overlay.ownerPubkey),
                        onBack: () => navigate('/'),
                        onUploadProfileImage: uploadProfileImage,
                        onLoadLatestProfileMetadata: loadLatestProfileMetadata,
                        onPublishProfileMetadata: async (content) => {
                            if (!overlay.writeGateway) {
                                throw new Error('Write gateway is unavailable');
                            }

                            return overlay.writeGateway.publishProfileMetadata(content);
                        },
                        onProfileSaved: (profile) => overlay.applyOwnerProfile(profile),
                    }}
                    userSearch={{
                        onClose: closeGlobalUserSearch,
                        onSearch: overlay.searchUsers,
                        searchRelaySetKey: userSearchRelaySetKey,
                        onOpenActiveProfile: (pubkey) => {
                            overlay.openActiveProfile(pubkey);
                        },
                        ownerPubkey: overlay.ownerPubkey,
                        followedPubkeys: overlay.follows,
                        verificationByPubkey,
                        onCopyNpub: copyOwnerIdentifier,
                        canWrite: overlay.canWrite,
                        onFollowUser: followPerson,
                        canAccessDirectMessages,
                        onMessageUser: openDmFromContextMenu,
                    }}
                    settings={{
                        mapBridge,
                        suggestedRelays: overlay.suggestedRelays,
                        suggestedRelaysByType: overlay.suggestedRelaysByType,
                        onUiSettingsChange: persistUiSettings,
                        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
                        zapSettings,
                        onZapSettingsChange: setZapSettings,
                        onClose: () => navigate('/'),
                    }}
                    donation={{
                        ...(strhodlerDonationProfile ? { profile: strhodlerDonationProfile } : {}),
                        canDonateWithWallet,
                        onDonate: requestDonationPayment,
                    }}
                />
            )}
            dialogs={(
                <OverlayDialogLayer
                    mapBridge={mapBridge}
                    showLoginGate={showLoginGate}
                    occupancyByBuildingIndex={overlay.occupancyByBuildingIndex}
                    discoveredEasterEggIds={easterEggProgress.discoveredIds}
                    profiles={overlay.profiles}
                    {...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {})}
                    {...(overlay.ownerProfile ? { ownerProfile: overlay.ownerProfile } : {})}
                    {...(overlay.ownerBuildingIndex !== undefined ? { ownerBuildingIndex: overlay.ownerBuildingIndex } : {})}
                    occupiedLabelsZoomLevel={uiSettings.occupiedLabelsZoomLevel}
                    alwaysVisiblePubkeys={overlay.alwaysVisiblePubkeys}
                    specialMarkersEnabled={uiSettings.specialMarkersEnabled}
                    activeProfilePubkey={overlay.activeProfilePubkey}
                    {...(overlay.activeProfile ? { activeProfile: overlay.activeProfile } : {})}
                    activeProfileData={activeProfileData}
                    activeProfileEngagementByEventId={activeProfileEngagementWithOptimisticByEventId}
                    richContentProfilesByPubkey={richContentProfilesByPubkey}
                    {...(activeProfileVerification !== undefined ? { activeProfileVerification } : {})}
                    verificationByPubkey={verificationByPubkey}
                    eventReferencesById={eventReferencesById}
                    ownerFollows={overlay.follows}
                    canWrite={overlay.canWrite}
                    canAccessDirectMessages={canAccessDirectMessages}
                    reactionByEventId={followingFeed.reactionByEventId}
                    viewerReactionByEventId={followingFeed.viewerReactionByEventId}
                    viewerZapByEventId={activeProfileViewerZapByEventId}
                    viewerReplyByEventId={followingFeed.viewerReplyByEventId}
                    repostByEventId={followingFeed.repostByEventId}
                    pendingReactionByEventId={followingFeed.pendingReactionByEventId}
                    pendingRepostByEventId={followingFeed.pendingRepostByEventId}
                    onCloseActiveProfile={overlay.closeActiveProfileDialog}
                    onOpenThread={openThreadFromProfileDialog}
                    onSelectHashtag={selectProfilePostHashtag}
                    onSelectProfile={openMentionedProfile}
                    onCopyNpub={copyOwnerIdentifier}
                    onAddRelaySuggestion={addRelaySuggestionToSettings}
                    onAddAllRelaySuggestions={addAllRelaySuggestionsToSettings}
                    onFollowProfile={followPerson}
                    onSendMessage={openDmFromContextMenu}
                    onToggleReaction={followingFeed.toggleReaction}
                    onToggleRepost={handleToggleRepost}
                    onOpenQuoteComposer={openQuoteComposer}
                    onRequestZapPayment={requestZapPayment}
                    zapAmounts={zapSettings.amounts}
                    onConfigureZapAmounts={() => openSettingsPage('zaps')}
                    {...(STRHODLER_DONATION_PUBKEY ? { donationPubkey: STRHODLER_DONATION_PUBKEY } : {})}
                    canDonateWithWallet={canDonateWithWallet}
                    onResolveProfiles={resolveMentionProfiles}
                    onResolveEventReferences={resolveEventReferences}
                    activeEasterEgg={activeEasterEgg}
                    easterEggCelebrationNonce={easterEggCelebrationNonce}
                    onCloseActiveEasterEgg={closeActiveEasterEgg}
                    socialComposeState={socialComposeState}
                    isSubmittingSocialCompose={isSubmittingSocialCompose}
                    onSearchUsers={overlay.searchUsers}
                    userSearchRelaySetKey={userSearchRelaySetKey}
                    onCloseSocialCompose={closeSocialCompose}
                    onSubmitSocialCompose={submitSocialCompose}
                    {...(overlay.authSession ? { authSession: overlay.authSession } : {})}
                    {...(overlay.savedLocalAccount ? { savedLocalAccount: overlay.savedLocalAccount } : {})}
                    loginDisabled={loginDisabled}
                    sessionRestorationResolved={sessionRestorationResolved}
                    mapLoaderText={mapLoaderText}
                    resolvedOverlayTheme={resolvedOverlayTheme}
                    onStartSession={overlay.startSession}
                    isUiSettingsDialogOpen={isUiSettingsDialogOpen}
                    uiSettings={uiSettings}
                    onPersistUiSettings={persistUiSettings}
                    onOpenUiSettingsDialog={openUiSettingsDialog}
                    onCloseUiSettingsDialog={closeUiSettingsDialog}
                />
            )}
        />
    );
}
