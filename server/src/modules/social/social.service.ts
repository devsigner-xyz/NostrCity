import { SimplePool, type Filter } from 'nostr-tools';

import { shouldUseFallbackRelays } from '../../relay/relay-fallback';
import { createRelayGateway } from '../../relay/relay-gateway';
import type {
  RelayGateway,
  RelayGatewayQueryContext,
} from '../../relay/relay-gateway.types';
import { resolveRelaySets } from '../../relay/relay-resolver';
import type {
  ArticleParams,
  ArticleResponseDto,
  ArticlesFeedQuery,
  EngagementBody,
  EngagementResponseDto,
  FollowingFeedResponseDto,
  FollowingFeedQuery,
  SocialEventDto,
  ThreadResponseDto,
  ThreadParams,
  ThreadQuery,
  ViewerReactionsBody,
  ViewerReactionsResponseDto,
} from './social.schemas';

type ThreadRequest = ThreadQuery & ThreadParams;
type EngagementRequest = EngagementBody;
type ArticleRequest = ArticleParams;
type ViewerReactionsRequest = ViewerReactionsBody;

type NostrEventLike = {
  id: string;
  sig?: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
};

const DEFAULT_BOOTSTRAP_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

const SOCIAL_NOTE_KINDS = [1, 6];
const LONG_FORM_ARTICLE_KIND = 30023;
const ENGAGEMENT_QUERY_LIMIT = 5_000;

const createEmptyEngagementTotals = () => ({
  replies: 0,
  reposts: 0,
  reactions: 0,
  zaps: 0,
  zapSats: 0,
});

const normalizeReactionEmoji = (content: string): string => {
  const normalized = content.trim();
  return normalized.length === 0 || normalized === '+' ? '❤️' : normalized;
};

const toEventDto = (event: NostrEventLike): SocialEventDto => {
  return {
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    createdAt: event.created_at,
    content: event.content,
    tags: event.tags,
    ...(typeof event.sig === 'string' ? { sig: event.sig } : {}),
  };
};

const byCreatedAtDesc = (left: NostrEventLike, right: NostrEventLike): number => {
  if (left.created_at !== right.created_at) {
    return right.created_at - left.created_at;
  }

  return left.id.localeCompare(right.id);
};

const dedupeById = (events: NostrEventLike[]): NostrEventLike[] => {
  const map = new Map<string, NostrEventLike>();
  for (const event of events) {
    if (!map.has(event.id)) {
      map.set(event.id, event);
    }
  }

  return [...map.values()];
};

const parseFollowsFromContactList = (event: NostrEventLike | undefined): string[] => {
  if (!event) {
    return [];
  }

  const follows = new Set<string>();
  for (const tag of event.tags) {
    if (Array.isArray(tag) && tag[0] === 'p' && typeof tag[1] === 'string') {
      const value = tag[1].trim().toLowerCase();
      if (/^[0-9a-f]{64}$/.test(value)) {
        follows.add(value);
      }
    }
  }

  return [...follows];
};

const findTargetEventId = (
  tags: string[][],
  candidateEventIds: Set<string>,
): string | undefined => {
  const matchingETags = tags.filter(
    (tag) =>
      Array.isArray(tag) &&
      tag[0] === 'e' &&
      typeof tag[1] === 'string' &&
      candidateEventIds.has(tag[1]),
  );

  for (const tag of matchingETags) {
    if (tag[3] === 'reply') {
      return tag[1];
    }
  }

  for (const tag of matchingETags) {
    if (tag[3] === 'root') {
      return tag[1];
    }
  }

  for (let index = matchingETags.length - 1; index >= 0; index -= 1) {
    const tag = matchingETags[index];
    if (
      typeof tag[1] === 'string' &&
      candidateEventIds.has(tag[1])
    ) {
      return tag[1];
    }
  }

  return undefined;
};

const findLastTargetEventId = (
  tags: string[][],
  candidateEventIds: Set<string>,
): string | undefined => {
  for (let index = tags.length - 1; index >= 0; index -= 1) {
    const tag = tags[index];
    if (
      Array.isArray(tag) &&
      tag[0] === 'e' &&
      typeof tag[1] === 'string' &&
      candidateEventIds.has(tag[1])
    ) {
      return tag[1];
    }
  }

  return undefined;
};

