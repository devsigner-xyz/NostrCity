/** @vitest-environment jsdom */

import { act, createElement, useEffect, useMemo, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { SocialNotificationEvent, SocialNotificationsService } from '../../nostr/social-notifications-service';
import { useSocialNotificationsController } from './social-notifications.query';
import { createNostrOverlayQueryClient } from './query-client';

const OWNER = 'b'.repeat(64);

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

function event(id: string, createdAt: number): SocialNotificationEvent {
    return {
        id,
        pubkey: 'a'.repeat(64),
        kind: 7,
        created_at: createdAt,
        content: '+',
        tags: [['p', OWNER], ['e', 'c'.repeat(64)]],
    };
}

function page(items: SocialNotificationEvent[], hasMore: boolean, nextSince?: number) {
    return {
        items,
        hasMore,
        nextSince: nextSince ?? null,
    };
}

function NotificationsProbe({ service, onUpdate }: {
    service: SocialNotificationsService;
    onUpdate: (next: ReturnType<typeof useSocialNotificationsController>) => void;
}): null {
    const storage = useMemo(() => ({
        getLastReadAt: () => 0,
        setLastReadAt: () => undefined,
    }), []);
    const state = useSocialNotificationsController({
        ownerPubkey: OWNER,
        service,
        storage,
        now: () => 1_000,
        maxItems: 2,
    });

    useEffect(() => {
        onUpdate(state);
    }, [onUpdate, state]);

    return null;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = createNostrOverlayQueryClient();

    await act(async () => {
        root.render(createElement(QueryClientProvider, { client: queryClient }, element));
    });

    return { container, root };
}

async function waitFor(condition: () => boolean): Promise<void> {
    for (let index = 0; index < 50; index += 1) {
        if (condition()) {
            return;
        }

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }

    throw new Error('Condition was not met in time');
}

let mounted: RenderResult[] = [];

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
    mounted = [];
});

describe('useSocialNotificationsController', () => {
    test('loads older notification pages and dedupes by id', async () => {
        const loadInitialSocial = vi.fn(async ({ since }: { since?: number }) => {
            if (typeof since === 'number') {
                return page([event('2'.repeat(64), 90), event('1'.repeat(64), 80)], false);
            }

            return page([event('3'.repeat(64), 120), event('2'.repeat(64), 90)], true, 89);
        });
        const service: SocialNotificationsService = {
            subscribeSocial: vi.fn(() => () => undefined),
            loadInitialSocial: loadInitialSocial as unknown as SocialNotificationsService['loadInitialSocial'],
        };
        let latest: ReturnType<typeof useSocialNotificationsController> | null = null;

        const rendered = await renderElement(createElement(NotificationsProbe, {
            service,
            onUpdate: (next) => {
                latest = next;
            },
        }));
        mounted.push(rendered);

        await waitFor(() => Boolean(latest && latest.items.length === 2 && latest.hasMore));

        await act(async () => {
            await latest?.loadMore();
        });

        await waitFor(() => Boolean(latest && latest.items.length === 3 && !latest.hasMore));

        const loadedItems = (latest as ReturnType<typeof useSocialNotificationsController> | null)?.items ?? [];
        expect(loadedItems.map((item) => item.id)).toEqual(['3'.repeat(64), '2'.repeat(64), '1'.repeat(64)]);
        expect(loadInitialSocial).toHaveBeenNthCalledWith(1, { ownerPubkey: OWNER, limit: 2 });
        expect(loadInitialSocial).toHaveBeenNthCalledWith(2, { ownerPubkey: OWNER, limit: 2, since: 89 });
    });
});
