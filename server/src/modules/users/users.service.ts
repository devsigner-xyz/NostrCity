import { SimplePool, type Filter, nip19 } from 'nostr-tools';

import { normalizeHexPubkey } from '../../nostr/nostr-validation';
import { shouldUseFallbackRelays } from '../../relay/relay-fallback';
import { createRelayGateway } from '../../relay/relay-gateway';
import { normalizePublicRelayUrl } from '../../relay/relay-url-policy';
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
  UserProfileDto,
  UsersSearchQuery,
  UsersSearchResponseDto,
} from './users.schemas';
import { DEFAULT_SEARCH_RELAYS, MAX_SEARCH_RELAYS } from './search-relay-defaults';

type NostrEventLike = {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
};

type MetadataContent = {
  name?: unknown;
  display_name?: unknown;
  about?: unknown;
  nip05?: unknown;
  picture?: unknown;
  banner?: unknown;
  lud16?: unknown;
};

const DEFAULT_BOOTSTRAP_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

const METADATA_KIND = 0;
const SEARCH_OVERSCAN_FACTOR = 4;
const PROFILE_NAME_MAX_LENGTH = 128;
const PROFILE_DISPLAY_NAME_MAX_LENGTH = 128;
const PROFILE_ABOUT_MAX_LENGTH = 2_048;
const PROFILE_NIP05_MAX_LENGTH = 320;
const PROFILE_IMAGE_URL_MAX_LENGTH = 2_048;
const PROFILE_LUD16_MAX_LENGTH = 320;

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

const normalizeQueryText = (value: string): string => value.trim().toLowerCase();

const normalizeSearchRelays = (searchRelays?: string[]): string[] => {
  const source = searchRelays && searchRelays.length > 0
    ? searchRelays
    : [...DEFAULT_SEARCH_RELAYS];
  const normalized = new Set<string>();

  for (const relay of source) {
    const current = normalizePublicRelayUrl(relay);
    if (!current) {
      continue;
    }

    normalized.add(current);
    if (normalized.size >= MAX_SEARCH_RELAYS) {
      break;
    }
  }

  if (normalized.size === 0) {
    return [...DEFAULT_SEARCH_RELAYS];
  }

  return [...normalized];
};

const searchRelaySetKey = (searchRelays?: string[]): string => normalizeSearchRelays(searchRelays).join('|');

const normalizePubkeyCandidate = (value: string): string | null => normalizeHexPubkey(value);

const decodeNpub = (value: string): string | null => {
  const normalized = value.trim().toLowerCase();
  const withoutPrefix = normalized.startsWith('nostr:') ? normalized.slice('nostr:'.length) : normalized;

  if (!withoutPrefix.startsWith('npub1')) {
    return null;
  }

  try {
    const decoded = nip19.decode(withoutPrefix);
    if (decoded.type !== 'npub' || typeof decoded.data !== 'string') {
      return null;
    }

    return normalizeHexPubkey(decoded.data);
  } catch {
    return null;
  }
};

const parseProfileContent = (content: string): MetadataContent | null => {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    return parsed as MetadataContent;
  } catch {
    return null;
  }
};

const toStringOrUndefined = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
};

const toUserProfileDto = (event: NostrEventLike): UserProfileDto | null => {
  const content = parseProfileContent(event.content);
  if (!content) {
    return null;
  }

  return {
    pubkey: event.pubkey,
    createdAt: event.created_at,
    name: toStringOrUndefined(content.name, PROFILE_NAME_MAX_LENGTH),
    displayName: toStringOrUndefined(content.display_name, PROFILE_DISPLAY_NAME_MAX_LENGTH),
    about: toStringOrUndefined(content.about, PROFILE_ABOUT_MAX_LENGTH),
    nip05: toStringOrUndefined(content.nip05, PROFILE_NIP05_MAX_LENGTH),
    picture: toStringOrUndefined(content.picture, PROFILE_IMAGE_URL_MAX_LENGTH),
    banner: toStringOrUndefined(content.banner, PROFILE_IMAGE_URL_MAX_LENGTH),
    lud16: toStringOrUndefined(content.lud16, PROFILE_LUD16_MAX_LENGTH),
  };
};

const profileMatchesText = (profile: UserProfileDto, normalizedQuery: string): boolean => {
  if (normalizedQuery.length === 0) {
    return false;
  }

  return [
    profile.name,
    profile.displayName,
    profile.about,
    profile.nip05,
    profile.lud16,
  ].some((field) => field?.toLowerCase().includes(normalizedQuery) ?? false);
};

export interface UsersServiceOptions {
  usersGateway?: RelayGateway<UsersSearchQuery, UsersSearchResponseDto>;
  fetchUsers?: (
    query: UsersSearchQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<UsersSearchResponseDto>;
  defaultTimeoutMs?: number;
  bootstrapRelays?: string[];
  relayQueryExecutor?: RelayQueryExecutor;
  pool?: SimplePool;
}

export interface UsersService {
  searchUsers(query: UsersSearchQuery): Promise<UsersSearchResponseDto>;
}

class GatewayUsersService implements UsersService {
  constructor(private readonly usersGateway: RelayGateway<UsersSearchQuery, UsersSearchResponseDto>) {}

