import type { ProviderResolveInput } from '../../nostr/auth/providers/types';
import type { AuthSessionState, LoginMethod } from '../../nostr/auth/session';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { RelayType } from '../../nostr/relay-settings';
import type { SocialEngagementByEventId, ViewerReactionByEventId, ViewerReplyByEventId, ViewerZapByEventId } from '../../nostr/social-feed-service';
import type { NostrEvent, NostrProfile } from '../../nostr/types';
import type { UiSettingsState } from '../../nostr/ui-settings';
import type { EasterEggId } from '../../ts/ui/easter_eggs';
import { EasterEggDialog } from '../components/EasterEggDialog';
import { EasterEggFireworks } from '../components/EasterEggFireworks';
import { LoginGateScreen } from '../components/LoginGateScreen';
import { MapPresenceLayer } from '../components/MapPresenceLayer';
import { SocialComposeDialog, type SocialComposeSubmitInput } from '../components/SocialComposeDialog';
import { UiSettingsDialog } from '../components/UiSettingsDialog';
import type { NoteCardModel } from '../components/note-card-model';
import type { ZapIntentInput } from '../controllers/use-wallet-zap-controller';
import { getEasterEggEntry } from '../easter-eggs/catalog';
import type { ResolvedOverlayTheme } from '../hooks/useOverlayTheme';
import type { MapBridge } from '../map-bridge';
import type { ActiveProfileQueryState } from '../query/active-profile.query';
import type { SearchUsersResult } from '../query/user-search.query';
import { ActiveProfileDialogContainer } from './ActiveProfileDialogContainer';

interface OverlayDialogActiveEasterEgg {
    nonce: number;
    buildingIndex: number;
    easterEggId: EasterEggId;
}

interface OverlayDialogSocialComposeState {
    mode: 'post' | 'quote';
    quoteTarget?: NoteCardModel;
}

interface OverlayDialogLayerProps {
    mapBridge: MapBridge | null;
    showLoginGate: boolean;
    occupancyByBuildingIndex: Record<number, string>;
    discoveredEasterEggIds: EasterEggId[];
    profiles: Record<string, NostrProfile>;
    ownerPubkey?: string;
    ownerProfile?: NostrProfile;
    ownerBuildingIndex?: number;
    occupiedLabelsZoomLevel: number;
    alwaysVisiblePubkeys: string[];
    specialMarkersEnabled: boolean;
    activeProfilePubkey: string | undefined;
    activeProfile?: NostrProfile;
    activeProfileData: ActiveProfileQueryState;
    activeProfileEngagementByEventId: SocialEngagementByEventId;
    richContentProfilesByPubkey: Record<string, NostrProfile>;
    activeProfileVerification?: Nip05ValidationResult;
    verificationByPubkey: Record<string, Nip05ValidationResult | undefined>;
    eventReferencesById: Record<string, NostrEvent>;
    ownerFollows: string[];
    canWrite: boolean;
    canAccessDirectMessages: boolean;
    reactionByEventId: Record<string, boolean>;
    viewerReactionByEventId?: ViewerReactionByEventId;
    viewerZapByEventId?: ViewerZapByEventId;
    viewerReplyByEventId?: ViewerReplyByEventId;
    repostByEventId: Record<string, boolean>;
    pendingReactionByEventId: Record<string, boolean>;
    pendingRepostByEventId: Record<string, boolean>;
    onCloseActiveProfile: () => void;
    onOpenThread: (eventId: string) => void | Promise<void>;
    onSelectHashtag: (hashtag: string) => void;
    onSelectProfile: (pubkey: string) => void;
    onCopyNpub: (value: string) => void | Promise<void>;
    onAddRelaySuggestion: (relayUrl: string, relayTypes: RelayType[]) => void | Promise<void>;
    onAddAllRelaySuggestions: (rows: Array<{ relayUrl: string; relayTypes: RelayType[] }>) => void | Promise<void>;
    onFollowProfile: (pubkey: string) => void | Promise<void>;
    onSendMessage: (pubkey: string) => void | Promise<void>;
    onToggleReaction: (input: { eventId: string; targetPubkey?: string; emoji?: string }) => Promise<boolean>;
    onToggleRepost: (input: { eventId: string; targetPubkey?: string; repostContent?: string }) => Promise<boolean>;
    onOpenQuoteComposer: (note: NoteCardModel) => void;
    onRequestZapPayment: (input: ZapIntentInput) => Promise<void>;
    zapAmounts: number[];
    onConfigureZapAmounts: () => void;
    donationPubkey?: string;
    canDonateWithWallet: boolean;
    onResolveProfiles: (pubkeys: string[]) => Promise<void> | void;
    onResolveEventReferences: (
        eventIds: string[],
        options?: { relayHintsByEventId?: Record<string, string[]> }
    ) => Promise<Record<string, NostrEvent> | void> | Record<string, NostrEvent> | void;
    activeEasterEgg: OverlayDialogActiveEasterEgg | null;
    easterEggCelebrationNonce: number;
    onCloseActiveEasterEgg: () => void;
    socialComposeState: OverlayDialogSocialComposeState | null;
    isSubmittingSocialCompose: boolean;
    onSearchUsers: (query: string) => Promise<SearchUsersResult>;
    userSearchRelaySetKey?: string;
    onCloseSocialCompose: () => void;
    onSubmitSocialCompose: (content: SocialComposeSubmitInput) => Promise<void> | void;
    publicDemoMode?: boolean;
    authSession?: AuthSessionState;
    savedLocalAccount?: { pubkey: string; mode: 'device' | 'passphrase' };
    loginDisabled: boolean;
    sessionRestorationResolved: boolean;
    mapLoaderText: string | null;
    resolvedOverlayTheme: ResolvedOverlayTheme;
    onStartSession: (method: LoginMethod, input: ProviderResolveInput) => Promise<void> | void;
    isUiSettingsDialogOpen: boolean;
    uiSettings: UiSettingsState;
    onPersistUiSettings: (nextState: UiSettingsState) => void;
    onOpenUiSettingsDialog: () => void;
    onCloseUiSettingsDialog: () => void;
}

