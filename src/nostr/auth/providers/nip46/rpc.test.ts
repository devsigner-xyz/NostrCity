import { describe, expect, test, vi } from 'vitest';
import type { Nip46TransportEvent } from './transport';
import { createNip46Cipher } from './crypto';
import {
    createNip46EventResponseClassifier,
    createNip46ResponseClassifier,
    createNip46RpcClient,
    parseNip46Response,
    serializeNip46Request,
} from './rpc';

describe('NIP-46 RPC', () => {
    test('serializes request and parses response payload', () => {
        const encodedRequest = serializeNip46Request({
            id: 'req-1',
            method: 'sign_event',
            params: ['{"kind":1}'],
        });

        expect(encodedRequest).toContain('"id":"req-1"');
        expect(encodedRequest).toContain('"method":"sign_event"');

        const parsedResponse = parseNip46Response('{"id":"req-1","result":"ok"}');
        expect(parsedResponse).toEqual({ id: 'req-1', result: 'ok' });
    });

    test('extracts response id from encrypted content using classifier', async () => {
        const classifier = createNip46ResponseClassifier(async (ciphertext) => ciphertext.replace('enc:', ''));

        const responseId = await classifier({
            kind: 24133,
            pubkey: 'a'.repeat(64),
            tags: [['p', 'b'.repeat(64)]],
            content: 'enc:{"id":"req-22","result":"ok"}',
            created_at: 1,
        });

        expect(responseId).toBe('req-22');
    });

    test('creates rpc client that encrypts request and decrypts response', async () => {
        const sendRequest = vi.fn(async ({ content }: { requestId: string; content: string }) => {
            return {
                kind: 24133,
                pubkey: 'd'.repeat(64),
                tags: [['p', 'c'.repeat(64)]],
                content: content.replace('enc:', 'enc-response:'),
                created_at: 123,
            } as Nip46TransportEvent;
        });

        const rpc = createNip46RpcClient({
            transport: { sendRequest },
            cipher: createNip46Cipher({
                encrypt: async (plaintext) => `enc:${plaintext}`,
                decrypt: async (ciphertext) => ciphertext.replace('enc-response:', ''),
            }),
        });

        const response = await rpc.call({
            id: 'req-77',
            method: 'ping',
            params: [],
        });

        expect(sendRequest).toHaveBeenCalledWith({
            requestId: 'req-77',
            content: 'enc:{"id":"req-77","method":"ping","params":[]}',
        });
        expect(response).toEqual({ id: 'req-77', result: undefined, error: undefined });
    });

    test('throws when decrypted response id mismatches request id', async () => {
        const rpc = createNip46RpcClient({
            transport: {
                sendRequest: async () => ({
                    kind: 24133,
                    pubkey: 'd'.repeat(64),
                    tags: [['p', 'c'.repeat(64)]],
                    content: 'enc:{"id":"req-other","result":"ok"}',
                    created_at: 1,
                }),
            },
            cipher: createNip46Cipher({
                encrypt: async (plaintext) => `enc:${plaintext}`,
                decrypt: async (ciphertext) => ciphertext.replace('enc:', ''),
            }),
        });

        await expect(
            rpc.call({
                id: 'req-expected',
                method: 'ping',
                params: [],
            })
        ).rejects.toThrow('NIP-46 response id mismatch');
    });

    test('event classifier ignores broken decrypt and JSON for non-matching events without failing pending requests', async () => {
        const classifier = createNip46EventResponseClassifier({
            decrypt: async (ciphertext) => {
                if (ciphertext === 'broken-decrypt') throw new Error('decrypt failed with TEST_SECRET_DO_NOT_USE');
                return ciphertext;
            },
        });

        await expect(
            classifier({ kind: 24133, pubkey: 'a'.repeat(64), tags: [['p', 'b'.repeat(64)]], content: 'broken-decrypt', created_at: 1 })
        ).resolves.toBeUndefined();
        await expect(
            classifier({ kind: 24133, pubkey: 'a'.repeat(64), tags: [['p', 'b'.repeat(64)]], content: '{not-json', created_at: 1 })
        ).resolves.toBeUndefined();
        await expect(
            classifier({ kind: 24133, pubkey: 'a'.repeat(64), tags: [['p', 'b'.repeat(64)]], content: '{"id":"req-1","result":"ok"}', created_at: 1 })
        ).resolves.toBe('req-1');
    });
});
