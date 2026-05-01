import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { createNostrOverlayQueryClient } from '../query/query-client';
import { FollowingFeedSurface } from './FollowingFeedSurface';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (error?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise, resolve, reject };
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = createNostrOverlayQueryClient();

    await act(async () => {
        root.render(
            <QueryClientProvider client={queryClient}>
                {element}
            </QueryClientProvider>
        );
    });

    return { container, root };
}

let mounted: RenderResult[] = [];

function readOverlayStyles(): string {
    return readFileSync(join(process.cwd(), 'src', 'nostr-overlay', 'styles.css'), 'utf8');
}

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    URL.createObjectURL = vi.fn(() => 'blob:inline-preview');
    URL.revokeObjectURL = vi.fn();

    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = () => {};
    }

    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
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

function buildProps(overrides: Partial<Parameters<typeof FollowingFeedSurface>[0]> = {}): Parameters<typeof FollowingFeedSurface>[0] {
    return {
        items: [],
        pendingNewCount: 0,
        hasPendingNewItems: false,
        hasFollows: true,
        profilesByPubkey: {},
        engagementByEventId: {},
        isLoadingFeed: false,
        isRefreshingFeed: false,
        feedError: null,
        hasMoreFeed: false,
        activeThread: null,
        canWrite: true,
        isPublishingPost: false,
        isPublishingReply: false,
        publishError: null,
        reactionByEventId: {},
        repostByEventId: {},
        pendingReactionByEventId: {},
        pendingRepostByEventId: {},
        onLoadMoreFeed: async () => {},
        onApplyPendingNewItems: () => {},
        onRefreshFeed: async () => {},
        onOpenThread: async () => {},
        onCloseThread: () => {},
        onLoadMoreThread: async () => {},
        onPublishPost: async () => true,
        onPublishReply: async () => true,
        onSearchUsers: async () => ({ pubkeys: [], profiles: {} }),
        onToggleReaction: async () => true,
        onToggleRepost: async () => true,
        onOpenQuoteComposer: () => {},
        onZap: async () => {},
        zapAmounts: [21, 128, 256],
        onConfigureZapAmounts: () => {},
        onSelectHashtag: () => {},
        onSelectProfile: () => {},
        onResolveProfiles: async () => {},
        onSelectEventReference: () => {},
        onResolveEventReferences: async () => {},
        eventReferencesById: {},
        onCopyNoteId: () => {},
        onClearHashtag: () => {},
        ...overrides,
    };
}

function createFeedNote(id: string, content = 'hola agora'): Parameters<typeof FollowingFeedSurface>[0]['items'][number] {
    return {
        id,
        pubkey: 'a'.repeat(64),
        createdAt: 100,
        content,
        kind: 'note',
        rawEvent: {
            id,
            pubkey: 'a'.repeat(64),
            kind: 1,
            created_at: 100,
            tags: [],
            content,
        },
    };
}

function dispatchTouch(target: Element, type: 'touchstart' | 'touchmove' | 'touchend', clientY: number): void {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', {
        value: type === 'touchend' ? [] : [{ clientY }],
    });
    Object.defineProperty(event, 'changedTouches', {
        value: [{ clientY }],
    });

    target.dispatchEvent(event);
}

