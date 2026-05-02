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
            tags: [['title', 'Article title'], ['summary', 'Article summary'], ['t', 'nostr'], ['t', 'maps']],
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

        expect(rendered.container.textContent).toContain('Cargando artículos');
        expect(rendered.container.querySelector('[role="status"]')).not.toBeNull();
        expect(rendered.container.querySelector('.articles-loading-state')?.className).toContain('max-w-[600px]');
        expect(rendered.container.querySelector('.articles-loading-state')?.className).toContain('self-start');
    });

    test('renders empty state', async () => {
        const rendered = await renderElement(surface());
        mounted.push(rendered);

        expect(rendered.container.textContent).toContain('Sin artículos');
        expect(rendered.container.textContent).toContain('Todavía no hay artículos');
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
        const read = buttons.find((button) => button.textContent === 'Leer artículo');

        await act(async () => {
            refresh?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            read?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onRefresh).toHaveBeenCalledTimes(1);
        expect(onOpenArticle).toHaveBeenCalledWith('article-1');
        expect(buttons.find((button) => button.textContent === 'Cargar mas')).toBeUndefined();
    });

    test('renders article category filters and calls selection actions', async () => {
        const onSelectHashtag = vi.fn();
        const onClearHashtag = vi.fn();
        const rendered = await renderElement(surface({
            items: [articleItem('article-1')],
            activeHashtag: 'nostr',
            onSelectHashtag,
            onClearHashtag,
        }));
        mounted.push(rendered);

        expect(rendered.container.textContent).toContain('Lecturas largas etiquetadas con #nostr');
        expect(rendered.container.querySelector('[aria-label="Filtros de categoría de artículos"]')).not.toBeNull();

        const buttons = Array.from(rendered.container.querySelectorAll('button'));
        const mapsFilter = buttons.find((button) => button.textContent === 'maps');
        const clearFilter = buttons.find((button) => button.textContent === 'Quitar filtro');

        await act(async () => {
            mapsFilter?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            clearFilter?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectHashtag).toHaveBeenCalledWith('maps');
        expect(onClearHashtag).toHaveBeenCalledTimes(1);
    });

    test('uses the shared overlay page header slots for mobile header rules', async () => {
        const rendered = await renderElement(surface());
        mounted.push(rendered);

        const header = rendered.container.querySelector('[data-testid="overlay-page-header"]');

        expect(header).not.toBeNull();
        expect(header?.querySelector('[data-slot="overlay-page-header-copy"]')).not.toBeNull();
        expect(header?.querySelector('[data-slot="overlay-page-header-actions"] button')?.textContent).toBe('Actualizar');
    });

    test('renders the same list and masonry selector as Agora', async () => {
        const onAgoraFeedLayoutChange = vi.fn();
        const rendered = await renderElement(surface({
            agoraFeedLayout: 'list',
            onAgoraFeedLayoutChange,
        }));
        mounted.push(rendered);

        const buttons = Array.from(rendered.container.querySelectorAll('[data-slot="toggle-group-item"]'));
        const listButton = buttons.find((button) => button.textContent === 'Lista');
        const masonryButton = buttons.find((button) => button.textContent === 'Masonry');

        expect(listButton).toBeDefined();
        expect(masonryButton).toBeDefined();
        expect(listButton?.getAttribute('aria-label')).toBe('Ver Ágora en lista');
        expect(masonryButton?.getAttribute('aria-label')).toBe('Ver Ágora en mosaico');

        await act(async () => {
            masonryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onAgoraFeedLayoutChange).toHaveBeenCalledWith('masonry');
    });

    test('uses the routed surface class so mobile taps reach article actions', async () => {
        const rendered = await renderElement(surface());
        mounted.push(rendered);

        const surfaceElement = rendered.container.querySelector('section');

        expect(surfaceElement?.className).toContain('nostr-routed-surface');
    });

    test('uses the shared routed page layout for header alignment', async () => {
        const rendered = await renderElement(surface());
        mounted.push(rendered);

        const page = rendered.container.querySelector('.nostr-articles-page');

        expect(page).not.toBeNull();
        expect(page?.className).toContain('nostr-routed-surface-panel');
        expect(page?.className).toContain('nostr-page-layout');
    });

    test('keeps refresh keyboard-accessible without showing a distinct mobile header action', async () => {
        const rendered = await renderElement(surface({ isMobile: true } as Partial<React.ComponentProps<typeof ArticlesSurface>>));
        mounted.push(rendered);

        const refreshButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            button.textContent === 'Actualizar'
        );

        expect(refreshButton?.className).toContain('sr-only');
        expect(refreshButton?.className).toContain('focus:not-sr-only');
    });

    test('uses the Agora masonry selector for article previews', async () => {
        const rendered = await renderElement(surface({
            items: [articleItem('article-1')],
            agoraFeedLayout: 'masonry',
        }));
        mounted.push(rendered);

        const articleList = rendered.container.querySelector('[data-testid="articles-list"]');
        const articleShell = rendered.container.querySelector('.nostr-following-feed-note-shell');
        expect(articleList).not.toBeNull();
        expect(articleList?.className).toContain('nostr-following-feed-items');
        expect(articleList?.className).toContain('nostr-following-feed-list-layout-masonry');
        expect(articleShell).not.toBeNull();
        expect(articleShell?.querySelector('[data-slot="card"]')).not.toBeNull();
        expect(articleList?.className).not.toContain('mx-auto');
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
        const articleList = rendered.container.querySelector('[data-testid="articles-list"]');
        expect(footer?.textContent).toContain('Cargando artículos');
        expect(footer?.className).toContain('justify-center');
        expect(footer?.className).toContain('max-w-[600px]');
        expect(articleList?.contains(footer)).toBe(false);
    });
});
