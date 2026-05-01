import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { NostrProfile } from '../../nostr/types';
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { SocialSidebar } from './SocialSidebar';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

const WAIT_TIMEOUT_MS = 8_000;
const WAIT_INTERVAL_MS = 20;

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    await waitFor(() => container.childNodes.length > 0);

    return { container, root };
}

async function waitFor(condition: () => boolean, timeoutMs = WAIT_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (condition()) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
    }

    throw new Error(`Condition was not met in ${timeoutMs}ms`);
}

function makePubkey(index: number): string {
    return index.toString(16).padStart(64, '0');
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

function MobileSidebarProbe() {
    const { isMobile, openMobile, setOpenMobile } = useSidebar();

    return (
        <div>
            <span data-testid="mobile-sidebar-mode">{isMobile ? 'mobile' : 'desktop'}</span>
            <span data-testid="mobile-sidebar-state">{openMobile ? 'open' : 'closed'}</span>
            <button type="button" onClick={() => setOpenMobile(true)}>Open mobile sidebar</button>
        </div>
    );
}

let mounted: RenderResult[] = [];

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
    document.body.replaceChildren();
});

describe('SocialSidebar', () => {
    test('opens following and followers as sidebar items with count badges instead of tabs', async () => {
        const alice = makePubkey(1);
        const bob = makePubkey(2);
        const profiles: Record<string, NostrProfile> = {
            [alice]: { pubkey: alice, displayName: 'Alice' },
        };
        const followerProfiles: Record<string, NostrProfile> = {
            [bob]: { pubkey: bob, displayName: 'Bob' },
        };

        const rendered = await renderElement(
            <SidebarProvider>
                <SocialSidebar
                    follows={[alice]}
                    profiles={profiles}
                    followers={[bob]}
                    followerProfiles={followerProfiles}
                    onSelectFollowing={vi.fn()}
                />
            </SidebarProvider>
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-slot="tabs-list"]')).toBeNull();
        expect(rendered.container.textContent || '').toContain('Seguidos');
        expect(rendered.container.textContent || '').toContain('Seguidores');

        const followingButton = rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]') as HTMLButtonElement;
        const followersButton = rendered.container.querySelector('button[aria-label="Abrir lista de seguidores"]') as HTMLButtonElement;
        expect(followingButton).toBeDefined();
        expect(followersButton).toBeDefined();
        expect(followingButton.closest('[data-slot="sidebar-menu-item"]')?.textContent || '').toContain('1');
        expect(followersButton.closest('[data-slot="sidebar-menu-item"]')?.textContent || '').toContain('1');

        await act(async () => {
            followingButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Alice'));
        expect(document.body.textContent || '').toContain('Seguidos');
        expect(document.body.textContent || '').not.toContain('Bob');

        await act(async () => {
            const closeButton = document.body.querySelector('[data-slot="dialog-close"] button, button.absolute.top-2.right-2') as HTMLButtonElement;
            closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await act(async () => {
            followersButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Bob'));
        expect(document.body.textContent || '').toContain('Seguidores');
    });

    test('opens person details and closes mobile surfaces when selecting a person', async () => {
        setMobileViewport();
        const alice = makePubkey(1);
        const onSelectFollowing = vi.fn();
        const onViewPersonDetails = vi.fn();

        const rendered = await renderElement(
            <SidebarProvider>
                <MobileSidebarProbe />
                <SocialSidebar
                    follows={[alice]}
                    profiles={{ [alice]: { pubkey: alice, displayName: 'Alice' } }}
                    onSelectFollowing={onSelectFollowing}
                    onViewPersonDetails={onViewPersonDetails}
                />
            </SidebarProvider>
        );
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="mobile-sidebar-mode"]')?.textContent === 'mobile');

        const openMobileSidebarButton = rendered.container.querySelector('button') as HTMLButtonElement;
        await act(async () => {
            openMobileSidebarButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await waitFor(() => rendered.container.querySelector('[data-testid="mobile-sidebar-state"]')?.textContent === 'open');

        const followingButton = rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]') as HTMLButtonElement;
        await act(async () => {
            followingButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await waitFor(() => (document.body.textContent || '').includes('Alice'));

        const aliceButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Alice')
        ) as HTMLButtonElement;
        await act(async () => {
            aliceButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectFollowing).not.toHaveBeenCalled();
        expect(onViewPersonDetails).toHaveBeenCalledWith(alice);
        expect(rendered.container.querySelector('[data-testid="mobile-sidebar-state"]')?.textContent).toBe('closed');
        expect(document.body.querySelector('[data-slot="dialog-content"]')).toBeNull();
    });

    test('closes the social list dialog when locating a person from the context menu', async () => {
        const alice = makePubkey(1);
        const onLocateFollowing = vi.fn();
        const onSelectFollowing = vi.fn();
        const onViewPersonDetails = vi.fn();

        const rendered = await renderElement(
            <SidebarProvider>
                <SocialSidebar
                    follows={[alice]}
                    profiles={{ [alice]: { pubkey: alice, displayName: 'Alice' } }}
                    onLocateFollowing={onLocateFollowing}
                    onSelectFollowing={onSelectFollowing}
                    onViewPersonDetails={onViewPersonDetails}
                />
            </SidebarProvider>
        );
        mounted.push(rendered);

        const followingButton = rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]') as HTMLButtonElement;
        await act(async () => {
            followingButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await waitFor(() => (document.body.textContent || '').includes('Alice'));

        const actionsButton = document.body.querySelector(`[data-testid="person-actions-${alice}"]`) as HTMLButtonElement;
        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Ubicar en el mapa'));
        const locateItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Ubicar en el mapa'
        ) as HTMLElement;
        await act(async () => {
            locateItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onLocateFollowing).toHaveBeenCalledWith(alice);
        expect(onSelectFollowing).not.toHaveBeenCalled();
        expect(onViewPersonDetails).not.toHaveBeenCalled();
        expect(document.body.querySelector('[data-slot="dialog-content"]')).toBeNull();
    });
});
