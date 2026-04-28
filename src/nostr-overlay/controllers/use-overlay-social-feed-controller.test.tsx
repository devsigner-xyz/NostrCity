import { act, useEffect, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SocialFeedService } from '../../nostr/social-feed-service';
import { useFollowingFeedController } from '../hooks/useFollowingFeedController';
import { useOverlaySocialFeedController, type OverlaySocialFeedController } from './use-overlay-social-feed-controller';

vi.mock('../hooks/useFollowingFeedController', () => ({
    useFollowingFeedController: vi.fn(),
}));

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

const mountedRoots: RenderResult[] = [];

const service: SocialFeedService = {
    loadFollowingFeed: async () => ({ items: [], hasMore: false }),
    loadArticlesFeed: async () => ({ items: [], hasMore: false }),
    loadArticleById: async () => null,
    loadHashtagFeed: async () => ({ items: [], hasMore: false }),
    loadThread: async () => ({ root: null, replies: [], hasMore: false }),
    loadEngagement: async () => ({}),
    loadViewerReactions: async () => ({}),
};

function createFeedState(input: Partial<ReturnType<typeof useFollowingFeedController>> = {}): ReturnType<typeof useFollowingFeedController> {
    return {
        isOpen: false,
        items: [],
        hasFollows: true,
        hasUnread: false,
        pendingNewCount: 0,
        hasPendingNewItems: false,
        isLoadingFeed: false,
        isRefreshingFeed: false,
        feedError: null,
        hasMoreFeed: false,
        activeThread: null,
        publishError: null,
        isPublishingPost: false,
        isPublishingQuote: false,
        isPublishingReply: false,
        reactionByEventId: {},
        viewerReactionByEventId: {},
        repostByEventId: {},
        pendingReactionByEventId: {},
        pendingRepostByEventId: {},
        engagementByEventId: {},
        activeHashtag: undefined,
        open: vi.fn(),
        close: vi.fn(),
        refreshFeed: vi.fn(),
        applyPendingNewItems: vi.fn(),
        loadNextFeedPage: vi.fn(),
        openThread: vi.fn(),
        closeThread: vi.fn(),
        loadNextThreadPage: vi.fn(),
        publishPost: vi.fn(),
        publishQuote: vi.fn(),
        publishReply: vi.fn(),
        toggleReaction: vi.fn(),
        toggleRepost: vi.fn(),
        ...input,
    };
}

function Harness(props: {
    ownerPubkey?: string;
    follows?: string[];
    activeAgoraHashtag?: string;
    isAgoraRoute?: boolean;
    canWrite?: boolean;
    onFollowPerson?: (pubkey: string) => Promise<void>;
    onController: (controller: OverlaySocialFeedController) => void;
}): ReactElement | null {
    const controller = useOverlaySocialFeedController({
        ...(props.ownerPubkey ? { ownerPubkey: props.ownerPubkey } : {}),
        follows: props.follows ?? [],
        ...(props.activeAgoraHashtag ? { activeAgoraHashtag: props.activeAgoraHashtag } : {}),
        isAgoraRoute: props.isAgoraRoute ?? false,
        canWrite: props.canWrite ?? false,
        service,
        onFollowPerson: props.onFollowPerson ?? (async () => {}),
    });

    useEffect(() => {
        props.onController(controller);
    }, [controller, props]);

    return null;
}

async function renderHarness(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    const result = { container, root };
    mountedRoots.push(result);
    return result;
}

async function flushEffects(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
    });
}

afterEach(() => {
    for (const { root, container } of mountedRoots.splice(0)) {
        act(() => root.unmount());
        container.remove();
    }
});

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    vi.mocked(useFollowingFeedController).mockReset();
});

describe('useOverlaySocialFeedController', () => {
    test('selects the active Agora feed and forwards the hashtag filter', async () => {
        const feedState = createFeedState({ activeHashtag: 'maps' });
        vi.mocked(useFollowingFeedController).mockReturnValue(feedState);
        let latest: OverlaySocialFeedController | undefined;

        await renderHarness(
            <Harness
                ownerPubkey="owner"
                follows={["follow-a"]}
                activeAgoraHashtag="#Maps"
                isAgoraRoute
                canWrite
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();

        expect(useFollowingFeedController).toHaveBeenCalledWith(expect.objectContaining({
            ownerPubkey: 'owner',
            follows: ['follow-a'],
            hashtag: '#Maps',
            pageSize: 10,
            canWrite: true,
            service,
        }));
        expect(latest?.activeFeed).toBe(feedState);
        expect(latest?.followingFeed).toBe(feedState);
    });

    test('tracks follow and unfollow mutation state while the callback is pending', async () => {
        vi.mocked(useFollowingFeedController).mockReturnValue(createFeedState());
        let latest: OverlaySocialFeedController | undefined;
        let resolveFollow: (() => void) | undefined;
        const onFollowPerson = vi.fn(() => new Promise<void>((resolve) => {
            resolveFollow = resolve;
        }));

        await renderHarness(
            <Harness
                ownerPubkey="owner"
                canWrite
                onFollowPerson={onFollowPerson}
                onController={(controller) => { latest = controller; }}
            />,
        );

        await act(async () => {
            void latest?.followPerson('follow-a');
            await Promise.resolve();
        });

        expect(onFollowPerson).toHaveBeenCalledWith('follow-a');
        expect(latest?.isFollowMutationPending).toBe(true);
        expect(latest?.pendingFollowPubkeys).toEqual({ 'follow-a': true });

        await act(async () => {
            resolveFollow?.();
            await Promise.resolve();
        });

        expect(latest?.isFollowMutationPending).toBe(false);
        expect(latest?.pendingFollowPubkeys).toEqual({});
    });

    test('wires unread state and read transitions to route open and close', async () => {
        const open = vi.fn();
        const close = vi.fn();
        vi.mocked(useFollowingFeedController).mockReturnValue(createFeedState({
            isOpen: false,
            hasUnread: true,
            open,
            close,
        }));
        let latest: OverlaySocialFeedController | undefined;

        const { root } = await renderHarness(
            <Harness
                ownerPubkey="owner"
                isAgoraRoute={false}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();

        expect(latest?.followingFeedHasUnread).toBe(true);
        expect(close).toHaveBeenCalledTimes(1);

        await act(async () => {
            root.render(
                <Harness
                    ownerPubkey="owner"
                    isAgoraRoute
                    onController={(controller) => { latest = controller; }}
                />,
            );
        });
        await flushEffects();

        expect(open).toHaveBeenCalledTimes(1);
    });
});
