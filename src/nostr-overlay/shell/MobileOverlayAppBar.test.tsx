import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { Sidebar, SidebarContent, SidebarProvider } from '@/components/ui/sidebar';
import { I18nProvider } from '@/i18n/I18nProvider';
import { MobileOverlayAppBar } from './MobileOverlayAppBar';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
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

async function renderAppBar({
    title = 'Nostr City',
    showBack = false,
    onBack = vi.fn<() => void>(),
    includeSidebar = false,
}: {
    title?: string;
    showBack?: boolean;
    onBack?: ReturnType<typeof vi.fn<() => void>>;
    includeSidebar?: boolean;
} = {}): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(
            <I18nProvider initialLocale="es">
                <SidebarProvider>
                    <MobileOverlayAppBar title={title} showBack={showBack} onBack={onBack} />
                    {includeSidebar ? (
                        <Sidebar mobileTitle="Navegación de Nostr City" mobileDescription="Accesos principales">
                            <SidebarContent>Contenido del sidebar móvil</SidebarContent>
                        </Sidebar>
                    ) : null}
                </SidebarProvider>
            </I18nProvider>
        );
    });

    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    return { container, root };
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
    document.body.replaceChildren();
});

describe('MobileOverlayAppBar', () => {
    test('renders Nostr City with a left menu button and no logo when back is hidden', async () => {
        setMobileViewport();
        const rendered = await renderAppBar({ showBack: false });
        mounted.push(rendered);

        const appBar = rendered.container.querySelector('[data-testid="mobile-overlay-app-bar"]');
        const logo = rendered.container.querySelector('[data-testid="mobile-overlay-app-bar-logo"]') as HTMLImageElement | null;
        const title = rendered.container.querySelector('.nostr-mobile-app-bar-title');
        const menuButton = rendered.container.querySelector('button[aria-label="Abrir navegación"]');

        expect(appBar).not.toBeNull();
        expect(appBar?.getAttribute('aria-label')).toBe('Navegación principal');
        expect(appBar?.textContent || '').toContain('Nostr City');
        expect(appBar?.classList.contains('nostr-mobile-app-bar-home')).toBe(true);
        expect(logo).toBeNull();
        expect(title?.classList.contains('nostr-mobile-app-bar-title-center')).toBe(true);
        expect(menuButton).not.toBeNull();
        expect(appBar?.firstElementChild).toBe(menuButton);
        expect(rendered.container.querySelector('button[aria-label="Volver"]')).toBeNull();
    });

    test('renders a back button and route title when back is shown', async () => {
        setMobileViewport();
        const rendered = await renderAppBar({ title: 'Agora', showBack: true });
        mounted.push(rendered);

        expect(rendered.container.querySelector('button[aria-label="Volver"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="mobile-overlay-app-bar-logo"]')).toBeNull();
        expect(rendered.container.querySelector('[data-testid="mobile-overlay-app-bar"]')?.classList.contains('nostr-mobile-app-bar-home')).toBe(false);
        expect(rendered.container.textContent || '').toContain('Agora');
    });

    test('calls onBack when the back button is pressed', async () => {
        setMobileViewport();
        const onBack = vi.fn();
        const rendered = await renderAppBar({ title: 'Agora', showBack: true, onBack });
        mounted.push(rendered);

        const backButton = rendered.container.querySelector('button[aria-label="Volver"]') as HTMLButtonElement;
        await act(async () => {
            backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onBack).toHaveBeenCalledTimes(1);
    });

    test('opens the mobile sidebar from the menu button', async () => {
        setMobileViewport();
        const rendered = await renderAppBar({ includeSidebar: true });
        mounted.push(rendered);

        expect(document.body.textContent || '').not.toContain('Contenido del sidebar móvil');

        const menuButton = rendered.container.querySelector('button[aria-label="Abrir navegación"]') as HTMLButtonElement;
        await act(async () => {
            menuButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(document.body.textContent || '').toContain('Contenido del sidebar móvil');
        expect(document.body.textContent || '').toContain('Navegación de Nostr City');
        expect(document.body.textContent || '').toContain('Accesos principales');
    });

    test('does not render on desktop', async () => {
        setDesktopViewport();
        const rendered = await renderAppBar();
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-testid="mobile-overlay-app-bar"]')).toBeNull();
    });

});
