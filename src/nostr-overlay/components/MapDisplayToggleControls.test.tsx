import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { MapDisplayToggleControls } from './MapDisplayToggleControls';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(
            <MapDisplayToggleControls
                carsEnabled
                streetLabelsEnabled
                specialMarkersEnabled
                onCarsEnabledChange={vi.fn()}
                onStreetLabelsEnabledChange={vi.fn()}
                onSpecialMarkersEnabledChange={vi.fn()}
            />
        );
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

describe('MapDisplayToggleControls', () => {
    test('renders english toggle labels when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement();
        mounted.push(rendered);

        expect(rendered.container.querySelector('[aria-label="Map display controls"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Toggle map cars"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[title="Cars"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Toggle street labels"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Toggle special icons"]')).not.toBeNull();
    });

    test('separates toggle group items with shadcn spacing', async () => {
        const rendered = await renderElement();
        mounted.push(rendered);

        const toggleGroup = rendered.container.querySelector('[data-slot="toggle-group"]');

        expect(toggleGroup?.getAttribute('data-spacing')).toBe('1');
    });

    test('uses primary theme tokens for active layer toggles', () => {
        const styles = readOverlayStyles();

        const activeRule = getCssRule(styles, '.nostr-map-display-toggle-button[data-state="on"]');

        expect(activeRule).toContain('background: var(--primary)');
        expect(activeRule).toContain('color: var(--primary-foreground)');
    });

    test('does not override layer toggle states with dark-mode color rules', () => {
        const styles = readOverlayStyles();

        expect(styles).not.toMatch(/\.dark \.nostr-map-display-toggle-button(?:\[data-state="on"\])?\s*\{/);
    });
});
