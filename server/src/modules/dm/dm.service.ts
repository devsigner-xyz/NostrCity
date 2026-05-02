import { SimplePool, type Filter } from 'nostr-tools';

import { shouldUseFallbackRelays } from '../../relay/relay-fallback';
import { createRelayGateway } from '../../relay/relay-gateway';
import type {
  RelayGateway,
  RelayGatewayQueryContext,
} from '../../relay/relay-gateway.types';
import { resolveRelaySets } from '../../relay/relay-resolver';
import type {
  DmConversationQuery,
  DmEventDto,
  DmEventsResponseDto,
  DmInboxQuery,
  DmStreamQuery,
} from './dm.schemas';

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

const DM_EVENT_KINDS = [1059, 4];
const STREAM_POLL_INTERVAL_MS = 1_500;
const STREAM_FETCH_LIMIT = 50;
const STREAM_SEEN_IDS_MAX = 5_000;
const HEX_64_REGEX = /^[0-9a-f]{64}$/;

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

const hasPTag = (tags: string[][], pubkey: string): boolean => {
  return tags.some(
    (tag) => Array.isArray(tag) && tag[0] === 'p' && typeof tag[1] === 'string' && tag[1] === pubkey,
  );
};

const isValidTags = (tags: unknown): tags is string[][] => {
  return (
    Array.isArray(tags) &&
    tags.every(
      (tag) =>
        Array.isArray(tag) &&
        tag.every((value) => typeof value === 'string'),
    )
  );
};

const isValidDmEventShape = (event: NostrEventLike): boolean => {
  return (
    HEX_64_REGEX.test(event.id) &&
    HEX_64_REGEX.test(event.pubkey) &&
    Number.isInteger(event.kind) &&
    event.kind >= 0 &&
    Number.isInteger(event.created_at) &&
    event.created_at >= 0 &&
    typeof event.content === 'string' &&
    isValidTags(event.tags)
  );
};

const isAllowedDmKind = (kind: number): boolean => DM_EVENT_KINDS.includes(kind);

const isOwnerParticipant = (event: NostrEventLike, ownerPubkey: string): boolean => {
  return event.pubkey === ownerPubkey || hasPTag(event.tags, ownerPubkey);
};

const isConversationBetween = (
  event: NostrEventLike,
  ownerPubkey: string,
  peerPubkey: string,
): boolean => {
  if (event.pubkey === ownerPubkey) {
    return hasPTag(event.tags, peerPubkey);
  }

  if (event.pubkey === peerPubkey) {
    return hasPTag(event.tags, ownerPubkey);
  }

  return false;
};

