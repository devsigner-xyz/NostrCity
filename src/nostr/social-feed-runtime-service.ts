import { createLazyNdkDmTransport } from './lazy-ndk-client';
import { LONG_FORM_ARTICLE_KIND } from './articles';
import { resolveConservativeSocialRelaySets, hasSameRelaySet, normalizeRelaySet } from './relay-runtime';
import { createTransportPool, type TransportPool } from './transport-pool';
import type { DmTransport } from './dm-transport';
import {
    extractTargetEventId,
    isReplyEvent,
    isMainFeedEvent,
    type LoadArticlesFeedInput,
    type LoadArticleByIdInput,
    type LoadHashtagFeedInput,
    toArticleFeedItem,
    toSocialFeedItem,
    toSocialThreadItem,
    type LoadEngagementInput,
    type LoadViewerReactionsInput,
    type LoadViewerRepliesInput,
    type LoadViewerZapsInput,
    type LoadFollowingFeedInput,
    type LoadThreadInput,
    type SocialEngagementByEventId,
    type SocialEngagementMetrics,
    type SocialFeedPage,
    type SocialFeedService,
    type SocialThreadItem,
    type SocialThreadPage,
    type ViewerReactionByEventId,
    type ViewerReplyByEventId,
    type ViewerZapByEventId,
} from './social-feed-service';
import type { NostrEvent, NostrFilter } from './types';

const MAIN_FEED_KINDS = [1, 6, 16] as const;
const ARTICLE_FEED_KINDS = [LONG_FORM_ARTICLE_KIND] as const;
const THREAD_REPLY_KINDS = [1] as const;
const ENGAGEMENT_KINDS = [1, 6, 7, 16, 9735] as const;

const DEFAULT_FEED_LIMIT = 30;
const DEFAULT_THREAD_LIMIT = 40;
const DEFAULT_ENGAGEMENT_LIMIT = 120;
const DEFAULT_VIEWER_REACTIONS_LIMIT = 120;
const DEFAULT_VIEWER_ZAPS_LIMIT = 120;
const DEFAULT_VIEWER_REPLIES_LIMIT = 120;
const DEFAULT_BACKFILL_TIMEOUT_MS = 7_000;
const QUERY_LIMIT_MULTIPLIER = 3;
const MIN_QUERY_LIMIT = 24;
const MAX_QUERY_LIMIT = 180;
const MAX_MAIN_FEED_PASSES = 4;
const MAX_AUTHORS_PER_FILTER = 120;
const MAX_EVENT_IDS_PER_FILTER = 120;

interface CreateRuntimeSocialFeedServiceOptions {
    createTransport?: (relays: string[]) => DmTransport;
    resolveRelays?: () => string[];
    resolveFallbackRelays?: (primaryRelays: string[]) => string[];
    transportPool?: TransportPool<DmTransport>;
    backfillTimeoutMs?: number;
}

function resolveRuntimeSocialRelays(): string[] {
    return resolveConservativeSocialRelaySets().primary;
}

function resolveRuntimeSocialFallbackRelays(primaryRelays: string[]): string[] {
    const fallback = resolveConservativeSocialRelaySets().fallback;
    return hasSameRelaySet(primaryRelays, fallback) ? [] : fallback;
}

function clampLimit(limit: number | undefined, fallback: number): number {
    const value = Number.isFinite(limit) ? Number(limit) : fallback;
    return Math.max(1, Math.floor(value));
}

function resolveQueryLimit(limit: number): number {
    const scaled = limit * QUERY_LIMIT_MULTIPLIER;
    return Math.min(MAX_QUERY_LIMIT, Math.max(MIN_QUERY_LIMIT, scaled));
}

function chunkAuthors(authors: string[]): string[][] {
    const normalized = [...new Set(authors.filter((author) => typeof author === 'string' && author.length > 0))];
    if (normalized.length === 0) {
        return [];
    }

    const chunks: string[][] = [];
    for (let index = 0; index < normalized.length; index += MAX_AUTHORS_PER_FILTER) {
        chunks.push(normalized.slice(index, index + MAX_AUTHORS_PER_FILTER));
    }

    return chunks;
}

function chunkEventIds(eventIds: string[]): string[][] {
    const normalized = normalizeTargetEventIds(eventIds);
    if (normalized.length === 0) {
        return [];
    }

    const chunks: string[][] = [];
    for (let index = 0; index < normalized.length; index += MAX_EVENT_IDS_PER_FILTER) {
        chunks.push(normalized.slice(index, index + MAX_EVENT_IDS_PER_FILTER));
    }

    return chunks;
}

