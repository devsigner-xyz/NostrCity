import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { SimplePool } from 'nostr-tools';

import { createTTLCache, type TTLCache } from '../../cache/ttl-cache';
import { shouldUseFallbackRelays } from '../../relay/relay-fallback';
import { resolveRelaySets } from '../../relay/relay-resolver';
import type {
  IdentityProfileDto,
  Nip05BatchCheckDto,
  Nip05BatchResultDto,
  Nip05VerifyBatchRequestDto,
  Nip05VerifyBatchResponseDto,
  ProfilesResolveRequestDto,
  ProfilesResolveResponseDto,
} from './identity.schemas';

type NostrEventLike = {
  id: string;
  pubkey: string;
  created_at: number;
  content: string;
};

type Nip05JsonResponse = {
  names?: Record<string, string>;
};

type ResolveHostname = (hostname: string) => Promise<ReadonlyArray<string>>;

type MetadataContent = {
  name?: unknown;
  display_name?: unknown;
  about?: unknown;
  nip05?: unknown;
  picture?: unknown;
  banner?: unknown;
  lud16?: unknown;
};

interface ParsedNip05Identifier {
  name: string;
  domain: string;
  normalized: string;
  display: string;
}

const DEFAULT_BOOTSTRAP_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

const LOWER_HEX_64_PATTERN = /^[0-9a-f]{64}$/;
const METADATA_KIND = 0;
const DEFAULT_NIP05_TIMEOUT_MS = 3_500;
const NIP05_SUCCESS_TTL_MS = 15 * 60_000;
const NIP05_ERROR_TTL_MS = 3 * 60_000;
const NIP05_MAX_RESPONSE_BYTES = 128 * 1024;
const PROFILE_CACHE_TTL_MS = 5 * 60_000;
const NIP05_SUCCESS_CACHE_MAX_ENTRIES = 5_000;
const NIP05_ERROR_CACHE_MAX_ENTRIES = 2_000;
const PROFILE_CACHE_MAX_ENTRIES = 5_000;
const NIP05_INFLIGHT_MAX_ENTRIES = 500;
const PROFILE_BATCH_INFLIGHT_MAX_ENTRIES = 100;
const PROFILE_NAME_MAX_LENGTH = 128;
const PROFILE_DISPLAY_NAME_MAX_LENGTH = 128;
const PROFILE_ABOUT_MAX_LENGTH = 2_048;
const PROFILE_NIP05_MAX_LENGTH = 320;
const PROFILE_IMAGE_URL_MAX_LENGTH = 2_048;
const PROFILE_LUD16_MAX_LENGTH = 320;

const BLOCKED_NIP05_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'host.docker.internal',
  'gateway.docker.internal',
  'kubernetes',
  'kubernetes.default',
  'kubernetes.default.svc',
  'metadata.google.internal',
]);

const normalizePubkey = (value: string): string => value.trim().toLowerCase();

const normalizeNip05 = (value: string): string => value.trim().toLowerCase();

const normalizeNip05Hostname = (domain: string): string => domain.trim().toLowerCase().replace(/\.$/, '');

const isPubkey = (value: string): boolean => LOWER_HEX_64_PATTERN.test(value);

const parseIpv4Address = (hostname: string): number[] | null => {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }

  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }

  return octets;
};

const isIpv4Literal = (hostname: string): boolean => parseIpv4Address(hostname) !== null;

const isBlockedIpv4Address = (octets: number[]): boolean => {
  const [first = 0, second = 0, third = 0] = octets;
  return first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224;
};

const getIpv6Hextets = (address: string): [number, number] => {
  const [first = '', second = ''] = address.split(':');
  return [Number.parseInt(first || '0', 16), Number.parseInt(second || '0', 16)];
};

const isBlockedIpv6Address = (address: string): boolean => {
  const normalized = address.trim().toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) {
    const octets = parseIpv4Address(mappedIpv4);
    return !octets || isBlockedIpv4Address(octets);
  }

  if (normalized === '::' || normalized === '::1') {
    return true;
  }

  const [first, second] = getIpv6Hextets(normalized);
  return first === 0 ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    first === 0x2002 ||
    (first === 0x2001 && second === 0x0db8);
};

const isUnsafeNip05Hostname = (domain: string): boolean => {
  const hostname = normalizeNip05Hostname(domain);
  return BLOCKED_NIP05_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.localhost.localdomain') ||
    isIpv4Literal(hostname);
};

