import type { ComponentProps } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AgoraFeedLayout } from '../../nostr/ui-settings';
import type { ZapIntentInput } from '../controllers/use-wallet-zap-controller';
import type { NoteCardModel } from '../components/note-card-model';
import type { SearchUsersResult } from '../query/user-search.query';
import { FollowingFeedSurface } from '../components/FollowingFeedSurface';
import { AgoraRouteContainer, type AgoraRouteContainerProps } from './AgoraRouteContainer';

vi.mock('../components/FollowingFeedSurface', () => ({
    FollowingFeedSurface: vi.fn(() => null),
}));

type FollowingFeedSurfaceProps = ComponentProps<typeof FollowingFeedSurface>;

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

const mountedRoots: RenderResult[] = [];

const noteCard: NoteCardModel = {
    id: 'event-1',
    pubkey: 'note-author-pubkey',
    createdAt: 123,
    content: 'note content',
    tags: [],
    variant: 'default',
    showCopyId: true,
    nestingLevel: 0,
};

function buildProps(overrides: Partial<AgoraRouteContainerProps> = {}): AgoraRouteContainerProps {
    const followingFeed: AgoraRouteContainerProps['followingFeed'] = {
        items: [],
        pendingNewCount: 2,
        hasPendingNewItems: true,
        hasFollows: true,
        activeHashtag: 'nostrcity',
        isLoadingFeed: false,
        isRefreshingFeed: false,
        feedError: null,
        hasMoreFeed: true,
        activeThread: null,
        isPublishingPost: false,
        isPublishingReply: false,
        publishError: null,
        reactionByEventId: { 'event-1': true },
        repostByEventId: { 'event-1': false },
        pendingReactionByEventId: { 'event-1': false },
        pendingRepostByEventId: { 'event-1': true },
        loadNextFeedPage: vi.fn(async () => undefined),
        applyPendingNewItems: vi.fn(async () => undefined),
        refreshFeed: vi.fn(async () => undefined),
        openThread: vi.fn(async () => undefined),
        closeThread: vi.fn(),
        loadNextThreadPage: vi.fn(async () => undefined),
        publishPost: vi.fn(async () => true),
        publishReply: vi.fn(async () => true),
        toggleReaction: vi.fn(async () => true),
    };
    const props: AgoraRouteContainerProps = {
        agoraFeedLayout: 'masonry',
        onAgoraFeedLayoutChange: vi.fn<(layout: AgoraFeedLayout) => void>(),
        followingFeed,
        profilesByPubkey: {},
        engagementByEventId: {},
        eventReferencesById: {},
        canWrite: true,
        ownerPubkey: 'owner-pubkey',
        searchRelaySetKey: 'search-relay-set-key',
        onClearHashtag: vi.fn(),
        onSelectHashtag: vi.fn(),
        onSelectProfile: vi.fn(),
        onResolveProfiles: vi.fn(async () => undefined),
        onSelectEventReference: vi.fn(),
        onResolveEventReferences: vi.fn(async () => undefined),
        onCopyNoteId: vi.fn(),
        onSearchUsers: vi.fn<(query: string) => Promise<SearchUsersResult>>(async () => ({ pubkeys: [], profiles: {} })),
        onToggleRepost: vi.fn(async () => true),
        onOpenQuoteComposer: vi.fn(),
        requestZapPayment: vi.fn(async () => undefined),
        zapAmounts: [21, 100, 1_000],
        onConfigureZapAmounts: vi.fn(),
        ...overrides,
    };

    return props;
}

async function renderRoute(props: AgoraRouteContainerProps): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(<AgoraRouteContainer {...props} />);
    });

    const result = { container, root };
    mountedRoots.push(result);
    return result;
}

function getLatestFollowingFeedSurfaceProps(): FollowingFeedSurfaceProps {
    const calls = vi.mocked(FollowingFeedSurface).mock.calls;
    const latestCall = calls[calls.length - 1];

    if (!latestCall) {
        throw new Error('FollowingFeedSurface was not rendered');
    }

    return latestCall[0];
}

