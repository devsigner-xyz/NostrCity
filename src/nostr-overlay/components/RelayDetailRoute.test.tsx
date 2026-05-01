import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { RelayDetailRoute } from './RelayDetailRoute';

type RelayDetailMockRelayType = 'nip65Both' | 'nip65Read' | 'nip65Write' | 'dmInbox' | 'search' | 'groups';
type RelayDetailMockState = {
    selectedRelay: { relayUrl: string; source: 'configured' | 'suggested'; relayType: RelayDetailMockRelayType };
    activeRelayTypes: RelayDetailMockRelayType[];
    availableGroupsState: {
        status: 'idle' | 'loading' | 'ready' | 'error';
        groups: Array<{ relay: string; id: string; name?: string; description?: string }>;
    };
};

const relayDetailControllerMock = vi.hoisted((): { state: RelayDetailMockState } => ({
    state: {
        selectedRelay: { relayUrl: 'wss://relay.one', source: 'configured', relayType: 'nip65Both' },
        activeRelayTypes: ['nip65Both'],
        availableGroupsState: { status: 'idle' as const, groups: [] },
    },
}));

vi.mock('./settings-routes/controllers/useRelayDetailController', () => ({
    useRelayDetailController: () => ({
        selectedRelay: relayDetailControllerMock.state.selectedRelay,
        activeRelayTypes: relayDetailControllerMock.state.activeRelayTypes,
        availableGroupsState: relayDetailControllerMock.state.availableGroupsState,
        selectedRelayDetails: { relayUrl: 'wss://relay.one', source: 'configured', host: 'relay.one' },
        selectedRelayDocument: undefined,
        selectedRelayInfo: undefined,
        selectedRelayAdminIdentity: null,
        selectedRelayConnectionStatus: 'connected',
        relayHasNip11Metadata: true,
        relayEventLimit: undefined,
        relayHasFees: false,
        copiedRelayIdentityKey: null,
        relayTypeLabels: {
            nip65Both: 'NIP-65 read+write',
            nip65Read: 'NIP-65 read',
            nip65Write: 'NIP-65 write',
            dmInbox: 'NIP-17 DM inbox',
            search: 'NIP-50 search',
            groups: 'NIP-29',
        },
        relayAvatarFallback: () => 'RL',
        relayConnectionBadge: () => <span>Online</span>,
        formatRelayFee: () => '1 sat',
        onCopyRelayIdentity: vi.fn(async () => {}),
    }),
}));

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    return { container, root };
}

let mounted: RenderResult[] = [];

function LocationProbe() {
    const location = useLocation();
    return <span data-testid="location-probe">{`${location.pathname}${location.search}`}</span>;
}

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    window.localStorage.clear();
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
    relayDetailControllerMock.state = {
        selectedRelay: { relayUrl: 'wss://relay.one', source: 'configured', relayType: 'nip65Both' },
        activeRelayTypes: ['nip65Both'],
        availableGroupsState: { status: 'idle', groups: [] },
    };
});

describe('RelayDetailRoute', () => {
    test('renders english route chrome when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(
            <MemoryRouter initialEntries={['/relay-detail?url=wss%3A%2F%2Frelay.one&source=configured&type=nip65Both']}>
                <Routes>
                    <Route path="/relay-detail" element={<RelayDetailRoute />} />
                    <Route path="/relays" element={<div>Relays fallback</div>} />
                </Routes>
            </MemoryRouter>
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Relay detail');
        expect(text).toContain('Metadata and technical capabilities of the selected relay.');
        expect(text).toContain('Back');
    });

    test('opens the clicked advertised group with relay and group query parameters', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        relayDetailControllerMock.state = {
            selectedRelay: { relayUrl: 'wss://groups.example', source: 'configured', relayType: 'groups' },
            activeRelayTypes: ['groups'],
            availableGroupsState: {
                status: 'ready',
                groups: [{ relay: 'wss://groups.example', id: 'maps', name: 'Map makers' }],
            },
        };

        const rendered = await renderElement(
            <MemoryRouter initialEntries={['/relay-detail?url=wss%3A%2F%2Fgroups.example&source=configured&type=groups']}>
                <Routes>
                    <Route path="/relay-detail" element={<RelayDetailRoute />} />
                    <Route path="/groups" element={<div data-testid="groups-route"><LocationProbe /></div>} />
                </Routes>
            </MemoryRouter>
        );
        mounted.push(rendered);

        const openButton = rendered.container.querySelector('button[aria-label="Open Map makers group"]') as HTMLButtonElement;
        await act(async () => {
            openButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.querySelector('[data-testid="groups-route"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="location-probe"]')?.textContent).toBe('/groups?relay=wss%3A%2F%2Fgroups.example&group=maps');
    });
});
