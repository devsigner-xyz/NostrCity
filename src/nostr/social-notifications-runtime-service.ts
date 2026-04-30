import { createLazyNdkDmTransport } from './lazy-ndk-client';
import { hasSameRelaySet, normalizeRelaySet, resolveConservativeSocialRelaySets } from './relay-runtime';
import type {
    SocialNotificationEvent,
    SocialNotificationsPage,
    SocialNotificationsService,
} from './social-notifications-service';
import type { DmTransport } from './dm-transport';
import { createTransportPool, type TransportPool } from './transport-pool';
import type { NostrFilter } from './types';

const SOCIAL_NOTIFICATION_KINDS = [1, 6, 7, 16, 9735] as const;
const DEFAULT_INITIAL_LIMIT = 120;

interface CreateRuntimeSocialNotificationsServiceOptions {
    createTransport?: (relays: string[]) => DmTransport;
    resolveRelays?: () => string[];
    resolveFallbackRelays?: (primaryRelays: string[]) => string[];
    transportPool?: TransportPool<DmTransport>;
}

function resolveRuntimeSocialRelays(): string[] {
    return resolveConservativeSocialRelaySets().primary;
}

function resolveRuntimeSocialFallbackRelays(primaryRelays: string[]): string[] {
    const fallback = resolveConservativeSocialRelaySets().fallback;
    return hasSameRelaySet(primaryRelays, fallback) ? [] : fallback;
}

function isRelayTransportError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    return /relay|eose|timeout|network|websocket|disconnect/i.test(error.message);
}

function isValidSocialNotificationEvent(event: SocialNotificationEvent): boolean {
    if (!event || typeof event !== 'object') {
        return false;
    }

    if (typeof event.id !== 'string' || event.id.length === 0) {
        return false;
    }

    if (typeof event.pubkey !== 'string' || event.pubkey.length === 0) {
        return false;
    }

    if (!SOCIAL_NOTIFICATION_KINDS.some((kind) => kind === event.kind)) {
        return false;
    }

    if (!Number.isFinite(event.created_at)) {
        return false;
    }

    if (typeof event.content !== 'string') {
        return false;
    }

    if (!Array.isArray(event.tags)) {
        return false;
    }

    return event.tags.every((tag) => Array.isArray(tag) && tag.every((value) => typeof value === 'string'));
}

function sortAndDedupe(events: SocialNotificationEvent[]): SocialNotificationEvent[] {
    const byId = new Map<string, SocialNotificationEvent>();
    for (const event of events) {
        if (!isValidSocialNotificationEvent(event)) {
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

function paginateEvents(events: SocialNotificationEvent[], limit: number): SocialNotificationsPage {
    const pageItems = events.slice(0, limit);
    const hasMore = events.length > limit;
    const lastItem = pageItems[pageItems.length - 1];

    return {
        items: pageItems,
        hasMore,
        nextSince: hasMore && lastItem ? Math.max(0, lastItem.created_at - 1) : null,
    };
}

export function createRuntimeSocialNotificationsService(
    options: CreateRuntimeSocialNotificationsServiceOptions = {}
): SocialNotificationsService {
    const createTransport = options.createTransport ?? ((relays: string[]) => createLazyNdkDmTransport({ relays }));
    const resolveRelays = options.resolveRelays ?? resolveRuntimeSocialRelays;
    const resolveFallbackRelays = options.resolveFallbackRelays ?? resolveRuntimeSocialFallbackRelays;
    const transportPool = options.transportPool ?? createTransportPool<DmTransport>();

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
        subscribeSocial(input, onEvent) {
            const relays = normalizeRelaySet(resolveRelays());
            const transport = resolveTransport(relays);
            const subscription = transport.subscribe(
                [{ kinds: [...SOCIAL_NOTIFICATION_KINDS], '#p': [input.ownerPubkey] }],
                (event) => {
                    if (isValidSocialNotificationEvent(event as SocialNotificationEvent)) {
                        onEvent(event as SocialNotificationEvent);
                    }
                }
            );

            return () => {
                subscription.unsubscribe();
            };
        },

        async loadInitialSocial(input) {
            return withRelayFallback(async (transport) => {
                const limit = Math.max(1, input.limit ?? DEFAULT_INITIAL_LIMIT);
                const filter: NostrFilter = {
                    kinds: [...SOCIAL_NOTIFICATION_KINDS],
                    '#p': [input.ownerPubkey],
                    limit: limit + 1,
                };
                if (typeof input.since === 'number') {
                    filter.until = input.since;
                }

                const events = await transport.fetchBackfill([
                    filter,
                ]);

                return paginateEvents(sortAndDedupe(events as SocialNotificationEvent[]), limit);
            });
        },
    };
}
