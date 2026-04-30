import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import {
    getZapSenderPubkey,
    getLastTagValue,
    hasPTag,
    getNumericTagValue,
    type SocialNotificationEvent,
    type SocialNotificationItem,
    type SocialNotificationsPage,
    type SocialNotificationKind,
    type SocialNotificationsService,
} from '../../nostr/social-notifications-service';
import { nostrOverlayQueryKeys } from './keys';
import {
    createSocialReadStateStorage,
    fallbackStorage,
    normalizeToEpochSeconds,
    type SocialReadStateStorage,
} from './read-state';
import { createSocialQueryOptions } from './options';

const SOCIAL_KINDS = new Set<number>([1, 6, 7, 16, 9735]);
const SOCIAL_NOTIFICATIONS_MAX_ITEMS = 200;

interface UseSocialNotificationsControllerOptions {
    ownerPubkey?: string;
    service: SocialNotificationsService;
    storage?: SocialReadStateStorage;
    now?: () => number;
    maxItems?: number;
}

interface SocialNotificationsControllerState {
    items: SocialNotificationItem[];
    hasUnread: boolean;
    hasMore: boolean;
    lastReadAt: number;
    isOpen: boolean;
    pendingSnapshot: SocialNotificationItem[];
    isBootstrapping: boolean;
    isLoadingMore: boolean;
    bootstrapError: string | null;
    open: () => void;
    close: () => void;
    loadMore: () => Promise<void>;
    retry: () => Promise<void>;
}

interface SocialNotificationsItemsPage {
    items: SocialNotificationItem[];
    hasMore: boolean;
    nextSince: number | null;
}

function toSocialNotificationKind(value: number): SocialNotificationKind | null {
    if (value === 1 || value === 6 || value === 7 || value === 16 || value === 9735) {
        return value;
    }

    return null;
}

function shouldIncludeEvent(event: SocialNotificationEvent, ownerPubkey: string): boolean {
    if (!event || typeof event !== 'object') {
        return false;
    }

    if (!SOCIAL_KINDS.has(event.kind)) {
        return false;
    }

    if (typeof event.id !== 'string' || event.id.length === 0) {
        return false;
    }

    if (typeof event.pubkey !== 'string' || event.pubkey.length === 0 || event.pubkey === ownerPubkey) {
        return false;
    }

    if (typeof event.created_at !== 'number' || !Number.isFinite(event.created_at)) {
        return false;
    }

    if (!Array.isArray(event.tags)) {
        return false;
    }

    return hasPTag(event.tags, ownerPubkey);
}

function toItem(event: SocialNotificationEvent): SocialNotificationItem | null {
    const kind = toSocialNotificationKind(event.kind);
    if (!kind) {
        return null;
    }

    const targetEventId = getLastTagValue(event.tags, 'e');
    const targetPubkey = getLastTagValue(event.tags, 'p');
    const targetKind = getNumericTagValue(event.tags, 'k');
    const targetAddress = getLastTagValue(event.tags, 'a');

    const actorPubkey = kind === 9735
        ? getZapSenderPubkey(event) ?? ''
        : event.pubkey;

    return {
        id: event.id,
        kind,
        actorPubkey,
        createdAt: normalizeToEpochSeconds(event.created_at),
        content: event.content,
        ...(targetEventId ? { targetEventId } : {}),
        ...(targetPubkey ? { targetPubkey } : {}),
        ...(targetKind !== undefined ? { targetKind } : {}),
        ...(targetAddress ? { targetAddress } : {}),
        rawEvent: event,
    };
}

function sortItems(items: SocialNotificationItem[]): SocialNotificationItem[] {
    return [...items].sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
            return right.createdAt - left.createdAt;
        }

        return left.id.localeCompare(right.id);
    });
}

function dedupeItems(items: SocialNotificationItem[]): SocialNotificationItem[] {
    const byId = new Map<string, SocialNotificationItem>();
    for (const item of items) {
        if (!byId.has(item.id)) {
            byId.set(item.id, item);
        }
    }

    return sortItems([...byId.values()]);
}

function toItemsPage(page: SocialNotificationsPage, ownerPubkey: string): SocialNotificationsItemsPage {
    const items: SocialNotificationItem[] = [];

    for (const event of page.items) {
        if (!shouldIncludeEvent(event, ownerPubkey)) {
            continue;
        }

        const item = toItem(event);
        if (item) {
            items.push(item);
        }
    }

    return {
        items: sortItems(items),
        hasMore: page.hasMore,
        nextSince: page.nextSince,
    };
}

function flattenPages(data: InfiniteData<SocialNotificationsItemsPage> | undefined): SocialNotificationItem[] {
    return dedupeItems(data?.pages.flatMap((page) => page.items) ?? []);
}

function upsertNotificationItem(items: SocialNotificationItem[], nextItem: SocialNotificationItem, maxItems: number): SocialNotificationItem[] {
    if (items.some((item) => item.id === nextItem.id)) {
        return items;
    }

    return sortItems([nextItem, ...items]).slice(0, maxItems);
}

function computeHasUnread(items: SocialNotificationItem[], lastReadAt: number): boolean {
    return items.some((item) => item.createdAt > lastReadAt);
}

