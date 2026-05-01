import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
    addRelay,
    DEFAULT_GROUP_RELAYS,
    DEFAULT_SEARCH_RELAYS,
    getDefaultDmInboxRelays,
    loadRelaySettings,
    removeRelay,
    saveRelaySettings,
    setRelayNip65Access,
    type RelaySettingsByType,
    type RelaySettingsState,
    type RelayType,
} from '../../../../nostr/relay-settings';
import { getBootstrapRelays, mergeRelaySets } from '../../../../nostr/relay-policy';
import { useRelayConnectionSummary, type RelayConnectionProbe, type RelayConnectionStatus } from '../../../hooks/useRelayConnectionSummary';
import { useRelayMetadataByUrlQuery } from '../../../query/relay-metadata.query';
import type { RelayInformationDocument } from '../../settings-pages/types';
import {
    buildRelayRowsByUrl,
    EMPTY_RELAYS,
    normalizeRelayInput,
    RELAY_TYPE_LABELS,
    relayAvatarFallback,
    relayConnectionBadge,
    describeRelay,
} from './relays-shared';
import { buildConfiguredSectionRows, buildSuggestedSectionRows } from './relay-section-partitions';
import {
    buildConfiguredRelayStatusTargets,
    buildRelayInfoTargets,
    buildSuggestedRelayStatusTargets,
} from './relay-section-targets';

interface UseRelaysSettingsControllerInput {
    ownerPubkey?: string;
    suggestedRelays?: string[];
    suggestedRelaysByType?: Partial<RelaySettingsByType>;
    relayConnectionProbe?: RelayConnectionProbe;
    relayConnectionRefreshIntervalMs?: number;
    onRelaySettingsChange?: (nextState: RelaySettingsState) => void;
}

export interface RelaysSettingsController {
    configuredRows: ReturnType<typeof buildRelayRowsByUrl>;
    suggestedRows: ReturnType<typeof buildRelayRowsByUrl>;
    dmConfiguredRows: ReturnType<typeof buildRelayRowsByUrl>;
    dmSuggestedRows: ReturnType<typeof buildRelayRowsByUrl>;
    searchConfiguredRows: ReturnType<typeof buildRelayRowsByUrl>;
    searchSuggestedRows: ReturnType<typeof buildRelayRowsByUrl>;
    groupConfiguredRows: ReturnType<typeof buildRelayRowsByUrl>;
    groupSuggestedRows: ReturnType<typeof buildRelayRowsByUrl>;
    connectedConfiguredRelays: number;
    disconnectedConfiguredRelays: number;
    relayInfoByUrl: Record<string, { data?: RelayInformationDocument }>;
    configuredRelayConnectionStatusByRelay: Record<string, RelayConnectionStatus | undefined>;
    relayConnectionStatusByRelay: Record<string, RelayConnectionStatus | undefined>;
    relayTypeLabels: typeof RELAY_TYPE_LABELS;
    newRelayInput: string;
    newDmRelayInput: string;
    newSearchRelayInput: string;
    newGroupRelayInput: string;
    invalidRelayInputs: string[];
    invalidDmRelayInputs: string[];
    invalidSearchRelayInputs: string[];
    invalidGroupRelayInputs: string[];
    onNewRelayInputChange: (value: string) => void;
    onNewDmRelayInputChange: (value: string) => void;
    onNewSearchRelayInputChange: (value: string) => void;
    onNewGroupRelayInputChange: (value: string) => void;
    onAddRelays: () => void;
    onRemoveRelay: (relayUrl: string) => void;
    onSetConfiguredRelayNip65Access: (relayUrl: string, access: { read: boolean; write: boolean }) => void;
    onAddSuggestedRelay: (relayUrl: string, relayTypes: RelayType[]) => void;
    onAddAllSuggestedRelays: () => void;
    onResetRelaysToDefault: () => void;
    onAddDmRelays: () => void;
    onRemoveDmRelay: (relayUrl: string) => void;
    onAddSuggestedDmRelay: (relayUrl: string, relayTypes: RelayType[]) => void;
    onAddAllSuggestedDmRelays: () => void;
    onResetDmRelaysToDefault: () => void;
    onAddSearchRelays: () => void;
    onRemoveSearchRelay: (relayUrl: string) => void;
    onAddSuggestedSearchRelay: (relayUrl: string, relayTypes: RelayType[]) => void;
    onAddAllSuggestedSearchRelays: () => void;
    onResetSearchRelaysToDefault: () => void;
    onAddGroupRelays: () => void;
    onRemoveGroupRelay: (relayUrl: string) => void;
    onAddSuggestedGroupRelay: (relayUrl: string, relayTypes: RelayType[]) => void;
    onAddAllSuggestedGroupRelays: () => void;
    onResetGroupRelaysToDefault: () => void;
    onOpenRelayActionsMenu: (event: MouseEvent<HTMLButtonElement>) => void;
    describeRelay: typeof describeRelay;
    relayAvatarFallback: typeof relayAvatarFallback;
    relayConnectionBadge: typeof relayConnectionBadge;
}

