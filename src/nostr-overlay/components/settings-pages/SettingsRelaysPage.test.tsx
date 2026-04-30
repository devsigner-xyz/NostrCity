import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../../nostr/ui-settings';
import { Badge } from '@/components/ui/badge';
import { SettingsRelaysPage } from './SettingsRelaysPage';
import type { RelayDetails, RelayInformationDocument, RelayRow } from './types';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

function buildRelayRow(overrides: Partial<RelayRow> = {}): RelayRow {
    return {
        relayUrl: 'wss://relay.one',
        relayTypes: ['nip65Both'],
        primaryRelayType: 'nip65Both',
        ...overrides,
    };
}

function getCardByTitle(container: HTMLElement, title: string): HTMLElement {
    const titleElement = Array.from(container.querySelectorAll('[data-slot="card-title"]')).find(
        (element) => element.textContent?.trim() === title,
    );

    if (!titleElement) {
        throw new Error(`Card title not found: ${title}`);
    }

    const card = titleElement.closest('[data-slot="card"]');

    if (!card) {
        throw new Error(`Card not found for title: ${title}`);
    }

    return card as HTMLElement;
}

function getCardTitles(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('[data-slot="card-title"]'))
        .map((element) => element.textContent?.trim() ?? '')
        .filter((title) => title.length > 0);
}

function getTableHeaders(table: HTMLTableElement): string[] {
    return Array.from(table.querySelectorAll('thead th'))
        .map((element) => element.textContent?.trim() ?? '')
        .filter((label) => label.length > 0);
}

function getTableFromCard(card: HTMLElement): HTMLTableElement {
    const table = card.querySelector('table');

    if (!(table instanceof HTMLTableElement)) {
        throw new Error('Table not found in card');
    }

    return table;
}

function getTableByHeading(container: HTMLElement, heading: string): HTMLTableElement {
    const headingElement = Array.from(container.querySelectorAll('h3')).find((element) => element.textContent?.trim() === heading);

    if (!headingElement) {
        throw new Error(`Heading not found: ${heading}`);
    }

    const section = headingElement.closest('div');
    const table = section?.parentElement?.querySelector('table');

    if (!(table instanceof HTMLTableElement)) {
        throw new Error(`Table not found for heading: ${heading}`);
    }

    return table;
}

function getSwitch(container: HTMLElement, label: string): HTMLElement {
    const element = container.querySelector(`button[aria-label="${label}"]`);

    if (!(element instanceof HTMLElement)) {
        throw new Error(`Switch not found: ${label}`);
    }

    return element;
}

function getDropdownItem(label: string): HTMLElement {
    const item = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find(
        (element) => element.textContent?.trim() === label,
    );

    if (!(item instanceof HTMLElement)) {
        throw new Error(`Dropdown item not found: ${label}`);
    }

    return item;
}