const toEventDto = (event: NostrEventLike): DmEventDto => {
  return {
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    createdAt: event.created_at,
    content: event.content,
    tags: event.tags,
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

const waitWithSignal = async (timeoutMs: number, signal?: AbortSignal): Promise<void> => {
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

export interface DmServiceOptions {
  inboxGateway?: RelayGateway<DmInboxQuery, DmEventsResponseDto>;
  conversationGateway?: RelayGateway<DmConversationQuery, DmEventsResponseDto>;
  streamGateway?: RelayGateway<DmStreamQuery, DmEventDto[]>;
  fetchInboxEvents?: (
    query: DmInboxQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<DmEventsResponseDto>;
  fetchConversationEvents?: (
    query: DmConversationQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<DmEventsResponseDto>;
  fetchStreamEvents?: (
    query: DmStreamQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<DmEventDto[]>;
  defaultTimeoutMs?: number;
  bootstrapRelays?: string[];
  pool?: SimplePool;
}

export interface DmService {
  getInboxEvents(query: DmInboxQuery): Promise<DmEventsResponseDto>;
  getConversationEvents(query: DmConversationQuery): Promise<DmEventsResponseDto>;
  streamDmEvents(query: DmStreamQuery, signal?: AbortSignal): AsyncIterable<DmEventDto>;
}

class GatewayDmService implements DmService {
  constructor(
    private readonly inboxGateway: RelayGateway<DmInboxQuery, DmEventsResponseDto>,
    private readonly conversationGateway: RelayGateway<DmConversationQuery, DmEventsResponseDto>,
    private readonly streamGateway: RelayGateway<DmStreamQuery, DmEventDto[]>,
  ) {}

  async getInboxEvents(query: DmInboxQuery): Promise<DmEventsResponseDto> {
    return this.inboxGateway.query({
      key: `dm:inbox:${query.ownerPubkey}:${query.limit}:${query.since}`,
      params: query,
    });
  }

  async getConversationEvents(query: DmConversationQuery): Promise<DmEventsResponseDto> {
    return this.conversationGateway.query({
      key: `dm:conversation:${query.ownerPubkey}:${query.peerPubkey}:${query.limit}:${query.since}`,
      params: query,
    });
  }

  async *streamDmEvents(query: DmStreamQuery, signal?: AbortSignal): AsyncIterable<DmEventDto> {
    const seenIds = new Set<string>();
    const seenOrder: string[] = [];
    let since = query.since ?? 0;

    while (!signal?.aborted) {
      const items = await this.streamGateway.query({
        key: `dm:stream:${query.ownerPubkey}:${since}`,
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
}): {
  fetchInboxEvents: (
    query: DmInboxQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<DmEventsResponseDto>;
  fetchConversationEvents: (
    query: DmConversationQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<DmEventsResponseDto>;
  fetchStreamEvents: (
    query: DmStreamQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<DmEventDto[]>;
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

  const queryEventsOnRelays = async (
    relays: string[],
    filters: Filter[],
  ): Promise<NostrEventLike[]> => {
    if (relays.length === 0 || filters.length === 0) {
      return [];
    }

    const settled = await Promise.all(filters.map((filter) => options.pool.querySync(relays, filter)));
    return settled.flat();
  };

  const fetchInboxEvents = async (
    query: DmInboxQuery,
    _context: RelayGatewayQueryContext,
  ): Promise<DmEventsResponseDto> => {
    const relaySets = resolveRelaySets({
      scopedRelays: [],
      userRelays: [],
      bootstrapRelays: options.bootstrapRelays,
    });
    const until = query.since > 0 ? query.since : undefined;

    const events = await queryWithFallback(relaySets, (relays) =>
      queryEventsOnRelays(relays, [
        {
          authors: [query.ownerPubkey],
          kinds: DM_EVENT_KINDS,
          until,
          limit: query.limit + 1,
        },
        {
          '#p': [query.ownerPubkey],
          kinds: DM_EVENT_KINDS,
          until,
          limit: query.limit + 1,
        },
      ]),
    );

    const filtered = dedupeById(events)
      .filter(
        (event) =>
          isValidDmEventShape(event) &&
          isAllowedDmKind(event.kind) &&
          isOwnerParticipant(event, query.ownerPubkey),
      )
      .sort(byCreatedAtDesc);
    const pagination = paginateEvents(filtered, query.limit);

    return {
      items: pagination.page.map(toEventDto),
      hasMore: pagination.hasMore,
      nextSince: pagination.nextSince,
    };
  };

  const fetchConversationEvents = async (
    query: DmConversationQuery,
    _context: RelayGatewayQueryContext,
  ): Promise<DmEventsResponseDto> => {
    const relaySets = resolveRelaySets({
      scopedRelays: [],
      userRelays: [],
      bootstrapRelays: options.bootstrapRelays,
    });
    const until = query.since > 0 ? query.since : undefined;

    const events = await queryWithFallback(relaySets, (relays) =>
      queryEventsOnRelays(relays, [
        {
          authors: [query.ownerPubkey],
          '#p': [query.peerPubkey],
          kinds: DM_EVENT_KINDS,
          until,
          limit: query.limit + 1,
        },
        {
          authors: [query.peerPubkey],
          '#p': [query.ownerPubkey],
          kinds: DM_EVENT_KINDS,
          until,
          limit: query.limit + 1,
        },
      ]),
    );

    const filtered = dedupeById(events)
      .filter(
        (event) =>
          isValidDmEventShape(event) &&
          isAllowedDmKind(event.kind) &&
          isConversationBetween(event, query.ownerPubkey, query.peerPubkey),
      )
      .sort(byCreatedAtDesc);
    const pagination = paginateEvents(filtered, query.limit);

    return {
      items: pagination.page.map(toEventDto),
      hasMore: pagination.hasMore,
      nextSince: pagination.nextSince,
    };
  };

  const fetchStreamEvents = async (
    query: DmStreamQuery,
    _context: RelayGatewayQueryContext,
  ): Promise<DmEventDto[]> => {
    const relaySets = resolveRelaySets({
      scopedRelays: [],
      userRelays: [],
      bootstrapRelays: options.bootstrapRelays,
    });

    const events = await queryWithFallback(relaySets, (relays) =>
      queryEventsOnRelays(relays, [
        {
          authors: [query.ownerPubkey],
          kinds: DM_EVENT_KINDS,
          since: query.since,
          limit: STREAM_FETCH_LIMIT,
        },
        {
          '#p': [query.ownerPubkey],
          kinds: DM_EVENT_KINDS,
          since: query.since,
          limit: STREAM_FETCH_LIMIT,
        },
      ]),
    );

    return dedupeById(events)
      .filter(
        (event) =>
          isValidDmEventShape(event) &&
          isAllowedDmKind(event.kind) &&
          isOwnerParticipant(event, query.ownerPubkey),
      )
      .sort(byCreatedAtDesc)
      .map(toEventDto);
  };

  return {
    fetchInboxEvents,
    fetchConversationEvents,
    fetchStreamEvents,
  };
};

export const createDmService = (options: DmServiceOptions = {}): DmService => {
  const pool = options.pool ?? new SimplePool();
  const bootstrapRelays = options.bootstrapRelays ?? DEFAULT_BOOTSTRAP_RELAYS;
  const fetchers = createPoolFetchers({
    pool,
    bootstrapRelays,
  });

  const inboxGateway =
    options.inboxGateway ??
    createRelayGateway<DmInboxQuery, DmEventsResponseDto>({
      queryFn: options.fetchInboxEvents ?? fetchers.fetchInboxEvents,
      defaultTimeoutMs: options.defaultTimeoutMs,
    });

  const conversationGateway =
    options.conversationGateway ??
    createRelayGateway<DmConversationQuery, DmEventsResponseDto>({
      queryFn: options.fetchConversationEvents ?? fetchers.fetchConversationEvents,
      defaultTimeoutMs: options.defaultTimeoutMs,
    });

  const streamGateway =
    options.streamGateway ??
    createRelayGateway<DmStreamQuery, DmEventDto[]>({
      queryFn: options.fetchStreamEvents ?? fetchers.fetchStreamEvents,
      defaultTimeoutMs: options.defaultTimeoutMs,
    });

  return new GatewayDmService(inboxGateway, conversationGateway, streamGateway);
};