function isValidRuntimeEvent(event: NostrEvent): boolean {
    if (!event || typeof event !== 'object') {
        return false;
    }

    if (typeof event.id !== 'string' || event.id.length === 0) {
        return false;
    }

    if (typeof event.pubkey !== 'string' || event.pubkey.length === 0) {
        return false;
    }

    if (!Number.isFinite(event.kind) || !Number.isFinite(event.created_at)) {
        return false;
    }

    if (typeof event.content !== 'string' || !Array.isArray(event.tags)) {
        return false;
    }

    return event.tags.every((tag) => Array.isArray(tag) && tag.every((value) => typeof value === 'string'));
}

function sortAndDedupe(events: NostrEvent[]): NostrEvent[] {
    const byId = new Map<string, NostrEvent>();
    for (const event of events) {
        if (!isValidRuntimeEvent(event)) {
            continue;
        }

        byId.set(event.id, event);
    }

    return [...byId.values()].sort((left, right) => {
        if (left.created_at !== right.created_at) {
            return right.created_at - left.created_at;
        }

        return left.id.localeCompare(right.id);
    });
}

function hasRootTag(event: NostrEvent, rootEventId: string): boolean {
    return event.tags.some((tag) => Array.isArray(tag) && tag[0] === 'e' && tag[1] === rootEventId);
}

function nextUntilFromItems(items: Array<{ createdAt: number }>): number | undefined {
    const lastItem = items[items.length - 1];
    if (!lastItem) {
        return undefined;
    }

    return lastItem.createdAt - 1;
}

function createEmptyEngagementMetrics(): SocialEngagementMetrics {
    return {
        replies: 0,
        reposts: 0,
        reactions: 0,
        zaps: 0,
        zapSats: 0,
    };
}

function normalizeTargetEventIds(eventIds: string[]): string[] {
    return [...new Set(eventIds.filter((eventId) => typeof eventId === 'string' && eventId.length > 0))];
}

function normalizeReactionEmoji(content: string): string {
    const normalized = content.trim();
    return normalized.length === 0 || normalized === '+' ? '❤️' : normalized;
}

function collectDeletedEventIds(events: NostrEvent[], ownerPubkey: string): Set<string> {
    const deletedEventIds = new Set<string>();

    for (const event of events) {
        if (event.kind !== 5 || event.pubkey !== ownerPubkey) {
            continue;
        }

        const kindTags = event.tags
            .filter((tag) => Array.isArray(tag) && tag[0] === 'k')
            .map((tag) => tag[1]);
        if (kindTags.length > 0 && !kindTags.includes('7')) {
            continue;
        }

        for (const tag of event.tags) {
            if (Array.isArray(tag) && tag[0] === 'e' && typeof tag[1] === 'string') {
                deletedEventIds.add(tag[1]);
            }
        }
    }

    return deletedEventIds;
}

