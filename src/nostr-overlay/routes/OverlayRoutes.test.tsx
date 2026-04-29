import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import { OverlayRoutes, type OverlayRoutesProps } from './OverlayRoutes';

vi.mock('./AgoraRouteContainer', () => ({
    AgoraRouteContainer: () => <div data-testid="agora-route" />,
}));

vi.mock('./ArticlesRouteContainer', () => ({
    ArticlesRouteContainer: () => <div data-testid="articles-route" />,
}));

vi.mock('./ArticleDetailRouteContainer', () => ({
    ArticleDetailRouteContainer: () => <div data-testid="article-detail-route" />,
}));

vi.mock('./ChatsRouteContainer', () => ({
    ChatsRouteContainer: () => <div data-testid="chats-route" />,
}));

vi.mock('./CityStatsRouteContainer', () => ({
    CityStatsRouteContainer: () => <div data-testid="city-stats-route" />,
}));

vi.mock('./DiscoverRouteContainer', () => ({
    DiscoverRouteContainer: () => <div data-testid="discover-route" />,
}));

vi.mock('./NotificationsRouteContainer', () => ({
    NotificationsRouteContainer: () => <div data-testid="notifications-route" />,
}));

vi.mock('./SettingsRouteContainer', () => ({
    SettingsRouteContainer: () => <div data-testid="settings-route" />,
}));

vi.mock('./UserSearchRouteContainer', () => ({
    UserSearchRouteContainer: () => <div data-testid="user-search-route" />,
}));

vi.mock('./WalletRouteContainer', () => ({
    WalletRouteContainer: () => <div data-testid="wallet-route" />,
}));

vi.mock('../components/RelayDetailRoute', () => ({
    RelayDetailRoute: () => <div data-testid="relay-detail-route" />,
}));

vi.mock('../components/RelaysRoute', () => ({
    RelaysRoute: () => <div data-testid="relays-route" />,
}));

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    locations: string[];
}

function LocationProbe({ onLocation }: { onLocation: (location: string) => void }) {
    const location = useLocation();
    const value = `${location.pathname}${location.search}`;

    useEffect(() => {
        onLocation(value);
    }, [onLocation, value]);

    return <output data-testid="location-probe">{value}</output>;
}

