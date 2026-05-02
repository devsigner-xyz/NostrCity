import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { RelaySettingsByType, RelayType } from '../../nostr/relay-settings';
import type { SocialEngagementByEventId, ViewerReactionByEventId, ViewerReplyByEventId, ViewerZapByEventId } from '../../nostr/social-feed-service';
import type { NostrEvent, NostrProfile } from '../../nostr/types';
import type { ZapIntentInput } from '../controllers/use-wallet-zap-controller';
import { OccupantProfileDialog } from '../components/OccupantProfileDialog';
import type { NoteCardModel } from '../components/note-card-model';
import type { ActiveProfileQueryState } from '../query/active-profile.query';

interface ActiveProfileDialogContainerProps {
    ownerPubkey?: string;
    activeProfilePubkey: string | undefined;
    activeProfile?: NostrProfile;
    activeProfileData: ActiveProfileQueryState;
    activeProfileEngagementByEventId: SocialEngagementByEventId;
    richContentProfilesByPubkey: Record<string, NostrProfile>;
    activeProfileVerification?: Nip05ValidationResult;
    verificationByPubkey: Record<string, Nip05ValidationResult | undefined>;
    eventReferencesById: Record<string, NostrEvent>;
    ownerFollows: string[];
    mutedPubkeys?: string[];
    canWrite: boolean;
    canAccessDirectMessages: boolean;
    reactionByEventId: Record<string, boolean>;
    viewerReactionByEventId?: ViewerReactionByEventId;
    viewerZapByEventId?: ViewerZapByEventId;
    viewerReplyByEventId?: ViewerReplyByEventId;
    repostByEventId: Record<string, boolean>;
    pendingReactionByEventId: Record<string, boolean>;
    pendingRepostByEventId: Record<string, boolean>;
    onClose: () => void;
    onOpenThread: (eventId: string) => void | Promise<void>;
    onSelectHashtag: (hashtag: string) => void;
    onSelectProfile: (pubkey: string) => void;
    onCopyNpub: (value: string) => void | Promise<void>;
    onAddRelaySuggestion: (relayUrl: string, relayTypes: RelayType[]) => void | Promise<void>;
    onAddAllRelaySuggestions: (rows: Array<{ relayUrl: string; relayTypes: RelayType[] }>) => void | Promise<void>;
    onFollowProfile: (pubkey: string) => void | Promise<void>;
    onToggleMuteProfile?: (pubkey: string) => void | Promise<void>;
    onSendMessage: (pubkey: string) => void | Promise<void>;
    onToggleReaction: (input: { eventId: string; targetPubkey?: string; emoji?: string }) => Promise<boolean>;
    onToggleRepost: (input: { eventId: string; targetPubkey?: string; repostContent?: string }) => Promise<boolean>;
    onOpenQuoteComposer: (note: NoteCardModel) => void;
    onRequestZapPayment: (input: ZapIntentInput) => Promise<void>;
    zapAmounts: number[];
    onConfigureZapAmounts: () => void;
    donationPubkey?: string;
    canDonateWithWallet?: boolean;
    onResolveProfiles: (pubkeys: string[]) => Promise<void> | void;
    onResolveEventReferences: (
        eventIds: string[],
        options?: { relayHintsByEventId?: Record<string, string[]> }
    ) => Promise<Record<string, NostrEvent> | void> | Record<string, NostrEvent> | void;
}

