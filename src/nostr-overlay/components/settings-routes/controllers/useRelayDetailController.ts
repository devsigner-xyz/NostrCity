import { useEffect, useMemo, useRef, useState } from 'react';
import { loadRelaySettings, type RelaySettingsByType, type RelayType } from '../../../../nostr/relay-settings';
import { mergeRelaySets } from '../../../../nostr/relay-policy';
import { useRelayConnectionSummary, type RelayConnectionProbe } from '../../../hooks/useRelayConnectionSummary';
import { useRelayGroupsByRelayQuery } from '../../../query/relay-groups.query';
import { useRelayMetadataByUrlQuery } from '../../../query/relay-metadata.query';
import type { RelayDetailRouteParams } from '../../../settings/relay-detail-routing';
import {
    describeRelay,
    formatRelayFee,
    hasNip11Metadata,
    relayAvatarFallback,
    relayConnectionBadge,
    RELAY_TYPE_LABELS,
    toAdminIdentity,
} from './relays-shared';

function getConfiguredActiveRelayTypes(byType: RelaySettingsByType, relayUrl: string): RelayType[] {
    const hasNip65Both = byType.nip65Both.includes(relayUrl);
    const hasNip65Read = byType.nip65Read.includes(relayUrl);
    const hasNip65Write = byType.nip65Write.includes(relayUrl);
    const activeRelayTypes: RelayType[] = [];

    if (hasNip65Both || (hasNip65Read && hasNip65Write)) {
        activeRelayTypes.push('nip65Both');
    } else {
        if (hasNip65Read) {
            activeRelayTypes.push('nip65Read');
        }
        if (hasNip65Write) {
            activeRelayTypes.push('nip65Write');
        }
    }

    if (byType.dmInbox.includes(relayUrl)) {
        activeRelayTypes.push('dmInbox');
    }
    if (byType.search.includes(relayUrl)) {
        activeRelayTypes.push('search');
    }
    if (byType.groups.includes(relayUrl)) {
        activeRelayTypes.push('groups');
    }

    return activeRelayTypes;
}

interface UseRelayDetailControllerInput {
    ownerPubkey?: string;
    suggestedRelays?: string[];
    suggestedRelaysByType?: Partial<RelaySettingsByType>;
    relayConnectionProbe?: RelayConnectionProbe;
    relayConnectionRefreshIntervalMs?: number;
    params: RelayDetailRouteParams;
}

