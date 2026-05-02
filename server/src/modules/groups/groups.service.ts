import { SimplePool } from 'nostr-tools';
import { verifyEvent } from 'nostr-tools/pure';

import { createRelayGateway, isRelayGatewayTimeoutError } from '../../relay/relay-gateway';
import type { RelayGateway, RelayGatewayQueryContext } from '../../relay/relay-gateway.types';
import { normalizeRelayUrl } from '../../relay/relay-resolver';
import type { GroupSummaryDto, RelayGroupsQuery, RelayGroupsResponseDto } from './groups.schemas';

const GROUP_METADATA_KIND = 39000;
const GROUP_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const HEX_KEY_PATTERN = /^[0-9a-f]{64}$/;

type NostrEventLike = {
  id: string;
  sig?: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
};

export interface GroupRelayInfo {
  self?: string;
}

export interface GroupsServiceOptions {
  pool?: SimplePool;
  fetchRelayInfo?: (relay: string, context: RelayGatewayQueryContext) => Promise<GroupRelayInfo>;
  gateway?: RelayGateway<RelayGroupsQuery, RelayGroupsResponseDto>;
  now?: () => number;
}

export interface GroupsService {
  getRelayGroups(input: RelayGroupsQuery): Promise<RelayGroupsResponseDto>;
}

const emptyRelayGroupsResponse = (relay: string, verifiedRelaySelf: boolean): RelayGroupsResponseDto => ({
  relay,
  verifiedRelaySelf,
  groups: [],
});

const isHexKey = (value: string | undefined): value is string => Boolean(value && HEX_KEY_PATTERN.test(value));

const firstTagValue = (tags: string[][], name: string): string | undefined => tags.find((tag) => tag[0] === name && Boolean(tag[1]))?.[1];

const hasTag = (tags: string[][], name: string): boolean => tags.some((tag) => tag[0] === name);

const relayHttpEndpoint = (relay: string): string | null => {
  try {
    const parsed = new URL(relay);
    if (parsed.protocol === 'wss:') {
      parsed.protocol = 'https:';
    } else if (parsed.protocol === 'ws:') {
      parsed.protocol = 'http:';
    } else {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
};

const fetchNip11RelayInfo = async (relay: string, context: RelayGatewayQueryContext): Promise<GroupRelayInfo> => {
  const endpoint = relayHttpEndpoint(relay);
  if (!endpoint || typeof globalThis.fetch !== 'function') {
    return {};
  }

  try {
    const response = await globalThis.fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/nostr+json, application/json;q=0.9',
      },
      signal: context.signal,
    });
    if (!response.ok) {
      return {};
    }

    const payload = await response.json() as { self?: unknown } | null;
    return typeof payload?.self === 'string' ? { self: payload.self } : {};
  } catch {
    return {};
  }
};

const isValidSignedMetadataEvent = (event: NostrEventLike): boolean => {
  if (event.kind !== GROUP_METADATA_KIND) {
    return false;
  }

  try {
    return verifyEvent(event as Parameters<typeof verifyEvent>[0]);
  } catch {
    return false;
  }
};

const toGroupSummary = (relay: string, event: NostrEventLike, metadataVerified: boolean): GroupSummaryDto | null => {
  const id = firstTagValue(event.tags, 'd');
  if (!id || !GROUP_ID_PATTERN.test(id)) {
    return null;
  }

  const summary: GroupSummaryDto = {
    relay,
    id,
    private: hasTag(event.tags, 'private'),
    restricted: hasTag(event.tags, 'restricted'),
    hidden: hasTag(event.tags, 'hidden'),
    closed: hasTag(event.tags, 'closed'),
    metadataVerified,
  };
  const name = firstTagValue(event.tags, 'name');
  const description = firstTagValue(event.tags, 'about');
  const picture = firstTagValue(event.tags, 'picture');
  if (name) {
    summary.name = name;
  }
  if (description) {
    summary.description = description;
  }
  if (picture) {
    summary.picture = picture;
  }

  return summary;
};

const dedupeNewestById = (events: NostrEventLike[]): NostrEventLike[] => {
  const byId = new Map<string, NostrEventLike>();
  for (const event of events) {
    const groupId = firstTagValue(event.tags, 'd');
    if (!groupId) {
      continue;
    }

    const existing = byId.get(groupId);
    if (!existing || event.created_at > existing.created_at || (event.created_at === existing.created_at && event.id.localeCompare(existing.id) < 0)) {
      byId.set(groupId, event);
    }
  }

  return [...byId.values()].sort((left, right) => {
    const leftId = firstTagValue(left.tags, 'd') ?? '';
    const rightId = firstTagValue(right.tags, 'd') ?? '';
    return leftId.localeCompare(rightId);
  });
};

const createDefaultGroupsGateway = (options: Required<Pick<GroupsServiceOptions, 'pool' | 'fetchRelayInfo'>> & Pick<GroupsServiceOptions, 'now'>) => createRelayGateway<RelayGroupsQuery, RelayGroupsResponseDto>({
  defaultTimeoutMs: 7_000,
  cache: {
    ttlMs: 120_000,
    maxEntries: 200,
  },
  now: options.now,
  queryFn: async (input, context) => {
    const relay = normalizeRelayUrl(input.relay);
    if (!relay) {
      throw new Error('Invalid group relay');
    }

    const relayInfo = await options.fetchRelayInfo(relay, context);
    const self = isHexKey(relayInfo.self) ? relayInfo.self : undefined;
    const filter = self ? { kinds: [GROUP_METADATA_KIND], authors: [self] } : { kinds: [GROUP_METADATA_KIND] };
    const events = await options.pool.querySync([relay], filter) as NostrEventLike[];
    const verifiedEvents = events.filter((event) => {
      if (!isValidSignedMetadataEvent(event)) {
        return false;
      }

      return self ? event.pubkey === self : true;
    });
    const groups = dedupeNewestById(verifiedEvents)
      .flatMap((event) => {
        const summary = toGroupSummary(relay, event, Boolean(self));
        return summary ? [summary] : [];
      });

    return {
      relay,
      verifiedRelaySelf: Boolean(self),
      groups,
    };
  },
});

export const createGroupsService = (options: GroupsServiceOptions = {}): GroupsService => {
  const pool = options.pool ?? new SimplePool();
  const fetchRelayInfo = options.fetchRelayInfo ?? fetchNip11RelayInfo;
  const gateway = options.gateway ?? createDefaultGroupsGateway({ pool, fetchRelayInfo, now: options.now });

  return {
    async getRelayGroups(input: RelayGroupsQuery): Promise<RelayGroupsResponseDto> {
      const relay = normalizeRelayUrl(input.relay);
      if (!relay) {
        throw new Error('Invalid group relay');
      }

      try {
        return await gateway.query({
          key: relay,
          params: { relay },
        });
      } catch (error) {
        if (isRelayGatewayTimeoutError(error)) {
          return emptyRelayGroupsResponse(relay, false);
        }

        throw error;
      }
    },
  };
};
