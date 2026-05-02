import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAuthService } from '../../nostr/auth/auth-service';
import type { AuthProvider, ProviderResolveInput } from '../../nostr/auth/providers/types';
import {
    isDirectMessagesEnabled,
    isEncryptionEnabled,
    isWriteEnabled,
    type AuthSessionState,
    type LoginMethod,
} from '../../nostr/auth/session';
import type { HttpClientAuthContext } from '../../nostr-api/http-client';
import { createWriteGateway } from '../../nostr/write-gateway';

const AUTH_PROOF_TIMEOUT_MS = 8_000;

export type SavedLocalAccount = { pubkey: string; mode: 'device' | 'passphrase' };

export interface OverlaySessionAuthService {
    getSession(): AuthSessionState | undefined;
    getActiveProvider(): AuthProvider | undefined;
    getSavedLocalAccount(): Promise<SavedLocalAccount | undefined>;
    restoreSession(input?: { allowedMethods?: readonly LoginMethod[] }): Promise<AuthSessionState | undefined>;
    startSession(method: LoginMethod, input: ProviderResolveInput): Promise<AuthSessionState>;
    logout(): Promise<void>;
}

export interface UseOverlaySessionControllerOptions {
    authService?: OverlaySessionAuthService | undefined;
    enabled: boolean;
    configureAuthHeaders?: ((getAuthHeaders: ((context: HttpClientAuthContext) => Promise<Record<string, string> | undefined>) | undefined) => void) | undefined;
    setWriteGateway?: ((writeGateway: ReturnType<typeof createWriteGateway> | undefined) => void) | undefined;
    onRestoredSession?: ((session: AuthSessionState) => void | Promise<void>) | undefined;
    publicDemoMode?: boolean;
}

export interface OverlaySessionController {
    authService: OverlaySessionAuthService;
    authSession: AuthSessionState | undefined;
    savedLocalAccount: SavedLocalAccount | undefined;
    sessionRestorationResolved: boolean;
    canWrite: boolean;
    canEncrypt: boolean;
    canDirectMessages: boolean;
    writeGateway: ReturnType<typeof createWriteGateway>;
    startSession: (method: LoginMethod, input: ProviderResolveInput) => Promise<{ session: AuthSessionState; savedLocalAccount: SavedLocalAccount | undefined }>;
    logoutSession: () => Promise<SavedLocalAccount | undefined>;
}

function toAbsoluteRequestUrl(url: string): string {
    try {
        return new URL(url, window.location.origin).toString();
    } catch {
        return url;
    }
}

function encodeNostrAuthEvent(event: unknown): string {
    const json = JSON.stringify(event);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}

async function maybeComputePayloadHash(input: unknown): Promise<string | undefined> {
    if (input === undefined || input === null) {
        return undefined;
    }

    if (!globalThis.crypto?.subtle) {
        return undefined;
    }

    const body = typeof input === 'string' ? input : JSON.stringify(input);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        promise.then(
            (value) => {
                window.clearTimeout(timeoutId);
                resolve(value);
            },
            (error: unknown) => {
                window.clearTimeout(timeoutId);
                reject(error);
            },
        );
    });
}

export function useOverlaySessionController(options: UseOverlaySessionControllerOptions): OverlaySessionController {
    const defaultAuthService = useMemo(() => createAuthService(), []);
    const authService = options.authService ?? defaultAuthService;
    const didRestoreSessionRef = useRef(false);
    const [authSession, setAuthSession] = useState<AuthSessionState | undefined>(undefined);
    const [savedLocalAccount, setSavedLocalAccount] = useState<SavedLocalAccount | undefined>(undefined);
    const [sessionRestorationResolved, setSessionRestorationResolved] = useState(false);
    const onRestoredSession = options.onRestoredSession;
    const publicDemoMode = options.publicDemoMode ?? false;

    const writeGateway = useMemo(
        () =>
            createWriteGateway({
                getSession: () => authService.getSession(),
                getProvider: () => authService.getActiveProvider(),
            }),
        [authService],
    );

    const getAuthHeaders = useCallback(async (context: HttpClientAuthContext): Promise<Record<string, string> | undefined> => {
        const session = authService.getSession();
        if (!session || session.readonly || session.locked) {
            return undefined;
        }

        try {
            const absoluteUrl = toAbsoluteRequestUrl(context.url);
            const payloadHash = await maybeComputePayloadHash(context.body);
            const authEvent = await withTimeout(
                writeGateway.publishEvent({
                    kind: 27_235,
                    content: '',
                    created_at: Math.floor(Date.now() / 1000),
                    tags: [
                        ['u', absoluteUrl],
                        ['method', context.method.toUpperCase()],
                        ['nonce', `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`],
                        ...(payloadHash ? [['payload', payloadHash]] : []),
                    ],
                }),
                AUTH_PROOF_TIMEOUT_MS,
                'Timed out while signing Nostr auth proof',
            );

            return {
                authorization: `Nostr ${encodeNostrAuthEvent(authEvent)}`,
            };
        } catch {
            return undefined;
        }
    }, [authService, writeGateway]);

    useEffect(() => {
        options.configureAuthHeaders?.(getAuthHeaders);
        return () => options.configureAuthHeaders?.(undefined);
    }, [getAuthHeaders, options]);

    useEffect(() => {
        options.setWriteGateway?.(writeGateway);
        return () => options.setWriteGateway?.(undefined);
    }, [options, writeGateway]);

    useEffect(() => {
        if (didRestoreSessionRef.current) {
            return;
        }

        if (!options.enabled) {
            setSessionRestorationResolved(true);
            return;
        }

        didRestoreSessionRef.current = true;
        void (async () => {
            try {
                const restored = await authService.restoreSession(
                    publicDemoMode ? { allowedMethods: ['npub'] } : undefined,
                );
                const nextSavedLocalAccount = publicDemoMode
                    ? undefined
                    : await authService.getSavedLocalAccount();
                setSavedLocalAccount(nextSavedLocalAccount);

                if (!restored) {
                    return;
                }

                setAuthSession(restored);
                await onRestoredSession?.(restored);
            } finally {
                setSessionRestorationResolved(true);
            }
        })();
    }, [authService, onRestoredSession, options.enabled, publicDemoMode]);

    const startSession = useCallback(async (method: LoginMethod, input: ProviderResolveInput) => {
        if (publicDemoMode && method !== 'npub') {
            throw new Error('Public demo mode only allows npub read-only sessions');
        }

        const session = await authService.startSession(method, input);
        const nextSavedLocalAccount = publicDemoMode
            ? undefined
            : await authService.getSavedLocalAccount();
        setAuthSession(session);
        setSavedLocalAccount(nextSavedLocalAccount);
        return { session, savedLocalAccount: nextSavedLocalAccount };
    }, [authService, publicDemoMode]);

    const logoutSession = useCallback(async () => {
        await authService.logout();
        const nextSavedLocalAccount = publicDemoMode
            ? undefined
            : await authService.getSavedLocalAccount();
        setAuthSession(undefined);
        setSavedLocalAccount(nextSavedLocalAccount);
        return nextSavedLocalAccount;
    }, [authService, publicDemoMode]);

    return {
        authService,
        authSession,
        savedLocalAccount,
        sessionRestorationResolved,
        canWrite: isWriteEnabled(authSession),
        canEncrypt: isEncryptionEnabled(authSession),
        canDirectMessages: isDirectMessagesEnabled(authSession),
        writeGateway,
        startSession,
        logoutSession,
    };
}