function buildOverlayRoutesProps(overrides: Partial<OverlayRoutesProps> = {}): OverlayRoutesProps {
    const noop = () => undefined;
    const asyncNoop = async () => undefined;

    return {
        showLoginGate: false,
        sessionRestorationResolved: true,
        locationSearch: '',
        agora: {
            agoraFeedLayout: 'list',
            onAgoraFeedLayoutChange: noop,
            followingFeed: {
                items: [],
                pendingNewCount: 0,
                hasPendingNewItems: false,
                hasFollows: false,
                isLoadingFeed: false,
                isRefreshingFeed: false,
                feedError: null,
                hasMoreFeed: false,
                activeThread: null,
                isPublishingPost: false,
                isPublishingReply: false,
                publishError: null,
                reactionByEventId: {},
                repostByEventId: {},
                pendingReactionByEventId: {},
                pendingRepostByEventId: {},
                loadNextFeedPage: asyncNoop,
                applyPendingNewItems: asyncNoop,
                refreshFeed: asyncNoop,
                openThread: asyncNoop,
                closeThread: noop,
                loadNextThreadPage: asyncNoop,
                publishPost: async () => true,
                publishReply: async () => true,
                toggleReaction: async () => true,
            },
            profilesByPubkey: {},
            engagementByEventId: {},
            onClearHashtag: noop,
            onSelectHashtag: noop,
            onSelectProfile: noop,
            onResolveProfiles: asyncNoop,
            onSelectEventReference: noop,
            onResolveEventReferences: async () => ({}),
            eventReferencesById: {},
            onCopyNoteId: asyncNoop,
            canWrite: false,
            onToggleRepost: async () => true,
            onOpenQuoteComposer: noop,
            requestZapPayment: asyncNoop,
            zapAmounts: [],
            onConfigureZapAmounts: noop,
            onSearchUsers: async () => ({ pubkeys: [], profiles: {} }),
        },
        articles: {
            items: [],
            profilesByPubkey: {},
            isLoading: false,
            isRefreshing: false,
            isLoadingMore: false,
            error: null,
            hasMore: false,
            onRefresh: asyncNoop,
            onLoadMore: asyncNoop,
            onOpenArticle: noop,
        },
        articleDetail: {
            items: [],
            service: {
                loadFollowingFeed: async () => ({ items: [], hasMore: false }),
                loadArticlesFeed: async () => ({ items: [], hasMore: false }),
                loadArticleById: async () => null,
                loadHashtagFeed: async () => ({ items: [], hasMore: false }),
                loadThread: async () => ({ root: null, replies: [], hasMore: false }),
                loadEngagement: async () => ({}),
                loadViewerReactions: async () => ({}),
                loadViewerZaps: async () => ({}),
                loadViewerReplies: async () => ({}),
            },
            enabled: false,
            onBack: noop,
        },
        cityStats: {
            buildingsCount: 0,
            occupiedBuildingsCount: 0,
            followedPubkeys: [],
            followerPubkeys: [],
            profilesByPubkey: {},
            verificationByPubkey: {},
            parkCount: 0,
        },
        notifications: {
            hasUnread: false,
            pendingSnapshot: [],
            items: [],
            profilesByPubkey: {},
            eventReferencesById: {},
            onResolveProfiles: asyncNoop,
            onResolveEventReferences: async () => ({}),
            onOpenThread: asyncNoop,
            onOpenProfile: asyncNoop,
        },
        chats: {
            hasUnreadGlobal: false,
            isLoadingConversations: false,
            conversations: [],
            messages: [],
            activeConversationId: null,
            canSendChatMessages: false,
            canDirectMessages: false,
            onOpenConversation: noop,
            sendMessage: asyncNoop,
        },
        relays: {
            suggestedRelays: [],
            suggestedRelaysByType: {},
            onRelaySettingsChange: noop,
        },
        relayDetail: {
            suggestedRelays: [],
            suggestedRelaysByType: {},
        },
        discover: {
            discoveredIds: [],
        },
        wallet: {
            walletSettings: { activeConnection: null },
            walletActivity: { items: [] },
            walletNwcUriInput: '',
            setWalletNwcUriInput: noop,
            connectNwcWallet: asyncNoop,
            connectWebLnWallet: async () => true,
            disconnectWallet: noop,
            refreshWallet: asyncNoop,
        },
        userSearch: {
            onClose: noop,
            onSearch: async () => ({ pubkeys: [], profiles: {} }),
            onOpenActiveProfile: noop,
            followedPubkeys: [],
            verificationByPubkey: {},
            canWrite: false,
            onFollowUser: asyncNoop,
            canAccessDirectMessages: false,
            onMessageUser: noop,
        },
        settings: {
            mapBridge: null,
            suggestedRelays: [],
            suggestedRelaysByType: {},
            onUiSettingsChange: noop,
            zapSettings: { amounts: [], defaultAmount: 0 },
            onZapSettingsChange: noop,
            onClose: noop,
        },
        ...overrides,
    };
}

async function renderOverlayRoutes(
    initialEntry: string,
    overrides: Partial<OverlayRoutesProps> = {}
): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const locations: string[] = [];
    const props = buildOverlayRoutesProps(overrides);

    await act(async () => {
        root.render(
            <MemoryRouter initialEntries={[initialEntry]}>
                <OverlayRoutes {...props} />
                <LocationProbe onLocation={(location) => locations.push(location)} />
            </MemoryRouter>
        );
    });

    return { container, root, locations };
}

