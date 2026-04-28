import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { LONG_FORM_ARTICLE_KIND } from '../../nostr/articles';
import type { SocialFeedItem } from '../../nostr/social-feed-service';
import { ArticlesSurface } from './ArticlesSurface';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

function articleItem(id = 'article-1'): SocialFeedItem {
    return {
        id,
        pubkey: 'a'.repeat(64),
        createdAt: 1710000000,
        content: 'Article body',
        kind: 'article',
        eventKind: LONG_FORM_ARTICLE_KIND,
        rawEvent: {
            id,
            pubkey: 'a'.repeat(64),
            kind: LONG_FORM_ARTICLE_KIND,
            created_at: 1710000000,
            tags: [['title', 'Article title'], ['summary', 'Article summary']],
            content: 'Article body',
        },
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

function surface(overrides: Partial<React.ComponentProps<typeof ArticlesSurface>> = {}) {
    return (
        <ArticlesSurface
            items={[]}
            profilesByPubkey={{}}
            isLoading={false}
            isRefreshing={false}
            isLoadingMore={false}
            error={null}
            hasMore={false}
            onRefresh={vi.fn()}
            onLoadMore={vi.fn()}
            onOpenArticle={vi.fn()}
            {...overrides}
        />
    );
}

describe('ArticlesSurface', () => {
    test('renders loading state', async () => {
        const rendered = await renderElement(surface({ isLoading: true }));
        mounted.push(rendered);

        expect(rendered.container.textContent).toContain('Cargando articulos');
        expect(rendered.container.querySelector('[role="status"]')).not.toBeNull();
    });

    test('renders empty state', async () => {
        const rendered = await renderElement(surface());
        mounted.push(rendered);

        expect(rendered.container.textContent).toContain('Sin articulos');
        expect(rendered.container.textContent).toContain('Todavia no hay articulos');
    });

    test('renders articles and calls actions', async () => {
        const onRefresh = vi.fn();
        const onOpenArticle = vi.fn();
        const rendered = await renderElement(surface({
            items: [articleItem('article-1')],
            hasMore: true,
            onRefresh,
            onOpenArticle,
        }));
        mounted.push(rendered);

        expect(rendered.container.textContent).toContain('Article title');

        const buttons = Array.from(rendered.container.querySelectorAll('button'));
        const refresh = buttons.find((button) => button.textContent === 'Actualizar');
        const read = buttons.find((button) => button.textContent === 'Leer articulo');

        await act(async () => {
            refresh?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            read?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onRefresh).toHaveBeenCalledTimes(1);
        expect(onOpenArticle).toHaveBeenCalledWith('article-1');
        expect(buttons.find((button) => button.textContent === 'Cargar mas')).toBeUndefined();
    });

    test('constrains the article list width for readable article previews', async () => {
        const rendered = await renderElement(surface({
            items: [articleItem('article-1')],
        }));
        mounted.push(rendered);

        const articleList = rendered.container.querySelector('[data-testid="articles-list"]');
        expect(articleList).not.toBeNull();
        expect(articleList?.className).toContain('max-w-[600px]');
        expect(articleList?.className).toContain('w-full');
    });

    test('loads more articles when scrolling near the bottom', async () => {
        const onLoadMore = vi.fn();
        const rendered = await renderElement(surface({
            items: [articleItem('article-1')],
            hasMore: true,
            onLoadMore,
        }));
        mounted.push(rendered);

        const scrollArea = rendered.container.querySelector('[data-testid="articles-scroll-area"]') as HTMLDivElement | null;
        expect(scrollArea).not.toBeNull();

        Object.defineProperty(scrollArea, 'clientHeight', { configurable: true, value: 200 });
        Object.defineProperty(scrollArea, 'scrollHeight', { configurable: true, value: 500 });
        Object.defineProperty(scrollArea, 'scrollTop', { configurable: true, value: 260 });

        await act(async () => {
            scrollArea?.dispatchEvent(new Event('scroll', { bubbles: true }));
        });

        expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    test('renders centered loading-more footer for paginated article loads', async () => {
        const rendered = await renderElement(surface({
            items: [articleItem('article-1')],
            hasMore: true,
            isLoadingMore: true,
        }));
        mounted.push(rendered);

        const footer = rendered.container.querySelector('.nostr-list-loading-footer');
        expect(footer?.textContent).toContain('Cargando articulos');
        expect(footer?.className).toContain('justify-center');
    });
});
