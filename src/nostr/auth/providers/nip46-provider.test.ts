import { describe, expect, test, vi } from 'vitest';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { createNip46Cipher } from './nip46/crypto';
import { parseNip46Request, serializeNip46Response, type Nip46RpcResponse } from './nip46/rpc';
import type { Nip46TransportEvent } from './nip46/transport';
import { Nip46AuthProvider, type Nip46RuntimeFactory } from './nip46-provider';
import { AUTH_PROVIDER_ERROR } from './types';

const CLIENT_SECRET_KEY = new Uint8Array(32).fill(3);
const CLIENT_PUBKEY = getPublicKey(CLIENT_SECRET_KEY);
const DEFAULT_SIGNER_SECRET_KEY = new Uint8Array(32).fill(4);
const DEFAULT_SIGNER_PUBKEY = getPublicKey(DEFAULT_SIGNER_SECRET_KEY);
const SECOND_SIGNER_SECRET_KEY = new Uint8Array(32).fill(5);
const SECOND_SIGNER_PUBKEY = getPublicKey(SECOND_SIGNER_SECRET_KEY);

function signedResponseEvent(input: {
    response: Nip46RpcResponse;
    localPubkey: string;
    remoteSecretKey: Uint8Array;
    createdAt: number;
}): Nip46TransportEvent {
    return finalizeEvent(
        {
            kind: 24133,
            tags: [['p', input.localPubkey]],
            content: serializeNip46Response(input.response),
            created_at: input.createdAt,
        },
        input.remoteSecretKey
    );
}

function signedUserEvent(input: {
    userSecretKey: Uint8Array;
    kind?: number;
    content?: string;
    createdAt?: number;
    tags?: string[][];
}) {
    return finalizeEvent(
        {
            kind: input.kind ?? 1,
            content: input.content ?? 'signed',
            created_at: input.createdAt ?? 1,
            tags: input.tags ?? [],
        },
        input.userSecretKey
    );
}