async function waitFor(condition: () => boolean): Promise<void> {
    for (let i = 0; i < 40; i++) {
        if (condition()) {
            return;
        }

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });
    }

    throw new Error('Condition was not met in time');
}

const mounted: RenderResult[] = [];

function lastLocation(locations: string[]): string | undefined {
    return locations[locations.length - 1];
}

beforeAll(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

afterEach(() => {
    for (const entry of mounted) {
        entry.root.unmount();
        entry.container.remove();
    }

    mounted.length = 0;
});

describe('OverlayRoutes', () => {
    test('redirects protected routes to login while login gate is visible', async () => {
        const rendered = await renderOverlayRoutes('/agora', { showLoginGate: true });
        mounted.push(rendered);

        await waitFor(() => lastLocation(rendered.locations) === '/login');

        expect(lastLocation(rendered.locations)).toBe('/login');
        expect(rendered.container.querySelector('[data-testid="agora-route"]')).toBeNull();
    });

    test('redirects protected article routes to login while login gate is visible', async () => {
        const rendered = await renderOverlayRoutes('/agora/articles', { showLoginGate: true });
        mounted.push(rendered);

        await waitFor(() => lastLocation(rendered.locations) === '/login');

        expect(lastLocation(rendered.locations)).toBe('/login');
        expect(rendered.container.querySelector('[data-testid="articles-route"]')).toBeNull();
    });

    test('renders article list and detail routes when authenticated', async () => {
        const list = await renderOverlayRoutes('/agora/articles');
        mounted.push(list);

        expect(list.container.querySelector('[data-testid="articles-route"]')).not.toBeNull();

        const detail = await renderOverlayRoutes(`/agora/articles/${'a'.repeat(64)}`);
        mounted.push(detail);

        expect(detail.container.querySelector('[data-testid="article-detail-route"]')).not.toBeNull();
    });

    test('redirects login to map when authenticated', async () => {
        const rendered = await renderOverlayRoutes('/login');
        mounted.push(rendered);

        await waitFor(() => lastLocation(rendered.locations) === '/');

        expect(lastLocation(rendered.locations)).toBe('/');
    });

    test('renders Agora route for /agora', async () => {
        const rendered = await renderOverlayRoutes('/agora');
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-testid="agora-route"]')).not.toBeNull();
        expect(lastLocation(rendered.locations)).toBe('/agora');
    });

    test('renders Chats route for /chats', async () => {
        const rendered = await renderOverlayRoutes('/chats');
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-testid="chats-route"]')).not.toBeNull();
        expect(lastLocation(rendered.locations)).toBe('/chats');
    });

    test('renders Wallet route for /wallet', async () => {
        const rendered = await renderOverlayRoutes('/wallet');
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-testid="wallet-route"]')).not.toBeNull();
        expect(lastLocation(rendered.locations)).toBe('/wallet');
    });

    test('preserves search params for legacy settings relay detail redirect', async () => {
        const locationSearch = '?url=wss%3A%2F%2Frelay.one&source=configured&type=nip65Both';
        const rendered = await renderOverlayRoutes(`/settings/relays/detail${locationSearch}`, { locationSearch });
        mounted.push(rendered);

        await waitFor(() => lastLocation(rendered.locations) === '/relays/detail?url=wss%3A%2F%2Frelay.one&source=configured&type=nip65Both');

        expect(lastLocation(rendered.locations)).toBe('/relays/detail?url=wss%3A%2F%2Frelay.one&source=configured&type=nip65Both');
        expect(rendered.container.querySelector('[data-testid="relay-detail-route"]')).not.toBeNull();
    });

    test('redirects unknown protected routes to map', async () => {
        const rendered = await renderOverlayRoutes('/does-not-exist');
        mounted.push(rendered);

        await waitFor(() => lastLocation(rendered.locations) === '/');

        expect(lastLocation(rendered.locations)).toBe('/');
    });
});
