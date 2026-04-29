import { describe, expect, test, vi } from 'vitest';
import { createNip46Cipher } from './nip46/crypto';
import { parseNip46Request, serializeNip46Response, type Nip46RpcResponse } from './nip46/rpc';
import type { Nip46TransportEvent } from './nip46/transport';
import { Nip46AuthProvider, type Nip46RuntimeFactory } from './nip46-provider';
import { AUTH_PROVIDER_ERROR } from './types';

function createRuntimeFactory(options: {
    localPubkey?: string;
    remoteSignerPubkey?: string;
    onRequest: (request: { id: string; method: string; params: string[] }) => Nip46RpcResponse;
}) {
    const localPubkey = options.localPubkey ?? 'c'.repeat(64);
    const remoteSignerPubkey = options.remoteSignerPubkey ?? 'd'.repeat(64);
    let handler: ((event: Nip46TransportEvent) => void) | undefined;
    const calls: Array<{ id: string; method: string; params: string[] }> = [];
    const close = vi.fn(async () => {});

    const createRuntime: Nip46RuntimeFactory = async () => {
        return {
            localPubkey,
            remoteSignerPubkey,
            cipher: createNip46Cipher({
                encrypt: async (plaintext) => plaintext,
                decrypt: async (ciphertext) => ciphertext,
            }),
            transport: {
                publish: async (event) => {
                    const request = parseNip46Request(event.content);
                    calls.push(request);
                    const response = options.onRequest(request);
                    queueMicrotask(() => {
                        handler?.({
                            kind: 24133,
                            pubkey: remoteSignerPubkey,
                            tags: [['p', localPubkey]],
                            content: serializeNip46Response(response),
                            created_at: event.created_at + 1,
                        });
                    });
                },
                subscribe: (next) => {
                    handler = next;
                    return () => {
                        handler = undefined;
                    };
                },
            },
            close,
        };
    };

    return {
        createRuntime,
        calls,
        close,
    };
}