const collectDeletedEventIds = (events: NostrEventLike[], ownerPubkey: string): Set<string> => {
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
};

const parseZapSats = (event: NostrEventLike): number => {
  const amountTag = event.tags.find(
    (tag) => Array.isArray(tag) && tag[0] === 'amount' && typeof tag[1] === 'string',
  );
  if (amountTag && amountTag[1]) {
    const parsedAmount = Number(amountTag[1]);
    if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
      return Math.floor(parsedAmount / 1000);
    }
  }

  const descriptionTag = event.tags.find(
    (tag) => Array.isArray(tag) && tag[0] === 'description' && typeof tag[1] === 'string',
  );
  if (!descriptionTag || !descriptionTag[1]) {
    return 0;
  }

  try {
    const parsed = JSON.parse(descriptionTag[1]) as { tags?: unknown };
    if (!parsed || !Array.isArray(parsed.tags)) {
      return 0;
    }

    for (const rawTag of parsed.tags) {
      if (!Array.isArray(rawTag) || rawTag[0] !== 'amount' || typeof rawTag[1] !== 'string') {
        continue;
      }

      const parsedAmount = Number(rawTag[1]);
      if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
        return Math.floor(parsedAmount / 1000);
      }
    }
  } catch {
    return 0;
  }

  return 0;
};

const paginateEvents = (
  events: NostrEventLike[],
  limit: number,
): { page: NostrEventLike[]; hasMore: boolean; nextUntil: number | null } => {
  const hasMore = events.length > limit;
  const page = events.slice(0, limit);
  const nextUntil =
    hasMore && page.length > 0
      ? Math.max(0, page[page.length - 1].created_at - 1)
      : null;

  return {
    page,
    hasMore,
    nextUntil,
  };
};

