import { createLocalKeyStorage, type LocalKeyStorage } from './local-key-storage';
import { LocalKeyAuthProvider } from './providers/local-key-provider';
import { Nip07AuthProvider } from './providers/nip07-provider';
import { Nip46AuthProvider, type Nip46Runtime, type Nip46RuntimeFactory } from './providers/nip46-provider';
import { createNip46Runtime } from './providers/nip46/runtime';
import { NpubAuthProvider } from './providers/npub-provider';
import type { AuthProvider, ProviderResolveInput } from './providers/types';
import {
    clearStoredAuthSession,
    loadStoredAuthSession,
    saveStoredAuthSession,
    type StoredAuthSession,
} from './secure-storage';
import {
    createAuthSession,
    defaultCapabilitiesForMethod,
    type AuthSessionState,
    type LoginMethod,
} from './session';

interface AuthServiceOptions {
    storage?: Storage;
    now?: () => number;
    providers?: Partial<Record<LoginMethod, AuthProvider>>;
    localKeyStorage?: LocalKeyStorage;
    createNip46Runtime?: Nip46RuntimeFactory;
}

type SessionListener = (session: AuthSessionState | undefined) => void;

interface RestoreSessionInput {
    passphrase?: string;
}

interface AuthService {
    getSession(): AuthSessionState | undefined;
    getActiveProvider(): AuthProvider | undefined;
    getSavedLocalAccount(): Promise<{ pubkey: string; mode: 'device' | 'passphrase' } | undefined>;
    subscribe(listener: SessionListener): () => void;
    startSession(method: LoginMethod, input: ProviderResolveInput): Promise<AuthSessionState>;
    restoreSession(input?: RestoreSessionInput): Promise<AuthSessionState | undefined>;
    switchMethod(method: LoginMethod, input: ProviderResolveInput): Promise<AuthSessionState>;
    logout(): Promise<void>;
}

function buildDefaultProviders(options: { createNip46Runtime?: Nip46RuntimeFactory | undefined } = {}): Record<LoginMethod, AuthProvider> {
    const createRuntime: Nip46RuntimeFactory = options.createNip46Runtime ?? (async (input) => createNip46Runtime({
        parsedUri: input.parsedUri,
        ...(input.clientSecretKey ? { clientSecretKey: input.clientSecretKey } : {}),
        ...(input.relays ? { relays: input.relays } : {}),
        ...(input.remoteSignerPubkey ? { remoteSignerPubkey: input.remoteSignerPubkey } : {}),
    }) as Nip46Runtime);

    return {
        npub: new NpubAuthProvider(),
        nip07: new Nip07AuthProvider(),
        nip46: new Nip46AuthProvider({ createRuntime }),
        local: new LocalKeyAuthProvider(),
    };
}

function toStoredSession(session: AuthSessionState): StoredAuthSession {
    return {
        method: session.method,
        pubkey: session.pubkey,
        readonly: session.readonly,
        locked: session.locked,
        createdAt: session.createdAt,
    };
}

function isLegacyNsecMethod(method: string): method is 'nsec' {
    return method === 'nsec';
}

