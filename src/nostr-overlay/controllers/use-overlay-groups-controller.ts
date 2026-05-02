import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isWriteEnabled, type AuthSessionState } from '../../nostr/auth/session';
import { canonicalizeGroupAddress, type GroupAddressInput } from '../../nostr/groups';
import type { GroupPublishResponse, GroupsRuntimeSnapshot } from '../../nostr/groups-runtime-service';
import type { NostrEvent } from '../../nostr/types';
import type { NostrGroupSummary } from '../components/GroupsPage';
import { nostrOverlayQueryKeys } from '../query/keys';
import { createSocialQueryOptions } from '../query/options';

export interface OverlayGroupsService {
    loadGroups(input: { ownerPubkey: string }): Promise<OverlayGroupsLoadResult>;
    loadGroup(input: { group: GroupAddressInput | string }): Promise<GroupsRuntimeSnapshot>;
    publishMessage(input: {
        group: GroupAddressInput | string;
        content: string;
        recentTimeline?: NostrEvent[];
    }): Promise<GroupPublishResponse | void>;
    requestJoin(input: { group: GroupAddressInput | string; code?: string }): Promise<GroupPublishResponse | void>;
    requestLeave(input: { group: GroupAddressInput | string }): Promise<GroupPublishResponse | void>;
    savePublicGroups(input: {
        groups: Array<GroupAddressInput | string>;
        relays?: string[];
        publishRelays?: string[];
    }): Promise<GroupPublishResponse | void>;
}

type GroupAddressValue = GroupAddressInput | string;

export type OverlayGroupsLoadResult = Array<GroupAddressValue> | {
    saved: GroupAddressValue[];
    remembered?: GroupAddressValue[];
    discovered?: GroupAddressValue[];
};

export interface NostrGroupRelaySummary {
    relayUrl: string;
    groupCount: number;
    savedCount: number;
    rememberedCount: number;
    isConfigured: boolean;
}

interface UseOverlayGroupsControllerOptions {
    enabled: boolean;
    ownerPubkey?: string;
    session: AuthSessionState | null | undefined;
    service?: OverlayGroupsService;
    hasGroupRelaysConfigured?: boolean;
    configuredGroupRelays?: string[];
    selectedGroupAddress?: GroupAddressValue;
    selectedInviteCode?: string;
    onRememberGroup?: (group: GroupAddressInput | string) => void;
    onAddCustomGroupRelay?: (relay: string) => void;
    onAddSuggestedGroupRelays?: () => void;
    onManageGroupRelays?: () => void;
    errorFallbackMessage: string;
}

interface OverlayGroupsControllerSnapshot {
    groups: NostrGroupSummary[];
    savedAddresses: GroupAddressValue[];
    addressesById: Record<string, GroupAddressInput | string>;
    timelineById: Record<string, NostrEvent[]>;
    selectedRelayUrl: string | null;
    selectedGroupId: string | null;
}

const EMPTY_GROUPS_SNAPSHOT: OverlayGroupsControllerSnapshot = {
    groups: [],
    savedAddresses: [],
    addressesById: {},
    timelineById: {},
    selectedRelayUrl: null,
    selectedGroupId: null,
};

function sortTimeline(events: NostrEvent[]): NostrEvent[] {
    return [...events].sort((left, right) => {
        if (left.created_at !== right.created_at) {
            return right.created_at - left.created_at;
        }

        return left.id.localeCompare(right.id);
    });
}

function summaryFromSnapshot(snapshot: GroupsRuntimeSnapshot, flags: { isSaved: boolean; isRemembered: boolean }): NostrGroupSummary {
    const group = canonicalizeGroupAddress(snapshot.group);

    return {
        id: group.key,
        name: snapshot.metadata?.name ?? snapshot.group.id,
        relayUrl: group.relay,
        description: snapshot.metadata?.about ?? snapshot.group.external,
        memberCount: snapshot.members?.pubkeys.length ?? 0,
        isSaved: flags.isSaved,
        isRemembered: flags.isRemembered,
        metadataVerified: snapshot.metadataVerified,
    };
}