export function useRelaysSettingsController(input: UseRelaysSettingsControllerInput): RelaysSettingsController {
    const {
        ownerPubkey,
        suggestedRelays = EMPTY_RELAYS,
        suggestedRelaysByType,
        relayConnectionProbe,
        relayConnectionRefreshIntervalMs,
        onRelaySettingsChange,
    } = input;
    const [relaySettings, setRelaySettings] = useState<RelaySettingsState>(() => loadRelaySettings(
        ownerPubkey ? { ownerPubkey } : undefined
    ));
    const [newRelayInput, setNewRelayInput] = useState('');
    const [newDmRelayInput, setNewDmRelayInput] = useState('');
    const [newSearchRelayInput, setNewSearchRelayInput] = useState('');
    const [newGroupRelayInput, setNewGroupRelayInput] = useState('');
    const [invalidRelayInputs, setInvalidRelayInputs] = useState<string[]>([]);
    const [invalidDmRelayInputs, setInvalidDmRelayInputs] = useState<string[]>([]);
    const [invalidSearchRelayInputs, setInvalidSearchRelayInputs] = useState<string[]>([]);
    const [invalidGroupRelayInputs, setInvalidGroupRelayInputs] = useState<string[]>([]);

    const persistRelaySettings = (nextState: RelaySettingsState): void => {
        const savedState = saveRelaySettings(nextState, ownerPubkey ? { ownerPubkey } : undefined);
        setRelaySettings(savedState);
        onRelaySettingsChange?.(savedState);
    };

    useEffect(() => {
        setRelaySettings(loadRelaySettings(ownerPubkey ? { ownerPubkey } : undefined));
    }, [ownerPubkey]);

    const normalizedSuggestedByType = useMemo<RelaySettingsByType>(() => {
        const suggestedGroupRelays = suggestedRelaysByType?.groups?.length
            ? suggestedRelaysByType.groups
            : DEFAULT_GROUP_RELAYS;

        return {
            nip65Both: mergeRelaySets(suggestedRelaysByType?.nip65Both ?? [], suggestedRelays),
            nip65Read: mergeRelaySets(suggestedRelaysByType?.nip65Read ?? []),
            nip65Write: mergeRelaySets(suggestedRelaysByType?.nip65Write ?? []),
            dmInbox: mergeRelaySets(suggestedRelaysByType?.dmInbox ?? []),
            search: mergeRelaySets(suggestedRelaysByType?.search ?? DEFAULT_SEARCH_RELAYS),
            groups: mergeRelaySets(suggestedGroupRelays),
        };
    }, [suggestedRelaysByType, suggestedRelays]);

    const {
        configuredRows,
        dmConfiguredRows,
        searchConfiguredRows,
        groupConfiguredRows,
    } = useMemo(() => buildConfiguredSectionRows(relaySettings.byType), [relaySettings.byType]);

    const {
        suggestedRows,
        dmSuggestedRows,
        searchSuggestedRows,
        groupSuggestedRows,
    } = useMemo(() => buildSuggestedSectionRows({
        relaySettings,
        normalizedSuggestedByType,
    }), [normalizedSuggestedByType, relaySettings]);

    const {
        nip65ConfiguredRelayStatusTargets,
        allConfiguredRelayStatusTargets,
    } = useMemo(() => buildConfiguredRelayStatusTargets({
        configuredRows,
        dmConfiguredRows,
        searchConfiguredRows,
        groupConfiguredRows,
    }), [configuredRows, dmConfiguredRows, searchConfiguredRows, groupConfiguredRows]);

    const suggestedRelayStatusTargets = useMemo(() => buildSuggestedRelayStatusTargets({
        configuredRelayStatusTargets: allConfiguredRelayStatusTargets,
        suggestedRows,
        dmSuggestedRows,
        searchSuggestedRows,
        groupSuggestedRows,
    }), [allConfiguredRelayStatusTargets, suggestedRows, dmSuggestedRows, searchSuggestedRows, groupSuggestedRows]);

    const { statusByRelay: configuredRelayConnectionStatusByRelay } = useRelayConnectionSummary(allConfiguredRelayStatusTargets, {
        enabled: true,
        ...(relayConnectionProbe ? { probe: relayConnectionProbe } : {}),
        ...(relayConnectionRefreshIntervalMs !== undefined ? { refreshIntervalMs: relayConnectionRefreshIntervalMs } : {}),
        maxConcurrentProbes: 3,
    });

    const checkingConfiguredRelays = useMemo(() => {
        return nip65ConfiguredRelayStatusTargets.reduce((count, relayUrl) => {
            const status = configuredRelayConnectionStatusByRelay[relayUrl];
            return count + (status === 'connected' || status === 'disconnected' ? 0 : 1);
        }, 0);
    }, [nip65ConfiguredRelayStatusTargets, configuredRelayConnectionStatusByRelay]);

    const checkingAllConfiguredRelays = useMemo(() => {
        return allConfiguredRelayStatusTargets.reduce((count, relayUrl) => {
            const status = configuredRelayConnectionStatusByRelay[relayUrl];
            return count + (status === 'connected' || status === 'disconnected' ? 0 : 1);
        }, 0);
    }, [allConfiguredRelayStatusTargets, configuredRelayConnectionStatusByRelay]);

    const { statusByRelay: suggestedRelayConnectionStatusByRelay } = useRelayConnectionSummary(suggestedRelayStatusTargets, {
        enabled: checkingAllConfiguredRelays === 0,
        ...(relayConnectionProbe ? { probe: relayConnectionProbe } : {}),
        refreshIntervalMs: 0,
        maxConcurrentProbes: 2,
    });

    const relayConnectionStatusByRelay = useMemo(() => {
        return {
            ...suggestedRelayConnectionStatusByRelay,
            ...configuredRelayConnectionStatusByRelay,
        };
    }, [suggestedRelayConnectionStatusByRelay, configuredRelayConnectionStatusByRelay]);

    const connectedConfiguredRelays = useMemo(() => {
        return nip65ConfiguredRelayStatusTargets.reduce(
            (count, relayUrl) => count + (configuredRelayConnectionStatusByRelay[relayUrl] === 'connected' ? 1 : 0),
            0
        );
    }, [nip65ConfiguredRelayStatusTargets, configuredRelayConnectionStatusByRelay]);

    const disconnectedConfiguredRelays = Math.max(
        0,
        nip65ConfiguredRelayStatusTargets.length - connectedConfiguredRelays - checkingConfiguredRelays
    );

    const relayInfoTargets = useMemo(() => buildRelayInfoTargets({
        relaySettings,
        normalizedSuggestedByType,
    }), [relaySettings, normalizedSuggestedByType]);

    const relayInfoByUrl = useRelayMetadataByUrlQuery({
        relayUrls: relayInfoTargets,
        enabled: true,
    });

    const onAddRelays = (): void => {
        const lines = newRelayInput
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (lines.length === 0) {
            setInvalidRelayInputs([]);
            return;
        }

        let nextState = relaySettings;
        const invalid: string[] = [];

        for (const line of lines) {
            const normalized = normalizeRelayInput(line);
            if (!normalized) {
                invalid.push(line);
                continue;
            }

            nextState = addRelay(nextState, normalized, 'nip65Both');
        }

        persistRelaySettings(nextState);
        setInvalidRelayInputs(invalid);
        setNewRelayInput('');
    };

    const onRemoveRelay = (relayUrl: string): void => {
        persistRelaySettings(setRelayNip65Access(relaySettings, relayUrl, { read: false, write: false }));
    };

    const onSetConfiguredRelayNip65Access = (relayUrl: string, access: { read: boolean; write: boolean }): void => {
        persistRelaySettings(setRelayNip65Access(relaySettings, relayUrl, access));
    };

    const onAddSuggestedRelay = (relayUrl: string, relayTypes: RelayType[]): void => {
        let nextState = relaySettings;
        for (const relayType of relayTypes) {
            nextState = addRelay(nextState, relayUrl, relayType);
        }
        persistRelaySettings(nextState);
    };

    const onAddAllSuggestedRelays = (): void => {
        let nextState = relaySettings;
        for (const row of suggestedRows) {
            for (const relayType of row.relayTypes) {
                nextState = addRelay(nextState, row.relayUrl, relayType);
            }
        }
        persistRelaySettings(nextState);
    };

    const onResetRelaysToDefault = (): void => {
        const bootstrap = getBootstrapRelays();
        persistRelaySettings({
            relays: relaySettings.relays,
            byType: {
                nip65Both: bootstrap,
                nip65Read: bootstrap,
                nip65Write: bootstrap,
                dmInbox: relaySettings.byType.dmInbox,
                search: relaySettings.byType.search,
                groups: relaySettings.byType.groups,
            },
        });
        setInvalidRelayInputs([]);
        setNewRelayInput('');
    };

    const onAddDmRelays = (): void => {
        const lines = newDmRelayInput
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (lines.length === 0) {
            setInvalidDmRelayInputs([]);
            return;
        }

        let nextState = relaySettings;
        const invalid: string[] = [];

        for (const line of lines) {
            const normalized = normalizeRelayInput(line);
            if (!normalized) {
                invalid.push(line);
                continue;
            }

            nextState = addRelay(nextState, normalized, 'dmInbox');
        }

        persistRelaySettings(nextState);
        setInvalidDmRelayInputs(invalid);
        setNewDmRelayInput('');
    };

    const onRemoveDmRelay = (relayUrl: string): void => {
        persistRelaySettings(removeRelay(relaySettings, relayUrl, 'dmInbox'));
    };

    const onAddSuggestedDmRelay = (relayUrl: string, relayTypes: RelayType[]): void => {
        let nextState = relaySettings;
        for (const relayType of relayTypes) {
            nextState = addRelay(nextState, relayUrl, relayType);
        }
        persistRelaySettings(nextState);
    };

    const onAddAllSuggestedDmRelays = (): void => {
        let nextState = relaySettings;
        for (const row of dmSuggestedRows) {
            for (const relayType of row.relayTypes) {
                nextState = addRelay(nextState, row.relayUrl, relayType);
            }
        }
        persistRelaySettings(nextState);
    };

    const onResetDmRelaysToDefault = (): void => {
        persistRelaySettings({
            relays: relaySettings.relays,
            byType: {
                ...relaySettings.byType,
                dmInbox: getDefaultDmInboxRelays(),
            },
        });
        setInvalidDmRelayInputs([]);
        setNewDmRelayInput('');
    };

    const onAddSearchRelays = (): void => {
        const lines = newSearchRelayInput
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (lines.length === 0) {
            setInvalidSearchRelayInputs([]);
            return;
        }

        let nextState = relaySettings;
        const invalid: string[] = [];

        for (const line of lines) {
            const normalized = normalizeRelayInput(line);
            if (!normalized) {
                invalid.push(line);
                continue;
            }

            nextState = addRelay(nextState, normalized, 'search');
        }

        persistRelaySettings(nextState);
        setInvalidSearchRelayInputs(invalid);
        setNewSearchRelayInput('');
    };

    const onRemoveSearchRelay = (relayUrl: string): void => {
        persistRelaySettings(removeRelay(relaySettings, relayUrl, 'search'));
    };

    const onAddSuggestedSearchRelay = (relayUrl: string, relayTypes: RelayType[]): void => {
        let nextState = relaySettings;
        for (const relayType of relayTypes) {
            nextState = addRelay(nextState, relayUrl, relayType);
        }
        persistRelaySettings(nextState);
    };

    const onAddAllSuggestedSearchRelays = (): void => {
        let nextState = relaySettings;
        for (const row of searchSuggestedRows) {
            for (const relayType of row.relayTypes) {
                nextState = addRelay(nextState, row.relayUrl, relayType);
            }
        }
        persistRelaySettings(nextState);
    };

    const onResetSearchRelaysToDefault = (): void => {
        persistRelaySettings({
            ...relaySettings,
            byType: {
                ...relaySettings.byType,
                search: [...DEFAULT_SEARCH_RELAYS],
            },
        });
        setInvalidSearchRelayInputs([]);
        setNewSearchRelayInput('');
    };

    const onAddGroupRelays = (): void => {
        const lines = newGroupRelayInput
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (lines.length === 0) {
            setInvalidGroupRelayInputs([]);
            return;
        }

        let nextState = relaySettings;
        const invalid: string[] = [];

        for (const line of lines) {
            const normalized = normalizeRelayInput(line);
            if (!normalized) {
                invalid.push(line);
                continue;
            }

            nextState = addRelay(nextState, normalized, 'groups');
        }

        persistRelaySettings(nextState);
        setInvalidGroupRelayInputs(invalid);
        setNewGroupRelayInput('');
    };

    const onRemoveGroupRelay = (relayUrl: string): void => {
        persistRelaySettings(removeRelay(relaySettings, relayUrl, 'groups'));
    };

    const onAddSuggestedGroupRelay = (relayUrl: string, relayTypes: RelayType[]): void => {
        let nextState = relaySettings;
        for (const relayType of relayTypes) {
            nextState = addRelay(nextState, relayUrl, relayType);
        }
        persistRelaySettings(nextState);
    };

    const onAddAllSuggestedGroupRelays = (): void => {
        let nextState = relaySettings;
        for (const row of groupSuggestedRows) {
            for (const relayType of row.relayTypes) {
                nextState = addRelay(nextState, row.relayUrl, relayType);
            }
        }
        persistRelaySettings(nextState);
    };

    const onResetGroupRelaysToDefault = (): void => {
        persistRelaySettings({
            ...relaySettings,
            byType: {
                ...relaySettings.byType,
                groups: [],
            },
        });
        setInvalidGroupRelayInputs([]);
        setNewGroupRelayInput('');
    };

    const onOpenRelayActionsMenu = (event: MouseEvent<HTMLButtonElement>): void => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
        }));
    };

    return {
        configuredRows,
        suggestedRows,
        dmConfiguredRows,
        dmSuggestedRows,
        searchConfiguredRows,
        searchSuggestedRows,
        groupConfiguredRows,
        groupSuggestedRows,
        connectedConfiguredRelays,
        disconnectedConfiguredRelays,
        relayInfoByUrl,
        configuredRelayConnectionStatusByRelay,
        relayConnectionStatusByRelay,
        relayTypeLabels: RELAY_TYPE_LABELS,
        newRelayInput,
        newDmRelayInput,
        newSearchRelayInput,
        newGroupRelayInput,
        invalidRelayInputs,
        invalidDmRelayInputs,
        invalidSearchRelayInputs,
        invalidGroupRelayInputs,
        onNewRelayInputChange: setNewRelayInput,
        onNewDmRelayInputChange: setNewDmRelayInput,
        onNewSearchRelayInputChange: setNewSearchRelayInput,
        onNewGroupRelayInputChange: setNewGroupRelayInput,
        onAddRelays,
        onRemoveRelay,
        onSetConfiguredRelayNip65Access,
        onAddSuggestedRelay,
        onAddAllSuggestedRelays,
        onResetRelaysToDefault,
        onAddDmRelays,
        onRemoveDmRelay,
        onAddSuggestedDmRelay,
        onAddAllSuggestedDmRelays,
        onResetDmRelaysToDefault,
        onAddSearchRelays,
        onRemoveSearchRelay,
        onAddSuggestedSearchRelay,
        onAddAllSuggestedSearchRelays,
        onResetSearchRelaysToDefault,
        onAddGroupRelays,
        onRemoveGroupRelay,
        onAddSuggestedGroupRelay,
        onAddAllSuggestedGroupRelays,
        onResetGroupRelaysToDefault,
        onOpenRelayActionsMenu,
        describeRelay,
        relayAvatarFallback,
        relayConnectionBadge,
    };
}