  async searchUsers(query: UsersSearchQuery): Promise<UsersSearchResponseDto> {
    return this.usersGateway.query({
      key: `users:search:${query.ownerPubkey}:${normalizeQueryText(query.q)}:${query.limit}:${searchRelaySetKey(query.searchRelays)}`,
      params: query,
    });
  }
}

const createPoolFetchers = (options: {
  pool: SimplePool;
  bootstrapRelays: string[];
  relayQueryExecutor: RelayQueryExecutor;
}): {
  fetchUsers: (
    query: UsersSearchQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<UsersSearchResponseDto>;
} => {
  const queryWithFallback = async <T>(queryFn: (relays: string[]) => Promise<T>): Promise<T> => {
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

  const fetchUsers = async (
    query: UsersSearchQuery,
    context: RelayGatewayQueryContext,
  ): Promise<UsersSearchResponseDto> => {
    const normalizedQuery = normalizeQueryText(query.q);
    const exactHex = normalizePubkeyCandidate(normalizedQuery);
    const decodedNpub = decodeNpub(normalizedQuery);
    const exactPubkeys = [...new Set([exactHex, decodedNpub].filter((value): value is string => Boolean(value)))];

    const textSearchLimit = Math.max(query.limit * SEARCH_OVERSCAN_FACTOR, query.limit + 1);
    const textSearchRelays = normalizeSearchRelays(query.searchRelays);

    const events: NostrEventLike[] = await queryWithFallback(async (_relays) => {
      if (textSearchRelays.length === 0) {
        return [] as NostrEventLike[];
      }

      try {
        const requests: Promise<NostrEventLike[]>[] = [];

        if (exactPubkeys.length > 0) {
          requests.push(
            options.relayQueryExecutor.query<NostrEventLike>({
              relays: textSearchRelays,
              signal: context.signal,
              filter: {
                authors: exactPubkeys,
                kinds: [METADATA_KIND],
                limit: exactPubkeys.length,
              },
            }),
          );
        }

        const textFilter: Filter & { search?: string } = {
          kinds: [METADATA_KIND],
          limit: textSearchLimit,
        };
        textFilter.search = normalizedQuery;
        requests.push(options.relayQueryExecutor.query<NostrEventLike>({
          relays: textSearchRelays,
          filter: textFilter,
          signal: context.signal,
        }));

        const settled = await Promise.all(requests);
        return settled.flat();
      } catch {
        return [] as NostrEventLike[];
      }
    });

    const latestProfiles = new Map<string, UserProfileDto>();
    const sortedEvents = dedupeById(events).sort(byCreatedAtDesc);
    const exactPubkeySet = new Set(exactPubkeys);

    for (const event of sortedEvents) {
      if (latestProfiles.has(event.pubkey)) {
        continue;
      }

      const profile = toUserProfileDto(event);
      if (!profile) {
        continue;
      }

      if (exactPubkeySet.has(profile.pubkey) || profileMatchesText(profile, normalizedQuery)) {
        latestProfiles.set(event.pubkey, profile);
      }
    }

    const exactMatches = [...exactPubkeys];
    const exactMatchSet = new Set(exactMatches);

    const textMatches = [...latestProfiles.values()]
      .filter((profile) => !exactMatchSet.has(profile.pubkey))
      .sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
          return right.createdAt - left.createdAt;
        }

        return left.pubkey.localeCompare(right.pubkey);
      })
      .map((profile) => profile.pubkey);

    const pubkeys = [...exactMatches, ...textMatches].slice(0, query.limit);
    const profiles = Object.fromEntries(
      pubkeys.map((pubkey) => [
        pubkey,
        latestProfiles.get(pubkey) ?? {
          pubkey,
          createdAt: 0,
        },
      ]),
    ) as Record<string, UserProfileDto>;

    return {
      pubkeys,
      profiles,
    };
  };

  return {
    fetchUsers,
  };
};

export const createUsersService = (options: UsersServiceOptions = {}): UsersService => {
  const pool = options.pool ?? new SimplePool();
  const bootstrapRelays = options.bootstrapRelays ?? DEFAULT_BOOTSTRAP_RELAYS;
  const relayQueryExecutor = options.relayQueryExecutor ?? createRelayQueryExecutor({ pool });
  const fetchers = createPoolFetchers({
    pool,
    bootstrapRelays,
    relayQueryExecutor,
  });

  const usersGateway =
    options.usersGateway ??
    createRelayGateway<UsersSearchQuery, UsersSearchResponseDto>({
      queryFn: options.fetchUsers ?? fetchers.fetchUsers,
      defaultTimeoutMs: options.defaultTimeoutMs,
      cache: {
        ttlMs: 10_000,
        maxEntries: 300,
      },
    });

  return new GatewayUsersService(usersGateway);
};
