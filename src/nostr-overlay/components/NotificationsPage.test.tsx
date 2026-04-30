import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { NostrEvent, NostrProfile } from '../../nostr/types';
import type { SocialNotificationItem } from '../../nostr/social-notifications-service';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { NotificationsPage } from './NotificationsPage';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    return { container, root };
}

let mounted: RenderResult[] = [];

function readOverlayStyles(): string {
    return readFileSync(join(process.cwd(), 'src', 'nostr-overlay', 'styles.css'), 'utf8');
}

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    window.localStorage.clear();
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

function buildItem(overrides: Partial<SocialNotificationItem> = {}): SocialNotificationItem {
    return {
        id: 'notif-1',
        kind: 7,
        actorPubkey: 'a'.repeat(64),
        createdAt: 100,
        content: '+',
        targetEventId: 'b'.repeat(64),
        targetPubkey: 'c'.repeat(64),
        rawEvent: {
            id: 'notif-1',
            pubkey: 'a'.repeat(64),
            kind: 7,
            created_at: 100,
            tags: [['p', 'c'.repeat(64)], ['e', 'b'.repeat(64)]],
            content: '+',
        },
        ...overrides,
    };
}

function buildProfile(pubkey: string, displayName: string): NostrProfile {
    return {
        pubkey,
        displayName,
    };
}

function buildEvent(id: string, pubkey: string, content: string, createdAt = 100): NostrEvent {
    return {
        id,
        pubkey,
        kind: 1,
        created_at: createdAt,
        tags: [],
        content,
    };
}

