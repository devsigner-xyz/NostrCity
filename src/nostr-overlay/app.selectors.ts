import type { Nip05ValidationResult } from '../nostr/nip05';
import type { SocialEngagementByEventId, ViewerZapByEventId } from '../nostr/social-feed-service';
import type { NostrProfile } from '../nostr/types';
import type { UiSettingsState } from '../nostr/ui-settings';
import { translate } from '@/i18n/translate';
import type { ChatConversationSummary, ChatDetailMessage } from './components/ChatsPage';
import type { MapLoaderStage } from './hooks/useNostrOverlay';
import type { DirectMessageConversationState } from './query/direct-messages.query';
import { applyEngagementDeltas, createEmptyEngagementByEventIds } from './query/following-feed.selectors';

export interface OptimisticZapEntry {
    baselineZaps: number;
    baselineZapSats: number;
    deltaZaps: number;
    deltaZapSats: number;
}

export interface LocalViewerZapEntry {
    amountSats: number;
    createdAt: number;
}

const EMPTY_ENGAGEMENT = {
    replies: 0,
    reposts: 0,
    reactions: 0,
    zaps: 0,
    zapSats: 0,
};

function hasOptimisticZapCaughtUp(baseByEventId: SocialEngagementByEventId, eventId: string, optimistic: OptimisticZapEntry): boolean {
    const base = baseByEventId[eventId] ?? EMPTY_ENGAGEMENT;
    return base.zaps >= optimistic.baselineZaps + optimistic.deltaZaps
        && base.zapSats >= optimistic.baselineZapSats + optimistic.deltaZapSats;
}

