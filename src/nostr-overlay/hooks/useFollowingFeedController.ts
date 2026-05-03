import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type InfiniteData, useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import type {
    SocialEngagementByEventId,
    SocialEngagementMetrics,
    SocialFeedPage,
    SocialFeedService,
    SocialThreadPage,
    ViewerReaction,
    ViewerReactionByEventId,
    ViewerReplyByEventId,
    ViewerZapByEventId,
} from '../../nostr/social-feed-service';
import {
    buildQuoteContent,
    buildQuoteTags,
    buildPendingByEventId,
    buildReplyTags,
    followingFeedMutationKeys,
    prependFeedItem,
    sanitizeContent,
    toFeedItemFromPublished,
    toThreadItemFromPublished,
    type PublishReplyInput,
    type PublishQuoteInput,
    type ToggleReactionInput,
    type ToggleRepostInput,
    type WriteGatewayLike,
} from '../query/following-feed.mutations';
import { nostrOverlayQueryKeys } from '../query/keys';
import {
    applyEngagementDeltas,
    collectEngagementEventIds,
    createEmptyEngagementByEventIds,
    mergeThreadReplies,
    normalizeEventIds,
    selectFeedItemsFromPages,
    selectThreadViewFromPages,
} from '../query/following-feed.selectors';
import {
    useFollowingFeedEngagementQuery,
    useFollowingFeedInfiniteQuery,
    normalizeEngagementEventIds,
    useThreadInfiniteQuery,
    useViewerReactionsQuery,
    useViewerRepliesQuery,
    useViewerZapsQuery,
} from '../query/following-feed.query';
import type { FollowingFeedQueryInput } from '../query/types';
import {
    createFollowingFeedReadStateStorage,
    fallbackStorage,
    normalizeToEpochSeconds,
    type FollowingFeedReadStateStorage,
} from '../query/following-feed-read-state';

const FOLLOWING_FEED_REFRESH_INTERVAL_MS = 15_000;
const FOLLOWING_FEED_REFRESH_ERROR_MESSAGE = 'No se pudo actualizar el Agora. Intenta de nuevo.';
import { createMentionDraft, serializeMentionDraft, type MentionDraft } from '../mention-serialization';

interface UseFollowingFeedControllerOptions {
    ownerPubkey?: string;
    follows: string[];
    hashtag?: string;
    canWrite: boolean;
    service: SocialFeedService;
    storage?: FollowingFeedReadStateStorage;
    writeGateway?: WriteGatewayLike;
    now?: () => number;
    pageSize?: number;
    threadPageSize?: number;
    activeThreadRootEventId?: string;
    onOpenThread: (eventId: string) => void;
    onCloseThread: () => void;
}

interface ToggleReactionMutationVariables {
    input: ToggleReactionInput;
    previous: ViewerReaction | undefined;
    next: boolean;
    reactionEventId: string | undefined;
}

interface ToggleRepostMutationVariables {
    input: ToggleRepostInput;
    previous: boolean;
    next: boolean;
    repostEventId: string | undefined;
}

interface PublishPostMutationVariables {
    visibleContent: string;
    content: string;
    tags: string[][];
}

interface PublishReplyMutationVariables {
    input: PublishReplyInput;
    rootEventId: string;
    visibleContent: string;
    content: string;
    tags: string[][];
}

interface PublishQuoteMutationVariables {
    input: PublishQuoteInput;
    visibleContent: string;
    content: string;
    tags: string[][];
}

type ComposerContentInput = string | MentionDraft;

interface ComposerImageAttachmentInput {
    url: string;
    tags: string[][];
}

interface PublishPostComposerInput {
    content: ComposerContentInput;
    image?: ComposerImageAttachmentInput;
}

interface PublishReplyComposerInput extends Omit<PublishReplyInput, 'content'> {
    content: ComposerContentInput;
    image?: ComposerImageAttachmentInput;
}

interface PublishQuoteComposerInput extends Omit<PublishQuoteInput, 'content'> {
    content: ComposerContentInput;
    image?: ComposerImageAttachmentInput;
}

interface PublishReplyMutationContext {
    targetEventId: string;
    threadKey: ReturnType<typeof nostrOverlayQueryKeys.thread>;
}

const EMPTY_ENGAGEMENT_METRICS: SocialEngagementMetrics = {
    replies: 0,
    reposts: 0,
    reactions: 0,
    zaps: 0,
    zapSats: 0,
};

