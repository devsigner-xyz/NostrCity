import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { ListLoadingFooter } from './ListLoadingFooter';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(element: React.ReactElement): Promise<RenderResult> {
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

describe('ListLoadingFooter', () => {
    test('renders english default label when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(<ListLoadingFooter loading />);
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Loading more...');
    });

    test('merges caller layout classes with the default centered footer layout', async () => {
        const rendered = await renderElement(<ListLoadingFooter loading className="max-w-[600px] justify-self-start" />);
        mounted.push(rendered);

        const footer = rendered.container.querySelector('.nostr-list-loading-footer');
        expect(footer?.className).toContain('w-full');
        expect(footer?.className).toContain('justify-center');
        expect(footer?.className).toContain('max-w-[600px]');
        expect(footer?.className).toContain('justify-self-start');
    });
});