describe('FollowingFeedSurface', () => {
    test('shows comment emoji when viewer has replied to a feed note', async () => {
        const noteId = 'a'.repeat(64);
        const pubkey = 'b'.repeat(64);
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    items: [{
                        id: noteId,
                        pubkey,
                        createdAt: 100,
                        content: 'hola',
                        kind: 'note',
                        rawEvent: {
                            id: noteId,
                            pubkey,
                            kind: 1,
                            created_at: 100,
                            tags: [],
                            content: 'hola',
                        },
                    }],
                    engagementByEventId: {
                        [noteId]: {
                            replies: 2,
                            reactions: 0,
                            reposts: 0,
                            zaps: 0,
                            zapSats: 0,
                        },
                    },
                    viewerReplyByEventId: {
                        [noteId]: {
                            eventId: noteId,
                            replyEventId: 'c'.repeat(64),
                            createdAt: 120,
                        },
                    },
                })}
            />
        );
        mounted.push(rendered);

        const replyButton = rendered.container.querySelector('button[aria-label="Responder (2)"]') as HTMLButtonElement | null;
        expect(replyButton).not.toBeNull();
        expect(replyButton?.textContent || '').toContain('💬');
    });

    test('renders layout toggle in feed header and forwards changes', async () => {
        const onAgoraFeedLayoutChange = vi.fn();
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    ...({ agoraFeedLayout: 'list', onAgoraFeedLayoutChange } as any),
                })}
            />
        );
        mounted.push(rendered);

        const toggleGroup = rendered.container.querySelector('.nostr-following-feed-header-actions [data-slot="toggle-group"]') as HTMLDivElement | null;
        expect(toggleGroup).not.toBeNull();
        expect(toggleGroup?.textContent).toContain('Lista');
        expect(toggleGroup?.textContent).toContain('Masonry');
        expect(toggleGroup?.getAttribute('data-size')).toBe('default');
        expect(toggleGroup?.className).toContain('hidden');
        expect(toggleGroup?.className).toContain('xl:flex');

        const refreshButton = Array.from(rendered.container.querySelectorAll('[data-slot="button"]')).find((button) =>
            (button.textContent || '').includes('Actualizar')
        ) as HTMLButtonElement | undefined;
        expect(refreshButton?.getAttribute('data-size')).toBe('sm');
        expect(refreshButton?.querySelector('svg[data-icon="inline-start"]')).not.toBeNull();

        const masonryButton = Array.from(rendered.container.querySelectorAll('[data-slot="toggle-group-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Masonry'
        ) as HTMLButtonElement | undefined;
        expect(masonryButton).toBeDefined();
        expect(masonryButton?.getAttribute('data-size')).toBe('default');

        const activeStateClass = masonryButton?.className || '';
        expect(activeStateClass).toContain('data-[state=on]:bg-primary');
        expect(activeStateClass).toContain('data-[state=on]:text-primary-foreground');
        expect(activeStateClass).not.toMatch(/dark:[^\s]*data-\[state=on\]|data-\[state=on\]:dark:/);

        await act(async () => {
            masonryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onAgoraFeedLayoutChange).toHaveBeenCalledWith('masonry');
    });

    test('keeps layout toggle visible when hashtag filter is active', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    ...({ agoraFeedLayout: 'masonry', onAgoraFeedLayoutChange: vi.fn() } as any),
                    activeHashtag: 'NostrCity',
                })}
            />
        );
        mounted.push(rendered);

        const toggleGroup = rendered.container.querySelector('.nostr-following-feed-header-actions [data-slot="toggle-group"]');
        expect(toggleGroup).not.toBeNull();
    });

    test('renders new posts CTA and applies pending items on click', async () => {
        const onApplyPendingNewItems = vi.fn();
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    pendingNewCount: 2,
                    hasPendingNewItems: true,
                    onApplyPendingNewItems,
                })}
            />
        );
        mounted.push(rendered);

        const ctaButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Ver 2 notas nuevas')
        ) as HTMLButtonElement;
        expect(ctaButton).toBeDefined();
        const headerActions = rendered.container.querySelector('.nostr-following-feed-header-actions') as HTMLDivElement;
        expect(headerActions).toBeDefined();
        expect(headerActions.contains(ctaButton)).toBe(true);

        await act(async () => {
            ctaButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onApplyPendingNewItems).toHaveBeenCalledTimes(1);
    });

    test('mobile renders a floating localized new-notes button instead of the header CTA', async () => {
        const onApplyPendingNewItems = vi.fn();
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    isMobile: true,
                    pendingNewCount: 2,
                    hasPendingNewItems: true,
                    onApplyPendingNewItems,
                })}
            />
        );
        mounted.push(rendered);

        const floatingButton = rendered.container.querySelector('[data-testid="following-feed-mobile-new-notes"]') as HTMLButtonElement | null;
        expect(floatingButton).not.toBeNull();
        expect(floatingButton?.textContent || '').toContain('Ver 2 notas nuevas');
        expect(floatingButton?.className).toContain('nostr-following-feed-mobile-new-notes');

        const headerActions = rendered.container.querySelector('.nostr-following-feed-header-actions') as HTMLDivElement;
        expect(headerActions.textContent || '').not.toContain('Ver 2 notas nuevas');
    });

    test('mobile floating new-notes button applies notes, hides, and focuses the first inserted note', async () => {
        const onApplyPendingNewItems = vi.fn();
        const scrollIntoViewSpy = vi.spyOn(Element.prototype, 'scrollIntoView');

        function Harness() {
            const [items, setItems] = useState([createFeedNote('old-note', 'nota vieja')]);
            const [hasPendingNewItems, setHasPendingNewItems] = useState(true);

            return (
                <FollowingFeedSurface
                    {...buildProps({
                        isMobile: true,
                        items,
                        pendingNewCount: 1,
                        hasPendingNewItems,
                        onApplyPendingNewItems: () => {
                            onApplyPendingNewItems();
                            setItems([createFeedNote('new-note', 'nota nueva'), ...items]);
                            setHasPendingNewItems(false);
                        },
                    })}
                />
            );
        }

        try {
            const rendered = await renderElement(<Harness />);
            mounted.push(rendered);

            const floatingButton = rendered.container.querySelector('[data-testid="following-feed-mobile-new-notes"]') as HTMLButtonElement;
            expect(floatingButton).toBeDefined();

            await act(async () => {
                floatingButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });

            expect(onApplyPendingNewItems).toHaveBeenCalledTimes(1);
            expect(rendered.container.querySelector('[data-testid="following-feed-mobile-new-notes"]')).toBeNull();
            const firstNewNote = rendered.container.querySelector('[data-feed-note-id="new-note"]') as HTMLElement | null;
            expect(firstNewNote).not.toBeNull();
            expect(document.activeElement).toBe(firstNewNote);
            expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
        } finally {
            scrollIntoViewSpy.mockRestore();
        }
    });

    test('mobile floating new-notes button uses localized singular english copy', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    isMobile: true,
                    pendingNewCount: 1,
                    hasPendingNewItems: true,
                })}
            />
        );
        mounted.push(rendered);

        const floatingButton = rendered.container.querySelector('[data-testid="following-feed-mobile-new-notes"]') as HTMLButtonElement | null;
        expect(floatingButton).not.toBeNull();
        expect(floatingButton?.textContent || '').toContain('View 1 new note');
    });

    test('mobile new-notes scroll respects reduced-motion preference', async () => {
        const scrollIntoViewSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
        const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
            matches: query === '(prefers-reduced-motion: reduce)',
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        function Harness() {
            const [items, setItems] = useState([createFeedNote('old-note', 'nota vieja')]);
            const [hasPendingNewItems, setHasPendingNewItems] = useState(true);

            return (
                <FollowingFeedSurface
                    {...buildProps({
                        isMobile: true,
                        items,
                        pendingNewCount: 1,
                        hasPendingNewItems,
                        onApplyPendingNewItems: () => {
                            setItems([createFeedNote('new-note', 'nota nueva'), ...items]);
                            setHasPendingNewItems(false);
                        },
                    })}
                />
            );
        }

        try {
            const rendered = await renderElement(<Harness />);
            mounted.push(rendered);

            const floatingButton = rendered.container.querySelector('[data-testid="following-feed-mobile-new-notes"]') as HTMLButtonElement;
            await act(async () => {
                floatingButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });

            expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
        } finally {
            scrollIntoViewSpy.mockRestore();
            matchMediaSpy.mockRestore();
        }
    });

    test('restores focus to the returned feed note once without querying unsafe selectors', async () => {
        const targetNoteId = 'note-with-"quote"-and-]';
        const scrollIntoViewSpy = vi.spyOn(Element.prototype, 'scrollIntoView');

        const props = {
            ...buildProps({
                items: [createFeedNote('other-note'), createFeedNote(targetNoteId, 'nota objetivo')],
            }),
            returnFocusEventId: targetNoteId,
        };

        try {
            const rendered = await renderElement(<FollowingFeedSurface {...props} />);
            mounted.push(rendered);

            const targetNote = Array.from(rendered.container.querySelectorAll('[data-note-id]')).find((element) =>
                element.getAttribute('data-note-id') === targetNoteId
            ) as HTMLElement | undefined;
            expect(targetNote).toBeDefined();
            expect(targetNote?.getAttribute('data-feed-note-id')).toBe(targetNoteId);
            expect(document.activeElement).toBe(targetNote);
            expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
            expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });

            await act(async () => {
                rendered.root.render(
                    <QueryClientProvider client={createNostrOverlayQueryClient()}>
                        <FollowingFeedSurface {...props} />
                    </QueryClientProvider>
                );
            });

            expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
        } finally {
            scrollIntoViewSpy.mockRestore();
        }
    });

    test('return-focus restoration respects reduced-motion preference', async () => {
        const scrollIntoViewSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
        const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
            matches: query === '(prefers-reduced-motion: reduce)',
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        try {
            const rendered = await renderElement(
                <FollowingFeedSurface
                    {...buildProps({
                        items: [createFeedNote('target-note', 'nota objetivo')],
                        returnFocusEventId: 'target-note',
                    })}
                />
            );
            mounted.push(rendered);

            expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
        } finally {
            scrollIntoViewSpy.mockRestore();
            matchMediaSpy.mockRestore();
        }
    });

    test('same return focus note scrolls again after active thread transition', async () => {
        const targetNoteId = 'same-return-focus-note';
        const scrollIntoViewSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
        const baseProps = buildProps({
            items: [createFeedNote(targetNoteId, 'nota objetivo')],
            returnFocusEventId: targetNoteId,
        });
        const activeThread: NonNullable<Parameters<typeof FollowingFeedSurface>[0]['activeThread']> = {
            rootEventId: targetNoteId,
            root: null,
            replies: [],
            isLoading: false,
            isLoadingMore: false,
            error: null,
            hasMore: false,
        };

        try {
            const rendered = await renderElement(<FollowingFeedSurface {...baseProps} />);
            mounted.push(rendered);
            expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);

            await act(async () => {
                rendered.root.render(
                    <QueryClientProvider client={createNostrOverlayQueryClient()}>
                        <FollowingFeedSurface {...baseProps} activeThread={activeThread} />
                    </QueryClientProvider>
                );
            });
            expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);

            await act(async () => {
                rendered.root.render(
                    <QueryClientProvider client={createNostrOverlayQueryClient()}>
                        <FollowingFeedSurface {...baseProps} activeThread={null} />
                    </QueryClientProvider>
                );
            });

            expect(scrollIntoViewSpy).toHaveBeenCalledTimes(2);
            expect(scrollIntoViewSpy).toHaveBeenLastCalledWith({ block: 'center', behavior: 'smooth' });
        } finally {
            scrollIntoViewSpy.mockRestore();
        }
    });

    test('does not error or load older pages when returned feed note is not rendered', async () => {
        const onLoadMoreFeed = vi.fn(async () => undefined);
        const scrollIntoViewSpy = vi.spyOn(Element.prototype, 'scrollIntoView');

        try {
            const rendered = await renderElement(
                <FollowingFeedSurface
                    {...buildProps({
                        items: [createFeedNote('visible-note')],
                        hasMoreFeed: true,
                        onLoadMoreFeed,
                        returnFocusEventId: 'missing-note',
                    })}
                />
            );
            mounted.push(rendered);

            expect(scrollIntoViewSpy).not.toHaveBeenCalled();
            expect(onLoadMoreFeed).not.toHaveBeenCalled();
        } finally {
            scrollIntoViewSpy.mockRestore();
        }
    });

    test('renders empty feed copy in english when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    hasFollows: false,
                })}
            />
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('You are not following anyone yet');
        expect(text).toContain('Start following profiles to see their Agora activity.');
        expect(text).not.toContain('No sigues a nadie todavia');
    });

    test('renders manual refresh button and triggers refresh handler', async () => {
        const onRefreshFeed = vi.fn(async () => {});
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onRefreshFeed,
                })}
            />
        );
        mounted.push(rendered);

        const refreshButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Actualizar'
        ) as HTMLButtonElement;
        expect(refreshButton).toBeDefined();

        await act(async () => {
            refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onRefreshFeed).toHaveBeenCalledTimes(1);
    });

    test('manual refresh ignores repeated clicks during the shared cooldown', async () => {
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(100_000);
        const onRefreshFeed = vi.fn(async () => {});
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onRefreshFeed,
                })}
            />
        );
        mounted.push(rendered);

        const refreshButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Actualizar'
        ) as HTMLButtonElement;

        try {
            await act(async () => {
                refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });
            nowSpy.mockReturnValue(114_999);
            await act(async () => {
                refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });
            nowSpy.mockReturnValue(115_000);
            await act(async () => {
                refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });

            expect(onRefreshFeed).toHaveBeenCalledTimes(2);
        } finally {
            nowSpy.mockRestore();
        }
    });

    test('mobile hides the visible header refresh button and keeps a screen-reader refresh action', async () => {
        const onRefreshFeed = vi.fn(async () => {});
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    isMobile: true,
                    onRefreshFeed,
                })}
            />
        );
        mounted.push(rendered);

        const refreshButtons = Array.from(rendered.container.querySelectorAll('button')).filter((button) =>
            (button.textContent || '').trim() === 'Actualizar'
        ) as HTMLButtonElement[];
        expect(refreshButtons).toHaveLength(1);
        expect(refreshButtons[0]?.className).toContain('sr-only');
        expect(refreshButtons[0]?.className).toContain('focus:not-sr-only');

        await act(async () => {
            refreshButtons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onRefreshFeed).toHaveBeenCalledTimes(1);
    });

    test('mobile pull-to-refresh at the top calls the refresh handler', async () => {
        const onRefreshFeed = vi.fn(async () => {});
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    isMobile: true,
                    items: [createFeedNote('note-1')],
                    onRefreshFeed,
                })}
            />
        );
        mounted.push(rendered);

        const pullAffordance = rendered.container.querySelector('[data-testid="following-feed-pull-to-refresh"]') as HTMLElement | null;
        expect(pullAffordance).not.toBeNull();
        expect(pullAffordance?.textContent || '').toContain('Actualizar');
        expect(pullAffordance?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();

        const feedList = rendered.container.querySelector('[data-testid="following-feed-list"]') as HTMLDivElement;
        const firstNote = rendered.container.querySelector('[data-feed-note-id="note-1"]') as HTMLDivElement;
        Object.defineProperty(feedList, 'scrollTop', { configurable: true, value: 0 });

        await act(async () => {
            dispatchTouch(firstNote, 'touchstart', 20);
            dispatchTouch(firstNote, 'touchmove', 105);
        });

        expect(pullAffordance?.style.height).toBe('72px');

        await act(async () => {
            dispatchTouch(firstNote, 'touchend', 105);
        });

        expect(onRefreshFeed).toHaveBeenCalledTimes(1);
    });

    test('mobile pull-to-refresh shares the manual refresh cooldown', async () => {
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(100_000);
        const onRefreshFeed = vi.fn(async () => {});
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    isMobile: true,
                    items: [createFeedNote('note-1')],
                    onRefreshFeed,
                })}
            />
        );
        mounted.push(rendered);

        const refreshButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Actualizar'
        ) as HTMLButtonElement;
        const feedList = rendered.container.querySelector('[data-testid="following-feed-list"]') as HTMLDivElement;
        const firstNote = rendered.container.querySelector('[data-feed-note-id="note-1"]') as HTMLDivElement;
        Object.defineProperty(feedList, 'scrollTop', { configurable: true, value: 0 });

        try {
            await act(async () => {
                refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });
            nowSpy.mockReturnValue(114_999);
            await act(async () => {
                dispatchTouch(firstNote, 'touchstart', 20);
                dispatchTouch(firstNote, 'touchmove', 105);
                dispatchTouch(firstNote, 'touchend', 105);
            });

            expect(onRefreshFeed).toHaveBeenCalledTimes(1);
        } finally {
            nowSpy.mockRestore();
        }
    });

    test('mobile pull-to-refresh rotates the refresh icon while pulling', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    isMobile: true,
                    items: [createFeedNote('note-1')],
                })}
            />
        );
        mounted.push(rendered);

        const feedList = rendered.container.querySelector('[data-testid="following-feed-list"]') as HTMLDivElement;
        const firstNote = rendered.container.querySelector('[data-feed-note-id="note-1"]') as HTMLDivElement;
        Object.defineProperty(feedList, 'scrollTop', { configurable: true, value: 0 });

        await act(async () => {
            dispatchTouch(firstNote, 'touchstart', 20);
            dispatchTouch(firstNote, 'touchmove', 76);
        });

        const pullAffordance = rendered.container.querySelector('[data-testid="following-feed-pull-to-refresh"]') as HTMLElement | null;
        const refreshIcon = pullAffordance?.querySelector('[data-testid="following-feed-pull-refresh-icon"]') as SVGElement | null;
        expect(refreshIcon).not.toBeNull();
        expect(refreshIcon?.style.transform).toBe('rotate(140deg)');
    });

    test('mobile pull-to-refresh keeps the affordance visible while settling a cancelled pull', async () => {
        const onRefreshFeed = vi.fn(async () => {});
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    isMobile: true,
                    items: [createFeedNote('note-1')],
                    onRefreshFeed,
                })}
            />
        );
        mounted.push(rendered);

        const feedList = rendered.container.querySelector('[data-testid="following-feed-list"]') as HTMLDivElement;
        const firstNote = rendered.container.querySelector('[data-feed-note-id="note-1"]') as HTMLDivElement;
        Object.defineProperty(feedList, 'scrollTop', { configurable: true, value: 0 });

        await act(async () => {
            dispatchTouch(firstNote, 'touchstart', 20);
            dispatchTouch(firstNote, 'touchmove', 76);
        });

        const pullAffordance = rendered.container.querySelector('[data-testid="following-feed-pull-to-refresh"]') as HTMLElement | null;
        expect(pullAffordance?.style.height).toBe('56px');

        await act(async () => {
            dispatchTouch(firstNote, 'touchend', 76);
        });

        expect(onRefreshFeed).not.toHaveBeenCalled();
        expect(pullAffordance?.getAttribute('data-settling')).toBe('true');
        expect(pullAffordance?.getAttribute('data-active')).toBe('true');
    });

    test('mobile pull-to-refresh shows a loading spinner in the pull area while refresh is pending', async () => {
        const deferredRefresh = createDeferred<void>();
        const onRefreshFeed = vi.fn(() => deferredRefresh.promise);
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    isMobile: true,
                    items: [createFeedNote('note-1')],
                    onRefreshFeed,
                })}
            />
        );
        mounted.push(rendered);

        const feedList = rendered.container.querySelector('[data-testid="following-feed-list"]') as HTMLDivElement;
        const firstNote = rendered.container.querySelector('[data-feed-note-id="note-1"]') as HTMLDivElement;
        Object.defineProperty(feedList, 'scrollTop', { configurable: true, value: 0 });

        await act(async () => {
            dispatchTouch(firstNote, 'touchstart', 20);
            dispatchTouch(firstNote, 'touchmove', 105);
            dispatchTouch(firstNote, 'touchend', 105);
        });

        const pullAffordance = rendered.container.querySelector('[data-testid="following-feed-pull-to-refresh"]') as HTMLElement | null;
        expect(onRefreshFeed).toHaveBeenCalledTimes(1);
        expect(pullAffordance?.getAttribute('data-refreshing')).toBe('true');
        expect(pullAffordance?.style.height).toBe('56px');
        expect(pullAffordance?.querySelector('svg[aria-label="Loading"]')).not.toBeNull();
        expect(pullAffordance?.textContent || '').toContain('Sincronizando relays');
        expect(pullAffordance?.textContent || '').not.toContain('Desliza hacia abajo para actualizar');

        await act(async () => {
            deferredRefresh.resolve(undefined);
            await deferredRefresh.promise;
        });

        expect(pullAffordance?.getAttribute('data-refreshing')).toBe('false');
        expect(pullAffordance?.style.height).toBe('0px');
    });

    test('mobile pull-to-refresh affordance does not reserve space before pulling', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    isMobile: true,
                    items: [createFeedNote('note-1')],
                })}
            />
        );
        mounted.push(rendered);

        const pullAffordance = rendered.container.querySelector('[data-testid="following-feed-pull-to-refresh"]') as HTMLElement | null;
        expect(pullAffordance).not.toBeNull();
        expect(pullAffordance?.style.height).toBe('0px');
    });

    test('mobile pull-to-refresh does not run while the feed is scrolled away from the top', async () => {
        const onRefreshFeed = vi.fn(async () => {});
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    isMobile: true,
                    items: [createFeedNote('note-1')],
                    onRefreshFeed,
                })}
            />
        );
        mounted.push(rendered);

        const feedList = rendered.container.querySelector('[data-testid="following-feed-list"]') as HTMLDivElement;
        Object.defineProperty(feedList, 'scrollTop', { configurable: true, value: 48 });

        await act(async () => {
            dispatchTouch(feedList, 'touchstart', 20);
            dispatchTouch(feedList, 'touchmove', 120);
            dispatchTouch(feedList, 'touchend', 120);
        });

        expect(onRefreshFeed).not.toHaveBeenCalled();
    });

    test('shows loading state with spinner on refresh button while feed refresh is in progress', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    isRefreshingFeed: true,
                })}
            />
        );
        mounted.push(rendered);

        const refreshButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Actualizando')
        ) as HTMLButtonElement;
        expect(refreshButton).toBeDefined();
        expect(refreshButton.disabled).toBe(true);
        expect(refreshButton.querySelector('svg[aria-label="Loading"]')).not.toBeNull();
    });

    test('hides new posts CTA and manual refresh actions while thread view is open', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    ...({ agoraFeedLayout: 'list', onAgoraFeedLayoutChange: vi.fn() } as any),
                    pendingNewCount: 3,
                    hasPendingNewItems: true,
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root',
                            },
                        },
                        replies: [],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).not.toContain('Ver 3 notas nuevas');
        expect(text).not.toContain('Actualizar');
        expect(rendered.container.querySelector('[data-slot="toggle-group"]')).toBeNull();
    });

    test('mobile thread view lets the global app bar own visible back navigation', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    isMobile: true,
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root',
                            },
                        },
                        replies: [],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        const localBackButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Volver'
        );

        expect(localBackButton).toBeUndefined();
    });

    test('scopes mobile route header copy hiding to routed overlay surfaces', () => {
        const styles = readOverlayStyles();

        expect(styles).toMatch(/\.nostr-routed-surface \[data-slot="overlay-page-header-copy"\],\s*\.nostr-following-feed-surface \[data-slot="overlay-page-header-copy"\]\s*\{[^}]*display:\s*none;/s);
        expect(styles).toMatch(/\.nostr-routed-surface \[data-slot="overlay-page-header"]:not\(:has\(\[data-slot="overlay-page-header-actions"\]\)\),\s*\.nostr-following-feed-surface \[data-slot="overlay-page-header"]:not\(:has\(\[data-slot="overlay-page-header-actions"\]\)\)\s*\{[^}]*display:\s*none;/s);
        expect(styles).toMatch(/\.nostr-following-feed-header\s*\{[^}]*padding:\s*0;/s);
        expect(styles).toMatch(/\.nostr-following-feed-header-actions\s*\{[^}]*margin-left:\s*0;[^}]*justify-content:\s*flex-start;/s);
    });

    test('renders note detail header with note id copy action', async () => {
        const onCopyNoteId = vi.fn();
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onCopyNoteId,
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root',
                            },
                        },
                        replies: [],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Nota');
        expect(text).toContain('root-1');
        expect(text).not.toContain('Hilo');
        expect(text).not.toContain('Respuestas y actividad de la conversación seleccionada.');

        const copyButton = rendered.container.querySelector('button[aria-label="Copiar identificador de nota root-1"]') as HTMLButtonElement | null;
        expect(copyButton).not.toBeNull();

        await act(async () => {
            copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onCopyNoteId).toHaveBeenCalledWith('root-1');
    });

    test('feed scroll requests next query page without rendering manual load more button', async () => {
        const onLoadMoreFeed = vi.fn(async () => {});
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    hasMoreFeed: true,
                    items: [
                        {
                            id: 'note-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'hola feed',
                            kind: 'note',
                            rawEvent: {
                                id: 'note-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'hola feed',
                            },
                        },
                    ],
                    onLoadMoreFeed,
                })}
            />
        );
        mounted.push(rendered);

        const feedList = rendered.container.querySelector('[data-testid="following-feed-list"]') as HTMLDivElement | null;
        expect(feedList).not.toBeNull();
        expect(feedList?.className).toContain('overflow-y-auto');
        expect(Array.from(rendered.container.querySelectorAll('button')).some((button) =>
            (button.textContent || '').includes('Cargar mas')
        )).toBe(false);

        Object.defineProperty(feedList, 'scrollHeight', { configurable: true, value: 500 });
        Object.defineProperty(feedList, 'clientHeight', { configurable: true, value: 300 });
        Object.defineProperty(feedList, 'scrollTop', { configurable: true, value: 130 });

        await act(async () => {
            feedList?.dispatchEvent(new Event('scroll', { bubbles: true }));
        });

        expect(onLoadMoreFeed).toHaveBeenCalledTimes(1);
    });

    test('thread scroll requests next query page without rendering manual load more button', async () => {
        const onLoadMoreThread = vi.fn(async () => {});
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root',
                            },
                        },
                        replies: [],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: true,
                    },
                    onLoadMoreThread,
                })}
            />
        );
        mounted.push(rendered);

        const threadList = rendered.container.querySelector('[data-testid="following-feed-thread-list"]') as HTMLDivElement | null;
        expect(threadList).not.toBeNull();
        expect(threadList?.className).toContain('overflow-y-auto');
        expect(Array.from(rendered.container.querySelectorAll('button')).some((button) =>
            (button.textContent || '').includes('Cargar mas respuestas')
        )).toBe(false);

        Object.defineProperty(threadList, 'scrollHeight', { configurable: true, value: 500 });
        Object.defineProperty(threadList, 'clientHeight', { configurable: true, value: 300 });
        Object.defineProperty(threadList, 'scrollTop', { configurable: true, value: 130 });

        await act(async () => {
            threadList?.dispatchEvent(new Event('scroll', { bubbles: true }));
        });

        expect(onLoadMoreThread).toHaveBeenCalledTimes(1);
    });

    test('renders empty state without legacy close action', async () => {
        const rendered = await renderElement(<FollowingFeedSurface {...buildProps()} />);
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Sin notas');
        expect(rendered.container.textContent || '').not.toContain('Volver al mapa');
        expect(rendered.container.textContent || '').toContain('Cronología en tiempo real de personas a las que sigues');

        const surfaceContent = rendered.container.querySelector('.nostr-following-feed-surface-content') as HTMLElement;
        const routedSurfaceContent = rendered.container.querySelector('[data-testid="overlay-surface-content"]') as HTMLElement;
        const composeCard = rendered.container.querySelector('.nostr-following-feed-compose[data-slot="card"]');
        expect(surfaceContent).toBeDefined();
        expect(routedSurfaceContent).toBeDefined();
        expect(routedSurfaceContent.className).toContain('nostr-following-feed-routed-surface-content');
        expect(surfaceContent.className).not.toContain('nostr-following-feed-page-edge-to-edge');
        expect(surfaceContent.className).toContain('nostr-page-layout');
        expect(surfaceContent.classList.contains('nostr-following-feed-dialog')).toBe(false);
        expect(rendered.container.querySelector('[data-slot="overlay-page-header"]')).not.toBeNull();
        expect(composeCard).toBeNull();
    });

    test('does not render main composer in the primary agora feed', async () => {
        const onPublishPost = vi.fn(async () => true);
        const rendered = await renderElement(<FollowingFeedSurface {...buildProps({ onPublishPost })} />);
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-following-feed-compose')).toBeNull();
        expect(onPublishPost).not.toHaveBeenCalled();
    });

    test('wraps feed notes in a dedicated list-layout container', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    ...({ agoraFeedLayout: 'masonry', onAgoraFeedLayoutChange: vi.fn() } as any),
                    items: [
                        {
                            id: 'note-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'hola agora',
                            kind: 'note',
                            rawEvent: {
                                id: 'note-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'hola agora',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        const feedList = rendered.container.querySelector('[data-testid="following-feed-list"]') as HTMLDivElement;
        expect(feedList).toBeDefined();
        expect(feedList.className).toContain('nostr-following-feed-list');

        const itemsWrapper = feedList.querySelector('.nostr-following-feed-items') as HTMLDivElement;
        expect(itemsWrapper).toBeDefined();
        expect(itemsWrapper.className).toContain('nostr-following-feed-list-layout-masonry');

        const noteShell = itemsWrapper.querySelector('.nostr-following-feed-note-shell') as HTMLDivElement;
        expect(noteShell).toBeDefined();
        expect(noteShell.querySelector('[data-slot="card"]')).not.toBeNull();
    });

    test('marks feed note action groups for responsive mobile layout', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    isMobile: true,
                    items: [createFeedNote('note-1')],
                    engagementByEventId: {
                        'note-1': {
                            replies: 2,
                            reactions: 3,
                            reposts: 4,
                            zaps: 1,
                            zapSats: 21,
                        },
                    },
                })}
            />
        );
        mounted.push(rendered);

        const actionGroup = rendered.container.querySelector('.nostr-following-feed-action-group') as HTMLElement | null;

        expect(actionGroup).not.toBeNull();
        expect(actionGroup?.getAttribute('data-slot')).toBe('button-group');
    });

    test('keeps mobile feed notes and their action groups within the available width', () => {
        const styles = readOverlayStyles();

        expect(styles).toMatch(/\.nostr-following-feed-note-shell\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*600px;[^}]*min-width:\s*0/s);
        expect(styles).toMatch(/@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*\.nostr-following-feed-action-group\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
        expect(styles).toMatch(/@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*\.nostr-following-feed-action-group > \*\s*\{[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0/s);
        expect(styles).toMatch(/@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*\.nostr-following-feed-action-group \[data-slot="button"\]\s*\{[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0/s);
    });

    test('uses semantic token colors for rich note links and mentions', () => {
        const styles = readOverlayStyles();

        expect(styles).toMatch(/\.nostr-rich-inline-link\s*\{[^}]*color:\s*var\(--primary\)/s);
        expect(styles).toMatch(/\.nostr-rich-hashtag\s*\{[^}]*color:\s*var\(--primary\)/s);
        expect(styles).toMatch(/\.nostr-rich-mention\s*\{[^}]*color:\s*var\(--primary\)/s);
        expect(styles).toMatch(/\.nostr-following-feed-copy-id\s*\{[^}]*color:\s*var\(--primary\)/s);
        expect(styles).not.toMatch(/\.nostr-rich-(?:inline-link|hashtag|mention)\s*\{[^}]*color:\s*#[0-9a-fA-F]+/s);
    });

    test('uses shared overlay surface background for agora and routed pages', async () => {
        const rendered = await renderElement(<FollowingFeedSurface {...buildProps()} />);
        mounted.push(rendered);
        const styles = readOverlayStyles();
        const surface = rendered.container.querySelector('section[aria-label="Agora"]') as HTMLElement | null;
        const content = rendered.container.querySelector('[data-testid="overlay-surface-content"]') as HTMLElement | null;

        expect(surface?.className).toContain('bg-background/95');
        expect(content?.className).toContain('bg-overlay-surface');
        expect(styles).toMatch(/\.nostr-routed-surface\s*\{[^}]*background:\s*color-mix\(in oklab,\s*var\(--background\) 95%,\s*transparent\)/s);
        expect(styles).toMatch(/\.nostr-following-feed-surface\s*\{[^}]*background:\s*color-mix\(in oklab,\s*var\(--background\) 95%,\s*transparent\)/s);
        expect(styles).toMatch(/\.nostr-routed-surface-content\s*\{[^}]*background:\s*var\(--overlay-surface\)/s);
        expect(styles).not.toMatch(/\.nostr-(?:routed|following-feed)-surface\s*\{[^}]*radial-gradient/s);
        expect(styles).not.toMatch(/\.nostr-routed-surface-content\s*\{[^}]*rgba\(255,\s*255,\s*255/s);
    });

    test('uses the xl breakpoint before switching masonry to two columns', () => {
        const styles = readOverlayStyles();

        expect(styles).toMatch(/@media \(min-width:\s*1280px\)\s*\{\s*\.nostr-following-feed-list-layout-masonry\s*\{\s*column-count:\s*2;/s);
        expect(styles).not.toMatch(/@media \(min-width:\s*900px\)\s*\{\s*\.nostr-following-feed-list-layout-masonry\s*\{/s);
    });

    test('positions the mobile new-notes indicator near the mobile bottom controls', () => {
        const styles = readOverlayStyles();

        expect(styles).toMatch(/\.nostr-following-feed-mobile-new-notes\s*\{[^}]*bottom:\s*max\(48px,\s*calc\(env\(safe-area-inset-bottom\) \+ 48px\)\)/s);
        expect(styles).not.toMatch(/\.nostr-following-feed-mobile-new-notes\s*\{[^}]*76px/s);
    });

    test('does not transition pull-to-refresh height while tracking touch movement', () => {
        const styles = readOverlayStyles();

        expect(styles).toMatch(/\.nostr-following-feed-pull-to-refresh\s*\{[^}]*will-change:\s*height/s);
        expect(styles).not.toMatch(/\.nostr-following-feed-pull-to-refresh\s*\{[^}]*transition:\s*height/s);
    });

    test('only transitions pull-to-refresh height during release settling', () => {
        const styles = readOverlayStyles();

        expect(styles).toMatch(/\.nostr-following-feed-pull-to-refresh\[data-settling="true"\]\s*\{[^}]*display:\s*grid/s);
        expect(styles).toMatch(/\.nostr-following-feed-pull-to-refresh\[data-settling="true"\]\s*\{[^}]*transition:\s*height\s+140ms\s+ease-out/s);
    });

    test('keeps the loading footer outside the masonry items wrapper', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    ...({ agoraFeedLayout: 'masonry', onAgoraFeedLayoutChange: vi.fn() } as any),
                    isLoadingFeed: true,
                    items: [
                        {
                            id: 'note-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'hola agora',
                            kind: 'note',
                            rawEvent: {
                                id: 'note-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'hola agora',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        const feedList = rendered.container.querySelector('[data-testid="following-feed-list"]') as HTMLDivElement;
        const itemsWrapper = feedList.querySelector('.nostr-following-feed-items') as HTMLDivElement;
        expect(itemsWrapper).toBeDefined();

        const loadingFooter = Array.from(feedList.children).find((child) => (child.textContent || '').includes('Cargando notas...')) as HTMLDivElement | undefined;
        expect(loadingFooter).toBeDefined();
        expect(itemsWrapper.contains(loadingFooter || null)).toBe(false);
        expect(loadingFooter?.className).toContain('max-w-[600px]');
        expect(loadingFooter?.className).toContain('justify-self-start');
    });

    test('renders no-follows empty state using Empty component copy', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    hasFollows: false,
                    items: [],
                })}
            />
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('No sigues a nadie todavía');
        expect(text).toContain('Empieza a seguir perfiles para ver su actividad en Ágora.');
    });

    test('renders author identity and engagement icon counters on cards', async () => {
        const onOpenThread = vi.fn(async () => {});
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    profilesByPubkey: {
                        ['a'.repeat(64)]: {
                            pubkey: 'a'.repeat(64),
                            displayName: 'Alice Surface',
                            lud16: 'alice@getalby.com',
                        },
                    },
                    engagementByEventId: {
                        'note-1': {
                            replies: 1,
                            reposts: 2,
                            reactions: 3,
                            zaps: 4,
                            zapSats: 210,
                        },
                    },
                    items: [
                        {
                            id: 'note-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'hola surface',
                            kind: 'note',
                            rawEvent: {
                                id: 'note-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'hola surface',
                            },
                        },
                    ],
                    onOpenThread,
                })}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Alice Surface');
        expect(rendered.container.querySelector('button[aria-label="Responder (1)"]')).toBeDefined();
        expect(rendered.container.querySelector('button[aria-label="Reaccionar (3)"]')).toBeDefined();
        expect(rendered.container.querySelector('button[aria-label="Repostear (2)"]')).toBeDefined();
        expect(rendered.container.querySelector('[aria-label="Sats recibidos: 210"]')).toBeDefined();

        const article = rendered.container.querySelector('article') as HTMLElement;
        await act(async () => {
            article.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenThread).toHaveBeenCalledWith('note-1');
    });

    test('opens zap menu from note cards and forwards the selected amount', async () => {
        const onZap = vi.fn(async () => {});
        const onConfigureZapAmounts = vi.fn();
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    profilesByPubkey: {
                        ['a'.repeat(64)]: {
                            pubkey: 'a'.repeat(64),
                            displayName: 'Alice Surface',
                            lud16: 'alice@getalby.com',
                        },
                    },
                    engagementByEventId: {
                        'note-1': {
                            replies: 0,
                            reposts: 0,
                            reactions: 0,
                            zaps: 1,
                            zapSats: 210,
                        },
                    },
                    items: [
                        {
                            id: 'note-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'note with zap menu',
                            kind: 'note',
                            rawEvent: {
                                id: 'note-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'note with zap menu',
                            },
                        },
                    ],
                    onZap,
                    onConfigureZapAmounts,
                })}
            />
        );
        mounted.push(rendered);

        const zapButton = rendered.container.querySelector('button[aria-label="Sats recibidos: 210"]') as HTMLButtonElement;
        expect(zapButton).toBeDefined();

        await act(async () => {
            zapButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            zapButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const zap21 = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === '21 sats'
        ) as HTMLElement;
        expect(zap21).toBeDefined();

        await act(async () => {
            zap21.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onZap).toHaveBeenCalledWith({
            eventId: 'note-1',
            eventKind: 1,
            targetPubkey: 'a'.repeat(64),
            amount: 21,
        });

        await act(async () => {
            zapButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            zapButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const configureItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Configurar cantidades'
        ) as HTMLElement;

        await act(async () => {
            configureItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onConfigureZapAmounts).toHaveBeenCalledTimes(1);
    });

    test('disables zap action from note cards when author lacks lightning metadata', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    profilesByPubkey: {
                        ['a'.repeat(64)]: {
                            pubkey: 'a'.repeat(64),
                            displayName: 'Alice Surface',
                        },
                    },
                    engagementByEventId: {
                        'note-1': {
                            replies: 0,
                            reposts: 0,
                            reactions: 0,
                            zaps: 1,
                            zapSats: 210,
                        },
                    },
                    items: [
                        {
                            id: 'note-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'note without zap metadata',
                            kind: 'note',
                            rawEvent: {
                                id: 'note-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'note without zap metadata',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        expect((rendered.container.querySelector('button[aria-label="Sats recibidos: 210"]') as HTMLButtonElement | null)?.disabled).toBe(true);
    });

    test('renders optimistic pending states for reaction and repost actions', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    engagementByEventId: {
                        'note-1': {
                            replies: 0,
                            reposts: 5,
                            reactions: 7,
                            zaps: 0,
                            zapSats: 0,
                        },
                    },
                    pendingReactionByEventId: { 'note-1': true },
                    pendingRepostByEventId: { 'note-1': true },
                    items: [
                        {
                            id: 'note-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'optimistic note',
                            kind: 'note',
                            rawEvent: {
                                id: 'note-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'optimistic note',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        const reactionButton = rendered.container.querySelector('button[aria-label="Reaccionar (7)"]') as HTMLButtonElement;
        const repostButton = rendered.container.querySelector('button[aria-label="Repostear (5)"]') as HTMLButtonElement;
        expect(reactionButton).toBeDefined();
        expect(repostButton).toBeDefined();
        expect(reactionButton.disabled).toBe(true);
        expect(repostButton.disabled).toBe(true);
    });

    test('renders thread reply composer under the root note without thread kind labels or helper text', async () => {
        const onPublishReply = vi.fn(async () => true);
        const onToggleReaction = vi.fn(async () => true);
        const onToggleRepost = vi.fn(async () => true);
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root',
                            },
                        },
                        replies: [
                            {
                                id: 'reply-1',
                                pubkey: 'c'.repeat(64),
                                createdAt: 510,
                                eventKind: 1,
                                content: 'reply uno',
                                targetEventId: 'root-1',
                                rawEvent: {
                                    id: 'reply-1',
                                    pubkey: 'c'.repeat(64),
                                    kind: 1,
                                    created_at: 510,
                                    tags: [['e', 'root-1']],
                                    content: 'reply uno',
                                    sig: '1'.repeat(128),
                                },
                            },
                        ],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                    engagementByEventId: {
                        'root-1': {
                            replies: 4,
                            reposts: 2,
                            reactions: 3,
                            zaps: 1,
                            zapSats: 210,
                        },
                        'reply-1': {
                            replies: 1,
                            reposts: 0,
                            reactions: 7,
                            zaps: 0,
                            zapSats: 21,
                        },
                    },
                    onPublishReply,
                    onToggleReaction,
                    onToggleRepost,
                })}
            />
        );
        mounted.push(rendered);

        const replyCard = rendered.container.querySelector('.nostr-following-feed-reply-box[data-slot="card"]');
        const threadList = rendered.container.querySelector('[data-testid="following-feed-thread-list"]') as HTMLDivElement;
        const rootNode = rendered.container.querySelector('.nostr-following-feed-thread-node[data-depth="0"]') as HTMLElement;
        const firstReplyNode = rendered.container.querySelector('.nostr-following-feed-thread-node[data-depth="1"]') as HTMLElement;
        expect(replyCard).not.toBeNull();
        expect(replyCard?.getAttribute('data-variant')).toBe('elevated');
        expect(replyCard?.className).not.toContain('h-min');
        expect(replyCard?.className).not.toContain('sticky');
        expect(replyCard?.className).not.toContain('bottom-0');
        expect(replyCard?.className).not.toContain('z-20');
        expect(threadList.children[0]).toBe(rootNode);
        expect(threadList.children[1]).toBe(replyCard);
        expect(threadList.children[2]).toBe(firstReplyNode);

        const textarea = rendered.container.querySelector('.nostr-following-feed-reply-box textarea') as HTMLTextAreaElement;
        const actionsRow = rendered.container.querySelector('.nostr-following-feed-reply-box .nostr-following-feed-compose-actions') as HTMLElement;
        const imageButton = actionsRow.querySelector('button[aria-label="Adjuntar imagen"]') as HTMLButtonElement;
        const actionButtons = Array.from(actionsRow.querySelectorAll('button'));
        expect(textarea).toBeDefined();
        expect(actionsRow).toBeDefined();
        expect(imageButton).toBeDefined();
        expect(imageButton.disabled).toBe(false);
        expect(imageButton.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
        expect(actionButtons[0]).toBe(imageButton);
        expect(actionsRow.querySelector('input[type="file"]')?.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp,image/avif');
        expect(textarea.getAttribute('aria-describedby')).toBeNull();
        expect(textarea.getAttribute('rows')).toBe('3');
        expect(rendered.container.querySelector('.nostr-following-feed-reply-target')).toBeNull();
        expect(rootNode.textContent || '').not.toContain('Raiz');
        expect(firstReplyNode.textContent || '').not.toContain('Reply');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            valueSetter?.call(textarea, 'respuesta surface');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const sendButton = Array.from(actionsRow.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Responder')
        ) as HTMLButtonElement;
        expect(sendButton).toBeDefined();
        expect(actionButtons[actionButtons.length - 1]).toBe(sendButton);

        const imageInput = actionsRow.querySelector('input[type="file"]') as HTMLInputElement;
        const image = new File([PNG_BYTES], 'reply.png', { type: 'image/png' });
        await act(async () => {
            Object.defineProperty(imageInput, 'files', {
                configurable: true,
                value: [image],
            });
            imageInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(rendered.container.querySelector('img[src="blob:inline-preview"]')).not.toBeNull();
        expect(rendered.container.querySelector('[role="status"]')?.textContent).toContain('Imagen seleccionada');

        await act(async () => {
            sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onPublishReply).toHaveBeenCalledWith({
            targetEventId: 'root-1',
            targetPubkey: 'b'.repeat(64),
            rootEventId: 'root-1',
            content: {
                text: 'respuesta surface',
                mentions: [],
            },
            image: { file: image },
        });

        const replyReactionButton = rendered.container.querySelector('button[aria-label="Reaccionar (7)"]') as HTMLButtonElement;
        const replyRepostButton = rendered.container.querySelector('button[aria-label="Repostear (0)"]') as HTMLButtonElement;
        expect(replyReactionButton).toBeDefined();
        expect(replyRepostButton).toBeDefined();

        await act(async () => {
            replyReactionButton.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
            replyReactionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const fireReaction = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((item) =>
            item.getAttribute('aria-label') === 'Reaccionar con 🔥'
        ) as HTMLElement;

        await act(async () => {
            fireReaction.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
            fireReaction.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await act(async () => {
            replyRepostButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            replyRepostButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const repostItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Repost'
        ) as HTMLElement;

        await act(async () => {
            repostItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onToggleReaction).toHaveBeenCalledWith({
            eventId: 'reply-1',
            targetPubkey: 'c'.repeat(64),
            emoji: '🔥',
        });
        expect(onToggleRepost).toHaveBeenCalledWith({
            eventId: 'reply-1',
            targetPubkey: 'c'.repeat(64),
            repostContent: JSON.stringify({
                id: 'reply-1',
                pubkey: 'c'.repeat(64),
                kind: 1,
                created_at: 510,
                tags: [['e', 'root-1']],
                content: 'reply uno',
                sig: '1'.repeat(128),
            }),
        });
        expect(rendered.container.querySelector('[aria-label="Sats recibidos: 210"]')).toBeDefined();
        expect(rendered.container.querySelector('[aria-label="Sats recibidos: 21"]')).toBeDefined();
    });

    test('hides the thread reply composer for readonly sessions while preserving root and replies', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    canWrite: false,
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'readonly root',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'readonly root',
                            },
                        },
                        replies: [
                            {
                                id: 'reply-1',
                                pubkey: 'c'.repeat(64),
                                createdAt: 510,
                                eventKind: 1,
                                content: 'readonly reply',
                                targetEventId: 'root-1',
                                rawEvent: {
                                    id: 'reply-1',
                                    pubkey: 'c'.repeat(64),
                                    kind: 1,
                                    created_at: 510,
                                    tags: [['e', 'root-1']],
                                    content: 'readonly reply',
                                },
                            },
                        ],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('readonly root');
        expect(rendered.container.textContent || '').toContain('readonly reply');
        expect(rendered.container.querySelector('.nostr-following-feed-reply-box')).toBeNull();
        expect(rendered.container.querySelector('.nostr-following-feed-reply-box textarea')).toBeNull();
    });

    test('announces invalid thread reply image selection', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root',
                            },
                        },
                        replies: [],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        const imageInput = rendered.container.querySelector('.nostr-following-feed-reply-box input[type="file"]') as HTMLInputElement;
        await act(async () => {
            Object.defineProperty(imageInput, 'files', {
                configurable: true,
                value: [new File(['<svg></svg>'], 'vector.svg', { type: 'image/svg+xml' })],
            });
            imageInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(rendered.container.querySelector('.nostr-following-feed-reply-box [role="alert"]')?.textContent)
            .toContain('El archivo seleccionado no es una imagen compatible.');
    });

    test('auto-grows thread reply textarea while keeping replies below it', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root',
                            },
                        },
                        replies: [
                            {
                                id: 'reply-1',
                                pubkey: 'c'.repeat(64),
                                createdAt: 510,
                                eventKind: 1,
                                content: 'reply uno',
                                targetEventId: 'root-1',
                                rawEvent: {
                                    id: 'reply-1',
                                    pubkey: 'c'.repeat(64),
                                    kind: 1,
                                    created_at: 510,
                                    tags: [['e', 'root-1']],
                                    content: 'reply uno',
                                    sig: '1'.repeat(128),
                                },
                            },
                        ],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        const threadList = rendered.container.querySelector('[data-testid="following-feed-thread-list"]') as HTMLDivElement;
        const replyCard = rendered.container.querySelector('.nostr-following-feed-reply-box[data-slot="card"]') as HTMLElement;
        const firstReplyNode = rendered.container.querySelector('.nostr-following-feed-thread-node[data-depth="1"]') as HTMLElement;
        const textarea = rendered.container.querySelector('.nostr-following-feed-reply-box textarea') as HTMLTextAreaElement;
        expect(threadList.children[1]).toBe(replyCard);
        expect(threadList.children[2]).toBe(firstReplyNode);

        Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 148 });

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            valueSetter?.call(textarea, 'respuesta surface\nsegunda linea\ntercera linea');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(textarea.style.height).toBe('148px');
    });

    test('renders thread back action inside header actions', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    activeThread: {
                        rootEventId: 'thread-1',
                        root: null,
                        replies: [],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        const header = rendered.container.querySelector('.nostr-following-feed-header') as HTMLElement;
        const pageHeader = header.querySelector('[data-slot="overlay-page-header"]') as HTMLElement;
        const headerActions = header.querySelector('.nostr-following-feed-header-actions') as HTMLElement;
        const backButton = headerActions.querySelector('button') as HTMLButtonElement;

        expect(pageHeader).toBeDefined();
        expect(header.firstElementChild).toBe(pageHeader);
        expect(headerActions).toBeDefined();
        expect(backButton.textContent || '').toContain('Volver');
        expect(backButton.textContent || '').not.toContain('Volver al Ágora');
    });

    test('renders english note detail back action as Back', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    activeThread: {
                        rootEventId: 'thread-1',
                        root: null,
                        replies: [],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        const backButton = rendered.container.querySelector('.nostr-following-feed-header-actions button') as HTMLButtonElement;

        expect(backButton.textContent || '').toContain('Back');
        expect(backButton.textContent || '').not.toContain('Back to Agora');
    });

    test('renders centered empty loading state for initial thread load', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    activeThread: {
                        rootEventId: 'thread-1',
                        root: null,
                        replies: [],
                        isLoading: true,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        const centeredState = rendered.container.querySelector('.nostr-following-feed-thread-empty-state') as HTMLElement;
        expect(centeredState).toBeDefined();
        const threadList = rendered.container.querySelector('[data-testid="following-feed-thread-list"]') as HTMLDivElement;
        expect(threadList.className).toContain('nostr-following-feed-thread-list-detail');
        expect(rendered.container.querySelector('.nostr-following-feed-thread-node[data-depth="0"]')).toBeNull();

        const empty = centeredState.querySelector('[data-slot="empty"]') as HTMLElement;
        expect(empty).toBeDefined();
        expect(empty.textContent || '').toContain('Cargando hilo');
        expect(empty.textContent || '').toContain('Recuperando la conversación.');
        expect(empty.querySelector('[aria-label="Loading"]')).not.toBeNull();
        expect(rendered.container.textContent || '').not.toContain('Cargando hilo...');
    });

    test('does not render centered thread empty state when root is already visible', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root visible',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root visible',
                            },
                        },
                        replies: [],
                        isLoading: true,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-following-feed-thread-empty-state')).toBeNull();
        expect(rendered.container.textContent || '').toContain('Cargando hilo...');
    });

    test('does not render centered thread empty state when replies are already visible', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    activeThread: {
                        rootEventId: 'root-1',
                        root: null,
                        replies: [
                            {
                                id: 'reply-1',
                                pubkey: 'c'.repeat(64),
                                createdAt: 510,
                                eventKind: 1,
                                content: 'reply visible',
                                targetEventId: 'root-1',
                                rawEvent: {
                                    id: 'reply-1',
                                    pubkey: 'c'.repeat(64),
                                    kind: 1,
                                    created_at: 510,
                                    tags: [['e', 'root-1']],
                                    content: 'reply visible',
                                },
                            },
                        ],
                        isLoading: true,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-following-feed-thread-empty-state')).toBeNull();
        expect(rendered.container.textContent || '').toContain('reply visible');
        expect(rendered.container.textContent || '').toContain('Cargando hilo...');
    });

    test('keeps incremental thread footer when loading more replies with visible content', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root visible',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root visible',
                            },
                        },
                        replies: [],
                        isLoading: false,
                        isLoadingMore: true,
                        error: null,
                        hasMore: true,
                    },
                })}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-following-feed-thread-empty-state')).toBeNull();
        expect(rendered.container.textContent || '').toContain('Cargando hilo...');
    });

    test('renders nested replies in thread detail', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root',
                            },
                        },
                        replies: [
                            {
                                id: 'reply-parent',
                                pubkey: 'c'.repeat(64),
                                createdAt: 510,
                                eventKind: 1,
                                content: 'reply parent',
                                targetEventId: 'root-1',
                                rawEvent: {
                                    id: 'reply-parent',
                                    pubkey: 'c'.repeat(64),
                                    kind: 1,
                                    created_at: 510,
                                    tags: [['e', 'root-1', '', 'reply']],
                                    content: 'reply parent',
                                },
                            },
                            {
                                id: 'reply-child',
                                pubkey: 'd'.repeat(64),
                                createdAt: 520,
                                eventKind: 1,
                                content: 'reply child',
                                targetEventId: 'reply-parent',
                                rawEvent: {
                                    id: 'reply-child',
                                    pubkey: 'd'.repeat(64),
                                    kind: 1,
                                    created_at: 520,
                                    tags: [['e', 'root-1', '', 'root'], ['e', 'reply-parent', '', 'reply']],
                                    content: 'reply child',
                                },
                            },
                        ],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        const rootNode = rendered.container.querySelector('.nostr-following-feed-thread-node[data-depth="0"]') as HTMLElement;
        expect(rootNode).not.toBeNull();
        expect(rootNode.getAttribute('data-visual-depth')).toBe('0');
        const rootIndent = rootNode.querySelector(':scope > .nostr-following-feed-thread-row > .nostr-following-feed-thread-indent') as HTMLElement;
        expect(rootIndent).not.toBeNull();
        expect(rootIndent.querySelectorAll('.nostr-following-feed-thread-rail')).toHaveLength(0);

        const parentReply = rendered.container.querySelector('.nostr-following-feed-thread-node[data-depth="1"]') as HTMLElement;
        expect(parentReply).not.toBeNull();
        expect(parentReply.getAttribute('data-visual-depth')).toBe('1');
        const parentIndent = parentReply.querySelector(':scope > .nostr-following-feed-thread-row > .nostr-following-feed-thread-indent') as HTMLElement;
        expect(parentIndent.querySelectorAll('.nostr-following-feed-thread-rail')).toHaveLength(1);

        const nestedReply = rendered.container.querySelector('.nostr-following-feed-thread-node[data-depth="2"]') as HTMLElement;
        expect(nestedReply).not.toBeNull();
        expect(nestedReply.getAttribute('data-visual-depth')).toBe('2');
        const nestedIndent = nestedReply.querySelector(':scope > .nostr-following-feed-thread-row > .nostr-following-feed-thread-indent') as HTMLElement;
        expect(nestedIndent.querySelectorAll('.nostr-following-feed-thread-rail')).toHaveLength(2);
        expect(nestedReply.textContent || '').toContain('reply child');
        expect(parentReply.contains(nestedReply)).toBe(true);
    });

    test('keeps root wrapper when thread root has no replies', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root only',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root only',
                            },
                        },
                        replies: [],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        const threadList = rendered.container.querySelector('[data-testid="following-feed-thread-list"]') as HTMLDivElement;
        const rootNode = rendered.container.querySelector('.nostr-following-feed-thread-node[data-depth="0"]') as HTMLElement;
        expect(threadList.className).toContain('nostr-following-feed-thread-list-detail');
        expect(rootNode).not.toBeNull();
        expect(rootNode.getAttribute('data-visual-depth')).toBe('0');
        const rootIndent = rootNode.querySelector(':scope > .nostr-following-feed-thread-row > .nostr-following-feed-thread-indent') as HTMLElement;
        expect(rootIndent.querySelectorAll('.nostr-following-feed-thread-rail')).toHaveLength(0);
        expect(rendered.container.textContent || '').toContain('Sin respuestas');
    });

    test('caps visual nesting depth at four rails while preserving real depth', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root',
                            },
                        },
                        replies: [
                            {
                                id: 'reply-1',
                                pubkey: 'c'.repeat(64),
                                createdAt: 510,
                                eventKind: 1,
                                content: 'reply-1',
                                targetEventId: 'root-1',
                                rawEvent: {
                                    id: 'reply-1',
                                    pubkey: 'c'.repeat(64),
                                    kind: 1,
                                    created_at: 510,
                                    tags: [['e', 'root-1', '', 'reply']],
                                    content: 'reply-1',
                                },
                            },
                            {
                                id: 'reply-2',
                                pubkey: 'd'.repeat(64),
                                createdAt: 520,
                                eventKind: 1,
                                content: 'reply-2',
                                targetEventId: 'reply-1',
                                rawEvent: {
                                    id: 'reply-2',
                                    pubkey: 'd'.repeat(64),
                                    kind: 1,
                                    created_at: 520,
                                    tags: [['e', 'root-1', '', 'root'], ['e', 'reply-1', '', 'reply']],
                                    content: 'reply-2',
                                },
                            },
                            {
                                id: 'reply-3',
                                pubkey: 'e'.repeat(64),
                                createdAt: 530,
                                eventKind: 1,
                                content: 'reply-3',
                                targetEventId: 'reply-2',
                                rawEvent: {
                                    id: 'reply-3',
                                    pubkey: 'e'.repeat(64),
                                    kind: 1,
                                    created_at: 530,
                                    tags: [['e', 'root-1', '', 'root'], ['e', 'reply-2', '', 'reply']],
                                    content: 'reply-3',
                                },
                            },
                            {
                                id: 'reply-4',
                                pubkey: 'f'.repeat(64),
                                createdAt: 540,
                                eventKind: 1,
                                content: 'reply-4',
                                targetEventId: 'reply-3',
                                rawEvent: {
                                    id: 'reply-4',
                                    pubkey: 'f'.repeat(64),
                                    kind: 1,
                                    created_at: 540,
                                    tags: [['e', 'root-1', '', 'root'], ['e', 'reply-3', '', 'reply']],
                                    content: 'reply-4',
                                },
                            },
                            {
                                id: 'reply-5',
                                pubkey: '1'.repeat(64),
                                createdAt: 550,
                                eventKind: 1,
                                content: 'reply-5',
                                targetEventId: 'reply-4',
                                rawEvent: {
                                    id: 'reply-5',
                                    pubkey: '1'.repeat(64),
                                    kind: 1,
                                    created_at: 550,
                                    tags: [['e', 'root-1', '', 'root'], ['e', 'reply-4', '', 'reply']],
                                    content: 'reply-5',
                                },
                            },
                        ],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        const deepReply = rendered.container.querySelector('.nostr-following-feed-thread-node[data-depth="5"]') as HTMLElement;
        expect(deepReply).not.toBeNull();
        expect(deepReply.getAttribute('data-visual-depth')).toBe('4');
        const deepIndent = deepReply.querySelector(':scope > .nostr-following-feed-thread-row > .nostr-following-feed-thread-indent') as HTMLElement;
        expect(deepIndent.querySelectorAll('.nostr-following-feed-thread-rail')).toHaveLength(4);
    });

    test('repost renders the reposted note embedded inside the repost card', async () => {
        const onCopyNoteId = vi.fn();
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onCopyNoteId,
                    profilesByPubkey: {
                        ['a'.repeat(64)]: {
                            pubkey: 'a'.repeat(64),
                            displayName: 'Reposter',
                        },
                        ['b'.repeat(64)]: {
                            pubkey: 'b'.repeat(64),
                            displayName: 'Original Author',
                            lud16: 'original@getalby.com',
                        },
                    },
                    engagementByEventId: {
                        'repost-no-comment': {
                            replies: 0,
                            reposts: 0,
                            reactions: 0,
                            zaps: 0,
                            zapSats: 0,
                        },
                        'embedded-note': {
                            replies: 1,
                            reposts: 2,
                            reactions: 3,
                            zaps: 4,
                            zapSats: 210,
                        },
                    },
                    items: [
                        {
                            id: 'repost-no-comment',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: JSON.stringify({
                                id: 'embedded-note',
                                pubkey: 'b'.repeat(64),
                                created_at: 90,
                                kind: 1,
                                content: 'nota citada',
                                tags: [],
                            }),
                            kind: 'repost',
                            rawEvent: {
                                id: 'repost-no-comment',
                                pubkey: 'a'.repeat(64),
                                kind: 6,
                                created_at: 100,
                                tags: [['e', 'embedded-note']],
                                content: '',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).not.toContain('Repost sin comentario');
        expect(text).not.toContain('Nota original');
        expect(text).not.toContain('Nota');
        expect(text).not.toContain('(sin contenido)');
        expect(text).toContain('nota citada');

        const itemWrapper = rendered.container.querySelector('.nostr-following-feed-items > .grid.gap-2') as HTMLDivElement;
        expect(itemWrapper).not.toBeNull();
        expect(itemWrapper.children).toHaveLength(1);

        expect(rendered.container.querySelector('button[aria-label="Abrir acciones para la nota repost-no-comment"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Responder (1)"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Reaccionar (3)"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Repostear (2)"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Sats recibidos: 210"]')).not.toBeNull();

        expect(rendered.container.querySelector('time[datetime]')).not.toBeNull();
        expect(rendered.container.querySelector('.nostr-following-feed-card-time')).toBeNull();

        const copyMenuButton = rendered.container.querySelector('button[aria-label="Abrir acciones para la nota repost-no-comment"]') as HTMLButtonElement;
        expect(copyMenuButton).toBeDefined();

        await act(async () => {
            copyMenuButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            copyMenuButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const copyItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Copiar ID de evento'
        ) as HTMLElement;

        await act(async () => {
            copyItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onCopyNoteId).toHaveBeenCalledWith('repost-no-comment');
    });

    test('keeps raw repost text when embedded repost parsing fails', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    items: [
                        {
                            id: 'repost-invalid-json',
                            pubkey: 'a'.repeat(64),
                            createdAt: 120,
                            content: '{"id":"broken",',
                            kind: 'repost',
                            rawEvent: {
                                id: 'repost-invalid-json',
                                pubkey: 'a'.repeat(64),
                                kind: 6,
                                created_at: 120,
                                tags: [['e', 'broken']],
                                content: '{"id":"broken",',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('{"id":"broken",');
    });

    test('keeps feed, root and reply action buttons disabled when pending and when canWrite is false', async () => {
        const renderedFeed = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    canWrite: false,
                    pendingReactionByEventId: {
                        'feed-1': false,
                    },
                    pendingRepostByEventId: {
                        'feed-1': false,
                    },
                    engagementByEventId: {
                        'feed-1': {
                            replies: 1,
                            reposts: 2,
                            reactions: 3,
                            zaps: 0,
                            zapSats: 210,
                        },
                    },
                    items: [
                        {
                            id: 'feed-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'feed note',
                            kind: 'note',
                            rawEvent: {
                                id: 'feed-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'feed note',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(renderedFeed);

        const feedReactionButton = renderedFeed.container.querySelector('button[aria-label="Reaccionar (3)"]') as HTMLButtonElement;
        const feedRepostButton = renderedFeed.container.querySelector('button[aria-label="Repostear (2)"]') as HTMLButtonElement;
        expect(feedReactionButton.disabled).toBe(true);
        expect(feedRepostButton.disabled).toBe(true);

        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    canWrite: false,
                    pendingReactionByEventId: {
                        'root-1': true,
                        'reply-1': true,
                    },
                    pendingRepostByEventId: {
                        'root-1': true,
                        'reply-1': true,
                    },
                    engagementByEventId: {
                        'root-1': {
                            replies: 1,
                            reposts: 5,
                            reactions: 7,
                            zaps: 0,
                            zapSats: 99,
                        },
                        'reply-1': {
                            replies: 0,
                            reposts: 6,
                            reactions: 8,
                            zaps: 0,
                            zapSats: 33,
                        },
                    },
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root',
                            },
                        },
                        replies: [
                            {
                                id: 'reply-1',
                                pubkey: 'c'.repeat(64),
                                createdAt: 510,
                                eventKind: 1,
                                content: 'reply one',
                                targetEventId: 'root-1',
                                rawEvent: {
                                    id: 'reply-1',
                                    pubkey: 'c'.repeat(64),
                                    kind: 1,
                                    created_at: 510,
                                    tags: [['e', 'root-1']],
                                    content: 'reply one',
                                },
                            },
                        ],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        const threadRootReaction = rendered.container.querySelector('button[aria-label="Reaccionar (7)"]') as HTMLButtonElement;
        const threadRootRepost = rendered.container.querySelector('button[aria-label="Repostear (5)"]') as HTMLButtonElement;
        const threadReplyReaction = rendered.container.querySelector('button[aria-label="Reaccionar (8)"]') as HTMLButtonElement;
        const threadReplyRepost = rendered.container.querySelector('button[aria-label="Repostear (6)"]') as HTMLButtonElement;

        expect(threadRootReaction.disabled).toBe(true);
        expect(threadRootRepost.disabled).toBe(true);
        expect(threadReplyReaction.disabled).toBe(true);
        expect(threadReplyRepost.disabled).toBe(true);
        expect(rendered.container.querySelector('[aria-label="Sats recibidos: 99"]')).toBeDefined();
        expect(rendered.container.querySelector('[aria-label="Sats recibidos: 33"]')).toBeDefined();
    });

    test('keeps copy note id callback for feed and thread notes', async () => {
        const onCopyNoteId = vi.fn();
        const renderedFeed = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onCopyNoteId,
                    items: [
                        {
                            id: 'feed-copy-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'feed copy',
                            kind: 'note',
                            rawEvent: {
                                id: 'feed-copy-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'feed copy',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(renderedFeed);

        const feedCopyMenuButton = renderedFeed.container.querySelector('button[aria-label="Abrir acciones para la nota feed-copy-1"]') as HTMLButtonElement;
        expect(feedCopyMenuButton).toBeDefined();
        await act(async () => {
            feedCopyMenuButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            feedCopyMenuButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const feedCopyItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Copiar ID de evento'
        ) as HTMLElement;
        await act(async () => {
            feedCopyItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onCopyNoteId,
                    items: [
                        {
                            id: 'feed-copy-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'feed copy',
                            kind: 'note',
                            rawEvent: {
                                id: 'feed-copy-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'feed copy',
                            },
                        },
                    ],
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root',
                            },
                        },
                        replies: [
                            {
                                id: 'reply-1',
                                pubkey: 'c'.repeat(64),
                                createdAt: 510,
                                eventKind: 1,
                                content: 'reply one',
                                targetEventId: 'root-1',
                                rawEvent: {
                                    id: 'reply-1',
                                    pubkey: 'c'.repeat(64),
                                    kind: 1,
                                    created_at: 510,
                                    tags: [['e', 'root-1']],
                                    content: 'reply one',
                                },
                            },
                        ],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        const rootCopyMenuButton = rendered.container.querySelector('button[aria-label="Abrir acciones para la nota root-1"]') as HTMLButtonElement;
        const replyCopyMenuButton = rendered.container.querySelector('button[aria-label="Abrir acciones para la nota reply-1"]') as HTMLButtonElement;
        expect(rootCopyMenuButton).toBeDefined();
        expect(replyCopyMenuButton).toBeDefined();

        await act(async () => {
            rootCopyMenuButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            rootCopyMenuButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const rootCopyItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Copiar ID de evento'
        ) as HTMLElement;
        await act(async () => {
            rootCopyItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await act(async () => {
            replyCopyMenuButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            replyCopyMenuButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const replyCopyItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Copiar ID de evento'
        ) as HTMLElement;
        await act(async () => {
            replyCopyItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onCopyNoteId).toHaveBeenCalledWith('root-1');
        expect(onCopyNoteId).toHaveBeenCalledWith('reply-1');
    });

    test('renders image/video URLs and makes hashtags clickable', async () => {
        const onSelectHashtag = vi.fn();
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onSelectHashtag,
                    items: [
                        {
                            id: 'note-media-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'Mira #NostrCity https://example.com/photo.jpg https://example.com/clip.mp4',
                            kind: 'note',
                            rawEvent: {
                                id: 'note-media-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'Mira #NostrCity https://example.com/photo.jpg https://example.com/clip.mp4',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('img[src="https://example.com/photo.jpg"]')).toBeDefined();
        expect(rendered.container.querySelector('video')).toBeDefined();

        const hashtagButton = rendered.container.querySelector('button[aria-label="Filtrar por hashtag nostrcity"]') as HTMLButtonElement;
        expect(hashtagButton).toBeDefined();

        await act(async () => {
            hashtagButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectHashtag).toHaveBeenCalledWith('nostrcity');
    });

    test('renders nostr profile mentions with resolved names and opens profile on click', async () => {
        const mentionPubkey = 'c'.repeat(64);
        const mentionNprofile = nip19.nprofileEncode({ pubkey: mentionPubkey });
        const onSelectProfile = vi.fn();

        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onSelectProfile,
                    profilesByPubkey: {
                        [mentionPubkey]: {
                            pubkey: mentionPubkey,
                            displayName: 'Carlos Mention',
                        },
                    },
                    items: [
                        {
                            id: 'note-mention-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: `hola nostr:${mentionNprofile}`,
                            kind: 'note',
                            rawEvent: {
                                id: 'note-mention-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: `hola nostr:${mentionNprofile}`,
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        const mentionButton = rendered.container.querySelector('button[aria-label="Abrir perfil de Carlos Mention"]') as HTMLButtonElement;
        expect(mentionButton).toBeDefined();
        expect(mentionButton.textContent || '').toContain('@Carlos Mention');

        await act(async () => {
            mentionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectProfile).toHaveBeenCalledWith(mentionPubkey);
    });

    test('requests profile resolution for unresolved mention pubkeys', async () => {
        const mentionPubkey = 'd'.repeat(64);
        const mentionNprofile = nip19.nprofileEncode({ pubkey: mentionPubkey });
        const onResolveProfiles = vi.fn(async () => {});

        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onResolveProfiles,
                    items: [
                        {
                            id: 'note-mention-resolve',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: `mencion nostr:${mentionNprofile}`,
                            kind: 'note',
                            rawEvent: {
                                id: 'note-mention-resolve',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: `mencion nostr:${mentionNprofile}`,
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(onResolveProfiles).toHaveBeenCalledWith([mentionPubkey]);
    });

    test('renders nevent references as embedded quoted note cards and opens thread callback on click', async () => {
        const referencedEventId = 'e'.repeat(64);
        const referencedAuthorPubkey = 'f'.repeat(64);
        const nevent = nip19.neventEncode({ id: referencedEventId, author: referencedAuthorPubkey });
        const onSelectEventReference = vi.fn();

        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onSelectEventReference,
                    profilesByPubkey: {
                        [referencedAuthorPubkey]: {
                            pubkey: referencedAuthorPubkey,
                            displayName: 'Nora Referenced',
                        },
                    },
                    eventReferencesById: {
                        [referencedEventId]: {
                            id: referencedEventId,
                            pubkey: referencedAuthorPubkey,
                            kind: 1,
                            created_at: 1700000000,
                            tags: [],
                            content: 'contenido de la nota citada',
                        },
                    },
                    items: [
                        {
                            id: 'note-ref-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: `mira esto nostr:${nevent}`,
                            kind: 'note',
                            rawEvent: {
                                id: 'note-ref-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: `mira esto nostr:${nevent}`,
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').not.toContain('Nota referenciada');
        expect(rendered.container.textContent || '').toContain('Nora Referenced');
        expect(rendered.container.textContent || '').toContain('contenido de la nota citada');

        const openReferenceButton = rendered.container.querySelector(`button[aria-label="Abrir nota referenciada ${referencedEventId}"]`) as HTMLButtonElement;
        expect(openReferenceButton).toBeDefined();

        await act(async () => {
            openReferenceButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectEventReference).toHaveBeenCalledWith(referencedEventId);
    });

    test('requests unresolved nevent references for lazy loading', async () => {
        const referencedEventId = '1'.repeat(64);
        const nevent = nip19.neventEncode({ id: referencedEventId });
        const onResolveEventReferences = vi.fn(async () => {});

        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onResolveEventReferences,
                    items: [
                        {
                            id: 'note-ref-resolve',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: `referencia nostr:${nevent}`,
                            kind: 'note',
                            rawEvent: {
                                id: 'note-ref-resolve',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: `referencia nostr:${nevent}`,
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Cargando nota referenciada...');
        expect(text).not.toContain('Pendiente de carga');
        expect(rendered.container.querySelector('[aria-live="polite"]')).toBeDefined();
        expect(rendered.container.querySelector('svg[aria-label="Loading"]')).toBeDefined();

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(onResolveEventReferences).toHaveBeenCalledWith([referencedEventId], undefined);
    });

    test('shows exhausted fallback with accessible open reference CTA after max retries', async () => {
        vi.useFakeTimers();
        try {
            const referencedEventId = '9'.repeat(64);
            const nevent = nip19.neventEncode({ id: referencedEventId });
            const onResolveEventReferences = vi.fn(async () => ({}));

            const rendered = await renderElement(
                <FollowingFeedSurface
                    {...buildProps({
                        onResolveEventReferences,
                        items: [
                            {
                                id: 'note-ref-exhausted',
                                pubkey: 'a'.repeat(64),
                                createdAt: 100,
                                content: `agotada nostr:${nevent}`,
                                kind: 'note',
                                rawEvent: {
                                    id: 'note-ref-exhausted',
                                    pubkey: 'a'.repeat(64),
                                    kind: 1,
                                    created_at: 100,
                                    tags: [],
                                    content: `agotada nostr:${nevent}`,
                                },
                            },
                        ],
                    })}
                />
            );
            mounted.push(rendered);

            await act(async () => {
                await Promise.resolve();
            });
            expect(onResolveEventReferences).toHaveBeenCalledTimes(1);

            await act(async () => {
                vi.advanceTimersByTime(1_600);
                await Promise.resolve();
            });
            expect(onResolveEventReferences).toHaveBeenCalledTimes(2);

            await act(async () => {
                vi.advanceTimersByTime(1_600);
                await Promise.resolve();
            });
            expect(onResolveEventReferences).toHaveBeenCalledTimes(3);

            const text = rendered.container.textContent || '';
            expect(text).toContain('No se pudo cargar la nota referenciada.');
            expect(rendered.container.querySelector(`button[aria-label="Abrir nota referenciada ${referencedEventId}"]`)).toBeDefined();
        } finally {
            vi.useRealTimers();
        }
    });

    test('renders mixed references without blocking resolved quoted note', async () => {
        const resolvedReferenceId = '7'.repeat(64);
        const unresolvedReferenceId = '8'.repeat(64);
        const resolvedAuthorPubkey = '6'.repeat(64);
        const resolvedNevent = nip19.neventEncode({ id: resolvedReferenceId, author: resolvedAuthorPubkey });
        const unresolvedNevent = nip19.neventEncode({ id: unresolvedReferenceId });

        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    eventReferencesById: {
                        [resolvedReferenceId]: {
                            id: resolvedReferenceId,
                            pubkey: resolvedAuthorPubkey,
                            kind: 1,
                            created_at: 1700000001,
                            tags: [],
                            content: 'nota resuelta visible',
                        },
                    },
                    profilesByPubkey: {
                        [resolvedAuthorPubkey]: {
                            pubkey: resolvedAuthorPubkey,
                            displayName: 'Rita Resuelta',
                        },
                    },
                    items: [
                        {
                            id: 'note-ref-mixed',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: `mixto nostr:${resolvedNevent} y nostr:${unresolvedNevent}`,
                            kind: 'note',
                            rawEvent: {
                                id: 'note-ref-mixed',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: `mixto nostr:${resolvedNevent} y nostr:${unresolvedNevent}`,
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('nota resuelta visible');
        expect(text).toContain('Cargando nota referenciada...');
    });

    test('retries unresolved nevent references when initial resolve returns empty', async () => {
        vi.useFakeTimers();
        try {
            const referencedEventId = '2'.repeat(64);
            const nevent = nip19.neventEncode({ id: referencedEventId });
            const onResolveEventReferences = vi.fn(async () => ({}));

            const rendered = await renderElement(
                <FollowingFeedSurface
                    {...buildProps({
                        onResolveEventReferences,
                        items: [
                            {
                                id: 'note-ref-retry',
                                pubkey: 'a'.repeat(64),
                                createdAt: 100,
                                content: `retry nostr:${nevent}`,
                                kind: 'note',
                                rawEvent: {
                                    id: 'note-ref-retry',
                                    pubkey: 'a'.repeat(64),
                                    kind: 1,
                                    created_at: 100,
                                    tags: [],
                                    content: `retry nostr:${nevent}`,
                                },
                            },
                        ],
                    })}
                />
            );
            mounted.push(rendered);

            await act(async () => {
                await Promise.resolve();
            });
            expect(onResolveEventReferences).toHaveBeenCalledTimes(1);

            await act(async () => {
                vi.advanceTimersByTime(1_600);
                await Promise.resolve();
            });

            expect(onResolveEventReferences).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    test('opens per-post media lightbox when clicking an image', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    items: [
                        {
                            id: 'note-lightbox-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'https://example.com/photo-1.jpg https://example.com/photo-2.jpg',
                            kind: 'note',
                            rawEvent: {
                                id: 'note-lightbox-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'https://example.com/photo-1.jpg https://example.com/photo-2.jpg',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        const image = rendered.container.querySelector('img[src="https://example.com/photo-1.jpg"]') as HTMLImageElement;
        expect(image).toBeDefined();

        await act(async () => {
            image.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const lightboxRoot = document.body.querySelector('.yarl__root');
        expect(lightboxRoot).toBeDefined();
    });

    test('renders active hashtag subtitle and clear action', async () => {
        const onClearHashtag = vi.fn();
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    activeHashtag: 'nostrcity',
                    onClearHashtag,
                })}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Filtrando por #nostrcity');
        const clearButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Quitar filtro'
        ) as HTMLButtonElement;
        expect(clearButton).toBeDefined();

        await act(async () => {
            clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onClearHashtag).toHaveBeenCalledTimes(1);
    });
});
