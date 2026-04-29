import { afterEach, describe, expect, test, vi } from 'vitest';
import { generateSecretKey } from 'nostr-tools/pure';
import { createAuthService } from './auth-service';
import { createLocalKeyStorage } from './local-key-storage';
import { AUTH_SESSION_STORAGE_KEY } from './secure-storage';
import { AUTH_PROVIDER_ERROR } from './providers/types';

const SAMPLE_NPUB = 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw';

function createMemoryStorage(): Storage {
    const values = new Map<string, string>();

    return {
        get length() {
            return values.size;
        },
        clear() {
            values.clear();
        },
        getItem(key) {
            return values.has(key) ? values.get(key)! : null;
        },
        key(index) {
            return Array.from(values.keys())[index] ?? null;
        },
        removeItem(key) {
            values.delete(key);
        },
        setItem(key, value) {
            values.set(key, value);
        },
    };
}

function createMemoryDeviceKeyStore() {
    const values = new Map<string, CryptoKey>();

    return {
        async get(pubkey: string) {
            return values.get(pubkey);
        },
        async getOrCreate(pubkey: string) {
            const existing = values.get(pubkey);
            if (existing) {
                return existing;
            }

            const created = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            values.set(pubkey, created);
            return created;
        },
        async delete(pubkey: string) {
            values.delete(pubkey);
        },
    };
}

