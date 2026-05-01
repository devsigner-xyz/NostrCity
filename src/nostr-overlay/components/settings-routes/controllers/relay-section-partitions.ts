import type { RelaySettingsByType, RelaySettingsState } from '../../../../nostr/relay-settings';
import type { RelayRow } from '../../settings-pages/types';
import { buildRelayRowsByUrl } from './relays-shared';

export function buildConfiguredSectionRows(byType: RelaySettingsByType): {
    configuredRows: RelayRow[];
    dmConfiguredRows: RelayRow[];
    searchConfiguredRows: RelayRow[];
    groupConfiguredRows: RelayRow[];
} {
    return {
        configuredRows: buildRelayRowsByUrl({
            nip65Both: byType.nip65Both,
            nip65Read: byType.nip65Read,
            nip65Write: byType.nip65Write,
            dmInbox: [],
            search: [],
        }),
        dmConfiguredRows: buildRelayRowsByUrl({
            nip65Both: [],
            nip65Read: [],
            nip65Write: [],
            dmInbox: byType.dmInbox,
            search: [],
        }),
        searchConfiguredRows: buildRelayRowsByUrl({
            nip65Both: [],
            nip65Read: [],
            nip65Write: [],
            dmInbox: [],
            search: byType.search,
        }),
        groupConfiguredRows: buildRelayRowsByUrl({
            nip65Both: [],
            nip65Read: [],
            nip65Write: [],
            dmInbox: [],
            search: [],
            groups: byType.groups,
        }),
    };
}

export function buildSuggestedSectionRows(input: {
    relaySettings: RelaySettingsState;
    normalizedSuggestedByType: RelaySettingsByType;
}): {
    suggestedRows: RelayRow[];
    dmSuggestedRows: RelayRow[];
    searchSuggestedRows: RelayRow[];
    groupSuggestedRows: RelayRow[];
} {
    const { relaySettings, normalizedSuggestedByType } = input;
    const configuredNip65Read = new Set([
        ...relaySettings.byType.nip65Both,
        ...relaySettings.byType.nip65Read,
    ]);
    const configuredNip65Write = new Set([
        ...relaySettings.byType.nip65Both,
        ...relaySettings.byType.nip65Write,
    ]);

    return {
        suggestedRows: buildRelayRowsByUrl({
            nip65Both: normalizedSuggestedByType.nip65Both.filter((relayUrl) => !(configuredNip65Read.has(relayUrl) && configuredNip65Write.has(relayUrl))),
            nip65Read: normalizedSuggestedByType.nip65Read.filter((relayUrl) => !configuredNip65Read.has(relayUrl)),
            nip65Write: normalizedSuggestedByType.nip65Write.filter((relayUrl) => !configuredNip65Write.has(relayUrl)),
            dmInbox: [],
            search: [],
        }),
        dmSuggestedRows: buildRelayRowsByUrl({
            nip65Both: [],
            nip65Read: [],
            nip65Write: [],
            dmInbox: normalizedSuggestedByType.dmInbox.filter((relayUrl) => !relaySettings.byType.dmInbox.includes(relayUrl)),
            search: [],
        }),
        searchSuggestedRows: buildRelayRowsByUrl({
            nip65Both: [],
            nip65Read: [],
            nip65Write: [],
            dmInbox: [],
            search: normalizedSuggestedByType.search.filter((relayUrl) => !relaySettings.byType.search.includes(relayUrl)),
        }),
        groupSuggestedRows: buildRelayRowsByUrl({
            nip65Both: [],
            nip65Read: [],
            nip65Write: [],
            dmInbox: [],
            search: [],
            groups: normalizedSuggestedByType.groups.filter((relayUrl) => !relaySettings.byType.groups.includes(relayUrl)),
        }),
    };
}