export function useRelayDetailController(input: UseRelayDetailControllerInput) {
    const {
        ownerPubkey,
        suggestedRelays = [],
        suggestedRelaysByType,
        relayConnectionProbe,
        relayConnectionRefreshIntervalMs,
        params,
    } = input;
    const [relaySettings, setRelaySettings] = useState(() => loadRelaySettings(ownerPubkey ? { ownerPubkey } : undefined));
    const [copiedRelayIdentityKey, setCopiedRelayIdentityKey] = useState<string | null>(null);
    const relayCopyResetTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        setRelaySettings(loadRelaySettings(ownerPubkey ? { ownerPubkey } : undefined));
    }, [ownerPubkey]);

    useEffect(() => {
        return () => {
            if (relayCopyResetTimeoutRef.current !== null) {
                window.clearTimeout(relayCopyResetTimeoutRef.current);
            }
        };
    }, []);

    const normalizedSuggestedByType = useMemo<RelaySettingsByType>(() => {
        return {
            nip65Both: mergeRelaySets(suggestedRelaysByType?.nip65Both ?? [], suggestedRelays),
            nip65Read: mergeRelaySets(suggestedRelaysByType?.nip65Read ?? []),
            nip65Write: mergeRelaySets(suggestedRelaysByType?.nip65Write ?? []),
            dmInbox: mergeRelaySets(suggestedRelaysByType?.dmInbox ?? []),
            search: mergeRelaySets(suggestedRelaysByType?.search ?? []),
            groups: mergeRelaySets(suggestedRelaysByType?.groups ?? []),
        };
    }, [suggestedRelaysByType, suggestedRelays]);

    const relayInfoTargets = useMemo(() => {
        return [...new Set([
            params.relayUrl,
            ...relaySettings.relays,
            ...relaySettings.byType.search,
            ...normalizedSuggestedByType.nip65Both,
            ...normalizedSuggestedByType.nip65Read,
            ...normalizedSuggestedByType.nip65Write,
            ...normalizedSuggestedByType.dmInbox,
            ...normalizedSuggestedByType.search,
        ])];
    }, [params.relayUrl, relaySettings.byType.search, relaySettings.relays, normalizedSuggestedByType]);

    const relayInfoByUrl = useRelayMetadataByUrlQuery({
        relayUrls: relayInfoTargets,
        enabled: true,
    });

    const { statusByRelay: relayConnectionStatusByRelay } = useRelayConnectionSummary([params.relayUrl], {
        enabled: true,
        ...(relayConnectionProbe ? { probe: relayConnectionProbe } : {}),
        ...(relayConnectionRefreshIntervalMs !== undefined ? { refreshIntervalMs: relayConnectionRefreshIntervalMs } : {}),
        maxConcurrentProbes: 1,
    });

    const selectedRelay = params;
    const activeRelayTypes = useMemo<RelayType[]>(() => {
        if (selectedRelay.source !== 'configured') {
            return [selectedRelay.relayType];
        }

        return getConfiguredActiveRelayTypes(relaySettings.byType, selectedRelay.relayUrl);
    }, [relaySettings.byType, selectedRelay]);
    const hasGroupRelayUse = activeRelayTypes.includes('groups');
    const availableGroupsState = useRelayGroupsByRelayQuery({
        relayUrl: selectedRelay.relayUrl,
        enabled: hasGroupRelayUse,
    });
    const selectedRelayDetails = describeRelay(selectedRelay.relayUrl, selectedRelay.source);
    const selectedRelayInfo = relayInfoByUrl[selectedRelay.relayUrl];
    const selectedRelayDocument = selectedRelayInfo?.status === 'ready' ? selectedRelayInfo.data : undefined;
    const selectedRelayAdminIdentity = toAdminIdentity(selectedRelayDocument?.pubkey);
    const selectedRelayConnectionStatus = relayConnectionStatusByRelay[selectedRelay.relayUrl];
    const relayHasNip11Metadata = hasNip11Metadata(selectedRelayDocument);
    const relayEventLimit = selectedRelayDocument?.limitation?.max_limit
        ?? selectedRelayDocument?.limitation?.default_limit;
    const relayHasFees = Boolean(
        (selectedRelayDocument?.fees?.admission && selectedRelayDocument.fees.admission.length > 0)
        || (selectedRelayDocument?.fees?.subscription && selectedRelayDocument.fees.subscription.length > 0)
        || (selectedRelayDocument?.fees?.publication && selectedRelayDocument.fees.publication.length > 0)
    );

    const onCopyRelayIdentity = async (value: string, key: string): Promise<void> => {
        if (!value || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            return;
        }

        try {
            await navigator.clipboard.writeText(value);
            setCopiedRelayIdentityKey(key);
            if (relayCopyResetTimeoutRef.current !== null) {
                window.clearTimeout(relayCopyResetTimeoutRef.current);
            }
            relayCopyResetTimeoutRef.current = window.setTimeout(() => {
                setCopiedRelayIdentityKey((current) => (current === key ? null : current));
            }, 1800);
        } catch {
            setCopiedRelayIdentityKey(null);
        }
    };

    return {
        selectedRelay,
        activeRelayTypes,
        availableGroupsState,
        selectedRelayDetails,
        selectedRelayInfo,
        selectedRelayDocument,
        selectedRelayAdminIdentity,
        selectedRelayConnectionStatus,
        relayHasNip11Metadata,
        relayEventLimit,
        relayHasFees,
        copiedRelayIdentityKey,
        relayTypeLabels: RELAY_TYPE_LABELS,
        relayAvatarFallback,
        relayConnectionBadge,
        formatRelayFee,
        onCopyRelayIdentity,
    };
}