function canUseGroupWrites(session: AuthSessionState | null | undefined): boolean {
    return isWriteEnabled(session ?? undefined);
}

function dedupeGroupAddresses(addresses: GroupAddressValue[]): GroupAddressValue[] {
    const byKey = new Map<string, GroupAddressValue>();
    for (const address of addresses) {
        byKey.set(canonicalizeGroupAddress(address).key, address);
    }

    return [...byKey.values()];
}

function addressKey(address: GroupAddressValue): string | null {
    try {
        return canonicalizeGroupAddress(address).key;
    } catch {
        return null;
    }
}

function normalizeRelay(relay: string): string | null {
    try {
        return canonicalizeGroupAddress({ relay, id: '_' }).relay;
    } catch {
        return null;
    }
}

function normalizeLoadGroupsResult(result: OverlayGroupsLoadResult): {
    saved: GroupAddressValue[];
    remembered: GroupAddressValue[];
    discovered: GroupAddressValue[];
    display: GroupAddressValue[];
} {
    if (Array.isArray(result)) {
        const saved = dedupeGroupAddresses(result);
        return { saved, remembered: [], discovered: [], display: saved };
    }

    const saved = dedupeGroupAddresses(result.saved);
    const remembered = dedupeGroupAddresses(result.remembered ?? []);
    const discovered = dedupeGroupAddresses(result.discovered ?? []);
    return {
        saved,
        remembered,
        discovered,
        display: dedupeGroupAddresses([...remembered, ...saved, ...discovered]),
    };
}

function sourceKeys(addresses: GroupAddressValue[]): Set<string> {
    return new Set(addresses.map(addressKey).filter((key): key is string => Boolean(key)));
}

function buildRelaySummaries(input: {
    configuredRelays: string[];
    groups: NostrGroupSummary[];
}): NostrGroupRelaySummary[] {
    const configuredRelays = input.configuredRelays.map(normalizeRelay).filter((relay): relay is string => Boolean(relay));
    const relayUrls = new Set<string>(configuredRelays);
    for (const group of input.groups) {
        relayUrls.add(group.relayUrl);
    }

    return [...relayUrls].map((relayUrl) => {
        const groups = input.groups.filter((group) => group.relayUrl === relayUrl);
        return {
            relayUrl,
            groupCount: groups.length,
            savedCount: groups.filter((group) => group.isSaved).length,
            rememberedCount: groups.filter((group) => group.isRemembered).length,
            isConfigured: configuredRelays.includes(relayUrl),
        };
    });
}

async function loadGroupsSnapshot(input: {
    ownerPubkey: string;
    service: OverlayGroupsService;
    configuredGroupRelays: string[];
    selectedGroupAddress?: GroupAddressValue;
}): Promise<OverlayGroupsControllerSnapshot> {
    const loaded = normalizeLoadGroupsResult(await input.service.loadGroups({ ownerPubkey: input.ownerPubkey }));
    const addresses = dedupeGroupAddresses(input.selectedGroupAddress ? [...loaded.display, input.selectedGroupAddress] : loaded.display);
    const savedKeys = sourceKeys(loaded.saved);
    const rememberedKeys = sourceKeys(loaded.remembered);
    const snapshots = await Promise.all(addresses.map(async (address) => input.service.loadGroup({ group: address })));
    const nextAddressesById: Record<string, GroupAddressInput | string> = {};
    const nextTimelineById: Record<string, NostrEvent[]> = {};
    const groups = snapshots.map((snapshot, index) => {
        const address = addresses[index] ?? snapshot.group;
        const id = canonicalizeGroupAddress(snapshot.group).key;
        nextAddressesById[id] = address;
        nextTimelineById[id] = sortTimeline(snapshot.timeline);
        return summaryFromSnapshot(snapshot, {
            isSaved: savedKeys.has(id),
            isRemembered: rememberedKeys.has(id),
        });
    });
    const selectedGroupKey = input.selectedGroupAddress ? canonicalizeGroupAddress(input.selectedGroupAddress).key : null;
    const selectedRelay = input.selectedGroupAddress
        ? canonicalizeGroupAddress(input.selectedGroupAddress).relay
        : normalizeRelay(input.configuredGroupRelays[0] ?? '') ?? groups[0]?.relayUrl ?? null;

    return {
        groups,
        savedAddresses: loaded.saved,
        addressesById: nextAddressesById,
        timelineById: nextTimelineById,
        selectedRelayUrl: selectedRelay,
        selectedGroupId: selectedGroupKey && groups.some((group) => group.id === selectedGroupKey)
            ? selectedGroupKey
            : groups.find((group) => group.relayUrl === selectedRelay)?.id ?? groups[0]?.id ?? null,
    };
}

