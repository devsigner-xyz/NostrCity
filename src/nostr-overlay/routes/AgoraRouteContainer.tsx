import type { ComponentProps } from 'react';
import type { UiSettingsState } from '../../nostr/ui-settings';
import { FollowingFeedSurface } from '../components/FollowingFeedSurface';
import type { ZapIntentInput } from '../controllers/use-wallet-zap-controller';

type FollowingFeedSurfaceProps = ComponentProps<typeof FollowingFeedSurface>;

export interface AgoraRouteContainerProps {
    agoraFeedLayout: UiSettingsState['agoraFeedLayout'];
    onAgoraFeedLayoutChange: (layout: UiSettingsState['agoraFeedLayout']) => void;
    followingFeed: {
        items: FollowingFeedSurfaceProps['items'];
        pendingNewCount: FollowingFeedSurfaceProps['pendingNewCount'];
        hasPendingNewItems: FollowingFeedSurfaceProps['hasPendingNewItems'];
        hasFollows: FollowingFeedSurfaceProps['hasFollows'];
        activeHashtag?: FollowingFeedSurfaceProps['activeHashtag'];
        isLoadingFeed: FollowingFeedSurfaceProps['isLoadingFeed'];
        isRefreshingFeed: FollowingFeedSurfaceProps['isRefreshingFeed'];
        feedError: FollowingFeedSurfaceProps['feedError'];
        hasMoreFeed: FollowingFeedSurfaceProps['hasMoreFeed'];
        activeThread: FollowingFeedSurfaceProps['activeThread'];
        isPublishingPost: FollowingFeedSurfaceProps['isPublishingPost'];
        isPublishingReply: FollowingFeedSurfaceProps['isPublishingReply'];
        publishError: FollowingFeedSurfaceProps['publishError'];
        reactionByEventId: FollowingFeedSurfaceProps['reactionByEventId'];
        viewerReactionByEventId?: FollowingFeedSurfaceProps['viewerReactionByEventId'];
        viewerZapByEventId?: FollowingFeedSurfaceProps['viewerZapByEventId'];
        viewerReplyByEventId?: FollowingFeedSurfaceProps['viewerReplyByEventId'];
        repostByEventId: FollowingFeedSurfaceProps['repostByEventId'];
        pendingReactionByEventId: FollowingFeedSurfaceProps['pendingReactionByEventId'];
        pendingRepostByEventId: FollowingFeedSurfaceProps['pendingRepostByEventId'];
        loadNextFeedPage: FollowingFeedSurfaceProps['onLoadMoreFeed'];
        applyPendingNewItems: FollowingFeedSurfaceProps['onApplyPendingNewItems'];
        refreshFeed: FollowingFeedSurfaceProps['onRefreshFeed'];
        openThread: FollowingFeedSurfaceProps['onOpenThread'];
        closeThread: FollowingFeedSurfaceProps['onCloseThread'];
        loadNextThreadPage: FollowingFeedSurfaceProps['onLoadMoreThread'];
        publishPost: FollowingFeedSurfaceProps['onPublishPost'];
        publishReply: FollowingFeedSurfaceProps['onPublishReply'];
        toggleReaction: FollowingFeedSurfaceProps['onToggleReaction'];
    };
    profilesByPubkey: FollowingFeedSurfaceProps['profilesByPubkey'];
    engagementByEventId: FollowingFeedSurfaceProps['engagementByEventId'];
    onClearHashtag: NonNullable<FollowingFeedSurfaceProps['onClearHashtag']>;
    onSelectHashtag: NonNullable<FollowingFeedSurfaceProps['onSelectHashtag']>;
    onSelectProfile: NonNullable<FollowingFeedSurfaceProps['onSelectProfile']>;
    onResolveProfiles: NonNullable<FollowingFeedSurfaceProps['onResolveProfiles']>;
    onSelectEventReference: NonNullable<FollowingFeedSurfaceProps['onSelectEventReference']>;
    onResolveEventReferences: NonNullable<FollowingFeedSurfaceProps['onResolveEventReferences']>;
    eventReferencesById: NonNullable<FollowingFeedSurfaceProps['eventReferencesById']>;
    onCopyNoteId: (noteId: string) => Promise<void> | void;
    canWrite: FollowingFeedSurfaceProps['canWrite'];
    onToggleRepost: FollowingFeedSurfaceProps['onToggleRepost'];
    onOpenQuoteComposer: FollowingFeedSurfaceProps['onOpenQuoteComposer'];
    requestZapPayment: (input: ZapIntentInput) => Promise<void> | void;
    zapAmounts: FollowingFeedSurfaceProps['zapAmounts'];
    onConfigureZapAmounts: NonNullable<FollowingFeedSurfaceProps['onConfigureZapAmounts']>;
    onSearchUsers: FollowingFeedSurfaceProps['onSearchUsers'];
    ownerPubkey?: FollowingFeedSurfaceProps['ownerPubkey'];
    searchRelaySetKey?: FollowingFeedSurfaceProps['searchRelaySetKey'];
}