async function clickElement(element: HTMLElement): Promise<void> {
    await act(async () => {
        element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

async function pointerDownElement(element: HTMLElement): Promise<void> {
    await act(async () => {
        element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    });
}

async function openDropdown(button: HTMLElement): Promise<void> {
    await pointerDownElement(button);
}

async function changeInputValue(input: HTMLInputElement, value: string): Promise<void> {
    await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        nativeSetter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
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
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

function buildProps() {
    const relayTypeLabels = {
        nip65Both: 'NIP-65 lectura+escritura',
        nip65Read: 'NIP-65 lectura',
        nip65Write: 'NIP-65 escritura',
        dmInbox: 'NIP-17 buzón DM',
        search: 'Búsqueda NIP-50',
    } as const;

    return {
        configuredRows: [buildRelayRow()],
        suggestedRows: [buildRelayRow({ relayUrl: 'wss://relay.two', relayTypes: ['nip65Read'], primaryRelayType: 'nip65Read' })],
        dmConfiguredRows: [buildRelayRow({ relayUrl: 'wss://relay.dm', relayTypes: ['dmInbox'], primaryRelayType: 'dmInbox' })],
        dmSuggestedRows: [buildRelayRow({ relayUrl: 'wss://relay.dm-suggested', relayTypes: ['dmInbox'], primaryRelayType: 'dmInbox' })],
        searchConfiguredRows: [buildRelayRow({ relayUrl: 'wss://search.nos.today', relayTypes: ['search'], primaryRelayType: 'search' })],
        searchSuggestedRows: [buildRelayRow({ relayUrl: 'wss://relay.noswhere.com', relayTypes: ['search'], primaryRelayType: 'search' })],
        connectedConfiguredRelays: 1,
        disconnectedConfiguredRelays: 0,
        relayInfoByUrl: {} as Record<string, { data?: RelayInformationDocument }>,
        configuredRelayConnectionStatusByRelay: {},
        relayConnectionStatusByRelay: {},
        relayTypeLabels,
        newRelayInput: '',
        newDmRelayInput: '',
        newSearchRelayInput: '',
        invalidRelayInputs: [],
        invalidDmRelayInputs: [],
        invalidSearchRelayInputs: [],
        onNewRelayInputChange: vi.fn(),
        onNewDmRelayInputChange: vi.fn(),
        onNewSearchRelayInputChange: vi.fn(),
        onAddRelays: vi.fn(),
        onOpenRelayDetails: vi.fn(),
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
        onOpenRelayActionsMenu: vi.fn(),
        describeRelay: vi.fn((relayUrl: string): RelayDetails => ({ relayUrl, source: 'configured', host: relayUrl.replace('wss://', '') })),
        relayAvatarFallback: vi.fn(() => 'RL'),
        relayConnectionBadge: vi.fn(() => <Badge variant="outline">Online</Badge>),
    };
}

describe('SettingsRelaysPage', () => {
    test('renders the updated general relay UX with read and write switches', async () => {
        const props = buildProps();
        const rendered = await renderElement(<SettingsRelaysPage {...props} />);
        mounted.push(rendered);

        expect(rendered.container.querySelector('button[aria-label="Categoria del relay"]')).toBeNull();

        const configuredCard = getCardByTitle(rendered.container, 'Relays configurados');
        const configuredTable = getTableFromCard(configuredCard);

        expect(getTableHeaders(configuredTable)).toEqual(['Relay', 'Lectura', 'Escritura', 'Estado', 'Acciones']);
        expect(configuredTable.textContent).toContain('wss://relay.one');
        expect(configuredTable.textContent).not.toContain('wss://relay.dm');
        expect(configuredCard.textContent).toContain('Estado actual y categorías activas de tus relays.');

        const readSwitch = rendered.container.querySelector('button[aria-label="Lectura para wss://relay.one"]');
        const writeSwitch = rendered.container.querySelector('button[aria-label="Escritura para wss://relay.one"]');

        expect(readSwitch?.getAttribute('role')).toBe('switch');
        expect(readSwitch?.getAttribute('aria-checked')).toBe('true');
        expect(writeSwitch?.getAttribute('role')).toBe('switch');
        expect(writeSwitch?.getAttribute('aria-checked')).toBe('true');

        if (!(writeSwitch instanceof HTMLElement)) {
            throw new Error('Write switch not found');
        }

        await clickElement(writeSwitch);

        expect(props.onSetConfiguredRelayNip65Access).toHaveBeenCalledWith('wss://relay.one', { read: true, write: false });
    });

    test('sends the complementary access payload when read is disabled', async () => {
        const props = buildProps();
        const rendered = await renderElement(<SettingsRelaysPage {...props} />);
        mounted.push(rendered);

        const readSwitch = getSwitch(rendered.container, 'Lectura para wss://relay.one');

        await clickElement(readSwitch);

        expect(props.onSetConfiguredRelayNip65Access).toHaveBeenCalledWith('wss://relay.one', { read: false, write: true });
    });

    test('renders relay settings copy in english when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const props = buildProps();
        const rendered = await renderElement(<SettingsRelaysPage {...props} />);
        mounted.push(rendered);

        expect(getCardTitles(rendered.container)).toContain('Configured relays');
        expect(rendered.container.textContent || '').toContain('Add relay');
        expect(rendered.container.textContent || '').toContain('Reset to default');
        expect(rendered.container.textContent || '').toContain('Suggested relays');
        expect(rendered.container.textContent || '').not.toContain('Relays configurados');
    });

    test('reflects read-only and write-only configured relay access in the switches', async () => {
        const props = buildProps();
        props.configuredRows = [
            buildRelayRow({ relayUrl: 'wss://relay.read-only', relayTypes: ['nip65Read'], primaryRelayType: 'nip65Read' }),
            buildRelayRow({ relayUrl: 'wss://relay.write-only', relayTypes: ['nip65Write'], primaryRelayType: 'nip65Write' }),
        ];
        const rendered = await renderElement(<SettingsRelaysPage {...props} />);
        mounted.push(rendered);

        const readOnlyReadSwitch = getSwitch(rendered.container, 'Lectura para wss://relay.read-only');
        const readOnlyWriteSwitch = getSwitch(rendered.container, 'Escritura para wss://relay.read-only');
        const writeOnlyReadSwitch = getSwitch(rendered.container, 'Lectura para wss://relay.write-only');
        const writeOnlyWriteSwitch = getSwitch(rendered.container, 'Escritura para wss://relay.write-only');

        expect(readOnlyReadSwitch.getAttribute('aria-checked')).toBe('true');
        expect(readOnlyWriteSwitch.getAttribute('aria-checked')).toBe('false');
        expect(writeOnlyReadSwitch.getAttribute('aria-checked')).toBe('false');
        expect(writeOnlyWriteSwitch.getAttribute('aria-checked')).toBe('true');
    });

    test('announces invalid general relay input accessibly', async () => {
        const props = buildProps();
        const rendered = await renderElement(<SettingsRelaysPage {...props} invalidRelayInputs={['relay-invalido']} />);
        mounted.push(rendered);

        const input = rendered.container.querySelector('input[aria-label="URLs de relay"]');
        const alert = rendered.container.querySelector('#relay-input-error');

        expect(input?.getAttribute('aria-invalid')).toBe('true');
        expect(input?.getAttribute('aria-describedby')).toBe('relay-input-error');
        expect(alert?.getAttribute('role')).toBe('alert');
        expect(alert?.textContent).toContain('Entradas inválidas: relay-invalido');
    });

    test('renders the extracted dm relay section with independent controls', async () => {
        const props = buildProps();
        const rendered = await renderElement(<SettingsRelaysPage {...props} />);
        mounted.push(rendered);

        const cardTitles = getCardTitles(rendered.container);
        const dmCard = getCardByTitle(rendered.container, 'Relays de mensajes');

        expect(cardTitles.indexOf('Relays sugeridos')).toBeGreaterThanOrEqual(0);
        expect(cardTitles.indexOf('Relays de mensajes')).toBeGreaterThan(cardTitles.indexOf('Relays sugeridos'));
        expect(cardTitles.indexOf('Relays de búsqueda')).toBeGreaterThan(cardTitles.indexOf('Relays de mensajes'));

        expect(dmCard.textContent).toContain('Se usan para recibir mensajes privados.');
        expect(dmCard.textContent).toContain('Esta lista corresponde al kind:10050.');
        expect(dmCard.textContent).toContain('Si tu perfil publica relays de DM, pueden aparecer como sugeridos.');
        expect(dmCard.textContent).toContain('wss://relay.dm');
        expect(dmCard.textContent).toContain('wss://relay.dm-suggested');
        expect(dmCard.textContent).toContain('Restablecer por defecto');
        expect(dmCard.querySelector('input[aria-label="URLs de relay de mensajes"]')).not.toBeNull();
        expect(dmCard.textContent).toContain('Agregar todos');

        const configuredCard = getCardByTitle(rendered.container, 'Relays configurados');
        expect(getTableFromCard(configuredCard).textContent).not.toContain('wss://relay.dm');

        const dmConfiguredTable = getTableByHeading(dmCard, 'Configurados');
        const dmSuggestedTable = getTableByHeading(dmCard, 'Sugeridos');

        expect(dmConfiguredTable.textContent).toContain('wss://relay.dm');
        expect(dmSuggestedTable.textContent).toContain('wss://relay.dm-suggested');
        expect(dmCard.querySelector('button[aria-label^="Abrir acciones para wss://relay.dm"]')).not.toBeNull();
        expect(dmCard.querySelector('button[aria-label^="Abrir acciones sugeridas para wss://relay.dm-suggested"]')).not.toBeNull();
    });

    test('wires the dm section controls to the dedicated handlers', async () => {
        const props = buildProps();
        const rendered = await renderElement(<SettingsRelaysPage {...props} />);
        mounted.push(rendered);

        const dmCard = getCardByTitle(rendered.container, 'Relays de mensajes');
        const dmInput = dmCard.querySelector('input[aria-label="URLs de relay de mensajes"]');

        if (!(dmInput instanceof HTMLInputElement)) {
            throw new Error('DM input not found');
        }

        await changeInputValue(dmInput, 'wss://relay.manual-dm.example');

        expect(props.onNewDmRelayInputChange).toHaveBeenCalledWith('wss://relay.manual-dm.example');

        const buttons = Array.from(dmCard.querySelectorAll('button'));
        const addManualButton = buttons.find((button) => button.textContent?.trim() === 'Añadir');
        const resetButton = buttons.find((button) => button.textContent?.trim() === 'Restablecer por defecto');
        const addAllButton = buttons.find((button) => button.textContent?.trim() === 'Agregar todos');
        const configuredActionsButton = dmCard.querySelector('button[aria-label^="Abrir acciones para wss://relay.dm"]');
        const suggestedActionsButton = dmCard.querySelector('button[aria-label^="Abrir acciones sugeridas para wss://relay.dm-suggested"]');

        if (!(addManualButton instanceof HTMLElement) || !(resetButton instanceof HTMLElement) || !(addAllButton instanceof HTMLElement)) {
            throw new Error('DM buttons not found');
        }

        if (!(configuredActionsButton instanceof HTMLElement)) {
            throw new Error('DM configured actions button not found');
        }

        if (!(suggestedActionsButton instanceof HTMLElement)) {
            throw new Error('DM suggested actions button not found');
        }

        await clickElement(addManualButton);
        await clickElement(addAllButton);
        await clickElement(resetButton);

        await openDropdown(configuredActionsButton);
        await clickElement(getDropdownItem('Eliminar'));

        await openDropdown(suggestedActionsButton);
        await clickElement(getDropdownItem('Añadir'));

        expect(props.onAddDmRelays).toHaveBeenCalledTimes(1);
        expect(props.onRemoveDmRelay).toHaveBeenCalledWith('wss://relay.dm');
        expect(props.onAddSuggestedDmRelay).toHaveBeenCalledWith('wss://relay.dm-suggested', ['dmInbox']);
        expect(props.onAddAllSuggestedDmRelays).toHaveBeenCalledTimes(1);
        expect(props.onResetDmRelaysToDefault).toHaveBeenCalledTimes(1);
    });

    test('opens relay details from a dm row using the existing relay detail flow', async () => {
        const props = buildProps();
        const rendered = await renderElement(<SettingsRelaysPage {...props} />);
        mounted.push(rendered);

        const dmCard = getCardByTitle(rendered.container, 'Relays de mensajes');
        const detailButton = dmCard.querySelector('button[aria-label^="Abrir acciones para wss://relay.dm"]');

        if (!(detailButton instanceof HTMLElement)) {
            throw new Error('DM details button not found');
        }

        await openDropdown(detailButton);
        await clickElement(getDropdownItem('Detalles'));

        expect(props.onOpenRelayDetails).toHaveBeenCalledWith('wss://relay.dm', 'configured', 'dmInbox');
    });

    test('announces invalid dm relay input accessibly', async () => {
        const props = buildProps();
        const rendered = await renderElement(<SettingsRelaysPage {...props} invalidDmRelayInputs={['relay-dm-invalido']} />);
        mounted.push(rendered);

        const dmCard = getCardByTitle(rendered.container, 'Relays de mensajes');
        const input = dmCard.querySelector('input[aria-label="URLs de relay de mensajes"]');
        const alert = dmCard.querySelector('#dm-relay-input-error');

        expect(input?.getAttribute('aria-invalid')).toBe('true');
        expect(input?.getAttribute('aria-describedby')).toBe('dm-relay-input-error');
        expect(alert?.getAttribute('role')).toBe('alert');
        expect(alert?.textContent).toContain('Entradas inválidas: relay-dm-invalido');
    });

    test('wires the search relay controls to their dedicated handlers', async () => {
        const props = buildProps();
        const rendered = await renderElement(<SettingsRelaysPage {...props} />);
        mounted.push(rendered);

        const searchCard = getCardByTitle(rendered.container, 'Relays de búsqueda');
        const searchInput = searchCard.querySelector('input[aria-label="URLs de relay de búsqueda"]');

        if (!(searchInput instanceof HTMLInputElement)) {
            throw new Error('Search input not found');
        }

        await changeInputValue(searchInput, 'wss://relay.search-custom.example');

        expect(props.onNewSearchRelayInputChange).toHaveBeenCalledWith('wss://relay.search-custom.example');

        const buttons = Array.from(searchCard.querySelectorAll('button'));
        const addButton = buttons.find((button) => button.textContent?.trim() === 'Añadir');
        const resetButton = buttons.find((button) => button.textContent?.trim() === 'Restablecer por defecto');

        if (!(addButton instanceof HTMLElement) || !(resetButton instanceof HTMLElement)) {
            throw new Error('Search relay buttons not found');
        }

        await clickElement(addButton);
        await clickElement(resetButton);

        expect(props.onAddSearchRelays).toHaveBeenCalledTimes(1);
        expect(props.onResetSearchRelaysToDefault).toHaveBeenCalledTimes(1);
    });

    test('announces invalid search relay input accessibly', async () => {
        const props = buildProps();
        const rendered = await renderElement(<SettingsRelaysPage {...props} invalidSearchRelayInputs={['relay-search-invalido']} />);
        mounted.push(rendered);

        const searchCard = getCardByTitle(rendered.container, 'Relays de búsqueda');
        const input = searchCard.querySelector('input[aria-label="URLs de relay de búsqueda"]');
        const alert = searchCard.querySelector('#search-relay-input-error');

        expect(input?.getAttribute('aria-invalid')).toBe('true');
        expect(input?.getAttribute('aria-describedby')).toBe('search-relay-input-error');
        expect(alert?.getAttribute('role')).toBe('alert');
        expect(alert?.textContent).toContain('Entradas inválidas: relay-search-invalido');
    });

    test('adds all suggested search relays from the search section', async () => {
        const props = buildProps();
        const rendered = await renderElement(<SettingsRelaysPage {...props} />);
        mounted.push(rendered);

        const searchCard = getCardByTitle(rendered.container, 'Relays de búsqueda');
        const addAllButton = Array.from(searchCard.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Agregar todos');

        if (!(addAllButton instanceof HTMLElement)) {
            throw new Error('Search suggested add all button not found');
        }

        await clickElement(addAllButton);

        expect(props.onAddAllSuggestedSearchRelays).toHaveBeenCalledTimes(1);
    });

    test('renders main table action buttons and invokes the action-menu callback', async () => {
        const props = buildProps();
        const rendered = await renderElement(<SettingsRelaysPage {...props} />);
        mounted.push(rendered);

        const configuredActionsButton = rendered.container.querySelector('button[aria-label^="Abrir acciones para wss://relay.one"]');
        const suggestedActionsButton = rendered.container.querySelector('button[aria-label^="Abrir acciones sugeridas para wss://relay.two"]');

        if (!(configuredActionsButton instanceof HTMLElement) || !(suggestedActionsButton instanceof HTMLElement)) {
            throw new Error('Main page action buttons not found');
        }

        await pointerDownElement(configuredActionsButton);
        await clickElement(configuredActionsButton);
        await pointerDownElement(suggestedActionsButton);
        await clickElement(suggestedActionsButton);

        expect(props.onOpenRelayActionsMenu).toHaveBeenCalledTimes(2);
    });

    test('wires configured relay dropdown items to details and remove handlers', async () => {
        const props = buildProps();
        const rendered = await renderElement(<SettingsRelaysPage {...props} />);
        mounted.push(rendered);

        const configuredActionsButton = rendered.container.querySelector('button[aria-label^="Abrir acciones para wss://relay.one"]');

        if (!(configuredActionsButton instanceof HTMLElement)) {
            throw new Error('Configured actions button not found');
        }

        await openDropdown(configuredActionsButton);
        await clickElement(getDropdownItem('Detalles'));

        expect(props.onOpenRelayDetails).toHaveBeenCalledWith('wss://relay.one', 'configured', 'nip65Both');

        await openDropdown(configuredActionsButton);
        await clickElement(getDropdownItem('Eliminar'));

        expect(props.onRemoveRelay).toHaveBeenCalledWith('wss://relay.one');
    });

    test('wires suggested relay dropdown add item to the dedicated handler', async () => {
        const props = buildProps();
        const rendered = await renderElement(<SettingsRelaysPage {...props} />);
        mounted.push(rendered);

        const suggestedActionsButton = rendered.container.querySelector('button[aria-label^="Abrir acciones sugeridas para wss://relay.two"]');

        if (!(suggestedActionsButton instanceof HTMLElement)) {
            throw new Error('Suggested actions button not found');
        }

        await openDropdown(suggestedActionsButton);
        await clickElement(getDropdownItem('Añadir'));

        expect(props.onAddSuggestedRelay).toHaveBeenCalledWith('wss://relay.two', ['nip65Read']);
    });

    test('wires configured search relay dropdown items to details and remove handlers', async () => {
        const props = buildProps();
        const rendered = await renderElement(<SettingsRelaysPage {...props} />);
        mounted.push(rendered);

        const configuredActionsButton = rendered.container.querySelector('button[aria-label^="Abrir acciones para wss://search.nos.today"]');

        if (!(configuredActionsButton instanceof HTMLElement)) {
            throw new Error('Configured search actions button not found');
        }

        await openDropdown(configuredActionsButton);
        await clickElement(getDropdownItem('Detalles'));

        expect(props.onOpenRelayDetails).toHaveBeenCalledWith('wss://search.nos.today', 'configured', 'search');

        await openDropdown(configuredActionsButton);
        await clickElement(getDropdownItem('Eliminar'));

        expect(props.onRemoveSearchRelay).toHaveBeenCalledWith('wss://search.nos.today');
    });

    test('wires suggested search relay dropdown items to details and add handlers', async () => {
        const props = buildProps();
        const rendered = await renderElement(<SettingsRelaysPage {...props} />);
        mounted.push(rendered);

        const suggestedActionsButton = rendered.container.querySelector('button[aria-label^="Abrir acciones sugeridas para wss://relay.noswhere.com"]');

        if (!(suggestedActionsButton instanceof HTMLElement)) {
            throw new Error('Suggested search actions button not found');
        }

        await openDropdown(suggestedActionsButton);
        await clickElement(getDropdownItem('Detalles'));

        expect(props.onOpenRelayDetails).toHaveBeenCalledWith('wss://relay.noswhere.com', 'suggested', 'search');

        await openDropdown(suggestedActionsButton);
        await clickElement(getDropdownItem('Añadir'));

        expect(props.onAddSuggestedSearchRelay).toHaveBeenCalledWith('wss://relay.noswhere.com', ['search']);
    });
});
