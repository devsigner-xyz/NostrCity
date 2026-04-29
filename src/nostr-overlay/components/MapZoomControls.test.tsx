import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { MapZoomControls } from './MapZoomControls';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(props: Partial<ComponentProps<typeof MapZoomControls>> = {}) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(<MapZoomControls mapBridge={null} onRegenerateMap={vi.fn()} theme="light" onThemeChange={vi.fn()} {...props} />);
    });

    return { container, root } satisfies RenderResult;
}

let mounted: RenderResult[] = [];

function readOverlayStyles(): string {
    return readFileSync(join(process.cwd(), 'src', 'nostr-overlay', 'styles.css'), 'utf8');
}

function getCssRule(styles: string, selector: string): string {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`, 's'));
    return match?.groups?.body ?? '';
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

describe('MapZoomControls', () => {
    test('renders english control labels when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement();
        mounted.push(rendered);

        expect(rendered.container.querySelector('[aria-label="Zoom controls"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Zoom out map"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Zoom in map"]')).not.toBeNull();
        const regenerate = rendered.container.querySelector('button[aria-label="Regenerate map"]') as HTMLButtonElement;
        expect(regenerate?.getAttribute('title')).toBe('New map');
    });

    test('renders light and dark theme map controls', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement({ theme: 'dark' });
        mounted.push(rendered);

        expect(rendered.container.querySelector('[aria-label="Theme"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Select light theme"]')).not.toBeNull();
        const darkButton = rendered.container.querySelector('button[aria-label="Select dark theme"]') as HTMLButtonElement;
        expect(darkButton).not.toBeNull();
        expect(darkButton.getAttribute('data-state')).toBe('on');
    });

    test('persists selected quick theme', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const onThemeChange = vi.fn();

        const rendered = await renderElement({ theme: 'light', onThemeChange });
        mounted.push(rendered);

        const darkButton = rendered.container.querySelector('button[aria-label="Select dark theme"]') as HTMLButtonElement;
        await act(async () => {
            darkButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onThemeChange).toHaveBeenCalledWith('dark');
    });

    test('keeps zoom buttons fully rounded inside the button group', () => {
        const styles = readOverlayStyles();

        const buttonRule = getCssRule(styles, '.nostr-map-zoom-button');

        expect(buttonRule).toContain('border-radius: 999px !important');
    });

    test('does not render zoom controls as a segmented shadcn button group', async () => {
        const rendered = await renderElement();
        mounted.push(rendered);

        const zoomGroup = rendered.container.querySelector('.nostr-map-zoom-group');

        expect(zoomGroup?.getAttribute('role')).toBe('group');
        expect(zoomGroup?.getAttribute('data-slot')).not.toBe('button-group');
    });
});
