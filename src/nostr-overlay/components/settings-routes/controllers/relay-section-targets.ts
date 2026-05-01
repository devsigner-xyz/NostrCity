import type { RelaySettingsByType, RelaySettingsState } from '../../../../nostr/relay-settings';
import type { RelayRow } from '../../settings-pages/types';

function uniqueRelayUrls(rows: RelayRow[]): string[] {
    return [...new Set(rows.map(({ relayUrl }) => relayUrl))];
}

function uniqueStrings(values: string[]): string[] {
    return [...new Set(values)];
}

export function buildConfiguredRelayStatusTargets(input: {
    configuredRows: RelayRow[];
    dmConfiguredRows: RelayRow[];
    searchConfiguredRows: RelayRow[];
    groupConfiguredRows: RelayRow[];
}): {
    nip65ConfiguredRelayStatusTargets: string[];
    dmConfiguredRelayStatusTargets: string[];
    searchConfiguredRelayStatusTargets: string[];
    groupConfiguredRelayStatusTargets: string[];
    allConfiguredRelayStatusTargets: string[];
} {
    const nip65ConfiguredRelayStatusTargets = uniqueRelayUrls(input.configuredRows);
    const dmConfiguredRelayStatusTargets = uniqueRelayUrls(input.dmConfiguredRows);
    const searchConfiguredRelayStatusTargets = uniqueRelayUrls(input.searchConfiguredRows);
    const groupConfiguredRelayStatusTargets = uniqueRelayUrls(input.groupConfiguredRows);

    return {
        nip65ConfiguredRelayStatusTargets,
        dmConfiguredRelayStatusTargets,
        searchConfiguredRelayStatusTargets,
        groupConfiguredRelayStatusTargets,
        allConfiguredRelayStatusTargets: uniqueStrings([
            ...nip65ConfiguredRelayStatusTargets,
            ...dmConfiguredRelayStatusTargets,
            ...searchConfiguredRelayStatusTargets,
            ...groupConfiguredRelayStatusTargets,
        ]),
    };
}

export function buildSuggestedRelayStatusTargets(input: {
    configuredRelayStatusTargets: string[];
    suggestedRows: RelayRow[];
    dmSuggestedRows: RelayRow[];
    searchSuggestedRows: RelayRow[];
    groupSuggestedRows: RelayRow[];
}): string[] {
    const configured = new Set(input.configuredRelayStatusTargets);

    return uniqueStrings([
        ...input.suggestedRows,
        ...input.dmSuggestedRows,
        ...input.searchSuggestedRows,
        ...input.groupSuggestedRows,
    ].map(({ relayUrl }) => relayUrl).filter((relayUrl) => !configured.has(relayUrl)));
}

export function buildRelayInfoTargets(input: {
    relaySettings: RelaySettingsState;
    normalizedSuggestedByType: RelaySettingsByType;
}): string[] {
    const { relaySettings, normalizedSuggestedByType } = input;

    return uniqueStrings([
        ...relaySettings.relays,
        ...relaySettings.byType.search,
        ...relaySettings.byType.groups,
        ...normalizedSuggestedByType.nip65Both,
        ...normalizedSuggestedByType.nip65Read,
        ...normalizedSuggestedByType.nip65Write,
        ...normalizedSuggestedByType.dmInbox,
        ...normalizedSuggestedByType.search,
        ...normalizedSuggestedByType.groups,
    ]);
}
