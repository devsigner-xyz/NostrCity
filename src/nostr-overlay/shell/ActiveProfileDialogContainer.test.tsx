import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { RelayType } from '../../nostr/relay-settings';
import { ActiveProfileDialogContainer } from './ActiveProfileDialogContainer';

const { occupantProfileDialogMock } = vi.hoisted(() => ({
    occupantProfileDialogMock: vi.fn(),
}));

vi.mock('../components/OccupantProfileDialog', async () => {
    const React = await vi.importActual<typeof import('react')>('react');

    return {
        OccupantProfileDialog: (props: Record<string, unknown>) => {
            occupantProfileDialogMock(props);
            return React.createElement('div', { 'data-testid': 'occupant-profile-dialog' }, 'profile dialog');
        },
    };
});

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

interface MockedDialogProps {
    ownerPubkey?: string;
    pubkey: string;
    profile?: unknown;
    followsCount: number;
    followersCount: number;
    statsLoading: boolean;
    statsError?: string;
    posts: unknown[];
    engagementByEventId?: Record<string, unknown>;
    postsLoading: boolean;
    postsError?: string;
    hasMorePosts: boolean;
    follows: string[];
    followers: string[];
    networkProfiles: Record<string, unknown>;
    profilesByPubkey?: Record<string, unknown>;
    networkLoading: boolean;
    networkError?: string;
    verification?: unknown;
    verificationByPubkey?: Record<string, unknown>;
    onLoadMorePosts: () => Promise<void>;
    onRetryPosts?: () => Promise<void>;
    onRetryNetwork?: () => Promise<void>;
    onSelectHashtag?: (hashtag: string) => void;
    onSelectProfile?: (pubkey: string) => void;
    onCopyNpub?: (value: string) => void | Promise<void>;
    ownerFollows?: string[];
    relaySuggestionsByType?: Record<string, string[]>;
    onAddRelaySuggestion?: (relayUrl: string, relayTypes: RelayType[]) => void | Promise<void>;
    onAddAllRelaySuggestions?: (rows: Array<{ relayUrl: string; relayTypes: RelayType[] }>) => void | Promise<void>;
    onFollowProfile?: (pubkey: string) => void | Promise<void>;
    onSendMessage?: (pubkey: string) => void | Promise<void>;
    canWrite?: boolean;
    reactionByEventId?: Record<string, boolean>;
    repostByEventId?: Record<string, boolean>;
    pendingReactionByEventId?: Record<string, boolean>;
    pendingRepostByEventId?: Record<string, boolean>;
    onOpenThread?: (eventId: string) => void | Promise<void>;
    onToggleReaction?: (input: { eventId: string; targetPubkey?: string; emoji?: string }) => Promise<boolean>;
    onToggleRepost?: (input: { eventId: string; targetPubkey?: string; repostContent?: string }) => Promise<boolean>;
    onOpenQuoteComposer?: (note: unknown) => void;
    onZap?: (input: { eventId: string; eventKind?: number; targetPubkey?: string; amount: number }) => Promise<void> | void;
    zapAmounts?: number[];
    onConfigureZapAmounts?: () => void;
    onResolveProfiles?: (pubkeys: string[]) => Promise<void> | void;
    onResolveEventReferences?: (eventIds: string[], options?: { relayHintsByEventId?: Record<string, string[]> }) => Promise<Record<string, unknown> | void> | Record<string, unknown> | void;
    eventReferencesById?: Record<string, unknown>;
    onClose: () => void;
}

const ACTIVE_PUBKEY = 'a'.repeat(64);
const OWNER_PUBKEY = 'f'.repeat(64);
const EVENT_ID = 'event-1';