export function AgoraRouteContainer({
    agoraFeedLayout,
    onAgoraFeedLayoutChange,
    followingFeed,
    profilesByPubkey,
    engagementByEventId,
    onClearHashtag,
    onSelectHashtag,
    onSelectProfile,
    onResolveProfiles,
    onSelectEventReference,
    onResolveEventReferences,
    eventReferencesById,
    onCopyNoteId,
    canWrite,
    onToggleRepost,
    onOpenQuoteComposer,
    requestZapPayment,
    zapAmounts,
    onConfigureZapAmounts,
    onSearchUsers,
    ownerPubkey,
    searchRelaySetKey,
}: AgoraRouteContainerProps) {
    return (
        <FollowingFeedSurface
            agoraFeedLayout={agoraFeedLayout}
            onAgoraFeedLayoutChange={onAgoraFeedLayoutChange}
            items={followingFeed.items}
            pendingNewCount={followingFeed.pendingNewCount}
            hasPendingNewItems={followingFeed.hasPendingNewItems}
            hasFollows={followingFeed.hasFollows}
            profilesByPubkey={profilesByPubkey}
            engagementByEventId={engagementByEventId}
            {...(followingFeed.activeHashtag ? { activeHashtag: followingFeed.activeHashtag } : {})}
            {...(followingFeed.activeHashtag ? { onClearHashtag } : {})}
            onSelectHashtag={onSelectHashtag}
            onSelectProfile={onSelectProfile}
            onResolveProfiles={onResolveProfiles}
            onSelectEventReference={onSelectEventReference}
            onResolveEventReferences={onResolveEventReferences}
            eventReferencesById={eventReferencesById}
            onCopyNoteId={(noteId) => {
                void onCopyNoteId(noteId);
            }}
            isLoadingFeed={followingFeed.isLoadingFeed}
            isRefreshingFeed={followingFeed.isRefreshingFeed}
            feedError={followingFeed.feedError}
            hasMoreFeed={followingFeed.hasMoreFeed}
            activeThread={followingFeed.activeThread}
            canWrite={canWrite}
            isPublishingPost={followingFeed.isPublishingPost}
            isPublishingReply={followingFeed.isPublishingReply}
            publishError={followingFeed.publishError}
            reactionByEventId={followingFeed.reactionByEventId}
            {...(followingFeed.viewerReactionByEventId ? { viewerReactionByEventId: followingFeed.viewerReactionByEventId } : {})}
            {...(followingFeed.viewerZapByEventId ? { viewerZapByEventId: followingFeed.viewerZapByEventId } : {})}
            {...(followingFeed.viewerReplyByEventId ? { viewerReplyByEventId: followingFeed.viewerReplyByEventId } : {})}
            repostByEventId={followingFeed.repostByEventId}
            pendingReactionByEventId={followingFeed.pendingReactionByEventId}
            pendingRepostByEventId={followingFeed.pendingRepostByEventId}
            onLoadMoreFeed={followingFeed.loadNextFeedPage}
            onApplyPendingNewItems={followingFeed.applyPendingNewItems}
            onRefreshFeed={followingFeed.refreshFeed}
            onOpenThread={followingFeed.openThread}
            onCloseThread={followingFeed.closeThread}
            onLoadMoreThread={followingFeed.loadNextThreadPage}
            onPublishPost={followingFeed.publishPost}
            onPublishReply={followingFeed.publishReply}
            onSearchUsers={onSearchUsers}
            {...(ownerPubkey ? { ownerPubkey } : {})}
            {...(searchRelaySetKey ? { searchRelaySetKey } : {})}
            onToggleReaction={followingFeed.toggleReaction}
            onToggleRepost={onToggleRepost}
            onOpenQuoteComposer={onOpenQuoteComposer}
            onZap={({ eventId, eventKind, targetPubkey, amount }) => requestZapPayment({
                targetPubkey: targetPubkey || '',
                amount,
                eventId,
                ...(typeof eventKind === 'number' ? { eventKind } : {}),
            })}
            zapAmounts={zapAmounts}
            onConfigureZapAmounts={onConfigureZapAmounts}
        />
    );
}
