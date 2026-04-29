import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { DiscoverPage } from './DiscoverPage';

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

describe('DiscoverPage', () => {
    test('renders english discover copy when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(<DiscoverPage discoveredIds={[]} />);
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Discover');
        expect(text).toContain('You have discovered 0 of');
        expect(text).toContain('Pending');
        expect(rendered.container.querySelectorAll('[data-testid="discover-mission-card"]')).toHaveLength(3);
    });

    test('renders each mission as a title and subtitle pair', async () => {
        const rendered = await renderElement(<DiscoverPage discoveredIds={[]} />);
        mounted.push(rendered);

        const firstMission = rendered.container.querySelector('[data-testid="discover-mission-card"]') as HTMLElement | null;
        expect(firstMission).not.toBeNull();
        const title = firstMission?.querySelector('[data-testid="discover-mission-title"]') as HTMLElement | null;
        const subtitle = firstMission?.querySelector('[data-testid="discover-mission-subtitle"]') as HTMLElement | null;

        expect(title).not.toBeNull();
        expect(subtitle).not.toBeNull();
        expect(title?.textContent || '').toContain('Encuentra Bitcoin whitepaper');
        expect(subtitle?.textContent || '').toContain('Bitcoin: A Peer-to-Peer Electronic Cash System');
    });

    test('renders found easter egg badges with the success variant', async () => {
        const rendered = await renderElement(<DiscoverPage discoveredIds={['bitcoin_whitepaper']} />);
        mounted.push(rendered);

        const foundBadge = Array.from(rendered.container.querySelectorAll('[data-slot="badge"]')).find((badge) =>
            (badge.textContent || '').includes('Encontrado')
        );

        expect(foundBadge).toBeDefined();
        expect(foundBadge?.getAttribute('data-variant')).toBe('success');
    });
});
