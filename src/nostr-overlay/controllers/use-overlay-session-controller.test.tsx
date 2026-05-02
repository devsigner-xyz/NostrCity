import { act, useEffect, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createAuthSession, type AuthSessionState, type LoginMethod } from '../../nostr/auth/session';
import type { AuthProvider, ProviderResolveInput, UnsignedNostrEvent } from '../../nostr/auth/providers/types';
import type { HttpClientAuthContext } from '../../nostr-api/http-client';
import { useOverlaySessionController, type OverlaySessionAuthService, type OverlaySessionController } from './use-overlay-session-controller';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

const mountedRoots: RenderResult[] = [];

function createSession(pubkey: string = 'a'.repeat(64), method: LoginMethod = 'local'): AuthSessionState {
    return createAuthSession({
        method,
        pubkey,
        createdAt: 123,
    });
}

function createFakeAuthService(input: {
    restoredSession?: AuthSessionState;
    savedLocalAccount?: { pubkey: string; mode: 'device' | 'passphrase' };
    savedLocalAccountAfterLogout?: { pubkey: string; mode: 'device' | 'passphrase' };
    activeProvider?: AuthProvider;
} = {}): OverlaySessionAuthService & {
    logout: ReturnType<typeof vi.fn>;
    restoreSession: ReturnType<typeof vi.fn>;
    startSession: ReturnType<typeof vi.fn>;
} {
    const logout = vi.fn(async () => {
        didLogout = true;
    });
    const restoreSession = vi.fn(async () => input.restoredSession);
    const startSession = vi.fn(async (method: LoginMethod, _sessionInput: ProviderResolveInput) => {
        return input.restoredSession ?? createSession(undefined, method);
    });
    let didLogout = false;

    return {
        getSession: () => input.restoredSession,
        getActiveProvider: () => input.activeProvider,
        restoreSession,
        startSession,
        logout,
        getSavedLocalAccount: async () => didLogout
            ? input.savedLocalAccountAfterLogout
            : input.savedLocalAccount,
    };
}

function Harness(props: {
    authService?: OverlaySessionAuthService;
    enabled?: boolean;
    configureAuthHeaders?: ((getAuthHeaders: ((context: HttpClientAuthContext) => Promise<Record<string, string> | undefined>) | undefined) => void) | undefined;
    onRestoredSession?: (session: AuthSessionState) => void | Promise<void>;
    publicDemoMode?: boolean;
    onController: (controller: OverlaySessionController) => void;
}): ReactElement | null {
    const controller = useOverlaySessionController({
        authService: props.authService,
        enabled: props.enabled ?? true,
        configureAuthHeaders: props.configureAuthHeaders,
        onRestoredSession: props.onRestoredSession,
        publicDemoMode: props.publicDemoMode ?? false,
    });

    useEffect(() => {
        props.onController(controller);
    }, [controller, props]);

    return null;
}

async function renderHarness(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    const result = { container, root };
    mountedRoots.push(result);
    return result;
}

async function flushEffects(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
    });
}

