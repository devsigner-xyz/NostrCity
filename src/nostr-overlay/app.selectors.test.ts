import { describe, expect, test } from 'vitest';
import type { Nip05ValidationResult } from '../nostr/nip05';
import type { NostrProfile } from '../nostr/types';
import type { DirectMessageConversationState } from './query/direct-messages.query';
import {
    addOptimisticZapEntry,
    applyOptimisticZapMetrics,
    applyLocalViewerZapState,
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
    type OptimisticZapEntry,
} from './app.selectors';

function profile(pubkey: string, name: string): NostrProfile {
    return { pubkey, name };
}

function verification(status: Nip05ValidationResult['status']): Nip05ValidationResult {
    return {
        status,
        identifier: `${status}@example.com`,
        checkedAt: 123,
    };
}

function conversation(input: {
    id: string;
    messages?: Array<{
        id: string;
        plaintext: string;
        createdAt: number;
        direction?: 'incoming' | 'outgoing';
        deliveryState?: 'pending' | 'sent' | 'failed';
        isUndecryptable?: boolean;
    }>;
    hasUnread?: boolean;
}): DirectMessageConversationState {
    return {
        id: input.id,
        lastReadAt: 0,
        hasUnread: input.hasUnread ?? false,
        messages: (input.messages ?? []).map((message) => ({
            id: message.id,
            clientMessageId: `${message.id}-client`,
            conversationId: input.id,
            peerPubkey: input.id,
            direction: message.direction ?? 'incoming',
            createdAt: message.createdAt,
            plaintext: message.plaintext,
            deliveryState: message.deliveryState ?? 'sent',
            ...(message.isUndecryptable !== undefined ? { isUndecryptable: message.isUndecryptable } : {}),
        })),
    };
}

