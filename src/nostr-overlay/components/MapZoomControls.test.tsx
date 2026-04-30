import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
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
        root.render(<MapZoomControls mapBridge={null} {...props} />);
    });

    return { container, root } satisfies RenderResult;
}

let mounted: RenderResult[] = [];

function readOverlayStyles(): string {
    return readFileSync(join(process.cwd(), 'src', 'nostr-overlay', 'styles.css'), 'utf8');
}

function readMapStyles(): string {
    return readFileSync(join(process.cwd(), 'src', 'html', 'style.css'), 'utf8');
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
        expect(rendered.container.querySelector('button[aria-label="Regenerate map"]')).toBeNull();
    });

    test('does not render the map theme toggle because theme lives in map options', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement();
        mounted.push(rendered);

        expect(rendered.container.querySelector('[aria-label="Theme"]')).toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Select light theme"]')).toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Select dark theme"]')).toBeNull();
    });

    test('keeps all theme controls out of the zoom control group', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const rendered = await renderElement();
        mounted.push(rendered);

        expect(rendered.container.querySelector('button[aria-label="Select light theme"]')).toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Select dark theme"]')).toBeNull();
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

    test('keeps map canvas touch gestures under application control', () => {
        const styles = readMapStyles();
        const canvasRule = getCssRule(styles, '#map-canvas');

        expect(canvasRule).toContain('touch-action: none');
    });

    test('hides zoom controls on mobile', () => {
        const styles = readOverlayStyles();

        expect(styles).toMatch(/@media\s*\(max-width:\s*767px\)[\s\S]*\.nostr-map-zoom-group\s*\{[\s\S]*display:\s*none/);
    });
});