afterEach(() => {
    for (const { root, container } of mountedRoots.splice(0)) {
        act(() => root.unmount());
        container.remove();
    }
});

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('useOverlaySessionController', () => {
    test('creates a default auth service with an enabled NIP-46 provider', async () => {
        let latest: OverlaySessionController | undefined;

        await renderHarness(<Harness onController={(controller) => { latest = controller; }} />);
        await flushEffects();

        await expect(latest?.authService.startSession('nip46', {})).rejects.toThrow('Missing bunker URI for NIP-46 login');
    });

    test('resolves to anonymous session state when no session is restored', async () => {
        let latest: OverlaySessionController | undefined;
        const authService = createFakeAuthService();

        await renderHarness(<Harness authService={authService} onController={(controller) => { latest = controller; }} />);
        await flushEffects();

        expect(latest?.authSession).toBeUndefined();
        expect(latest?.savedLocalAccount).toBeUndefined();
        expect(latest?.canWrite).toBe(false);
        expect(latest?.canEncrypt).toBe(false);
        expect(latest?.canDirectMessages).toBe(false);
        expect(latest?.sessionRestorationResolved).toBe(true);
    });

    test('exposes restored logged-in session state', async () => {
        let latest: OverlaySessionController | undefined;
        const session = createSession();
        const savedLocalAccount = { pubkey: session.pubkey, mode: 'device' as const };
        const onRestoredSession = vi.fn();
        const authService = createFakeAuthService({ restoredSession: session, savedLocalAccount });

        await renderHarness(
            <Harness
                authService={authService}
                onRestoredSession={onRestoredSession}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();

        expect(latest?.authSession).toEqual(session);
        expect(latest?.savedLocalAccount).toEqual(savedLocalAccount);
        expect(latest?.canWrite).toBe(true);
        expect(latest?.canEncrypt).toBe(true);
        expect(latest?.canDirectMessages).toBe(true);
        expect(latest?.sessionRestorationResolved).toBe(true);
        expect(onRestoredSession).toHaveBeenCalledWith(session);
    });

    test('restricts restored sessions to npub in public demo mode', async () => {
        const authService = createFakeAuthService();

        await renderHarness(
            <Harness
                authService={authService}
                publicDemoMode
                onController={() => {}}
            />,
        );
        await flushEffects();

        expect(authService.restoreSession).toHaveBeenCalledWith({ allowedMethods: ['npub'] });
    });

    test('does not expose saved local accounts in public demo mode', async () => {
        let latest: OverlaySessionController | undefined;
        const savedLocalAccount = { pubkey: 'f'.repeat(64), mode: 'device' as const };
        const authService = createFakeAuthService({ savedLocalAccount });

        await renderHarness(
            <Harness
                authService={authService}
                publicDemoMode
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();

        expect(latest?.savedLocalAccount).toBeUndefined();
    });

    test('allows npub session starts in public demo mode', async () => {
        let latest: OverlaySessionController | undefined;
        const authService = createFakeAuthService();

        await renderHarness(
            <Harness
                authService={authService}
                publicDemoMode
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();

        await act(async () => {
            await latest?.startSession('npub', { credential: 'npub1example' });
        });

        expect(authService.startSession).toHaveBeenCalledWith('npub', { credential: 'npub1example' });
        expect(latest?.authSession?.method).toBe('npub');
        expect(latest?.savedLocalAccount).toBeUndefined();
    });

    test('does not configure auth headers in public demo mode', async () => {
        let configuredGetAuthHeaders: ((context: HttpClientAuthContext) => Promise<Record<string, string> | undefined>) | undefined;

        await renderHarness(
            <Harness
                publicDemoMode
                configureAuthHeaders={(getAuthHeaders) => {
                    configuredGetAuthHeaders = getAuthHeaders;
                }}
                onController={() => {}}
            />,
        );
        await flushEffects();

        expect(configuredGetAuthHeaders).toBeUndefined();
    });

    test('rejects signed and local session starts in public demo mode', async () => {
        let latest: OverlaySessionController | undefined;
        const authService = createFakeAuthService();

        await renderHarness(
            <Harness
                authService={authService}
                publicDemoMode
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();

        await expect(latest?.startSession('local', {})).rejects.toThrow('Public demo mode only allows npub read-only sessions');
        await expect(latest?.startSession('nip07', {})).rejects.toThrow('Public demo mode only allows npub read-only sessions');
        await expect(latest?.startSession('nip46', {})).rejects.toThrow('Public demo mode only allows npub read-only sessions');
        expect(authService.startSession).not.toHaveBeenCalled();
    });

    test('logout callback clears session state and keeps saved local account status', async () => {
        let latest: OverlaySessionController | undefined;
        const session = createSession();
        const savedLocalAccountAfterLogout = { pubkey: session.pubkey, mode: 'passphrase' as const };
        const authService = createFakeAuthService({
            restoredSession: session,
            savedLocalAccountAfterLogout,
        });

        await renderHarness(<Harness authService={authService} onController={(controller) => { latest = controller; }} />);
        await flushEffects();

        await act(async () => {
            await latest?.logoutSession();
        });

        expect(authService.logout).toHaveBeenCalledTimes(1);
        expect(latest?.authSession).toBeUndefined();
        expect(latest?.savedLocalAccount).toEqual(savedLocalAccountAfterLogout);
        expect(latest?.canWrite).toBe(false);
        expect(latest?.canEncrypt).toBe(false);
        expect(latest?.canDirectMessages).toBe(false);
    });

    test('logout callback keeps saved local accounts hidden in public demo mode', async () => {
        let latest: OverlaySessionController | undefined;
        const session = createSession('a'.repeat(64), 'npub');
        const savedLocalAccountAfterLogout = { pubkey: 'f'.repeat(64), mode: 'device' as const };
        const authService = createFakeAuthService({
            restoredSession: session,
            savedLocalAccountAfterLogout,
        });

        await renderHarness(
            <Harness
                authService={authService}
                publicDemoMode
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();

        await act(async () => {
            const savedLocalAccount = await latest?.logoutSession();
            expect(savedLocalAccount).toBeUndefined();
        });

        expect(authService.logout).toHaveBeenCalledTimes(1);
        expect(latest?.authSession).toBeUndefined();
        expect(latest?.savedLocalAccount).toBeUndefined();
    });

    test('includes payload hash for an empty string request body', async () => {
        let configureAuthHeaders: ((context: HttpClientAuthContext) => Promise<Record<string, string> | undefined>) | undefined;
        let signedEvent: UnsignedNostrEvent | undefined;
        const session = createSession();
        const authService = createFakeAuthService({
            restoredSession: session,
            activeProvider: {
                method: 'local',
                supports: session.capabilities,
                resolveSession: vi.fn(),
                signEvent: vi.fn(async (event: UnsignedNostrEvent) => {
                    signedEvent = event;
                    return {
                        ...event,
                        id: '1'.repeat(64),
                        pubkey: session.pubkey,
                        sig: '2'.repeat(128),
                    };
                }),
                encrypt: vi.fn(),
                decrypt: vi.fn(),
                lock: vi.fn(),
            },
        });

        await renderHarness(
            <Harness
                authService={authService}
                onController={() => {}}
                configureAuthHeaders={(nextGetAuthHeaders) => {
                    configureAuthHeaders = nextGetAuthHeaders;
                }}
            />,
        );
        await flushEffects();

        const headers = await configureAuthHeaders?.({ method: 'POST', path: '/v1/example', url: '/v1/example', body: '' });

        expect(headers?.authorization).toMatch(/^Nostr /);
        expect(signedEvent?.tags).toContainEqual([
            'payload',
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        ]);
    });
});