const isUnsafeResolvedAddress = (address: string): boolean => {
  const normalized = address.trim().toLowerCase();
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    const octets = parseIpv4Address(normalized);
    return !octets || isBlockedIpv4Address(octets);
  }

  if (ipVersion === 6) {
    return isBlockedIpv6Address(normalized);
  }

  return true;
};

const resolveNip05Hostname: ResolveHostname = async (hostname) => {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map((address) => address.address);
};

const assertJsonContentType = (response: Response): void => {
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (mediaType !== 'application/json' && !mediaType.endsWith('+json')) {
    throw new Error('NIP-05 response content-type must be JSON');
  }
};

const createAbortError = (): DOMException => new DOMException('The operation was aborted.', 'AbortError');

const withAbortSignal = async <T>(operation: Promise<T>, signal: AbortSignal): Promise<T> => {
  if (signal.aborted) {
    throw createAbortError();
  }

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
};

const readLimitedJson = async (response: Response, signal: AbortSignal): Promise<unknown> => {
  assertJsonContentType(response);

  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > NIP05_MAX_RESPONSE_BYTES) {
    throw new Error('NIP-05 response is too large');
  }

  if (!response.body) {
    return JSON.parse('');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await withAbortSignal(reader.read(), signal);
      if (done) {
        break;
      }

      bytesRead += value.byteLength;
      if (bytesRead > NIP05_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('NIP-05 response is too large');
      }

      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    if (signal.aborted) {
      await reader.cancel().catch(() => undefined);
    }
    throw error;
  }

  text += decoder.decode();
  return JSON.parse(text);
};

const resolveTimeoutMs = (timeoutMs?: number): number => {
  if (!Number.isFinite(timeoutMs)) {
    return DEFAULT_NIP05_TIMEOUT_MS;
  }

  return Math.max(250, Math.round(timeoutMs as number));
};

const parseNip05Identifier = (value: string | undefined): ParsedNip05Identifier | null => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    return null;
  }

  const pieces = raw.split('@');
  if (pieces.length !== 2) {
    return null;
  }

  const rawName = pieces[0]?.trim();
  const rawDomain = pieces[1]?.trim().toLowerCase();
  if (!rawName || !rawDomain) {
    return null;
  }

  if (!/^[a-z0-9._-]+$/i.test(rawName)) {
    return null;
  }

  if (!/^[a-z0-9.-]+$/i.test(rawDomain) || !rawDomain.includes('.')) {
    return null;
  }

  const name = rawName.toLowerCase();
  const normalized = `${name}@${rawDomain}`;

  return {
    name,
    domain: rawDomain,
    normalized,
    display: name === '_' ? rawDomain : normalized,
  };
};

const lookupNameIgnoreCase = (names: Record<string, string>, expectedName: string): string | undefined => {
  const expected = expectedName.toLowerCase();
  for (const [key, value] of Object.entries(names)) {
    if (key.toLowerCase() === expected) {
      return value;
    }
  }

  return undefined;
};

const parseNip05JsonResponse = (value: unknown): Nip05JsonResponse => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return value as Nip05JsonResponse;
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