function normalizeHashtag(hashtag: string): string {
    return hashtag.trim().replace(/^#+/, '').toLowerCase();
}

function normalizeHashtags(hashtags: string[] | undefined): string[] {
    return [...new Set((hashtags ?? []).map(normalizeHashtag).filter((hashtag) => hashtag.length > 0))]
        .sort((left, right) => left.localeCompare(right));
}

function getTagValues(event: NostrEvent, key: string): string[] {
    const values: string[] = [];
    for (const tag of event.tags) {
        if (!Array.isArray(tag) || tag[0] !== key) {
            continue;
        }

        const value = tag[1];
        if (typeof value === 'string' && value.length > 0) {
            values.push(value);
        }
    }

    return values;
}

function getTargetByMarkers(event: NostrEvent, targetSet: Set<string>): string | undefined {
    const eTags: Array<{ value: string; marker?: string }> = [];
    for (const tag of event.tags) {
        if (!Array.isArray(tag) || tag[0] !== 'e') {
            continue;
        }

        const value = tag[1];
        if (typeof value !== 'string' || value.length === 0) {
            continue;
        }

        const marker = typeof tag[3] === 'string' && tag[3].length > 0 ? tag[3] : undefined;
        eTags.push(marker ? { value, marker } : { value });
    }

    for (const tag of eTags) {
        if (tag.marker === 'reply' && targetSet.has(tag.value)) {
            return tag.value;
        }
    }

    for (const tag of eTags) {
        if (tag.marker === 'root' && targetSet.has(tag.value)) {
            return tag.value;
        }
    }

    for (let index = eTags.length - 1; index >= 0; index -= 1) {
        const candidate = eTags[index];
        if (candidate && targetSet.has(candidate.value)) {
            return candidate.value;
        }
    }

    return undefined;
}

function resolveViewerReplyTargetEventId(event: NostrEvent, targetSet: Set<string>): string | undefined {
    if (event.kind !== 1 || !isReplyEvent(event)) {
        return undefined;
    }

    const eTags: Array<{ value: string; marker?: string }> = [];
    for (const tag of event.tags) {
        if (!Array.isArray(tag) || tag[0] !== 'e') {
            continue;
        }

        const value = tag[1];
        if (typeof value !== 'string' || value.length === 0) {
            continue;
        }

        const marker = typeof tag[3] === 'string' && tag[3].length > 0 ? tag[3] : undefined;
        eTags.push(marker ? { value, marker } : { value });
    }

    const replyMarked = eTags.filter((tag) => tag.marker === 'reply');
    if (replyMarked.length > 0) {
        return replyMarked.find((tag) => targetSet.has(tag.value))?.value;
    }

    const rootTarget = eTags.find((tag) => tag.marker === 'root' && targetSet.has(tag.value));
    if (rootTarget) {
        return rootTarget.value;
    }

    for (let index = eTags.length - 1; index >= 0; index -= 1) {
        const candidate = eTags[index];
        if (candidate && targetSet.has(candidate.value)) {
            return candidate.value;
        }
    }

    return undefined;
}

function resolveEngagementTargetEventId(event: NostrEvent, targetSet: Set<string>): string | undefined {
    if (event.kind === 6 || event.kind === 16) {
        const qTags = getTagValues(event, 'q');
        for (let index = qTags.length - 1; index >= 0; index -= 1) {
            const candidate = qTags[index];
            if (candidate && targetSet.has(candidate)) {
                return candidate;
            }
        }
    }

    if (event.kind === 1 && isReplyEvent(event)) {
        const markerTarget = getTargetByMarkers(event, targetSet);
        if (markerTarget) {
            return markerTarget;
        }
    }

    const extracted = extractTargetEventId(event);
    if (extracted && targetSet.has(extracted)) {
        return extracted;
    }

    return undefined;
}

function parseZapMsatsFromDescription(event: NostrEvent): number {
    const descriptionValues = getTagValues(event, 'description');
    if (descriptionValues.length === 0) {
        return 0;
    }

    const latest = descriptionValues[descriptionValues.length - 1];
    if (!latest) {
        return 0;
    }

    try {
        const parsed = JSON.parse(latest) as { tags?: unknown };
        if (!parsed || !Array.isArray(parsed.tags)) {
            return 0;
        }

        for (const rawTag of parsed.tags) {
            if (!Array.isArray(rawTag) || rawTag[0] !== 'amount' || typeof rawTag[1] !== 'string') {
                continue;
            }

            const msats = Number(rawTag[1]);
            if (Number.isFinite(msats) && msats > 0) {
                return msats;
            }
        }
    } catch {
        return 0;
    }

    return 0;
}

function parseZapRequestFromDescription(event: NostrEvent): { pubkey?: string; tags?: string[][] } | null {
    const descriptionValues = getTagValues(event, 'description');
    const latest = descriptionValues[descriptionValues.length - 1];
    if (!latest) {
        return null;
    }

    try {
        const rawDescription = latest.startsWith('%') ? decodeURIComponent(latest) : latest;
        const parsed = JSON.parse(rawDescription) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }

        const record = parsed as Record<string, unknown>;
        const pubkey = typeof record.pubkey === 'string' && record.pubkey.length > 0 ? record.pubkey : undefined;
        const tags = Array.isArray(record.tags)
            ? record.tags.filter((tag): tag is string[] => Array.isArray(tag) && tag.every((value) => typeof value === 'string'))
            : undefined;

        return {
            ...(pubkey ? { pubkey } : {}),
            ...(tags ? { tags } : {}),
        };
    } catch {
        return null;
    }
}

function parseZapSenderPubkey(event: NostrEvent): string | undefined {
    const senderTagValues = getTagValues(event, 'P');
    const senderFromTag = senderTagValues[senderTagValues.length - 1];
    if (senderFromTag) {
        return senderFromTag;
    }

    return parseZapRequestFromDescription(event)?.pubkey;
}

