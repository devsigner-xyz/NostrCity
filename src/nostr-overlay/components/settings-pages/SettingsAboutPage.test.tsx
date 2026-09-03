import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { SettingsAboutPage } from './SettingsAboutPage';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderPage(): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(<SettingsAboutPage />);
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
});

describe('SettingsAboutPage', () => {
    test('includes attribution to the original MapGenerator repository', async () => {
        const rendered = await renderPage();
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        const link = rendered.container.querySelector('[data-testid="mapgenerator-attribution-link"]') as HTMLAnchorElement | null;

        expect(content).toContain('Atribución');
        expect(content).toContain('MapGenerator');
        expect(link).not.toBeNull();
        expect(link?.textContent || '').toContain('ProbableTrain/MapGenerator');
        expect(link?.getAttribute('href')).toBe('https://github.com/ProbableTrain/MapGenerator');
        expect(link?.getAttribute('target')).toBe('_blank');
        expect(link?.getAttribute('rel')).toBe('noreferrer');
    });
});
