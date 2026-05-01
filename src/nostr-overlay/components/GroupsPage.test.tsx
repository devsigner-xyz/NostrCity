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
        id: 'gardeners',
        name: 'City Gardeners',
        relayUrl: 'wss://relay.example',
        description: 'Community notes about public gardens.',
        memberCount: 12,
    },
    {
        id: 'builders',
        name: 'Builders Guild',
        relayUrl: 'wss://relay.example',
        description: 'Planning streets and plazas.',
        memberCount: 7,
    },
];

function page(overrides: Partial<React.ComponentProps<typeof GroupsPage>> = {}) {
    return (
        <GroupsPage
            groups={groups}
            selectedGroupId="gardeners"
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

describe('GroupsPage', () => {
    test('renders loading, empty, and error states with accessible feedback', async () => {
        const loading = await renderElement(page({ isLoading: true, groups: [] }));
        mounted.push(loading);

        expect(loading.container.querySelector('[role="status"]')).not.toBeNull();
        expect(loading.container.textContent || '').toContain('Cargando grupos');

        const empty = await renderElement(page({ groups: [], selectedGroupId: null }));
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
        expect(layout?.className).toContain('flex-col');
        expect(layout?.className).toContain('lg:grid');
        expect(rendered.container.querySelector('nav[aria-label="Lista de grupos"]')).not.toBeNull();
        expect(rendered.container.querySelector('article[aria-label="Detalle del grupo City Gardeners"]')).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('City Gardeners');
        expect(rendered.container.textContent || '').toContain('12 miembros');

        const builders = Array.from(rendered.container.querySelectorAll('button')).find((button) => button.textContent?.includes('Builders Guild'));
        await act(async () => {
            builders?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectGroup).toHaveBeenCalledWith('builders');
    });

    test('disables write actions for read-only, locked, and unsigned sessions with localized reasons', async () => {
        const readonly = await renderElement(page({ session: session({ method: 'npub', readonly: true, capabilities: { canSign: false, canEncrypt: false, encryptionSchemes: [] } }) }));
        mounted.push(readonly);

        expect(readonly.container.textContent || '').toContain('Inicia sesión con una cuenta que pueda firmar para publicar en grupos.');
        expect(readonly.container.querySelector('textarea')?.disabled).toBe(true);
        expect(readonly.container.querySelector('button[aria-label="Publicar mensaje en City Gardeners"]')?.hasAttribute('disabled')).toBe(true);
        expect(readonly.container.querySelector('button[aria-label="Guardar City Gardeners"]')?.hasAttribute('disabled')).toBe(true);
        expect(readonly.container.querySelector('button[aria-label="Unirse a City Gardeners"]')?.hasAttribute('disabled')).toBe(true);
        expect(readonly.container.querySelector('button[aria-label="Salir de City Gardeners"]')?.hasAttribute('disabled')).toBe(true);

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

        expect(onPublishMessage).toHaveBeenCalledWith('gardeners', 'Hello group');

        const blockedPublish = vi.fn();
        const blocked = await renderElement(page({ session: session({ method: 'npub', readonly: true, capabilities: { canSign: false, canEncrypt: false, encryptionSchemes: [] } }), messageDraft: 'Blocked', onPublishMessage: blockedPublish }));
        mounted.push(blocked);

        await act(async () => {
            blocked.container.querySelector('button[aria-label="Publicar mensaje en City Gardeners"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(blockedPublish).not.toHaveBeenCalled();
    });

    test('changes draft text and warns that saved groups are public before saving', async () => {
        const onMessageDraftChange = vi.fn();
        const onSaveGroup = vi.fn();
        const rendered = await renderElement(page({ onMessageDraftChange, onSaveGroup }));
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Los grupos guardados se publican en tu lista pública de grupos guardados.');

        const textarea = rendered.container.querySelector('textarea[aria-label="Mensaje para City Gardeners"]') as HTMLTextAreaElement | null;
        expect(textarea).not.toBeNull();

        await act(async () => {
            setTextAreaValue(textarea as HTMLTextAreaElement, 'New message');
        });

        expect(onMessageDraftChange).toHaveBeenCalledWith('New message');

        const save = rendered.container.querySelector('button[aria-label="Guardar City Gardeners"]');
        await act(async () => {
            save?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSaveGroup).toHaveBeenCalledWith('gardeners');
    });

    test('calls explicit public groups sync only when the session can write', async () => {
        const onSyncPublicGroups = vi.fn();
        const writable = await renderElement(page({ onSyncPublicGroups }));
        mounted.push(writable);

        expect(writable.container.textContent || '').toContain('Los relays y grupos sincronizados son datos públicos de Nostr.');
        const sync = writable.container.querySelector('button[aria-label="Sincronizar grupos públicos: los grupos guardados y relays de grupos son datos públicos de Nostr"]') as HTMLButtonElement | null;
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

        const blockedButton = blocked.container.querySelector('button[aria-label="Sincronizar grupos públicos: los grupos guardados y relays de grupos son datos públicos de Nostr"]') as HTMLButtonElement | null;
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
        const writable = await renderElement(page({ onJoinGroup, onLeaveGroup }));
        mounted.push(writable);

        await act(async () => {
            writable.container.querySelector('button[aria-label="Unirse a City Gardeners"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            writable.container.querySelector('button[aria-label="Salir de City Gardeners"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onJoinGroup).toHaveBeenCalledWith('gardeners');
        expect(onLeaveGroup).toHaveBeenCalledWith('gardeners');

        const blockedJoin = vi.fn();
        const blockedLeave = vi.fn();
        const blocked = await renderElement(page({
            session: session({ method: 'npub', readonly: true, capabilities: { canSign: false, canEncrypt: false, encryptionSchemes: [] } }),
            onJoinGroup: blockedJoin,
            onLeaveGroup: blockedLeave,
        }));
        mounted.push(blocked);

        await act(async () => {
            blocked.container.querySelector('button[aria-label="Unirse a City Gardeners"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            blocked.container.querySelector('button[aria-label="Salir de City Gardeners"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

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
        expect(timeline?.textContent || '').toContain('Mensajes recientes');
        const text = timeline?.textContent || '';

        expect(text.indexOf('First tie note')).toBeLessThan(text.indexOf('Second tie note'));
        expect(text.indexOf('Second tie note')).toBeLessThan(text.indexOf('Older garden note'));
    });
});
