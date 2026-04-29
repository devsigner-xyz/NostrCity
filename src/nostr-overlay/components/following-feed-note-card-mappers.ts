import type { SocialEngagementMetrics, SocialFeedItem, SocialThreadItem, ViewerReactionByEventId, ViewerReplyByEventId, ViewerZapByEventId } from '../../nostr/social-feed-service';
import type { NostrPostPreview } from '../../nostr/posts';
import type { NoteActionState } from './note-card-model';

const EMPTY_ENGAGEMENT_METRICS: SocialEngagementMetrics = {
    replies: 0,
    reposts: 0,
    reactions: 0,
    zaps: 0,
    zapSats: 0,
};

interface BuildActionStateBaseInput {
    canWrite: boolean;
    zapAmounts: number[];
    onZap: (input: { eventId: string; eventKind?: number; targetPubkey?: string; amount: number }) => Promise<void> | void;
    onConfigureZapAmounts?: () => void;
    engagementByEventId: Record<string, SocialEngagementMetrics>;
    reactionByEventId: Record<string, boolean>;
    viewerReactionByEventId?: ViewerReactionByEventId;
    viewerZapByEventId?: ViewerZapByEventId;
    viewerReplyByEventId?: ViewerReplyByEventId;
    repostByEventId: Record<string, boolean>;
    pendingReactionByEventId: Record<string, boolean>;
    pendingRepostByEventId: Record<string, boolean>;
    onToggleReaction: (input: { eventId: string; targetPubkey?: string; emoji?: string }) => Promise<boolean>;
    onToggleRepost: (input: { eventId: string; targetPubkey?: string; repostContent?: string }) => Promise<boolean>;
    onQuote: () => void;
}

function viewerReactionForEvent(viewerReactionByEventId: ViewerReactionByEventId | undefined, eventId: string) {
    return viewerReactionByEventId?.[eventId];
}

function viewerZapForEvent(viewerZapByEventId: ViewerZapByEventId | undefined, eventId: string) {
    return viewerZapByEventId?.[eventId];
}

function viewerReplyForEvent(viewerReplyByEventId: ViewerReplyByEventId | undefined, eventId: string) {
    return viewerReplyByEventId?.[eventId];
}

interface BuildFeedActionStateInput extends BuildActionStateBaseInput {
    item: SocialFeedItem;
    onOpenThread: (rootEventId: string) => Promise<void> | void;
}

interface BuildThreadActionStateInput extends BuildActionStateBaseInput {
    item: SocialThreadItem;
    onReply: () => void;
    onViewDetail?: () => void;
}

interface BuildPreviewActionStateInput extends BuildActionStateBaseInput {
    item: NostrPostPreview;
    onOpenThread: (eventId: string) => void | Promise<void>;
}

function metricsForEvent(
    engagementByEventId: Record<string, SocialEngagementMetrics>,
    eventId: string,
): SocialEngagementMetrics {
    return engagementByEventId[eventId] ?? EMPTY_ENGAGEMENT_METRICS;
}

function serializeRepostPayload(input: {
    id: string;
    pubkey: string;
    createdAt: number;
    content: string;
    kind?: number;
    tags?: string[][];
    rawEvent?: {
        id: string;
        pubkey: string;
        kind: number;
        created_at: number;
        tags: string[][];
        content: string;
        sig?: string;
    };
}): string {
    if (input.rawEvent?.sig) {
        return JSON.stringify(input.rawEvent);
    }

    return '';
}

export function buildFeedActionState({
    item,
    canWrite,
    engagementByEventId,
    reactionByEventId,
    viewerReactionByEventId,
    viewerZapByEventId,
    viewerReplyByEventId,
    repostByEventId,
    pendingReactionByEventId,
    pendingRepostByEventId,
    zapAmounts,
    onZap,
    onConfigureZapAmounts,
    onOpenThread,
    onToggleReaction,
    onToggleRepost,
    onQuote,
}: BuildFeedActionStateInput): NoteActionState {
    const metrics = metricsForEvent(engagementByEventId, item.id);
    const viewerReaction = viewerReactionForEvent(viewerReactionByEventId, item.id);
    const viewerZap = viewerZapForEvent(viewerZapByEventId, item.id);
    const viewerReply = viewerReplyForEvent(viewerReplyByEventId, item.id);

    return {
        canWrite,
        isReactionActive: Boolean(viewerReaction || reactionByEventId[item.id]),
        isRepostActive: Boolean(repostByEventId[item.id]),
        isZapActive: Boolean(viewerZap),
        isReplyActive: Boolean(viewerReply),
        isReactionPending: Boolean(pendingReactionByEventId[item.id]),
        isRepostPending: Boolean(pendingRepostByEventId[item.id]),
        replies: metrics.replies,
        reactions: metrics.reactions,
        reposts: metrics.reposts,
        zapSats: metrics.zapSats,
        zapAmounts,
        ...(viewerReaction ? { reactionEmoji: viewerReaction.emoji } : {}),
        onReply: () => {
            void onOpenThread(item.targetEventId || item.id);
        },
        onViewDetail: () => {
            void onOpenThread(item.targetEventId || item.id);
        },
        onToggleReaction: () => onToggleReaction({
            eventId: item.id,
            targetPubkey: item.pubkey,
        }),
        onSelectReactionEmoji: (emoji) => onToggleReaction({
            eventId: item.id,
            targetPubkey: item.pubkey,
            emoji,
        }),
        onRepost: () => onToggleRepost({
            eventId: item.id,
            targetPubkey: item.pubkey,
            repostContent: serializeRepostPayload({
                id: item.id,
                pubkey: item.pubkey,
                createdAt: item.createdAt,
                content: item.content,
                ...(item.rawEvent ? { rawEvent: item.rawEvent } : {}),
            }),
        }),
        onQuote,
        onZap: (amount) => onZap({
            eventId: item.id,
            eventKind: item.rawEvent.kind,
            targetPubkey: item.pubkey,
            amount,
        }),
        ...(onConfigureZapAmounts ? { onConfigureZapAmounts } : {}),
    };
}

