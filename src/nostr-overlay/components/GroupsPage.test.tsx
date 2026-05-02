import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { AuthSessionState, LoginMethod } from '../../nostr/auth/session';
import type { NostrEvent } from '../../nostr/types';
import { GroupsPage, type NostrGroupSummary } from './GroupsPage';

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

const mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }

    mounted.length = 0;
});

function session(overrides: Partial<AuthSessionState> = {}): AuthSessionState {
    const method: LoginMethod = overrides.method ?? 'nip07';

    return {
        method,
        pubkey: 'a'.repeat(64),
        readonly: method === 'npub',
        locked: false,
        capabilities: {
            canSign: method !== 'npub',
            canEncrypt: false,
            encryptionSchemes: [],
        },
        createdAt: 1,
        ...overrides,
    };
}

const groups: NostrGroupSummary[] = [
    {
        id: "wss://relay.example'gardeners",
        name: 'City Gardeners',
        relayUrl: 'wss://relay.example',
        description: 'Community notes about public gardens.',
        memberCount: 12,
        isSaved: true,
        metadataVerified: true,
    },
    {
        id: "wss://relay.example'builders",
        name: 'Builders Guild',
        relayUrl: 'wss://relay.example',
        description: 'Planning streets and plazas.',
        memberCount: 7,
        isRemembered: true,
        metadataVerified: false,
    },
    {
        id: "wss://relay.example'artists",
        name: 'Street Artists',
        relayUrl: 'wss://relay.example',
        description: 'Murals and public art notes.',
        memberCount: 3,
        metadataVerified: true,
    },
];

function page(overrides: Partial<React.ComponentProps<typeof GroupsPage>> = {}) {
    return (
        <GroupsPage
            groups={groups}
            relays={[
                { relayUrl: 'wss://relay.example', groupCount: 3, savedCount: 1, rememberedCount: 1, isConfigured: true },
                { relayUrl: 'wss://groups.extra.example', groupCount: 0, savedCount: 0, rememberedCount: 0, isConfigured: true },
            ]}
            selectedRelayUrl="wss://relay.example"
            selectedGroupId="wss://relay.example'gardeners"
            isLoading={false}
            error={null}
            session={session()}
            messageDraft=""
            onSelectGroup={vi.fn()}
            onMessageDraftChange={vi.fn()}
            onPublishMessage={vi.fn()}
            onSaveGroup={vi.fn()}
            onSyncPublicGroups={vi.fn()}
            onJoinGroup={vi.fn()}
            onLeaveGroup={vi.fn()}
            timeline={[]}
            onSelectRelay={vi.fn()}
            onAddCustomGroupRelay={vi.fn()}
            onOpenInvite={vi.fn()}
            onRetry={vi.fn()}
            hasGroupRelaysConfigured
            onAddSuggestedGroupRelays={vi.fn()}
            onManageGroupRelays={vi.fn()}
            {...overrides}
        />
    );
}