function normalizeHashtag(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalized = value.trim().replace(/^#+/, '').toLowerCase();
    return normalized.length > 0 ? normalized : undefined;
}

function buildFollowingFeedQueryInput(input: {
    ownerPubkey: string | undefined;
    follows: string[];
    hashtag: string | undefined;
    pageSize: number;
}): FollowingFeedQueryInput {
    const queryInput: FollowingFeedQueryInput = {
        follows: input.follows,
        pageSize: input.pageSize,
    };

    if (input.ownerPubkey) {
        queryInput.ownerPubkey = input.ownerPubkey;
    }

    if (input.hashtag) {
        queryInput.hashtag = input.hashtag;
    }

    return queryInput;
}

function normalizeComposerInput(input: ComposerContentInput): {
    visibleContent: string;
    serializedContent: string;
    tags: string[][];
} {
    const draft = typeof input === 'string' ? createMentionDraft(input) : input;
    const serialized = serializeMentionDraft(draft);

    return {
        visibleContent: sanitizeContent(draft.text),
        serializedContent: sanitizeContent(serialized.content),
        tags: serialized.tags,
    };
}

function normalizePublishComposerInput(input: ComposerContentInput | PublishPostComposerInput): {
    visibleContent: string;
    serializedContent: string;
    tags: string[][];
} {
    const composerInput = isPublishPostComposerInput(input) ? input.content : input;
    const image = isPublishPostComposerInput(input) ? input.image : undefined;
    const normalized = normalizeComposerInput(composerInput);
    const visibleContent = appendImageUrl(normalized.visibleContent, image?.url);
    const serializedContent = appendImageUrl(normalized.serializedContent, image?.url);

    return {
        visibleContent,
        serializedContent,
        tags: mergeUniqueTags(normalized.tags, image?.tags ?? []),
    };
}

function isPublishPostComposerInput(input: ComposerContentInput | PublishPostComposerInput): input is PublishPostComposerInput {
    return typeof input === 'object' && input !== null && 'content' in input;
}

function appendImageUrl(content: string, url: string | undefined): string {
    if (!url) {
        return content;
    }

    return content.length > 0 ? `${content}\n${url}` : url;
}

function mergeUniqueTags(...tagCollections: string[][][]): string[][] {
    const merged: string[][] = [];
    const seen = new Set<string>();

    for (const tags of tagCollections) {
        for (const tag of tags) {
            const key = tag.join('\u0000');
            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            merged.push(tag);
        }
    }

    return merged;
}

export function useFollowingFeedController(options: UseFollowingFeedControllerOptions) {
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));
    const queryClient = useQueryClient();
    const storage = useMemo(() => {
        if (options.storage) {
            return options.storage;
        }

        const backingStorage = typeof window === 'undefined' ? fallbackStorage : window.localStorage;
        return createFollowingFeedReadStateStorage({
            storage: backingStorage,
            version: 'v1',
        });
    }, [options.storage]);
    const [isOpen, setIsOpen] = useState(false);
    const [lastReadAt, setLastReadAt] = useState(() =>
        options.ownerPubkey ? storage.getLastReadAt(options.ownerPubkey) : 0
    );
    const [publishError, setPublishError] = useState<string | null>(null);
    const [refreshError, setRefreshError] = useState<string | null>(null);
    const [pendingLatestFeedPage, setPendingLatestFeedPage] = useState<SocialFeedPage | null>(null);
    const [pendingNewCount, setPendingNewCount] = useState(0);
    const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
    const [viewerReactionByEventId, setViewerReactionByEventId] = useState<ViewerReactionByEventId>({});
    const [viewerZapByEventId, setViewerZapByEventId] = useState<ViewerZapByEventId>({});
    const [viewerReplyByEventId, setViewerReplyByEventId] = useState<ViewerReplyByEventId>({});
    const [repostByEventId, setRepostByEventId] = useState<Record<string, boolean>>({});
    const [repostEventIdByTarget, setRepostEventIdByTarget] = useState<Record<string, string>>({});
    const [engagementDeltaByEventId, setEngagementDeltaByEventId] = useState<SocialEngagementByEventId>({});
    const refreshInFlightRef = useRef(false);

    const follows = useMemo(() => normalizeEventIds(options.follows), [options.follows]);
    const hasFollows = follows.length > 0;
    const activeHashtag = useMemo(() => normalizeHashtag(options.hashtag), [options.hashtag]);
    const activeThreadRootEventId = options.activeThreadRootEventId ?? null;
    const feedPageSize = Math.max(1, options.pageSize ?? 20);
    const threadPageSize = Math.max(1, options.threadPageSize ?? 25);

    const feedQueryInput = useMemo(() => buildFollowingFeedQueryInput({
        ownerPubkey: options.ownerPubkey,
        follows,
        hashtag: activeHashtag,
        pageSize: feedPageSize,
    }), [activeHashtag, feedPageSize, follows, options.ownerPubkey]);

    const feedQueryKey = useMemo(
        () => nostrOverlayQueryKeys.followingFeed(feedQueryInput),
        [feedQueryInput],
    );

    const feedQueryOptions = useMemo(() => {
        const queryOptions: Parameters<typeof useFollowingFeedInfiniteQuery>[0] = {
            follows,
            service: options.service,
            enabled: Boolean(options.ownerPubkey),
            pageSize: feedPageSize,
        };

        if (options.ownerPubkey) {
            queryOptions.ownerPubkey = options.ownerPubkey;
        }

        if (activeHashtag) {
            queryOptions.hashtag = activeHashtag;
        }

        return queryOptions;
    }, [activeHashtag, feedPageSize, follows, options.ownerPubkey, options.service]);

    const feedQuery = useFollowingFeedInfiniteQuery(feedQueryOptions);

    useEffect(() => {
        if (!options.ownerPubkey) {
            setIsOpen(false);
            setLastReadAt(0);
            return;
        }

        setLastReadAt(storage.getLastReadAt(options.ownerPubkey));
    }, [options.ownerPubkey, storage]);

    useEffect(() => {
        setPendingLatestFeedPage(null);
        setPendingNewCount(0);
        setRefreshError(null);
        setIsRefreshingFeed(false);
        refreshInFlightRef.current = false;
    }, [feedQueryKey]);

    const threadQuery = useThreadInfiniteQuery({
        rootEventId: activeThreadRootEventId,
        service: options.service,
        enabled: isOpen && Boolean(activeThreadRootEventId),
        pageSize: threadPageSize,
    });

    const items = useMemo(
        () => selectFeedItemsFromPages(feedQuery.data?.pages),
        [feedQuery.data?.pages]
    );

    const activeThread = useMemo(() => {
        if (!activeThreadRootEventId) {
            return null;
        }

        return selectThreadViewFromPages({
            rootEventId: activeThreadRootEventId,
            pages: threadQuery.data?.pages,
            isLoading: threadQuery.isPending,
            isLoadingMore: threadQuery.isFetchingNextPage,
            error: threadQuery.error?.message ?? null,
            hasMore: Boolean(threadQuery.hasNextPage),
        });
    }, [
        activeThreadRootEventId,
        threadQuery.data?.pages,
        threadQuery.error?.message,
        threadQuery.hasNextPage,
        threadQuery.isFetchingNextPage,
        threadQuery.isPending,
    ]);

    const engagementEventIds = useMemo(() => collectEngagementEventIds({
        items,
        activeThread,
    }), [activeThread, items]);
    const viewerReactionEventIds = useMemo(
        () => normalizeEngagementEventIds(engagementEventIds),
        [engagementEventIds]
    );

    const engagementQuery = useFollowingFeedEngagementQuery({
        eventIds: engagementEventIds,
        service: options.service,
        enabled: isOpen,
    });

    const viewerReactionQuery = useViewerReactionsQuery({
        ...(options.ownerPubkey ? { ownerPubkey: options.ownerPubkey } : {}),
        eventIds: viewerReactionEventIds,
        service: options.service,
        enabled: isOpen && options.canWrite,
    });

    const viewerZapQuery = useViewerZapsQuery({
        ...(options.ownerPubkey ? { ownerPubkey: options.ownerPubkey } : {}),
        eventIds: viewerReactionEventIds,
        service: options.service,
        enabled: isOpen && options.canWrite,
    });

    const viewerReplyQuery = useViewerRepliesQuery({
        ...(options.ownerPubkey ? { ownerPubkey: options.ownerPubkey } : {}),
        eventIds: viewerReactionEventIds,
        service: options.service,
        enabled: isOpen && options.canWrite,
    });

    useEffect(() => {
        setViewerReactionByEventId({});
        setViewerZapByEventId({});
        setViewerReplyByEventId({});
    }, [options.ownerPubkey]);

    useEffect(() => {
        if (!viewerReactionQuery.data) {
            return;
        }

        const scopedEventIds = new Set(viewerReactionEventIds);
        setViewerReactionByEventId((current) => {
            const next: ViewerReactionByEventId = {};
            for (const [eventId, reaction] of Object.entries(current)) {
                if (!scopedEventIds.has(eventId)) {
                    next[eventId] = reaction;
                }
            }

            return {
                ...next,
                ...viewerReactionQuery.data,
            };
        });
    }, [viewerReactionEventIds, viewerReactionQuery.data]);

    useEffect(() => {
        if (!viewerZapQuery.data) {
            return;
        }

        const scopedEventIds = new Set(viewerReactionEventIds);
        setViewerZapByEventId((current) => {
            const next: ViewerZapByEventId = {};
            for (const [eventId, zap] of Object.entries(current)) {
                if (!scopedEventIds.has(eventId)) {
                    next[eventId] = zap;
                }
            }

            return {
                ...next,
                ...viewerZapQuery.data,
            };
        });
    }, [viewerReactionEventIds, viewerZapQuery.data]);

    useEffect(() => {
        if (!viewerReplyQuery.data) {
            return;
        }

        const scopedEventIds = new Set(viewerReactionEventIds);
        setViewerReplyByEventId((current) => {
            const next: ViewerReplyByEventId = {};
            for (const [eventId, reply] of Object.entries(current)) {
                if (!scopedEventIds.has(eventId)) {
                    next[eventId] = reply;
                }
            }

            return {
                ...next,
                ...viewerReplyQuery.data,
            };
        });
    }, [viewerReactionEventIds, viewerReplyQuery.data]);

    const reactionByEventId = useMemo(() => {
        const activeByEventId: Record<string, boolean> = {};
        for (const eventId of Object.keys(viewerReactionByEventId)) {
            activeByEventId[eventId] = true;
        }
        return activeByEventId;
    }, [viewerReactionByEventId]);

    const baseEngagementByEventId = useMemo(() => {
        const fallback = createEmptyEngagementByEventIds(engagementEventIds);
        if (!engagementQuery.data) {
            return fallback;
        }

        return {
            ...fallback,
            ...engagementQuery.data,
        };
    }, [engagementEventIds, engagementQuery.data]);

    const engagementByEventId = useMemo(() => applyEngagementDeltas({
        eventIds: engagementEventIds,
        baseByEventId: baseEngagementByEventId,
        deltaByEventId: engagementDeltaByEventId,
    }), [baseEngagementByEventId, engagementDeltaByEventId, engagementEventIds]);

    const applyEngagementDelta = useCallback((eventId: string, key: keyof SocialEngagementMetrics, delta: number) => {
        if (!eventId || !Number.isFinite(delta) || delta === 0) {
            return;
        }

        setEngagementDeltaByEventId((current) => {
            const currentValue = current[eventId] ?? EMPTY_ENGAGEMENT_METRICS;
            return {
                ...current,
                [eventId]: {
                    ...currentValue,
                    [key]: (currentValue[key] || 0) + delta,
                },
            };
        });
    }, []);

    const publishPostMutation = useMutation({
        mutationKey: followingFeedMutationKeys.publishPost,
        mutationFn: async (variables: PublishPostMutationVariables) => {
            if (!options.writeGateway) {
                throw new Error('No write gateway available');
            }

            return options.writeGateway.publishTextNote(variables.content, variables.tags);
        },
        onMutate: async () => {
            if (!options.ownerPubkey) {
                return;
            }

            setPublishError(null);
        },
        onSuccess: (published) => {
            const publishedItem = toFeedItemFromPublished(published);
            if (!publishedItem) {
                return;
            }

            queryClient.setQueryData<InfiniteData<SocialFeedPage>>(feedQueryKey, (current) => prependFeedItem(current, publishedItem));
        },
        onError: () => {
            setPublishError('No se pudo publicar la nota');
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: nostrOverlayQueryKeys.invalidation.followingFeed() });
        },
    });

    const publishQuoteMutation = useMutation({
        mutationKey: followingFeedMutationKeys.publishQuote,
        mutationFn: async (variables: PublishQuoteMutationVariables) => {
            if (!options.writeGateway) {
                throw new Error('No write gateway available');
            }

            return options.writeGateway.publishTextNote(variables.content, variables.tags);
        },
        onMutate: async () => {
            if (!options.ownerPubkey) {
                return;
            }

            setPublishError(null);
        },
        onSuccess: (published) => {
            const publishedItem = toFeedItemFromPublished(published);
            if (!publishedItem) {
                return;
            }

            queryClient.setQueryData<InfiniteData<SocialFeedPage>>(feedQueryKey, (current) => prependFeedItem(current, publishedItem));
        },
        onError: () => {
            setPublishError('No se pudo publicar la cita');
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: nostrOverlayQueryKeys.invalidation.followingFeed() });
        },
    });

    const publishReplyMutation = useMutation({
        mutationKey: followingFeedMutationKeys.publishReply,
        mutationFn: async (variables: PublishReplyMutationVariables) => {
            if (!options.writeGateway) {
                throw new Error('No write gateway available');
            }

            return options.writeGateway.publishTextNote(variables.content, variables.tags);
        },
        onMutate: async (variables): Promise<PublishReplyMutationContext> => {
            const threadKey = nostrOverlayQueryKeys.thread({
                rootEventId: variables.rootEventId,
                pageSize: threadPageSize,
            });

            if (!options.ownerPubkey) {
                return {
                    targetEventId: variables.input.targetEventId,
                    threadKey,
                };
            }

            setPublishError(null);
            return { targetEventId: variables.input.targetEventId, threadKey };
        },
        onSuccess: (published, _variables, context) => {
            if (!context?.threadKey) {
                return;
            }

            applyEngagementDelta(context.targetEventId, 'replies', 1);
            setViewerReplyByEventId((current) => ({
                ...current,
                [context.targetEventId]: {
                    eventId: context.targetEventId,
                    replyEventId: published.id,
                    createdAt: published.created_at,
                },
            }));

            queryClient.setQueryData<InfiniteData<SocialThreadPage>>(context.threadKey as readonly unknown[], (current) => {
                if (!current || current.pages.length === 0) {
                    return current;
                }

                const publishedReply = toThreadItemFromPublished(published);
                const firstPage = current.pages[0];
                if (!firstPage) {
                    return current;
                }
                const updatedReplies = mergeThreadReplies([publishedReply], firstPage.replies);
                return {
                    pages: [{ ...firstPage, replies: updatedReplies }, ...current.pages.slice(1)],
                    pageParams: current.pageParams,
                };
            });
        },
        onError: (_error, _variables, context) => {
            if (!context?.threadKey) {
                setPublishError('No se pudo publicar la respuesta');
                return;
            }

            setPublishError('No se pudo publicar la respuesta');
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: nostrOverlayQueryKeys.invalidation.followingFeed() });
        },
    });

    const toggleReactionMutation = useMutation({
        mutationKey: followingFeedMutationKeys.toggleReaction,
        mutationFn: async (variables: ToggleReactionMutationVariables) => {
            if (!options.writeGateway) {
                throw new Error('No write gateway available');
            }

            if (variables.next) {
                const tags = variables.input.targetPubkey
                    ? [['e', variables.input.eventId], ['p', variables.input.targetPubkey]]
                    : [['e', variables.input.eventId]];
                const published = await options.writeGateway.publishEvent({
                    kind: 7,
                    content: variables.input.emoji && variables.input.emoji.length > 0 ? variables.input.emoji : '+',
                    created_at: now(),
                    tags,
                });
                return { publishedReactionEventId: published.id };
            }

            if (!variables.reactionEventId) {
                throw new Error('No hay reaccion local para eliminar');
            }

            await options.writeGateway.publishEvent({
                kind: 5,
                content: '',
                created_at: now(),
                tags: [['e', variables.reactionEventId], ['k', '7']],
            });

            return {};
        },
        onMutate: async () => {
            setPublishError(null);
        },
        onSuccess: (result, variables) => {
            const eventId = variables.input.eventId;
            if (variables.next && result.publishedReactionEventId) {
                setViewerReactionByEventId((current) => ({
                    ...current,
                    [eventId]: {
                        eventId,
                        reactionEventId: result.publishedReactionEventId,
                        emoji: variables.input.emoji && variables.input.emoji.length > 0 ? variables.input.emoji : '❤️',
                        createdAt: now(),
                    },
                }));
                applyEngagementDelta(eventId, 'reactions', 1);
                return;
            }

            if (!variables.next) {
                setViewerReactionByEventId((current) => {
                    const next = { ...current };
                    delete next[eventId];
                    return next;
                });
                applyEngagementDelta(eventId, 'reactions', -1);
            }
        },
        onError: () => {
            setPublishError('No se pudo actualizar la reaccion');
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: nostrOverlayQueryKeys.invalidation.social() });
        },
    });

    const toggleRepostMutation = useMutation({
        mutationKey: followingFeedMutationKeys.toggleRepost,
        mutationFn: async (variables: ToggleRepostMutationVariables) => {
            if (!options.writeGateway) {
                throw new Error('No write gateway available');
            }

            if (variables.next) {
                const tags = variables.input.targetPubkey
                    ? [['e', variables.input.eventId], ['p', variables.input.targetPubkey]]
                    : [['e', variables.input.eventId]];
                const published = await options.writeGateway.publishEvent({
                    kind: 6,
                    content: variables.input.repostContent ?? '',
                    created_at: now(),
                    tags,
                });
                return { publishedRepostEventId: published.id };
            }

            if (!variables.repostEventId) {
                throw new Error('No hay repost local para eliminar');
            }

            await options.writeGateway.publishEvent({
                kind: 5,
                content: '',
                created_at: now(),
                tags: [['e', variables.repostEventId]],
            });

            return {};
        },
        onMutate: async (variables) => {
            const eventId = variables.input.eventId;
            setPublishError(null);
            return { eventId };
        },
        onSuccess: (result, variables) => {
            const eventId = variables.input.eventId;
            if (variables.next && result.publishedRepostEventId) {
                setRepostByEventId((current) => ({ ...current, [eventId]: true }));
                applyEngagementDelta(eventId, 'reposts', 1);
                setRepostEventIdByTarget((current) => ({
                    ...current,
                    [eventId]: result.publishedRepostEventId,
                }));
                return;
            }

            if (!variables.next) {
                setRepostByEventId((current) => ({ ...current, [eventId]: false }));
                applyEngagementDelta(eventId, 'reposts', -1);
                setRepostEventIdByTarget((current) => {
                    const next = { ...current };
                    delete next[eventId];
                    return next;
                });
            }
        },
        onError: () => {
            setPublishError('No se pudo actualizar el repost');
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: nostrOverlayQueryKeys.invalidation.followingFeed() });
        },
    });

    const pendingReactionEventIds = useMutationState<string>({
        filters: {
            mutationKey: followingFeedMutationKeys.toggleReaction,
            status: 'pending',
        },
        select: (mutation) => {
            const variables = mutation.state.variables as ToggleReactionMutationVariables | undefined;
            return variables?.input.eventId || '';
        },
    });

    const pendingRepostEventIds = useMutationState<string>({
        filters: {
            mutationKey: followingFeedMutationKeys.toggleRepost,
            status: 'pending',
        },
        select: (mutation) => {
            const variables = mutation.state.variables as ToggleRepostMutationVariables | undefined;
            return variables?.input.eventId || '';
        },
    });

    const pendingReactionByEventId = useMemo(
        () => buildPendingByEventId(pendingReactionEventIds),
        [pendingReactionEventIds]
    );

    const pendingRepostByEventId = useMemo(
        () => buildPendingByEventId(pendingRepostEventIds),
        [pendingRepostEventIds]
    );

    const hasUnread = useMemo(
        () => items.some((item) => normalizeToEpochSeconds(item.createdAt) > lastReadAt),
        [items, lastReadAt]
    );

    const hasPendingNewItems = pendingNewCount > 0;

    const replaceLatestPageInFeedCache = useCallback((latestPage: SocialFeedPage) => {
        queryClient.setQueryData<InfiniteData<SocialFeedPage>>(feedQueryKey, {
            pages: [latestPage],
            pageParams: [undefined],
        });
    }, [feedQueryKey, queryClient]);

    const loadLatestFeedPage = useCallback(async (): Promise<SocialFeedPage | null> => {
        if (activeHashtag) {
            return options.service.loadHashtagFeed({
                hashtag: activeHashtag,
                limit: feedPageSize,
            });
        }

        if (follows.length === 0) {
            return null;
        }

        return options.service.loadFollowingFeed({
            follows,
            limit: feedPageSize,
        });
    }, [activeHashtag, feedPageSize, follows, options.service]);

    const refreshFeed = useCallback(async (mode: 'buffer' | 'apply' = 'apply'): Promise<void> => {
        if (refreshInFlightRef.current || feedQuery.isPending || feedQuery.isFetching) {
            return;
        }

        refreshInFlightRef.current = true;
        setIsRefreshingFeed(true);
        setRefreshError(null);

        try {
            const latestPage = await loadLatestFeedPage();
            if (!latestPage) {
                if (mode === 'apply') {
                    setPendingLatestFeedPage(null);
                    setPendingNewCount(0);
                }
                return;
            }

            if (mode === 'apply') {
                replaceLatestPageInFeedCache(latestPage);
                setPendingLatestFeedPage(null);
                setPendingNewCount(0);
                return;
            }

            const seenIds = new Set(items.map((item) => item.id));
            const freshItems = latestPage.items.filter((item) => !seenIds.has(item.id));
            if (freshItems.length === 0) {
                return;
            }

            setPendingLatestFeedPage(latestPage);
            setPendingNewCount(freshItems.length);
        } catch {
            setRefreshError(FOLLOWING_FEED_REFRESH_ERROR_MESSAGE);
        } finally {
            refreshInFlightRef.current = false;
            setIsRefreshingFeed(false);
        }
    }, [feedQuery.isFetching, feedQuery.isPending, items, loadLatestFeedPage, replaceLatestPageInFeedCache]);

    const applyPendingNewItems = useCallback(() => {
        if (!pendingLatestFeedPage || pendingNewCount === 0) {
            return;
        }

        replaceLatestPageInFeedCache(pendingLatestFeedPage);
        setPendingLatestFeedPage(null);
        setPendingNewCount(0);
    }, [pendingLatestFeedPage, pendingNewCount, replaceLatestPageInFeedCache]);

    const open = useCallback(() => {
        setIsOpen(true);

        if (!options.ownerPubkey) {
            return;
        }

        const maxVisibleCreatedAt = items.reduce(
            (maxValue, item) => Math.max(maxValue, normalizeToEpochSeconds(item.createdAt)),
            0
        );
        const nextLastReadAt = Math.max(lastReadAt, maxVisibleCreatedAt, normalizeToEpochSeconds(now()));
        setLastReadAt(nextLastReadAt);
        storage.setLastReadAt(options.ownerPubkey, nextLastReadAt);
    }, [items, lastReadAt, now, options.ownerPubkey, storage]);

    const close = useCallback(() => {
        setIsOpen(false);
    }, []);

    useEffect(() => {
        if (!isOpen || (!activeHashtag && follows.length === 0)) {
            return;
        }

        const intervalHandle = window.setInterval(() => {
            void refreshFeed('buffer');
        }, FOLLOWING_FEED_REFRESH_INTERVAL_MS);

        return () => {
            window.clearInterval(intervalHandle);
        };
    }, [activeHashtag, follows.length, isOpen, refreshFeed]);

    const loadNextFeedPage = useCallback(async () => {
        if (!feedQuery.hasNextPage || feedQuery.isFetchingNextPage) {
            return;
        }

        await feedQuery.fetchNextPage();
    }, [feedQuery]);

    const openThread = useCallback((rootEventId: string) => {
        if (!rootEventId) {
            return;
        }

        options.onOpenThread(rootEventId);
    }, [options.onOpenThread]);

    const closeThread = useCallback(() => {
        options.onCloseThread();
    }, [options.onCloseThread]);

    const loadNextThreadPage = useCallback(async () => {
        if (!activeThreadRootEventId || !threadQuery.hasNextPage || threadQuery.isFetchingNextPage) {
            return;
        }

        await threadQuery.fetchNextPage();
    }, [activeThreadRootEventId, threadQuery]);

    const publishPost = useCallback(async (content: ComposerContentInput | PublishPostComposerInput): Promise<boolean> => {
        const normalized = normalizePublishComposerInput(content);
        if (!options.ownerPubkey || !options.canWrite || !options.writeGateway || normalized.visibleContent.length === 0) {
            return false;
        }

        try {
            await publishPostMutation.mutateAsync({
                visibleContent: normalized.visibleContent,
                content: normalized.serializedContent,
                tags: normalized.tags,
            });
            return true;
        } catch {
            return false;
        }
    }, [options.canWrite, options.ownerPubkey, options.writeGateway, publishPostMutation]);

    const publishReply = useCallback(async (input: PublishReplyComposerInput): Promise<boolean> => {
        const normalized = normalizePublishComposerInput({ content: input.content, ...(input.image ? { image: input.image } : {}) });
        if (!options.ownerPubkey || !options.canWrite || !options.writeGateway || normalized.visibleContent.length === 0 || !activeThreadRootEventId) {
            return false;
        }

        const normalizedInput: PublishReplyInput = {
            ...input,
            content: normalized.visibleContent,
        };
        const tags = mergeUniqueTags(buildReplyTags(normalizedInput, activeThread), normalized.tags);

        try {
            await publishReplyMutation.mutateAsync({
                input: normalizedInput,
                rootEventId: activeThreadRootEventId,
                visibleContent: normalized.visibleContent,
                content: normalized.serializedContent,
                tags,
            });
            return true;
        } catch {
            return false;
        }
    }, [activeThread, activeThreadRootEventId, options.canWrite, options.ownerPubkey, options.writeGateway, publishReplyMutation]);

    const publishQuote = useCallback(async (input: PublishQuoteComposerInput): Promise<boolean> => {
        if (!options.ownerPubkey || !options.canWrite || !options.writeGateway || !input.targetEventId) {
            return false;
        }

        const normalized = normalizePublishComposerInput({ content: input.content, ...(input.image ? { image: input.image } : {}) });
        const normalizedInput = {
            ...input,
            content: normalized.visibleContent,
        };
        const content = buildQuoteContent({
            ...normalizedInput,
            content: normalized.serializedContent,
        });
        const visibleContent = buildQuoteContent(normalizedInput);
        const tags = mergeUniqueTags(buildQuoteTags(normalizedInput), normalized.tags);

        try {
            await publishQuoteMutation.mutateAsync({
                input: normalizedInput,
                visibleContent,
                content,
                tags,
            });
            return true;
        } catch {
            return false;
        }
    }, [options.canWrite, options.ownerPubkey, options.writeGateway, publishQuoteMutation]);

    const toggleReaction = useCallback(async (input: ToggleReactionInput): Promise<boolean> => {
        if (!options.ownerPubkey || !options.canWrite || !options.writeGateway || !input.eventId) {
            return false;
        }

        const previous = viewerReactionByEventId[input.eventId];
        const next = !previous;

        try {
            await toggleReactionMutation.mutateAsync({
                input,
                previous,
                next,
                reactionEventId: previous?.reactionEventId,
            });
            return true;
        } catch {
            return false;
        }
    }, [
        options.canWrite,
        options.ownerPubkey,
        options.writeGateway,
        toggleReactionMutation,
        viewerReactionByEventId,
    ]);

    const toggleRepost = useCallback(async (input: ToggleRepostInput): Promise<boolean> => {
        if (!options.ownerPubkey || !options.canWrite || !options.writeGateway || !input.eventId) {
            return false;
        }

        const previous = Boolean(repostByEventId[input.eventId]);
        const next = !previous;

        try {
            await toggleRepostMutation.mutateAsync({
                input,
                previous,
                next,
                repostEventId: repostEventIdByTarget[input.eventId],
            });
            return true;
        } catch {
            return false;
        }
    }, [
        options.canWrite,
        options.ownerPubkey,
        options.writeGateway,
        repostByEventId,
        repostEventIdByTarget,
        toggleRepostMutation,
    ]);

    return {
        isOpen,
        items,
        pendingItems: pendingLatestFeedPage?.items ?? [],
        hasFollows,
        hasUnread,
        lastReadAt,
        pendingNewCount,
        hasPendingNewItems,
        isLoadingFeed: feedQuery.isPending || feedQuery.isFetchingNextPage,
        isRefreshingFeed,
        feedError: refreshError ?? feedQuery.error?.message ?? null,
        hasMoreFeed: Boolean(feedQuery.hasNextPage),
        activeThread,
        publishError,
        isPublishingPost: publishPostMutation.isPending,
        isPublishingQuote: publishQuoteMutation.isPending,
        isPublishingReply: publishReplyMutation.isPending,
        reactionByEventId,
        viewerReactionByEventId,
        viewerZapByEventId,
        viewerReplyByEventId,
        repostByEventId,
        pendingReactionByEventId,
        pendingRepostByEventId,
        engagementByEventId,
        activeHashtag,
        open,
        close,
        refreshFeed,
        applyPendingNewItems,
        loadNextFeedPage,
        openThread,
        closeThread,
        loadNextThreadPage,
        publishPost,
        publishQuote,
        publishReply,
        toggleReaction,
        toggleRepost,
    };
}
