import { useCallback, useEffect, useState } from 'react';
import { isWriteEnabled, type AuthSessionState } from '../../nostr/auth/session';
import { canonicalizeGroupAddress, type GroupAddressInput } from '../../nostr/groups';
import type { GroupPublishResponse, GroupsRuntimeSnapshot } from '../../nostr/groups-runtime-service';
import type { NostrEvent } from '../../nostr/types';
import type { NostrGroupSummary } from '../components/GroupsPage';

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

function sortTimeline(events: NostrEvent[]): NostrEvent[] {
    return [...events].sort((left, right) => {
        if (left.created_at !== right.created_at) {
            return right.created_at - left.created_at;
        }

        return left.id.localeCompare(right.id);
    });
}

function summaryFromSnapshot(snapshot: GroupsRuntimeSnapshot, flags: { isSaved: boolean; isRemembered: boolean }): NostrGroupSummary {
    return {
        id: snapshot.group.key,
        name: snapshot.metadata?.name ?? snapshot.group.id,
        relayUrl: snapshot.group.relay,
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
    const [groups, setGroups] = useState<NostrGroupSummary[]>([]);
    const [savedAddresses, setSavedAddresses] = useState<GroupAddressValue[]>([]);
    const [addressesById, setAddressesById] = useState<Record<string, GroupAddressInput | string>>({});
    const [timelineById, setTimelineById] = useState<Record<string, NostrEvent[]>>({});
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [selectedRelayUrl, setSelectedRelayUrl] = useState<string | null>(selectedGroupAddress ? canonicalizeGroupAddress(selectedGroupAddress).relay : null);
    const [messageDraft, setMessageDraft] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const canWrite = canUseGroupWrites(session);

    const loadGroups = useCallback(async (): Promise<void> => {
        if (!enabled) {
            return;
        }

        if (!hasGroupRelaysConfigured && !selectedGroupAddress) {
            setGroups([]);
            setSavedAddresses([]);
            setAddressesById({});
            setTimelineById({});
            setSelectedGroupId(null);
            setSelectedRelayUrl(null);
            setIsLoading(false);
            setError(null);
            return;
        }

        if (!ownerPubkey || !service) {
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const loaded = normalizeLoadGroupsResult(await service.loadGroups({ ownerPubkey }));
            const addresses = dedupeGroupAddresses(selectedGroupAddress ? [...loaded.display, selectedGroupAddress] : loaded.display);
            const savedKeys = sourceKeys(loaded.saved);
            const rememberedKeys = sourceKeys(loaded.remembered);
            const snapshots = await Promise.all(addresses.map(async (address) => service.loadGroup({ group: address })));
            const nextAddressesById: Record<string, GroupAddressInput | string> = {};
            const nextTimelineById: Record<string, NostrEvent[]> = {};
            const nextGroups = snapshots.map((snapshot, index) => {
                const address = addresses[index] ?? snapshot.group;
                const id = snapshot.group.key;
                nextAddressesById[id] = address;
                nextTimelineById[id] = sortTimeline(snapshot.timeline);
                return summaryFromSnapshot(snapshot, {
                    isSaved: savedKeys.has(id),
                    isRemembered: rememberedKeys.has(id),
                });
            });

            setGroups(nextGroups);
            setSavedAddresses(loaded.saved);
            setAddressesById(nextAddressesById);
            setTimelineById(nextTimelineById);
            const selectedGroupKey = selectedGroupAddress ? canonicalizeGroupAddress(selectedGroupAddress).key : null;
            const selectedRelay = selectedGroupAddress
                ? canonicalizeGroupAddress(selectedGroupAddress).relay
                : normalizeRelay(configuredGroupRelays[0] ?? '') ?? nextGroups[0]?.relayUrl ?? null;
            setSelectedRelayUrl(selectedRelay);
            setSelectedGroupId((current) => {
                if (selectedGroupKey && nextGroups.some((group) => group.id === selectedGroupKey)) {
                    return selectedGroupKey;
                }

                return current && nextGroups.some((group) => group.id === current)
                    ? current
                    : nextGroups.find((group) => group.relayUrl === selectedRelay)?.id ?? nextGroups[0]?.id ?? null;
            });
        } catch {
            setError(errorFallbackMessage);
        } finally {
            setIsLoading(false);
        }
    }, [configuredGroupRelays, enabled, errorFallbackMessage, hasGroupRelaysConfigured, ownerPubkey, selectedGroupAddress, service]);

    useEffect(() => {
        void loadGroups();
    }, [loadGroups]);

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
        setSavedAddresses(nextSavedAddresses);
    }, [addressesById, canWrite, savedAddresses, service]);

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
        setGroups((current) => current.map((group) => group.id === canonicalAddress.key ? { ...group, isRemembered: true } : group));
    }, [addressesById, canWrite, onRememberGroup, selectedGroupAddress, selectedInviteCode, service]);

    const requestLeave = useCallback(async (groupIdValue: string): Promise<void> => {
        const address = addressesById[groupIdValue];
        if (!service || !address || !canWrite) {
            return;
        }

        await service.requestLeave({ group: address });
    }, [addressesById, canWrite, service]);

    const relays = buildRelaySummaries({ configuredRelays: configuredGroupRelays, groups });
    const selectedRelayGroups = selectedRelayUrl ? groups.filter((group) => group.relayUrl === selectedRelayUrl) : groups;

    return {
        groups,
        relays,
        selectedRelayUrl,
        selectedRelayGroups,
        selectedGroupId,
        isLoading,
        error,
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
        retry: loadGroups,
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
