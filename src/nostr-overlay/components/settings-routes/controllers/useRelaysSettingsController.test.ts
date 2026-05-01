import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
    DEFAULT_GROUP_RELAYS,
    getDefaultDmInboxRelays,
    RELAY_SETTINGS_STORAGE_KEY,
    saveRelaySettings,
    type RelaySettingsByType,
    type RelaySettingsState,
} from '../../../../nostr/relay-settings';
import { buildStorageScopeKeys } from '../../../../nostr/storage-scope';
import { useRelaysSettingsController, type RelaysSettingsController } from './useRelaysSettingsController';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

interface ControllerHarnessProps {
    ownerPubkey?: string;
    suggestedRelays?: string[];
    suggestedRelaysByType?: Partial<RelaySettingsByType>;
    onRelaySettingsChange?: (nextState: RelaySettingsState) => void;
}

type RelayConnectionSummaryCall = {
    relayUrls: string[];
    options?: {
        enabled?: boolean;
        maxConcurrentProbes?: number;
        refreshIntervalMs?: number;
    };
};

const relayConnectionSummaryCalls: RelayConnectionSummaryCall[] = [];
const relayMetadataCalls: string[][] = [];
const relayStatuses = new Map<string, 'connected' | 'disconnected' | 'checking'>();

vi.mock('../../../hooks/useRelayConnectionSummary', () => ({
    useRelayConnectionSummary: (relayUrls: string[], options?: RelayConnectionSummaryCall['options']) => {
        relayConnectionSummaryCalls.push({
            relayUrls: [...relayUrls],
            ...(options ? { options } : {}),
        });
        return {
            statusByRelay: Object.fromEntries(relayUrls.map((relayUrl) => [relayUrl, relayStatuses.get(relayUrl) ?? 'checking'])),
            totalRelays: relayUrls.length,
            connectedRelays: relayUrls.filter((relayUrl) => relayStatuses.get(relayUrl) === 'connected').length,
            disconnectedRelays: relayUrls.filter((relayUrl) => relayStatuses.get(relayUrl) === 'disconnected').length,
            checkingRelays: relayUrls.filter((relayUrl) => (relayStatuses.get(relayUrl) ?? 'checking') === 'checking').length,
        };
    },
}));

vi.mock('../../../query/relay-metadata.query', () => ({
    useRelayMetadataByUrlQuery: ({ relayUrls }: { relayUrls: string[] }) => {
        relayMetadataCalls.push([...relayUrls]);
        return {};
    },
}));

let mounted: RenderResult[] = [];
let latestController: RelaysSettingsController | null = null;

function ControllerHarness(props: ControllerHarnessProps) {
    latestController = useRelaysSettingsController(props);
    return null;
}

async function renderController(props: ControllerHarnessProps = {}): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(createElement(ControllerHarness, props));
    });

    const rendered = { container, root };
    mounted.push(rendered);
    return rendered;
}

function getController(): RelaysSettingsController {
    if (!latestController) {
        throw new Error('Controller was not rendered');
    }

    return latestController;
}

function seedRelaySettings(state: RelaySettingsState, ownerPubkey?: string): RelaySettingsState {
    return saveRelaySettings(state, ownerPubkey ? { ownerPubkey } : undefined);
}

function seedScopedRelaySettings(rawState: unknown, ownerPubkey: string): void {
    const key = buildStorageScopeKeys({ baseKey: RELAY_SETTINGS_STORAGE_KEY, ownerPubkey }).scopedKey;
    window.localStorage.setItem(key, JSON.stringify(rawState));
}

function lastConfiguredStatusTargets(): string[] {
    const call = [...relayConnectionSummaryCalls].reverse().find((entry) => entry.options?.maxConcurrentProbes === 3);
    return call?.relayUrls ?? [];
}

function lastSuggestedStatusTargets(): string[] {
    const call = [...relayConnectionSummaryCalls].reverse().find((entry) => entry.options?.maxConcurrentProbes === 2);
    return call?.relayUrls ?? [];
}

function lastSuggestedProbeEnabled(): boolean | undefined {
    const call = [...relayConnectionSummaryCalls].reverse().find((entry) => entry.options?.maxConcurrentProbes === 2);
    return call?.options?.enabled;
}

function lastRelayInfoTargets(): string[] {
    return relayMetadataCalls[relayMetadataCalls.length - 1] ?? [];
}

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    window.localStorage.clear();
    relayConnectionSummaryCalls.length = 0;
    relayMetadataCalls.length = 0;
    relayStatuses.clear();
    latestController = null;
});

