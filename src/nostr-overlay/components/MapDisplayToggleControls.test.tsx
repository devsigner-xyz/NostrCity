import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { MapDisplayToggleControls } from './MapDisplayToggleControls';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(props: Partial<ComponentProps<typeof MapDisplayToggleControls>> = {}) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(
            <MapDisplayToggleControls
                carsEnabled
                streetLabelsEnabled={false}
                specialMarkersEnabled
                onCarsEnabledChange={vi.fn()}
                onStreetLabelsEnabledChange={vi.fn()}
                onSpecialMarkersEnabledChange={vi.fn()}
                onRegenerateMap={vi.fn()}
                theme="light"
                onThemeChange={vi.fn()}
                {...props}
            />
        );
    });

    return { container, root } satisfies RenderResult;
}

let mounted: RenderResult[] = [];

function readOverlayStyles(): string {
    return readFileSync(join(process.cwd(), 'src', 'nostr-overlay', 'styles.css'), 'utf8');
}

async function openMapOptions(button: HTMLButtonElement): Promise<void> {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
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

describe('MapDisplayToggleControls', () => {
    test('renders one english map options menu button', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement();
        mounted.push(rendered);

        const optionsButton = rendered.container.querySelector('button[aria-label="Map options"]') as HTMLButtonElement | null;

        expect(optionsButton).not.toBeNull();
        expect(optionsButton?.getAttribute('title')).toBe('Map options');
        expect(rendered.container.querySelectorAll('.nostr-map-options-button')).toHaveLength(1);
        expect(rendered.container.querySelector('[data-slot="toggle-group"]')).toBeNull();
    });

    test('shows layer options as checked menu items', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const rendered = await renderElement();
        mounted.push(rendered);

        const optionsButton = rendered.container.querySelector('button[aria-label="Map options"]') as HTMLButtonElement;
        await openMapOptions(optionsButton);

        const checkboxItems = Array.from(document.body.querySelectorAll('[role="menuitemcheckbox"]'));

        expect(checkboxItems.map((item) => item.textContent?.trim())).toEqual(['Cars', 'Street labels', 'Special icons']);
        expect(checkboxItems.map((item) => item.getAttribute('aria-checked'))).toEqual(['true', 'false', 'true']);
    });

    test('places the dark mode switch first before a separator and layer options', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const rendered = await renderElement({ theme: 'dark' });
        mounted.push(rendered);

        const optionsButton = rendered.container.querySelector('button[aria-label="Map options"]') as HTMLButtonElement;
        await openMapOptions(optionsButton);

        const menuEntries = Array.from(document.body.querySelectorAll('[data-slot="switch"], [data-slot="dropdown-menu-separator"], [data-slot="dropdown-menu-checkbox-item"]'));

        expect(menuEntries[0]?.getAttribute('data-slot')).toBe('switch');
        expect(menuEntries[0]?.getAttribute('aria-label')).toBe('Dark mode');
        expect(menuEntries[0]?.getAttribute('aria-checked')).toBe('true');
        expect(menuEntries[1]?.getAttribute('data-slot')).toBe('dropdown-menu-separator');
        expect(menuEntries.slice(2, 5).map((item) => item.textContent?.trim())).toEqual(['Cars', 'Street labels', 'Special icons']);
    });

    test('routes the dark mode switch to the theme callback', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const onThemeChange = vi.fn();
        const rendered = await renderElement({ theme: 'light', onThemeChange });
        mounted.push(rendered);

        const optionsButton = rendered.container.querySelector('button[aria-label="Map options"]') as HTMLButtonElement;
        await openMapOptions(optionsButton);
        const darkModeSwitch = document.body.querySelector('[role="switch"][aria-label="Dark mode"]') as HTMLButtonElement;

        await act(async () => {
            darkModeSwitch.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onThemeChange).toHaveBeenCalledWith('dark');
    });

    test('places a separator before the regenerate map menu item', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const rendered = await renderElement();
        mounted.push(rendered);

        const optionsButton = rendered.container.querySelector('button[aria-label="Map options"]') as HTMLButtonElement;
        await openMapOptions(optionsButton);

        const menuEntries = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"], [data-slot="dropdown-menu-separator"], [data-slot="dropdown-menu-item"]'));
        const separatorIndexes = menuEntries.flatMap((entry, index) => entry.getAttribute('data-slot') === 'dropdown-menu-separator' ? [index] : []);
        const regenerateIndex = menuEntries.findIndex((entry) => entry.textContent?.trim() === 'Regenerate map');

        expect(separatorIndexes).toHaveLength(2);
        const actionSeparatorIndex = separatorIndexes[1];
        expect(actionSeparatorIndex).toBeDefined();
        expect(regenerateIndex).toBe((actionSeparatorIndex ?? 0) + 1);
    });

    test('routes the regenerate menu item to the callback', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const onRegenerateMap = vi.fn();
        const rendered = await renderElement({ onRegenerateMap });
        mounted.push(rendered);

        const optionsButton = rendered.container.querySelector('button[aria-label="Map options"]') as HTMLButtonElement;
        await openMapOptions(optionsButton);
        const regenerateItem = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((item) =>
            item.textContent?.trim() === 'Regenerate map'
        ) as HTMLElement;

        await act(async () => {
            regenerateItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onRegenerateMap).toHaveBeenCalledTimes(1);
    });

    test('positions the mobile map options button on the right', () => {
        const styles = readOverlayStyles();

        expect(styles).toMatch(/@media\s*\(max-width:\s*767px\)[\s\S]*\.nostr-map-display-controls[\s\S]*right:\s*max\(12px, env\(safe-area-inset-right\)\)/);
        expect(styles).toMatch(/@media\s*\(max-width:\s*767px\)[\s\S]*\.nostr-map-options-button[\s\S]*min-height:\s*44px/);
    });
});
