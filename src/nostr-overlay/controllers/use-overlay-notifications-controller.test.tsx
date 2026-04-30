import { act, useEffect, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeAll, beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import type { SocialNotificationItem, SocialNotificationsService } from '../../nostr/social-notifications-service';
import { useSocialNotificationsController } from '../query/social-notifications.query';
import { useOverlayNotificationsController, type OverlayNotificationsController } from './use-overlay-notifications-controller';

vi.mock('../query/social-notifications.query', () => ({
    useSocialNotificationsController: vi.fn(),
}));

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

const mountedRoots: RenderResult[] = [];

const service: SocialNotificationsService = {
    subscribeSocial: () => () => {},
    loadInitialSocial: async () => ({ items: [], hasMore: false, nextSince: null }),
};

function createNotificationItem(input: Partial<SocialNotificationItem> = {}): SocialNotificationItem {
    return {
        id: input.id ?? 'notification-a',
        kind: input.kind ?? 7,
        actorPubkey: input.actorPubkey ?? 'actor-a',
        createdAt: input.createdAt ?? 10,
        content: input.content ?? '+',
        targetEventId: input.targetEventId ?? 'event-a',
        rawEvent: input.rawEvent ?? {
            id: input.id ?? 'notification-a',
            kind: input.kind ?? 7,
            pubkey: input.actorPubkey ?? 'actor-a',
            created_at: input.createdAt ?? 10,
            content: input.content ?? '+',
            tags: [['e', input.targetEventId ?? 'event-a'], ['p', 'owner']],
        },
    };
}

function createNotificationsState(input: Partial<ReturnType<typeof useSocialNotificationsController>> = {}): ReturnType<typeof useSocialNotificationsController> {
    return {
        items: [],
        hasUnread: false,
        hasMore: false,
        lastReadAt: 0,
        isOpen: false,
        pendingSnapshot: [],
        isBootstrapping: false,
        isLoadingMore: false,
        bootstrapError: null,
        open: vi.fn(),
        close: vi.fn(),
        loadMore: vi.fn(),
        retry: vi.fn(),
        ...input,
    };
}

function Harness(props: {
    ownerPubkey?: string;
    canWrite?: boolean;
    isNotificationsRoute?: boolean;
    onController: (controller: OverlayNotificationsController) => void;
}): ReactElement | null {
    const controller = useOverlayNotificationsController({
        ...(props.ownerPubkey ? { ownerPubkey: props.ownerPubkey } : {}),
        canWrite: props.canWrite ?? false,
        isNotificationsRoute: props.isNotificationsRoute ?? false,
        service,
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

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    vi.mocked(useSocialNotificationsController).mockReset();
});

afterEach(() => {
    for (const { root, container } of mountedRoots.splice(0)) {
        act(() => root.unmount());
        container.remove();
    }
});

describe('useOverlayNotificationsController', () => {
    test('wires unread state and route lifecycle to the notification query controller', async () => {
        const open = vi.fn();
        const close = vi.fn();
        vi.mocked(useSocialNotificationsController).mockReturnValue(createNotificationsState({
            hasUnread: true,
            isOpen: false,
            open,
            close,
        }));
        let latest: OverlayNotificationsController | undefined;

        const { root } = await renderHarness(
            <Harness ownerPubkey="owner" canWrite isNotificationsRoute={false} onController={(controller) => { latest = controller; }} />,
        );
        await flushEffects();

        expect(useSocialNotificationsController).toHaveBeenCalledWith({ ownerPubkey: 'owner', service });
        expect(latest?.socialState.hasUnread).toBe(true);
        expect(latest?.canAccessSocialNotifications).toBe(true);
        expect(close).not.toHaveBeenCalled();

        await act(async () => {
            root.render(<Harness ownerPubkey="owner" canWrite isNotificationsRoute onController={(controller) => { latest = controller; }} />);
        });
        await flushEffects();

        expect(open).toHaveBeenCalledTimes(1);
    });

    test('closes the notification query controller when leaving notifications route while open', async () => {
        const open = vi.fn();
        const close = vi.fn();
        let notificationState = createNotificationsState({
            isOpen: false,
            open,
            close,
        });
        vi.mocked(useSocialNotificationsController).mockImplementation(() => notificationState);

        const { root } = await renderHarness(
            <Harness ownerPubkey="owner" canWrite isNotificationsRoute onController={() => {}} />,
        );
        await flushEffects();

        expect(open).toHaveBeenCalledTimes(1);
        expect(close).not.toHaveBeenCalled();

        notificationState = createNotificationsState({
            isOpen: true,
            open,
            close,
        });

        await act(async () => {
            root.render(<Harness ownerPubkey="owner" canWrite isNotificationsRoute={false} onController={() => {}} />);
        });
        await flushEffects();

        expect(close).toHaveBeenCalledTimes(1);
    });

    test('groups pending and recent inbox output from notification items', async () => {
        const pendingA = createNotificationItem({ id: 'pending-a', actorPubkey: 'actor-a', createdAt: 30, targetEventId: 'event-a' });
        const pendingB = createNotificationItem({ id: 'pending-b', actorPubkey: 'actor-b', createdAt: 40, targetEventId: 'event-a' });
        const recent = createNotificationItem({ id: 'recent-a', actorPubkey: 'actor-c', createdAt: 20, targetEventId: 'event-b' });
        vi.mocked(useSocialNotificationsController).mockReturnValue(createNotificationsState({
            items: [pendingA, pendingB, recent],
            pendingSnapshot: [pendingA, pendingB],
        }));
        let latest: OverlayNotificationsController | undefined;

        await renderHarness(<Harness ownerPubkey="owner" canWrite onController={(controller) => { latest = controller; }} />);

        expect(latest?.notificationInboxSections.newItems).toHaveLength(1);
        expect(latest?.notificationInboxSections.newItems[0]?.actors.map((actor) => actor.pubkey)).toEqual(['actor-b', 'actor-a']);
        expect(latest?.notificationInboxSections.recentItems).toHaveLength(1);
        expect(latest?.notificationInboxSections.recentItems[0]?.primaryActorPubkey).toBe('actor-c');
    });

    test('disables the notification stream for readonly sessions', async () => {
        vi.mocked(useSocialNotificationsController).mockReturnValue(createNotificationsState());

        await renderHarness(<Harness ownerPubkey="owner" canWrite={false} onController={() => {}} />);

        expect(useSocialNotificationsController).toHaveBeenCalledWith({ service });
    });
});