function createDefaultProps(overrides: Partial<ComponentProps<typeof ActiveProfileDialogContainer>> = {}): ComponentProps<typeof ActiveProfileDialogContainer> {
    const activeProfileData = {
        posts: [{ id: EVENT_ID, pubkey: ACTIVE_PUBKEY, createdAt: 123, content: 'hello' }],
        postsLoading: false,
        postsError: 'posts failed',
        hasMorePosts: true,
        followsCount: 2,
        followersCount: 1,
        statsLoading: false,
        statsError: 'stats failed',
        follows: ['b'.repeat(64)],
        followers: ['c'.repeat(64)],
        networkProfiles: {
            ['b'.repeat(64)]: { pubkey: 'b'.repeat(64), displayName: 'Bob' },
        },
        relaySuggestionsByType: {
            nip65Both: ['wss://both.example'],
            nip65Read: [],
            nip65Write: [],
            dmInbox: ['wss://dm.example'],
            search: [],
            groups: [],
        },
        networkLoading: false,
        networkError: 'network failed',
        loadMorePosts: vi.fn(async () => {}),
        retryPosts: vi.fn(async () => {}),
        retryNetwork: vi.fn(async () => {}),
    };

    return {
        ownerPubkey: OWNER_PUBKEY,
        activeProfilePubkey: ACTIVE_PUBKEY,
        activeProfile: { pubkey: ACTIVE_PUBKEY, displayName: 'Alice' },
        activeProfileData,
        activeProfileEngagementByEventId: {
            [EVENT_ID]: { replies: 1, reactions: 2, reposts: 3, zaps: 4, zapSats: 21 },
        },
        richContentProfilesByPubkey: {
            [ACTIVE_PUBKEY]: { pubkey: ACTIVE_PUBKEY, displayName: 'Alice' },
        },
        activeProfileVerification: { status: 'verified', identifier: 'alice@example.com', checkedAt: 1 },
        verificationByPubkey: {
            [ACTIVE_PUBKEY]: { status: 'verified', identifier: 'alice@example.com', checkedAt: 1 },
        },
        eventReferencesById: {
            [EVENT_ID]: { id: EVENT_ID, pubkey: ACTIVE_PUBKEY, created_at: 123, kind: 1, tags: [], content: 'note', sig: 'sig' },
        },
        ownerFollows: ['b'.repeat(64)],
        mutedPubkeys: [],
        canWrite: true,
        canAccessDirectMessages: true,
        reactionByEventId: { [EVENT_ID]: true },
        repostByEventId: { [EVENT_ID]: false },
        pendingReactionByEventId: { [EVENT_ID]: false },
        pendingRepostByEventId: { [EVENT_ID]: true },
        onClose: vi.fn(),
        onOpenThread: vi.fn(),
        onSelectHashtag: vi.fn(),
        onSelectProfile: vi.fn(),
        onCopyNpub: vi.fn(),
        onAddRelaySuggestion: vi.fn(),
        onAddAllRelaySuggestions: vi.fn(),
        onFollowProfile: vi.fn(),
        onToggleMuteProfile: vi.fn(),
        onSendMessage: vi.fn(),
        onToggleReaction: vi.fn(async () => true),
        onToggleRepost: vi.fn(async () => true),
        onOpenQuoteComposer: vi.fn(),
        onRequestZapPayment: vi.fn(async () => {}),
        zapAmounts: [21, 128],
        onConfigureZapAmounts: vi.fn(),
        onResolveProfiles: vi.fn(async () => {}),
        onResolveEventReferences: vi.fn(async () => ({})),
        ...overrides,
    };
}

async function renderContainer(props: ComponentProps<typeof ActiveProfileDialogContainer>): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(<ActiveProfileDialogContainer {...props} />);
    });

    return { container, root };
}

function getDialogProps(): MockedDialogProps {
    const call = occupantProfileDialogMock.mock.calls[occupantProfileDialogMock.mock.calls.length - 1];
    expect(call).toBeDefined();
    return call?.[0] as MockedDialogProps;
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
    occupantProfileDialogMock.mockClear();
});