describe('createAuthService', () => {
    afterEach(() => {
        delete (window as any).nostr;
    });

    test('starts npub readonly session and persists it', async () => {
        const storage = createMemoryStorage();
        const auth = createAuthService({ storage, now: () => 111 });

        const session = await auth.startSession('npub', { credential: SAMPLE_NPUB });

        expect(session.method).toBe('npub');
        expect(session.readonly).toBe(true);
        expect(session.createdAt).toBe(111);

        const persisted = storage.getItem(AUTH_SESSION_STORAGE_KEY);
        expect(persisted).not.toBeNull();
    });

    test('rejects startSession for nsec login method', async () => {
        const storage = createMemoryStorage();
        const auth = createAuthService({ storage });

        // TEST_VECTOR_DO_NOT_USE: public fixture for removed nsec-login coverage.
        await expect(
            auth.startSession('nsec' as any, {
                credential: 'nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5',
                passphrase: 'password1234',
            })
        ).rejects.toThrow('nsec login is no longer supported');
    });

    test('restores session from persisted state', async () => {
        const storage = createMemoryStorage();
        const authA = createAuthService({ storage });
        await authA.startSession('npub', { credential: SAMPLE_NPUB });

        const authB = createAuthService({ storage });
        const restored = await authB.restoreSession();

        expect(restored?.method).toBe('npub');
        expect(restored?.pubkey).toBeDefined();
        expect(authB.getSession()?.method).toBe('npub');
    });

    test('clears persisted nsec session on restore', async () => {
        const storage = createMemoryStorage();
        storage.setItem(
            AUTH_SESSION_STORAGE_KEY,
            JSON.stringify({
                method: 'nsec',
                pubkey: 'a'.repeat(64),
                readonly: false,
                locked: false,
                createdAt: 123,
            })
        );

        const authB = createAuthService({ storage });
        const restored = await authB.restoreSession();

        expect(restored).toBeUndefined();
        expect(authB.getSession()).toBeUndefined();
        expect(storage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    });

    test('switchMethod updates active session for supported method', async () => {
        const storage = createMemoryStorage();
        const auth = createAuthService({ storage });

        await auth.startSession('npub', { credential: SAMPLE_NPUB });
        const switched = await auth.switchMethod('npub', { credential: SAMPLE_NPUB });

        expect(switched.method).toBe('npub');
        expect(auth.getSession()?.method).toBe('npub');
    });

    test('rejects switchMethod to nsec login method', async () => {
        const storage = createMemoryStorage();
        const auth = createAuthService({ storage });

        await auth.startSession('npub', { credential: SAMPLE_NPUB });

        // TEST_VECTOR_DO_NOT_USE: public fixture for removed nsec-login coverage.
        await expect(
            auth.switchMethod('nsec' as any, {
                credential: 'nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5',
                passphrase: 'password1234',
            })
        ).rejects.toThrow('nsec login is no longer supported');
    });

    test('supports nip07 flow with browser extension', async () => {
        (window as any).nostr = {
            getPublicKey: vi.fn().mockResolvedValue('a'.repeat(64)),
            signEvent: vi.fn().mockResolvedValue({ sig: 'b'.repeat(128) }),
            nip44: {
                encrypt: vi.fn(),
                decrypt: vi.fn(),
            },
        };

        const storage = createMemoryStorage();
        const auth = createAuthService({ storage });
        const session = await auth.startSession('nip07', {});

        expect(session.method).toBe('nip07');
        expect(session.readonly).toBe(false);
        expect(session.capabilities.canEncrypt).toBe(true);
    });

    test('restores nip07 session by re-resolving extension provider', async () => {
        const getPublicKey = vi.fn().mockResolvedValue('a'.repeat(64));
        (window as any).nostr = {
            getPublicKey,
            signEvent: vi.fn().mockResolvedValue({ sig: 'b'.repeat(128) }),
            nip44: {
                encrypt: vi.fn(),
                decrypt: vi.fn(),
            },
        };

        const storage = createMemoryStorage();
        const authA = createAuthService({ storage });
        await authA.startSession('nip07', {});

        const authB = createAuthService({ storage });
        const restored = await authB.restoreSession();

        expect(restored?.method).toBe('nip07');
        expect(restored?.locked).toBe(false);
        expect(getPublicKey).toHaveBeenCalledTimes(2);
    });

    test('clears persisted nip07 session when extension is unavailable on restore', async () => {
        (window as any).nostr = {
            getPublicKey: vi.fn().mockResolvedValue('a'.repeat(64)),
            signEvent: vi.fn().mockResolvedValue({ sig: 'b'.repeat(128) }),
        };

        const storage = createMemoryStorage();
        const authA = createAuthService({ storage });
        await authA.startSession('nip07', {});

        delete (window as any).nostr;

        const authB = createAuthService({ storage });
        const restored = await authB.restoreSession();

        expect(restored).toBeUndefined();
        expect(storage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    });

    test('clears persisted nip46 session on restore because it requires explicit reconnect', async () => {
        const storage = createMemoryStorage();
        storage.setItem(
            AUTH_SESSION_STORAGE_KEY,
            JSON.stringify({
                method: 'nip46',
                pubkey: 'a'.repeat(64),
                readonly: false,
                locked: false,
                createdAt: 123,
            })
        );

        const auth = createAuthService({ storage });
        const restored = await auth.restoreSession();

        expect(restored).toBeUndefined();
        expect(auth.getSession()).toBeUndefined();
        expect(storage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    });

    test('returns provider unavailable for nip46 when runtime adapter is not configured', async () => {
        const storage = createMemoryStorage();
        const auth = createAuthService({ storage });

        await expect(
            auth.startSession('nip46', {
                bunkerUri: `bunker://${'a'.repeat(64)}?relay=wss://relay.example.com`,
            })
        ).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
        });
    });

    test('logout clears persisted session and notifies subscribers', async () => {
        const storage = createMemoryStorage();
        const auth = createAuthService({ storage });
        const listener = vi.fn();

        auth.subscribe(listener);
        await auth.startSession('npub', { credential: SAMPLE_NPUB });
        await auth.logout();

        expect(storage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
        expect(auth.getSession()).toBeUndefined();
        expect(listener).toHaveBeenCalledTimes(2);
    });

    test('starts local session with nip44 capabilities and persists it', async () => {
        const storage = createMemoryStorage();
        const localKeyStorage = createLocalKeyStorage({ storage, deviceKeyStore: createMemoryDeviceKeyStore(), now: () => 222 });
        const auth = createAuthService({ storage, localKeyStorage, now: () => 222 });

        const session = await auth.startSession('local', { secretKey: generateSecretKey() });

        expect(session.method).toBe('local');
        expect(session.readonly).toBe(false);
        expect(session.capabilities).toEqual({
            canSign: true,
            canEncrypt: true,
            encryptionSchemes: ['nip44'],
        });
        expect(session.createdAt).toBe(222);

        const persisted = storage.getItem(AUTH_SESSION_STORAGE_KEY);
        expect(persisted).toContain('"method":"local"');
    });

    test('restores local session unlocked when local key material is device-protected', async () => {
        const storage = createMemoryStorage();
        const deviceKeyStore = createMemoryDeviceKeyStore();
        const localKeyStorage = createLocalKeyStorage({ storage, deviceKeyStore, now: () => 222 });
        const authA = createAuthService({ storage, localKeyStorage, now: () => 222 });
        await authA.startSession('local', { secretKey: generateSecretKey() });

        const authB = createAuthService({ storage, localKeyStorage: createLocalKeyStorage({ storage, deviceKeyStore }) });
        const restored = await authB.restoreSession();

        expect(restored?.method).toBe('local');
        expect(restored?.locked).toBe(false);
        expect(restored?.capabilities).toEqual({
            canSign: true,
            canEncrypt: true,
            encryptionSchemes: ['nip44'],
        });
        expect(authB.getActiveProvider()).toBeDefined();
    });

    test('restores passphrase-protected local sessions as locked until unlocked explicitly', async () => {
        const storage = createMemoryStorage();
        const deviceKeyStore = createMemoryDeviceKeyStore();
        const localKeyStorage = createLocalKeyStorage({ storage, deviceKeyStore, now: () => 222 });
        const authA = createAuthService({ storage, localKeyStorage, now: () => 222 });
        const secretKey = generateSecretKey();
        await authA.startSession('local', { secretKey, passphrase: 'local-passphrase' });

        const authB = createAuthService({ storage, localKeyStorage: createLocalKeyStorage({ storage, deviceKeyStore }) });
        const restored = await authB.restoreSession();

        expect(restored?.method).toBe('local');
        expect(restored?.locked).toBe(true);
        expect(authB.getActiveProvider()).toBeUndefined();
        expect(restored?.pubkey).toBeDefined();

        const unlocked = await authB.startSession('local', {
            pubkey: restored?.pubkey ?? '',
            passphrase: 'local-passphrase',
        });

        expect(unlocked.method).toBe('local');
        expect(unlocked.locked).toBe(false);
    });

    test('logout clears only session metadata and keeps saved local account available for re-entry', async () => {
        const storage = createMemoryStorage();
        const deviceKeyStore = createMemoryDeviceKeyStore();
        const localKeyStorage = createLocalKeyStorage({ storage, deviceKeyStore, now: () => 222 });
        const auth = createAuthService({ storage, localKeyStorage, now: () => 222 });
        const secretKey = generateSecretKey();
        const session = await auth.startSession('local', { secretKey });

        await auth.logout();

        const authB = createAuthService({ storage, localKeyStorage: createLocalKeyStorage({ storage, deviceKeyStore }) });
        const restored = await authB.restoreSession();
        const savedLocalAccount = await authB.getSavedLocalAccount();

        expect(session.method).toBe('local');
        expect(restored).toBeUndefined();
        expect(savedLocalAccount).toEqual({
            pubkey: session.pubkey,
            mode: 'device',
        });
    });

    test('surfaces a stable error when unlocking a local session with the wrong passphrase', async () => {
        const storage = createMemoryStorage();
        const deviceKeyStore = createMemoryDeviceKeyStore();
        const localKeyStorage = createLocalKeyStorage({ storage, deviceKeyStore, now: () => 222 });
        const authA = createAuthService({ storage, localKeyStorage, now: () => 222 });
        const secretKey = generateSecretKey();
        await authA.startSession('local', { secretKey, passphrase: 'local-passphrase' });

        const authB = createAuthService({ storage, localKeyStorage: createLocalKeyStorage({ storage, deviceKeyStore }) });
        const restored = await authB.restoreSession();
        expect(restored?.locked).toBe(true);

        await expect(authB.startSession('local', {
            pubkey: restored?.pubkey ?? '',
            passphrase: 'incorrect-passphrase',
        })).rejects.toThrow('No se pudo desbloquear la cuenta local con esa passphrase');
    });

});