export function createAuthService(options: AuthServiceOptions = {}): AuthService {
    const storage = options.storage;
    const now = options.now ?? (() => Date.now());
    const providerMap: Record<LoginMethod, AuthProvider> = {
        ...buildDefaultProviders({ createNip46Runtime: options.createNip46Runtime }),
        ...(options.providers ?? {}),
    };
    const localKeyStorage = options.localKeyStorage ?? createLocalKeyStorage({
        ...(storage ? { storage } : {}),
        now,
    });
    const listeners = new Set<SessionListener>();

    let currentSession: AuthSessionState | undefined;
    let activeProvider: AuthProvider | undefined;

    const notify = () => {
        listeners.forEach((listener) => listener(currentSession));
    };

    const persist = async (session: AuthSessionState, input: ProviderResolveInput) => {
        if (session.method === 'local' && input.secretKey instanceof Uint8Array) {
            await localKeyStorage.save({
                pubkey: session.pubkey,
                secretKey: input.secretKey,
                ...(input.passphrase ? { passphrase: input.passphrase } : {}),
            });
        }

        if (session.method === 'nip46') {
            clearStoredAuthSession(storage);
        } else {
            saveStoredAuthSession(toStoredSession(session), storage);
        }
    };

    return {
        getSession(): AuthSessionState | undefined {
            return currentSession;
        },

        getActiveProvider(): AuthProvider | undefined {
            return activeProvider;
        },

        async getSavedLocalAccount(): Promise<{ pubkey: string; mode: 'device' | 'passphrase' } | undefined> {
            return localKeyStorage.inspectSavedAccount();
        },

        subscribe(listener: SessionListener): () => void {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },

        async startSession(method: LoginMethod, input: ProviderResolveInput): Promise<AuthSessionState> {
            if (isLegacyNsecMethod(method)) {
                throw new Error('nsec login is no longer supported');
            }

            const provider = providerMap[method];
            if (!provider) {
                throw new Error(`Unsupported login method: ${method}`);
            }

            let resolvedInput = input;
            if (method === 'local' && !(input.secretKey instanceof Uint8Array)) {
                const pubkey = input.pubkey ?? currentSession?.pubkey;
                if (!pubkey) {
                    throw new Error('No se encontro una cuenta local para desbloquear');
                }

                let restoredLocalKey;
                try {
                    restoredLocalKey = await localKeyStorage.load({
                        pubkey,
                        ...(input.passphrase ? { passphrase: input.passphrase } : {}),
                    });
                } catch {
                    throw new Error('No se pudo desbloquear la cuenta local con esa passphrase');
                }

                if (restoredLocalKey.status === 'locked') {
                    throw new Error('La cuenta local requiere passphrase para desbloquearse');
                }

                if (restoredLocalKey.status === 'missing') {
                    throw new Error('No se encontro material local guardado para esta cuenta');
                }

                resolvedInput = {
                    ...input,
                    pubkey,
                    secretKey: restoredLocalKey.secretKey,
                };
            }

            const resolved = await provider.resolveSession(resolvedInput);

            const baseSession = createAuthSession({
                method: resolved.method,
                pubkey: resolved.pubkey,
                locked: resolved.locked,
                createdAt: now(),
                capabilities: resolved.capabilities,
            });

            currentSession = {
                ...baseSession,
                readonly: resolved.readonly,
                locked: resolved.locked,
                capabilities: resolved.capabilities,
            };
            activeProvider = provider;

            await persist(currentSession, resolvedInput);
            notify();

            return currentSession;
        },

        async restoreSession(input: RestoreSessionInput = {}): Promise<AuthSessionState | undefined> {
            void input;
            const stored = loadStoredAuthSession(storage);
            if (!stored) {
                currentSession = undefined;
                activeProvider = undefined;
                return undefined;
            }

            const storedMethod = stored.method;

            if (isLegacyNsecMethod(storedMethod)) {
                clearStoredAuthSession(storage);
                currentSession = undefined;
                activeProvider = undefined;
                notify();
                return undefined;
            }

            if (storedMethod === 'nip07') {
                try {
                    return await this.startSession('nip07', {});
                } catch {
                    clearStoredAuthSession(storage);
                    currentSession = undefined;
                    activeProvider = undefined;
                    notify();
                    return undefined;
                }
            }

            if (storedMethod === 'nip46') {
                clearStoredAuthSession(storage);
                currentSession = undefined;
                activeProvider = undefined;
                notify();
                return undefined;
            }

            if (storedMethod === 'local') {
                const restoredLocalKey = await localKeyStorage.load({
                    pubkey: stored.pubkey,
                    ...(input.passphrase ? { passphrase: input.passphrase } : {}),
                });

                if (restoredLocalKey.status === 'available') {
                    return this.startSession('local', {
                        pubkey: stored.pubkey,
                        secretKey: restoredLocalKey.secretKey,
                        ...(input.passphrase ? { passphrase: input.passphrase } : {}),
                    });
                }

                if (restoredLocalKey.status === 'locked') {
                    currentSession = {
                        ...createAuthSession({
                            method: storedMethod,
                            pubkey: stored.pubkey,
                            locked: true,
                            createdAt: stored.createdAt,
                            capabilities: defaultCapabilitiesForMethod(storedMethod),
                        }),
                        readonly: stored.readonly,
                        locked: true,
                    };
                    activeProvider = undefined;
                    notify();
                    return currentSession;
                }

                clearStoredAuthSession(storage);
                currentSession = undefined;
                activeProvider = undefined;
                notify();
                return undefined;
            }

            const requiresRecoveredProvider = storedMethod !== 'npub';
            const restoredLocked = stored.locked || requiresRecoveredProvider;

            currentSession = {
                ...createAuthSession({
                    method: storedMethod,
                    pubkey: stored.pubkey,
                    locked: restoredLocked,
                    createdAt: stored.createdAt,
                    capabilities: defaultCapabilitiesForMethod(storedMethod),
                }),
                readonly: stored.readonly,
                locked: restoredLocked,
            };
            activeProvider = undefined;
            notify();

            return currentSession;
        },

        async switchMethod(method: LoginMethod, input: ProviderResolveInput): Promise<AuthSessionState> {
            if (isLegacyNsecMethod(method)) {
                throw new Error('nsec login is no longer supported');
            }

            if (activeProvider) {
                await activeProvider.lock();
            }

            return this.startSession(method, input);
        },

        async logout(): Promise<void> {
            if (activeProvider) {
                await activeProvider.lock();
            }

            clearStoredAuthSession(storage);
            currentSession = undefined;
            activeProvider = undefined;
            notify();
        },
    };
}
