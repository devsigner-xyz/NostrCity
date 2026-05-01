import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import { I18nProvider } from '@/i18n/I18nProvider';
import { MobileBottomNavigation } from './MobileBottomNavigation';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    onOpenMap: ReturnType<typeof vi.fn<() => void>>;
    onOpenFollowingFeed: ReturnType<typeof vi.fn<() => void>>;
    onOpenPublish: ReturnType<typeof vi.fn<() => void>>;
    onOpenRelays: ReturnType<typeof vi.fn<() => void>>;
    onOpenNotifications: ReturnType<typeof vi.fn<() => void>>;
}

function setMobileViewport(): void {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
}

function setDesktopViewport(): void {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: !query.includes('max-width'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
}

async function renderBottomNavigation({
    activePath = '/',
    canWrite = true,
    canAccessFollowingFeed = true,
    canAccessSocialNotifications = true,
}: {
    activePath?: string;
    canWrite?: boolean;
    canAccessFollowingFeed?: boolean;
    canAccessSocialNotifications?: boolean;
} = {}): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onOpenMap = vi.fn<() => void>();
    const onOpenFollowingFeed = vi.fn<() => void>();
    const onOpenPublish = vi.fn<() => void>();
    const onOpenRelays = vi.fn<() => void>();
    const onOpenNotifications = vi.fn<() => void>();

    await act(async () => {
        root.render(
            <I18nProvider initialLocale="es">
                <SidebarProvider>
                    <MobileBottomNavigation
                        activePath={activePath}
                        canWrite={canWrite}
                        canAccessFollowingFeed={canAccessFollowingFeed}
                        canAccessSocialNotifications={canAccessSocialNotifications}
                        followingFeedHasUnread
                        notificationsHasUnread
                        relaysConnectedCount={3}
                        relaysTotal={5}
                        onOpenMap={onOpenMap}
                        onOpenFollowingFeed={onOpenFollowingFeed}
                        onOpenPublish={onOpenPublish}
                        onOpenRelays={onOpenRelays}
                        onOpenNotifications={onOpenNotifications}
                    />
                </SidebarProvider>
            </I18nProvider>
        );
    });

    return { container, root, onOpenMap, onOpenFollowingFeed, onOpenPublish, onOpenRelays, onOpenNotifications };
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
});

describe('MobileBottomNavigation', () => {
    test('renders the five mobile primary actions in order', async () => {
        setMobileViewport();
        const rendered = await renderBottomNavigation({ activePath: '/agora' });
        mounted.push(rendered);

        const nav = rendered.container.querySelector('[data-testid="mobile-bottom-navigation"]');
        const buttons = Array.from(rendered.container.querySelectorAll('button'));

        expect(nav?.getAttribute('aria-label')).toBe('Navegación inferior');
        expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
            'Abrir mapa',
            'Abrir Ágora',
            'Abrir publicar',
            'Abrir relays',
            'Abrir notificaciones',
        ]);
        expect(buttons[1]?.getAttribute('aria-current')).toBe('page');
        expect(buttons[2]?.getAttribute('aria-current')).toBeNull();
        expect(rendered.container.querySelectorAll('[data-slot="overlay-unread-indicator"]')).toHaveLength(2);
        expect(rendered.container.textContent || '').toContain('3/5');
    });

    test('triggers navigation and publish callbacks', async () => {
        setMobileViewport();
        const rendered = await renderBottomNavigation({ activePath: '/' });
        mounted.push(rendered);

        const publishButton = rendered.container.querySelector('button[aria-label="Abrir publicar"]') as HTMLButtonElement;
        const relaysButton = rendered.container.querySelector('button[aria-label="Abrir relays"]') as HTMLButtonElement;

        await act(async () => {
            publishButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            relaysButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.onOpenPublish).toHaveBeenCalledTimes(1);
        expect(rendered.onOpenRelays).toHaveBeenCalledTimes(1);
    });

    test('does not render outside mobile or exact bottom navigation routes', async () => {
        setMobileViewport();
        const detailRendered = await renderBottomNavigation({ activePath: '/relays/detail' });
        mounted.push(detailRendered);
        expect(detailRendered.container.querySelector('[data-testid="mobile-bottom-navigation"]')).toBeNull();

        setDesktopViewport();
        const desktopRendered = await renderBottomNavigation({ activePath: '/' });
        mounted.push(desktopRendered);
        expect(desktopRendered.container.querySelector('[data-testid="mobile-bottom-navigation"]')).toBeNull();
    });

    test('keeps gated actions visible but disabled', async () => {
        setMobileViewport();
        const rendered = await renderBottomNavigation({
            activePath: '/notifications',
            canWrite: false,
            canAccessFollowingFeed: false,
            canAccessSocialNotifications: false,
        });
        mounted.push(rendered);

        const agoraButton = rendered.container.querySelector('button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        const publishButton = rendered.container.querySelector('button[aria-label="Abrir publicar"]') as HTMLButtonElement;
        const notificationsButton = rendered.container.querySelector('button[aria-label="Abrir notificaciones"]') as HTMLButtonElement;

        expect(agoraButton.disabled).toBe(true);
        expect(publishButton.disabled).toBe(true);
        expect(notificationsButton.disabled).toBe(true);
        expect(publishButton.getAttribute('aria-describedby')).toBeTruthy();
        expect(notificationsButton.getAttribute('aria-describedby')).toBeTruthy();
        expect(rendered.container.textContent || '').toContain('Estás en modo lectura, accede con firma.');
    });
});
