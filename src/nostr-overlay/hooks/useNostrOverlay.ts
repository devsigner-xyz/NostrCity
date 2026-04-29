import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { bootstrapLocalAccount } from '../../nostr/auth/bootstrap-profile';
import type { ProviderResolveInput } from '../../nostr/auth/providers/types';
import {
    type AuthSessionState,
    type LoginMethod,
} from '../../nostr/auth/session';
import { assignPubkeysToBuildings, hashPubkeyToIndex, type AssignmentResult } from '../../nostr/domain/assignment';
import { buildOccupancyState } from '../../nostr/domain/occupancy';
import { fetchFollowersBestEffort } from '../../nostr/followers';
import { fetchFollowsByNpub, fetchFollowsByPubkey } from '../../nostr/follows';
import { fetchLatestPostsByPubkey } from '../../nostr/posts';
import { loadProfileRelaySuggestions } from '../../nostr/profile-relay-discovery';
import { fetchProfileStats } from '../../nostr/profile-stats';
import { fetchProfiles } from '../../nostr/profiles';
import { searchUsers as searchUsersDomain } from '../../nostr/user-search';
import { buildFollowDrivenTargetBuildings } from '../domain/map-generation-target';
import type { SocialFeedService } from '../../nostr/social-feed-service';
import { getDefaultRelaySettings, getRelaySetByType, loadRelaySettings, saveRelaySettings, type RelaySettingsByType } from '../../nostr/relay-settings';
import {
    dmInboxRelayListFromKind10050Event,
    getBootstrapRelays,
    mergeRelaySets,
    relayListFromKind10002Event,
    relaySuggestionsByTypeFromKind10002Event,
} from '../../nostr/relay-policy';
import type { SocialNotificationsService } from '../../nostr/social-notifications-service';
import type { NostrClient, NostrEvent, NostrProfile } from '../../nostr/types';
import type { createWriteGateway } from '../../nostr/write-gateway';
import type { GraphApiService } from '../../nostr-api/graph-api-service';
import type { IdentityApiService } from '../../nostr-api/identity-api-service';
import type { HttpClientAuthContext } from '../../nostr-api/http-client';
import type { UserSearchApiService } from '../../nostr-api/user-search-api-service';
import { resolveConservativeSocialRelaySets } from '../../nostr/relay-runtime';
import type { MapBridge } from '../map-bridge';
import { FEATURED_OCCUPANT_PUBKEYS } from '../domain/featured-occupants';
import { createFollowerBatcher } from './follower-batcher';
import type { DirectMessagesService } from '../query/direct-messages.query';
import type { ActiveProfileQueryService } from '../query/active-profile.query';
import { nostrOverlayQueryKeys } from '../query/keys';
import { toast } from 'sonner';
import type { SocialPublisher } from '../social-publisher';
import { mergeUserSearchResults, searchLocalUsers } from '../search/local-user-search';
import { useOverlaySessionController } from '../controllers/use-overlay-session-controller';

export type OverlayStatus =
    | 'idle'
    | 'loading_graph'
    | 'loading_profiles'
    | 'assigning_map'
    | 'loading_followers'
    | 'success'
    | 'error';

export type MapLoaderStage =
    | 'connecting_relay'
    | 'fetching_data'
    | 'building_map';

interface OverlayData {
    ownerPubkey: string | undefined;
    ownerProfile: NostrProfile | undefined;
    ownerBuildingIndex: number | undefined;
    follows: string[];
    featuredPubkeys: string[];
    profiles: Record<string, NostrProfile>;
    followers: string[];
    followerProfiles: Record<string, NostrProfile>;
    followersLoading: boolean;
    assignments: AssignmentResult;
    buildingsCount: number;
    parkCount: number;
    selectedPubkey: string | undefined;
    relayHints: string[];
    suggestedRelays: string[];
    suggestedRelaysByType: RelaySettingsByType;
    activeProfilePubkey: string | undefined;
    activeProfileBuildingIndex: number | undefined;
}

interface OverlayState {
    status: OverlayStatus;
    error: string | undefined;
    data: OverlayData;
}

export interface NostrOverlayServices {
    createClient: (relays?: string[]) => NostrClient;
    identityApiService?: IdentityApiService;
    fetchFollowsByNpubFn?: typeof fetchFollowsByNpub;
    fetchFollowsByPubkeyFn?: typeof fetchFollowsByPubkey;
    fetchProfilesFn?: typeof fetchProfiles;
    searchUsersFn?: typeof searchUsersDomain;
    fetchFollowersBestEffortFn?: typeof fetchFollowersBestEffort;
    fetchLatestPostsByPubkeyFn?: typeof fetchLatestPostsByPubkey;
    fetchProfileStatsFn?: typeof fetchProfileStats;
    graphApiService?: GraphApiService;
    directMessagesService?: DirectMessagesService;
    socialNotificationsService?: SocialNotificationsService;
    socialFeedService?: SocialFeedService;
    userSearchApiService?: UserSearchApiService;
    socialPublisher?: SocialPublisher;
    configureAuthHeaders?: (getAuthHeaders: ((context: HttpClientAuthContext) => Promise<Record<string, string> | undefined>) | undefined) => void;
    setOwnerPubkey?: (ownerPubkey: string | undefined) => void;
    setWriteGateway?: (writeGateway: ReturnType<typeof createWriteGateway> | undefined) => void;
    setDirectMessageRelays?: (relays: { inbox: string[]; outbox: string[] }) => void;
}

interface UseNostrOverlayOptions {
    mapBridge: MapBridge | null;
    services: NostrOverlayServices;
}

const DM_INBOX_RELAY_CAP = 8;
const DM_OUTBOX_RELAY_CAP = 8;
const USER_SEARCH_LIMIT = 20;
const EMPTY_SEARCH_RESULT = { pubkeys: [], profiles: {} };
const RELAY_METADATA_TIMEOUT_MS = 4_000;
const EMPTY_RELAY_SUGGESTIONS_BY_TYPE: RelaySettingsByType = {
    nip65Both: [],
    nip65Read: [],
    nip65Write: [],
    dmInbox: [],
    search: [],
};

const missingGraphApiService: GraphApiService = {
    loadFollows: async (input) => ({ ownerPubkey: input.pubkey, follows: [], relayHints: [] }),
    loadFollowers: async () => ({ followers: [], complete: true }),
    loadPosts: async () => ({ posts: [], hasMore: false }),
    loadProfileStats: async () => ({ followsCount: 0, followersCount: 0 }),
};

const missingIdentityApiService: IdentityApiService = {
    verifyNip05Batch: async () => [],
    resolveProfiles: async () => ({}),
};

const missingSocialNotificationsService: SocialNotificationsService = {
    subscribeSocial: () => () => {},
    loadInitialSocial: async () => [],
};

const missingSocialFeedService: SocialFeedService = {
    loadFollowingFeed: async () => ({ items: [], hasMore: false }),
    loadArticlesFeed: async () => ({ items: [], hasMore: false }),
    loadArticleById: async () => null,
    loadHashtagFeed: async () => ({ items: [], hasMore: false }),
    loadThread: async () => ({ root: null, replies: [], hasMore: false }),
    loadEngagement: async () => ({}),
    loadViewerReactions: async () => ({}),
    loadViewerZaps: async () => ({}),
    loadViewerReplies: async () => ({}),
};

const missingUserSearchApiService: UserSearchApiService = {
    searchUsers: async () => EMPTY_SEARCH_RESULT,
};

