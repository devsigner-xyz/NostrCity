import { normalizeRelayUrl } from './relay-policy';
import { buildStorageScopeKeys } from './storage-scope';
import type { WalletCapabilities, WalletConnection, WalletSettingsState } from './wallet-types';

export const WALLET_SETTINGS_STORAGE_KEY = 'nostr.overlay.wallet.v1';
const WALLET_SESSION_CONNECTION_STORAGE_KEY = 'nostr.overlay.wallet.session.v1';

interface StorageLike {
    readonly length?: number;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    key?(index: number): string | null;
}

interface WalletSettingsOptions {
    ownerPubkey?: string;
    storage?: StorageLike | null;
    sessionStorage?: StorageLike | null;
}

interface WalletSettingsPayload {
    activeConnection?: WalletConnection | null;
}

function getDefaultStorage(): StorageLike | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function getDefaultSessionStorage(): StorageLike | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

function normalizeCapabilities(value: WalletCapabilities | null | undefined): WalletCapabilities {
    return {
        payInvoice: Boolean(value?.payInvoice),
        makeInvoice: Boolean(value?.makeInvoice),
        notifications: Boolean(value?.notifications),
    };
}

function normalizeConnection(
    connection: WalletConnection | null | undefined,
    mode: 'persist' | 'load' = 'persist'
): WalletConnection | null {
    if (!connection) {
        return null;
    }

    if (connection.method === 'nwc') {
        const relays = [...new Set(connection.relays
            .map((relay) => normalizeRelayUrl(relay))
            .filter((relay): relay is string => relay !== null))];

        if (relays.length === 0) {
            return null;
        }

        return {
            method: 'nwc',
            uri: mode === 'load' ? '' : connection.uri.trim(),
            walletServicePubkey: connection.walletServicePubkey.trim().toLowerCase(),
            relays,
            secret: mode === 'load' ? '' : connection.secret.trim().toLowerCase(),
            encryption: connection.encryption === 'nip04' ? 'nip04' : 'nip44_v2',
            capabilities: normalizeCapabilities(connection.capabilities),
            restoreState: mode === 'load' ? 'reconnect-required' : connection.restoreState,
        };
    }

    return {
        method: 'webln',
        capabilities: normalizeCapabilities(connection.capabilities),
        restoreState: mode === 'load' ? 'reconnect-required' : connection.restoreState,
    };
}

function resolveStorage(options: WalletSettingsOptions): StorageLike | null {
    return options.storage ?? getDefaultStorage();
}

function resolveSessionStorage(options: WalletSettingsOptions): StorageLike | null {
    return options.sessionStorage ?? getDefaultSessionStorage();
}

function buildSessionConnectionKey(ownerPubkey: string | undefined): string {
    if (!ownerPubkey) {
        return WALLET_SESSION_CONNECTION_STORAGE_KEY;
    }

    return buildStorageScopeKeys({ baseKey: WALLET_SESSION_CONNECTION_STORAGE_KEY, ownerPubkey }).scopedKey;
}

function removeLegacySessionConnections(sessionStorage: StorageLike | null, ownerPubkey?: string): void {
    if (!sessionStorage) {
        return;
    }

    const keysToRemove = new Set([WALLET_SESSION_CONNECTION_STORAGE_KEY]);
    if (ownerPubkey) {
        keysToRemove.add(buildSessionConnectionKey(ownerPubkey));
    }

    if (typeof sessionStorage.length === 'number' && typeof sessionStorage.key === 'function') {
        const scopedPrefix = `${WALLET_SESSION_CONNECTION_STORAGE_KEY}:user:`;
        for (let index = 0; index < sessionStorage.length; index += 1) {
            const key = sessionStorage.key(index);
            if (key?.startsWith(scopedPrefix)) {
                keysToRemove.add(key);
            }
        }
    }

    for (const key of keysToRemove) {
        sessionStorage.removeItem(key);
    }
}

function parseState(raw: string | null): WalletSettingsState {
    if (!raw) {
        return getDefaultWalletSettings();
    }

    try {
        const parsed = JSON.parse(raw) as WalletSettingsPayload;
        return {
            activeConnection: normalizeConnection(parsed.activeConnection, 'load'),
        };
    } catch {
        return getDefaultWalletSettings();
    }
}

