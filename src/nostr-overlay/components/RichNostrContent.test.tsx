import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { nip19 } from 'nostr-tools';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { RichNostrContent } from './RichNostrContent';

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

describe('RichNostrContent', () => {
    test('preserves line breaks in short note plaintext', async () => {
        const rendered = await renderElement(<RichNostrContent content={'linea 1\nlinea 2'} />);
        mounted.push(rendered);

        const textContainer = rendered.container.querySelector('.nostr-rich-content-text');

        expect(rendered.container.textContent).toContain('linea 1');
        expect(rendered.container.textContent).toContain('linea 2');
        expect(textContainer?.classList.contains('whitespace-pre-wrap')).toBe(true);
    });

    test('keeps markdown syntax literal for short notes', async () => {
        const rendered = await renderElement(<RichNostrContent content={'# title\n\n**bold**'} />);
        mounted.push(rendered);

        expect(rendered.container.querySelector('h1')).toBeNull();
        expect(rendered.container.querySelector('strong')).toBeNull();
        expect(rendered.container.textContent).toContain('# title');
        expect(rendered.container.textContent).toContain('**bold**');
    });

    test('renders non-media urls as links without duplicating media urls inline', async () => {
        const rendered = await renderElement(<RichNostrContent content={'web https://example.com docs https://example.com/photo.jpg'} />);
        mounted.push(rendered);

        expect(rendered.container.querySelector('a[href="https://example.com"]')?.textContent).toBe('https://example.com');
        expect(rendered.container.querySelector('a[href="https://example.com/photo.jpg"]')).toBeNull();
        expect(rendered.container.querySelector('img[src="https://example.com/photo.jpg"]')).not.toBeNull();
    });

    test('renders english fallbacks and actions when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const onSelectProfile = vi.fn();
        const onSelectEventReference = vi.fn();
        const npub = nip19.npubEncode('a'.repeat(64));
        const note = nip19.noteEncode('b'.repeat(64));

        const rendered = await renderElement(
            <RichNostrContent
                content={`nostr:${npub} nostr:${note}`}
                onSelectProfile={onSelectProfile}
                onSelectEventReference={onSelectEventReference}
            />
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Loading referenced note...');

        const mention = rendered.container.querySelector('.nostr-rich-mention') as HTMLButtonElement | null;
        expect(mention?.getAttribute('aria-label') || '').toContain('Open profile of');
    });
});
