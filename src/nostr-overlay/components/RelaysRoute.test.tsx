import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { RelaysRoute } from './RelaysRoute';

vi.mock('./settings-routes/controllers/useRelaysSettingsController', () => ({
    useRelaysSettingsController: () => ({
        configuredRows: [],
        suggestedRows: [],
        dmConfiguredRows: [],
        dmSuggestedRows: [],
        searchConfiguredRows: [],
        searchSuggestedRows: [],
        groupConfiguredRows: [],
        groupSuggestedRows: [],
        connectedConfiguredRelays: 0,
        disconnectedConfiguredRelays: 0,
        relayInfoByUrl: {},
        configuredRelayConnectionStatusByRelay: {},
        relayConnectionStatusByRelay: {},
        relayTypeLabels: {
            nip65Both: 'NIP-65 read+write',
            nip65Read: 'NIP-65 read',
            nip65Write: 'NIP-65 write',
            dmInbox: 'NIP-17 DM inbox',
            search: 'NIP-50 search',
            groups: 'NIP-29',
        },
        newRelayInput: '',
        newDmRelayInput: '',
        newSearchRelayInput: '',
        newGroupRelayInput: '',
        invalidRelayInputs: [],
        invalidDmRelayInputs: [],
        invalidSearchRelayInputs: [],
        invalidGroupRelayInputs: [],
        onNewRelayInputChange: vi.fn(),
        onNewDmRelayInputChange: vi.fn(),
        onNewSearchRelayInputChange: vi.fn(),
        onNewGroupRelayInputChange: vi.fn(),
        onAddRelays: vi.fn(),
        onRemoveRelay: vi.fn(),
        onSetConfiguredRelayNip65Access: vi.fn(),
        onAddSuggestedRelay: vi.fn(),
        onAddAllSuggestedRelays: vi.fn(),
        onResetRelaysToDefault: vi.fn(),
        onAddDmRelays: vi.fn(),
        onRemoveDmRelay: vi.fn(),
        onAddSuggestedDmRelay: vi.fn(),
        onAddAllSuggestedDmRelays: vi.fn(),
        onResetDmRelaysToDefault: vi.fn(),
        onAddSearchRelays: vi.fn(),
        onRemoveSearchRelay: vi.fn(),
        onAddSuggestedSearchRelay: vi.fn(),
        onAddAllSuggestedSearchRelays: vi.fn(),
        onResetSearchRelaysToDefault: vi.fn(),
        onAddGroupRelays: vi.fn(),
        onRemoveGroupRelay: vi.fn(),
        onAddSuggestedGroupRelay: vi.fn(),
        onAddAllSuggestedGroupRelays: vi.fn(),
        onResetGroupRelaysToDefault: vi.fn(),
        onOpenRelayActionsMenu: vi.fn(),
        describeRelay: vi.fn(() => 'relay.one'),
        relayAvatarFallback: vi.fn(() => 'RL'),
        relayConnectionBadge: vi.fn(() => null),
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
});

describe('RelaysRoute', () => {
    test('renders english route chrome when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(
            <MemoryRouter initialEntries={['/relays']}>
                <Routes>
                    <Route path="/relays" element={<RelaysRoute />} />
                </Routes>
            </MemoryRouter>
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Relays');
        expect(text).toContain('Configured relays');
        expect(text).toContain('Configured relays, suggested relays, and Nostr connection status.');
    });

    test('renders route content inside a height-constrained overlay body', async () => {
        const rendered = await renderElement(
            <MemoryRouter initialEntries={['/relays']}>
                <Routes>
                    <Route path="/relays" element={<RelaysRoute />} />
                </Routes>
            </MemoryRouter>
        );
        mounted.push(rendered);

        const body = rendered.container.querySelector('[data-slot="overlay-surface-body"]') as HTMLElement | null;
        const page = rendered.container.querySelector('.nostr-settings-page.nostr-routed-surface-panel') as HTMLElement | null;
        expect(body).not.toBeNull();
        expect(body?.className).toContain('min-h-0');
        expect(body?.className).toContain('flex-1');
        expect(page?.parentElement?.className || '').toContain('min-h-0');
        expect(page?.parentElement?.className || '').toContain('flex-1');
    });
});
