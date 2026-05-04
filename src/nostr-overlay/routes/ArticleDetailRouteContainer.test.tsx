import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { LONG_FORM_ARTICLE_KIND } from '../../nostr/articles';
import type { SocialFeedItem, SocialFeedService } from '../../nostr/social-feed-service';
import type { NostrEvent } from '../../nostr/types';
import { ArticleDetailRouteContainer } from './ArticleDetailRouteContainer';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    queryClient: QueryClient;
}

const ARTICLE_ID = 'a'.repeat(64);

function articleEvent(): NostrEvent {
    return {
        id: ARTICLE_ID,
        pubkey: 'b'.repeat(64),
        kind: LONG_FORM_ARTICLE_KIND,
        created_at: 1710000000,
        tags: [['title', 'Article title']],
        content: '# Article title\n\nArticle body.',
    };
}

function articleItem(): SocialFeedItem {
    const rawEvent = articleEvent();
    return {
        id: rawEvent.id,
        pubkey: rawEvent.pubkey,
        createdAt: rawEvent.created_at,
        content: rawEvent.content,
        kind: 'article',
        eventKind: rawEvent.kind,
        rawEvent,
    };
}

function service(): SocialFeedService {
    return {
        loadFollowingFeed: vi.fn(),
        loadArticlesFeed: vi.fn(),
        loadArticleById: vi.fn(async () => articleEvent()),
        loadHashtagFeed: vi.fn(),
        loadThread: vi.fn(),
        loadEngagement: vi.fn(),
        loadViewerReactions: vi.fn(),
        loadViewerZaps: vi.fn(),
        loadViewerReplies: vi.fn(),
    };
}

async function renderDetail({ onOpenAuthor = vi.fn() }: { onOpenAuthor?: ReturnType<typeof vi.fn<(pubkey: string) => void>> } = {}): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });

    await act(async () => {
        root.render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={[`/agora/articles/${ARTICLE_ID}`]}>
                    <Routes>
                        <Route
                            path="/agora/articles/:eventId"
                            element={(
                                 <ArticleDetailRouteContainer
                                     items={[articleItem()]}
                                     profilesByPubkey={{ ['b'.repeat(64)]: { pubkey: 'b'.repeat(64), displayName: 'Alice Writer' } }}
                                     service={service()}
                                     enabled
                                     onOpenAuthor={onOpenAuthor}
                                 />
                            )}
                        />
                    </Routes>
                </MemoryRouter>
            </QueryClientProvider>,
        );
    });

    return { container, root, queryClient };
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
        entry.queryClient.clear();
        entry.container.remove();
    }
    mounted.length = 0;
});

describe('ArticleDetailRouteContainer', () => {
    test('shows a clickable author and omits article-list CTAs', async () => {
        const onOpenAuthor = vi.fn();
        const rendered = await renderDetail({ onOpenAuthor });
        mounted.push(rendered);

        const detailContent = rendered.container.querySelector('[data-testid="article-detail-content"]');
        expect(detailContent?.className).toContain('pb-10');

        const backButtons = Array.from(rendered.container.querySelectorAll('button'))
            .filter((button) => button.textContent === 'Volver a artículos');
        expect(backButtons).toHaveLength(0);

        const authorButton = rendered.container.querySelector('button[aria-label="Abrir perfil de Alice Writer"]') as HTMLButtonElement | null;
        expect(authorButton).not.toBeNull();

        await act(async () => {
            authorButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenAuthor).toHaveBeenCalledWith('b'.repeat(64));
    });
});
