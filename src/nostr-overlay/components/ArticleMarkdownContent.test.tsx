import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { LONG_FORM_ARTICLE_KIND } from '../../nostr/articles';
import type { NostrEvent } from '../../nostr/types';
import { ArticleMarkdownContent } from './ArticleMarkdownContent';

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
            ['title', 'Markdown article'],
            ['image', 'https://example.com/cover.jpg'],
        ],
        content: input.content ?? '# Heading\n\nThis is **bold**.\n\n---\n\n## Section heading\n\nFirst paragraph.\n\nSecond paragraph.\n\n- List item\n\n  List item detail\n\n<script>alert(1)</script>',
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

describe('ArticleMarkdownContent', () => {
    test('renders article metadata and markdown formatting', async () => {
        const rendered = await renderElement(<ArticleMarkdownContent event={article()} />);
        mounted.push(rendered);

        const articleNode = rendered.container.querySelector('article');
        expect(articleNode?.className).toContain('[font-family:');
        expect(articleNode?.className).toContain('Noto_Serif');
        const bodyNode = rendered.container.querySelector('[data-testid="article-markdown-body"]');
        expect(bodyNode?.className).toContain('font-normal');
        expect(bodyNode?.className).toContain('prose-p:font-normal');
        expect(bodyNode?.className).toContain('prose-h1:mt-10');
        expect(bodyNode?.className).toContain('prose-h2:mt-12');
        expect(bodyNode?.className).toContain('prose-hr:my-10');
        expect(bodyNode?.className).toContain('prose-p:my-5');
        expect(bodyNode?.className).toContain('prose-ul:my-6');
        expect(Array.from(rendered.container.querySelectorAll('h1')).some((heading) => heading.textContent === 'Heading')).toBe(true);
        expect(rendered.container.querySelector('h2')?.className).toContain('mb-6');
        expect(rendered.container.querySelector('h2')?.className).toContain('text-3xl');
        expect(rendered.container.querySelector('hr')?.className).toContain('my-12');
        expect(bodyNode?.querySelector('p')?.className).toContain('my-4');
        expect(bodyNode?.querySelector('ul')?.className).toContain('my-5');
        expect(bodyNode?.querySelector('li')?.className).toContain('my-2');
        expect(bodyNode?.querySelector('li p')).toBeNull();
        expect(rendered.container.querySelector('strong')?.textContent).toBe('bold');
        expect(rendered.container.querySelector('img')?.getAttribute('alt')).toBe('Imagen del artículo Markdown article');
    });

    test('does not insert raw script nodes from article content', async () => {
        const rendered = await renderElement(<ArticleMarkdownContent event={article()} />);
        mounted.push(rendered);

        expect(rendered.container.querySelector('script')).toBeNull();
        expect(rendered.container.innerHTML).not.toContain('<script>');
    });
});
