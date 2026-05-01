import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { saveRelaySettings, type RelaySettingsByType, type RelaySettingsState } from '../../../../nostr/relay-settings';
import { UI_SETTINGS_STORAGE_KEY } from '../../../../nostr/ui-settings';
import type { RelayGroupsState } from '../../../query/relay-groups.query';
import { SettingsRelayDetailPage } from '../../settings-pages/SettingsRelayDetailPage';
import { useRelayDetailController } from './useRelayDetailController';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

interface ControllerHarnessProps {
    ownerPubkey?: string;
    suggestedRelays?: string[];
    suggestedRelaysByType?: Partial<RelaySettingsByType>;
    params: {
        relayUrl: string;
        source: 'configured' | 'suggested';
        relayType: 'nip65Both' | 'nip65Read' | 'nip65Write' | 'dmInbox' | 'search' | 'groups';
    };
}

const relayGroupsQueryMock = vi.fn<(input: unknown) => RelayGroupsState>(() => ({ status: 'idle', groups: [] }));

vi.mock('../../../hooks/useRelayConnectionSummary', () => ({
    useRelayConnectionSummary: () => ({
        statusByRelay: {},
        totalRelays: 0,
        connectedRelays: 0,
        disconnectedRelays: 0,
        checkingRelays: 0,
    }),
}));

vi.mock('../../../query/relay-metadata.query', () => ({
    useRelayMetadataByUrlQuery: () => ({}),
}));

vi.mock('../../../query/relay-groups.query', () => ({
    useRelayGroupsByRelayQuery: (input: unknown) => relayGroupsQueryMock(input),
}));

let mounted: RenderResult[] = [];
let latestController: ReturnType<typeof useRelayDetailController> | null = null;

function ControllerHarness(props: ControllerHarnessProps) {
    latestController = useRelayDetailController(props);
    return null;
}

