import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { EasterEggDialog } from './EasterEggDialog';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

const mounted: RenderResult[] = [];

function readOverlayStyles(): string {
    return readFileSync(join(process.cwd(), 'src', 'nostr-overlay', 'styles.css'), 'utf8');
}

function getCssRule(styles: string, selector: string): string {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`, 's'));
    return match?.groups?.body ?? '';
}

function getActionStateRule(styles: string): string {
    const match = styles.match(/\.nostr-easter-egg-action:hover,\s*\.nostr-easter-egg-action:focus-visible\s*\{(?<body>[^}]*)\}/s);
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
    mounted.length = 0;
});

async function renderDialog(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    const result = { container, root };
    mounted.push(result);
    return result;
}

describe('EasterEggDialog', () => {
    test('defines a max-width at least as wide as occupant profile dialogs', () => {
        const styles = readOverlayStyles();

        expect(styles).toMatch(/\.nostr-easter-egg-dialog\s*\{[^}]*max-width:\s*min\(1040px,\s*calc\(100vw - 32px\)\)/s);
    });

    test('uses theme tokens for dialog-specific colors', () => {
        const styles = readOverlayStyles();
        const selectors = [
            '.nostr-easter-egg-dialog',
            '.nostr-easter-egg-header h3',
            '.nostr-easter-egg-action',
            '.nostr-easter-egg-pdf',
            '.nostr-easter-egg-text',
        ];

        for (const selector of selectors) {
            const rule = getCssRule(styles, selector);
            expect(rule, selector).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
        }

        expect(getCssRule(styles, '.nostr-easter-egg-dialog')).toContain('var(--background)');
        expect(getCssRule(styles, '.nostr-easter-egg-dialog')).toContain('var(--foreground)');
        expect(getCssRule(styles, '.nostr-easter-egg-action')).toContain('var(--card)');
        expect(getCssRule(styles, '.nostr-easter-egg-text')).toContain('var(--card)');

        const actionStateRule = getActionStateRule(styles);
        expect(actionStateRule, '.nostr-easter-egg-action:hover').not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
        expect(actionStateRule).toContain('var(--muted)');
        expect(actionStateRule).toContain('var(--foreground)');
    });

    test('renders pdf controls and iframe for bitcoin whitepaper', async () => {
        const rendered = await renderDialog(
            <EasterEggDialog
                buildingIndex={1}
                onClose={vi.fn()}
                entry={{
                    id: 'bitcoin_whitepaper',
                    kind: 'pdf',
                    title: 'Bitcoin: A Peer-to-Peer Electronic Cash System',
                    sourceUrl: 'https://bitcoin.org/bitcoin.pdf',
                    pdfPath: '/easter-eggs/bitcoin.pdf',
                    downloadFileName: 'bitcoin.pdf',
                }}
            />
        );

        const iframe = rendered.container.querySelector('iframe.nostr-easter-egg-pdf') as HTMLIFrameElement;
        expect(iframe).toBeDefined();
        expect(iframe.getAttribute('src')).toBe('/easter-eggs/bitcoin.pdf');
        expect(rendered.container.textContent || '').toContain('Descargar PDF');
        expect(rendered.container.textContent || '').toContain('Abrir / Ampliar');
        expect(rendered.container.querySelector('.nostr-easter-egg-source')).toBeNull();
        expect(rendered.container.textContent || '').not.toContain('Fuente: https://bitcoin.org/bitcoin.pdf');
        expect(rendered.container.textContent || '').not.toContain('Edificio #2');
    });

    test('renders plain text for non-pdf entries', async () => {
        const rendered = await renderDialog(
            <EasterEggDialog
                buildingIndex={0}
                onClose={vi.fn()}
                entry={{
                    id: 'crypto_anarchist_manifesto',
                    kind: 'text',
                    title: 'The Crypto Anarchist Manifesto',
                    sourceUrl: 'https://nakamotoinstitute.org/library/crypto-anarchist-manifesto/',
                    text: 'Arise, you have nothing to lose but your barbed wire fences.',
                }}
            />
        );

        const textBlock = rendered.container.querySelector('pre.nostr-easter-egg-text') as HTMLPreElement;
        expect(textBlock).toBeDefined();
        expect(textBlock.textContent || '').toContain('barbed wire fences');
        expect(textBlock.textContent || '').toContain('Fuente: https://nakamotoinstitute.org/library/crypto-anarchist-manifesto/');
        expect(rendered.container.querySelector('.nostr-easter-egg-source')).toBeNull();
        expect(rendered.container.textContent || '').not.toContain('Edificio #1');
    });

    test('renders english chrome and actions when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderDialog(
            <EasterEggDialog
                buildingIndex={0}
                onClose={vi.fn()}
                entry={{
                    id: 'crypto_anarchist_manifesto',
                    kind: 'text',
                    title: 'The Crypto Anarchist Manifesto',
                    sourceUrl: 'https://nakamotoinstitute.org/library/crypto-anarchist-manifesto/',
                    text: 'Arise, you have nothing to lose but your barbed wire fences.',
                }}
            />
        );

        const text = rendered.container.textContent || '';
        const textBlock = rendered.container.querySelector('pre.nostr-easter-egg-text') as HTMLPreElement;
        expect(textBlock.textContent || '').toContain('Source: https://nakamotoinstitute.org/library/crypto-anarchist-manifesto/');
        expect(text).not.toContain('Building #1');
        const closeButton = rendered.container.querySelector('button.absolute.top-2.right-2') as HTMLButtonElement | null;
        expect(closeButton).not.toBeNull();
        expect(closeButton?.className).not.toContain('nostr-dialog-close');
    });
});