const disabledDirectMessagesService: DirectMessagesService = {
    subscribeInbox: () => {},
    loadInitialConversations: async () => [],
    loadConversationMessages: async () => [],
};

function capRelayList(relays: string[], limit: number): string[] {
    const normalizedLimit = Math.max(1, Math.floor(limit));
    if (relays.length <= normalizedLimit) {
        return relays;
    }

    return relays.slice(0, normalizedLimit);
}

function createEmptyActiveProfileState(): Pick<
    OverlayData,
    | 'activeProfilePubkey'
    | 'activeProfileBuildingIndex'
> {
    return {
        activeProfilePubkey: undefined,
        activeProfileBuildingIndex: undefined,
    };
}

function createInitialData(): OverlayData {
    return {
        ownerPubkey: undefined,
        ownerProfile: undefined,
        ownerBuildingIndex: undefined,
        follows: [],
        featuredPubkeys: FEATURED_OCCUPANT_PUBKEYS,
        profiles: {},
        followers: [],
        followerProfiles: {},
        followersLoading: false,
        assignments: {
            assignments: [],
            byBuildingIndex: {},
            pubkeyToBuildingIndex: {},
            unassignedPubkeys: [],
        },
        buildingsCount: 0,
        parkCount: 0,
        relayHints: [],
        suggestedRelays: [],
        suggestedRelaysByType: {
            nip65Both: [],
            nip65Read: [],
            nip65Write: [],
            dmInbox: [],
            search: [],
        },
        selectedPubkey: undefined,
        ...createEmptyActiveProfileState(),
    };
}

function createMapOccupancyInput(input: {
    byBuildingIndex: Record<number, string>;
    selectedBuildingIndex: number | undefined;
}): { byBuildingIndex: Record<number, string>; selectedBuildingIndex?: number } {
    if (input.selectedBuildingIndex === undefined) {
        return { byBuildingIndex: input.byBuildingIndex };
    }

    return {
        byBuildingIndex: input.byBuildingIndex,
        selectedBuildingIndex: input.selectedBuildingIndex,
    };
}

function createBuildOccupancyInput(input: {
    buildingsCount: number;
    assignments: AssignmentResult['assignments'];
    selectedPubkey: string | undefined;
}): { buildingsCount: number; assignments: AssignmentResult['assignments']; selectedPubkey?: string } {
    if (input.selectedPubkey === undefined) {
        return {
            buildingsCount: input.buildingsCount,
            assignments: input.assignments,
        };
    }

    return {
        buildingsCount: input.buildingsCount,
        assignments: input.assignments,
        selectedPubkey: input.selectedPubkey,
    };
}

function createRelaySettingsInput(ownerPubkey: string | undefined): { ownerPubkey?: string } {
    if (ownerPubkey === undefined) {
        return {};
    }

    return { ownerPubkey };
}

function resolveOwnerBuildingIndex(
    ownerPubkey: string | undefined,
    buildingsCount: number,
    excludedBuildingIndexes: number[] = []
): number | undefined {
    if (!ownerPubkey) {
        return undefined;
    }

    const capacity = Math.max(0, Math.floor(buildingsCount));
    if (capacity <= 0) {
        return undefined;
    }

    const excludedSet = new Set<number>();
    for (const value of excludedBuildingIndexes) {
        const candidate = Number(value);
        if (!Number.isInteger(candidate) || candidate < 0 || candidate >= capacity) {
            continue;
        }
        excludedSet.add(candidate);
    }

    if (excludedSet.size >= capacity) {
        return undefined;
    }

    const baseIndex = hashPubkeyToIndex(ownerPubkey, capacity, ownerPubkey);
    if (baseIndex < 0) {
        return undefined;
    }

    for (let offset = 0; offset < capacity; offset += 1) {
        const candidate = (baseIndex + offset) % capacity;
        if (!excludedSet.has(candidate)) {
            return candidate;
        }
    }

    return undefined;
}

function dedupe(values: string[]): string[] {
    return [...new Set(values)];
}

function resolveTargetBuildingsFromFollows(follows: string[]): number {
    return buildFollowDrivenTargetBuildings({ follows });
}

function hasSameRelaySet(left: string[], right: string[]): boolean {
    const leftSet = new Set(mergeRelaySets(left));
    const rightSet = new Set(mergeRelaySets(right));

    if (leftSet.size !== rightSet.size) {
        return false;
    }

    for (const relay of leftSet) {
        if (!rightSet.has(relay)) {
            return false;
        }
    }

    return true;
}

function hasLoadedOverlayData(status: OverlayStatus): boolean {
    return status === 'loading_followers' || status === 'success';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => {
            reject(new Error(timeoutMessage));
        }, Math.max(1, timeoutMs));

        void promise.then(
            (value) => {
                window.clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                window.clearTimeout(timer);
                reject(error);
            },
        );
    });
}