function containsSecretMaterial(raw: string): boolean {
    return raw.includes('secret=') || raw.includes('nostr+walletconnect://') || /"secret"\s*:/.test(raw);
}

function removeSecretBearingState(storage: StorageLike, key: string): void {
    const raw = storage.getItem(key);
    if (raw !== null && containsSecretMaterial(raw)) {
        storage.removeItem(key);
    }
}

function loadScrubbedState(storage: StorageLike, key: string): WalletSettingsState {
    const raw = storage.getItem(key);
    const state = parseState(raw);

    if (raw !== null) {
        if (state.activeConnection?.method === 'nwc') {
            storage.setItem(key, JSON.stringify(state));
        } else if (containsSecretMaterial(raw)) {
            storage.removeItem(key);
        }
    }

    return state;
}

export function getDefaultWalletSettings(): WalletSettingsState {
    return {
        activeConnection: null,
    };
}

export function loadWalletSettings(options: WalletSettingsOptions = {}): WalletSettingsState {
    const storage = resolveStorage(options);
    const sessionStorage = resolveSessionStorage(options);
    const keys = buildStorageScopeKeys(
        options.ownerPubkey === undefined
            ? { baseKey: WALLET_SETTINGS_STORAGE_KEY }
            : { baseKey: WALLET_SETTINGS_STORAGE_KEY, ownerPubkey: options.ownerPubkey }
    );

    if (!storage) {
        removeLegacySessionConnections(sessionStorage, keys.normalizedOwnerPubkey);
        return getDefaultWalletSettings();
    }

    if (!keys.normalizedOwnerPubkey) {
        removeLegacySessionConnections(sessionStorage);
        return loadScrubbedState(storage, WALLET_SETTINGS_STORAGE_KEY);
    }

    const scopedRaw = storage.getItem(keys.scopedKey);
    if (scopedRaw !== null) {
        removeLegacySessionConnections(sessionStorage, keys.normalizedOwnerPubkey);
        removeSecretBearingState(storage, WALLET_SETTINGS_STORAGE_KEY);
        return loadScrubbedState(storage, keys.scopedKey);
    }

    if (storage.getItem(keys.legacyMigrationMarkerKey)) {
        removeLegacySessionConnections(sessionStorage, keys.normalizedOwnerPubkey);
        removeSecretBearingState(storage, WALLET_SETTINGS_STORAGE_KEY);
        return getDefaultWalletSettings();
    }

    const legacy = loadScrubbedState(storage, WALLET_SETTINGS_STORAGE_KEY);
    storage.setItem(keys.scopedKey, JSON.stringify(legacy));
    storage.setItem(keys.legacyMigrationMarkerKey, keys.normalizedOwnerPubkey);
    storage.removeItem(WALLET_SETTINGS_STORAGE_KEY);
    removeLegacySessionConnections(sessionStorage, keys.normalizedOwnerPubkey);
    return legacy;
}

export function saveWalletSettings(
    state: WalletSettingsState,
    options: WalletSettingsOptions = {}
): WalletSettingsState {
    const nextState: WalletSettingsState = {
        activeConnection: normalizeConnection(state.activeConnection),
    };

    const storage = resolveStorage(options);
    const sessionStorage = resolveSessionStorage(options);
    const keys = buildStorageScopeKeys(
        options.ownerPubkey === undefined
            ? { baseKey: WALLET_SETTINGS_STORAGE_KEY }
            : { baseKey: WALLET_SETTINGS_STORAGE_KEY, ownerPubkey: options.ownerPubkey }
    );
    removeLegacySessionConnections(sessionStorage, keys.normalizedOwnerPubkey);

    if (!storage) {
        return nextState;
    }

    const payload: WalletSettingsPayload = {
        activeConnection: nextState.activeConnection?.method === 'nwc'
            ? {
                ...nextState.activeConnection,
                uri: '',
                secret: '',
                restoreState: 'reconnect-required',
            }
            : nextState.activeConnection,
    };

    if (keys.normalizedOwnerPubkey) {
        storage.setItem(keys.scopedKey, JSON.stringify(payload));
    } else {
        storage.setItem(WALLET_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    }

    return nextState;
}