afterEach(async () => {
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

describe('useRelaysSettingsController', () => {
    test('shows default DM rows immediately when no local payload exists', async () => {
        await renderController();

        expect(getController().dmConfiguredRows.map(({ relayUrl }) => relayUrl)).toEqual(getDefaultDmInboxRelays());
    });

    test('keeps DM rows empty when persisted payload stores dmInbox as empty', async () => {
        const ownerPubkey = 'a'.repeat(64);
        seedScopedRelaySettings({
            relays: ['wss://relay.main.example'],
            byType: {
                nip65Both: ['wss://relay.main.example'],
                nip65Read: [],
                nip65Write: [],
                dmInbox: [],
                search: [],
                groups: [],
            },
        }, ownerPubkey);

        await renderController({ ownerPubkey });

        expect(getController().dmConfiguredRows).toEqual([]);
    });

    test('partitions configured and suggested rows by section', async () => {
        seedRelaySettings({
            relays: ['wss://relay.main.example', 'wss://relay.dm-only.example', 'wss://relay.shared.example'],
            byType: {
                nip65Both: ['wss://relay.main.example'],
                nip65Read: [],
                nip65Write: ['wss://relay.shared.example'],
                dmInbox: ['wss://relay.dm-only.example', 'wss://relay.shared.example'],
                search: ['wss://search.saved.example'],
                groups: [],
            },
        });

        await renderController({
            suggestedRelaysByType: {
                nip65Read: ['wss://relay.suggested-main.example'],
                dmInbox: ['wss://relay.suggested-dm.example', 'wss://relay.suggested-shared.example'],
                nip65Write: ['wss://relay.suggested-shared.example'],
                search: ['wss://search.suggested.example', 'wss://relay.suggested-dm.example'],
            },
        });

        expect(getController().configuredRows.map(({ relayUrl }) => relayUrl)).toEqual([
            'wss://relay.main.example',
            'wss://relay.shared.example',
        ]);
        expect(getController().dmConfiguredRows.map(({ relayUrl }) => relayUrl)).toEqual([
            'wss://relay.dm-only.example',
            'wss://relay.shared.example',
        ]);
        expect(getController().suggestedRows.map(({ relayUrl }) => relayUrl)).toEqual([
            'wss://relay.suggested-main.example',
            'wss://relay.suggested-shared.example',
        ]);
        expect(getController().dmSuggestedRows.map(({ relayUrl }) => relayUrl)).toEqual([
            'wss://relay.suggested-dm.example',
            'wss://relay.suggested-shared.example',
        ]);
    });

    test('partitions configured and suggested group relays into the group section', async () => {
        seedRelaySettings({
            relays: ['wss://relay.main.example', 'wss://relay.group.example'],
            byType: {
                nip65Both: ['wss://relay.main.example'],
                nip65Read: [],
                nip65Write: [],
                dmInbox: [],
                search: [],
                groups: ['wss://relay.group.example'],
            },
        });

        await renderController({
            suggestedRelaysByType: {
                groups: ['wss://relay.group.example', 'wss://relay.group-suggested.example'],
            },
        });

        expect(getController().configuredRows.map(({ relayUrl }) => relayUrl)).toEqual(['wss://relay.main.example']);
        expect(getController().groupConfiguredRows.map(({ relayUrl }) => relayUrl)).toEqual(['wss://relay.group.example']);
        expect(getController().groupSuggestedRows.map(({ relayUrl }) => relayUrl)).toEqual(['wss://relay.group-suggested.example']);
    });

    test('shows default suggested group relays without configuring them automatically', async () => {
        await renderController({ suggestedRelaysByType: { groups: [] } });

        expect(getController().groupConfiguredRows).toEqual([]);
        expect(getController().groupSuggestedRows.map(({ relayUrl }) => relayUrl)).toEqual(
            [...DEFAULT_GROUP_RELAYS].sort((left, right) => left.localeCompare(right))
        );
    });

    test('hides suggested read and write rows when a relay is already configured as nip65Both', async () => {
        seedRelaySettings({
            relays: ['wss://relay.covered.example'],
            byType: {
                nip65Both: ['wss://relay.covered.example'],
                nip65Read: [],
                nip65Write: [],
                dmInbox: [],
                search: [],
                groups: [],
            },
        });

        await renderController({
            suggestedRelaysByType: {
                nip65Read: ['wss://relay.covered.example'],
                nip65Write: ['wss://relay.covered.example'],
            },
        });

        expect(getController().suggestedRows.map(({ relayUrl }) => relayUrl)).not.toContain('wss://relay.covered.example');
    });

    test('hides suggested nip65Both rows when a relay is already configured as split read and write', async () => {
        seedRelaySettings({
            relays: ['wss://relay.split.example'],
            byType: {
                nip65Both: [],
                nip65Read: ['wss://relay.split.example'],
                nip65Write: ['wss://relay.split.example'],
                dmInbox: [],
                search: [],
                groups: [],
            },
        });

        await renderController({
            suggestedRelaysByType: {
                nip65Both: ['wss://relay.split.example'],
            },
        });

        expect(getController().suggestedRows.map(({ relayUrl }) => relayUrl)).not.toContain('wss://relay.split.example');
    });

    test('rewrites a configured relay into read-only NIP-65 state', async () => {
        seedRelaySettings({
            relays: ['wss://relay.access.example'],
            byType: {
                nip65Both: ['wss://relay.access.example'],
                nip65Read: [],
                nip65Write: [],
                dmInbox: [],
                search: [],
                groups: [],
            },
        });

        await renderController();

        await act(async () => {
            getController().onSetConfiguredRelayNip65Access('wss://relay.access.example', { read: true, write: false });
        });

        expect(getController().configuredRows).toEqual([
            {
                relayUrl: 'wss://relay.access.example',
                relayTypes: ['nip65Read'],
                primaryRelayType: 'nip65Read',
            },
        ]);
    });

    test('resets DM relays to the default inbox set', async () => {
        seedRelaySettings({
            relays: ['wss://relay.custom-dm.example'],
            byType: {
                nip65Both: [],
                nip65Read: [],
                nip65Write: [],
                dmInbox: ['wss://relay.custom-dm.example'],
                search: [],
                groups: [],
            },
        });

        await renderController();

        await act(async () => {
            getController().onResetDmRelaysToDefault();
        });

        expect(getController().dmConfiguredRows.map(({ relayUrl }) => relayUrl)).toEqual(getDefaultDmInboxRelays());
        expect(getController().configuredRows).toEqual([]);
        expect(getController().searchConfiguredRows).toEqual([]);
    });

    test('removing a main relay clears only NIP-65 membership and preserves dmInbox membership', async () => {
        seedRelaySettings({
            relays: ['wss://relay.shared.example'],
            byType: {
                nip65Both: ['wss://relay.shared.example'],
                nip65Read: [],
                nip65Write: [],
                dmInbox: ['wss://relay.shared.example'],
                search: [],
                groups: [],
            },
        });

        await renderController();

        await act(async () => {
            getController().onRemoveRelay('wss://relay.shared.example');
        });

        expect(getController().configuredRows).toEqual([]);
        expect(getController().dmConfiguredRows).toEqual([
            {
                relayUrl: 'wss://relay.shared.example',
                relayTypes: ['dmInbox'],
                primaryRelayType: 'dmInbox',
            },
        ]);
    });

    test('resetting main relays restores NIP-65 defaults and preserves DM and search rows', async () => {
        seedRelaySettings({
            relays: ['wss://relay.custom-main.example', 'wss://relay.custom-dm.example'],
            byType: {
                nip65Both: ['wss://relay.custom-main.example'],
                nip65Read: [],
                nip65Write: [],
                dmInbox: ['wss://relay.custom-dm.example'],
                search: ['wss://search.custom.example'],
                groups: [],
            },
        });

        await renderController();

        await act(async () => {
            getController().onResetRelaysToDefault();
        });

        expect(getController().configuredRows.length).toBeGreaterThan(0);
        expect(getController().dmConfiguredRows.map(({ relayUrl }) => relayUrl)).toEqual(['wss://relay.custom-dm.example']);
        expect(getController().searchConfiguredRows.map(({ relayUrl }) => relayUrl)).toEqual(['wss://search.custom.example']);
    });

    test('search handlers mutate only the search section', async () => {
        seedRelaySettings({
            relays: ['wss://relay.main.example', 'wss://relay.dm.example'],
            byType: {
                nip65Both: ['wss://relay.main.example'],
                nip65Read: [],
                nip65Write: [],
                dmInbox: ['wss://relay.dm.example'],
                search: ['wss://search.saved.example'],
                groups: [],
            },
        });

        await renderController();

        await act(async () => {
            getController().onNewSearchRelayInputChange('wss://search.added.example');
        });
        await act(async () => {
            getController().onAddSearchRelays();
        });
        await act(async () => {
            getController().onRemoveSearchRelay('wss://search.saved.example');
        });

        expect(getController().configuredRows.map(({ relayUrl }) => relayUrl)).toEqual(['wss://relay.main.example']);
        expect(getController().dmConfiguredRows.map(({ relayUrl }) => relayUrl)).toEqual(['wss://relay.dm.example']);
        expect(getController().searchConfiguredRows.map(({ relayUrl }) => relayUrl)).toEqual(['wss://search.added.example']);
    });

    test('includes DM rows in metadata and configured status target derivation', async () => {
        seedRelaySettings({
            relays: ['wss://relay.main.example', 'wss://relay.dm-only.example'],
            byType: {
                nip65Both: ['wss://relay.main.example'],
                nip65Read: [],
                nip65Write: [],
                dmInbox: ['wss://relay.dm-only.example'],
                search: ['wss://search.saved.example'],
                groups: [],
            },
        });

        await renderController({
            suggestedRelaysByType: {
                dmInbox: ['wss://relay.dm-suggested.example'],
                search: ['wss://search.suggested.example'],
            },
        });

        expect(lastConfiguredStatusTargets()).toEqual([
            'wss://relay.main.example',
            'wss://relay.dm-only.example',
            'wss://search.saved.example',
        ]);
        expect(lastSuggestedStatusTargets()).toEqual(expect.arrayContaining([
            'wss://relay.dm-suggested.example',
            'wss://search.suggested.example',
            ...DEFAULT_GROUP_RELAYS,
        ]));
        expect(lastRelayInfoTargets()).toEqual(expect.arrayContaining([
            'wss://relay.main.example',
            'wss://relay.dm-only.example',
            'wss://search.saved.example',
            'wss://relay.dm-suggested.example',
            'wss://search.suggested.example',
            ...DEFAULT_GROUP_RELAYS,
        ]));
    });

    test('includes group relays in metadata and status target derivation', async () => {
        seedRelaySettings({
            relays: ['wss://relay.main.example', 'wss://relay.group-configured.example'],
            byType: {
                nip65Both: ['wss://relay.main.example'],
                nip65Read: [],
                nip65Write: [],
                dmInbox: [],
                search: [],
                groups: ['wss://relay.group-configured.example'],
            },
        });

        await renderController({
            suggestedRelaysByType: {
                groups: ['wss://relay.group-suggested.example'],
            },
        });

        expect(lastConfiguredStatusTargets()).toEqual([
            'wss://relay.main.example',
            'wss://relay.group-configured.example',
        ]);
        expect(lastSuggestedStatusTargets()).toEqual(expect.arrayContaining(['wss://relay.group-suggested.example']));
        expect(lastRelayInfoTargets()).toEqual(expect.arrayContaining([
            'wss://relay.main.example',
            'wss://relay.group-configured.example',
            'wss://relay.group-suggested.example',
        ]));
    });

    test('keeps suggested probing disabled until all configured relays settle', async () => {
        relayStatuses.set('wss://relay.main.example', 'connected');
        relayStatuses.set('wss://relay.dm-only.example', 'checking');
        relayStatuses.set('wss://search.saved.example', 'checking');

        seedRelaySettings({
            relays: ['wss://relay.main.example', 'wss://relay.dm-only.example'],
            byType: {
                nip65Both: ['wss://relay.main.example'],
                nip65Read: [],
                nip65Write: [],
                dmInbox: ['wss://relay.dm-only.example'],
                search: ['wss://search.saved.example'],
                groups: [],
            },
        });

        await renderController({
            suggestedRelaysByType: {
                dmInbox: ['wss://relay.dm-suggested.example'],
            },
        });

        expect(lastSuggestedStatusTargets()).toEqual(expect.arrayContaining(['wss://relay.dm-suggested.example']));
        expect(lastSuggestedProbeEnabled()).toBe(false);
    });

    test('does not let DM-only relays affect configured connection summary badges', async () => {
        relayStatuses.set('wss://relay.main.example', 'connected');
        relayStatuses.set('wss://relay.dm-only.example', 'disconnected');
        relayStatuses.set('wss://search.saved.example', 'disconnected');

        seedRelaySettings({
            relays: ['wss://relay.main.example', 'wss://relay.dm-only.example'],
            byType: {
                nip65Both: ['wss://relay.main.example'],
                nip65Read: [],
                nip65Write: [],
                dmInbox: ['wss://relay.dm-only.example'],
                search: ['wss://search.saved.example'],
                groups: [],
            },
        });

        await renderController();

        expect(getController().connectedConfiguredRelays).toBe(1);
        expect(getController().disconnectedConfiguredRelays).toBe(0);
    });
});
