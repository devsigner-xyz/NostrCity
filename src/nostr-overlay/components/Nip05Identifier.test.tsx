import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { Nip05Identifier } from './Nip05Identifier';

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

describe('Nip05Identifier', () => {
    test('renders english verification label when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(
            <Nip05Identifier
                profile={{ pubkey: 'a'.repeat(64), nip05: '_@example.com' }}
                verification={{ status: 'verified', identifier: '_@example.com', resolvedPubkey: 'a'.repeat(64), checkedAt: 1 }}
            />
        );
        mounted.push(rendered);

        const identifier = rendered.container.querySelector('.nostr-nip05-text') as HTMLElement | null;
        expect(identifier?.getAttribute('aria-label')).toBe('NIP-05 verified by DNS: example.com');
        expect(identifier?.textContent).toBe('example.com');
        expect(rendered.container.querySelector('.nostr-nip05-chip')).toBeNull();
        expect(rendered.container.querySelector('.nostr-nip05-check')).toBeNull();
    });
});