function createRuntimeFactory(options: {
    localPubkey?: string;
    remoteSignerPubkey?: string | null;
    remoteSecretKey?: Uint8Array;
    onRequest: (request: { id: string; method: string; params: string[] }) => Nip46RpcResponse;
}) {
    const localPubkey = options.localPubkey ?? CLIENT_PUBKEY;
    const remoteSecretKey = options.remoteSecretKey ?? DEFAULT_SIGNER_SECRET_KEY;
    const remoteSignerPubkey = options.remoteSignerPubkey === null ? undefined : options.remoteSignerPubkey ?? getPublicKey(remoteSecretKey);
    let handler: ((event: Nip46TransportEvent) => void) | undefined;
    const calls: Array<{ id: string; method: string; params: string[] }> = [];
    const published: Nip46TransportEvent[] = [];
    const close = vi.fn(async () => {});

    const createRuntime: Nip46RuntimeFactory = async () => {
        return {
            localPubkey,
            remoteSignerPubkey: remoteSignerPubkey as string,
            cipher: createNip46Cipher({
                encrypt: async (plaintext) => plaintext,
                decrypt: async (ciphertext) => ciphertext,
            }),
            createCipher: () => createNip46Cipher({
                encrypt: async (plaintext) => plaintext,
                decrypt: async (ciphertext) => ciphertext,
            }),
            transport: {
                publish: async (event) => {
                    published.push(event);
                    const request = parseNip46Request(event.content);
                    calls.push(request);
                    const response = options.onRequest(request);
                    queueMicrotask(() => {
                        handler?.(signedResponseEvent({
                            response,
                            localPubkey,
                            remoteSecretKey,
                            createdAt: event.created_at + 1,
                        }));
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
        published,
        close,
    };
}

function createPassiveNostrConnectRuntimeFactory(options: {
    connectResponse: Nip46RpcResponse;
    userPubkey?: string;
    remoteSecretKey?: Uint8Array;
    switchRelaysResponse?: Nip46RpcResponse | Error;
    onRequest?: (request: { id: string; method: string; params: string[] }) => Nip46RpcResponse | undefined;
}) {
    const localPubkey = CLIENT_PUBKEY;
    const remoteSecretKey = options.remoteSecretKey ?? SECOND_SIGNER_SECRET_KEY;
    const remoteSignerPubkey = getPublicKey(remoteSecretKey);
    const userPubkey = options.userPubkey ?? 'e'.repeat(64);
    const calls: Array<{ id: string; method: string; params: string[] }> = [];
    const published: Nip46TransportEvent[] = [];
    const factoryInputs: Parameters<Nip46RuntimeFactory>[0][] = [];
    const close = vi.fn(async () => {});

    const createRuntime: Nip46RuntimeFactory = async (input) => {
        factoryInputs.push(input);
        let handler: ((event: Nip46TransportEvent) => void) | undefined;

        return {
            localPubkey,
            createCipher: () => createNip46Cipher({
                encrypt: async (plaintext) => plaintext,
                decrypt: async (ciphertext) => ciphertext,
            }),
            transport: {
                publish: async (event) => {
                    published.push(event);
                    const request = parseNip46Request(event.content);
                    calls.push(request);
                    let response: Nip46RpcResponse;
                    if (request.method === 'get_public_key') {
                        response = { id: request.id, result: userPubkey };
                    } else if (request.method === 'switch_relays') {
                        if (options.switchRelaysResponse instanceof Error) {
                            throw options.switchRelaysResponse;
                        }
                        response = options.switchRelaysResponse ?? { id: request.id, result: 'null' };
                    } else {
                        response = options.onRequest?.(request) ?? { id: request.id, error: `unexpected method ${request.method}` };
                    }
                    queueMicrotask(() => {
                        handler?.(signedResponseEvent({
                            response,
                            localPubkey,
                            remoteSecretKey,
                            createdAt: event.created_at + 1,
                        }));
                    });
                },
                subscribe: (next) => {
                    handler = next;
                    queueMicrotask(() => {
                        handler?.(signedResponseEvent({
                            response: options.connectResponse,
                            localPubkey,
                            remoteSecretKey,
                            createdAt: 1714078911,
                        }));
                    });
                    return () => {
                        handler = undefined;
                    };
                },
            },
            close,
        };
    };

    return { createRuntime, calls, published, factoryInputs, remoteSignerPubkey, close };
}

function createSwitchableRuntimeFactory(options: {
    userPubkey?: string;
    remoteSecretKey?: Uint8Array;
    switchRelaysResponse: Nip46RpcResponse | Error;
}) {
    const localPubkey = CLIENT_PUBKEY;
    const remoteSecretKey = options.remoteSecretKey ?? DEFAULT_SIGNER_SECRET_KEY;
    const remoteSignerPubkey = getPublicKey(remoteSecretKey);
    const userPubkey = options.userPubkey ?? 'e'.repeat(64);
    const calls: Array<{ id: string; method: string; params: string[] }> = [];
    const factoryInputs: Array<Parameters<Nip46RuntimeFactory>[0] & { relays?: string[]; remoteSignerPubkey?: string }> = [];
    const subscriptions: Array<{ relays: string[]; unsubscribe: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = [];

    const createRuntime: Nip46RuntimeFactory = async (input) => {
        const effectiveRelays = (input as typeof factoryInputs[number]).relays ?? input.parsedUri.relays;
        factoryInputs.push(input as typeof factoryInputs[number]);
        let handler: ((event: Nip46TransportEvent) => void) | undefined;
        const unsubscribe = vi.fn(() => {
            handler = undefined;
        });
        const close = vi.fn(async () => {});
        subscriptions.push({ relays: effectiveRelays, unsubscribe, close });

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
                    let response: Nip46RpcResponse;
                    if (request.method === 'connect') {
                        response = { id: request.id, result: 'ack' };
                    } else if (request.method === 'get_public_key') {
                        response = { id: request.id, result: userPubkey };
                    } else if (request.method === 'switch_relays') {
                        if (options.switchRelaysResponse instanceof Error) {
                            throw options.switchRelaysResponse;
                        }
                        response = options.switchRelaysResponse;
                    } else {
                        response = { id: request.id, error: `unexpected method ${request.method}` };
                    }
                    queueMicrotask(() => {
                        handler?.(signedResponseEvent({
                            response,
                            localPubkey,
                            remoteSecretKey,
                            createdAt: event.created_at + 1,
                        }));
                    });
                },
                subscribe: (next) => {
                    handler = next;
                    return unsubscribe;
                },
            },
            close,
        };
    };

    return { createRuntime, calls, factoryInputs, subscriptions };
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
        const userSecretKey = new Uint8Array(32).fill(6);
        const userPubkey = getPublicKey(userSecretKey);
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
            bunkerUri: `bunker://${DEFAULT_SIGNER_PUBKEY}?relay=wss://relay.initial.example&secret=session-secret`,
        });

        expect(session.method).toBe('nip46');
        expect(session.pubkey).toBe(userPubkey);
        expect(session.locked).toBe(false);
        expect(session.readonly).toBe(false);
        expect(session.capabilities.canSign).toBe(true);
        expect(session.capabilities.canEncrypt).toBe(true);

        expect(runtime.calls.map((call) => call.method)).toEqual(['connect', 'get_public_key', 'switch_relays']);
        expect(runtime.calls[0]?.params).toEqual([DEFAULT_SIGNER_PUBKEY, 'session-secret']);
        expect(session.metadata!.relays).toBe(JSON.stringify(['wss://relay.updated.example']));
    });

    test('learns nostrconnect signer from passive connect response and binds later RPCs to that signer', async () => {
        const runtime = createPassiveNostrConnectRuntimeFactory({
            connectResponse: { id: 'connect-passive', result: 'required-secret' },
        });

        const provider = new Nip46AuthProvider({
            createRuntime: runtime.createRuntime,
            makeRequestId: (() => {
                let index = 0;
                return () => `req-${++index}`;
            })(),
        });

        const session = await provider.resolveSession({
            bunkerUri: `nostrconnect://${CLIENT_PUBKEY}?relay=wss://relay.initial.example&secret=required-secret`,
        });

        expect(session.metadata!.remoteSignerPubkey).toBe(SECOND_SIGNER_PUBKEY);
        expect(runtime.calls.map((call) => call.method)).toEqual(['get_public_key', 'switch_relays']);
        expect(runtime.published.map((event) => event.tags)).toEqual([
            [['p', SECOND_SIGNER_PUBKEY]],
            [['p', SECOND_SIGNER_PUBKEY]],
        ]);
    });

    test('passes provided nostrconnect client secret key to every generated runtime', async () => {
        const runtime = createPassiveNostrConnectRuntimeFactory({
            connectResponse: { id: 'connect-passive', result: 'required-secret' },
        });
        const clientSecretKey = new Uint8Array(32).fill(9);
        const clientPubkey = getPublicKey(clientSecretKey);
        const provider = new Nip46AuthProvider({
            createRuntime: runtime.createRuntime,
            makeRequestId: (() => {
                let index = 0;
                return () => `req-${++index}`;
            })(),
        });

        await provider.resolveSession({
            bunkerUri: `nostrconnect://${clientPubkey}?relay=wss://relay.initial.example&secret=required-secret`,
            clientSecretKey,
        });

        expect(runtime.factoryInputs).toHaveLength(2);
        expect(runtime.factoryInputs.every((input) => input.clientSecretKey === clientSecretKey)).toBe(true);
    });

    test('preserves nostrconnect client secret key when recreating runtime after switch_relays', async () => {
        const runtime = createPassiveNostrConnectRuntimeFactory({
            connectResponse: { id: 'connect-passive', result: 'required-secret' },
            switchRelaysResponse: { id: 'req-2', result: JSON.stringify(['wss://relay.updated.example']) },
        });
        const clientSecretKey = new Uint8Array(32).fill(10);
        const clientPubkey = getPublicKey(clientSecretKey);
        const provider = new Nip46AuthProvider({
            createRuntime: runtime.createRuntime,
            makeRequestId: (() => {
                let index = 0;
                return () => `req-${++index}`;
            })(),
        });

        await provider.resolveSession({
            bunkerUri: `nostrconnect://${clientPubkey}?relay=wss://relay.initial.example&secret=required-secret`,
            clientSecretKey,
        });

        expect(runtime.factoryInputs).toHaveLength(3);
        expect(runtime.factoryInputs[2]?.relays).toEqual(['wss://relay.updated.example']);
        expect(runtime.factoryInputs.every((input) => input.clientSecretKey === clientSecretKey)).toBe(true);
    });

    test('fails nostrconnect when passive connect response secret does not match', async () => {
        const runtime = createPassiveNostrConnectRuntimeFactory({
            connectResponse: { id: 'connect-passive', result: 'other-secret' },
        });

        const provider = new Nip46AuthProvider({
            createRuntime: runtime.createRuntime,
            makeRequestId: (() => {
                let index = 0;
                return () => `req-${++index}`;
            })(),
        });

        await expect(
            provider.resolveSession({
                bunkerUri: `nostrconnect://${CLIENT_PUBKEY}?relay=wss://relay.initial.example&secret=required-secret`,
            })
        ).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_INVALID_INPUT,
        });
        expect(runtime.published).toHaveLength(0);
    });

    test('switches relays after get_public_key and recreates runtime subscriptions for valid relay lists', async () => {
        const runtime = createSwitchableRuntimeFactory({
            switchRelaysResponse: { id: 'req-3', result: JSON.stringify(['wss://relay.updated.example', 'wss://relay.updated.example/']) },
        });

        const provider = new Nip46AuthProvider({
            createRuntime: runtime.createRuntime,
            makeRequestId: (() => {
                let index = 0;
                return () => `req-${++index}`;
            })(),
        });

        const session = await provider.resolveSession({
            bunkerUri: `bunker://${DEFAULT_SIGNER_PUBKEY}?relay=wss://relay.initial.example&secret=session-secret`,
        });

        expect(runtime.calls.map((call) => call.method)).toEqual(['connect', 'get_public_key', 'switch_relays']);
        expect(session.metadata!.relays).toBe(JSON.stringify(['wss://relay.updated.example']));
        expect(runtime.factoryInputs).toHaveLength(2);
        expect(runtime.factoryInputs[1]?.relays).toEqual(['wss://relay.updated.example']);
        expect(runtime.subscriptions[0]?.unsubscribe).toHaveBeenCalledTimes(1);
        expect(runtime.subscriptions[0]?.close).toHaveBeenCalledTimes(1);
        expect(runtime.subscriptions[1]?.relays).toEqual(['wss://relay.updated.example']);
    });

    test('preserves initial relays when switch_relays mixes valid relays with invalid entries', async () => {
        const runtime = createSwitchableRuntimeFactory({
            switchRelaysResponse: {
                id: 'req-3',
                result: JSON.stringify(['wss://relay.updated.example', 'https://relay.invalid.example', 42]),
            },
        });

        const provider = new Nip46AuthProvider({
            createRuntime: runtime.createRuntime,
            makeRequestId: (() => {
                let index = 0;
                return () => `req-${++index}`;
            })(),
        });

        const session = await provider.resolveSession({
            bunkerUri: `bunker://${DEFAULT_SIGNER_PUBKEY}?relay=wss://relay.initial.example&secret=session-secret`,
        });

        expect(session.metadata!.relays).toBe(JSON.stringify(['wss://relay.initial.example']));
        expect(runtime.factoryInputs).toHaveLength(1);
        expect(runtime.subscriptions[0]?.unsubscribe).not.toHaveBeenCalled();
        expect(runtime.subscriptions[0]?.close).not.toHaveBeenCalled();
    });

    test.each([
        { name: 'null', response: { id: 'req-3', result: 'null' } },
        { name: 'invalid payload', response: { id: 'req-3', result: '{' } },
        { name: 'unsupported', response: { id: 'req-3', error: 'unsupported' } },
        { name: 'failing publish', response: new Error('relay switch failed') },
    ])('preserves initial relays when switch_relays returns $name', async ({ response }) => {
        const runtime = createSwitchableRuntimeFactory({
            switchRelaysResponse: response,
        });

        const provider = new Nip46AuthProvider({
            createRuntime: runtime.createRuntime,
            makeRequestId: (() => {
                let index = 0;
                return () => `req-${++index}`;
            })(),
        });

        const session = await provider.resolveSession({
            bunkerUri: `bunker://${DEFAULT_SIGNER_PUBKEY}?relay=wss://relay.initial.example&secret=session-secret`,
        });

        expect(session.metadata!.relays).toBe(JSON.stringify(['wss://relay.initial.example']));
        expect(runtime.factoryInputs).toHaveLength(1);
        expect(runtime.subscriptions[0]?.unsubscribe).not.toHaveBeenCalled();
        expect(runtime.subscriptions[0]?.close).not.toHaveBeenCalled();
    });

    test('fails when nostrconnect secret does not match connect response', async () => {
        const runtime = createPassiveNostrConnectRuntimeFactory({
            connectResponse: { id: 'connect-passive', result: 'other-secret' },
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
                bunkerUri: `nostrconnect://${CLIENT_PUBKEY}?relay=wss://relay.initial.example&secret=required-secret`,
            })
        ).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_INVALID_INPUT,
        });
    });

    test('enforces sign_event permissions by kind', async () => {
        const userSecretKey = new Uint8Array(32).fill(6);
        const userPubkey = getPublicKey(userSecretKey);
        const runtime = createPassiveNostrConnectRuntimeFactory({
            connectResponse: { id: 'connect-passive', result: 'required-secret' },
            userPubkey,
            onRequest: (request) => {
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
                        result: JSON.stringify(signedUserEvent({
                            userSecretKey,
                            kind: payload.kind,
                            content: payload.content,
                            createdAt: payload.created_at,
                            tags: payload.tags,
                        })),
                    };
                }
                return undefined;
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
            bunkerUri: `nostrconnect://${CLIENT_PUBKEY}?relay=wss://relay.initial.example&secret=required-secret&perms=sign_event%3A1`,
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

    test.each([
        ['id', (event: ReturnType<typeof signedUserEvent>) => ({ ...event, id: '1'.repeat(64) })],
        ['sig', (event: ReturnType<typeof signedUserEvent>) => ({ ...event, sig: '2'.repeat(128) })],
        ['pubkey', (event: ReturnType<typeof signedUserEvent>) => ({ ...event, pubkey: 'f'.repeat(64) })],
    ])('rejects sign_event responses with invalid %s', async (_field, mutateSignedEvent) => {
        const userSecretKey = new Uint8Array(32).fill(6);
        const userPubkey = getPublicKey(userSecretKey);
        const runtime = createPassiveNostrConnectRuntimeFactory({
            connectResponse: { id: 'connect-passive', result: 'required-secret' },
            userPubkey,
            onRequest: (request) => {
                if (request.method === 'sign_event') {
                    return {
                        id: request.id,
                        result: JSON.stringify(mutateSignedEvent(signedUserEvent({ userSecretKey }))),
                    };
                }
                return undefined;
            },
        });

        const provider = new Nip46AuthProvider({
            createRuntime: runtime.createRuntime,
            makeRequestId: (() => {
                let index = 0;
                return () => `req-${++index}`;
            })(),
        });

        await provider.resolveSession({
            bunkerUri: `nostrconnect://${CLIENT_PUBKEY}?relay=wss://relay.initial.example&secret=required-secret&perms=sign_event%3A1`,
        });

        await expect(provider.signEvent({ kind: 1, content: 'ok', created_at: 1, tags: [] })).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
        });
    });

    test('rejects sign_event responses that sign a different payload', async () => {
        const userSecretKey = new Uint8Array(32).fill(6);
        const userPubkey = getPublicKey(userSecretKey);
        const runtime = createPassiveNostrConnectRuntimeFactory({
            connectResponse: { id: 'connect-passive', result: 'required-secret' },
            userPubkey,
            onRequest: (request) => {
                if (request.method === 'sign_event') {
                    return {
                        id: request.id,
                        result: JSON.stringify(signedUserEvent({
                            userSecretKey,
                            content: 'different payload',
                        })),
                    };
                }

                return undefined;
            },
        });

        const provider = new Nip46AuthProvider({
            createRuntime: runtime.createRuntime,
            makeRequestId: (() => {
                let index = 0;
                return () => `req-${++index}`;
            })(),
        });

        await provider.resolveSession({
            bunkerUri: `nostrconnect://${CLIENT_PUBKEY}?relay=wss://relay.initial.example&secret=required-secret&perms=sign_event%3A1`,
        });

        await expect(provider.signEvent({ kind: 1, content: 'ok', created_at: 1, tags: [] })).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
        });
    });

    test('supports encrypt/decrypt then denies calls after lock', async () => {
        const runtime = createPassiveNostrConnectRuntimeFactory({
            connectResponse: { id: 'connect-passive', result: 'required-secret' },
            onRequest: (request) => {
                if (request.method === 'nip44_encrypt') {
                    return { id: request.id, result: `enc:${request.params[1]}` };
                }
                if (request.method === 'nip44_decrypt') {
                    const ciphertext = request.params[1];
                    return { id: request.id, result: typeof ciphertext === 'string' ? ciphertext.replace('enc:', '') : '' };
                }

                return undefined;
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
            bunkerUri: `nostrconnect://${CLIENT_PUBKEY}?relay=wss://relay.initial.example&secret=required-secret&perms=nip44_encrypt%2Cnip44_decrypt`,
        });

        const encrypted = await provider.encrypt('a'.repeat(64), 'hola');
        expect(encrypted).toBe('enc:hola');

        const decrypted = await provider.decrypt('a'.repeat(64), encrypted);
        expect(decrypted).toBe('hola');

        await provider.lock();
        expect(runtime.close).toHaveBeenCalledTimes(2);

        await expect(provider.encrypt('a'.repeat(64), 'again')).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_LOCKED,
        });
    });
});