async function renderController(props: ControllerHarnessProps): Promise<RenderResult> {
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

function getController(): ReturnType<typeof useRelayDetailController> {
    if (!latestController) {
        throw new Error('Controller was not rendered');
    }

    return latestController;
}

function seedRelaySettings(state: RelaySettingsState, ownerPubkey?: string): RelaySettingsState {
    return saveRelaySettings(state, ownerPubkey ? { ownerPubkey } : undefined);
}

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    window.localStorage.clear();
    latestController = null;
    relayGroupsQueryMock.mockReset();
    relayGroupsQueryMock.mockReturnValue({ status: 'idle', groups: [] });
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

describe('useRelayDetailController', () => {
    test('compacts overlapping configured NIP-65 memberships into effective active uses', async () => {
        seedRelaySettings({
            relays: ['wss://relay.bootstrap.example'],
            byType: {
                nip65Both: ['wss://relay.bootstrap.example'],
                nip65Read: ['wss://relay.bootstrap.example'],
                nip65Write: ['wss://relay.bootstrap.example'],
                dmInbox: ['wss://relay.bootstrap.example'],
                search: ['wss://relay.bootstrap.example'],
                groups: [],
            },
        });

        await renderController({
            params: {
                relayUrl: 'wss://relay.bootstrap.example',
                source: 'configured',
                relayType: 'nip65Both',
            },
        });

        expect(getController().activeRelayTypes).toEqual(['nip65Both', 'dmInbox', 'search']);
    });

    test('compacts configured read and write overlap into effective nip65Both', async () => {
        seedRelaySettings({
            relays: ['wss://relay.overlap.example'],
            byType: {
                nip65Both: [],
                nip65Read: ['wss://relay.overlap.example'],
                nip65Write: ['wss://relay.overlap.example'],
                dmInbox: ['wss://relay.overlap.example'],
                search: [],
                groups: [],
            },
        });

        await renderController({
            params: {
                relayUrl: 'wss://relay.overlap.example',
                source: 'configured',
                relayType: 'nip65Read',
            },
        });

        expect(getController().activeRelayTypes).toEqual(['nip65Both', 'dmInbox']);
    });

    test('keeps suggested relay active uses based on route params', async () => {
        seedRelaySettings({
            relays: ['wss://relay.suggested.example'],
            byType: {
                nip65Both: ['wss://relay.suggested.example'],
                nip65Read: [],
                nip65Write: [],
                dmInbox: ['wss://relay.suggested.example'],
                search: [],
                groups: [],
            },
        });

        await renderController({
            suggestedRelaysByType: {
                search: ['wss://relay.suggested.example'],
            },
            params: {
                relayUrl: 'wss://relay.suggested.example',
                source: 'suggested',
                relayType: 'search',
            },
        });

        expect(getController().activeRelayTypes).toEqual(['search']);
    });

    test('loads available groups for configured group relays only', async () => {
        seedRelaySettings({
            relays: [],
            byType: {
                nip65Both: [],
                nip65Read: [],
                nip65Write: [],
                dmInbox: [],
                search: [],
                groups: ['wss://groups.example'],
            },
        });
        relayGroupsQueryMock.mockReturnValue({
            status: 'ready',
            groups: [{ relay: 'wss://groups.example', id: 'maps', name: 'Map makers' }],
        });

        await renderController({
            params: {
                relayUrl: 'wss://groups.example',
                source: 'configured',
                relayType: 'groups',
            },
        });

        expect(relayGroupsQueryMock).toHaveBeenCalledWith({
            relayUrl: 'wss://groups.example',
            enabled: true,
        });
        expect(getController().activeRelayTypes).toEqual(['groups']);
        expect(getController().availableGroupsState).toEqual({
            status: 'ready',
            groups: [{ relay: 'wss://groups.example', id: 'maps', name: 'Map makers' }],
        });
    });

    test('keeps available group discovery disabled for non-group relay detail pages', async () => {
        await renderController({
            params: {
                relayUrl: 'wss://relay.example',
                source: 'configured',
                relayType: 'nip65Both',
            },
        });

        expect(relayGroupsQueryMock).toHaveBeenCalledWith({
            relayUrl: 'wss://relay.example',
            enabled: false,
        });
    });

    test('renders available groups with empty and error states', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const openGroup = vi.fn();
        const baseProps = {
            selectedRelay: { relayUrl: 'wss://groups.example', source: 'configured' as const, relayType: 'groups' as const },
            activeRelayTypes: ['groups' as const],
            selectedRelayDetails: { relayUrl: 'wss://groups.example', source: 'configured' as const, host: 'groups.example' },
            selectedRelayAdminIdentity: null,
            selectedRelayConnectionStatus: undefined,
            relayHasNip11Metadata: true,
            relayHasFees: false,
            copiedRelayIdentityKey: null,
            relayTypeLabels: {
                nip65Both: 'NIP-65 read+write',
                nip65Read: 'NIP-65 read',
                nip65Write: 'NIP-65 write',
                dmInbox: 'NIP-17 DM inbox',
                search: 'NIP-50 search',
                groups: 'NIP-29 groups',
            },
            relayAvatarFallback: () => 'GR',
            relayConnectionBadge: () => createElement('span', null, 'Unknown'),
            formatRelayFee: () => '1 sat',
            onCopyRelayIdentity: vi.fn(async () => {}),
            onOpenGroup: openGroup,
        };
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        mounted.push({ container, root });

        await act(async () => {
            root.render(createElement(SettingsRelayDetailPage, {
                ...baseProps,
                availableGroupsState: {
                    status: 'ready' as const,
                    groups: [{ relay: 'wss://groups.example', id: 'maps', name: 'Map makers', description: 'Cities and transit.' }],
                },
            }));
        });
        expect(container.textContent).toContain('Available groups');
        expect(container.textContent).toContain('Map makers');
        expect(container.textContent).toContain('maps');
        expect(container.textContent).toContain('Cities and transit.');
        expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Open group')).toBe(true);

        await act(async () => {
            root.render(createElement(SettingsRelayDetailPage, {
                ...baseProps,
                availableGroupsState: { status: 'ready' as const, groups: [] },
            }));
        });
        expect(container.textContent).toContain('No groups are advertised by this relay yet.');

        await act(async () => {
            root.render(createElement(SettingsRelayDetailPage, {
                ...baseProps,
                availableGroupsState: { status: 'error' as const, groups: [] },
            }));
        });
        expect(container.textContent).toContain('Could not load available groups for this relay.');
    });
});