function selectProfileTitle(pubkey: string, profile: NostrProfile | undefined): string {
    return profile?.displayName ?? profile?.name ?? `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
}

export function selectRelaySetKey(relays: string[]): string {
    return [...new Set(relays)].sort((left, right) => left.localeCompare(right)).join('|');
}

export function selectDiscoveredMissionsCount(discoveredIds: string[]): number {
    return new Set(discoveredIds).size;
}

export function applyOptimisticZapMetrics(
    baseByEventId: SocialEngagementByEventId,
    optimisticByEventId: Record<string, OptimisticZapEntry>,
): SocialEngagementByEventId {
    const eventIds = [...new Set([...Object.keys(baseByEventId), ...Object.keys(optimisticByEventId)])];
    if (eventIds.length === 0) {
        return baseByEventId;
    }

    const deltaByEventId: SocialEngagementByEventId = {};
    for (const [eventId, optimistic] of Object.entries(optimisticByEventId)) {
        if (hasOptimisticZapCaughtUp(baseByEventId, eventId, optimistic)) {
            continue;
        }

        deltaByEventId[eventId] = {
            replies: 0,
            reposts: 0,
            reactions: 0,
            zaps: optimistic.deltaZaps,
            zapSats: optimistic.deltaZapSats,
        };
    }

    return applyEngagementDeltas({
        eventIds,
        baseByEventId,
        deltaByEventId,
    });
}

export function applyLocalViewerZapState(
    baseByEventId: ViewerZapByEventId,
    localByEventId: Record<string, LocalViewerZapEntry>,
): ViewerZapByEventId {
    const eventIds = Object.keys(localByEventId);
    if (eventIds.length === 0) {
        return baseByEventId;
    }

    const next: ViewerZapByEventId = { ...baseByEventId };
    for (const eventId of eventIds) {
        if (next[eventId]) {
            continue;
        }

        const localZap = localByEventId[eventId];
        if (!localZap) {
            continue;
        }

        next[eventId] = {
            eventId,
            zapReceiptEventId: `local-zap:${eventId}:${localZap.createdAt}`,
            amountSats: localZap.amountSats,
            createdAt: localZap.createdAt,
        };
    }

    return next;
}

export function selectEngagementWithFallback(input: {
    eventIds: string[];
    data?: SocialEngagementByEventId;
}): SocialEngagementByEventId {
    return {
        ...createEmptyEngagementByEventIds(input.eventIds),
        ...(input.data ?? {}),
    };
}

export function selectOptimisticZapBaseByEventId(input: {
    activeProfileEngagementByEventId: SocialEngagementByEventId;
    followingFeedEngagementByEventId: SocialEngagementByEventId;
}): SocialEngagementByEventId {
    return {
        ...input.activeProfileEngagementByEventId,
        ...input.followingFeedEngagementByEventId,
    };
}

export function addOptimisticZapEntry(
    current: Record<string, OptimisticZapEntry>,
    baseByEventId: SocialEngagementByEventId,
    input: { eventId?: string; amount: number },
): Record<string, OptimisticZapEntry> {
    const eventId = input.eventId;
    if (!eventId) {
        return current;
    }

    const base = baseByEventId[eventId] ?? EMPTY_ENGAGEMENT;
    const existing = current[eventId];

    return {
        ...current,
        [eventId]: {
            baselineZaps: existing?.baselineZaps ?? base.zaps,
            baselineZapSats: existing?.baselineZapSats ?? base.zapSats,
            deltaZaps: (existing?.deltaZaps ?? 0) + 1,
            deltaZapSats: (existing?.deltaZapSats ?? 0) + input.amount,
        },
    };
}

export function pruneCaughtUpOptimisticZapEntries(
    current: Record<string, OptimisticZapEntry>,
    baseByEventId: SocialEngagementByEventId,
): Record<string, OptimisticZapEntry> {
    let changed = false;
    const next: Record<string, OptimisticZapEntry> = {};

    for (const [eventId, optimistic] of Object.entries(current)) {
        if (hasOptimisticZapCaughtUp(baseByEventId, eventId, optimistic)) {
            changed = true;
            continue;
        }

        next[eventId] = optimistic;
    }

    return changed ? next : current;
}

export function selectVerificationProfilesByPubkey(input: {
    profiles: Record<string, NostrProfile>;
    followerProfiles: Record<string, NostrProfile>;
    networkProfiles: Record<string, NostrProfile>;
    ownerPubkey?: string;
    ownerProfile?: NostrProfile;
    activeProfilePubkey?: string;
    activeProfile?: NostrProfile;
}): Record<string, NostrProfile> {
    return {
        ...input.profiles,
        ...input.followerProfiles,
        ...input.networkProfiles,
        ...(input.ownerPubkey && input.ownerProfile ? { [input.ownerPubkey]: input.ownerProfile } : {}),
        ...(input.activeProfilePubkey && input.activeProfile ? { [input.activeProfilePubkey]: input.activeProfile } : {}),
    };
}

export function selectRichContentProfilesByPubkey(input: {
    profiles: Record<string, NostrProfile>;
    followerProfiles: Record<string, NostrProfile>;
    networkProfiles: Record<string, NostrProfile>;
    ownerPubkey?: string;
    ownerProfile?: NostrProfile;
    activeProfilePubkey?: string;
    activeProfile?: NostrProfile;
}): Record<string, NostrProfile> {
    return {
        ...input.followerProfiles,
        ...input.profiles,
        ...input.networkProfiles,
        ...(input.ownerPubkey && input.ownerProfile ? { [input.ownerPubkey]: input.ownerProfile } : {}),
        ...(input.activeProfilePubkey && input.activeProfile ? { [input.activeProfilePubkey]: input.activeProfile } : {}),
    };
}

export function selectVerificationTargetPubkeys(input: {
    ownerPubkey?: string;
    follows: string[];
    followers: string[];
    occupancyByBuildingIndex: Record<number, string>;
    activeProfilePubkey?: string;
}): string[] {
    return [...new Set([
        ...(input.ownerPubkey ? [input.ownerPubkey] : []),
        ...input.follows,
        ...input.followers,
        ...Object.values(input.occupancyByBuildingIndex),
        ...(input.activeProfilePubkey ? [input.activeProfilePubkey] : []),
    ])];
}

export function selectVerifiedBuildingIndexes(input: {
    enabled: boolean;
    occupancyByBuildingIndex: Record<number, string>;
    verificationByPubkey: Record<string, Nip05ValidationResult | undefined>;
}): number[] {
    if (!input.enabled) {
        return [];
    }

    return Object.entries(input.occupancyByBuildingIndex)
        .filter(([, pubkey]) => input.verificationByPubkey[pubkey]?.status === 'verified')
        .map(([buildingIndex]) => Number(buildingIndex))
        .filter((value) => Number.isInteger(value) && value >= 0);
}

export function selectChatConversationSummaries(input: {
    conversations: Record<string, DirectMessageConversationState>;
    profiles: Record<string, NostrProfile>;
    followerProfiles: Record<string, NostrProfile>;
    verificationByPubkey: Record<string, Nip05ValidationResult | undefined>;
    pinnedConversationId: string | null;
}): ChatConversationSummary[] {
    const summaries = Object.values(input.conversations)
        .map((conversation) => {
            const lastMessage = conversation.messages[conversation.messages.length - 1];
            const profile = input.profiles[conversation.id] || input.followerProfiles[conversation.id];
            const verification = input.verificationByPubkey[conversation.id];

            return {
                id: conversation.id,
                peerPubkey: conversation.id,
                title: selectProfileTitle(conversation.id, profile),
                ...(profile ? { profile } : {}),
                ...(verification !== undefined ? { verification } : {}),
                lastMessagePreview: lastMessage?.plaintext || '',
                lastMessageAt: lastMessage?.createdAt || 0,
                hasUnread: conversation.hasUnread,
            };
        })
        .sort((left, right) => right.lastMessageAt - left.lastMessageAt);

    const pinnedConversationId = input.pinnedConversationId;
    if (pinnedConversationId && !summaries.some((conversation) => conversation.id === pinnedConversationId)) {
        const profile = input.profiles[pinnedConversationId] || input.followerProfiles[pinnedConversationId];
        const verification = input.verificationByPubkey[pinnedConversationId];
        summaries.unshift({
            id: pinnedConversationId,
            peerPubkey: pinnedConversationId,
            title: selectProfileTitle(pinnedConversationId, profile),
            ...(profile ? { profile } : {}),
            ...(verification !== undefined ? { verification } : {}),
            lastMessagePreview: '',
            lastMessageAt: 0,
            hasUnread: false,
        });
    }

    return summaries;
}

export function selectChatDetailMessages(input: {
    conversations: Record<string, DirectMessageConversationState>;
    activeConversationId: string | null;
}): ChatDetailMessage[] {
    if (!input.activeConversationId) {
        return [];
    }

    const conversation = input.conversations[input.activeConversationId];
    if (!conversation) {
        return [];
    }

    return conversation.messages.map((message) => ({
        id: message.id,
        direction: message.direction,
        plaintext: message.plaintext,
        createdAt: message.createdAt,
        deliveryState: message.deliveryState,
        ...(message.isUndecryptable !== undefined ? { isUndecryptable: message.isUndecryptable } : {}),
    }));
}

export function selectMapLoaderStageLabel(
    stage: MapLoaderStage | null,
    language: UiSettingsState['language'],
): string | null {
    if (stage === 'connecting_relay') {
        return translate(language, 'app.loader.connectingRelay');
    }

    if (stage === 'fetching_data') {
        return translate(language, 'app.loader.fetchingData');
    }

    if (stage === 'building_map') {
        return translate(language, 'app.loader.buildingMap');
    }

    return null;
}

export function selectPostEventIds(posts: Array<{ id: string }>): string[] {
    return posts.map((post) => post.id);
}