export function ActiveProfileDialogContainer({
    ownerPubkey,
    activeProfilePubkey,
    activeProfile,
    activeProfileData,
    activeProfileEngagementByEventId,
    richContentProfilesByPubkey,
    activeProfileVerification,
    verificationByPubkey,
    eventReferencesById,
    ownerFollows,
    mutedPubkeys = [],
    canWrite,
    canAccessDirectMessages,
    reactionByEventId,
    viewerReactionByEventId,
    viewerZapByEventId,
    viewerReplyByEventId,
    repostByEventId,
    pendingReactionByEventId,
    pendingRepostByEventId,
    onClose,
    onOpenThread,
    onSelectHashtag,
    onSelectProfile,
    onCopyNpub,
    onAddRelaySuggestion,
    onAddAllRelaySuggestions,
    onFollowProfile,
    onToggleMuteProfile,
    onSendMessage,
    onToggleReaction,
    onToggleRepost,
    onOpenQuoteComposer,
    onRequestZapPayment,
    zapAmounts,
    onConfigureZapAmounts,
    donationPubkey,
    canDonateWithWallet = false,
    onResolveProfiles,
    onResolveEventReferences,
}: ActiveProfileDialogContainerProps) {
    if (!activeProfilePubkey) {
        return null;
    }

    return (
        <OccupantProfileDialog
            {...(ownerPubkey ? { ownerPubkey } : {})}
            pubkey={activeProfilePubkey}
            {...(activeProfile ? { profile: activeProfile } : {})}
            followsCount={activeProfileData.followsCount}
            followersCount={activeProfileData.followersCount}
            statsLoading={activeProfileData.statsLoading}
            {...(activeProfileData.statsError ? { statsError: activeProfileData.statsError } : {})}
            posts={activeProfileData.posts}
            engagementByEventId={activeProfileEngagementByEventId}
            postsLoading={activeProfileData.postsLoading}
            {...(activeProfileData.postsError ? { postsError: activeProfileData.postsError } : {})}
            hasMorePosts={activeProfileData.hasMorePosts}
            follows={activeProfileData.follows}
            followers={activeProfileData.followers}
            {...(activeProfileData.followersError ? { followersError: activeProfileData.followersError } : {})}
            networkProfiles={activeProfileData.networkProfiles}
            profilesByPubkey={richContentProfilesByPubkey}
            networkLoading={activeProfileData.networkLoading}
            {...(activeProfileData.networkError ? { networkError: activeProfileData.networkError } : {})}
            {...(activeProfileVerification !== undefined ? { verification: activeProfileVerification } : {})}
            verificationByPubkey={verificationByPubkey}
            onLoadMorePosts={activeProfileData.loadMorePosts}
            onRetryNetwork={activeProfileData.retryNetwork}
            onSelectHashtag={onSelectHashtag}
            onSelectProfile={onSelectProfile}
            onCopyNpub={onCopyNpub}
            ownerFollows={ownerFollows}
            mutedPubkeys={mutedPubkeys}
            relaySuggestionsByType={activeProfileData.relaySuggestionsByType as RelaySettingsByType}
            onAddRelaySuggestion={onAddRelaySuggestion}
            onAddAllRelaySuggestions={onAddAllRelaySuggestions}
            {...(canWrite ? { onFollowProfile } : {})}
            {...(canWrite && onToggleMuteProfile ? { onToggleMuteProfile } : {})}
            {...(canAccessDirectMessages ? { onSendMessage } : {})}
            canWrite={canWrite}
            reactionByEventId={reactionByEventId}
            {...(viewerReactionByEventId ? { viewerReactionByEventId } : {})}
            {...(viewerZapByEventId ? { viewerZapByEventId } : {})}
            {...(viewerReplyByEventId ? { viewerReplyByEventId } : {})}
            repostByEventId={repostByEventId}
            pendingReactionByEventId={pendingReactionByEventId}
            pendingRepostByEventId={pendingRepostByEventId}
            onOpenThread={onOpenThread}
            onToggleReaction={onToggleReaction}
            onToggleRepost={onToggleRepost}
            onOpenQuoteComposer={onOpenQuoteComposer}
            onZap={({ eventId, eventKind, targetPubkey, amount }) => onRequestZapPayment({
                targetPubkey: targetPubkey || '',
                amount,
                eventId,
                ...(typeof eventKind === 'number' ? { eventKind } : {}),
            })}
            zapAmounts={zapAmounts}
            onConfigureZapAmounts={onConfigureZapAmounts}
            {...(donationPubkey ? { donationPubkey } : {})}
            canDonateWithWallet={canDonateWithWallet}
            onDonate={({ pubkey, amount }) => onRequestZapPayment({ targetPubkey: pubkey, amount })}
            onResolveProfiles={onResolveProfiles}
            onResolveEventReferences={onResolveEventReferences}
            eventReferencesById={eventReferencesById}
            onClose={onClose}
            onRetryPosts={activeProfileData.retryPosts}
        />
    );
}