export function useSocialNotificationsController(
    options: UseSocialNotificationsControllerOptions
): SocialNotificationsControllerState {
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));
    const maxItems = Math.max(1, options.maxItems ?? SOCIAL_NOTIFICATIONS_MAX_ITEMS);
    const storage = useMemo(() => {
        if (options.storage) {
            return options.storage;
        }

        const backingStorage = typeof window === 'undefined' ? fallbackStorage : window.localStorage;
        return createSocialReadStateStorage({
            storage: backingStorage,
            version: 'v1',
        });
    }, [options.storage]);

    const [isOpen, setIsOpen] = useState(false);
    const [pendingSnapshot, setPendingSnapshot] = useState<SocialNotificationItem[]>([]);
    const [lastReadAt, setLastReadAt] = useState(() =>
        options.ownerPubkey ? storage.getLastReadAt(options.ownerPubkey) : 0
    );

    const queryClient = useQueryClient();
    const queryKey = useMemo(() => nostrOverlayQueryKeys.notifications({
        ownerPubkey: options.ownerPubkey || '',
        limit: maxItems,
    }), [maxItems, options.ownerPubkey]);

    const notificationsQuery = useInfiniteQuery<SocialNotificationsItemsPage, Error>(createSocialQueryOptions({
        queryKey,
        queryFn: async ({ pageParam }: { pageParam: unknown }): Promise<SocialNotificationsItemsPage> => {
            if (!options.ownerPubkey) {
                return { items: [], hasMore: false, nextSince: null };
            }

            const since = typeof pageParam === 'number' ? pageParam : undefined;
            const input = {
                ownerPubkey: options.ownerPubkey,
                limit: maxItems,
                ...(since !== undefined ? { since } : {}),
            };
            const page = await options.service.loadInitialSocial(input);

            return toItemsPage(page, options.ownerPubkey);
        },
        enabled: Boolean(options.ownerPubkey),
        initialPageParam: undefined,
        getNextPageParam: (lastPage: SocialNotificationsItemsPage) => (
            lastPage.hasMore && typeof lastPage.nextSince === 'number' ? lastPage.nextSince : undefined
        ),
    }));

    useEffect(() => {
        if (!options.ownerPubkey) {
            setLastReadAt(0);
            setPendingSnapshot([]);
            setIsOpen(false);
            return;
        }

        setLastReadAt(storage.getLastReadAt(options.ownerPubkey));
        setPendingSnapshot([]);
        setIsOpen(false);
    }, [options.ownerPubkey, storage]);

    useEffect(() => {
        if (!options.ownerPubkey) {
            return;
        }

        return options.service.subscribeSocial({ ownerPubkey: options.ownerPubkey }, (event) => {
            if (!shouldIncludeEvent(event, options.ownerPubkey!)) {
                return;
            }

            const item = toItem(event);
            if (!item) {
                return;
            }

            queryClient.setQueryData<InfiniteData<SocialNotificationsItemsPage>>(queryKey, (current) => {
                const firstPage = current?.pages[0] ?? { items: [], hasMore: false, nextSince: null };
                const nextFirstPage = {
                    ...firstPage,
                    items: upsertNotificationItem(firstPage.items, item, maxItems),
                };

                if (!current) {
                    return {
                        pages: [nextFirstPage],
                        pageParams: [undefined],
                    };
                }

                return {
                    ...current,
                    pages: [nextFirstPage, ...current.pages.slice(1)],
                };
            });
        });
    }, [maxItems, options.ownerPubkey, options.service, queryClient, queryKey]);

    const items = useMemo(() => flattenPages(notificationsQuery.data), [notificationsQuery.data]);
    const hasUnread = useMemo(() => computeHasUnread(items, lastReadAt), [items, lastReadAt]);

    const open = useCallback(() => {
        setPendingSnapshot(items.filter((item) => item.createdAt > lastReadAt));
        setIsOpen(true);

        if (options.ownerPubkey) {
            const nextLastReadAt = Math.max(lastReadAt, normalizeToEpochSeconds(now()));
            setLastReadAt(nextLastReadAt);
            storage.setLastReadAt(options.ownerPubkey, nextLastReadAt);
        }
    }, [items, lastReadAt, now, options.ownerPubkey, storage]);

    const close = useCallback(() => {
        setIsOpen(false);
        setPendingSnapshot([]);
    }, []);

    const loadMore = useCallback(async () => {
        if (!notificationsQuery.hasNextPage || notificationsQuery.isFetchingNextPage) {
            return;
        }

        await notificationsQuery.fetchNextPage();
    }, [notificationsQuery]);

    const retry = useCallback(async () => {
        await notificationsQuery.refetch();
    }, [notificationsQuery]);

    return {
        items,
        hasUnread,
        hasMore: Boolean(notificationsQuery.hasNextPage),
        lastReadAt,
        isOpen,
        pendingSnapshot,
        isBootstrapping: notificationsQuery.isPending,
        isLoadingMore: notificationsQuery.isFetchingNextPage,
        bootstrapError: notificationsQuery.error instanceof Error
            ? notificationsQuery.error.message
            : notificationsQuery.error
                ? 'No se pudieron cargar las notificaciones'
                : null,
        open,
        close,
        loadMore,
        retry,
    };
}
