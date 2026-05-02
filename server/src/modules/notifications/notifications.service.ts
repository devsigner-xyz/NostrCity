import { SimplePool, type Filter } from 'nostr-tools';

import {
  normalizeHexEventId,
  normalizeHexPubkey,
  sanitizeNostrTagValue,
} from '../../nostr/nostr-validation';
import { shouldUseFallbackRelays } from '../../relay/relay-fallback';
import { createRelayGateway } from '../../relay/relay-gateway';
import type {
  RelayGateway,
  RelayGatewayQueryContext,
} from '../../relay/relay-gateway.types';
import {
  createRelayQueryExecutor,
  type RelayQueryExecutor,
} from '../../relay/relay-query-executor';
import { resolveRelaySets } from '../../relay/relay-resolver';
import type {
  NotificationEventDto,
  NotificationItemDto,
  NotificationsQuery,
  NotificationsResponseDto,
  NotificationsStreamQuery,
} from './notifications.schemas';

type NostrEventLike = {
  id: string;
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

const NOTIFICATION_KINDS = [1, 6, 7, 16, 9735];

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

const sanitizeTags = (tags: string[][]): string[][] => {
  return tags
    .filter((tag) => Array.isArray(tag))
    .map((tag) => tag.map(sanitizeNostrTagValue).filter((value): value is string => value !== null))
    .filter((tag) => tag.length > 0);
};

const firstHexTagValue = (
  tags: string[][],
  name: string,
  normalize: (value: string) => string | null,
): string | null => {
  for (const tag of tags) {
    if (tag[0] !== name || typeof tag[1] !== 'string') {
      continue;
    }

    const normalized = normalize(tag[1]);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const toEventDto = (event: NostrEventLike, tags: string[][]): NotificationEventDto => {
  return {
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    createdAt: event.created_at,
    content: event.content,
    tags,
  };
};

const toNotificationItem = (event: NostrEventLike): NotificationItemDto => {
  const tags = sanitizeTags(event.tags);

  return {
    id: event.id,
    kind: event.kind,
    actorPubkey: event.pubkey,
    createdAt: event.created_at,
    targetEventId: firstHexTagValue(tags, 'e', normalizeHexEventId),
    targetPubkey: firstHexTagValue(tags, 'p', normalizeHexPubkey),
    rawEvent: toEventDto(event, tags),
  };
};

const paginateEvents = (
  events: NostrEventLike[],
  limit: number,
): { page: NostrEventLike[]; hasMore: boolean; nextSince: number | null } => {
  const hasMore = events.length > limit;
  const page = events.slice(0, limit);
  const nextSince =
    hasMore && page.length > 0 ? Math.max(0, page[page.length - 1].created_at - 1) : null;

  return {
    page,
    hasMore,
    nextSince,
  };
};

export interface NotificationsServiceOptions {
  listGateway?: RelayGateway<NotificationsQuery, NotificationsResponseDto>;
  streamGateway?: RelayGateway<NotificationsStreamQuery, NotificationItemDto[]>;
  fetchNotifications?: (
    query: NotificationsQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<NotificationsResponseDto>;
  fetchNotificationStream?: (
    query: NotificationsStreamQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<NotificationItemDto[]>;
  defaultTimeoutMs?: number;
  bootstrapRelays?: string[];
  relayQueryExecutor?: RelayQueryExecutor;
  pool?: SimplePool;
}

export interface NotificationsService {
  getNotifications(query: NotificationsQuery): Promise<NotificationsResponseDto>;
  streamNotifications(
    query: NotificationsStreamQuery,
    signal?: AbortSignal,
  ): AsyncIterable<NotificationItemDto>;
}

const STREAM_POLL_INTERVAL_MS = 1_500;
const STREAM_FETCH_LIMIT = 50;
const STREAM_SEEN_IDS_MAX = 5_000;

const waitWithSignal = async (
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> => {
  if (!signal) {
    await new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
    return;
  }

  if (signal.aborted) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, timeoutMs);

    const onAbort = () => {
      clearTimeout(timeout);
      resolve();
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
};

class GatewayNotificationsService implements NotificationsService {
  constructor(
    private readonly listGateway: RelayGateway<NotificationsQuery, NotificationsResponseDto>,
    private readonly streamGateway: RelayGateway<NotificationsStreamQuery, NotificationItemDto[]>,
  ) {}

  async getNotifications(query: NotificationsQuery): Promise<NotificationsResponseDto> {
    return this.listGateway.query({
      key: `notifications:list:${query.ownerPubkey}:${query.limit}:${query.since}`,
      params: query,
    });
  }

  async *streamNotifications(
    query: NotificationsStreamQuery,
    signal?: AbortSignal,
  ): AsyncIterable<NotificationItemDto> {
    const seenIds = new Set<string>();
    const seenOrder: string[] = [];
    let since = query.since ?? 0;

    while (!signal?.aborted) {
      const items = await this.streamGateway.query({
        key: `notifications:stream:${query.ownerPubkey}:${since}`,
        params: {
          ...query,
          since,
        },
        bypassCache: true,
        signal,
      });

      let emitted = false;
      for (const item of items) {
        if (seenIds.has(item.id)) {
          continue;
        }

        seenIds.add(item.id);
        seenOrder.push(item.id);
        if (seenOrder.length > STREAM_SEEN_IDS_MAX) {
          const oldestSeenId = seenOrder.shift();
          if (oldestSeenId) {
            seenIds.delete(oldestSeenId);
          }
        }
        emitted = true;
        since = Math.max(since, item.createdAt);
        yield item;
      }

      if (!emitted) {
        await waitWithSignal(STREAM_POLL_INTERVAL_MS, signal);
      }
    }
  }
}

const createPoolFetchers = (options: {
  pool: SimplePool;
  bootstrapRelays: string[];
  relayQueryExecutor: RelayQueryExecutor;
}): {
  fetchNotifications: (
    query: NotificationsQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<NotificationsResponseDto>;
  fetchNotificationStream: (
    query: NotificationsStreamQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<NotificationItemDto[]>;
} => {
  const queryWithFallback = async <T>(
    queryFn: (relays: string[]) => Promise<T>,
  ): Promise<T> => {
    const relaySets = resolveRelaySets({
      scopedRelays: [],
      userRelays: [],
      bootstrapRelays: options.bootstrapRelays,
    });

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

  const queryNotificationEvents = async (
    relays: string[],
    filter: Filter,
    signal: AbortSignal,
  ): Promise<NostrEventLike[]> => {
    if (relays.length === 0) {
      return [];
    }

    const events = await options.relayQueryExecutor.query<NostrEventLike>({
      relays,
      filter,
      signal,
    });
    return dedupeById(events).sort(byCreatedAtDesc);
  };

  const fetchNotifications = async (
    query: NotificationsQuery,
    context: RelayGatewayQueryContext,
  ): Promise<NotificationsResponseDto> => {
    const until = query.since > 0 ? query.since : undefined;

    const events = await queryWithFallback((relays) =>
      queryNotificationEvents(relays, {
        '#p': [query.ownerPubkey],
        kinds: NOTIFICATION_KINDS,
        until,
        limit: query.limit + 1,
      }, context.signal),
    );

    const pagination = paginateEvents(events, query.limit);

    return {
      items: pagination.page.map(toNotificationItem),
      hasMore: pagination.hasMore,
      nextSince: pagination.nextSince,
    };
  };

  const fetchNotificationStream = async (
    query: NotificationsStreamQuery,
    context: RelayGatewayQueryContext,
  ): Promise<NotificationItemDto[]> => {
    const events = await queryWithFallback((relays) =>
      queryNotificationEvents(relays, {
        '#p': [query.ownerPubkey],
        kinds: NOTIFICATION_KINDS,
        since: query.since,
        limit: STREAM_FETCH_LIMIT,
      }, context.signal),
    );

    return events.map(toNotificationItem);
  };

  return {
    fetchNotifications,
    fetchNotificationStream,
  };
};

export const createNotificationsService = (
  options: NotificationsServiceOptions = {},
): NotificationsService => {
  const pool = options.pool ?? new SimplePool();
  const bootstrapRelays = options.bootstrapRelays ?? DEFAULT_BOOTSTRAP_RELAYS;
  const relayQueryExecutor = options.relayQueryExecutor ?? createRelayQueryExecutor({ pool });
  const fetchers = createPoolFetchers({
    pool,
    bootstrapRelays,
    relayQueryExecutor,
  });

  const listGateway =
    options.listGateway ??
    createRelayGateway<NotificationsQuery, NotificationsResponseDto>({
      queryFn: options.fetchNotifications ?? fetchers.fetchNotifications,
      defaultTimeoutMs: options.defaultTimeoutMs,
    });

  const streamGateway =
    options.streamGateway ??
    createRelayGateway<NotificationsStreamQuery, NotificationItemDto[]>({
      queryFn: options.fetchNotificationStream ?? fetchers.fetchNotificationStream,
      defaultTimeoutMs: options.defaultTimeoutMs,
    });

  return new GatewayNotificationsService(listGateway, streamGateway);
};