describe('overlay app selectors', () => {
    test('selectRelaySetKey sorts and deduplicates relay urls', () => {
        expect(selectRelaySetKey([
            'wss://b.example',
            'wss://a.example',
            'wss://b.example',
        ])).toBe('wss://a.example|wss://b.example');
    });

    test('selectDiscoveredMissionsCount counts unique discovered ids', () => {
        expect(selectDiscoveredMissionsCount(['alpha', 'beta', 'alpha'])).toBe(2);
    });

    test('applies optimistic zap deltas while base engagement has not caught up', () => {
        expect(applyOptimisticZapMetrics({
            eventA: { replies: 1, reposts: 2, reactions: 3, zaps: 4, zapSats: 40 },
        }, {
            eventA: { baselineZaps: 4, baselineZapSats: 40, deltaZaps: 1, deltaZapSats: 21 },
        })).toEqual({
            eventA: { replies: 1, reposts: 2, reactions: 3, zaps: 5, zapSats: 61 },
        });
    });

    test('does not double count optimistic zaps once base engagement catches up', () => {
        expect(applyOptimisticZapMetrics({
            eventA: { replies: 0, reposts: 0, reactions: 0, zaps: 5, zapSats: 61 },
        }, {
            eventA: { baselineZaps: 4, baselineZapSats: 40, deltaZaps: 1, deltaZapSats: 21 },
        })).toEqual({
            eventA: { replies: 0, reposts: 0, reactions: 0, zaps: 5, zapSats: 61 },
        });
    });

    test('includes optimistic-only event ids', () => {
        expect(applyOptimisticZapMetrics({}, {
            eventA: { baselineZaps: 0, baselineZapSats: 0, deltaZaps: 1, deltaZapSats: 7 },
        })).toEqual({
            eventA: { replies: 0, reposts: 0, reactions: 0, zaps: 1, zapSats: 7 },
        });
    });

    test('applies local viewer zap state while NIP-57 receipt detection has not caught up', () => {
        expect(applyLocalViewerZapState({}, {
            eventA: { amountSats: 21, createdAt: 123 },
        })).toEqual({
            eventA: {
                eventId: 'eventA',
                zapReceiptEventId: 'local-zap:eventA:123',
                amountSats: 21,
                createdAt: 123,
            },
        });
    });

    test('preserves relay-detected viewer zap state over local viewer zap state', () => {
        expect(applyLocalViewerZapState({
            eventA: {
                eventId: 'eventA',
                zapReceiptEventId: 'receipt-a',
                amountSats: 99,
                createdAt: 456,
            },
        }, {
            eventA: { amountSats: 21, createdAt: 123 },
        })).toEqual({
            eventA: {
                eventId: 'eventA',
                zapReceiptEventId: 'receipt-a',
                amountSats: 99,
                createdAt: 456,
            },
        });
    });

    test('selectEngagementWithFallback fills missing event engagement', () => {
        expect(selectEngagementWithFallback({
            eventIds: ['eventA', 'eventB'],
            data: {
                eventA: { replies: 1, reposts: 0, reactions: 0, zaps: 0, zapSats: 0 },
            },
        })).toEqual({
            eventA: { replies: 1, reposts: 0, reactions: 0, zaps: 0, zapSats: 0 },
            eventB: { replies: 0, reposts: 0, reactions: 0, zaps: 0, zapSats: 0 },
        });
    });

    test('selectOptimisticZapBaseByEventId lets following feed engagement override active profile engagement', () => {
        expect(selectOptimisticZapBaseByEventId({
            activeProfileEngagementByEventId: {
                eventA: { replies: 0, reposts: 0, reactions: 0, zaps: 1, zapSats: 11 },
            },
            followingFeedEngagementByEventId: {
                eventA: { replies: 0, reposts: 0, reactions: 0, zaps: 2, zapSats: 22 },
                eventB: { replies: 0, reposts: 0, reactions: 0, zaps: 3, zapSats: 33 },
            },
        })).toEqual({
            eventA: { replies: 0, reposts: 0, reactions: 0, zaps: 2, zapSats: 22 },
            eventB: { replies: 0, reposts: 0, reactions: 0, zaps: 3, zapSats: 33 },
        });
    });

    test('addOptimisticZapEntry records the first zap against the current baseline', () => {
        expect(addOptimisticZapEntry({}, {
            eventA: { replies: 0, reposts: 0, reactions: 0, zaps: 2, zapSats: 20 },
        }, { eventId: 'eventA', amount: 21 })).toEqual({
            eventA: { baselineZaps: 2, baselineZapSats: 20, deltaZaps: 1, deltaZapSats: 21 },
        });
    });

    test('addOptimisticZapEntry accumulates additional zaps without resetting the baseline', () => {
        const current: Record<string, OptimisticZapEntry> = {
            eventA: { baselineZaps: 2, baselineZapSats: 20, deltaZaps: 1, deltaZapSats: 21 },
        };

        expect(addOptimisticZapEntry(current, {
            eventA: { replies: 0, reposts: 0, reactions: 0, zaps: 99, zapSats: 990 },
        }, { eventId: 'eventA', amount: 7 })).toEqual({
            eventA: { baselineZaps: 2, baselineZapSats: 20, deltaZaps: 2, deltaZapSats: 28 },
        });
    });

    test('addOptimisticZapEntry ignores missing event ids', () => {
        const current: Record<string, OptimisticZapEntry> = {
            eventA: { baselineZaps: 2, baselineZapSats: 20, deltaZaps: 1, deltaZapSats: 21 },
        };

        expect(addOptimisticZapEntry(current, {}, { amount: 7 })).toBe(current);
    });

    test('pruneCaughtUpOptimisticZapEntries removes entries already reflected by base engagement', () => {
        const current = {
            caughtUp: { baselineZaps: 1, baselineZapSats: 10, deltaZaps: 1, deltaZapSats: 5 },
            pending: { baselineZaps: 1, baselineZapSats: 10, deltaZaps: 2, deltaZapSats: 20 },
        };

        expect(pruneCaughtUpOptimisticZapEntries(current, {
            caughtUp: { replies: 0, reposts: 0, reactions: 0, zaps: 2, zapSats: 15 },
            pending: { replies: 0, reposts: 0, reactions: 0, zaps: 2, zapSats: 15 },
        })).toEqual({
            pending: { baselineZaps: 1, baselineZapSats: 10, deltaZaps: 2, deltaZapSats: 20 },
        });
    });

    test('selectVerificationProfilesByPubkey preserves App verification merge precedence', () => {
        const result = selectVerificationProfilesByPubkey({
            profiles: { same: profile('same', 'profile'), owner: profile('owner', 'profile-owner') },
            followerProfiles: { same: profile('same', 'follower') },
            networkProfiles: { same: profile('same', 'network'), active: profile('active', 'network-active') },
            ownerPubkey: 'owner',
            ownerProfile: profile('owner', 'owner-override'),
            activeProfilePubkey: 'active',
            activeProfile: profile('active', 'active-override'),
        });

        expect(result.same?.name).toBe('network');
        expect(result.owner?.name).toBe('owner-override');
        expect(result.active?.name).toBe('active-override');
    });

    test('selectRichContentProfilesByPubkey preserves rich content merge precedence', () => {
        const result = selectRichContentProfilesByPubkey({
            profiles: { same: profile('same', 'profile') },
            followerProfiles: { same: profile('same', 'follower') },
            networkProfiles: { same: profile('same', 'network') },
            ownerPubkey: 'owner',
            ownerProfile: profile('owner', 'owner-override'),
            activeProfilePubkey: 'active',
            activeProfile: profile('active', 'active-override'),
        });

        expect(result.same?.name).toBe('network');
        expect(result.owner?.name).toBe('owner-override');
        expect(result.active?.name).toBe('active-override');
    });

    test('selectVerificationTargetPubkeys returns unique targets in App order', () => {
        expect(selectVerificationTargetPubkeys({
            ownerPubkey: 'owner',
            follows: ['follow-a', 'owner'],
            followers: ['follower-a', 'follow-a'],
            occupancyByBuildingIndex: { 1: 'occupied-a', 2: 'follower-a' },
            activeProfilePubkey: 'active',
        })).toEqual(['owner', 'follow-a', 'follower-a', 'occupied-a', 'active']);
    });

    test('selectVerifiedBuildingIndexes returns verified occupied building indexes only when enabled', () => {
        expect(selectVerifiedBuildingIndexes({
            enabled: true,
            occupancyByBuildingIndex: { 1: 'verified-pubkey', 2: 'unverified-pubkey' },
            verificationByPubkey: {
                'verified-pubkey': verification('verified'),
                'unverified-pubkey': verification('unverified'),
            },
        })).toEqual([1]);
    });

    test('selectVerifiedBuildingIndexes ignores non-integer and negative building keys', () => {
        expect(selectVerifiedBuildingIndexes({
            enabled: true,
            occupancyByBuildingIndex: { [-1]: 'verified-pubkey', 2.5: 'verified-pubkey', 3: 'verified-pubkey' },
            verificationByPubkey: {
                'verified-pubkey': verification('verified'),
            },
        })).toEqual([3]);
    });

    test('selectVerifiedBuildingIndexes returns an empty list when disabled', () => {
        expect(selectVerifiedBuildingIndexes({
            enabled: false,
            occupancyByBuildingIndex: { 1: 'verified-pubkey' },
            verificationByPubkey: { 'verified-pubkey': verification('verified') },
        })).toEqual([]);
    });

    test('selectChatConversationSummaries sorts conversations by newest message', () => {
        expect(selectChatConversationSummaries({
            conversations: {
                older: conversation({ id: 'older', messages: [{ id: 'old-message', plaintext: 'old', createdAt: 10 }] }),
                newer: conversation({ id: 'newer', messages: [{ id: 'new-message', plaintext: 'new', createdAt: 20 }] }),
            },
            profiles: {},
            followerProfiles: {},
            verificationByPubkey: {},
            pinnedConversationId: null,
        }).map((summary) => summary.id)).toEqual(['newer', 'older']);
    });

    test('selectChatConversationSummaries prepends a pinned conversation when it is missing', () => {
        expect(selectChatConversationSummaries({
            conversations: {},
            profiles: { pinned: { pubkey: 'pinned', displayName: 'Pinned User' } },
            followerProfiles: {},
            verificationByPubkey: {},
            pinnedConversationId: 'pinned',
        })).toEqual([{
            id: 'pinned',
            peerPubkey: 'pinned',
            title: 'Pinned User',
            profile: { pubkey: 'pinned', displayName: 'Pinned User' },
            lastMessagePreview: '',
            lastMessageAt: 0,
            hasUnread: false,
        }]);
    });

    test('selectChatConversationSummaries falls back to a shortened pubkey title', () => {
        const pubkey = '1234567890abcdef';

        expect(selectChatConversationSummaries({
            conversations: { [pubkey]: conversation({ id: pubkey }) },
            profiles: {},
            followerProfiles: {},
            verificationByPubkey: {},
            pinnedConversationId: null,
        })[0]?.title).toBe('1234567890...abcdef');
    });

    test('selectChatConversationSummaries includes profile and verification when available', () => {
        const verified = verification('verified');

        expect(selectChatConversationSummaries({
            conversations: {
                peer: conversation({
                    id: 'peer',
                    messages: [{ id: 'message-a', plaintext: 'hello', createdAt: 30 }],
                    hasUnread: true,
                }),
            },
            profiles: { peer: { pubkey: 'peer', name: 'Peer Name' } },
            followerProfiles: {},
            verificationByPubkey: { peer: verified },
            pinnedConversationId: null,
        })[0]).toEqual({
            id: 'peer',
            peerPubkey: 'peer',
            title: 'Peer Name',
            profile: { pubkey: 'peer', name: 'Peer Name' },
            verification: verified,
            lastMessagePreview: 'hello',
            lastMessageAt: 30,
            hasUnread: true,
        });
    });

    test('selectChatDetailMessages returns an empty list when no conversation is active', () => {
        expect(selectChatDetailMessages({
            conversations: { peer: conversation({ id: 'peer' }) },
            activeConversationId: null,
        })).toEqual([]);
    });

    test('selectChatDetailMessages maps active conversation messages for ChatsPage', () => {
        expect(selectChatDetailMessages({
            conversations: {
                peer: conversation({
                    id: 'peer',
                    messages: [{
                        id: 'message-a',
                        plaintext: 'hello',
                        createdAt: 30,
                        direction: 'outgoing',
                        deliveryState: 'pending',
                    }],
                }),
            },
            activeConversationId: 'peer',
        })).toEqual([{
            id: 'message-a',
            direction: 'outgoing',
            plaintext: 'hello',
            createdAt: 30,
            deliveryState: 'pending',
        }]);
    });

    test('selectChatDetailMessages preserves optional undecryptable state', () => {
        expect(selectChatDetailMessages({
            conversations: {
                peer: conversation({
                    id: 'peer',
                    messages: [{ id: 'message-a', plaintext: '', createdAt: 30, isUndecryptable: true }],
                }),
            },
            activeConversationId: 'peer',
        })[0]?.isUndecryptable).toBe(true);
    });

    test('selectMapLoaderStageLabel returns translated labels for known stages', () => {
        expect(selectMapLoaderStageLabel('connecting_relay', 'en')).toBe('Connecting to relays...');
        expect(selectMapLoaderStageLabel('fetching_data', 'en')).toBe('Fetching data...');
        expect(selectMapLoaderStageLabel('building_map', 'en')).toBe('Building map...');
        expect(selectMapLoaderStageLabel(null, 'en')).toBeNull();
    });

    test('selectPostEventIds maps posts to event ids', () => {
        expect(selectPostEventIds([{ id: 'event-a' }, { id: 'event-b' }])).toEqual(['event-a', 'event-b']);
    });
});