export function useOverlayGroupsController({
    enabled,
    ownerPubkey,
    session,
    service,
    hasGroupRelaysConfigured = true,
    configuredGroupRelays = [],
    selectedGroupAddress,
    selectedInviteCode,
    onRememberGroup,
    onAddCustomGroupRelay = () => {},
    onAddSuggestedGroupRelays = () => {},
    onManageGroupRelays = () => {},
    errorFallbackMessage,
}: UseOverlayGroupsControllerOptions) {
    const selectedRouteGroup = selectedGroupAddress ? canonicalizeGroupAddress(selectedGroupAddress) : null;
    const selectedRouteGroupKey = selectedRouteGroup?.key;
    const selectedRouteGroupRelay = selectedRouteGroup?.relay;
    const queryClient = useQueryClient();
    const queryKey = nostrOverlayQueryKeys.overlayGroups({
        ownerPubkey: ownerPubkey ?? '',
        configuredRelays: configuredGroupRelays,
        hasGroupRelaysConfigured,
        ...(selectedRouteGroupKey ? { selectedGroupKey: selectedRouteGroupKey } : {}),
    });
    const canLoadGroups = Boolean(ownerPubkey && service && (hasGroupRelaysConfigured || selectedGroupAddress));
    const groupsQuery = useQuery(createSocialQueryOptions({
        queryKey,
        queryFn: async () => {
            if (!ownerPubkey || !service || (!hasGroupRelaysConfigured && !selectedGroupAddress)) {
                return EMPTY_GROUPS_SNAPSHOT;
            }

            return loadGroupsSnapshot({
                ownerPubkey,
                service,
                configuredGroupRelays,
                ...(selectedGroupAddress ? { selectedGroupAddress } : {}),
            });
        },
        enabled: enabled && canLoadGroups,
    }));
    const snapshot = canLoadGroups ? groupsQuery.data ?? EMPTY_GROUPS_SNAPSHOT : EMPTY_GROUPS_SNAPSHOT;
    const { groups, savedAddresses, addressesById, timelineById } = snapshot;
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(snapshot.selectedGroupId);
    const [selectedRelayUrl, setSelectedRelayUrl] = useState<string | null>(selectedRouteGroupRelay ?? snapshot.selectedRelayUrl);
    const [messageDraft, setMessageDraft] = useState('');
    const canWrite = canUseGroupWrites(session);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        setSelectedRelayUrl((current) => {
            if (selectedRouteGroupRelay) {
                return selectedRouteGroupRelay;
            }

            return current && groups.some((group) => group.relayUrl === current)
                ? current
                : snapshot.selectedRelayUrl;
        });
        setSelectedGroupId((current) => {
            if (selectedRouteGroupKey && groups.some((group) => group.id === selectedRouteGroupKey)) {
                return selectedRouteGroupKey;
            }

            return current && groups.some((group) => group.id === current)
                ? current
                : snapshot.selectedGroupId;
        });
    }, [enabled, groups, selectedRouteGroupKey, selectedRouteGroupRelay, snapshot.selectedGroupId, snapshot.selectedRelayUrl]);

    const selectedTimeline = selectedGroupId ? timelineById[selectedGroupId] ?? [] : [];

    const publishMessage = useCallback(async (groupIdValue: string, content: string): Promise<void> => {
        const address = addressesById[groupIdValue];
        if (!service || !address || !canWrite) {
            return;
        }

        await service.publishMessage({
            group: address,
            content,
            recentTimeline: timelineById[groupIdValue] ?? [],
        });
        setMessageDraft('');
    }, [addressesById, canWrite, service, timelineById]);

    const saveGroup = useCallback(async (groupIdValue: string): Promise<void> => {
        const address = addressesById[groupIdValue];
        if (!service || !address || !canWrite) {
            return;
        }

        const nextSavedAddresses = dedupeGroupAddresses([...savedAddresses, address]);
        await service.savePublicGroups({ groups: nextSavedAddresses });
        const nextSavedKeys = sourceKeys(nextSavedAddresses);
        queryClient.setQueryData<OverlayGroupsControllerSnapshot>(queryKey, (current) => current ? {
            ...current,
            savedAddresses: nextSavedAddresses,
            groups: current.groups.map((group) => nextSavedKeys.has(group.id) ? { ...group, isSaved: true } : group),
        } : current);
    }, [addressesById, canWrite, queryClient, queryKey, savedAddresses, service]);

    const syncPublicGroups = useCallback(async (): Promise<void> => {
        if (!service || !canWrite) {
            return;
        }

        await service.savePublicGroups({
            groups: savedAddresses,
            relays: configuredGroupRelays,
            publishRelays: configuredGroupRelays,
        });
    }, [canWrite, configuredGroupRelays, savedAddresses, service]);

    const requestJoin = useCallback(async (groupIdValue: string, code?: string): Promise<void> => {
        const address = addressesById[groupIdValue];
        if (!service || !address || !canWrite) {
            return;
        }

        const canonicalAddress = canonicalizeGroupAddress(address);
        const routeInviteCode = selectedGroupAddress && canonicalizeGroupAddress(selectedGroupAddress).key === canonicalAddress.key ? selectedInviteCode : undefined;
        const joinCode = code ?? routeInviteCode;
        await service.requestJoin(joinCode ? { group: address, code: joinCode } : { group: address });
        onRememberGroup?.({ relay: canonicalAddress.relay, id: canonicalAddress.id });
        queryClient.setQueryData<OverlayGroupsControllerSnapshot>(queryKey, (current) => current ? {
            ...current,
            groups: current.groups.map((group) => group.id === canonicalAddress.key ? { ...group, isRemembered: true } : group),
        } : current);
    }, [addressesById, canWrite, onRememberGroup, queryClient, queryKey, selectedGroupAddress, selectedInviteCode, service]);

    const requestLeave = useCallback(async (groupIdValue: string): Promise<void> => {
        const address = addressesById[groupIdValue];
        if (!service || !address || !canWrite) {
            return;
        }

        await service.requestLeave({ group: address });
    }, [addressesById, canWrite, service]);

    const relays = buildRelaySummaries({ configuredRelays: configuredGroupRelays, groups });
    const selectedRelayGroups = selectedRelayUrl ? groups.filter((group) => group.relayUrl === selectedRelayUrl) : groups;
    const retry = useCallback(async (): Promise<void> => {
        await groupsQuery.refetch();
    }, [groupsQuery]);

    return {
        groups,
        relays,
        selectedRelayUrl,
        selectedRelayGroups,
        selectedGroupId,
        isLoading: enabled && canLoadGroups && groupsQuery.isPending && groups.length === 0,
        error: groups.length === 0 && groupsQuery.error ? errorFallbackMessage : null,
        messageDraft,
        selectedTimeline,
        setMessageDraft,
        selectGroup: setSelectedGroupId,
        selectRelay: setSelectedRelayUrl,
        publishMessage,
        saveGroup,
        syncPublicGroups,
        requestJoin,
        requestLeave,
        retry,
        hasGroupRelaysConfigured,
        addCustomGroupRelay: onAddCustomGroupRelay,
        addSuggestedGroupRelays: onAddSuggestedGroupRelays,
        manageGroupRelays: onManageGroupRelays,
    };
}

export const __overlayGroupsControllerTestUtils = {
    sortTimeline,
    dedupeGroupAddresses,
    normalizeLoadGroupsResult,
};