export function OverlayDialogLayer({
    mapBridge,
    showLoginGate,
    occupancyByBuildingIndex,
    discoveredEasterEggIds,
    profiles,
    ownerPubkey,
    ownerProfile,
    ownerBuildingIndex,
    occupiedLabelsZoomLevel,
    alwaysVisiblePubkeys,
    specialMarkersEnabled,
    activeProfilePubkey,
    activeProfile,
    activeProfileData,
    activeProfileEngagementByEventId,
    richContentProfilesByPubkey,
    activeProfileVerification,
    verificationByPubkey,
    eventReferencesById,
    ownerFollows,
    canWrite,
    canAccessDirectMessages,
    reactionByEventId,
    viewerReactionByEventId,
    viewerZapByEventId,
    viewerReplyByEventId,
    repostByEventId,
    pendingReactionByEventId,
    pendingRepostByEventId,
    onCloseActiveProfile,
    onOpenThread,
    onSelectHashtag,
    onSelectProfile,
    onCopyNpub,
    onAddRelaySuggestion,
    onAddAllRelaySuggestions,
    onFollowProfile,
    onSendMessage,
    onToggleReaction,
    onToggleRepost,
    onOpenQuoteComposer,
    onRequestZapPayment,
    zapAmounts,
    onConfigureZapAmounts,
    donationPubkey,
    canDonateWithWallet,
    onResolveProfiles,
    onResolveEventReferences,
    activeEasterEgg,
    easterEggCelebrationNonce,
    onCloseActiveEasterEgg,
    socialComposeState,
    isSubmittingSocialCompose,
    onSearchUsers,
    userSearchRelaySetKey,
    onCloseSocialCompose,
    onSubmitSocialCompose,
    publicDemoMode = false,
    authSession,
    savedLocalAccount,
    loginDisabled,
    sessionRestorationResolved,
    mapLoaderText,
    resolvedOverlayTheme,
    onStartSession,
    isUiSettingsDialogOpen,
    uiSettings,
    onPersistUiSettings,
    onOpenUiSettingsDialog,
    onCloseUiSettingsDialog,
}: OverlayDialogLayerProps) {
    return (
        <>
            <MapPresenceLayer
                mapBridge={mapBridge}
                occupancyByBuildingIndex={occupancyByBuildingIndex}
                discoveredEasterEggIds={discoveredEasterEggIds}
                profiles={profiles}
                {...(ownerPubkey ? { ownerPubkey } : {})}
                {...(ownerProfile ? { ownerProfile } : {})}
                {...(ownerBuildingIndex !== undefined ? { ownerBuildingIndex } : {})}
                occupiedLabelsZoomLevel={occupiedLabelsZoomLevel}
                alwaysVisiblePubkeys={alwaysVisiblePubkeys}
                specialMarkersEnabled={specialMarkersEnabled}
            />

            <ActiveProfileDialogContainer
                {...(ownerPubkey ? { ownerPubkey } : {})}
                activeProfilePubkey={activeProfilePubkey}
                {...(activeProfile ? { activeProfile } : {})}
                activeProfileData={activeProfileData}
                activeProfileEngagementByEventId={activeProfileEngagementByEventId}
                richContentProfilesByPubkey={richContentProfilesByPubkey}
                {...(activeProfileVerification !== undefined ? { activeProfileVerification } : {})}
                verificationByPubkey={verificationByPubkey}
                eventReferencesById={eventReferencesById}
                ownerFollows={ownerFollows}
                canWrite={canWrite}
                canAccessDirectMessages={canAccessDirectMessages}
                reactionByEventId={reactionByEventId}
                {...(viewerReactionByEventId ? { viewerReactionByEventId } : {})}
                {...(viewerZapByEventId ? { viewerZapByEventId } : {})}
                {...(viewerReplyByEventId ? { viewerReplyByEventId } : {})}
                repostByEventId={repostByEventId}
                pendingReactionByEventId={pendingReactionByEventId}
                pendingRepostByEventId={pendingRepostByEventId}
                onClose={onCloseActiveProfile}
                onOpenThread={onOpenThread}
                onSelectHashtag={onSelectHashtag}
                onSelectProfile={onSelectProfile}
                onCopyNpub={onCopyNpub}
                onAddRelaySuggestion={onAddRelaySuggestion}
                onAddAllRelaySuggestions={onAddAllRelaySuggestions}
                onFollowProfile={onFollowProfile}
                onSendMessage={onSendMessage}
                onToggleReaction={onToggleReaction}
                onToggleRepost={onToggleRepost}
                onOpenQuoteComposer={onOpenQuoteComposer}
                onRequestZapPayment={onRequestZapPayment}
                zapAmounts={zapAmounts}
                onConfigureZapAmounts={onConfigureZapAmounts}
                {...(donationPubkey ? { donationPubkey } : {})}
                canDonateWithWallet={canDonateWithWallet}
                onResolveProfiles={onResolveProfiles}
                onResolveEventReferences={onResolveEventReferences}
            />

            {activeEasterEgg ? (
                <EasterEggDialog
                    key={activeEasterEgg.nonce}
                    buildingIndex={activeEasterEgg.buildingIndex}
                    entry={getEasterEggEntry(activeEasterEgg.easterEggId)}
                    onClose={onCloseActiveEasterEgg}
                />
            ) : null}

            <EasterEggFireworks nonce={easterEggCelebrationNonce} />

            {socialComposeState ? (
                <SocialComposeDialog
                    open
                    mode={socialComposeState.mode}
                    {...(socialComposeState.quoteTarget ? { quoteTarget: socialComposeState.quoteTarget } : {})}
                    profilesByPubkey={richContentProfilesByPubkey}
                    isSubmitting={isSubmittingSocialCompose}
                    onSearchUsers={onSearchUsers}
                    ownerPubkey={ownerPubkey}
                    searchRelaySetKey={userSearchRelaySetKey}
                    onOpenChange={(open) => {
                        if (!open) {
                            onCloseSocialCompose();
                        }
                    }}
                    onSubmit={onSubmitSocialCompose}
                />
            ) : null}

            {showLoginGate ? (
                <LoginGateScreen
                    {...(authSession ? { authSession } : {})}
                    {...(savedLocalAccount ? { savedLocalAccount } : {})}
                    disabled={loginDisabled || !sessionRestorationResolved}
                    mapLoaderText={mapLoaderText}
                    overlayTheme={resolvedOverlayTheme}
                    restoringSession={!sessionRestorationResolved}
                    publicDemoMode={publicDemoMode}
                    onStartSession={onStartSession}
                />
            ) : null}

            <UiSettingsDialog
                open={isUiSettingsDialogOpen}
                uiSettings={uiSettings}
                onPersistUiSettings={onPersistUiSettings}
                mapBridge={mapBridge}
                onOpenChange={(open) => {
                    if (open) {
                        onOpenUiSettingsDialog();
                        return;
                    }

                    onCloseUiSettingsDialog();
                }}
            />
        </>
    );
}