export function buildPreviewActionState({
    item,
    canWrite,
    engagementByEventId,
    reactionByEventId,
    viewerReactionByEventId,
    viewerZapByEventId,
    viewerReplyByEventId,
    repostByEventId,
    pendingReactionByEventId,
    pendingRepostByEventId,
    zapAmounts,
    onZap,
    onConfigureZapAmounts,
    onOpenThread,
    onToggleReaction,
    onToggleRepost,
    onQuote,
}: BuildPreviewActionStateInput): NoteActionState {
    const metrics = metricsForEvent(engagementByEventId, item.id);
    const viewerReaction = viewerReactionForEvent(viewerReactionByEventId, item.id);
    const viewerZap = viewerZapForEvent(viewerZapByEventId, item.id);
    const viewerReply = viewerReplyForEvent(viewerReplyByEventId, item.id);

    return {
        canWrite,
        isReactionActive: Boolean(viewerReaction || reactionByEventId[item.id]),
        isRepostActive: Boolean(repostByEventId[item.id]),
        isZapActive: Boolean(viewerZap),
        isReplyActive: Boolean(viewerReply),
        isReactionPending: Boolean(pendingReactionByEventId[item.id]),
        isRepostPending: Boolean(pendingRepostByEventId[item.id]),
        replies: metrics.replies,
        reactions: metrics.reactions,
        reposts: metrics.reposts,
        zapSats: metrics.zapSats,
        zapAmounts,
        ...(viewerReaction ? { reactionEmoji: viewerReaction.emoji } : {}),
        onReply: () => {
            void onOpenThread(item.id);
        },
        onViewDetail: () => {
            void onOpenThread(item.id);
        },
        onToggleReaction: () => onToggleReaction({
            eventId: item.id,
            targetPubkey: item.pubkey,
        }),
        onSelectReactionEmoji: (emoji) => onToggleReaction({
            eventId: item.id,
            targetPubkey: item.pubkey,
            emoji,
        }),
        onRepost: () => onToggleRepost({
            eventId: item.id,
            targetPubkey: item.pubkey,
            repostContent: serializeRepostPayload({
                id: item.id,
                pubkey: item.pubkey,
                createdAt: item.createdAt,
                content: item.content,
                ...(item.rawEvent ? { rawEvent: item.rawEvent } : {}),
            }),
        }),
        onQuote,
        onZap: (amount) => onZap({
            eventId: item.id,
            eventKind: item.rawEvent?.kind ?? 1,
            targetPubkey: item.pubkey,
            amount,
        }),
        ...(onConfigureZapAmounts ? { onConfigureZapAmounts } : {}),
    };
}

export function buildRootActionState({
    item,
    canWrite,
    engagementByEventId,
    reactionByEventId,
    viewerReactionByEventId,
    viewerZapByEventId,
    viewerReplyByEventId,
    repostByEventId,
    pendingReactionByEventId,
    pendingRepostByEventId,
    zapAmounts,
    onZap,
    onConfigureZapAmounts,
    onReply,
    onViewDetail,
    onToggleReaction,
    onToggleRepost,
    onQuote,
}: BuildThreadActionStateInput): NoteActionState {
    const metrics = metricsForEvent(engagementByEventId, item.id);
    const viewerReaction = viewerReactionForEvent(viewerReactionByEventId, item.id);
    const viewerZap = viewerZapForEvent(viewerZapByEventId, item.id);
    const viewerReply = viewerReplyForEvent(viewerReplyByEventId, item.id);

    return {
        canWrite,
        isReactionActive: Boolean(viewerReaction || reactionByEventId[item.id]),
        isRepostActive: Boolean(repostByEventId[item.id]),
        isZapActive: Boolean(viewerZap),
        isReplyActive: Boolean(viewerReply),
        isReactionPending: Boolean(pendingReactionByEventId[item.id]),
        isRepostPending: Boolean(pendingRepostByEventId[item.id]),
        replies: metrics.replies,
        reactions: metrics.reactions,
        reposts: metrics.reposts,
        zapSats: metrics.zapSats,
        zapAmounts,
        ...(viewerReaction ? { reactionEmoji: viewerReaction.emoji } : {}),
        onReply,
        ...(onViewDetail ? { onViewDetail } : {}),
        onToggleReaction: () => onToggleReaction({
            eventId: item.id,
            targetPubkey: item.pubkey,
        }),
        onSelectReactionEmoji: (emoji) => onToggleReaction({
            eventId: item.id,
            targetPubkey: item.pubkey,
            emoji,
        }),
        onRepost: () => onToggleRepost({
            eventId: item.id,
            targetPubkey: item.pubkey,
            repostContent: serializeRepostPayload({
                id: item.id,
                pubkey: item.pubkey,
                createdAt: item.createdAt,
                content: item.content,
                kind: item.eventKind,
                tags: item.rawEvent.tags,
                rawEvent: item.rawEvent,
            }),
        }),
        onQuote,
        onZap: (amount) => onZap({
            eventId: item.id,
            eventKind: item.rawEvent.kind,
            targetPubkey: item.pubkey,
            amount,
        }),
        ...(onConfigureZapAmounts ? { onConfigureZapAmounts } : {}),
    };
}

export function buildReplyActionState(input: BuildThreadActionStateInput): NoteActionState {
    return buildRootActionState(input);
}