export interface SocialServiceOptions {
  feedGateway?: RelayGateway<FollowingFeedQuery, FollowingFeedResponseDto>;
  articlesFeedGateway?: RelayGateway<ArticlesFeedQuery, FollowingFeedResponseDto>;
  articleGateway?: RelayGateway<ArticleRequest, ArticleResponseDto>;
  threadGateway?: RelayGateway<ThreadRequest, ThreadResponseDto>;
  engagementGateway?: RelayGateway<EngagementRequest, EngagementResponseDto>;
  viewerReactionsGateway?: RelayGateway<ViewerReactionsRequest, ViewerReactionsResponseDto>;
  fetchFollowingFeed?: (
    query: FollowingFeedQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<FollowingFeedResponseDto>;
  fetchArticlesFeed?: (
    query: ArticlesFeedQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<FollowingFeedResponseDto>;
  fetchArticleById?: (
    query: ArticleRequest,
    context: RelayGatewayQueryContext,
  ) => Promise<ArticleResponseDto>;
  fetchThread?: (
    query: ThreadRequest,
    context: RelayGatewayQueryContext,
  ) => Promise<ThreadResponseDto>;
  fetchEngagement?: (
    query: EngagementRequest,
    context: RelayGatewayQueryContext,
  ) => Promise<EngagementResponseDto>;
  fetchViewerReactions?: (
    query: ViewerReactionsRequest,
    context: RelayGatewayQueryContext,
  ) => Promise<ViewerReactionsResponseDto>;
  defaultTimeoutMs?: number;
  bootstrapRelays?: string[];
  pool?: SimplePool;
}

export interface SocialService {
  getFollowingFeed(query: FollowingFeedQuery): Promise<FollowingFeedResponseDto>;
  getArticlesFeed(query: ArticlesFeedQuery): Promise<FollowingFeedResponseDto>;
  getArticleById(query: ArticleRequest): Promise<ArticleResponseDto>;
  getThread(query: ThreadRequest): Promise<ThreadResponseDto>;
  getEngagement(query: EngagementRequest): Promise<EngagementResponseDto>;
  getViewerReactions(query: ViewerReactionsRequest): Promise<ViewerReactionsResponseDto>;
}

class GatewaySocialService implements SocialService {
  constructor(
    private readonly feedGateway: RelayGateway<FollowingFeedQuery, FollowingFeedResponseDto>,
    private readonly articlesFeedGateway: RelayGateway<ArticlesFeedQuery, FollowingFeedResponseDto>,
    private readonly articleGateway: RelayGateway<ArticleRequest, ArticleResponseDto>,
    private readonly threadGateway: RelayGateway<ThreadRequest, ThreadResponseDto>,
    private readonly engagementGateway: RelayGateway<EngagementRequest, EngagementResponseDto>,
    private readonly viewerReactionsGateway: RelayGateway<ViewerReactionsRequest, ViewerReactionsResponseDto>,
  ) {}

  async getFollowingFeed(query: FollowingFeedQuery): Promise<FollowingFeedResponseDto> {
    return this.feedGateway.query({
      key: `social:feed:${query.ownerPubkey}:${query.limit}:${query.until}:${query.hashtag ?? ''}`,
      params: query,
    });
  }

  async getArticlesFeed(query: ArticlesFeedQuery): Promise<FollowingFeedResponseDto> {
    return this.articlesFeedGateway.query({
      key: `social:articles:${query.ownerPubkey}:${query.limit}:${query.until}`,
      params: query,
    });
  }

  async getArticleById(query: ArticleRequest): Promise<ArticleResponseDto> {
    return this.articleGateway.query({
      key: `social:article:${query.eventId}`,
      params: query,
    });
  }

  async getThread(query: ThreadRequest): Promise<ThreadResponseDto> {
    return this.threadGateway.query({
      key: `social:thread:${query.rootEventId}:${query.limit}:${query.until}`,
      params: query,
    });
  }

  async getEngagement(query: EngagementRequest): Promise<EngagementResponseDto> {
    const eventIds = [...new Set(query.eventIds)].sort();

    return this.engagementGateway.query({
      key: `social:engagement:${eventIds.join(',')}:${query.until ?? ''}`,
      params: {
        ...query,
        eventIds,
      },
    });
  }

  async getViewerReactions(query: ViewerReactionsRequest): Promise<ViewerReactionsResponseDto> {
    const eventIds = [...new Set(query.eventIds)].sort();

    return this.viewerReactionsGateway.query({
      key: `social:viewer-reactions:${query.ownerPubkey}:${eventIds.join(',')}`,
      params: {
        ...query,
        eventIds,
      },
    });
  }
}

const toDefaultEngagementResponse = (eventIds: string[]): EngagementResponseDto => {
  return {
    byEventId: Object.fromEntries(
      [...new Set(eventIds)].map((eventId) => [
        eventId,
        createEmptyEngagementTotals(),
      ]),
    ),
  };
};

const createPoolFetchers = (options: {
  pool: SimplePool;
  bootstrapRelays: string[];
}): {
  fetchFollowingFeed: (
    query: FollowingFeedQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<FollowingFeedResponseDto>;
  fetchThread: (
    query: ThreadRequest,
    context: RelayGatewayQueryContext,
  ) => Promise<ThreadResponseDto>;
  fetchEngagement: (
    query: EngagementRequest,
    context: RelayGatewayQueryContext,
  ) => Promise<EngagementResponseDto>;
  fetchViewerReactions: (
    query: ViewerReactionsRequest,
    context: RelayGatewayQueryContext,
  ) => Promise<ViewerReactionsResponseDto>;
  fetchArticlesFeed: (
    query: ArticlesFeedQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<FollowingFeedResponseDto>;
  fetchArticleById: (
    query: ArticleRequest,
    context: RelayGatewayQueryContext,
  ) => Promise<ArticleResponseDto>;
} => {
  const queryWithFallback = async <T>(
    relaySets: ReturnType<typeof resolveRelaySets>,
    queryFn: (relays: string[]) => Promise<T>,
  ): Promise<T> => {
    if (shouldUseFallbackRelays({ primaryRelays: relaySets.primary })) {
      return queryFn(relaySets.fallback);
    }

    try {
      return await queryFn(relaySets.primary);
    } catch (error) {
      if (shouldUseFallbackRelays({ primaryRelays: relaySets.primary, error })) {
        return queryFn(relaySets.fallback);
      }

      throw error;
    }
  };

  const fetchFollowingFeed = async (
    query: FollowingFeedQuery,
    _context: RelayGatewayQueryContext,
  ): Promise<FollowingFeedResponseDto> => {
    const relaySets = resolveRelaySets({
      scopedRelays: [],
      userRelays: [],
      bootstrapRelays: options.bootstrapRelays,
    });

    const queryFeedOnRelays = async (relays: string[]): Promise<FollowingFeedResponseDto> => {
      if (relays.length === 0) {
        return {
          items: [],
          hasMore: false,
          nextUntil: null,
        };
      }

      const contactEvents = await options.pool.querySync(relays, {
        authors: [query.ownerPubkey],
        kinds: [3],
        limit: 1,
      });

      const latestContactList = dedupeById(contactEvents).sort(byCreatedAtDesc)[0];
      const follows = parseFollowsFromContactList(latestContactList);
      if (follows.length === 0) {
        return {
          items: [],
          hasMore: false,
          nextUntil: null,
        };
      }

      const filter: Filter = {
        authors: follows,
        kinds: SOCIAL_NOTE_KINDS,
        until: query.until,
        limit: query.limit + 1,
      };

      if (query.hashtag) {
        filter['#t'] = [query.hashtag.toLowerCase()];
      }

      const events = await options.pool.querySync(relays, filter);
      const sorted = dedupeById(events).sort(byCreatedAtDesc);
      const pagination = paginateEvents(sorted, query.limit);

      return {
        items: pagination.page.map(toEventDto),
        hasMore: pagination.hasMore,
        nextUntil: pagination.nextUntil,
      };
    };

    return queryWithFallback(relaySets, queryFeedOnRelays);
  };

  const fetchArticlesFeed = async (
    query: ArticlesFeedQuery,
    _context: RelayGatewayQueryContext,
  ): Promise<FollowingFeedResponseDto> => {
    const relaySets = resolveRelaySets({
      scopedRelays: [],
      userRelays: [],
      bootstrapRelays: options.bootstrapRelays,
    });

    const queryArticlesOnRelays = async (relays: string[]): Promise<FollowingFeedResponseDto> => {
      if (relays.length === 0) {
        return {
          items: [],
          hasMore: false,
          nextUntil: null,
        };
      }

      const contactEvents = await options.pool.querySync(relays, {
        authors: [query.ownerPubkey],
        kinds: [3],
        limit: 1,
      });

      const latestContactList = dedupeById(contactEvents).sort(byCreatedAtDesc)[0];
      const follows = parseFollowsFromContactList(latestContactList);
      if (follows.length === 0) {
        return {
          items: [],
          hasMore: false,
          nextUntil: null,
        };
      }

      const events = await options.pool.querySync(relays, {
        authors: follows,
        kinds: [LONG_FORM_ARTICLE_KIND],
        until: query.until,
        limit: query.limit + 1,
      });
      const sorted = dedupeById(events).sort(byCreatedAtDesc);
      const pagination = paginateEvents(sorted, query.limit);

      return {
        items: pagination.page.map(toEventDto),
        hasMore: pagination.hasMore,
        nextUntil: pagination.nextUntil,
      };
    };

    return queryWithFallback(relaySets, queryArticlesOnRelays);
  };

  const fetchArticleById = async (
    query: ArticleRequest,
    _context: RelayGatewayQueryContext,
  ): Promise<ArticleResponseDto> => {
    const relaySets = resolveRelaySets({
      scopedRelays: [],
      userRelays: [],
      bootstrapRelays: options.bootstrapRelays,
    });

    const queryArticleOnRelays = async (relays: string[]): Promise<ArticleResponseDto> => {
      if (relays.length === 0) {
        return { event: null };
      }

      const events = await options.pool.querySync(relays, {
        ids: [query.eventId],
        kinds: [LONG_FORM_ARTICLE_KIND],
        limit: 1,
      });
      const event = dedupeById(events).find((candidate) => candidate.id === query.eventId && candidate.kind === LONG_FORM_ARTICLE_KIND);

      return {
        event: event ? toEventDto(event) : null,
      };
    };

    return queryWithFallback(relaySets, queryArticleOnRelays);
  };

  const fetchThread = async (
    query: ThreadRequest,
    _context: RelayGatewayQueryContext,
  ): Promise<ThreadResponseDto> => {
    const relaySets = resolveRelaySets({
      scopedRelays: [],
      userRelays: [],
      bootstrapRelays: options.bootstrapRelays,
    });

    const queryThreadOnRelays = async (relays: string[]): Promise<ThreadResponseDto> => {
      if (relays.length === 0) {
        return {
          root: null,
          replies: [],
          hasMore: false,
          nextUntil: null,
        };
      }

      const rootCandidates = await options.pool.querySync(relays, {
        ids: [query.rootEventId],
        limit: 1,
      });
      const root = dedupeById(rootCandidates).sort(byCreatedAtDesc)[0] ?? null;

      const replyCandidates = await options.pool.querySync(relays, {
        '#e': [query.rootEventId],
        kinds: [1],
        until: query.until,
        limit: query.limit + 1,
      });
      const replies = dedupeById(replyCandidates).sort(byCreatedAtDesc);
      const pagination = paginateEvents(replies, query.limit);

      return {
        root: root ? toEventDto(root) : null,
        replies: pagination.page.map(toEventDto),
        hasMore: pagination.hasMore,
        nextUntil: pagination.nextUntil,
      };
    };

    return queryWithFallback(relaySets, queryThreadOnRelays);
  };

  const fetchEngagement = async (
    query: EngagementRequest,
    _context: RelayGatewayQueryContext,
  ): Promise<EngagementResponseDto> => {
    const relaySets = resolveRelaySets({
      scopedRelays: [],
      userRelays: [],
      bootstrapRelays: options.bootstrapRelays,
    });

    const queryEngagementOnRelays = async (relays: string[]): Promise<EngagementResponseDto> => {
      if (relays.length === 0) {
        return toDefaultEngagementResponse(query.eventIds);
      }

      const candidateIds = new Set(query.eventIds);
      const totalsByEventId = new Map(
        query.eventIds.map((eventId) => [eventId, createEmptyEngagementTotals()]),
      );

      const engagementFilters: Filter[] = [
        {
          '#e': query.eventIds,
          kinds: [1],
          limit: ENGAGEMENT_QUERY_LIMIT,
          until: query.until,
        },
        {
          '#e': query.eventIds,
          kinds: [6],
          limit: ENGAGEMENT_QUERY_LIMIT,
          until: query.until,
        },
        {
          '#e': query.eventIds,
          kinds: [7],
          limit: ENGAGEMENT_QUERY_LIMIT,
          until: query.until,
        },
        {
          '#e': query.eventIds,
          kinds: [9735],
          limit: ENGAGEMENT_QUERY_LIMIT,
          until: query.until,
        },
      ];

      const [replies, reposts, reactions, zaps] = await Promise.all(
        engagementFilters.map((filter) => options.pool.querySync(relays, filter)),
      );

      for (const event of dedupeById(replies)) {
        const eventId = findTargetEventId(event.tags, candidateIds);
        if (!eventId) {
          continue;
        }

        totalsByEventId.get(eventId)!.replies += 1;
      }

      for (const event of dedupeById(reposts)) {
        const eventId = findTargetEventId(event.tags, candidateIds);
        if (!eventId) {
          continue;
        }

        totalsByEventId.get(eventId)!.reposts += 1;
      }

      for (const event of dedupeById(reactions)) {
        const eventId = findTargetEventId(event.tags, candidateIds);
        if (!eventId) {
          continue;
        }

        totalsByEventId.get(eventId)!.reactions += 1;
      }

      for (const event of dedupeById(zaps)) {
        const eventId = findTargetEventId(event.tags, candidateIds);
        if (!eventId) {
          continue;
        }

        const totals = totalsByEventId.get(eventId)!;
        totals.zaps += 1;
        totals.zapSats += parseZapSats(event);
      }

      return {
        byEventId: Object.fromEntries(totalsByEventId.entries()),
      };
    };

    return queryWithFallback(relaySets, queryEngagementOnRelays);
  };

  const fetchViewerReactions = async (
    query: ViewerReactionsRequest,
    _context: RelayGatewayQueryContext,
  ): Promise<ViewerReactionsResponseDto> => {
    const relaySets = resolveRelaySets({
      scopedRelays: [],
      userRelays: [],
      bootstrapRelays: options.bootstrapRelays,
    });

    const queryViewerReactionsOnRelays = async (relays: string[]): Promise<ViewerReactionsResponseDto> => {
      if (relays.length === 0) {
        return { byEventId: {} };
      }

      const candidateIds = new Set(query.eventIds);
      const events = await options.pool.querySync(relays, {
        '#e': query.eventIds,
        authors: [query.ownerPubkey],
        kinds: [7],
        limit: ENGAGEMENT_QUERY_LIMIT,
      });
      const latestReactionByEventId = new Map<string, NostrEventLike>();
      const byEventId: ViewerReactionsResponseDto['byEventId'] = {};

      for (const event of dedupeById(events).sort(byCreatedAtDesc)) {
        if (event.kind !== 7 || event.pubkey !== query.ownerPubkey) {
          continue;
        }

        const eventId = findLastTargetEventId(event.tags, candidateIds);
        if (!eventId || latestReactionByEventId.has(eventId)) {
          continue;
        }

        latestReactionByEventId.set(eventId, event);
      }

      const reactionEventIds = [...latestReactionByEventId.values()].map((event) => event.id);
      const deleteEvents = reactionEventIds.length > 0
        ? await options.pool.querySync(relays, {
          '#e': reactionEventIds,
          authors: [query.ownerPubkey],
          kinds: [5],
          limit: ENGAGEMENT_QUERY_LIMIT,
        })
        : [];
      const deletedReactionEventIds = collectDeletedEventIds(dedupeById(deleteEvents), query.ownerPubkey);

      for (const [eventId, event] of latestReactionByEventId.entries()) {
        if (deletedReactionEventIds.has(event.id)) {
          continue;
        }

        byEventId[eventId] = {
          eventId,
          reactionEventId: event.id,
          emoji: normalizeReactionEmoji(event.content),
          createdAt: event.created_at,
        };
      }

      return { byEventId };
    };

    return queryWithFallback(relaySets, queryViewerReactionsOnRelays);
  };

  return {
    fetchFollowingFeed,
    fetchArticlesFeed,
    fetchArticleById,
    fetchThread,
    fetchEngagement,
    fetchViewerReactions,
  };
};

export const createSocialService = (options: SocialServiceOptions = {}): SocialService => {
  const pool = options.pool ?? new SimplePool();
  const bootstrapRelays = options.bootstrapRelays ?? DEFAULT_BOOTSTRAP_RELAYS;
  const fetchers = createPoolFetchers({
    pool,
    bootstrapRelays,
  });

  const feedGateway =
    options.feedGateway ??
    createRelayGateway<FollowingFeedQuery, FollowingFeedResponseDto>({
      queryFn: options.fetchFollowingFeed || fetchers.fetchFollowingFeed,
      defaultTimeoutMs: options.defaultTimeoutMs,
      cache: {
        ttlMs: 15_000,
        maxEntries: 300,
      },
    });

  const articlesFeedGateway =
    options.articlesFeedGateway ??
    createRelayGateway<ArticlesFeedQuery, FollowingFeedResponseDto>({
      queryFn: options.fetchArticlesFeed || fetchers.fetchArticlesFeed,
      defaultTimeoutMs: options.defaultTimeoutMs,
      cache: {
        ttlMs: 15_000,
        maxEntries: 300,
      },
    });

  const articleGateway =
    options.articleGateway ??
    createRelayGateway<ArticleRequest, ArticleResponseDto>({
      queryFn: options.fetchArticleById || fetchers.fetchArticleById,
      defaultTimeoutMs: options.defaultTimeoutMs,
      cache: {
        ttlMs: 15_000,
        maxEntries: 300,
      },
    });

  const threadGateway =
    options.threadGateway ??
    createRelayGateway<ThreadRequest, ThreadResponseDto>({
      queryFn: options.fetchThread || fetchers.fetchThread,
      defaultTimeoutMs: options.defaultTimeoutMs,
      cache: {
        ttlMs: 15_000,
        maxEntries: 300,
      },
    });

  const engagementGateway =
    options.engagementGateway ??
    createRelayGateway<EngagementRequest, EngagementResponseDto>({
      queryFn: options.fetchEngagement || fetchers.fetchEngagement,
      defaultTimeoutMs: options.defaultTimeoutMs,
      cache: {
        ttlMs: 5_000,
        maxEntries: 300,
      },
    });

  const viewerReactionsGateway =
    options.viewerReactionsGateway ??
    createRelayGateway<ViewerReactionsRequest, ViewerReactionsResponseDto>({
      queryFn: options.fetchViewerReactions || fetchers.fetchViewerReactions,
      defaultTimeoutMs: options.defaultTimeoutMs,
      cache: {
        ttlMs: 5_000,
        maxEntries: 300,
      },
    });

  return new GatewaySocialService(feedGateway, articlesFeedGateway, articleGateway, threadGateway, engagementGateway, viewerReactionsGateway);
};
