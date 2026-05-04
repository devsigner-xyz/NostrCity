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
        expect(rendered.container.querySelector('.articles-loading-state')?.className).toContain('min-h-[50vh]');
        expect(rendered.container.querySelector('.articles-loading-state')?.className).not.toContain('self-start');
    });

    test('renders empty state', async () => {
        const rendered = await renderElement(surface());
        mounted.push(rendered);

        expect(rendered.container.textContent).toContain('Sin artículos');
        expect(rendered.container.textContent).toContain('Todavía no hay artículos');

        const empty = rendered.container.querySelector('[data-testid="articles-empty-state"]');
        const page = rendered.container.querySelector('.nostr-articles-page');
        expect(empty).not.toBeNull();
        expect(page?.className).toContain('nostr-articles-page-empty-state');
        expect(empty?.className).toContain('min-h-[50vh]');
        expect(empty?.className).toContain('max-w-none');
        expect(empty?.className).toContain('justify-self-stretch');
    });

    test('mobile empty state exposes only one visible refresh action and uses the empty-state CTA', async () => {
        const onRefresh = vi.fn();
        const rendered = await renderElement(surface({
            isMobile: true,
            onRefresh,
        }));
        mounted.push(rendered);

        const refreshButtons = Array.from(rendered.container.querySelectorAll('button')).filter((button) =>
            (button.textContent || '').trim() === 'Actualizar'
        ) as HTMLButtonElement[];

        expect(refreshButtons).toHaveLength(1);
        expect(refreshButtons[0]?.className).not.toContain('sr-only');

        await act(async () => {
            refreshButtons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onRefresh).toHaveBeenCalledTimes(1);
        expect(refreshButtons[0]?.querySelector('svg[data-icon="inline-start"]')).not.toBeNull();
    });

    test('empty state refresh action shows spinner while refreshing', async () => {
        const rendered = await renderElement(surface({
            isMobile: true,
            isRefreshing: true,
        }));
        mounted.push(rendered);

        const refreshButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Actualizando'
        );

        expect(refreshButton).toBeDefined();
        expect(refreshButton?.querySelector('[role="status"]')).not.toBeNull();
    });

    test('renders articles and calls actions', async () => {
        const onRefresh = vi.fn();
        const onOpenArticle = vi.fn();
        const onOpenAuthor = vi.fn();
        const rendered = await renderElement(surface({
            items: [articleItem('article-1')],
            profilesByPubkey: { ['a'.repeat(64)]: { pubkey: 'a'.repeat(64), name: 'Alice' } },
            hasMore: true,
            onRefresh,
            onOpenArticle,
            onOpenAuthor,
        }));
        mounted.push(rendered);

        expect(rendered.container.textContent).toContain('Article title');

        const buttons = Array.from(rendered.container.querySelectorAll('button'));
        const refresh = buttons.find((button) => button.textContent === 'Actualizar');
        const read = buttons.find((button) => button.textContent === 'Leer artículo');
        const author = buttons.find((button) => button.getAttribute('aria-label') === 'Abrir perfil de Alice');

        await act(async () => {
            refresh?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            read?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            author?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onRefresh).toHaveBeenCalledTimes(1);
        expect(onOpenArticle).toHaveBeenCalledWith('article-1');
        expect(onOpenAuthor).toHaveBeenCalledWith('a'.repeat(64));
        expect(buttons.find((button) => button.textContent === 'Cargar mas')).toBeUndefined();
    });

    test('renders article category multi-select combobox and applies selection only when searching', async () => {
        const onSelectedHashtagsChange = vi.fn();
        const onClearHashtag = vi.fn();
        const rendered = await renderElement(surface({
            items: [articleItem('article-1')],
            activeHashtags: ['nostr'],
            onSelectedHashtagsChange,
            onClearHashtag,
        }));
        mounted.push(rendered);

        expect(rendered.container.textContent).toContain('Lecturas largas etiquetadas con #nostr');
        expect(rendered.container.textContent).not.toContain('Seleccionar categorías de artículos');
        expect(rendered.container.querySelector('[aria-label="Filtros de categoría de artículos"]')).toBeNull();
        expect(rendered.container.querySelector('[data-testid="articles-category-select"]')).toBeNull();
        expect(rendered.container.querySelector('[data-slot="dropdown-menu-trigger"]')).toBeNull();

        const chips = rendered.container.querySelector('[data-slot="combobox-chips"]');
        const input = rendered.container.querySelector('[data-slot="combobox-chip-input"]') as HTMLInputElement | null;
        const buttons = Array.from(rendered.container.querySelectorAll('button'));
        const searchFilter = buttons.find((button) => button.textContent === 'Buscar');
        const clearSelection = buttons.find((button) => button.textContent === 'Limpiar');

        expect(chips?.className).toContain('max-w-xs');
        expect(chips?.textContent).toContain('nostr');
        expect(input?.getAttribute('aria-label')).toBe('Seleccionar categorías de artículos');
        expect(searchFilter).toBeDefined();
        expect(clearSelection).toBeDefined();

        await act(async () => {
            input?.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
            input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        });

        const options = Array.from(document.body.querySelectorAll('[data-slot="combobox-item"]'));
        const mapsItem = options.find((item) => (item.textContent || '').includes('maps'));
        const nostrItem = options.find((item) => (item.textContent || '').includes('nostr'));

        expect(mapsItem).toBeDefined();
        expect(nostrItem).toBeDefined();

        await act(async () => {
            mapsItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectedHashtagsChange).not.toHaveBeenCalled();

        await act(async () => {
            searchFilter?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectedHashtagsChange).toHaveBeenCalledWith(['maps', 'nostr']);
        expect(onClearHashtag).not.toHaveBeenCalled();

        onSelectedHashtagsChange.mockClear();

        await act(async () => {
            clearSelection?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectedHashtagsChange).toHaveBeenCalledWith([]);
        expect((clearSelection as HTMLButtonElement | undefined)?.disabled).toBe(true);
    });

    test('disables article category clear action when no categories are selected', async () => {
        const rendered = await renderElement(surface({
            items: [articleItem('article-1')],
            onSelectedHashtagsChange: vi.fn(),
        }));
        mounted.push(rendered);

        const clearSelection = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            button.textContent === 'Limpiar'
        ) as HTMLButtonElement | undefined;

        expect(clearSelection).toBeDefined();
        expect(clearSelection?.disabled).toBe(true);
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
        const rendered = await renderElement(surface({
            isMobile: true,
            items: [articleItem('article-1')],
        } as Partial<React.ComponentProps<typeof ArticlesSurface>>));
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