function setTextAreaValue(textarea: HTMLTextAreaElement, value: string) {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    valueSetter?.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

function setInputValue(input: HTMLInputElement, value: string) {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function clickElement(element: Element | null | undefined): Promise<void> {
    await act(async () => {
        element?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        element?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        element?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
        element?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

async function openGroupActions(container: HTMLElement, groupName = 'City Gardeners'): Promise<void> {
    await clickElement(container.querySelector(`button[aria-label="Abrir acciones de ${groupName}"]`));
}

describe('GroupsPage', () => {
    test('renders loading, empty, and error states with accessible feedback', async () => {
        const loading = await renderElement(page({ isLoading: true, groups: [] }));
        mounted.push(loading);

        expect(loading.container.querySelector('[role="status"]')).not.toBeNull();
        expect(loading.container.textContent || '').toContain('Cargando grupos');

        const empty = await renderElement(page({ groups: [], selectedRelayUrl: null, selectedGroupId: null }));
        mounted.push(empty);

        expect(empty.container.textContent || '').toContain('Sin grupos guardados');
        expect(empty.container.textContent || '').toContain('Guarda un grupo para verlo aquí.');

        const onRetry = vi.fn();
        const error = await renderElement(page({ groups: [], selectedGroupId: null, error: 'Relay timeout', onRetry }));
        mounted.push(error);

        expect(error.container.querySelector('[role="alert"]')).not.toBeNull();
        expect(error.container.textContent || '').toContain('No se pudieron cargar los grupos');
        expect(error.container.textContent || '').toContain('Relay timeout');

        const retry = Array.from(error.container.querySelectorAll('button')).find((button) => button.textContent === 'Reintentar');
        await act(async () => {
            retry?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    test('renders onboarding actions when no group relays are configured', async () => {
        const onAddSuggestedGroupRelays = vi.fn();
        const onManageGroupRelays = vi.fn();
        const rendered = await renderElement(page({
            groups: [],
            selectedGroupId: null,
            hasGroupRelaysConfigured: false,
            onAddSuggestedGroupRelays,
            onManageGroupRelays,
        }));
        mounted.push(rendered);

        expect(rendered.container.textContent).toContain('Elige relays de grupos');
        const addSuggested = rendered.container.querySelector('button[aria-label="Añadir relays de grupos sugeridos"]');
        const manageRelays = rendered.container.querySelector('button[aria-label="Gestionar relays de grupos"]');
        expect(addSuggested).not.toBeNull();
        expect(manageRelays).not.toBeNull();

        await act(async () => {
            addSuggested?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            manageRelays?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onAddSuggestedGroupRelays).toHaveBeenCalledTimes(1);
        expect(onManageGroupRelays).toHaveBeenCalledTimes(1);
    });

    test('renders a mobile-first list and selected group detail layout', async () => {
        const onSelectGroup = vi.fn();
        const rendered = await renderElement(page({ onSelectGroup }));
        mounted.push(rendered);

        const layout = rendered.container.querySelector('[data-testid="groups-page-layout"]');
        expect(layout?.className).toContain('nostr-groups-layout');
        expect(rendered.container.querySelector('.nostr-groups-columns')).not.toBeNull();
        const groupList = rendered.container.querySelector('nav[aria-label="Lista de grupos"]');
        expect(groupList).not.toBeNull();
        expect(groupList?.className).toContain('overflow-y-auto');
        const groupListCard = groupList?.closest('[data-slot="card"]');
        expect(groupListCard?.className).toContain('border');
        expect(groupListCard?.className).toContain('ring-0');
        expect(rendered.container.querySelector('article[aria-label="Detalle del grupo City Gardeners"]')).not.toBeNull();
        const groupDetailCard = rendered.container.querySelector('article[aria-label="Detalle del grupo City Gardeners"] [data-slot="card"]');
        expect(groupDetailCard?.className).toContain('border');
        expect(groupDetailCard?.className).toContain('ring-0');
        expect(rendered.container.textContent || '').toContain('City Gardeners');
        expect(rendered.container.textContent || '').toContain('12 miembros');

        const builders = Array.from(rendered.container.querySelectorAll('button')).find((button) => button.textContent?.includes('Builders Guild'));
        await act(async () => {
            builders?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectGroup).toHaveBeenCalledWith("wss://relay.example'builders");
    });

    test('separates joined and other groups with counts', async () => {
        const rendered = await renderElement(page());
        mounted.push(rendered);

        const tabsList = rendered.container.querySelector('[data-slot="tabs-list"]');
        expect(tabsList).not.toBeNull();
        expect(tabsList?.getAttribute('data-variant')).toBe('line');
        expect(rendered.container.textContent || '').toContain('Joined (2)');
        expect(rendered.container.textContent || '').toContain('Others (1)');
        expect(rendered.container.textContent || '').toContain('City Gardeners');
        expect(rendered.container.textContent || '').toContain('Builders Guild');
        expect(rendered.container.textContent || '').not.toContain('Street Artists');

        const othersRendered = await renderElement(page({ selectedGroupId: "wss://relay.example'artists" }));
        mounted.push(othersRendered);

        expect(othersRendered.container.textContent || '').toContain('Joined (2)');
        expect(othersRendered.container.textContent || '').toContain('Others (1)');
        expect(othersRendered.container.textContent || '').toContain('Street Artists');
        expect(othersRendered.container.textContent || '').not.toContain('Builders Guild');
    });

    test('centers shadcn empty states for relay groups and missing group detail', async () => {
        const rendered = await renderElement(page({ selectedRelayUrl: 'wss://groups.extra.example', selectedGroupId: null }));
        mounted.push(rendered);

        const list = rendered.container.querySelector('nav[aria-label="Lista de grupos"]');
        const listEmpty = list?.querySelector('[data-slot="empty"]');
        expect(listEmpty).not.toBeNull();
        expect(listEmpty?.className).toContain('justify-center');

        const detailCard = rendered.container.querySelector('[data-testid="groups-empty-detail"]');
        const detailEmpty = detailCard?.querySelector('[data-slot="empty"]');
        expect(detailEmpty).not.toBeNull();
        expect(detailEmpty?.className).toContain('justify-center');
        expect(detailEmpty?.textContent || '').toContain('Selecciona un grupo');
        expect(detailEmpty?.textContent || '').toContain('Elige un grupo guardado para ver sus detalles.');
    });

    test('shows a retryable empty state when the selected relay has no discoverable groups', async () => {
        const onRetry = vi.fn();
        const rendered = await renderElement(page({
            selectedRelayUrl: 'wss://groups.extra.example',
            selectedGroupId: null,
            onRetry,
        }));
        mounted.push(rendered);

        const list = rendered.container.querySelector('nav[aria-label="Lista de grupos"]');
        const listEmpty = list?.querySelector('[data-slot="empty"]');
        expect(listEmpty).not.toBeNull();
        expect(listEmpty?.textContent || '').toContain('No hay grupos detectables en este relay');
        expect(listEmpty?.textContent || '').toContain('El relay no expuso metadata NIP-29 o no respondió a la búsqueda. Reintenta o elige otro relay.');

        const retry = Array.from(rendered.container.querySelectorAll('button')).find((button) => button.textContent === 'Reintentar');
        await act(async () => {
            retry?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    test('shows the selected relay empty state when discovery returns no groups overall', async () => {
        const onRetry = vi.fn();
        const rendered = await renderElement(page({
            groups: [],
            relays: [{ relayUrl: 'wss://groups.extra.example', groupCount: 0, savedCount: 0, rememberedCount: 0, isConfigured: true }],
            selectedRelayUrl: 'wss://groups.extra.example',
            selectedGroupId: null,
            onRetry,
        }));
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-testid="groups-page-layout"]')).not.toBeNull();
        expect(rendered.container.textContent || '').not.toContain('Sin grupos guardados');
        expect(rendered.container.textContent || '').toContain('No hay grupos detectables en este relay');

        const retry = Array.from(rendered.container.querySelectorAll('button')).find((button) => button.textContent === 'Reintentar');
        await act(async () => {
            retry?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    test('does not render the temporary group search or list heading copy', async () => {
        const rendered = await renderElement(page());
        mounted.push(rendered);

        expect(rendered.container.querySelector('input[aria-label="Buscar grupos"]')).toBeNull();
        expect(rendered.container.textContent || '').not.toContain('Grupos disponibles');
        expect(rendered.container.textContent || '').not.toContain('Selecciona un grupo del relay activo.');
    });

    test('does not render generic group about copy in the main group detail header', async () => {
        const rendered = await renderElement(page({
            groups: [
                {
                    id: "wss://relay.example'devs",
                    name: 'Nostr Developers Test',
                    relayUrl: 'wss://relay.example',
                    description: 'About group',
                    memberCount: 58,
                    metadataVerified: true,
                },
            ],
            selectedGroupId: "wss://relay.example'devs",
        }));
        mounted.push(rendered);

        const detail = rendered.container.querySelector('article[aria-label="Detalle del grupo Nostr Developers Test"]');
        expect(detail?.textContent || '').toContain('Nostr Developers Test');
        expect(detail?.textContent || '').not.toContain('About group');
    });

    test('renders join state as the primary group detail action without duplicating join in the menu', async () => {
        const onJoinGroup = vi.fn();
        const joined = await renderElement(page({ onJoinGroup }));
        mounted.push(joined);

        expect(joined.container.querySelector('button[aria-label="Unido a City Gardeners"]')?.textContent).toBe('Unido');
        await openGroupActions(joined.container);
        expect(document.body.querySelector('[aria-label="Unirse a City Gardeners"]')).toBeNull();

        const other = await renderElement(page({ selectedGroupId: "wss://relay.example'artists", onJoinGroup }));
        mounted.push(other);

        const joinButton = other.container.querySelector('button[aria-label="Unirse a Street Artists"]');
        expect(joinButton?.textContent).toBe('Unirse al grupo');
        await act(async () => {
            joinButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onJoinGroup).toHaveBeenCalledWith("wss://relay.example'artists");
    });

    test('renders relay-first controls, group status labels, and invite parsing feedback', async () => {
        const onSelectRelay = vi.fn();
        const onAddCustomGroupRelay = vi.fn();
        const onOpenInvite = vi.fn();
        const rendered = await renderElement(page({ onSelectRelay, onAddCustomGroupRelay, onOpenInvite }));
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Relays de grupos');
        expect(rendered.container.querySelector('button[aria-label="Relays de grupos"]')).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('Sincronizar relays públicos');

        expect(rendered.container.textContent || '').toContain('Guardado públicamente');
        expect(rendered.container.textContent || '').not.toContain('Recordado en este dispositivo');
        expect(rendered.container.textContent || '').not.toContain('Remembered on this device');
        const unverifiedDetail = await renderElement(page({ selectedGroupId: "wss://relay.example'builders" }));
        mounted.push(unverifiedDetail);
        expect(unverifiedDetail.container.textContent || '').not.toContain('Metadata no verificada por NIP-11');
        await openGroupActions(unverifiedDetail.container, 'Builders Guild');
        await clickElement(document.body.querySelector('[role="menuitem"]'));
        expect(document.body.textContent || '').toContain('Metadata no verificada por NIP-11');
        expect(document.body.textContent || '').not.toContain('Recordado en este dispositivo');
        expect(document.body.textContent || '').not.toContain('About group');
        expect(rendered.container.textContent || '').not.toContain('Unirse recordará este grupo localmente. No se publicará tu lista pública hasta que guardes o sincronices explícitamente.');
        const headerInviteButton = rendered.container.querySelector('[data-slot="overlay-page-header-actions"] button[aria-label="Abrir grupo NIP-29"]');
        expect(headerInviteButton).not.toBeNull();

        await openGroupActions(rendered.container);
        await clickElement(document.body.querySelector('[role="menuitem"]'));
        expect(document.body.textContent || '').toContain('Detalles de City Gardeners');
        expect(document.body.textContent || '').toContain("wss://relay.example'gardeners");

        expect(rendered.container.querySelector('input[aria-label="Relay de grupo personalizado"]')).toBeNull();
        expect(onSelectRelay).not.toHaveBeenCalled();
        expect(document.body.textContent || '').not.toContain('Añadir relay de grupo');

        await act(async () => {
            headerInviteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(document.body.textContent || '').not.toContain('Formato: relay-host\'group-id');
        expect(document.body.textContent || '').not.toContain('Ejemplo: groups.example\'maps');
        expect(document.body.textContent || '').not.toContain('Nostrord');
        const dialogInput = document.body.querySelector('input[aria-label="Dirección de grupo"]') as HTMLInputElement;
        const inviteCodeInput = document.body.querySelector('input[aria-label="Código de invitación"]') as HTMLInputElement;
        expect(dialogInput).not.toBeNull();
        expect(inviteCodeInput).not.toBeNull();
        await act(async () => {
            setInputValue(dialogInput, 'not a link');
            document.body.querySelector('button[aria-label="Abrir grupo desde invitación"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(document.body.querySelector('[role="alert"]')?.textContent || '').toContain('No pudimos leer ese enlace de invitación.');
        expect(onOpenInvite).not.toHaveBeenCalled();

        await act(async () => {
            setInputValue(dialogInput, "groups.example'Maps");
            setInputValue(inviteCodeInput, 'abc');
            document.body.querySelector('button[aria-label="Abrir grupo desde invitación"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onOpenInvite).toHaveBeenCalledWith({ relay: 'wss://groups.example', group: 'Maps', code: 'abc' });
    });

    test('disables write actions for read-only, locked, and unsigned sessions with localized reasons', async () => {
        const readonly = await renderElement(page({ session: session({ method: 'npub', readonly: true, capabilities: { canSign: false, canEncrypt: false, encryptionSchemes: [] } }) }));
        mounted.push(readonly);

        expect(readonly.container.textContent || '').toContain('Inicia sesión con una cuenta que pueda firmar para publicar en grupos.');
        expect(readonly.container.querySelector('textarea')?.disabled).toBe(true);
        expect(readonly.container.querySelector('button[aria-label="Publicar mensaje en City Gardeners"]')?.hasAttribute('disabled')).toBe(true);
        expect(readonly.container.querySelector('button[aria-label="Unido a City Gardeners"]')?.hasAttribute('disabled')).toBe(true);
        await openGroupActions(readonly.container);
        expect(document.body.querySelector('[aria-label="Guardar City Gardeners"]')?.getAttribute('aria-disabled')).toBe('true');
        expect(document.body.querySelector('[aria-label="Unirse a City Gardeners"]')).toBeNull();
        expect(document.body.querySelector('[aria-label="Salir de City Gardeners"]')?.getAttribute('aria-disabled')).toBe('true');

        const locked = await renderElement(page({ session: session({ method: 'local', locked: true }) }));
        mounted.push(locked);

        expect(locked.container.textContent || '').toContain('Desbloquea tu cuenta local para publicar o guardar grupos.');

        const unsigned = await renderElement(page({ session: session({ method: 'nip46', readonly: true, capabilities: { canSign: false, canEncrypt: false, encryptionSchemes: [] } }) }));
        mounted.push(unsigned);

        expect(unsigned.container.textContent || '').toContain('Tu método de acceso no tiene permiso para firmar eventos de grupos.');
    });

    test('calls publish handler only when the session can write', async () => {
        const onPublishMessage = vi.fn();
        const writable = await renderElement(page({ messageDraft: 'Hello group', onPublishMessage }));
        mounted.push(writable);

        const publish = writable.container.querySelector('button[aria-label="Publicar mensaje en City Gardeners"]');
        await act(async () => {
            publish?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onPublishMessage).toHaveBeenCalledWith("wss://relay.example'gardeners", 'Hello group');

        const blockedPublish = vi.fn();
        const blocked = await renderElement(page({ session: session({ method: 'npub', readonly: true, capabilities: { canSign: false, canEncrypt: false, encryptionSchemes: [] } }), messageDraft: 'Blocked', onPublishMessage: blockedPublish }));
        mounted.push(blocked);

        await act(async () => {
            blocked.container.querySelector('button[aria-label="Publicar mensaje en City Gardeners"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(blockedPublish).not.toHaveBeenCalled();
    });

    test('changes draft text without showing the public saved-groups warning', async () => {
        const onMessageDraftChange = vi.fn();
        const onSaveGroup = vi.fn();
        const rendered = await renderElement(page({ onMessageDraftChange, onSaveGroup }));
        mounted.push(rendered);

        expect(rendered.container.textContent || '').not.toContain('Los grupos guardados se publican en tu lista pública de grupos guardados.');
        expect(rendered.container.textContent || '').not.toContain('Saved groups are published to your public saved-groups list.');

        const textarea = rendered.container.querySelector('textarea[aria-label="Mensaje para City Gardeners"]') as HTMLTextAreaElement | null;
        expect(textarea).not.toBeNull();

        await act(async () => {
            setTextAreaValue(textarea as HTMLTextAreaElement, 'New message');
        });

        expect(onMessageDraftChange).toHaveBeenCalledWith('New message');

        await openGroupActions(rendered.container);
        await clickElement(document.body.querySelector('[aria-label="Guardar City Gardeners"]'));

        expect(onSaveGroup).toHaveBeenCalledWith("wss://relay.example'gardeners");
    });

    test('calls explicit public groups sync only when the session can write', async () => {
        const onSyncPublicGroups = vi.fn();
        const writable = await renderElement(page({ onSyncPublicGroups }));
        mounted.push(writable);

        expect(writable.container.textContent || '').not.toContain('Los relays y grupos sincronizados son datos públicos de Nostr.');
        const sync = writable.container.querySelector('button[aria-label="Sincronizar relays públicos"]') as HTMLButtonElement | null;
        expect(sync).not.toBeNull();
        expect(sync?.disabled).toBe(false);

        await act(async () => {
            sync?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSyncPublicGroups).toHaveBeenCalledTimes(1);

        const blockedSync = vi.fn();
        const blocked = await renderElement(page({
            session: session({ method: 'npub', readonly: true, capabilities: { canSign: false, canEncrypt: false, encryptionSchemes: [] } }),
            onSyncPublicGroups: blockedSync,
        }));
        mounted.push(blocked);

        const blockedButton = blocked.container.querySelector('button[aria-label="Sincronizar relays públicos"]') as HTMLButtonElement | null;
        expect(blockedButton).not.toBeNull();
        expect(blockedButton?.disabled).toBe(true);

        await act(async () => {
            blockedButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(blockedSync).not.toHaveBeenCalled();
    });

    test('calls join and leave handlers only when the session can write', async () => {
        const onJoinGroup = vi.fn();
        const onLeaveGroup = vi.fn();
        const writable = await renderElement(page({ selectedGroupId: "wss://relay.example'artists", onJoinGroup, onLeaveGroup }));
        mounted.push(writable);

        await clickElement(writable.container.querySelector('[aria-label="Unirse a Street Artists"]'));
        await openGroupActions(writable.container, 'Street Artists');
        await clickElement(document.body.querySelector('[aria-label="Salir de Street Artists"]'));

        expect(onJoinGroup).toHaveBeenCalledWith("wss://relay.example'artists");
        expect(onLeaveGroup).toHaveBeenCalledWith("wss://relay.example'artists");

        const blockedJoin = vi.fn();
        const blockedLeave = vi.fn();
        const blocked = await renderElement(page({
            selectedGroupId: "wss://relay.example'artists",
            session: session({ method: 'npub', readonly: true, capabilities: { canSign: false, canEncrypt: false, encryptionSchemes: [] } }),
            onJoinGroup: blockedJoin,
            onLeaveGroup: blockedLeave,
        }));
        mounted.push(blocked);

        await clickElement(blocked.container.querySelector('[aria-label="Unirse a Street Artists"]'));
        await openGroupActions(blocked.container, 'Street Artists');
        await clickElement(document.body.querySelector('[aria-label="Salir de Street Artists"]'));

        expect(blockedJoin).not.toHaveBeenCalled();
        expect(blockedLeave).not.toHaveBeenCalled();
    });

    test('renders timeline messages in deterministic created_at desc and id asc order', async () => {
        const oldEvent: NostrEvent = { id: 'c'.repeat(64), pubkey: '1'.repeat(64), kind: 9, created_at: 99, tags: [['h', 'gardeners']], content: 'Older garden note' };
        const newerB: NostrEvent = { id: 'b'.repeat(64), pubkey: '2'.repeat(64), kind: 9, created_at: 100, tags: [['h', 'gardeners']], content: 'Second tie note' };
        const newerA: NostrEvent = { id: 'a'.repeat(64), pubkey: '3'.repeat(64), kind: 9, created_at: 100, tags: [['h', 'gardeners']], content: 'First tie note' };
        const rendered = await renderElement(page({ timeline: [oldEvent, newerB, newerA] }));
        mounted.push(rendered);

        const timeline = rendered.container.querySelector('[data-testid="groups-timeline"]');
        expect(timeline).not.toBeNull();
        expect(timeline?.textContent || '').not.toContain('Mensajes recientes');
        expect(timeline?.textContent || '').not.toContain('wss://relay.example');
        const text = timeline?.textContent || '';

        expect(text.indexOf('First tie note')).toBeLessThan(text.indexOf('Second tie note'));
        expect(text.indexOf('Second tie note')).toBeLessThan(text.indexOf('Older garden note'));
    });

    test('centers the shadcn empty state in the conversation area when there are no messages', async () => {
        const rendered = await renderElement(page());
        mounted.push(rendered);

        const timeline = rendered.container.querySelector('[data-testid="groups-timeline"]');
        const empty = timeline?.querySelector('[data-slot="empty"]');
        expect(empty).not.toBeNull();
        expect(empty?.className).toContain('justify-center');
        expect(empty?.textContent || '').toContain('Aún no hay mensajes en el grupo.');
        expect(timeline?.textContent || '').not.toContain('Mensajes recientes');
        expect(timeline?.textContent || '').not.toContain('wss://relay.example');
    });
});
