import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { RelaySettingsByType } from '../../nostr/relay-settings';
import type { NostrPostPreview } from '../../nostr/posts';
import type { NostrProfile } from '../../nostr/types';
import { nostrOverlayQueryKeys } from './keys';
import { createSocialQueryOptions } from './options';

export interface ActiveProfilePostsPage {
    posts: NostrPostPreview[];
    nextUntil?: number;
    hasMore: boolean;
}

export interface ActiveProfileStatsResult {
    followsCount: number;
    followersCount: number;
}

export interface ActiveProfileNetworkResult {
    follows: string[];
    followers: string[];
    followersError?: string;
    profiles: Record<string, NostrProfile>;
    relaySuggestionsByType: RelaySettingsByType;
}

export interface ActiveProfileQueryService {
    loadPosts: (input: { pubkey: string; limit?: number; until?: number }) => Promise<ActiveProfilePostsPage>;
    loadStats: (input: { pubkey: string }) => Promise<ActiveProfileStatsResult>;
    loadNetwork: (input: { pubkey: string }) => Promise<ActiveProfileNetworkResult>;
}

interface UseActiveProfileQueryInput {
    pubkey?: string;
    service: ActiveProfileQueryService;
    pageSize?: number;
}

export interface ActiveProfileQueryState {
    posts: NostrPostPreview[];
    postsLoading: boolean;
    postsError?: string;
    hasMorePosts: boolean;
    followsCount: number;
    followersCount: number;
    statsLoading: boolean;
    statsError?: string;
    follows: string[];
    followers: string[];
    followersError?: string;
    networkProfiles: Record<string, NostrProfile>;
    relaySuggestionsByType: RelaySettingsByType;
    networkLoading: boolean;
    networkError?: string;
    loadMorePosts: () => Promise<void>;
    retryPosts: () => Promise<void>;
    retryNetwork: () => Promise<void>;
}

const DEFAULT_PAGE_SIZE = 10;

const EMPTY_NETWORK: ActiveProfileNetworkResult = {
    follows: [],
    followers: [],
    profiles: {},
    relaySuggestionsByType: {
        nip65Both: [],
        nip65Read: [],
        nip65Write: [],
        dmInbox: [],
        search: [],
        groups: [],
    },
};

function toErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

export function useActiveProfileQuery(input: UseActiveProfileQueryInput): ActiveProfileQueryState {
    const pubkey = input.pubkey;
    const pageSize = Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE);

    const postsQuery = useInfiniteQuery<ActiveProfilePostsPage, Error>(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.activeProfilePosts({ pubkey: pubkey || '__none__', pageSize }),
        queryFn: ({ pageParam }: { pageParam: unknown }) => {
            if (!pubkey) {
                return Promise.resolve({
                    posts: [],
                    hasMore: false,
                });
            }

            const until = typeof pageParam === 'number' ? pageParam : undefined;

            return input.service.loadPosts({
                pubkey,
                limit: pageSize,
                ...(until !== undefined ? { until } : {}),
            });
        },
        enabled: Boolean(pubkey),
        initialPageParam: undefined,
        getNextPageParam: (lastPage: ActiveProfilePostsPage) => (lastPage.hasMore ? lastPage.nextUntil : undefined),
    }));

    const statsQuery = useQuery(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.activeProfileStats({ pubkey: pubkey || '__none__' }),
        queryFn: () => {
            if (!pubkey) {
                return Promise.resolve({ followsCount: 0, followersCount: 0 });
            }

            return input.service.loadStats({ pubkey });
        },
        enabled: Boolean(pubkey),
    }));

    const networkQuery = useQuery(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.activeProfileNetwork({ pubkey: pubkey || '__none__' }),
        queryFn: () => {
            if (!pubkey) {
                return Promise.resolve(EMPTY_NETWORK);
            }

            return input.service.loadNetwork({ pubkey });
        },
        enabled: Boolean(pubkey),
    }));

    const posts = useMemo(() => {
        const allPosts = postsQuery.data?.pages.flatMap((page) => page.posts) ?? [];
        if (allPosts.length <= 1) {
            return allPosts;
        }

        const seen = new Set<string>();
        return allPosts.filter((post) => {
            if (seen.has(post.id)) {
                return false;
            }
            seen.add(post.id);
            return true;
        });
    }, [postsQuery.data?.pages]);

    const loadMorePosts = useCallback(async () => {
        if (!postsQuery.hasNextPage || postsQuery.isFetchingNextPage) {
            return;
        }

        await postsQuery.fetchNextPage();
    }, [postsQuery]);

    const retryPosts = useCallback(async () => {
        await postsQuery.refetch();
    }, [postsQuery]);

    const retryNetwork = useCallback(async () => {
        await networkQuery.refetch();
    }, [networkQuery]);

    const network = networkQuery.data ?? EMPTY_NETWORK;
    const followsCount = statsQuery.data?.followsCount ?? network.follows.length;
    const followersCount = statsQuery.data?.followersCount ?? network.followers.length;

    return {
        posts,
        postsLoading: postsQuery.isPending || postsQuery.isFetchingNextPage,
        ...(postsQuery.error ? { postsError: toErrorMessage(postsQuery.error, 'No se pudieron cargar publicaciones') } : {}),
        hasMorePosts: Boolean(postsQuery.hasNextPage),
        followsCount,
        followersCount,
        statsLoading: statsQuery.isPending,
        ...(statsQuery.error ? { statsError: toErrorMessage(statsQuery.error, 'No se pudo cargar estadisticas del perfil') } : {}),
        follows: network.follows,
        followers: network.followers,
        ...(network.followersError ? { followersError: network.followersError } : {}),
        networkProfiles: network.profiles,
        relaySuggestionsByType: network.relaySuggestionsByType,
        networkLoading: networkQuery.isPending,
        ...(networkQuery.error ? { networkError: toErrorMessage(networkQuery.error, 'No se pudo cargar red social del perfil') } : {}),
        loadMorePosts,
        retryPosts,
        retryNetwork,
    };
}
