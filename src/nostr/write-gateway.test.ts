import { describe, expect, test, vi } from 'vitest';
import { AUTH_PROVIDER_ERROR, type AuthProvider } from './auth/providers/types';
import { createWriteGateway } from './write-gateway';
import type { AuthSessionState } from './auth/session';
import type { NostrEvent } from './types';

function buildSession(overrides: Partial<AuthSessionState> = {}): AuthSessionState {
    return {
        method: 'nip46',
        pubkey: 'f'.repeat(64),
        readonly: false,
        locked: false,
        createdAt: 1,
        capabilities: {
            canSign: true,
            canEncrypt: true,
            encryptionSchemes: ['nip04', 'nip44'],
        },
        ...overrides,
    };
}

function buildProvider(): AuthProvider {
    return {
        method: 'nip46',
        supports: {
            canSign: true,
            canEncrypt: true,
            encryptionSchemes: ['nip04', 'nip44'],
        },
        resolveSession: vi.fn(),
        signEvent: vi.fn(async (event) => ({
            ...(event as Omit<NostrEvent, 'id'>),
            id: '1'.repeat(64),
            sig: '2'.repeat(128),
        })),
        encrypt: vi.fn(async (_pubkey, plaintext) => `enc:${plaintext}`),
        decrypt: vi.fn(async (_pubkey, ciphertext) => ciphertext.replace('enc:', '')),
        lock: vi.fn(async () => {}),
    };
}

describe('createWriteGateway', () => {
    test('throws readonly error when publishing in readonly session', async () => {
        const provider = buildProvider();
        const gateway = createWriteGateway({
            getSession: () => buildSession({ method: 'npub', readonly: true, capabilities: { canSign: false, canEncrypt: false, encryptionSchemes: [] } }),
            getProvider: () => provider,
        });

        await expect(gateway.publishTextNote('hola')).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_READONLY,
        });
    });

    test('publishes text note through provider signer', async () => {
        const provider = buildProvider();
        const gateway = createWriteGateway({
            getSession: () => buildSession(),
            getProvider: () => provider,
            now: () => 123,
        });

        const result = await gateway.publishTextNote('hola nostr', [['t', 'demo']]);

        expect(result.id).toBe('1'.repeat(64));
        expect(provider.signEvent).toHaveBeenCalledWith({
            kind: 1,
            content: 'hola nostr',
            created_at: 123,
            tags: [['t', 'demo']],
        });
    });

    test('publishes contact list as kind 3 with p tags', async () => {
        const provider = buildProvider();
        const gateway = createWriteGateway({
            getSession: () => buildSession(),
            getProvider: () => provider,
            now: () => 222,
        });

        await gateway.publishContactList(['a'.repeat(64), 'b'.repeat(64)]);

        expect(provider.signEvent).toHaveBeenCalledWith({
            kind: 3,
            content: '',
            created_at: 222,
            tags: [
                ['p', 'a'.repeat(64)],
                ['p', 'b'.repeat(64)],
            ],
        });
    });

    test('publishes encrypted kind 10000 mute list', async () => {
        const provider = buildProvider();
        const gateway = createWriteGateway({
            getSession: () => buildSession(),
            getProvider: () => provider,
            now: () => 444,
        });

        await gateway.publishMuteList(['a'.repeat(64), 'b'.repeat(64), 'a'.repeat(64)]);

        expect(provider.encrypt).toHaveBeenCalledWith('f'.repeat(64), JSON.stringify([
            ['p', 'a'.repeat(64)],
            ['p', 'b'.repeat(64)],
        ]), 'nip44');
        expect(provider.signEvent).toHaveBeenCalledWith({
            kind: 10000,
            content: `enc:${JSON.stringify([
                ['p', 'a'.repeat(64)],
                ['p', 'b'.repeat(64)],
            ])}`,
            created_at: 444,
            tags: [],
        });
    });

    test('preserves non-user mute tags when publishing mute list updates', async () => {
        const provider = buildProvider();
        const gateway = createWriteGateway({
            getSession: () => buildSession(),
            getProvider: () => provider,
            now: () => 445,
        });

        await gateway.publishMuteList(['a'.repeat(64)], [
            ['t', 'nsfw'],
            ['word', 'spam'],
            ['e', '1'.repeat(64)],
        ]);

        expect(provider.encrypt).toHaveBeenCalledWith('f'.repeat(64), JSON.stringify([
            ['t', 'nsfw'],
            ['word', 'spam'],
            ['e', '1'.repeat(64)],
            ['p', 'a'.repeat(64)],
        ]), 'nip44');
    });

    test('publishes profile metadata as kind 0 replaceable event', async () => {
        const provider = buildProvider();
        const gateway = createWriteGateway({
            getSession: () => buildSession(),
            getProvider: () => provider,
            now: () => 333,
        });

        await gateway.publishProfileMetadata('{"name":"alice"}');

        expect(provider.signEvent).toHaveBeenCalledWith({
            kind: 0,
            content: '{"name":"alice"}',
            created_at: 333,
            tags: [],
        });
    });

    test('encrypts and decrypts dm through provider', async () => {
        const provider = buildProvider();
        const gateway = createWriteGateway({
            getSession: () => buildSession(),
            getProvider: () => provider,
        });

        const encrypted = await gateway.encryptDm('a'.repeat(64), 'secret');
        expect(encrypted).toBe('enc:secret');

        const decrypted = await gateway.decryptDm('a'.repeat(64), encrypted);
        expect(decrypted).toBe('secret');
    });

    test('throws locked error when session is locked', async () => {
        const provider = buildProvider();
        const gateway = createWriteGateway({
            getSession: () => buildSession({ locked: true }),
            getProvider: () => provider,
        });

        await expect(gateway.publishTextNote('hola')).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_LOCKED,
        });
    });

    test('blocks dm encryption when nip44 scheme is not enabled in session capabilities', async () => {
        const provider = buildProvider();
        const gateway = createWriteGateway({
            getSession: () =>
                buildSession({
                    capabilities: {
                        canSign: true,
                        canEncrypt: true,
                        encryptionSchemes: ['nip04'],
                    },
                }),
            getProvider: () => provider,
        });

        await expect(gateway.encryptDm('a'.repeat(64), 'secret')).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
        });
    });

    test('rejects mute publication when encryption is unavailable', async () => {
        const provider = buildProvider();
        const gateway = createWriteGateway({
            getSession: () =>
                buildSession({
                    capabilities: {
                        canSign: true,
                        canEncrypt: false,
                        encryptionSchemes: [],
                    },
                }),
            getProvider: () => provider,
        });

        await expect(gateway.publishMuteList(['a'.repeat(64)])).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
        });
    });

    test('blocks dm decryption when nip44 scheme is not enabled in session capabilities', async () => {
        const provider = buildProvider();
        const gateway = createWriteGateway({
            getSession: () =>
                buildSession({
                    capabilities: {
                        canSign: true,
                        canEncrypt: true,
                        encryptionSchemes: ['nip04'],
                    },
                }),
            getProvider: () => provider,
        });

        await expect(gateway.decryptDm('a'.repeat(64), 'ciphertext')).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
        });
    });
});
