import { act, type ReactElement } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { AuthSessionState } from '../../nostr/auth/session';
import type { GroupsRuntimeSnapshot } from '../../nostr/groups-runtime-service';
import { createNostrOverlayQueryClient } from '../query/query-client';
import { useOverlayGroupsController, type OverlayGroupsService } from './use-overlay-groups-controller';

interface Rendered {
    container: HTMLDivElement;
    root: Root;
    queryClient: QueryClient;
}

const mounted: Rendered[] = [];
type OverlayGroupsController = ReturnType<typeof useOverlayGroupsController>;

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

function session(): AuthSessionState {
    return {
        method: 'nip07',
        pubkey: 'a'.repeat(64),
        readonly: false,
        locked: false,
        capabilities: { canSign: true, canEncrypt: false, encryptionSchemes: [] },
        createdAt: 1,
    };
}

function snapshot(relay: string, id: string, name: string): GroupsRuntimeSnapshot {
    return {
        group: { relay, id, key: `${relay}'${id}`, external: `${new URL(relay).host}'${id}` },
        metadata: { id, name, about: `${name} description`, private: false, restricted: false, hidden: false, closed: false },
        metadataVerified: relay !== 'wss://fallback.example',
        admins: undefined,
        members: undefined,
        roles: undefined,
        timeline: [],
    };
}

async function waitFor(condition: () => boolean): Promise<void> {
    for (let index = 0; index < 40; index += 1) {
        if (condition()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
        act(() => {});
    }
    throw new Error('Condition was not met in time');
}

async function render(element: ReactElement, queryClient: QueryClient = createNostrOverlayQueryClient()): Promise<Rendered> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
    });
    const rendered = { container, root, queryClient };
    mounted.push(rendered);
    return rendered;
}

