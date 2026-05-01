import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SocialFeedService } from '../../nostr/social-feed-service';
import { useFollowingFeedController } from '../hooks/useFollowingFeedController';
import type { WriteGatewayLike } from '../query/following-feed.mutations';

type FollowingFeedController = ReturnType<typeof useFollowingFeedController>;

interface UseOverlaySocialFeedControllerOptions {
    ownerPubkey?: string;
    follows: string[];
    activeAgoraHashtag?: string;
    activeThreadRootEventId?: string;
    isAgoraRoute: boolean;
    canWrite: boolean;
    service: SocialFeedService;
    writeGateway?: WriteGatewayLike;
    onOpenThread: (eventId: string) => void;
    onCloseThread: () => void;
    onFollowPerson: (pubkey: string) => Promise<void>;
}

export interface OverlaySocialFeedController {
    followingFeed: FollowingFeedController;
    activeFeed: FollowingFeedController;
    canAccessFollowingFeed: boolean;
    followingFeedHasUnread: boolean;
    pendingFollowPubkeys: Record<string, true>;
    isFollowMutationPending: boolean;
    followPerson: (pubkey: string) => Promise<void>;
}

export function useOverlaySocialFeedController(options: UseOverlaySocialFeedControllerOptions): OverlaySocialFeedController {
    const {
        ownerPubkey,
        follows,
        activeAgoraHashtag,
        activeThreadRootEventId,
        isAgoraRoute,
        canWrite,
        service,
        writeGateway,
        onOpenThread,
        onCloseThread,
        onFollowPerson,
    } = options;
    const followingFeed = useFollowingFeedController({
        ...(ownerPubkey ? { ownerPubkey } : {}),
        follows,
        ...(activeAgoraHashtag ? { hashtag: activeAgoraHashtag } : {}),
        pageSize: 10,
        canWrite,
        service,
        ...(writeGateway ? { writeGateway } : {}),
        ...(activeThreadRootEventId ? { activeThreadRootEventId } : {}),
        onOpenThread,
        onCloseThread,
    });
    const [pendingFollowPubkeys, setPendingFollowPubkeys] = useState<Record<string, true>>({});
    const canAccessFollowingFeed = Boolean(ownerPubkey);
    const followingFeedHasUnread = !followingFeed.isOpen && followingFeed.hasUnread;

    useEffect(() => {
        if (isAgoraRoute && canAccessFollowingFeed) {
            void followingFeed.open();
            return;
        }

        followingFeed.close();
    }, [canAccessFollowingFeed, followingFeed.close, followingFeed.open, isAgoraRoute]);

    const followPerson = useCallback(async (pubkey: string): Promise<void> => {
        if (!pubkey || !canWrite) {
            return;
        }

        setPendingFollowPubkeys((current) => ({
            ...current,
            [pubkey]: true,
        }));

        try {
            await onFollowPerson(pubkey);
        } finally {
            setPendingFollowPubkeys((current) => {
                const next = { ...current };
                delete next[pubkey];
                return next;
            });
        }
    }, [canWrite, onFollowPerson]);

    const isFollowMutationPending = useMemo(
        () => Object.keys(pendingFollowPubkeys).length > 0,
        [pendingFollowPubkeys],
    );

    return {
        followingFeed,
        activeFeed: followingFeed,
        canAccessFollowingFeed,
        followingFeedHasUnread,
        pendingFollowPubkeys,
        isFollowMutationPending,
        followPerson,
    };
}