const toProfileDto = (event: NostrEventLike): IdentityProfileDto | null => {
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

export interface IdentityServiceOptions {
  pool?: SimplePool;
  bootstrapRelays?: string[];
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
  resolveHostname?: ResolveHostname;
  nip05SuccessTtlMs?: number;
  nip05ErrorTtlMs?: number;
  profileCacheTtlMs?: number;
  nip05SuccessCacheMaxEntries?: number;
  nip05ErrorCacheMaxEntries?: number;
  profileCacheMaxEntries?: number;
  nip05InflightMaxEntries?: number;
  profileBatchInflightMaxEntries?: number;
  defaultNip05TimeoutMs?: number;
}

export interface IdentityService {
  verifyNip05Batch(
    input: Nip05VerifyBatchRequestDto,
  ): Promise<Nip05VerifyBatchResponseDto>;
  resolveProfiles(
    input: ProfilesResolveRequestDto,
  ): Promise<ProfilesResolveResponseDto>;
}

class GatewayIdentityService implements IdentityService {
  private readonly nip05SuccessCache: TTLCache<string, Nip05BatchResultDto>;

  private readonly nip05ErrorCache: TTLCache<string, Nip05BatchResultDto>;

  private readonly nip05Inflight = new Map<string, Promise<Nip05BatchResultDto>>();

  private readonly profileCache: TTLCache<string, IdentityProfileDto | null>;

  private readonly profileBatchInflight = new Map<string, Promise<Record<string, IdentityProfileDto | null>>>();

  constructor(
    private readonly options: Required<
      Pick<IdentityServiceOptions, 'fetchImpl' | 'nowMs' | 'resolveHostname' | 'nip05SuccessTtlMs' | 'nip05ErrorTtlMs' | 'profileCacheTtlMs' | 'nip05SuccessCacheMaxEntries' | 'nip05ErrorCacheMaxEntries' | 'profileCacheMaxEntries' | 'nip05InflightMaxEntries' | 'profileBatchInflightMaxEntries' | 'defaultNip05TimeoutMs'>
      > & {
        pool: SimplePool;
        bootstrapRelays: string[];
      },
  ) {
    this.nip05SuccessCache = createTTLCache<string, Nip05BatchResultDto>({
      ttlMs: options.nip05SuccessTtlMs,
      maxEntries: options.nip05SuccessCacheMaxEntries,
      now: options.nowMs,
    });
    this.nip05ErrorCache = createTTLCache<string, Nip05BatchResultDto>({
      ttlMs: options.nip05ErrorTtlMs,
      maxEntries: options.nip05ErrorCacheMaxEntries,
      now: options.nowMs,
    });
    this.profileCache = createTTLCache<string, IdentityProfileDto | null>({
      ttlMs: options.profileCacheTtlMs,
      maxEntries: options.profileCacheMaxEntries,
      now: options.nowMs,
    });
  }

  async verifyNip05Batch(
    input: Nip05VerifyBatchRequestDto,
  ): Promise<Nip05VerifyBatchResponseDto> {
    const timeoutMs = resolveTimeoutMs(input.timeoutMs ?? this.options.defaultNip05TimeoutMs);
    const results = await Promise.all(input.checks.map((check) => this.verifySingleNip05(check, timeoutMs)));
    return { results };
  }

  async resolveProfiles(
    input: ProfilesResolveRequestDto,
  ): Promise<ProfilesResolveResponseDto> {
    const normalizedPubkeys = [...new Set(input.pubkeys.map(normalizePubkey).filter(isPubkey))];
    if (normalizedPubkeys.length === 0) {
      return { profiles: {} };
    }

    const profiles: Record<string, IdentityProfileDto> = {};
    const missingPubkeys: string[] = [];

    for (const pubkey of normalizedPubkeys) {
      const cached = this.getProfileFromCache(pubkey);
      if (cached === undefined) {
        missingPubkeys.push(pubkey);
        continue;
      }

      profiles[pubkey] = cached ?? {
        pubkey,
        createdAt: 0,
      };
    }

    if (missingPubkeys.length > 0) {
      const loaded = await this.loadProfilesBatch(missingPubkeys);
      for (const pubkey of missingPubkeys) {
        const profile = loaded[pubkey];
        profiles[pubkey] = profile ?? {
          pubkey,
          createdAt: 0,
        };
      }
    }

    return { profiles };
  }

  private getNip05CacheEntry(cache: TTLCache<string, Nip05BatchResultDto>, key: string): Nip05BatchResultDto | undefined {
    return cache.get(key);
  }

  private setNip05CacheEntry(
    cache: TTLCache<string, Nip05BatchResultDto>,
    key: string,
    result: Nip05BatchResultDto,
    ttlMs: number,
  ): void {
    cache.set(key, result, ttlMs);
  }

  private toNip05InflightLimitResult(pubkey: string, parsed: ParsedNip05Identifier): Nip05BatchResultDto {
    return {
      pubkey,
      nip05: parsed.normalized,
      status: 'error',
      identifier: parsed.normalized,
      displayIdentifier: parsed.display,
      error: 'Too many in-flight NIP-05 checks',
      checkedAt: this.options.nowMs(),
    };
  }

  private async verifySingleNip05(
    input: Nip05BatchCheckDto,
    timeoutMs: number,
  ): Promise<Nip05BatchResultDto> {
    const pubkey = normalizePubkey(input.pubkey);
    const parsed = parseNip05Identifier(input.nip05);

    if (!parsed) {
      return {
        pubkey,
        nip05: normalizeNip05(input.nip05),
        status: 'unverified',
        identifier: normalizeNip05(input.nip05),
        checkedAt: this.options.nowMs(),
      };
    }

    if (isUnsafeNip05Hostname(parsed.domain)) {
      return {
        pubkey,
        nip05: parsed.normalized,
        status: 'unverified',
        identifier: parsed.normalized,
        displayIdentifier: parsed.display,
        checkedAt: this.options.nowMs(),
      };
    }

    const cacheKey = `${pubkey}::${parsed.normalized}`;
    const cachedSuccess = this.getNip05CacheEntry(this.nip05SuccessCache, cacheKey);
    if (cachedSuccess) {
      return cachedSuccess;
    }

    const cachedError = this.getNip05CacheEntry(this.nip05ErrorCache, cacheKey);
    if (cachedError) {
      return cachedError;
    }

    const inflight = this.nip05Inflight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    if (this.nip05Inflight.size >= this.options.nip05InflightMaxEntries) {
      return this.toNip05InflightLimitResult(pubkey, parsed);
    }

    const expectedPubkey = pubkey;
    const promise = (async (): Promise<Nip05BatchResultDto> => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        const hostname = normalizeNip05Hostname(parsed.domain);
        const addresses = await withAbortSignal(this.options.resolveHostname(hostname), controller.signal);
        if (addresses.length === 0) {
          throw new Error('NIP-05 hostname did not resolve');
        }

        if (addresses.some(isUnsafeResolvedAddress)) {
          return {
            pubkey,
            nip05: parsed.normalized,
            status: 'unverified',
            identifier: parsed.normalized,
            displayIdentifier: parsed.display,
            checkedAt: this.options.nowMs(),
          };
        }

        const url = `https://${parsed.domain}/.well-known/nostr.json?name=${encodeURIComponent(parsed.name)}`;
        const response = await this.options.fetchImpl(url, {
          signal: controller.signal,
          redirect: 'error',
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const parsedBody = parseNip05JsonResponse(await readLimitedJson(response, controller.signal));
        const names = parsedBody.names;
        if (!names || typeof names !== 'object') {
          const result: Nip05BatchResultDto = {
            pubkey,
            nip05: parsed.normalized,
            status: 'unverified',
            identifier: parsed.normalized,
            displayIdentifier: parsed.display,
            checkedAt: this.options.nowMs(),
          };
          this.setNip05CacheEntry(this.nip05SuccessCache, cacheKey, result, this.options.nip05SuccessTtlMs);
          return result;
        }

        const resolvedPubkeyRaw = lookupNameIgnoreCase(names, parsed.name);
        if (!resolvedPubkeyRaw) {
          const result: Nip05BatchResultDto = {
            pubkey,
            nip05: parsed.normalized,
            status: 'unverified',
            identifier: parsed.normalized,
            displayIdentifier: parsed.display,
            checkedAt: this.options.nowMs(),
          };
          this.setNip05CacheEntry(this.nip05SuccessCache, cacheKey, result, this.options.nip05SuccessTtlMs);
          return result;
        }

        const resolvedPubkey = normalizePubkey(resolvedPubkeyRaw);
        const result: Nip05BatchResultDto = {
          pubkey,
          nip05: parsed.normalized,
          status: resolvedPubkey === expectedPubkey ? 'verified' : 'unverified',
          identifier: parsed.normalized,
          displayIdentifier: parsed.display,
          resolvedPubkey,
          checkedAt: this.options.nowMs(),
        };
        this.setNip05CacheEntry(this.nip05SuccessCache, cacheKey, result, this.options.nip05SuccessTtlMs);
        return result;
      } catch (error) {
        const result: Nip05BatchResultDto = {
          pubkey,
          nip05: parsed.normalized,
          status: 'error',
          identifier: parsed.normalized,
          displayIdentifier: parsed.display,
          error: error instanceof Error ? error.message : 'NIP-05 request failed',
          checkedAt: this.options.nowMs(),
        };
        this.setNip05CacheEntry(this.nip05ErrorCache, cacheKey, result, this.options.nip05ErrorTtlMs);
        return result;
      } finally {
        clearTimeout(timer);
        this.nip05Inflight.delete(cacheKey);
      }
    })();

    this.nip05Inflight.set(cacheKey, promise);
    return promise;
  }

  private getProfileFromCache(pubkey: string): IdentityProfileDto | null | undefined {
    return this.profileCache.get(pubkey);
  }

  private setProfileInCache(pubkey: string, profile: IdentityProfileDto | null): void {
    this.profileCache.set(pubkey, profile, this.options.profileCacheTtlMs);
  }

  private async loadProfilesBatch(pubkeys: string[]): Promise<Record<string, IdentityProfileDto | null>> {
    const batchKey = [...pubkeys].sort().join(',');
    const inflight = this.profileBatchInflight.get(batchKey);
    if (inflight) {
      return inflight;
    }

    if (this.profileBatchInflight.size >= this.options.profileBatchInflightMaxEntries) {
      return Object.fromEntries(
        pubkeys.map((pubkey) => [pubkey, null]),
      ) as Record<string, IdentityProfileDto | null>;
    }

    const promise = (async (): Promise<Record<string, IdentityProfileDto | null>> => {
      const result: Record<string, IdentityProfileDto | null> = Object.fromEntries(
        pubkeys.map((pubkey) => [pubkey, null]),
      ) as Record<string, IdentityProfileDto | null>;

      const relaySets = resolveRelaySets({
        scopedRelays: [],
        userRelays: [],
        bootstrapRelays: this.options.bootstrapRelays,
      });

      const queryOnRelays = async (relays: string[]): Promise<NostrEventLike[]> => {
        if (relays.length === 0) {
          return [];
        }

        return this.options.pool.querySync(relays, {
          authors: pubkeys,
          kinds: [METADATA_KIND],
          limit: Math.max(pubkeys.length * 2, pubkeys.length + 1),
        }) as Promise<NostrEventLike[]>;
      };

      const events = await (async () => {
        if (shouldUseFallbackRelays({ primaryRelays: relaySets.primary })) {
          return queryOnRelays(relaySets.fallback);
        }

        try {
          return await queryOnRelays(relaySets.primary);
        } catch (error) {
          if (shouldUseFallbackRelays({ primaryRelays: relaySets.primary, error })) {
            return queryOnRelays(relaySets.fallback);
          }

          throw error;
        }
      })();

      const latestByPubkey = new Map<string, NostrEventLike>();
      for (const event of events) {
        if (!isPubkey(event.pubkey)) {
          continue;
        }

        const existing = latestByPubkey.get(event.pubkey);
        if (!existing || event.created_at > existing.created_at) {
          latestByPubkey.set(event.pubkey, event);
        }
      }

      for (const pubkey of pubkeys) {
        const event = latestByPubkey.get(pubkey);
        const profile = event ? toProfileDto(event) : null;
        result[pubkey] = profile;
        this.setProfileInCache(pubkey, profile);
      }

      return result;
    })().finally(() => {
      this.profileBatchInflight.delete(batchKey);
    });

    this.profileBatchInflight.set(batchKey, promise);
    return promise;
  }
}

export const createIdentityService = (options: IdentityServiceOptions = {}): IdentityService => {
  return new GatewayIdentityService({
    pool: options.pool ?? new SimplePool(),
    bootstrapRelays: options.bootstrapRelays ?? DEFAULT_BOOTSTRAP_RELAYS,
    fetchImpl: options.fetchImpl ?? fetch,
    nowMs: options.nowMs ?? Date.now,
    resolveHostname: options.resolveHostname ?? resolveNip05Hostname,
    nip05SuccessTtlMs: options.nip05SuccessTtlMs ?? NIP05_SUCCESS_TTL_MS,
    nip05ErrorTtlMs: options.nip05ErrorTtlMs ?? NIP05_ERROR_TTL_MS,
    profileCacheTtlMs: options.profileCacheTtlMs ?? PROFILE_CACHE_TTL_MS,
    nip05SuccessCacheMaxEntries: options.nip05SuccessCacheMaxEntries ?? NIP05_SUCCESS_CACHE_MAX_ENTRIES,
    nip05ErrorCacheMaxEntries: options.nip05ErrorCacheMaxEntries ?? NIP05_ERROR_CACHE_MAX_ENTRIES,
    profileCacheMaxEntries: options.profileCacheMaxEntries ?? PROFILE_CACHE_MAX_ENTRIES,
    nip05InflightMaxEntries: options.nip05InflightMaxEntries ?? NIP05_INFLIGHT_MAX_ENTRIES,
    profileBatchInflightMaxEntries: options.profileBatchInflightMaxEntries ?? PROFILE_BATCH_INFLIGHT_MAX_ENTRIES,
    defaultNip05TimeoutMs: options.defaultNip05TimeoutMs ?? DEFAULT_NIP05_TIMEOUT_MS,
  });
};