describe('Nip46AuthProvider', () => {
    test('is disabled without runtime adapter and throws unavailable', async () => {
        const provider = new Nip46AuthProvider();

        expect(provider.isEnabled()).toBe(false);
        await expect(provider.resolveSession({ bunkerUri: `bunker://${'a'.repeat(64)}?relay=wss://relay.example` })).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
        });
    });

    test('resolves session with handshake and relay switching', async () => {
        const userPubkey = 'e'.repeat(64);
        const runtime = createRuntimeFactory({
            onRequest: (request) => {
                if (request.method === 'connect') {
                    return { id: request.id, result: 'ack' };
                }
                if (request.method === 'get_public_key') {
                    return { id: request.id, result: userPubkey };
                }
                if (request.method === 'switch_relays') {
                    return { id: request.id, result: JSON.stringify(['wss://relay.updated.example']) };
                }
                return { id: request.id, error: `unexpected method ${request.method}` };
            },
        });

        const provider = new Nip46AuthProvider({
            createRuntime: runtime.createRuntime,
            makeRequestId: (() => {
                let index = 0;
                return () => `req-${++index}`;
            })(),
        });

        // TEST_VECTOR_DO_NOT_USE: fake NIP-46 session secret for unit tests only.
        const session = await provider.resolveSession({
            bunkerUri: `bunker://${'d'.repeat(64)}?relay=wss://relay.initial.example&secret=session-secret`,
        });

        expect(session.method).toBe('nip46');
        expect(session.pubkey).toBe(userPubkey);
        expect(session.locked).toBe(false);
        expect(session.readonly).toBe(false);
        expect(session.capabilities.canSign).toBe(true);
        expect(session.capabilities.canEncrypt).toBe(true);

        expect(runtime.calls.map((call) => call.method)).toEqual(['connect', 'get_public_key', 'switch_relays']);
        expect(runtime.calls[0]?.params).toEqual(['d'.repeat(64), 'session-secret']);
    });

    test('fails when nostrconnect secret does not match connect response', async () => {
        const runtime = createRuntimeFactory({
            onRequest: (request) => {
                if (request.method === 'connect') {
                    return { id: request.id, result: 'other-secret' };
                }
                if (request.method === 'get_public_key') {
                    return { id: request.id, result: 'e'.repeat(64) };
                }
                return { id: request.id, result: 'null' };
            },
        });

        const provider = new Nip46AuthProvider({
            createRuntime: runtime.createRuntime,
            makeRequestId: (() => {
                let index = 0;
                return () => `req-${++index}`;
            })(),
        });

        // TEST_VECTOR_DO_NOT_USE: fake NIP-46 secret mismatch fixture.
        await expect(
            provider.resolveSession({
                bunkerUri: `nostrconnect://${'c'.repeat(64)}?relay=wss://relay.initial.example&secret=required-secret`,
            })
        ).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_INVALID_INPUT,
        });
    });

    test('enforces sign_event permissions by kind', async () => {
        const userPubkey = 'e'.repeat(64);
        const runtime = createRuntimeFactory({
            onRequest: (request) => {
                if (request.method === 'connect') {
                    return { id: request.id, result: 'required-secret' };
                }
                if (request.method === 'get_public_key') {
                    return { id: request.id, result: userPubkey };
                }
                if (request.method === 'switch_relays') {
                    return { id: request.id, result: 'null' };
                }
                if (request.method === 'sign_event') {
                    const payloadJson = request.params[0];
                    if (typeof payloadJson !== 'string') {
                        return { id: request.id, error: 'missing event payload' };
                    }

                    const payload = JSON.parse(payloadJson) as {
                        kind: number;
                        content: string;
                        created_at: number;
                        tags: string[][];
                    };
                    return {
                        id: request.id,
                        result: JSON.stringify({
                            id: '1'.repeat(64),
                            sig: '2'.repeat(128),
                            pubkey: userPubkey,
                            kind: payload.kind,
                            content: payload.content,
                            created_at: payload.created_at,
                            tags: payload.tags,
                        }),
                    };
                }
                return { id: request.id, error: `unexpected method ${request.method}` };
            },
        });

        const provider = new Nip46AuthProvider({
            createRuntime: runtime.createRuntime,
            makeRequestId: (() => {
                let index = 0;
                return () => `req-${++index}`;
            })(),
        });

        // TEST_VECTOR_DO_NOT_USE: fake NIP-46 permission secret for unit tests only.
        await provider.resolveSession({
            bunkerUri: `nostrconnect://${'c'.repeat(64)}?relay=wss://relay.initial.example&secret=required-secret&perms=sign_event%3A1`,
        });

        await expect(
            provider.signEvent({
                kind: 1,
                content: 'ok',
                created_at: 1,
                tags: [],
            })
        ).resolves.toMatchObject({ kind: 1 });

        await expect(
            provider.signEvent({
                kind: 4,
                content: 'blocked',
                created_at: 1,
                tags: [],
            })
        ).rejects.toMatchObject({ code: AUTH_PROVIDER_ERROR.AUTH_READONLY });
    });

    test('supports encrypt/decrypt then denies calls after lock', async () => {
        const runtime = createRuntimeFactory({
            onRequest: (request) => {
                if (request.method === 'connect') {
                    return { id: request.id, result: 'required-secret' };
                }
                if (request.method === 'get_public_key') {
                    return { id: request.id, result: 'e'.repeat(64) };
                }
                if (request.method === 'switch_relays') {
                    return { id: request.id, result: 'null' };
                }
                if (request.method === 'nip44_encrypt') {
                    return { id: request.id, result: `enc:${request.params[1]}` };
                }
                if (request.method === 'nip44_decrypt') {
                    const ciphertext = request.params[1];
                    return { id: request.id, result: typeof ciphertext === 'string' ? ciphertext.replace('enc:', '') : '' };
                }

                return { id: request.id, error: `unexpected method ${request.method}` };
            },
        });

        const provider = new Nip46AuthProvider({
            createRuntime: runtime.createRuntime,
            makeRequestId: (() => {
                let index = 0;
                return () => `req-${++index}`;
            })(),
        });

        // TEST_VECTOR_DO_NOT_USE: fake NIP-46 encryption permission secret.
        await provider.resolveSession({
            bunkerUri: `nostrconnect://${'c'.repeat(64)}?relay=wss://relay.initial.example&secret=required-secret&perms=nip44_encrypt%2Cnip44_decrypt`,
        });

        const encrypted = await provider.encrypt('a'.repeat(64), 'hola');
        expect(encrypted).toBe('enc:hola');

        const decrypted = await provider.decrypt('a'.repeat(64), encrypted);
        expect(decrypted).toBe('hola');

        await provider.lock();
        expect(runtime.close).toHaveBeenCalledTimes(1);

        await expect(provider.encrypt('a'.repeat(64), 'again')).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_LOCKED,
        });
    });
});