describe('ActiveProfileDialogContainer', () => {
    test('renders nothing when no active profile pubkey exists', async () => {
        const rendered = await renderContainer(createDefaultProps({ activeProfilePubkey: undefined }));
        mounted.push(rendered);

        expect(rendered.container.textContent).toBe('');
        expect(occupantProfileDialogMock).not.toHaveBeenCalled();
    });

    test('maps active profile data into OccupantProfileDialog props', async () => {
        const props = createDefaultProps();
        const rendered = await renderContainer(props);
        mounted.push(rendered);

        const dialogProps = getDialogProps();
        expect(dialogProps.ownerPubkey).toBe(OWNER_PUBKEY);
        expect(dialogProps.pubkey).toBe(ACTIVE_PUBKEY);
        expect(dialogProps.profile).toBe(props.activeProfile);
        expect(dialogProps.followsCount).toBe(props.activeProfileData.followsCount);
        expect(dialogProps.followersCount).toBe(props.activeProfileData.followersCount);
        expect(dialogProps.statsLoading).toBe(props.activeProfileData.statsLoading);
        expect(dialogProps.statsError).toBe(props.activeProfileData.statsError);
        expect(dialogProps.posts).toBe(props.activeProfileData.posts);
        expect(dialogProps.engagementByEventId).toBe(props.activeProfileEngagementByEventId);
        expect(dialogProps.postsLoading).toBe(props.activeProfileData.postsLoading);
        expect(dialogProps.postsError).toBe(props.activeProfileData.postsError);
        expect(dialogProps.hasMorePosts).toBe(props.activeProfileData.hasMorePosts);
        expect(dialogProps.follows).toBe(props.activeProfileData.follows);
        expect(dialogProps.followers).toBe(props.activeProfileData.followers);
        expect(dialogProps.networkProfiles).toBe(props.activeProfileData.networkProfiles);
        expect(dialogProps.profilesByPubkey).toBe(props.richContentProfilesByPubkey);
        expect(dialogProps.networkLoading).toBe(props.activeProfileData.networkLoading);
        expect(dialogProps.networkError).toBe(props.activeProfileData.networkError);
        expect(dialogProps.relaySuggestionsByType).toBe(props.activeProfileData.relaySuggestionsByType);
        expect(dialogProps.verification).toBe(props.activeProfileVerification);
        expect(dialogProps.verificationByPubkey).toBe(props.verificationByPubkey);
        expect(dialogProps.eventReferencesById).toBe(props.eventReferencesById);
    });

    test('wraps zap input with the existing zap intent shape', async () => {
        const onRequestZapPayment = vi.fn(async () => {});
        const rendered = await renderContainer(createDefaultProps({ onRequestZapPayment }));
        mounted.push(rendered);

        await act(async () => {
            await getDialogProps().onZap?.({ eventId: EVENT_ID, eventKind: 1, amount: 21 });
        });
        await act(async () => {
            await getDialogProps().onZap?.({ eventId: EVENT_ID, targetPubkey: 'd'.repeat(64), amount: 128 });
        });

        expect(onRequestZapPayment).toHaveBeenNthCalledWith(1, {
            targetPubkey: '',
            amount: 21,
            eventId: EVENT_ID,
            eventKind: 1,
        });
        expect(onRequestZapPayment).toHaveBeenNthCalledWith(2, {
            targetPubkey: 'd'.repeat(64),
            amount: 128,
            eventId: EVENT_ID,
        });
    });

    test('passes dialog callbacks through unchanged', async () => {
        const props = createDefaultProps();
        const rendered = await renderContainer(props);
        mounted.push(rendered);

        const dialogProps = getDialogProps();
        expect(dialogProps.onClose).toBe(props.onClose);
        expect(dialogProps.onLoadMorePosts).toBe(props.activeProfileData.loadMorePosts);
        expect(dialogProps.onRetryPosts).toBe(props.activeProfileData.retryPosts);
        expect(dialogProps.onRetryNetwork).toBe(props.activeProfileData.retryNetwork);
        expect(dialogProps.onSelectHashtag).toBe(props.onSelectHashtag);
        expect(dialogProps.onSelectProfile).toBe(props.onSelectProfile);
        expect(dialogProps.onCopyNpub).toBe(props.onCopyNpub);
        expect(dialogProps.onOpenThread).toBe(props.onOpenThread);
        expect(dialogProps.onOpenQuoteComposer).toBe(props.onOpenQuoteComposer);
        expect(dialogProps.onFollowProfile).toBe(props.onFollowProfile);
        expect(dialogProps.onSendMessage).toBe(props.onSendMessage);
        expect(dialogProps.onAddRelaySuggestion).toBe(props.onAddRelaySuggestion);
        expect(dialogProps.onAddAllRelaySuggestions).toBe(props.onAddAllRelaySuggestions);
        expect(dialogProps.onToggleReaction).toBe(props.onToggleReaction);
        expect(dialogProps.onToggleRepost).toBe(props.onToggleRepost);
        expect(dialogProps.onConfigureZapAmounts).toBe(props.onConfigureZapAmounts);
        expect(dialogProps.onResolveProfiles).toBe(props.onResolveProfiles);
        expect(dialogProps.onResolveEventReferences).toBe(props.onResolveEventReferences);
    });
});