describe('NotificationsPage', () => {
    test('shows unread indicator when hasUnread is true', async () => {
        const rendered = await renderElement(
            <NotificationsPage
                hasUnread
                newNotifications={[buildItem()]}
                recentNotifications={[]}
                profilesByPubkey={{}}
                eventReferencesById={{}}
            />,
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-notifications-unread-dot')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="overlay-page-header"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-slot="overlay-unread-indicator"]')).not.toBeNull();
    });

    test('uses the common routed page layout spacing', async () => {
        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[]}
                recentNotifications={[]}
                profilesByPubkey={{}}
                eventReferencesById={{}}
            />,
        );
        mounted.push(rendered);

        const page = rendered.container.querySelector('.nostr-notifications-page') as HTMLElement | null;

        expect(page).not.toBeNull();
        expect(page?.className).toContain('nostr-routed-surface-panel');
        expect(page?.className).toContain('nostr-page-layout');
    });

    test('marks routed surface content for mobile app bar offset', async () => {
        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[]}
                recentNotifications={[]}
                profilesByPubkey={{}}
                eventReferencesById={{}}
            />,
        );
        mounted.push(rendered);

        const content = rendered.container.querySelector('[data-testid="overlay-surface-content"]');
        const styles = readOverlayStyles();

        expect(content?.className).toContain('nostr-overlay-surface-content');
        expect(styles).toMatch(/\.nostr-overlay-surface-content,\s*\.nostr-following-feed-routed-surface-content\s*\{[^}]*padding-top:\s*calc\(env\(safe-area-inset-top\) \+ 4rem\);/s);
    });

    test('renders empty state when there are no notifications in either section', async () => {
        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[]}
                recentNotifications={[]}
                profilesByPubkey={{}}
                eventReferencesById={{}}
            />,
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Sin notificaciones');
        expect(rendered.container.textContent || '').toContain('No tienes notificaciones pendientes.');
    });

    test('loads more notifications when scrolling near the end', async () => {
        const loadMore = vi.fn(async () => undefined);
        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[]}
                recentNotifications={[buildItem()]}
                profilesByPubkey={{}}
                eventReferencesById={{}}
                hasMoreNotifications
                isLoadingMoreNotifications={false}
                onLoadMoreNotifications={loadMore}
            />,
        );
        mounted.push(rendered);

        const scrollContainer = rendered.container.querySelector('[data-slot="notifications-scroll"]') as HTMLDivElement | null;
        expect(scrollContainer).not.toBeNull();

        Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1_000 });
        Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 500 });
        Object.defineProperty(scrollContainer, 'scrollTop', { configurable: true, value: 430 });

        await act(async () => {
            scrollContainer?.dispatchEvent(new Event('scroll', { bubbles: true }));
        });

        expect(loadMore).toHaveBeenCalledTimes(1);
    });

    test('renders grouped new and recent notification sections with actor identity and note previews', async () => {
        const targetOne = 'b'.repeat(64);
        const targetTwo = 'd'.repeat(64);
        const actorOne = '1'.repeat(64);
        const actorTwo = '2'.repeat(64);
        const actorThree = '3'.repeat(64);
        const targetAuthorOne = '4'.repeat(64);
        const targetAuthorTwo = '5'.repeat(64);

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({
                        id: 'zap-1',
                        kind: 9735,
                        actorPubkey: actorOne,
                        createdAt: 120,
                        content: 'zap-1',
                        targetEventId: targetOne,
                        rawEvent: {
                            id: 'zap-1',
                            pubkey: actorOne,
                            kind: 9735,
                            created_at: 120,
                            tags: [['p', 'c'.repeat(64)], ['e', targetOne], ['amount', '21000']],
                            content: 'zap-1',
                        },
                    }),
                    buildItem({
                        id: 'zap-2',
                        kind: 9735,
                        actorPubkey: actorTwo,
                        createdAt: 125,
                        content: 'zap-2',
                        targetEventId: targetOne,
                        rawEvent: {
                            id: 'zap-2',
                            pubkey: actorTwo,
                            kind: 9735,
                            created_at: 125,
                            tags: [['p', 'c'.repeat(64)], ['e', targetOne], ['amount', '42000']],
                            content: 'zap-2',
                        },
                    }),
                ]}
                recentNotifications={[
                    buildItem({
                        id: 'reaction-1',
                        actorPubkey: actorThree,
                        createdAt: 90,
                        content: '❤️',
                        targetEventId: targetTwo,
                        rawEvent: {
                            id: 'reaction-1',
                            pubkey: actorThree,
                            kind: 7,
                            created_at: 90,
                            tags: [['p', 'c'.repeat(64)], ['e', targetTwo]],
                            content: '❤️',
                        },
                    }),
                ]}
                profilesByPubkey={{
                    [actorOne]: buildProfile(actorOne, 'Alice'),
                    [actorTwo]: buildProfile(actorTwo, 'Bob'),
                    [actorThree]: buildProfile(actorThree, 'Carol'),
                    [targetAuthorOne]: buildProfile(targetAuthorOne, 'Nora'),
                    [targetAuthorTwo]: buildProfile(targetAuthorTwo, 'Rita'),
                }}
                eventReferencesById={{
                    [targetOne]: buildEvent(targetOne, targetAuthorOne, 'nota target uno', 80),
                    [targetTwo]: buildEvent(targetTwo, targetAuthorTwo, 'nota target dos', 70),
                }}
            />,
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Nuevas');
        expect(text).toContain('Recientes');
        expect(text).toContain('Bob y 1 más zapearon tu nota con 63 sats');
        expect(text).toContain('nota target uno');
        expect(text).toContain('Carol reaccionó con ❤️ a tu nota');
        expect(text).toContain('nota target dos');
        expect(text).not.toContain('Reaccion');
        expect(text).not.toContain('Zap');
        expect(text).not.toContain('2 eventos');

        const zapTitle = Array.from(rendered.container.querySelectorAll('[data-slot="item-title"]')).find((node) =>
            (node.textContent || '').includes('zapearon tu nota')
        ) as HTMLElement | undefined;
        expect(zapTitle?.textContent || '').toContain('con 63 sats');
        expect(Array.from(rendered.container.querySelectorAll('[data-slot="item-description"]')).some((node) =>
            (node.textContent || '').trim() === '63 sats'
        )).toBe(false);
    });

    test('uses unique actor count in grouped row copy when the same actor emits multiple events', async () => {
        const targetOne = 'b'.repeat(64);
        const actorOne = '1'.repeat(64);
        const targetAuthorOne = '4'.repeat(64);

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({
                        id: 'zap-1',
                        kind: 9735,
                        actorPubkey: actorOne,
                        createdAt: 120,
                        content: 'zap-1',
                        targetEventId: targetOne,
                        rawEvent: {
                            id: 'zap-1',
                            pubkey: actorOne,
                            kind: 9735,
                            created_at: 120,
                            tags: [['p', 'c'.repeat(64)], ['e', targetOne], ['amount', '21000']],
                            content: 'zap-1',
                        },
                    }),
                    buildItem({
                        id: 'zap-2',
                        kind: 9735,
                        actorPubkey: actorOne,
                        createdAt: 125,
                        content: 'zap-2',
                        targetEventId: targetOne,
                        rawEvent: {
                            id: 'zap-2',
                            pubkey: actorOne,
                            kind: 9735,
                            created_at: 125,
                            tags: [['p', 'c'.repeat(64)], ['e', targetOne], ['amount', '42000']],
                            content: 'zap-2',
                        },
                    }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{
                    [actorOne]: buildProfile(actorOne, 'Alice'),
                    [targetAuthorOne]: buildProfile(targetAuthorOne, 'Nora'),
                }}
                eventReferencesById={{
                    [targetOne]: buildEvent(targetOne, targetAuthorOne, 'nota target uno', 80),
                }}
            />,
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Alice zapeó tu nota con 63 sats');
        expect(text).not.toContain('Alice y 1 más zapearon tu nota');
        expect(text).not.toContain('2 eventos');
    });

    test('resolves missing actor profiles and target events in batch', async () => {
        const onResolveProfiles = vi.fn(async () => {});
        const onResolveEventReferences = vi.fn(async () => ({}));
        const targetOne = 'b'.repeat(64);
        const targetTwo = 'd'.repeat(64);
        const targetThree = 'e'.repeat(64);
        const actorOne = '1'.repeat(64);
        const actorTwo = '2'.repeat(64);
        const actorThree = '3'.repeat(64);

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({ id: 'reaction-1', actorPubkey: actorOne, targetEventId: targetOne }),
                    buildItem({ id: 'reaction-2', actorPubkey: actorTwo, targetEventId: targetOne, createdAt: 101 }),
                ]}
                recentNotifications={[
                    buildItem({ id: 'repost-1', kind: 16, actorPubkey: actorTwo, targetEventId: targetTwo, createdAt: 80 }),
                    buildItem({
                        id: 'mention-1',
                        kind: 1,
                        actorPubkey: actorThree,
                        targetEventId: targetThree,
                        createdAt: 79,
                        rawEvent: {
                            id: 'mention-1',
                            pubkey: actorThree,
                            kind: 1,
                            created_at: 79,
                            tags: [['p', 'c'.repeat(64)]],
                            content: 'mention source',
                        },
                    }),
                ]}
                profilesByPubkey={{}}
                eventReferencesById={{}}
                onResolveProfiles={onResolveProfiles}
                onResolveEventReferences={onResolveEventReferences}
            />,
        );
        mounted.push(rendered);

        await act(async () => {
            await Promise.resolve();
        });

        expect(onResolveProfiles).toHaveBeenCalledWith([actorTwo, actorOne, actorThree]);
        expect(onResolveEventReferences).toHaveBeenCalledWith([targetOne, targetTwo]);
    });

    test('renders mention title with an interactive nota label instead of an embedded note', async () => {
        const actor = '1'.repeat(64);
        const targetEventId = 'b'.repeat(64);
        const onOpenThread = vi.fn();

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({
                        id: 'mention-1',
                        kind: 1,
                        actorPubkey: actor,
                        content: 'te menciono en esta nota',
                        targetEventId,
                        rawEvent: {
                            id: 'mention-1',
                            pubkey: actor,
                            kind: 1,
                            created_at: 100,
                            tags: [['p', 'c'.repeat(64)]],
                            content: 'te menciono en esta nota',
                        },
                    }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{ [actor]: buildProfile(actor, 'Alice') }}
                eventReferencesById={{}}
                onOpenThread={onOpenThread}
            />,
        );
        mounted.push(rendered);

        const noteButton = rendered.container.querySelector('[data-slot="notification-target-note"]') as HTMLButtonElement | null;

        expect(rendered.container.textContent || '').toContain('Alice te mencionó en una nota');
        expect(noteButton?.textContent).toBe('nota');
        expect(rendered.container.querySelector('[data-slot="card"]')).toBeNull();
        expect(rendered.container.textContent || '').not.toContain('La nota original no está disponible.');

        await act(async () => {
            noteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenThread).toHaveBeenCalledWith(targetEventId);
    });

    test('centers mention avatar and title without rendering a note preview row', async () => {
        const actor = '1'.repeat(64);

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({
                        id: 'mention-1',
                        kind: 1,
                        actorPubkey: actor,
                        content: 'te menciono en esta nota',
                        targetEventId: 'b'.repeat(64),
                        rawEvent: {
                            id: 'mention-1',
                            pubkey: actor,
                            kind: 1,
                            created_at: 100,
                            tags: [['p', 'c'.repeat(64)]],
                            content: 'te menciono en esta nota',
                        },
                    }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{ [actor]: buildProfile(actor, 'Alice') }}
                eventReferencesById={{}}
            />,
        );
        mounted.push(rendered);

        const card = rendered.container.querySelector('[data-slot="card"]') as HTMLElement | null;
        const item = rendered.container.querySelector('[data-slot="item"]') as HTMLElement | null;
        const header = rendered.container.querySelector('[data-slot="item-header"]') as HTMLElement | null;

        expect(card).toBeNull();
        expect(item?.className).toContain('items-center');
        expect(header?.className).toContain('items-center');
        expect(header?.className).not.toContain('items-start');
    });

    test('renders reply title with an interactive nota label instead of an embedded note', async () => {
        const actor = '1'.repeat(64);
        const targetEventId = 'b'.repeat(64);
        const onOpenThread = vi.fn();

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({
                        id: 'reply-1',
                        kind: 1,
                        actorPubkey: actor,
                        targetEventId,
                        content: 'esta es la respuesta',
                        rawEvent: {
                            id: 'reply-1',
                            pubkey: actor,
                            kind: 1,
                            created_at: 100,
                            tags: [['p', 'c'.repeat(64)], ['e', targetEventId, '', 'reply']],
                            content: 'esta es la respuesta',
                        },
                    }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{ [actor]: buildProfile(actor, 'Alice') }}
                eventReferencesById={{}}
                onOpenThread={onOpenThread}
            />,
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        const card = rendered.container.querySelector('[data-slot="card"]') as HTMLElement | null;
        const header = rendered.container.querySelector('[data-slot="item-header"]') as HTMLElement | null;
        const noteButton = rendered.container.querySelector('[data-slot="notification-target-note"]') as HTMLButtonElement | null;

        expect(text).toContain('Alice respondió a tu nota');
        expect(text).not.toContain('esta es la respuesta');
        expect(card).toBeNull();
        expect(header?.className).toContain('items-center');
        expect(noteButton?.textContent).toBe('nota');

        await act(async () => {
            noteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenThread).toHaveBeenCalledWith(targetEventId);
    });

    test('renders an inline nota button in reply titles', async () => {
        const actor = '1'.repeat(64);
        const targetEventId = 'b'.repeat(64);
        const onOpenThread = vi.fn();

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({
                        id: 'reply-1',
                        kind: 1,
                        actorPubkey: actor,
                        targetEventId,
                        content: 'esta es la respuesta',
                        rawEvent: {
                            id: 'reply-1',
                            pubkey: actor,
                            kind: 1,
                            created_at: 100,
                            tags: [['p', 'c'.repeat(64)], ['e', targetEventId, '', 'reply']],
                            content: 'esta es la respuesta',
                        },
                    }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{ [actor]: buildProfile(actor, 'Alice') }}
                eventReferencesById={{}}
                onOpenThread={onOpenThread}
            />,
        );
        mounted.push(rendered);

        const title = rendered.container.querySelector('[data-slot="item-title"]') as HTMLElement | null;
        const noteButton = rendered.container.querySelector('[data-slot="notification-target-note"]') as HTMLButtonElement | null;

        expect(title?.textContent || '').toContain('nota');
        expect(noteButton?.textContent).toBe('nota');
    });

    test('renders referenced user note preview outside the primary item content row', async () => {
        const actor = '1'.repeat(64);
        const targetAuthor = '2'.repeat(64);
        const targetEventId = 'b'.repeat(64);
        const onOpenThread = vi.fn();

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({
                        id: 'reaction-1',
                        kind: 7,
                        actorPubkey: actor,
                        targetEventId,
                        content: '❤️',
                        rawEvent: {
                            id: 'reaction-1',
                            pubkey: actor,
                            kind: 7,
                            created_at: 100,
                            tags: [['p', 'c'.repeat(64)], ['e', targetEventId]],
                            content: '❤️',
                        },
                    }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{
                    [actor]: buildProfile(actor, 'Alice'),
                    [targetAuthor]: buildProfile(targetAuthor, 'Nora'),
                }}
                eventReferencesById={{ [targetEventId]: buildEvent(targetEventId, targetAuthor, 'mi nota referenciada', 80) }}
                onOpenThread={onOpenThread}
            />,
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        const card = rendered.container.querySelector('[data-slot="card"]') as HTMLElement | null;
        const itemContent = rendered.container.querySelector('[data-slot="item-content"]') as HTMLElement | null;

        expect(text).toContain('Alice reaccionó con ❤️ a tu nota');
        expect(text).toContain('mi nota referenciada');
        expect(card).not.toBeNull();
        expect(itemContent?.contains(card)).toBe(false);
        expect(rendered.container.querySelector('[data-slot="notification-target-note"]')).not.toBeNull();
    });

    test('centers avatar and title when a notification has no secondary text', async () => {
        const actor = '1'.repeat(64);
        const notification = buildItem({
            id: 'reaction-standalone',
            actorPubkey: actor,
            rawEvent: {
                id: 'reaction-standalone',
                pubkey: actor,
                kind: 7,
                created_at: 100,
                tags: [['p', 'c'.repeat(64)]],
                content: '❤️',
            },
        });
        delete notification.targetEventId;
        delete notification.targetPubkey;

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[notification]}
                recentNotifications={[]}
                profilesByPubkey={{ [actor]: buildProfile(actor, 'Alice') }}
                eventReferencesById={{}}
            />,
        );
        mounted.push(rendered);

        const item = rendered.container.querySelector('[data-slot="item"]') as HTMLDivElement | null;
        const header = rendered.container.querySelector('[data-slot="item-header"]') as HTMLDivElement | null;

        expect(item?.className).toContain('items-center');
        expect(item?.className).not.toContain('items-start');
        expect(header?.className).toContain('items-center');
        expect(rendered.container.querySelector('[data-slot="item-description"]')).toBeNull();
    });

    test('shows target unavailable fallback after a target hydration attempt returns nothing', async () => {
        const onResolveEventReferences = vi.fn(async () => undefined);

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({
                        id: 'reaction-missing-target',
                        targetEventId: 'b'.repeat(64),
                    }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{}}
                eventReferencesById={{}}
                onResolveEventReferences={onResolveEventReferences}
            />,
        );
        mounted.push(rendered);

        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(onResolveEventReferences).toHaveBeenCalledWith(['b'.repeat(64)]);
        expect(rendered.container.textContent || '').toContain('La nota original no está disponible.');
    });

    test('does not request profiles for anonymous zaps and counts anonymous actors separately', async () => {
        const targetOne = 'b'.repeat(64);
        const targetAuthorOne = '4'.repeat(64);
        const onResolveProfiles = vi.fn(async () => {});

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({
                        id: 'zap-anon-1',
                        kind: 9735,
                        actorPubkey: '',
                        createdAt: 120,
                        targetEventId: targetOne,
                        rawEvent: {
                            id: 'zap-anon-1',
                            pubkey: 'f'.repeat(64),
                            kind: 9735,
                            created_at: 120,
                            tags: [['p', 'c'.repeat(64)], ['e', targetOne], ['amount', '21000']],
                            content: 'zap-anon-1',
                        },
                    }),
                    buildItem({
                        id: 'zap-anon-2',
                        kind: 9735,
                        actorPubkey: '',
                        createdAt: 125,
                        targetEventId: targetOne,
                        rawEvent: {
                            id: 'zap-anon-2',
                            pubkey: 'e'.repeat(64),
                            kind: 9735,
                            created_at: 125,
                            tags: [['p', 'c'.repeat(64)], ['e', targetOne], ['amount', '42000']],
                            content: 'zap-anon-2',
                        },
                    }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{
                    [targetAuthorOne]: buildProfile(targetAuthorOne, 'Nora'),
                }}
                eventReferencesById={{
                    [targetOne]: buildEvent(targetOne, targetAuthorOne, 'nota target uno', 80),
                }}
                onResolveProfiles={onResolveProfiles}
            />,
        );
        mounted.push(rendered);

        await act(async () => {
            await Promise.resolve();
        });

        const text = rendered.container.textContent || '';
        expect(onResolveProfiles).not.toHaveBeenCalled();
        expect(text).toContain('anónimo y 1 más zapearon tu nota con 63 sats');
    });

    test('renders a single actor avatar with a notification type badge', async () => {
        const actor = '1'.repeat(64);

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({ id: 'repost-1', kind: 16, actorPubkey: actor }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{ [actor]: { ...buildProfile(actor, 'Alice'), picture: 'https://example.com/avatar.png' } }}
                eventReferencesById={{}}
            />,
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-slot="avatar"]')?.getAttribute('data-size')).toBe('lg');
        expect(rendered.container.querySelector('[data-slot="avatar-badge"] svg')).not.toBeNull();
    });

    test('renders grouped actor count avatar with notification type badge', async () => {
        const actorOne = '1'.repeat(64);
        const actorTwo = '2'.repeat(64);
        const targetEventId = 'b'.repeat(64);

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({ id: 'repost-1', kind: 16, actorPubkey: actorOne, targetEventId }),
                    buildItem({ id: 'repost-2', kind: 16, actorPubkey: actorTwo, targetEventId, createdAt: 101 }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{
                    [actorOne]: buildProfile(actorOne, 'Alice'),
                    [actorTwo]: buildProfile(actorTwo, 'Bob'),
                }}
                eventReferencesById={{}}
            />,
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-slot="avatar-image"]')).toBeNull();
        expect(rendered.container.querySelector('[data-slot="avatar-fallback"]')?.textContent).toBe('2');
        expect(rendered.container.querySelector('[data-slot="avatar-badge"] svg')).not.toBeNull();
    });

    test('renders notification timestamp below the title instead of in the title row', async () => {
        const actor = '1'.repeat(64);

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({ id: 'reaction-1', actorPubkey: actor, createdAt: 120 }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{ [actor]: buildProfile(actor, 'Alice') }}
                eventReferencesById={{}}
            />,
        );
        mounted.push(rendered);

        const itemContent = rendered.container.querySelector('[data-slot="item-content"]') as HTMLElement | null;
        const header = itemContent?.querySelector('[data-slot="item-header"]') as HTMLElement | null;
        const title = itemContent?.querySelector('[data-slot="item-title"]') as HTMLElement | null;
        const timestamp = itemContent?.querySelector('time') as HTMLElement | null;

        expect(header).not.toBeNull();
        expect(title).not.toBeNull();
        expect(timestamp).not.toBeNull();
        expect(header?.contains(title)).toBe(true);
        expect(header?.contains(timestamp)).toBe(false);
        expect(title?.compareDocumentPosition(timestamp as Node) || 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    test('renders the reaction itself in the avatar badge for reactions', async () => {
        const actor = '1'.repeat(64);

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({ id: 'reaction-1', actorPubkey: actor, content: '🔥' }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{ [actor]: { ...buildProfile(actor, 'Alice'), picture: 'https://example.com/avatar.png' } }}
                eventReferencesById={{}}
            />,
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-slot="avatar-badge"]')?.textContent).toBe('🔥');
    });

    test('opens the referenced note when clicking the inline nota label', async () => {
        const actor = '1'.repeat(64);
        const targetEventId = 'b'.repeat(64);
        const onOpenThread = vi.fn();

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({ id: 'reaction-1', actorPubkey: actor, targetEventId, content: '❤️' }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{ [actor]: buildProfile(actor, 'Alice') }}
                eventReferencesById={{}}
                onOpenThread={onOpenThread}
            />,
        );
        mounted.push(rendered);

        const noteButton = rendered.container.querySelector('[data-slot="notification-target-note"]') as HTMLButtonElement | null;

        expect(noteButton?.textContent).toBe('nota');

        await act(async () => {
            noteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenThread).toHaveBeenCalledWith(targetEventId);
    });

    test('opens the referenced note when clicking its detached notification preview', async () => {
        const actor = '1'.repeat(64);
        const targetAuthor = '2'.repeat(64);
        const targetEventId = 'b'.repeat(64);
        const onOpenThread = vi.fn();

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({ id: 'reaction-1', actorPubkey: actor, targetEventId }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{
                    [actor]: buildProfile(actor, 'Alice'),
                    [targetAuthor]: buildProfile(targetAuthor, 'Nora'),
                }}
                eventReferencesById={{ [targetEventId]: buildEvent(targetEventId, targetAuthor, 'mi nota referenciada', 80) }}
                onOpenThread={onOpenThread}
            />,
        );
        mounted.push(rendered);

        const rowButton = rendered.container.querySelector('[data-slot="notification-open-target"]') as HTMLDivElement | null;
        expect(rowButton).not.toBeNull();
        expect(rowButton?.getAttribute('role')).toBeNull();
        expect(rowButton?.getAttribute('tabindex')).toBeNull();

        await act(async () => {
            rowButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenThread).toHaveBeenCalledWith(targetEventId);

        onOpenThread.mockClear();
        const keyboardButton = Array.from(rendered.container.querySelectorAll('button'))
            .find((button) => button.textContent === 'Abrir nota') as HTMLButtonElement | undefined;
        expect(keyboardButton).toBeDefined();

        await act(async () => {
            keyboardButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenThread).toHaveBeenCalledWith(targetEventId);
    });

    test('does not open the referenced note when clicking nested interactive preview content', async () => {
        const actor = '1'.repeat(64);
        const targetAuthor = '2'.repeat(64);
        const targetEventId = 'b'.repeat(64);
        const onOpenThread = vi.fn();

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({ id: 'reaction-1', actorPubkey: actor, targetEventId }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{
                    [actor]: buildProfile(actor, 'Alice'),
                    [targetAuthor]: buildProfile(targetAuthor, 'Nora'),
                }}
                eventReferencesById={{ [targetEventId]: buildEvent(targetEventId, targetAuthor, 'mi nota referenciada', 80) }}
                onOpenThread={onOpenThread}
            />,
        );
        mounted.push(rendered);

        const rowButton = rendered.container.querySelector('[data-slot="notification-open-target"]') as HTMLDivElement | null;
        const nestedButton = document.createElement('button');
        rowButton?.appendChild(nestedButton);

        await act(async () => {
            nestedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenThread).not.toHaveBeenCalled();
    });

    test('does not open the referenced note when clicking nested media controls', async () => {
        const actor = '1'.repeat(64);
        const targetAuthor = '2'.repeat(64);
        const targetEventId = 'b'.repeat(64);
        const onOpenThread = vi.fn();

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({ id: 'reaction-1', actorPubkey: actor, targetEventId }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{
                    [actor]: buildProfile(actor, 'Alice'),
                    [targetAuthor]: buildProfile(targetAuthor, 'Nora'),
                }}
                eventReferencesById={{ [targetEventId]: buildEvent(targetEventId, targetAuthor, 'mi nota referenciada', 80) }}
                onOpenThread={onOpenThread}
            />,
        );
        mounted.push(rendered);

        const rowButton = rendered.container.querySelector('[data-slot="notification-open-target"]') as HTMLDivElement | null;
        const video = document.createElement('video');
        video.controls = true;
        rowButton?.appendChild(video);

        await act(async () => {
            video.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenThread).not.toHaveBeenCalled();
    });

    test('opens the referenced target note from the inline nota label in a reply notification', async () => {
        const actor = '1'.repeat(64);
        const targetEventId = 'b'.repeat(64);
        const onOpenThread = vi.fn();

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({
                        id: 'reply-1',
                        kind: 1,
                        actorPubkey: actor,
                        targetEventId,
                        content: 'esta es la respuesta',
                        rawEvent: {
                            id: 'reply-1',
                            pubkey: actor,
                            kind: 1,
                            created_at: 100,
                            tags: [['p', 'c'.repeat(64)], ['e', targetEventId, '', 'reply']],
                            content: 'esta es la respuesta',
                        },
                    }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{ [actor]: buildProfile(actor, 'Alice') }}
                eventReferencesById={{}}
                onOpenThread={onOpenThread}
            />,
        );
        mounted.push(rendered);

        const noteButton = rendered.container.querySelector('[data-slot="notification-target-note"]') as HTMLButtonElement | null;
        expect(noteButton?.textContent).toBe('nota');
        expect(rendered.container.querySelector('[data-slot="card"]')).toBeNull();

        await act(async () => {
            noteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenThread).toHaveBeenCalledWith(targetEventId);
    });

    test('opens the referenced target note from the inline nota label in a mention notification', async () => {
        const actor = '1'.repeat(64);
        const targetEventId = 'b'.repeat(64);
        const onOpenThread = vi.fn();

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({
                        id: 'mention-1',
                        kind: 1,
                        actorPubkey: actor,
                        targetEventId,
                        content: 'te menciono en esta nota',
                        rawEvent: {
                            id: 'mention-1',
                            pubkey: actor,
                            kind: 1,
                            created_at: 100,
                            tags: [['p', 'c'.repeat(64)], ['e', targetEventId]],
                            content: 'te menciono en esta nota',
                        },
                    }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{ [actor]: buildProfile(actor, 'Alice') }}
                eventReferencesById={{}}
                onOpenThread={onOpenThread}
            />,
        );
        mounted.push(rendered);

        const noteButton = rendered.container.querySelector('[data-slot="notification-target-note"]') as HTMLButtonElement | null;
        expect(noteButton?.textContent).toBe('nota');
        expect(rendered.container.querySelector('[data-slot="card"]')).toBeNull();

        await act(async () => {
            noteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenThread).toHaveBeenCalledWith(targetEventId);
    });

    test('opens the actor profile when clicking the visible actor name', async () => {
        const actor = '1'.repeat(64);
        const onOpenProfile = vi.fn();
        const onOpenThread = vi.fn();

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({ id: 'reaction-1', actorPubkey: actor }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{ [actor]: buildProfile(actor, 'Alice') }}
                eventReferencesById={{}}
                onOpenProfile={onOpenProfile}
                onOpenThread={onOpenThread}
            />,
        );
        mounted.push(rendered);

        const actorButton = Array.from(rendered.container.querySelectorAll('button')).find((button) => button.textContent === 'Alice') as HTMLButtonElement | undefined;
        expect(actorButton).toBeDefined();

        await act(async () => {
            actorButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenProfile).toHaveBeenCalledWith(actor);
        expect(onOpenThread).not.toHaveBeenCalled();
    });

    test('renders actor names and x mas as inline title text without flex spacing', async () => {
        const targetEventId = 'b'.repeat(64);
        const actorOne = '1'.repeat(64);
        const actorTwo = '2'.repeat(64);

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({ id: 'reaction-1', actorPubkey: actorOne, targetEventId, content: '❤️' }),
                    buildItem({ id: 'reaction-2', actorPubkey: actorTwo, targetEventId, content: '❤️', createdAt: 101 }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{
                    [actorOne]: buildProfile(actorOne, 'Alice'),
                    [actorTwo]: buildProfile(actorTwo, 'Bob'),
                }}
                eventReferencesById={{}}
                onOpenProfile={vi.fn()}
            />,
        );
        mounted.push(rendered);

        const title = rendered.container.querySelector('[data-slot="item-title"]') as HTMLDivElement | null;
        const actorButton = rendered.container.querySelector('[data-slot="notification-actor"]') as HTMLButtonElement | null;
        const moreButton = rendered.container.querySelector('[data-slot="notification-more-actors"]') as HTMLButtonElement | null;

        expect(title?.className).toContain('inline-block');
        expect(title?.className).not.toContain('flex');
        expect(title?.className).not.toContain('gap-2');
        expect(actorButton?.className).toContain('text-current');
        expect(moreButton?.className).toContain('text-current');
    });

    test('shows a scrollable menu with all actors when clicking x mas', async () => {
        const targetEventId = 'b'.repeat(64);
        const actorOne = '1'.repeat(64);
        const actorTwo = '2'.repeat(64);
        const onOpenProfile = vi.fn();

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({ id: 'reaction-1', actorPubkey: actorOne, targetEventId, content: '❤️' }),
                    buildItem({ id: 'reaction-2', actorPubkey: actorTwo, targetEventId, content: '❤️', createdAt: 101 }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{
                    [actorOne]: buildProfile(actorOne, 'Alice'),
                    [actorTwo]: buildProfile(actorTwo, 'Bob'),
                }}
                eventReferencesById={{}}
                onOpenProfile={onOpenProfile}
            />,
        );
        mounted.push(rendered);

        const moreButton = Array.from(rendered.container.querySelectorAll('button')).find((button) => button.textContent === '1 más') as HTMLButtonElement | undefined;
        expect(moreButton).toBeDefined();

        await act(async () => {
            if (typeof PointerEvent === 'function') {
                moreButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
            }
            moreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });

        expect(document.body.textContent || '').toContain('Usuarios implicados');
        expect(document.body.textContent || '').toContain('Alice');
        expect(document.body.textContent || '').toContain('Bob');
        expect(document.body.querySelector('[data-slot="scroll-area"]')).not.toBeNull();
    });

    test('renders english notifications copy when ui language is en', async () => {
        const actor = '1'.repeat(64);
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                newNotifications={[
                    buildItem({
                        id: 'reply-1',
                        kind: 1,
                        actorPubkey: actor,
                        content: 'reply',
                        rawEvent: {
                            id: 'reply-1',
                            pubkey: actor,
                            kind: 1,
                            created_at: 100,
                            tags: [['p', 'c'.repeat(64)], ['e', 'b'.repeat(64), '', 'reply']],
                            content: 'reply',
                        },
                    }),
                ]}
                recentNotifications={[]}
                profilesByPubkey={{ [actor]: buildProfile(actor, 'Alice') }}
                eventReferencesById={{}}
            />,
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Notifications');
        expect(text).toContain('New');
        expect(text).toContain('Alice replied to your note');
    });
});