describe('useOverlayGroupsController', () => {
    test('groups saved, remembered, and discovered groups by relay and selects the deep-linked group', async () => {
        let controller: OverlayGroupsController | undefined;
        const service: OverlayGroupsService = {
            loadGroups: vi.fn(async () => ({
                saved: [{ relay: 'wss://relay.example', id: 'maps' }],
                remembered: [{ relay: 'wss://relay.example', id: 'parks' }],
                discovered: [{ relay: 'wss://fallback.example', id: 'artists' }],
            })),
            loadGroup: vi.fn(async ({ group }) => {
                const address = group as { relay: string; id: string };
                return snapshot(address.relay, address.id, address.id);
            }),
            publishMessage: vi.fn(),
            requestJoin: vi.fn(),
            requestLeave: vi.fn(),
            savePublicGroups: vi.fn(),
        };
        const selectedGroupAddress = { relay: 'wss://fallback.example', id: 'artists' };
        const configuredGroupRelays = ['wss://relay.example', 'wss://empty.example'];
        const authSession = session();

        function Harness() {
            controller = useOverlayGroupsController({
                enabled: true,
                ownerPubkey: 'a'.repeat(64),
                session: authSession,
                service,
                configuredGroupRelays,
                selectedGroupAddress,
                errorFallbackMessage: 'Could not load groups',
            });
            return null;
        }

        await render(<Harness />);
        await waitFor(() => controller?.selectedGroupId === "wss://fallback.example'artists");

        expect(controller?.relays.map((relay) => relay.relayUrl)).toEqual([
            'wss://relay.example',
            'wss://empty.example',
            'wss://fallback.example',
        ]);
        expect(controller?.selectedRelayUrl).toBe('wss://fallback.example');
        expect(controller?.selectedRelayGroups.map((group) => group.name)).toEqual(['artists']);
        expect(controller?.groups.find((group) => group.name === 'maps')?.isSaved).toBe(true);
        expect(controller?.groups.find((group) => group.name === 'parks')?.isRemembered).toBe(true);
    });

    test('does not preload every group detail while loading the group list', async () => {
        let controller: OverlayGroupsController | undefined;
        const service: OverlayGroupsService = {
            loadGroups: vi.fn(async () => ({
                saved: [{ relay: 'wss://relay.example', id: 'maps' }],
                remembered: [{ relay: 'wss://relay.example', id: 'parks' }],
                discovered: [{ relay: 'wss://relay.example', id: 'artists' }],
            })),
            loadGroup: vi.fn(async ({ group }) => {
                const address = group as { relay: string; id: string };
                return snapshot(address.relay, address.id, address.id);
            }),
            publishMessage: vi.fn(),
            requestJoin: vi.fn(),
            requestLeave: vi.fn(),
            savePublicGroups: vi.fn(),
        };

        function Harness() {
            controller = useOverlayGroupsController({
                enabled: true,
                ownerPubkey: 'a'.repeat(64),
                session: session(),
                service,
                configuredGroupRelays: ['wss://relay.example'],
                errorFallbackMessage: 'Could not load groups',
            });
            return null;
        }

        await render(<Harness />);
        await waitFor(() => controller?.groups.length === 3);
        await waitFor(() => (service.loadGroup as ReturnType<typeof vi.fn>).mock.calls.length === 1);

        expect(service.loadGroups).toHaveBeenCalledTimes(1);
        expect(service.loadGroup).toHaveBeenCalledTimes(1);
    });

    test('marks remembered groups pending until selected detail confirms membership', async () => {
        let controller: OverlayGroupsController | undefined;
        const service: OverlayGroupsService = {
            loadGroups: vi.fn(async () => ({
                saved: [],
                remembered: [{ relay: 'wss://relay.example', id: 'parks' }],
                discovered: [],
            })),
            loadGroup: vi.fn(async () => ({
                ...snapshot('wss://relay.example', 'parks', 'parks'),
                members: { id: 'parks', pubkeys: ['a'.repeat(64)] },
            })),
            publishMessage: vi.fn(),
            requestJoin: vi.fn(),
            requestLeave: vi.fn(),
            savePublicGroups: vi.fn(),
        };

        function Harness() {
            controller = useOverlayGroupsController({
                enabled: true,
                ownerPubkey: 'a'.repeat(64),
                session: session(),
                service,
                configuredGroupRelays: ['wss://relay.example'],
                errorFallbackMessage: 'Could not load groups',
            });
            return null;
        }

        await render(<Harness />);
        await waitFor(() => controller?.groups[0]?.membershipStatus === 'confirmed');

        expect(controller?.groups[0]?.isRemembered).toBe(true);
        expect(controller?.groups[0]?.membershipStatus).toBe('confirmed');
    });

    test('keeps remembered groups pending when relay members do not include the owner', async () => {
        let controller: OverlayGroupsController | undefined;
        const service: OverlayGroupsService = {
            loadGroups: vi.fn(async () => ({
                saved: [],
                remembered: [{ relay: 'wss://relay.example', id: 'parks' }],
                discovered: [],
            })),
            loadGroup: vi.fn(async () => ({
                ...snapshot('wss://relay.example', 'parks', 'parks'),
                members: { id: 'parks', pubkeys: ['b'.repeat(64)] },
            })),
            publishMessage: vi.fn(),
            requestJoin: vi.fn(),
            requestLeave: vi.fn(),
            savePublicGroups: vi.fn(),
        };

        function Harness() {
            controller = useOverlayGroupsController({
                enabled: true,
                ownerPubkey: 'a'.repeat(64),
                session: session(),
                service,
                configuredGroupRelays: ['wss://relay.example'],
                errorFallbackMessage: 'Could not load groups',
            });
            return null;
        }

        await render(<Harness />);
        await waitFor(() => controller?.groups[0]?.membershipStatus === 'pending');

        expect(controller?.groups[0]?.isRemembered).toBe(true);
        expect(controller?.groups[0]?.membershipStatus).toBe('pending');
    });

    test('join uses invite code, remembers locally, and does not save public groups', async () => {
        let controller: OverlayGroupsController | undefined;
        const requestJoin = vi.fn(async () => undefined);
        const savePublicGroups = vi.fn(async () => undefined);
        const rememberGroup = vi.fn();
        const service: OverlayGroupsService = {
            loadGroups: vi.fn(async () => ({ saved: [], remembered: [], discovered: [{ relay: 'wss://relay.example', id: 'parks' }] })),
            loadGroup: vi.fn(async () => snapshot('wss://relay.example', 'parks', 'parks')),
            publishMessage: vi.fn(),
            requestJoin,
            requestLeave: vi.fn(),
            savePublicGroups,
        };
        const selectedGroupAddress = { relay: 'wss://relay.example', id: 'parks' };
        const configuredGroupRelays = ['wss://relay.example'];
        const authSession = session();

        function Harness() {
            controller = useOverlayGroupsController({
                enabled: true,
                ownerPubkey: 'a'.repeat(64),
                session: authSession,
                service,
                configuredGroupRelays,
                selectedGroupAddress,
                selectedInviteCode: 'invite-code',
                onRememberGroup: rememberGroup,
                errorFallbackMessage: 'Could not load groups',
            });
            return null;
        }

        await render(<Harness />);
        await waitFor(() => controller?.selectedGroupId === "wss://relay.example'parks");

        await act(async () => {
            await controller?.requestJoin("wss://relay.example'parks");
        });

        expect(requestJoin).toHaveBeenCalledWith({ group: { relay: 'wss://relay.example', id: 'parks' }, code: 'invite-code' });
        expect(rememberGroup).toHaveBeenCalledWith({ relay: 'wss://relay.example', id: 'parks' });
        expect(savePublicGroups).not.toHaveBeenCalled();
        expect(controller?.groups.find((group) => group.name === 'parks')?.isRemembered).toBe(true);

        await act(async () => {
            await controller?.saveGroup("wss://relay.example'parks");
        });

        expect(savePublicGroups).toHaveBeenCalledWith({ groups: [{ relay: 'wss://relay.example', id: 'parks' }] });
    });

    test('reuses cached groups after remounting with the same owner and relays', async () => {
        let controller: OverlayGroupsController | undefined;
        const service: OverlayGroupsService = {
            loadGroups: vi.fn(async () => ({ saved: [{ relay: 'wss://relay.example', id: 'maps' }], remembered: [], discovered: [] })),
            loadGroup: vi.fn(async () => snapshot('wss://relay.example', 'maps', 'maps')),
            publishMessage: vi.fn(),
            requestJoin: vi.fn(),
            requestLeave: vi.fn(),
            savePublicGroups: vi.fn(),
        };
        const authSession = session();
        const queryClient = createNostrOverlayQueryClient();
        let show = true;

        function Harness() {
            if (!show) {
                return null;
            }

            controller = useOverlayGroupsController({
                enabled: true,
                ownerPubkey: 'a'.repeat(64),
                session: authSession,
                service,
                configuredGroupRelays: ['wss://relay.example'],
                errorFallbackMessage: 'Could not load groups',
            });
            return null;
        }

        const rendered = await render(<Harness />, queryClient);
        await waitFor(() => controller?.selectedGroupId === "wss://relay.example'maps");
        show = false;
        await act(async () => {
            rendered.root.render(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>);
        });

        controller = undefined;
        show = true;
        await act(async () => {
            rendered.root.render(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>);
        });

        const currentController = controller as unknown as OverlayGroupsController;
        expect(currentController.groups.map((group) => group.name)).toEqual(['maps']);
        expect(currentController.isLoading).toBe(false);
        expect(service.loadGroups).toHaveBeenCalledTimes(1);
        expect(service.loadGroup).toHaveBeenCalledTimes(1);
    });

    test('keeps cached groups visible without full-page loading during background refresh', async () => {
        let controller: OverlayGroupsController | undefined;
        let enabled = true;
        let resolveSecondLoad: (() => void) | undefined;
        const loadGroups = vi
            .fn<OverlayGroupsService['loadGroups']>()
            .mockResolvedValueOnce({ saved: [{ relay: 'wss://relay.example', id: 'maps' }], remembered: [], discovered: [] })
            .mockImplementationOnce(async () => {
                await new Promise<void>((resolve) => {
                    resolveSecondLoad = resolve;
                });
                return { saved: [{ relay: 'wss://relay.example', id: 'maps' }], remembered: [], discovered: [] };
            });
        const service: OverlayGroupsService = {
            loadGroups,
            loadGroup: vi.fn(async () => snapshot('wss://relay.example', 'maps', 'maps')),
            publishMessage: vi.fn(),
            requestJoin: vi.fn(),
            requestLeave: vi.fn(),
            savePublicGroups: vi.fn(),
        };
        const authSession = session();

        function Harness() {
            controller = useOverlayGroupsController({
                enabled,
                ownerPubkey: 'a'.repeat(64),
                session: authSession,
                service,
                configuredGroupRelays: ['wss://relay.example'],
                errorFallbackMessage: 'Could not load groups',
            });
            return null;
        }

        const rendered = await render(<Harness />);
        await waitFor(() => controller?.selectedGroupId === "wss://relay.example'maps");

        enabled = false;
        await act(async () => {
            rendered.root.render(<QueryClientProvider client={rendered.queryClient}><Harness /></QueryClientProvider>);
        });
        await rendered.queryClient.invalidateQueries();
        enabled = true;
        await act(async () => {
            rendered.root.render(<QueryClientProvider client={rendered.queryClient}><Harness /></QueryClientProvider>);
        });
        await waitFor(() => loadGroups.mock.calls.length === 2);

        const currentController = controller as unknown as OverlayGroupsController;
        expect(currentController.groups.map((group) => group.name)).toEqual(['maps']);
        expect(currentController.isLoading).toBe(false);

        await act(async () => {
            resolveSecondLoad?.();
        });
    });

    test('keeps cached groups visible when a background refresh fails', async () => {
        let controller: OverlayGroupsController | undefined;
        const loadGroups = vi
            .fn<OverlayGroupsService['loadGroups']>()
            .mockResolvedValueOnce({ saved: [{ relay: 'wss://relay.example', id: 'maps' }], remembered: [], discovered: [] })
            .mockRejectedValue(new Error('relay timeout'));
        const service: OverlayGroupsService = {
            loadGroups,
            loadGroup: vi.fn(async () => snapshot('wss://relay.example', 'maps', 'maps')),
            publishMessage: vi.fn(),
            requestJoin: vi.fn(),
            requestLeave: vi.fn(),
            savePublicGroups: vi.fn(),
        };
        const authSession = session();

        function Harness() {
            controller = useOverlayGroupsController({
                enabled: true,
                ownerPubkey: 'a'.repeat(64),
                session: authSession,
                service,
                configuredGroupRelays: ['wss://relay.example'],
                errorFallbackMessage: 'Could not load groups',
            });
            return null;
        }

        await render(<Harness />);
        await waitFor(() => controller?.selectedGroupId === "wss://relay.example'maps");

        await act(async () => {
            await controller?.retry();
        });
        expect(loadGroups.mock.calls.length).toBeGreaterThan(1);

        const currentController = controller as OverlayGroupsController;
        expect(currentController.groups.map((group) => group.name)).toEqual(['maps']);
        expect(currentController.error).toBeNull();
    });
});