function hasAnonymousZapRequest(event: NostrEvent): boolean {
    return Boolean(parseZapRequestFromDescription(event)?.tags?.some((tag) => tag[0] === 'anon'));
}

function parseZapSats(event: NostrEvent): number {
    const fromDescriptionMsats = parseZapMsatsFromDescription(event);
    if (fromDescriptionMsats > 0) {
        return Math.max(0, Math.floor(fromDescriptionMsats / 1000));
    }

    const amountValues = getTagValues(event, 'amount');
    if (amountValues.length > 0) {
        const latestAmount = Number(amountValues[amountValues.length - 1]);
        if (Number.isFinite(latestAmount) && latestAmount > 0) {
            return Math.max(0, Math.floor(latestAmount / 1000));
        }
    }

    return 0;
}

function isRelayTransportError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    return /relay|eose|timeout|network|websocket|disconnect/i.test(error.message);
}

async function fetchBackfillWithTimeout(
    transport: DmTransport,
    filters: NostrFilter[],
    timeoutMs: number
): Promise<NostrEvent[]> {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    try {
        return await Promise.race([
            transport.fetchBackfill(filters),
            new Promise<NostrEvent[]>((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    reject(new Error(`relay timeout after ${timeoutMs}ms`));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}

export function createRuntimeSocialFeedService(
    options: CreateRuntimeSocialFeedServiceOptions = {}
): SocialFeedService {
    const createTransport = options.createTransport ?? ((relays: string[]) => createLazyNdkDmTransport({ relays }));
    const resolveRelays = options.resolveRelays ?? resolveRuntimeSocialRelays;
    const resolveFallbackRelays = options.resolveFallbackRelays ?? resolveRuntimeSocialFallbackRelays;
    const transportPool = options.transportPool ?? createTransportPool<DmTransport>();
    const backfillTimeoutMs = Number.isFinite(options.backfillTimeoutMs)
        ? Math.max(1, Math.floor(options.backfillTimeoutMs as number))
        : DEFAULT_BACKFILL_TIMEOUT_MS;

    const resolveTransport = (relays: string[]): DmTransport => {
        return transportPool.getOrCreate(relays, createTransport);
    };

    const withRelayFallback = async <T>(operation: (transport: DmTransport) => Promise<T>): Promise<T> => {
        const primaryRelays = normalizeRelaySet(resolveRelays());
        const primaryTransport = resolveTransport(primaryRelays);

        try {
            return await operation(primaryTransport);
        } catch (primaryError) {
            if (!isRelayTransportError(primaryError)) {
                throw primaryError;
            }

            const fallbackRelays = normalizeRelaySet(resolveFallbackRelays(primaryRelays));
            if (fallbackRelays.length === 0 || hasSameRelaySet(primaryRelays, fallbackRelays)) {
                throw primaryError;
            }

            const fallbackTransport = resolveTransport(fallbackRelays);
            return operation(fallbackTransport);
        }
    };

    return {
        async loadFollowingFeed(input: LoadFollowingFeedInput): Promise<SocialFeedPage> {
            const follows = [...new Set(input.follows.filter((pubkey) => typeof pubkey === 'string' && pubkey.length > 0))];
            if (follows.length === 0) {
                return {
                    items: [],
                    hasMore: false,
                };
            }

            return withRelayFallback(async (transport) => {
                const limit = clampLimit(input.limit, DEFAULT_FEED_LIMIT);
                const queryLimit = resolveQueryLimit(limit);
                const authorChunks = chunkAuthors(follows);
                const collected = new Map<string, ReturnType<typeof toSocialFeedItem>>();

                let cursorUntil = input.until;
                let reachedSourceEnd = false;
                let pass = 0;

                while (collected.size < limit + 1 && pass < MAX_MAIN_FEED_PASSES) {
                    pass += 1;
                    const batchEvents: NostrEvent[] = [];
                    let allChunksExhausted = true;
                    let maxChunkOldest: number | null = null;

                    for (const authorChunk of authorChunks) {
                        const filter: NostrFilter = {
                            authors: authorChunk,
                            kinds: [...MAIN_FEED_KINDS],
                            limit: queryLimit,
                        };
                        if (typeof cursorUntil === 'number') {
                            filter.until = cursorUntil;
                        }

                        const events = await fetchBackfillWithTimeout(transport, [filter], backfillTimeoutMs);

                        const chunkEvents = sortAndDedupe(events as NostrEvent[]);
                        if (chunkEvents.length >= queryLimit) {
                            allChunksExhausted = false;
                        }

                        if (chunkEvents.length === 0) {
                            continue;
                        }

                        batchEvents.push(...chunkEvents);

                        const chunkOldest = chunkEvents[chunkEvents.length - 1]?.created_at;
                        if (typeof chunkOldest === 'number' && Number.isFinite(chunkOldest)) {
                            if (maxChunkOldest === null || chunkOldest > maxChunkOldest) {
                                maxChunkOldest = chunkOldest;
                            }
                        }
                    }

                    const sorted = sortAndDedupe(batchEvents);
                    if (sorted.length === 0) {
                        reachedSourceEnd = true;
                        break;
                    }

                    for (const event of sorted) {
                        if (!isMainFeedEvent(event)) {
                            continue;
                        }

                        const item = toSocialFeedItem(event);
                        if (!item || collected.has(item.id)) {
                            continue;
                        }

                        collected.set(item.id, item);
                        if (collected.size >= limit + 1) {
                            break;
                        }
                    }

                    if (maxChunkOldest === null || !Number.isFinite(maxChunkOldest)) {
                        reachedSourceEnd = true;
                        break;
                    }

                    cursorUntil = maxChunkOldest - 1;

                    if (allChunksExhausted) {
                        reachedSourceEnd = true;
                        break;
                    }
                }

                const sortedItems = [...collected.values()]
                    .filter((item): item is NonNullable<typeof item> => item !== null)
                    .sort((left, right) => {
                        if (left.createdAt !== right.createdAt) {
                            return right.createdAt - left.createdAt;
                        }

                        return left.id.localeCompare(right.id);
                    });

                const pageItems = sortedItems.slice(0, limit);
                const endedByPassCap = !reachedSourceEnd
                    && pass >= MAX_MAIN_FEED_PASSES
                    && collected.size < limit + 1;
                const hasMore = sortedItems.length > limit || endedByPassCap;
                const nextUntil = !hasMore
                    ? undefined
                    : sortedItems.length > limit
                        ? nextUntilFromItems(pageItems)
                        : cursorUntil;

                const result: SocialFeedPage = {
                    items: pageItems,
                    hasMore,
                };

                if (typeof nextUntil === 'number') {
                    result.nextUntil = nextUntil;
                }

                return result;
            });
        },

        async loadArticlesFeed(input: LoadArticlesFeedInput): Promise<SocialFeedPage> {
            const authors = [...new Set(input.authors.filter((pubkey) => typeof pubkey === 'string' && pubkey.length > 0))];
            if (authors.length === 0) {
                return {
                    items: [],
                    hasMore: false,
                };
            }
            const hashtags = normalizeHashtags(input.hashtags);

            return withRelayFallback(async (transport) => {
                const limit = clampLimit(input.limit, DEFAULT_FEED_LIMIT);
                const queryLimit = resolveQueryLimit(limit);
                const authorChunks = chunkAuthors(authors);
                const batchEvents: NostrEvent[] = [];

                for (const authorChunk of authorChunks) {
                    const filter: NostrFilter = {
                        authors: authorChunk,
                        kinds: [...ARTICLE_FEED_KINDS],
                        limit: queryLimit,
                    };
                    if (typeof input.until === 'number') {
                        filter.until = input.until;
                    }
                    if (hashtags.length > 0) {
                        filter['#t'] = hashtags;
                    }

                    const events = await fetchBackfillWithTimeout(transport, [filter], backfillTimeoutMs);
                    batchEvents.push(...events);
                }

                const sortedItems = sortAndDedupe(batchEvents)
                    .map(toArticleFeedItem)
                    .filter((item): item is NonNullable<typeof item> => item !== null)
                    .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id));

                const pageItems = sortedItems.slice(0, limit);
                const hasMore = sortedItems.length > limit;
                const result: SocialFeedPage = { items: pageItems, hasMore };
                const nextUntil = hasMore ? nextUntilFromItems(pageItems) : undefined;
                if (typeof nextUntil === 'number') {
                    result.nextUntil = nextUntil;
                }
                return result;
            });
        },

        async loadArticleById(input: LoadArticleByIdInput): Promise<NostrEvent | null> {
            const eventId = input.eventId.trim();
            if (!eventId) {
                return null;
            }

            return withRelayFallback(async (transport) => {
                const events = await fetchBackfillWithTimeout(transport, [{
                    ids: [eventId],
                    kinds: [...ARTICLE_FEED_KINDS],
                    limit: 1,
                }], backfillTimeoutMs);
                return sortAndDedupe(events).find((event) => event.id === eventId && event.kind === LONG_FORM_ARTICLE_KIND) ?? null;
            });
        },

        async loadHashtagFeed(input: LoadHashtagFeedInput): Promise<SocialFeedPage> {
            const hashtag = normalizeHashtag(input.hashtag);
            if (!hashtag) {
                return {
                    items: [],
                    hasMore: false,
                };
            }

            return withRelayFallback(async (transport) => {
                const limit = clampLimit(input.limit, DEFAULT_FEED_LIMIT);
                const queryLimit = resolveQueryLimit(limit);
                const collected = new Map<string, ReturnType<typeof toSocialFeedItem>>();

                let cursorUntil = input.until;
                let reachedSourceEnd = false;
                let pass = 0;

                while (collected.size < limit + 1 && pass < MAX_MAIN_FEED_PASSES) {
                    pass += 1;

                    const filter: NostrFilter = {
                        kinds: [...MAIN_FEED_KINDS],
                        '#t': [hashtag],
                        limit: queryLimit,
                    };
                    if (typeof cursorUntil === 'number') {
                        filter.until = cursorUntil;
                    }

                    const events = await fetchBackfillWithTimeout(transport, [filter], backfillTimeoutMs);

                    const sorted = sortAndDedupe(events as NostrEvent[]);
                    if (sorted.length === 0) {
                        reachedSourceEnd = true;
                        break;
                    }

                    for (const event of sorted) {
                        if (!isMainFeedEvent(event)) {
                            continue;
                        }

                        const item = toSocialFeedItem(event);
                        if (!item || collected.has(item.id)) {
                            continue;
                        }

                        collected.set(item.id, item);
                        if (collected.size >= limit + 1) {
                            break;
                        }
                    }

                    const oldest = sorted[sorted.length - 1]?.created_at;
                    if (typeof oldest !== 'number' || !Number.isFinite(oldest)) {
                        reachedSourceEnd = true;
                        break;
                    }

                    cursorUntil = oldest - 1;
                    if (sorted.length < queryLimit) {
                        reachedSourceEnd = true;
                        break;
                    }
                }

                const sortedItems = [...collected.values()]
                    .filter((item): item is NonNullable<typeof item> => item !== null)
                    .sort((left, right) => {
                        if (left.createdAt !== right.createdAt) {
                            return right.createdAt - left.createdAt;
                        }

                        return left.id.localeCompare(right.id);
                    });

                const pageItems = sortedItems.slice(0, limit);
                const endedByPassCap = !reachedSourceEnd
                    && pass >= MAX_MAIN_FEED_PASSES
                    && collected.size < limit + 1;
                const hasMore = sortedItems.length > limit || endedByPassCap;
                const nextUntil = !hasMore
                    ? undefined
                    : sortedItems.length > limit
                        ? nextUntilFromItems(pageItems)
                        : cursorUntil;

                const result: SocialFeedPage = {
                    items: pageItems,
                    hasMore,
                };

                if (typeof nextUntil === 'number') {
                    result.nextUntil = nextUntil;
                }

                return result;
            });
        },

        async loadThread(input: LoadThreadInput): Promise<SocialThreadPage> {
            const rootEventId = input.rootEventId;
            if (!rootEventId || typeof rootEventId !== 'string') {
                return {
                    root: null,
                    replies: [],
                    hasMore: false,
                };
            }

            return withRelayFallback(async (transport) => {
                const limit = clampLimit(input.limit, DEFAULT_THREAD_LIMIT);
                const queryLimit = resolveQueryLimit(limit);

                const threadReplyFilter: NostrFilter = {
                    kinds: [...THREAD_REPLY_KINDS],
                    '#e': [rootEventId],
                    limit: queryLimit,
                };
                if (typeof input.until === 'number') {
                    threadReplyFilter.until = input.until;
                }

                const events = await fetchBackfillWithTimeout(transport, [
                    {
                        ids: [rootEventId],
                        limit: 1,
                    },
                    threadReplyFilter,
                ], backfillTimeoutMs);

                const sorted = sortAndDedupe(events as NostrEvent[]);
                let root: SocialThreadItem | null = null;
                const replies: SocialThreadItem[] = [];

                for (const event of sorted) {
                    if (event.id === rootEventId && !root) {
                        root = toSocialThreadItem(event);
                        continue;
                    }

                    if (event.kind !== 1) {
                        continue;
                    }

                    if (!hasRootTag(event, rootEventId)) {
                        continue;
                    }

                    replies.push(toSocialThreadItem(event));
                }

                const pagedReplies = replies.slice(0, limit);
                const hasMore = replies.length > limit;

                const result: SocialThreadPage = {
                    root,
                    replies: pagedReplies,
                    hasMore,
                };

                const nextUntil = hasMore ? nextUntilFromItems(pagedReplies) : undefined;
                if (typeof nextUntil === 'number') {
                    result.nextUntil = nextUntil;
                }

                return result;
            });
        },

        async loadEngagement(input: LoadEngagementInput): Promise<SocialEngagementByEventId> {
            const targetEventIds = normalizeTargetEventIds(input.eventIds);
            const engagementByEventId: SocialEngagementByEventId = {};
            const targetSet = new Set(targetEventIds);

            for (const eventId of targetEventIds) {
                engagementByEventId[eventId] = createEmptyEngagementMetrics();
            }

            if (targetEventIds.length === 0) {
                return engagementByEventId;
            }

            return withRelayFallback(async (transport) => {
                const limit = clampLimit(input.limit, Math.max(DEFAULT_ENGAGEMENT_LIMIT, targetEventIds.length));
                const eventIdChunks = chunkEventIds(targetEventIds);
                const filters: NostrFilter[] = [];

                for (const chunk of eventIdChunks) {
                    const eFilter: NostrFilter = {
                        kinds: [...ENGAGEMENT_KINDS],
                        '#e': chunk,
                        limit,
                    };
                    const qFilter: NostrFilter = {
                        kinds: [6, 16],
                        '#q': chunk,
                        limit,
                    };
                    if (typeof input.until === 'number') {
                        eFilter.until = input.until;
                        qFilter.until = input.until;
                    }

                    filters.push(eFilter);
                    filters.push(qFilter);
                }

                const events = await fetchBackfillWithTimeout(transport, filters, backfillTimeoutMs);

                for (const event of sortAndDedupe(events as NostrEvent[])) {
                    const targetEventId = resolveEngagementTargetEventId(event, targetSet);
                    if (!targetEventId || !engagementByEventId[targetEventId]) {
                        continue;
                    }

                    if (event.kind === 7) {
                        engagementByEventId[targetEventId].reactions += 1;
                        continue;
                    }

                    if (event.kind === 6 || event.kind === 16) {
                        engagementByEventId[targetEventId].reposts += 1;
                        continue;
                    }

                    if (event.kind === 9735) {
                        engagementByEventId[targetEventId].zaps += 1;
                        engagementByEventId[targetEventId].zapSats += parseZapSats(event);
                        continue;
                    }

                    if (event.kind === 1 && isReplyEvent(event)) {
                        engagementByEventId[targetEventId].replies += 1;
                    }
                }

                return engagementByEventId;
            });
        },

        async loadViewerReactions(input: LoadViewerReactionsInput): Promise<ViewerReactionByEventId> {
            const ownerPubkey = typeof input.ownerPubkey === 'string' ? input.ownerPubkey.trim() : '';
            const targetEventIds = normalizeTargetEventIds(input.eventIds);
            const targetSet = new Set(targetEventIds);

            if (!ownerPubkey || targetEventIds.length === 0) {
                return {};
            }

            return withRelayFallback(async (transport) => {
                const limit = clampLimit(input.limit, Math.max(DEFAULT_VIEWER_REACTIONS_LIMIT, targetEventIds.length));
                const eventIdChunks = chunkEventIds(targetEventIds);
                const filters: NostrFilter[] = eventIdChunks.map((chunk) => ({
                    authors: [ownerPubkey],
                    kinds: [7],
                    '#e': chunk,
                    limit,
                }));

                const events = await fetchBackfillWithTimeout(transport, filters, backfillTimeoutMs);
                const latestReactionByEventId = new Map<string, NostrEvent>();
                const reactionByEventId: ViewerReactionByEventId = {};

                for (const event of sortAndDedupe(events as NostrEvent[])) {
                    if (event.kind !== 7 || event.pubkey !== ownerPubkey) {
                        continue;
                    }

                    const targetEventId = extractTargetEventId(event);
                    if (!targetEventId || !targetSet.has(targetEventId) || latestReactionByEventId.has(targetEventId)) {
                        continue;
                    }

                    latestReactionByEventId.set(targetEventId, event);
                }

                const reactionEventIds = [...latestReactionByEventId.values()].map((event) => event.id);
                const deleteFilters: NostrFilter[] = chunkEventIds(reactionEventIds).map((chunk) => ({
                    authors: [ownerPubkey],
                    kinds: [5],
                    '#e': chunk,
                    limit,
                }));
                const deleteEvents = deleteFilters.length > 0
                    ? await fetchBackfillWithTimeout(transport, deleteFilters, backfillTimeoutMs)
                    : [];
                const deletedReactionEventIds = collectDeletedEventIds(sortAndDedupe(deleteEvents as NostrEvent[]), ownerPubkey);

                for (const [targetEventId, event] of latestReactionByEventId.entries()) {
                    if (deletedReactionEventIds.has(event.id)) {
                        continue;
                    }

                    reactionByEventId[targetEventId] = {
                        eventId: targetEventId,
                        reactionEventId: event.id,
                        emoji: normalizeReactionEmoji(event.content),
                        createdAt: event.created_at,
                    };
                }

                return reactionByEventId;
            });
        },

        async loadViewerZaps(input: LoadViewerZapsInput): Promise<ViewerZapByEventId> {
            const ownerPubkey = typeof input.ownerPubkey === 'string' ? input.ownerPubkey.trim() : '';
            const targetEventIds = normalizeTargetEventIds(input.eventIds);
            const targetSet = new Set(targetEventIds);

            if (!ownerPubkey || targetEventIds.length === 0) {
                return {};
            }

            return withRelayFallback(async (transport) => {
                const limit = clampLimit(input.limit, Math.max(DEFAULT_VIEWER_ZAPS_LIMIT, targetEventIds.length));
                const eventIdChunks = chunkEventIds(targetEventIds);
                const filters: NostrFilter[] = eventIdChunks.map((chunk) => ({
                    kinds: [9735],
                    '#e': chunk,
                    limit,
                }));

                const events = await fetchBackfillWithTimeout(transport, filters, backfillTimeoutMs);
                const viewerZapByEventId: ViewerZapByEventId = {};

                for (const event of sortAndDedupe(events as NostrEvent[])) {
                    if (event.kind !== 9735 || hasAnonymousZapRequest(event)) {
                        continue;
                    }

                    const targetEventId = resolveEngagementTargetEventId(event, targetSet);
                    if (!targetEventId || viewerZapByEventId[targetEventId]) {
                        continue;
                    }

                    const senderPubkey = parseZapSenderPubkey(event);
                    const amountSats = parseZapSats(event);
                    if (senderPubkey !== ownerPubkey || amountSats <= 0) {
                        continue;
                    }

                    viewerZapByEventId[targetEventId] = {
                        eventId: targetEventId,
                        zapReceiptEventId: event.id,
                        amountSats,
                        createdAt: event.created_at,
                    };
                }

                return viewerZapByEventId;
            });
        },

        async loadViewerReplies(input: LoadViewerRepliesInput): Promise<ViewerReplyByEventId> {
            const ownerPubkey = typeof input.ownerPubkey === 'string' ? input.ownerPubkey.trim() : '';
            const targetEventIds = normalizeTargetEventIds(input.eventIds);
            const targetSet = new Set(targetEventIds);

            if (!ownerPubkey || targetEventIds.length === 0) {
                return {};
            }

            return withRelayFallback(async (transport) => {
                const limit = clampLimit(input.limit, Math.max(DEFAULT_VIEWER_REPLIES_LIMIT, targetEventIds.length));
                const eventIdChunks = chunkEventIds(targetEventIds);
                const filters: NostrFilter[] = eventIdChunks.map((chunk) => ({
                    authors: [ownerPubkey],
                    kinds: [1],
                    '#e': chunk,
                    limit,
                }));

                const events = await fetchBackfillWithTimeout(transport, filters, backfillTimeoutMs);
                const viewerReplyByEventId: ViewerReplyByEventId = {};

                for (const event of sortAndDedupe(events as NostrEvent[])) {
                    if (event.kind !== 1 || event.pubkey !== ownerPubkey) {
                        continue;
                    }

                    const targetEventId = resolveViewerReplyTargetEventId(event, targetSet);
                    if (!targetEventId || viewerReplyByEventId[targetEventId]) {
                        continue;
                    }

                    viewerReplyByEventId[targetEventId] = {
                        eventId: targetEventId,
                        replyEventId: event.id,
                        createdAt: event.created_at,
                    };
                }

                return viewerReplyByEventId;
            });
        },
    };
}
