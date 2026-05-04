import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, test, vi, afterEach, beforeAll } from 'vitest';
import { LONG_FORM_ARTICLE_KIND } from '../../nostr/articles';
import type { NostrEvent } from '../../nostr/types';
import { ArticlePreviewCard } from './ArticlePreviewCard';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

function article(input: Partial<NostrEvent> = {}): NostrEvent {
    return {
        id: input.id ?? 'a'.repeat(64),
        pubkey: input.pubkey ?? 'b'.repeat(64),
        kind: input.kind ?? LONG_FORM_ARTICLE_KIND,
        created_at: input.created_at ?? 1710000000,
        tags: input.tags ?? [
            ['title', 'My article'],
            ['summary', 'Short summary'],
            ['image', 'https://example.com/cover.jpg'],
            ['t', 'nostr'],
            ['t', 'maps'],
        ],
        content: input.content ?? 'Article body',
    };
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

const mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted.length = 0;
});

describe('ArticlePreviewCard', () => {
    test('renders article metadata, image and topics', async () => {
        const rendered = await renderElement(<ArticlePreviewCard event={article()} authorLabel="Alice" />);
        mounted.push(rendered);

        expect(rendered.container.textContent).toContain('My article');
        expect(rendered.container.textContent).toContain('Short summary');
        expect(rendered.container.textContent).toContain('Alice');
        expect(rendered.container.textContent).toContain('nostr');
        expect(rendered.container.textContent).toContain('maps');
        expect(rendered.container.querySelector('img')?.getAttribute('alt')).toBe('Imagen del artículo My article');
    });

    test('uses fallback title when title metadata is missing', async () => {
        const rendered = await renderElement(<ArticlePreviewCard event={article({ tags: [] })} />);
        mounted.push(rendered);

        expect(rendered.container.textContent).toContain('Artículo sin título');
    });

    test('opens article from the read action', async () => {
        const onOpenArticle = vi.fn();
        const rendered = await renderElement(<ArticlePreviewCard event={article({ id: 'article-id' })} onOpenArticle={onOpenArticle} />);
        mounted.push(rendered);

        const button = rendered.container.querySelector('button');
        expect(button).not.toBeNull();

        await act(async () => {
            button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenArticle).toHaveBeenCalledWith('article-id');
    });

    test('opens the author profile from the author label', async () => {
        const onOpenAuthor = vi.fn();
        const rendered = await renderElement(<ArticlePreviewCard event={article()} authorLabel="Alice" onOpenAuthor={onOpenAuthor} />);
        mounted.push(rendered);

        const author = rendered.container.querySelector('button[aria-label="Abrir perfil de Alice"]') as HTMLButtonElement | null;
        expect(author).not.toBeNull();

        await act(async () => {
            author?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenAuthor).toHaveBeenCalledWith('b'.repeat(64));
    });
});