export function useNostrOverlay({ mapBridge, services }: UseNostrOverlayOptions) {
    const OCCUPANCY_BATCH_SIZE = 8;
    const OCCUPANCY_BATCH_DELAY_MS = 22;
    const createClient = services.createClient;
    const fetchFollowsByNpubFn = services?.fetchFollowsByNpubFn || fetchFollowsByNpub;
    const fetchFollowsByPubkeyFn = services?.fetchFollowsByPubkeyFn || fetchFollowsByPubkey;
    const fetchProfilesFn = services?.fetchProfilesFn || fetchProfiles;
    const searchUsersFn = services?.searchUsersFn;
    const fetchFollowersBestEffortFn = services?.fetchFollowersBestEffortFn || fetchFollowersBestEffort;
    const fetchLatestPostsByPubkeyFn = services?.fetchLatestPostsByPubkeyFn || fetchLatestPostsByPubkey;
    const fetchProfileStatsFn = services?.fetchProfileStatsFn || fetchProfileStats;
    const queryClient = useQueryClient();
    const socialPublisher = services?.socialPublisher;
    const [state, setState] = useState<OverlayState>({
        status: 'idle',
        error: undefined,
        data: createInitialData(),
    });
    const [mapLoaderStage, setMapLoaderStage] = useState<MapLoaderStage | null>(null);
    const requestIdRef = useRef(0);
    const latestStateRef = useRef(state);
    const occupancyAnimationTokenRef = useRef(0);
    const skipNextMapGeneratedRef = useRef(false);
    const sessionController = useOverlaySessionController({
        enabled: Boolean(mapBridge),
        configureAuthHeaders: services?.configureAuthHeaders,
        setWriteGateway: services?.setWriteGateway,
        onRestoredSession: async (restored) => {
            await loadOwnerGraph({
                session: restored,
                method: restored.method,
            });
        },
    });
    const authSession = sessionController.authSession;
    const savedLocalAccount = sessionController.savedLocalAccount;
    const sessionRestorationResolved = sessionController.sessionRestorationResolved;
    const writeGateway = sessionController.writeGateway;
    const socialNotificationsService = useMemo(
        () => services?.socialNotificationsService ?? missingSocialNotificationsService,
        [services?.socialNotificationsService]
    );
    const socialFeedService = useMemo(
        () => services?.socialFeedService ?? missingSocialFeedService,
        [services?.socialFeedService]
    );
    const userSearchApiService = useMemo(
        () => services?.userSearchApiService ?? missingUserSearchApiService,
        [services?.userSearchApiService]
    );
    const identityApiService = useMemo(
        () => services?.identityApiService ?? missingIdentityApiService,
        [services?.identityApiService],
    );
    const graphApiService = useMemo(() => {
        if (services?.graphApiService) {
            return services.graphApiService;
        }

        const shouldUseLegacyReaders = Boolean(
            services?.fetchFollowsByNpubFn
            || services?.fetchFollowsByPubkeyFn
            || services?.fetchFollowersBestEffortFn
            || services?.fetchLatestPostsByPubkeyFn
            || services?.fetchProfileStatsFn,
        );

        if (!shouldUseLegacyReaders) {
            return missingGraphApiService;
        }

        const resolveLegacyRelays = (): string[] => mergeRelaySets(
            latestStateRef.current.data.relayHints,
            getBootstrapRelays(),
        );

        const legacyApiService: GraphApiService = {
            async loadFollows(input) {
                const client = createClient(resolveLegacyRelays());
                const graph = await fetchFollowsByPubkeyFn(input.pubkey, client);
                return {
                    ownerPubkey: graph.ownerPubkey,
                    follows: graph.follows,
                    relayHints: graph.relayHints,
                };
            },
            async loadFollowers(input) {
                const client = createClient(resolveLegacyRelays());
                const result = await fetchFollowersBestEffortFn({
                    targetPubkey: input.pubkey,
                    client,
                    ...(input.candidateAuthors !== undefined ? { candidateAuthors: input.candidateAuthors } : {}),
                });
                return {
                    followers: result.followers,
                    complete: result.complete,
                };
            },
            async loadPosts(input) {
                const client = createClient(resolveLegacyRelays());
                return fetchLatestPostsByPubkeyFn({
                    pubkey: input.pubkey,
                    client,
                    ...(input.limit !== undefined ? { limit: input.limit } : {}),
                    ...(input.until !== undefined ? { until: input.until } : {}),
                });
            },
            async loadProfileStats(input) {
                const client = createClient(resolveLegacyRelays());
                return fetchProfileStatsFn({
                    pubkey: input.pubkey,
                    client,
                    ...(input.candidateAuthors !== undefined ? { candidateAuthors: input.candidateAuthors } : {}),
                });
            },
        };

        return legacyApiService;
    }, [
        createClient,
        fetchFollowersBestEffortFn,
        fetchFollowsByPubkeyFn,
        fetchLatestPostsByPubkeyFn,
        fetchProfileStatsFn,
        services?.fetchFollowersBestEffortFn,
        services?.fetchFollowsByNpubFn,
        services?.fetchFollowsByPubkeyFn,
        services?.fetchLatestPostsByPubkeyFn,
        services?.fetchProfileStatsFn,
        services?.graphApiService,
    ]);
    const resolveProfilesByOwner = useCallback(async (input: {
        ownerPubkey: string;
        pubkeys: string[];
        legacyClient?: NostrClient;
    }): Promise<Record<string, NostrProfile>> => {
        const uniquePubkeys = dedupe(input.pubkeys)
            .filter((pubkey) => /^[a-f0-9]{64}$/.test(pubkey));

        if (uniquePubkeys.length === 0) {
            return {};
        }

        if (services?.fetchProfilesFn && input.legacyClient) {
            return fetchProfilesFn(uniquePubkeys, input.legacyClient);
        }

        return identityApiService.resolveProfiles({
            ownerPubkey: input.ownerPubkey,
            pubkeys: uniquePubkeys,
        });
    }, [fetchProfilesFn, identityApiService, services?.fetchProfilesFn]);
    const scopedRelayOwnerPubkey = authSession?.pubkey;
    const runtimeDmRelays = useMemo(() => {
        const loadedSettings = loadRelaySettings(createRelaySettingsInput(scopedRelayOwnerPubkey));
        const configuredDmInboxRelays = getRelaySetByType(loadedSettings, 'dmInbox');
        const configuredNip65ReadRelays = getRelaySetByType(loadedSettings, 'nip65Read');
        const configuredNip65BothRelays = getRelaySetByType(loadedSettings, 'nip65Both');
        const protocolFallback = mergeRelaySets(configuredNip65ReadRelays, configuredNip65BothRelays);
        const configuredRelays = configuredDmInboxRelays.length > 0
            ? configuredDmInboxRelays
            : protocolFallback.length > 0
                ? protocolFallback
                : loadedSettings.relays.length > 0
                ? loadedSettings.relays
                : getBootstrapRelays();

        return capRelayList(mergeRelaySets(
            configuredRelays,
            state.data.relayHints,
            state.data.suggestedRelaysByType.nip65Both,
            state.data.suggestedRelaysByType.nip65Read,
            state.data.suggestedRelaysByType.dmInbox
        ), DM_INBOX_RELAY_CAP);
    }, [scopedRelayOwnerPubkey, state.data.relayHints, state.data.suggestedRelaysByType]);
    const runtimeDmOutboxRelays = useMemo(() => {
        const loadedSettings = loadRelaySettings(createRelaySettingsInput(scopedRelayOwnerPubkey));
        const configuredNip65WriteRelays = getRelaySetByType(loadedSettings, 'nip65Write');
        const configuredNip65BothRelays = getRelaySetByType(loadedSettings, 'nip65Both');
        const configuredRelaysByProtocol = mergeRelaySets(configuredNip65WriteRelays, configuredNip65BothRelays);
        const configuredRelays = configuredRelaysByProtocol.length > 0
            ? configuredRelaysByProtocol
            : loadedSettings.relays.length > 0
                ? loadedSettings.relays
                : getBootstrapRelays();

        return capRelayList(mergeRelaySets(
            configuredRelays,
            state.data.suggestedRelaysByType.nip65Both,
            state.data.suggestedRelaysByType.nip65Write
        ), DM_OUTBOX_RELAY_CAP);
    }, [scopedRelayOwnerPubkey, state.data.suggestedRelaysByType]);
    const runtimeDmRelayKey = useMemo(
        () => `${runtimeDmRelays.join('|')}::${runtimeDmOutboxRelays.join('|')}`,
        [runtimeDmRelays, runtimeDmOutboxRelays]
    );
    useEffect(() => {
        services?.setOwnerPubkey?.(state.data.ownerPubkey);
    }, [services, state.data.ownerPubkey]);
    useEffect(() => {
        services?.setDirectMessageRelays?.({
            inbox: runtimeDmRelays,
            outbox: runtimeDmOutboxRelays,
        });
    }, [runtimeDmOutboxRelays, runtimeDmRelays, services]);
    const canUseDirectMessagesService = Boolean(
        state.data.ownerPubkey
        && authSession
        && authSession.pubkey === state.data.ownerPubkey
        && sessionController.canDirectMessages
    );
    const directMessagesService = useMemo(
        () => {
            if (canUseDirectMessagesService) {
                return services?.directMessagesService ?? disabledDirectMessagesService;
            }

            return disabledDirectMessagesService;
        },
        [canUseDirectMessagesService, services?.directMessagesService, runtimeDmRelayKey]
    );
    const cancelOccupancyAnimation = (): number => {
        occupancyAnimationTokenRef.current += 1;
        return occupancyAnimationTokenRef.current;
    };

    const clearSocialServerState = async (): Promise<void> => {
        const scopes = [
            nostrOverlayQueryKeys.invalidation.followingFeed(),
            nostrOverlayQueryKeys.invalidation.notifications(),
            nostrOverlayQueryKeys.invalidation.directMessages(),
            nostrOverlayQueryKeys.invalidation.userSearch(),
            nostrOverlayQueryKeys.invalidation.nip05(),
            nostrOverlayQueryKeys.invalidation.relayMetadata(),
            nostrOverlayQueryKeys.invalidation.activeProfile(),
        ] as const;

        await Promise.all(scopes.map((queryKey) => queryClient.cancelQueries({ queryKey })));
        for (const queryKey of scopes) {
            queryClient.removeQueries({ queryKey });
        }
    };

    const applyOccupancyProgressively = async (input: {
        byBuildingIndex: Record<number, string>;
        selectedBuildingIndex?: number;
        shouldStop?: () => boolean;
    }): Promise<void> => {
        if (!mapBridge) {
            return;
        }

        const shouldStop = input.shouldStop || (() => false);
        const token = cancelOccupancyAnimation();
        const entries = Object.entries(input.byBuildingIndex)
            .map(([indexKey, pubkey]) => ({
                index: Number(indexKey),
                pubkey,
            }))
            .filter((entry) => Number.isInteger(entry.index) && entry.index >= 0 && !!entry.pubkey)
            .sort((a, b) => a.index - b.index);

        const staged: Record<number, string> = {};
        mapBridge.applyOccupancy(createMapOccupancyInput({
            byBuildingIndex: { ...staged },
            selectedBuildingIndex: undefined,
        }));

        for (let i = 0; i < entries.length; i++) {
            if (token !== occupancyAnimationTokenRef.current || shouldStop()) {
                return;
            }

            const entry = entries[i];
            if (!entry) {
                continue;
            }
            staged[entry.index] = entry.pubkey;

            const shouldFlush = i === entries.length - 1 || ((i + 1) % OCCUPANCY_BATCH_SIZE) === 0;
            if (!shouldFlush) {
                continue;
            }

            mapBridge.applyOccupancy(createMapOccupancyInput({
                byBuildingIndex: { ...staged },
                selectedBuildingIndex: undefined,
            }));

            if (i < entries.length - 1) {
                await new Promise<void>((resolve) => {
                    window.setTimeout(resolve, OCCUPANCY_BATCH_DELAY_MS);
                });
            }
        }

        if (token !== occupancyAnimationTokenRef.current || shouldStop()) {
            return;
        }

        mapBridge.applyOccupancy(createMapOccupancyInput({
            byBuildingIndex: { ...staged },
            selectedBuildingIndex: input.selectedBuildingIndex,
        }));
    };

    const resolveScopedReadRelays = (input: { relayHints: string[]; suggestedRelaysByType: RelaySettingsByType }): string[] => {
        return resolveConservativeSocialRelaySets({
            ...(scopedRelayOwnerPubkey !== undefined ? { ownerPubkey: scopedRelayOwnerPubkey } : {}),
            additionalReadRelays: mergeRelaySets(
                input.relayHints,
                input.suggestedRelaysByType.nip65Both,
                input.suggestedRelaysByType.nip65Read
            ),
        }).primary;
    };

    const resolveOverlayRelays = (relayHints: string[]): string[] => {
        return resolveScopedReadRelays({
            relayHints,
            suggestedRelaysByType: latestStateRef.current.data.suggestedRelaysByType,
        });
    };

    useEffect(() => {
        latestStateRef.current = state;
    }, [state]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        return mapBridge.onMapGenerated(() => {
            if (skipNextMapGeneratedRef.current) {
                skipNextMapGeneratedRef.current = false;
                return;
            }

            setState((current) => {
                if (!hasLoadedOverlayData(current.status) || !current.data.ownerPubkey) {
                    return current;
                }

                const buildings = mapBridge.listBuildings();
                const assignmentPubkeys = dedupe([...current.data.follows, ...current.data.featuredPubkeys]);
                const assignments = assignPubkeysToBuildings({
                    pubkeys: assignmentPubkeys,
                    priorityPubkeys: current.data.featuredPubkeys,
                    buildingsCount: buildings.length,
                    seed: current.data.ownerPubkey,
                });

                const occupancy = buildOccupancyState(createBuildOccupancyInput({
                    buildingsCount: buildings.length,
                    assignments: assignments.assignments,
                    selectedPubkey: current.data.selectedPubkey,
                }));

                mapBridge.applyOccupancy(createMapOccupancyInput({
                    byBuildingIndex: occupancy.byBuildingIndex,
                    selectedBuildingIndex: occupancy.selectedBuildingIndex,
                }));

                if (occupancy.selectedBuildingIndex !== undefined) {
                    mapBridge.focusBuilding(occupancy.selectedBuildingIndex);
                }

                return {
                    ...current,
                    data: {
                        ...current.data,
                        buildingsCount: buildings.length,
                        parkCount: mapBridge.getParkCount(),
                        assignments,
                        ownerBuildingIndex: resolveOwnerBuildingIndex(current.data.ownerPubkey, buildings.length),
                    },
                };
            });
        });
    }, [mapBridge]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        if (!hasLoadedOverlayData(state.status) || !state.data.activeProfilePubkey) {
            mapBridge.setDialogBuildingHighlight(undefined);
            return;
        }

        const highlightedIndex = state.data.activeProfileBuildingIndex ?? state.data.assignments.pubkeyToBuildingIndex[state.data.activeProfilePubkey];
        mapBridge.setDialogBuildingHighlight(highlightedIndex);
    }, [mapBridge, state.status, state.data.activeProfilePubkey, state.data.activeProfileBuildingIndex, state.data.assignments]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        return mapBridge.onOccupiedBuildingClick(({ buildingIndex, pubkey }) => {
            const current = latestStateRef.current;
            if (!hasLoadedOverlayData(current.status)) {
                return;
            }

            const occupancy = buildOccupancyState({
                buildingsCount: current.data.buildingsCount,
                assignments: current.data.assignments.assignments,
                selectedPubkey: pubkey,
            });

            mapBridge.applyOccupancy(createMapOccupancyInput({
                byBuildingIndex: occupancy.byBuildingIndex,
                selectedBuildingIndex: occupancy.selectedBuildingIndex,
            }));
            mapBridge.focusBuilding(buildingIndex);

            setState((prev) => {
                if (!hasLoadedOverlayData(prev.status)) {
                    return prev;
                }

                return {
                    ...prev,
                    data: {
                        ...prev.data,
                        selectedPubkey: pubkey,
                        ...createEmptyActiveProfileState(),
                        activeProfilePubkey: pubkey,
                        activeProfileBuildingIndex: buildingIndex,
                    },
                };
            });
        });
    }, [mapBridge]);

    const loadOwnerGraph = async (input: {
        session: AuthSessionState;
        method: LoginMethod;
        credential?: string;
    }): Promise<void> => {
        if (!mapBridge) {
            setMapLoaderStage(null);
            setState({
                status: 'error',
                error: 'No se pudo conectar la capa Nostr con el mapa',
                data: createInitialData(),
            });
            return;
        }

        requestIdRef.current += 1;
        const requestId = requestIdRef.current;
        cancelOccupancyAnimation();
        setMapLoaderStage('connecting_relay');

        setState((current) => ({ ...current, status: 'loading_graph', error: undefined }));

        try {
            const configuredRelays = (() => {
                const loaded = loadRelaySettings({ ownerPubkey: input.session.pubkey });
                const protocolRelays = mergeRelaySets(
                    getRelaySetByType(loaded, 'nip65Write'),
                    getRelaySetByType(loaded, 'nip65Both'),
                    getRelaySetByType(loaded, 'nip65Read')
                );
                const candidates = protocolRelays.length > 0 ? protocolRelays : loaded.relays;
                return candidates.length > 0 ? candidates : getBootstrapRelays();
            })();

            let graphClient = createClient(configuredRelays);
            const shouldUseLegacyGraphBootstrap = Boolean(
                services?.fetchFollowsByNpubFn || services?.fetchFollowsByPubkeyFn,
            );

            const loadLegacyGraph = async (client: NostrClient) => {
                return input.method === 'npub' && input.credential
                    ? await fetchFollowsByNpubFn(input.credential, client)
                    : await fetchFollowsByPubkeyFn(input.session.pubkey, client);
            };

            const graph = shouldUseLegacyGraphBootstrap
                ? await (async () => {
                    try {
                        return await loadLegacyGraph(graphClient);
                    } catch (error) {
                        const bootstrapRelays = getBootstrapRelays();
                        if (hasSameRelaySet(configuredRelays, bootstrapRelays)) {
                            throw error;
                        }

                        graphClient = createClient(bootstrapRelays);
                        return loadLegacyGraph(graphClient);
                    }
                })()
                : await graphApiService.loadFollows({
                    ownerPubkey: input.session.pubkey,
                    pubkey: input.session.pubkey,
                    scopedReadRelays: resolveScopedReadRelays({
                        relayHints: [],
                        suggestedRelaysByType: {
                            nip65Both: [],
                            nip65Read: [],
                            nip65Write: [],
                            dmInbox: [],
                            search: [],
                        },
                    }),
                });

            const follows = dedupe(graph.follows);
            const featuredPubkeys = FEATURED_OCCUPANT_PUBKEYS;
            const assignmentPubkeys = dedupe([...follows, ...featuredPubkeys]);
            let suggestedRelays: string[] = [];
            let suggestedRelaysByType: RelaySettingsByType = {
                nip65Both: [],
                nip65Read: [],
                nip65Write: [],
                dmInbox: [],
                search: [],
            };
            try {
                const [relayListEvent, dmInboxRelayListEvent] = await Promise.all([
                    withTimeout(
                        graphClient.fetchLatestReplaceableEvent(graph.ownerPubkey, 10002),
                        RELAY_METADATA_TIMEOUT_MS,
                        'Relay timeout while fetching relay list (kind 10002)',
                    ),
                    withTimeout(
                        graphClient.fetchLatestReplaceableEvent(graph.ownerPubkey, 10050),
                        RELAY_METADATA_TIMEOUT_MS,
                        'Relay timeout while fetching DM relay list (kind 10050)',
                    ),
                ]);
                const nip65ByType = relaySuggestionsByTypeFromKind10002Event(relayListEvent);
                const dmInboxRelays = dmInboxRelayListFromKind10050Event(dmInboxRelayListEvent);
                suggestedRelaysByType = {
                    ...nip65ByType,
                    dmInbox: dmInboxRelays,
                    search: [],
                };
                suggestedRelays = relayListFromKind10002Event(relayListEvent);
            } catch {
                suggestedRelays = [];
                suggestedRelaysByType = {
                    nip65Both: [],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                    search: [],
                };
            }

            if (requestIdRef.current !== requestId) {
                return;
            }

            setState((current) => ({
                ...current,
                status: 'loading_profiles',
                error: undefined,
            }));
            setMapLoaderStage('fetching_data');

            const [ownerProfiles, profiles] = await Promise.all([
                resolveProfilesByOwner({
                    ownerPubkey: graph.ownerPubkey,
                    pubkeys: [graph.ownerPubkey],
                    legacyClient: graphClient,
                }),
                resolveProfilesByOwner({
                    ownerPubkey: graph.ownerPubkey,
                    pubkeys: assignmentPubkeys,
                    legacyClient: graphClient,
                }),
            ]);
            const ownerProfile = ownerProfiles[graph.ownerPubkey];

            if (requestIdRef.current !== requestId) {
                return;
            }

            setState((current) => ({
                ...current,
                status: 'assigning_map',
                error: undefined,
            }));
            setMapLoaderStage('building_map');

            const targetBuildings = resolveTargetBuildingsFromFollows(follows);
            await mapBridge.regenerateMap({ targetBuildings });
            const buildings = mapBridge.listBuildings();
            const assignments = assignPubkeysToBuildings({
                pubkeys: assignmentPubkeys,
                priorityPubkeys: featuredPubkeys,
                buildingsCount: buildings.length,
                seed: graph.ownerPubkey,
            });

            const occupancy = buildOccupancyState({
                buildingsCount: buildings.length,
                assignments: assignments.assignments,
            });

            await applyOccupancyProgressively({
                byBuildingIndex: occupancy.byBuildingIndex,
                shouldStop: () => requestIdRef.current !== requestId,
                ...(occupancy.selectedBuildingIndex !== undefined
                    ? { selectedBuildingIndex: occupancy.selectedBuildingIndex }
                    : {}),
            });

            if (requestIdRef.current !== requestId) {
                return;
            }

            setMapLoaderStage(null);

            setState({
                status: 'loading_followers',
                error: undefined,
                data: {
                    ownerPubkey: graph.ownerPubkey,
                    ownerProfile,
                    ownerBuildingIndex: resolveOwnerBuildingIndex(graph.ownerPubkey, buildings.length),
                    follows,
                    featuredPubkeys,
                    profiles,
                    followers: [],
                    followerProfiles: {},
                    followersLoading: true,
                    assignments,
                    buildingsCount: buildings.length,
                    parkCount: mapBridge.getParkCount(),
                    relayHints: graph.relayHints,
                    suggestedRelays,
                    suggestedRelaysByType,
                    selectedPubkey: undefined,
                    ...createEmptyActiveProfileState(),
                },
            });

            await (async () => {
                const followerSet = new Set<string>();
                const nextFollowerProfiles: Record<string, NostrProfile> = {};
                const followerBatcher = createFollowerBatcher(async (newFollowers: string[]) => {
                    if (requestIdRef.current !== requestId || newFollowers.length === 0) {
                        return;
                    }

                    for (const pubkey of newFollowers) {
                        followerSet.add(pubkey);
                    }

                    const fetchedProfiles = await resolveProfilesByOwner({
                        ownerPubkey: graph.ownerPubkey,
                        pubkeys: newFollowers,
                        legacyClient: graphClient,
                    });
                    Object.assign(nextFollowerProfiles, fetchedProfiles);

                    if (requestIdRef.current !== requestId) {
                        return;
                    }

                    setState((current) => {
                        if (
                            !hasLoadedOverlayData(current.status) ||
                            current.data.ownerPubkey !== graph.ownerPubkey ||
                            requestIdRef.current !== requestId
                        ) {
                            return current;
                        }

                        return {
                            ...current,
                            data: {
                                ...current.data,
                                followers: [...followerSet],
                                followerProfiles: {
                                    ...current.data.followerProfiles,
                                    ...fetchedProfiles,
                                },
                            },
                        };
                    });
                });

                try {
                    const scopedReadRelays = resolveScopedReadRelays({
                        relayHints: graph.relayHints,
                        suggestedRelaysByType,
                    });
                    const followersResult = await graphApiService.loadFollowers({
                        ownerPubkey: graph.ownerPubkey,
                        pubkey: graph.ownerPubkey,
                        candidateAuthors: follows,
                        scopedReadRelays,
                    });

                    if (requestIdRef.current !== requestId) {
                        return;
                    }

                    followerBatcher.add(followersResult.followers);

                    await followerBatcher.flushNow();
                } catch {
                    // Keep follows + profile visible even when follower discovery fails.
                } finally {
                    followerBatcher.dispose();
                }

                if (requestIdRef.current !== requestId) {
                    return;
                }

                setState((current) => {
                    if (
                        !hasLoadedOverlayData(current.status) ||
                        current.data.ownerPubkey !== graph.ownerPubkey ||
                        requestIdRef.current !== requestId
                    ) {
                        return current;
                    }

                    return {
                        ...current,
                        status: 'success',
                        data: {
                            ...current.data,
                            followers: [...followerSet],
                            followerProfiles: {
                                ...current.data.followerProfiles,
                                ...nextFollowerProfiles,
                            },
                            followersLoading: false,
                        },
                    };
                });
            })();
        } catch (error) {
            if (requestIdRef.current !== requestId) {
                return;
            }

            setMapLoaderStage(null);
            const message = error instanceof Error ? error.message : 'No se pudo cargar la red Nostr';
            setState({
                status: 'error',
                error: message,
                data: createInitialData(),
            });
        }
    };

    const startSession = async (method: LoginMethod, input: ProviderResolveInput): Promise<void> => {
        try {
            const { session } = await sessionController.startSession(method, input);
            const previousOwnerPubkey = latestStateRef.current.data.ownerPubkey;
            const shouldResetOverlayData = Boolean(previousOwnerPubkey && previousOwnerPubkey !== session.pubkey);
            if (shouldResetOverlayData) {
                await clearSocialServerState();
            }
            setState((current) => ({
                ...current,
                data: {
                    ...(shouldResetOverlayData ? createInitialData() : current.data),
                },
            }));

            if (method === 'local' && (input.profile || input.relaySettings)) {
                const ownerInput = createRelaySettingsInput(session.pubkey);
                const relaySettings = input.relaySettings ?? getDefaultRelaySettings();
                saveRelaySettings(relaySettings, ownerInput);

                try {
                    await bootstrapLocalAccount({
                        writeGateway,
                        relaySettings,
                        ...(input.profile ? { profile: input.profile } : {}),
                    });
                } catch (error) {
                    const message = error instanceof Error
                        ? error.message
                        : 'No se pudo completar el bootstrap inicial de la cuenta local';
                    toast.error(message, { duration: 2200 });
                }
            }

            await loadOwnerGraph({
                session,
                method,
                ...(input.credential !== undefined ? { credential: input.credential } : {}),
            });
        } catch (error) {
            setMapLoaderStage(null);
            const message = error instanceof Error ? error.message : 'No se pudo iniciar sesion en Nostr';
            setState((current) => ({
                ...current,
                status: 'error',
                error: message,
            }));
        }
    };

    const submitNpub = async (npub: string): Promise<void> => {
        await startSession('npub', { credential: npub });
    };

    const logoutSession = async (): Promise<void> => {
        await sessionController.logoutSession();
        await clearSocialServerState();
        cancelOccupancyAnimation();
        setMapLoaderStage(null);

        setState({
            status: 'idle',
            error: undefined,
            data: createInitialData(),
        });

        if (mapBridge) {
            mapBridge.applyOccupancy(createMapOccupancyInput({
                byBuildingIndex: {},
                selectedBuildingIndex: undefined,
            }));
            mapBridge.setDialogBuildingHighlight(undefined);
        }
    };

    const regenerateMap = async (): Promise<void> => {
        if (!mapBridge) {
            return;
        }

        const current = latestStateRef.current;
        cancelOccupancyAnimation();
        setMapLoaderStage('building_map');

        try {
            if (!hasLoadedOverlayData(current.status) || !current.data.ownerPubkey) {
                await mapBridge.regenerateMap();
                return;
            }

            skipNextMapGeneratedRef.current = true;
            await mapBridge.regenerateMap({
                targetBuildings: resolveTargetBuildingsFromFollows(current.data.follows),
            });

            const buildings = mapBridge.listBuildings();
            const assignmentPubkeys = dedupe([...current.data.follows, ...current.data.featuredPubkeys]);
            const assignments = assignPubkeysToBuildings({
                pubkeys: assignmentPubkeys,
                priorityPubkeys: current.data.featuredPubkeys,
                buildingsCount: buildings.length,
                seed: current.data.ownerPubkey,
            });

            const occupancy = buildOccupancyState(createBuildOccupancyInput({
                buildingsCount: buildings.length,
                assignments: assignments.assignments,
                selectedPubkey: current.data.selectedPubkey,
            }));

            await applyOccupancyProgressively({
                byBuildingIndex: occupancy.byBuildingIndex,
                ...(occupancy.selectedBuildingIndex !== undefined
                    ? { selectedBuildingIndex: occupancy.selectedBuildingIndex }
                    : {}),
            });

            setState((nextState) => {
                if (!hasLoadedOverlayData(nextState.status) || nextState.data.ownerPubkey !== current.data.ownerPubkey) {
                    return nextState;
                }

                return {
                    ...nextState,
                    data: {
                        ...nextState.data,
                        buildingsCount: buildings.length,
                        parkCount: mapBridge.getParkCount(),
                        assignments,
                        ownerBuildingIndex: resolveOwnerBuildingIndex(nextState.data.ownerPubkey, buildings.length),
                    },
                };
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo regenerar el mapa';
            setState((nextState) => ({
                ...nextState,
                status: 'error',
                error: message,
            }));
        } finally {
            skipNextMapGeneratedRef.current = false;
            setMapLoaderStage(null);
        }
    };

    const selectFollowing = (pubkey: string): void => {
        if (!mapBridge || !hasLoadedOverlayData(state.status)) {
            return;
        }

        const selectedPubkey = state.data.selectedPubkey === pubkey ? undefined : pubkey;
        const occupancy = buildOccupancyState(createBuildOccupancyInput({
            buildingsCount: state.data.buildingsCount,
            assignments: state.data.assignments.assignments,
            selectedPubkey,
        }));

        mapBridge.applyOccupancy(createMapOccupancyInput({
            byBuildingIndex: occupancy.byBuildingIndex,
            selectedBuildingIndex: occupancy.selectedBuildingIndex,
        }));

        if (occupancy.selectedBuildingIndex !== undefined) {
            mapBridge.focusBuilding(occupancy.selectedBuildingIndex);
        }

        setState((current) => ({
            ...current,
            data: {
                ...current.data,
                selectedPubkey,
                ...createEmptyActiveProfileState(),
            },
        }));
    };

    const followPerson = async (pubkey: string): Promise<void> => {
        const normalizedPubkey = pubkey.trim().toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(normalizedPubkey)) {
            throw new Error('La cuenta a seguir no es valida');
        }

        const current = latestStateRef.current;
        if (!hasLoadedOverlayData(current.status)) {
            throw new Error('La red social aun se esta cargando');
        }

        if (!sessionController.canWrite) {
            throw new Error('Tu sesion actual no puede seguir cuentas');
        }

        if (current.data.ownerPubkey === normalizedPubkey) {
            return;
        }

        const nextFollows = current.data.follows.includes(normalizedPubkey)
            ? current.data.follows.filter((entry) => entry !== normalizedPubkey)
            : dedupe([...current.data.follows, normalizedPubkey]);

        await writeGateway.publishContactList(nextFollows);

        setState((nextState) => {
            if (!hasLoadedOverlayData(nextState.status) || !nextState.data.ownerPubkey) {
                return nextState;
            }

            const updatedFollows = nextState.data.follows.includes(normalizedPubkey)
                ? nextState.data.follows.filter((entry) => entry !== normalizedPubkey)
                : dedupe([...nextState.data.follows, normalizedPubkey]);

            const assignmentPubkeys = dedupe([...updatedFollows, ...nextState.data.featuredPubkeys]);
            let assignments = nextState.data.assignments;
            let ownerBuildingIndex = nextState.data.ownerBuildingIndex;
            let buildingsCount = nextState.data.buildingsCount;
            let parkCount = nextState.data.parkCount;

            if (mapBridge) {
                const buildings = mapBridge.listBuildings();
                assignments = assignPubkeysToBuildings({
                    pubkeys: assignmentPubkeys,
                    priorityPubkeys: nextState.data.featuredPubkeys,
                    buildingsCount: buildings.length,
                    seed: nextState.data.ownerPubkey,
                });

                const occupancy = buildOccupancyState(createBuildOccupancyInput({
                    buildingsCount: buildings.length,
                    assignments: assignments.assignments,
                    selectedPubkey: nextState.data.selectedPubkey,
                }));

                mapBridge.applyOccupancy(createMapOccupancyInput({
                    byBuildingIndex: occupancy.byBuildingIndex,
                    selectedBuildingIndex: occupancy.selectedBuildingIndex,
                }));

                ownerBuildingIndex = resolveOwnerBuildingIndex(nextState.data.ownerPubkey, buildings.length);
                buildingsCount = buildings.length;
                parkCount = mapBridge.getParkCount();
            }

            return {
                ...nextState,
                data: {
                    ...nextState.data,
                    follows: updatedFollows,
                    assignments,
                    ownerBuildingIndex,
                    buildingsCount,
                    parkCount,
                },
            };
        });

        void queryClient.invalidateQueries({ queryKey: nostrOverlayQueryKeys.invalidation.followingFeed() });
        void queryClient.invalidateQueries({ queryKey: nostrOverlayQueryKeys.invalidation.activeProfile() });
    };

    const openActiveProfile = (pubkey: string, buildingIndex?: number): void => {
        if (!mapBridge || !hasLoadedOverlayData(state.status) || !pubkey) {
            return;
        }

        const occupancy = buildOccupancyState({
            buildingsCount: state.data.buildingsCount,
            assignments: state.data.assignments.assignments,
            selectedPubkey: pubkey,
        });

        mapBridge.applyOccupancy(createMapOccupancyInput({
            byBuildingIndex: occupancy.byBuildingIndex,
            selectedBuildingIndex: occupancy.selectedBuildingIndex,
        }));

        const focusIndex = buildingIndex ?? occupancy.selectedBuildingIndex;
        if (focusIndex !== undefined) {
            mapBridge.focusBuilding(focusIndex);
        }

        setState((current) => ({
            ...current,
            data: {
                ...current.data,
                selectedPubkey: pubkey,
                ...createEmptyActiveProfileState(),
                activeProfilePubkey: pubkey,
                activeProfileBuildingIndex: buildingIndex ?? occupancy.selectedBuildingIndex,
            },
        }));
    };

    const loadProfilesByPubkeys = async (pubkeys: string[]): Promise<Record<string, NostrProfile>> => {
        const uniquePubkeys = dedupe(pubkeys)
            .filter((pubkey) => /^[a-f0-9]{64}$/.test(pubkey));

        if (uniquePubkeys.length === 0) {
            return {};
        }

        const current = latestStateRef.current;
        const ownerPubkey = current.data.ownerPubkey;
        if (!ownerPubkey) {
            return {};
        }

        const relays = resolveOverlayRelays(current.data.relayHints);
        const client = createClient(relays);
        const loadedProfiles = await resolveProfilesByOwner({
            ownerPubkey,
            pubkeys: uniquePubkeys,
            legacyClient: client,
        });

        if (Object.keys(loadedProfiles).length > 0) {
            setState((nextState) => ({
                ...nextState,
                data: {
                    ...nextState.data,
                    profiles: {
                        ...nextState.data.profiles,
                        ...loadedProfiles,
                    },
                },
            }));
        }

        return loadedProfiles;
    };

    const loadEventsByIds = async (
        eventIds: string[],
        options?: { relayHintsByEventId?: Record<string, string[]> }
    ): Promise<Record<string, NostrEvent>> => {
        const uniqueEventIds = dedupe(eventIds)
            .filter((eventId) => /^[a-f0-9]{64}$/.test(eventId));

        if (uniqueEventIds.length === 0) {
            return {};
        }

        const current = latestStateRef.current;
        const relays = resolveOverlayRelays(current.data.relayHints);
        const client = createClient(relays);
        const events = await client.fetchEvents({
            ids: uniqueEventIds,
            limit: uniqueEventIds.length,
        });

        const byId: Record<string, NostrEvent> = {};
        for (const event of events) {
            if (!event?.id) {
                continue;
            }

            byId[event.id] = event;
        }

        const unresolvedEventIds = uniqueEventIds.filter((eventId) => !byId[eventId]);
        if (unresolvedEventIds.length > 0) {
            const hintedRelays = mergeRelaySets(
                ...unresolvedEventIds.map((eventId) => options?.relayHintsByEventId?.[eventId] ?? []),
                getBootstrapRelays()
            );

            if (hintedRelays.length > 0) {
                const fallbackRelays = mergeRelaySets(relays, hintedRelays);
                if (!hasSameRelaySet(relays, fallbackRelays)) {
                    try {
                        const fallbackClient = createClient(fallbackRelays);
                        const fallbackEvents = await fallbackClient.fetchEvents({
                            ids: unresolvedEventIds,
                            limit: unresolvedEventIds.length,
                        });

                        for (const event of fallbackEvents) {
                            if (!event?.id) {
                                continue;
                            }

                            byId[event.id] = event;
                        }
                    } catch {
                        // Ignore fallback failures for best-effort reference hydration.
                    }
                }
            }
        }

        const eventAuthors = dedupe(Object.values(byId)
            .map((event) => event.pubkey)
            .filter((pubkey) => typeof pubkey === 'string' && pubkey.length > 0));

        const ownerPubkey = current.data.ownerPubkey;
        if (eventAuthors.length > 0 && ownerPubkey) {
            const loadedProfiles = await resolveProfilesByOwner({
                ownerPubkey,
                pubkeys: eventAuthors,
                legacyClient: client,
            });
            if (Object.keys(loadedProfiles).length > 0) {
                setState((nextState) => ({
                    ...nextState,
                    data: {
                        ...nextState.data,
                        profiles: {
                            ...nextState.data.profiles,
                            ...loadedProfiles,
                        },
                    },
                }));
            }
        }

        return byId;
    };

    const searchUsers = async (query: string): Promise<{ pubkeys: string[]; profiles: Record<string, NostrProfile> }> => {
        const normalizedQuery = query.trim();
        const current = latestStateRef.current;
        const localResult = searchLocalUsers({
            query: normalizedQuery,
            ownerPubkey: current.data.ownerPubkey,
            followedPubkeys: current.data.follows,
            profiles: current.data.profiles,
            limit: USER_SEARCH_LIMIT,
        });
        if (!normalizedQuery) {
            return localResult;
        }

        let result: { pubkeys: string[]; profiles: Record<string, NostrProfile> };
        const ownerPubkey = current.data.ownerPubkey;
        const relaySettings = loadRelaySettings(createRelaySettingsInput(ownerPubkey));
        const searchRelays = relaySettings.byType.search;

        try {
            if (searchUsersFn) {
                const relays = searchRelays.length > 0 ? searchRelays : resolveOverlayRelays(current.data.relayHints);
                const client = createClient(relays);
                const cacheKeyScope = relays.join('|');
                result = await searchUsersFn({
                    query: normalizedQuery,
                    client,
                    limit: USER_SEARCH_LIMIT,
                    cacheKeyScope,
                });
            } else {
                if (!ownerPubkey) {
                    return localResult;
                }

                result = await userSearchApiService.searchUsers({
                    ownerPubkey,
                    q: normalizedQuery,
                    limit: USER_SEARCH_LIMIT,
                    searchRelays,
                });
            }
        } catch {
            result = EMPTY_SEARCH_RESULT;
        }

        result = mergeUserSearchResults({
            query: normalizedQuery,
            followedPubkeys: current.data.follows,
            local: localResult,
            remote: result,
            limit: USER_SEARCH_LIMIT,
        });

        if (Object.keys(result.profiles).length > 0) {
            setState((nextState) => ({
                ...nextState,
                data: {
                    ...nextState.data,
                    profiles: {
                        ...nextState.data.profiles,
                        ...result.profiles,
                    },
                },
            }));
        }

        return result;
    };

    const closeActiveProfileDialog = (): void => {
        setState((current) => ({
            ...current,
            data: {
                ...current.data,
                ...createEmptyActiveProfileState(),
            },
        }));
    };

    const activeProfileService: ActiveProfileQueryService = useMemo(
        () => ({
            loadPosts: async ({ pubkey, limit, until }) => {
                const current = latestStateRef.current;
                const ownerPubkey = current.data.ownerPubkey;
                if (!ownerPubkey) {
                    return {
                        posts: [],
                        hasMore: false,
                    };
                }

                return graphApiService.loadPosts({
                    ownerPubkey,
                    pubkey,
                    ...(limit !== undefined ? { limit } : {}),
                    ...(until !== undefined ? { until } : {}),
                    scopedReadRelays: resolveScopedReadRelays({
                        relayHints: current.data.relayHints,
                        suggestedRelaysByType: current.data.suggestedRelaysByType,
                    }),
                });
            },
            loadStats: async ({ pubkey }) => {
                const current = latestStateRef.current;
                const ownerPubkey = current.data.ownerPubkey;
                if (!ownerPubkey) {
                    return {
                        followsCount: 0,
                        followersCount: 0,
                    };
                }

                return graphApiService.loadProfileStats({
                    ownerPubkey,
                    pubkey,
                    candidateAuthors: current.data.follows,
                    scopedReadRelays: resolveScopedReadRelays({
                        relayHints: current.data.relayHints,
                        suggestedRelaysByType: current.data.suggestedRelaysByType,
                    }),
                });
            },
            loadNetwork: async ({ pubkey }) => {
                const current = latestStateRef.current;
                const ownerPubkey = current.data.ownerPubkey;
                if (!ownerPubkey) {
                    return {
                        follows: [],
                        followers: [],
                        profiles: {},
                        relaySuggestionsByType: EMPTY_RELAY_SUGGESTIONS_BY_TYPE,
                    };
                }

                const primaryRelays = resolveOverlayRelays(current.data.relayHints);
                const fallbackRelays = mergeRelaySets(primaryRelays, getBootstrapRelays());
                const client = createClient(primaryRelays);
                const followsResult = await graphApiService.loadFollows({
                    ownerPubkey,
                    pubkey,
                    scopedReadRelays: resolveScopedReadRelays({
                        relayHints: current.data.relayHints,
                        suggestedRelaysByType: current.data.suggestedRelaysByType,
                    }),
                });

                const [followersResult, relaySuggestionsByType] = await Promise.all([
                    graphApiService.loadFollowers({
                        ownerPubkey,
                        pubkey,
                        candidateAuthors: current.data.follows,
                        scopedReadRelays: resolveScopedReadRelays({
                            relayHints: current.data.relayHints,
                            suggestedRelaysByType: current.data.suggestedRelaysByType,
                        }),
                    }).catch((error: unknown) => ({
                        followers: [],
                        complete: false,
                        error: error instanceof Error ? error.message : 'No se pudo cargar red social del perfil',
                    })),
                    loadProfileRelaySuggestions({
                        pubkey,
                        primaryClient: client,
                        ...(!hasSameRelaySet(primaryRelays, fallbackRelays)
                            ? { fallbackClient: createClient(fallbackRelays) }
                            : {}),
                        timeoutMs: RELAY_METADATA_TIMEOUT_MS,
                    }).catch(() => EMPTY_RELAY_SUGGESTIONS_BY_TYPE),
                ]);

                const follows = dedupe(followsResult.follows);
                const followers = dedupe(followersResult.followers);
                const networkPubkeys = dedupe([...follows, ...followers]);
                const profiles = await resolveProfilesByOwner({
                    ownerPubkey,
                    pubkeys: networkPubkeys,
                    legacyClient: client,
                }).catch(() => ({}));
                return {
                    follows,
                    followers,
                    ...('error' in followersResult && followersResult.error ? { followersError: followersResult.error } : {}),
                    profiles,
                    relaySuggestionsByType,
                };
            },
        }),
        [createClient, graphApiService, resolveProfilesByOwner]
    );

    const assignedCount = useMemo(() => Object.keys(state.data.assignments.byBuildingIndex).length, [state.data.assignments]);

    return {
        status: state.status,
        mapLoaderStage,
        sessionRestorationResolved,
        error: state.error,
        authSession,
        savedLocalAccount,
        canWrite: sessionController.canWrite,
        canEncrypt: sessionController.canEncrypt,
        canDirectMessages: sessionController.canDirectMessages,
        ownerPubkey: state.data.ownerPubkey,
        ownerProfile: state.data.ownerProfile,
        ownerBuildingIndex: state.data.ownerBuildingIndex,
        follows: state.data.follows,
        alwaysVisiblePubkeys: state.data.featuredPubkeys,
        profiles: state.data.profiles,
        followers: state.data.followers,
        followerProfiles: state.data.followerProfiles,
        followersLoading: state.data.followersLoading,
        selectedPubkey: state.data.selectedPubkey,
        relayHints: state.data.relayHints,
        suggestedRelays: state.data.suggestedRelays,
        suggestedRelaysByType: state.data.suggestedRelaysByType,
        activeProfilePubkey: state.data.activeProfilePubkey,
        activeProfile: state.data.activeProfilePubkey ? state.data.profiles[state.data.activeProfilePubkey] : undefined,
        activeProfileService,
        followsCount: state.data.follows.length,
        followersCount: state.data.followers.length,
        buildingsCount: state.data.buildingsCount,
        parkCount: state.data.parkCount,
        unassignedCount: state.data.assignments.unassignedPubkeys.length,
        assignedCount,
        occupancyByBuildingIndex: state.data.assignments.byBuildingIndex,
        startSession,
        logoutSession,
        writeGateway,
        socialPublisher,
        directMessagesService,
        socialNotificationsService,
        socialFeedService,
        submitNpub,
        regenerateMap,
        searchUsers,
        loadProfilesByPubkeys,
        loadEventsByIds,
        selectFollowing,
        followPerson,
        openActiveProfile,
        closeActiveProfileDialog,
    };
}
