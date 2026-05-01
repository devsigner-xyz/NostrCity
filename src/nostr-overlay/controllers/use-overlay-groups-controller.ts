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
    discovered?: GroupAddressValue[];
};

interface UseOverlayGroupsControllerOptions {
    enabled: boolean;
    ownerPubkey?: string;
    session: AuthSessionState | null | undefined;
    service?: OverlayGroupsService;
    hasGroupRelaysConfigured?: boolean;
    configuredGroupRelays?: string[];
    selectedGroupAddress?: GroupAddressValue;
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

function summaryFromSnapshot(snapshot: GroupsRuntimeSnapshot): NostrGroupSummary {
    return {
        id: snapshot.group.key,
        name: snapshot.metadata?.name ?? snapshot.group.id,
        relayUrl: snapshot.group.relay,
        description: snapshot.metadata?.about ?? snapshot.group.external,
        memberCount: snapshot.members?.pubkeys.length ?? 0,
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

function normalizeLoadGroupsResult(result: OverlayGroupsLoadResult): { saved: GroupAddressValue[]; display: GroupAddressValue[] } {
    if (Array.isArray(result)) {
        const saved = dedupeGroupAddresses(result);
        return { saved, display: saved };
    }

    const saved = dedupeGroupAddresses(result.saved);
    return {
        saved,
        display: dedupeGroupAddresses([...saved, ...(result.discovered ?? [])]),
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
    onAddSuggestedGroupRelays = () => {},
    onManageGroupRelays = () => {},
    errorFallbackMessage,
}: UseOverlayGroupsControllerOptions) {
    const [groups, setGroups] = useState<NostrGroupSummary[]>([]);
    const [savedAddresses, setSavedAddresses] = useState<GroupAddressValue[]>([]);
    const [addressesById, setAddressesById] = useState<Record<string, GroupAddressInput | string>>({});
    const [timelineById, setTimelineById] = useState<Record<string, NostrEvent[]>>({});
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [messageDraft, setMessageDraft] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const canWrite = canUseGroupWrites(session);

    const loadGroups = useCallback(async (): Promise<void> => {
        if (!enabled) {
            return;
        }

        if (!hasGroupRelaysConfigured) {
            setGroups([]);
            setSavedAddresses([]);
            setAddressesById({});
            setTimelineById({});
            setSelectedGroupId(null);
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
            const addresses = loaded.display;
            const snapshots = await Promise.all(addresses.map(async (address) => service.loadGroup({ group: address })));
            const nextAddressesById: Record<string, GroupAddressInput | string> = {};
            const nextTimelineById: Record<string, NostrEvent[]> = {};
            const nextGroups = snapshots.map((snapshot, index) => {
                const address = addresses[index] ?? snapshot.group;
                const id = snapshot.group.key;
                nextAddressesById[id] = address;
                nextTimelineById[id] = sortTimeline(snapshot.timeline);
                return summaryFromSnapshot(snapshot);
            });

            setGroups(nextGroups);
            setSavedAddresses(loaded.saved);
            setAddressesById(nextAddressesById);
            setTimelineById(nextTimelineById);
            const selectedGroupKey = selectedGroupAddress ? canonicalizeGroupAddress(selectedGroupAddress).key : null;
            setSelectedGroupId((current) => {
                if (selectedGroupKey && nextGroups.some((group) => group.id === selectedGroupKey)) {
                    return selectedGroupKey;
                }

                return current && nextGroups.some((group) => group.id === current)
                    ? current
                    : nextGroups[0]?.id ?? null;
            });
        } catch {
            setError(errorFallbackMessage);
        } finally {
            setIsLoading(false);
        }
    }, [enabled, errorFallbackMessage, hasGroupRelaysConfigured, ownerPubkey, selectedGroupAddress, service]);

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

        await service.requestJoin({
            group: address,
            ...(code ? { code } : {}),
        });
    }, [addressesById, canWrite, service]);

    const requestLeave = useCallback(async (groupIdValue: string): Promise<void> => {
        const address = addressesById[groupIdValue];
        if (!service || !address || !canWrite) {
            return;
        }

        await service.requestLeave({ group: address });
    }, [addressesById, canWrite, service]);

    return {
        groups,
        selectedGroupId,
        isLoading,
        error,
        messageDraft,
        selectedTimeline,
        setMessageDraft,
        selectGroup: setSelectedGroupId,
        publishMessage,
        saveGroup,
        syncPublicGroups,
        requestJoin,
        requestLeave,
        retry: loadGroups,
        hasGroupRelaysConfigured,
        addSuggestedGroupRelays: onAddSuggestedGroupRelays,
        manageGroupRelays: onManageGroupRelays,
    };
}

export const __overlayGroupsControllerTestUtils = {
    sortTimeline,
    dedupeGroupAddresses,
    normalizeLoadGroupsResult,
};