beforeAll(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

beforeEach(() => {
    vi.mocked(FollowingFeedSurface).mockClear();
});

afterEach(() => {
    for (const { root, container } of mountedRoots.splice(0)) {
        act(() => root.unmount());
        container.remove();
    }
});

describe('AgoraRouteContainer', () => {
    test('passes feed state and active hashtag into FollowingFeedSurface', async () => {
        const props = buildProps();

        await renderRoute(props);

        const surfaceProps = getLatestFollowingFeedSurfaceProps();
        expect(surfaceProps.agoraFeedLayout).toBe(props.agoraFeedLayout);
        expect(surfaceProps.onAgoraFeedLayoutChange).toBe(props.onAgoraFeedLayoutChange);
        expect(surfaceProps.items).toBe(props.followingFeed.items);
        expect(surfaceProps.pendingNewCount).toBe(props.followingFeed.pendingNewCount);
        expect(surfaceProps.hasPendingNewItems).toBe(props.followingFeed.hasPendingNewItems);
        expect(surfaceProps.hasFollows).toBe(props.followingFeed.hasFollows);
        expect(surfaceProps.profilesByPubkey).toBe(props.profilesByPubkey);
        expect(surfaceProps.engagementByEventId).toBe(props.engagementByEventId);
        expect(surfaceProps.activeHashtag).toBe(props.followingFeed.activeHashtag);
        expect(surfaceProps.isLoadingFeed).toBe(props.followingFeed.isLoadingFeed);
        expect(surfaceProps.isRefreshingFeed).toBe(props.followingFeed.isRefreshingFeed);
        expect(surfaceProps.feedError).toBe(props.followingFeed.feedError);
        expect(surfaceProps.hasMoreFeed).toBe(props.followingFeed.hasMoreFeed);
        expect(surfaceProps.activeThread).toBe(props.followingFeed.activeThread);
        expect(surfaceProps.canWrite).toBe(props.canWrite);
        expect(surfaceProps.isPublishingPost).toBe(props.followingFeed.isPublishingPost);
        expect(surfaceProps.isPublishingReply).toBe(props.followingFeed.isPublishingReply);
        expect(surfaceProps.publishError).toBe(props.followingFeed.publishError);
        expect(surfaceProps.reactionByEventId).toBe(props.followingFeed.reactionByEventId);
        expect(surfaceProps.repostByEventId).toBe(props.followingFeed.repostByEventId);
        expect(surfaceProps.pendingReactionByEventId).toBe(props.followingFeed.pendingReactionByEventId);
        expect(surfaceProps.pendingRepostByEventId).toBe(props.followingFeed.pendingRepostByEventId);
        expect(surfaceProps.ownerPubkey).toBe(props.ownerPubkey);
        expect(surfaceProps.searchRelaySetKey).toBe(props.searchRelaySetKey);
        expect(surfaceProps.zapAmounts).toBe(props.zapAmounts);
        expect(surfaceProps.onConfigureZapAmounts).toBe(props.onConfigureZapAmounts);
    });

    test('forwards return focus event id into FollowingFeedSurface', async () => {
        const props = buildProps({
            returnFocusEventId: 'event-to-refocus',
        });

        await renderRoute(props);

        expect(getLatestFollowingFeedSurfaceProps().returnFocusEventId).toBe('event-to-refocus');
    });

    test('passes clear hashtag only when an active hashtag exists', async () => {
        const props = buildProps();

        await renderRoute(props);

        expect(getLatestFollowingFeedSurfaceProps().onClearHashtag).toBe(props.onClearHashtag);

        vi.mocked(FollowingFeedSurface).mockClear();
        await renderRoute(buildProps({
            followingFeed: {
                ...props.followingFeed,
                activeHashtag: undefined,
            },
        }));

        const surfacePropsWithoutHashtag = getLatestFollowingFeedSurfaceProps();
        expect(surfacePropsWithoutHashtag.activeHashtag).toBeUndefined();
        expect(surfacePropsWithoutHashtag.onClearHashtag).toBeUndefined();
    });

    test('maps zap callback to requestZapPayment with target pubkey fallback', async () => {
        const requestZapPayment = vi.fn<(input: ZapIntentInput) => Promise<void>>(async () => undefined);
        const props = buildProps({ requestZapPayment });

        await renderRoute(props);
        await act(async () => {
            await getLatestFollowingFeedSurfaceProps().onZap({
                eventId: 'event-1',
                eventKind: 1,
                amount: 21,
            });
        });

        expect(requestZapPayment).toHaveBeenCalledWith({
            targetPubkey: '',
            amount: 21,
            eventId: 'event-1',
            eventKind: 1,
        });
    });

    test('passes quote composer, reaction, repost, event reference, and profile callbacks through', async () => {
        const props = buildProps();

        await renderRoute(props);

        const surfaceProps = getLatestFollowingFeedSurfaceProps();
        expect(surfaceProps.onOpenQuoteComposer).toBe(props.onOpenQuoteComposer);
        surfaceProps.onOpenQuoteComposer(noteCard);
        expect(props.onOpenQuoteComposer).toHaveBeenCalledWith(noteCard);
        expect(surfaceProps.onToggleReaction).toBe(props.followingFeed.toggleReaction);
        expect(surfaceProps.onToggleRepost).toBe(props.onToggleRepost);
        expect(surfaceProps.onSelectEventReference).toBe(props.onSelectEventReference);
        expect(surfaceProps.onResolveEventReferences).toBe(props.onResolveEventReferences);
        expect(surfaceProps.eventReferencesById).toBe(props.eventReferencesById);
        expect(surfaceProps.onSelectProfile).toBe(props.onSelectProfile);
        expect(surfaceProps.onResolveProfiles).toBe(props.onResolveProfiles);
        expect(surfaceProps.onSelectHashtag).toBe(props.onSelectHashtag);
        surfaceProps.onCopyNoteId?.('note1event');
        expect(props.onCopyNoteId).toHaveBeenCalledWith('note1event');
        expect(surfaceProps.onSearchUsers).toBe(props.onSearchUsers);
        expect(surfaceProps.onLoadMoreFeed).toBe(props.followingFeed.loadNextFeedPage);
        expect(surfaceProps.onApplyPendingNewItems).toBe(props.followingFeed.applyPendingNewItems);
        expect(surfaceProps.onRefreshFeed).toBe(props.followingFeed.refreshFeed);
        expect(surfaceProps.onOpenThread).toBe(props.followingFeed.openThread);
        expect(surfaceProps.onCloseThread).toBe(props.followingFeed.closeThread);
        expect(surfaceProps.onLoadMoreThread).toBe(props.followingFeed.loadNextThreadPage);
        expect(surfaceProps.onPublishPost).toBe(props.followingFeed.publishPost);
        expect(surfaceProps.onPublishReply).toBe(props.followingFeed.publishReply);
    });
});
