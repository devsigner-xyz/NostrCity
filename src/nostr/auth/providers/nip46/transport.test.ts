import { describe, expect, test, vi } from 'vitest';
import { finalizeEvent, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { createNip46Transport, validateNip46ResponseEvent, type Nip46TransportEvent } from './transport';

function createFakeIo() {
    let handler: ((event: Nip46TransportEvent) => void) | undefined;
    const published: Nip46TransportEvent[] = [];

    return {
        published,
        io: {
            publish: async (event: Nip46TransportEvent) => {
                published.push(event);
            },
            subscribe: (next: (event: Nip46TransportEvent) => void) => {
                handler = next;
                return () => {
                    handler = undefined;
                };
            },
        },
        emit: (event: Nip46TransportEvent) => {
            handler?.(event);
        },
    };
}

function createSignedResponseEvent(input: { secretKey: Uint8Array; localPubkey: string; content: string; createdAt: number }): Nip46TransportEvent {
    return finalizeEvent(
        {
            kind: 24133,
            tags: [['p', input.localPubkey]],
            content: input.content,
            created_at: input.createdAt,
        },
        input.secretKey
    );
}

describe('createNip46Transport', () => {
    test('publishes request event and resolves matching response id', async () => {
        const fake = createFakeIo();
        const signerSecretKey = new Uint8Array(32).fill(5);
        const signerPubkey = getPublicKey(signerSecretKey);
        const transport = createNip46Transport(fake.io, {
            localPubkey: 'c'.repeat(64),
            remoteSignerPubkey: signerPubkey,
            timeoutMs: 200,
            now: () => 1714078911,
            classifyResponse: async (event) => {
                try {
                    const parsed = JSON.parse(event.content) as { id?: string };
                    return typeof parsed.id === 'string' ? parsed.id : undefined;
                } catch {
                    return undefined;
                }
            },
        });

        const pending = transport.sendRequest({
            requestId: 'req-1',
            content: 'encrypted-request',
        });

        expect(fake.published).toHaveLength(1);
        expect(fake.published[0]).toMatchObject({
            kind: 24133,
            pubkey: 'c'.repeat(64),
            content: 'encrypted-request',
            tags: [['p', signerPubkey]],
            created_at: 1714078911,
        });

        fake.emit(createSignedResponseEvent({
            secretKey: signerSecretKey,
            localPubkey: 'c'.repeat(64),
            content: JSON.stringify({ id: 'other-id', result: 'ignored' }),
            createdAt: 1714078912,
        }));

        fake.emit(createSignedResponseEvent({
            secretKey: signerSecretKey,
            localPubkey: 'c'.repeat(64),
            content: JSON.stringify({ id: 'req-1', result: 'ok' }),
            createdAt: 1714078913,
        }));

        const response = await pending;
        expect(response.content).toContain('req-1');
        transport.close();
    });

    test('publishes requests signed by the client pubkey as kind 24133', async () => {
        const fake = createFakeIo();
        const clientSecretKey = new Uint8Array(32).fill(3);
        const transport = createNip46Transport(fake.io, {
            localPubkey: 'will-be-derived-from-secret-key',
            localSecretKey: clientSecretKey,
            remoteSignerPubkey: 'd'.repeat(64),
            timeoutMs: 5,
            classifyResponse: async () => undefined,
        });

        await expect(transport.sendRequest({ requestId: 'req-signed', content: 'encrypted-request' })).rejects.toThrow(
            'NIP-46 request timed out'
        );

        expect(fake.published[0]).toMatchObject({ kind: 24133, content: 'encrypted-request' });
        expect(fake.published[0]?.id).toMatch(/^[a-f0-9]{64}$/);
        expect(fake.published[0]?.sig).toMatch(/^[a-f0-9]{128}$/);
        expect(verifyEvent(fake.published[0] as Parameters<typeof verifyEvent>[0])).toBe(true);
        transport.close();
    });

    test('rejects invalid response event shape, target, and bunker signer', () => {
        const signerSecretKey = new Uint8Array(32).fill(4);
        const signerPubkey = getPublicKey(signerSecretKey);
        const valid = {
            ...finalizeEvent(
                {
                    kind: 24133,
                    tags: [['p', 'c'.repeat(64)]],
                    content: '{}',
                    created_at: 1,
                },
                signerSecretKey
            ),
        };

        expect(() => validateNip46ResponseEvent({ ...valid, kind: 1 }, { localPubkey: 'c'.repeat(64), remoteSignerPubkey: signerPubkey })).toThrow(
            'Invalid NIP-46 response event'
        );
        expect(() =>
            validateNip46ResponseEvent({ ...valid, tags: [['p', 'e'.repeat(64)]] }, { localPubkey: 'c'.repeat(64), remoteSignerPubkey: signerPubkey })
        ).toThrow('Invalid NIP-46 response event');
        expect(() => validateNip46ResponseEvent({ ...valid, pubkey: 'e'.repeat(64) }, { localPubkey: 'c'.repeat(64), remoteSignerPubkey: signerPubkey })).toThrow(
            'Invalid NIP-46 response event'
        );
        const { id: _id, ...missingId } = valid;
        const { sig: _sig, ...missingSig } = valid;
        expect(() => validateNip46ResponseEvent(missingId, { localPubkey: 'c'.repeat(64), remoteSignerPubkey: signerPubkey })).toThrow(
            'Invalid NIP-46 response event'
        );
        expect(() => validateNip46ResponseEvent(missingSig, { localPubkey: 'c'.repeat(64), remoteSignerPubkey: signerPubkey })).toThrow(
            'Invalid NIP-46 response event'
        );
    });

    test('rejects pending request on timeout', async () => {
        const fake = createFakeIo();
        const transport = createNip46Transport(fake.io, {
            localPubkey: 'c'.repeat(64),
            remoteSignerPubkey: 'd'.repeat(64),
            timeoutMs: 5,
            classifyResponse: async () => undefined,
        });

        await expect(
            transport.sendRequest({
                requestId: 'req-timeout',
                content: 'encrypted-request',
            })
        ).rejects.toThrow('NIP-46 request timed out');

        transport.close();
    });

    test('cleans pending requests on close', async () => {
        const fake = createFakeIo();
        const unsubscribe = vi.fn();
        const transport = createNip46Transport(
            {
                publish: fake.io.publish,
                subscribe: (next) => {
                    fake.io.subscribe(next);
                    return unsubscribe;
                },
            },
            {
                localPubkey: 'c'.repeat(64),
                remoteSignerPubkey: 'd'.repeat(64),
                timeoutMs: 100,
                classifyResponse: async () => undefined,
            }
        );

        const pending = transport.sendRequest({ requestId: 'req-close', content: 'encrypted-request' });
        transport.close();

        await expect(pending).rejects.toThrow('NIP-46 transport closed');
        expect(unsubscribe).toHaveBeenCalledOnce();
    });

    test('ignores responses from unexpected author and tags', async () => {
        const fake = createFakeIo();
        const signerSecretKey = new Uint8Array(32).fill(6);
        const signerPubkey = getPublicKey(signerSecretKey);
        const transport = createNip46Transport(fake.io, {
            localPubkey: 'c'.repeat(64),
            remoteSignerPubkey: signerPubkey,
            timeoutMs: 100,
            classifyResponse: async (event) => {
                const parsed = JSON.parse(event.content) as { id: string };
                return parsed.id;
            },
        });

        const pending = transport.sendRequest({
            requestId: 'req-2',
            content: 'encrypted-request',
        });

        fake.emit({
            kind: 24133,
            pubkey: 'e'.repeat(64),
            tags: [['p', 'c'.repeat(64)]],
            content: JSON.stringify({ id: 'req-2' }),
            created_at: 1,
        });

        fake.emit(finalizeEvent({
            kind: 24133,
            tags: [['p', 'f'.repeat(64)]],
            content: JSON.stringify({ id: 'req-2' }),
            created_at: 2,
        }, signerSecretKey));

        fake.emit(createSignedResponseEvent({
            secretKey: signerSecretKey,
            localPubkey: 'c'.repeat(64),
            content: JSON.stringify({ id: 'req-2' }),
            createdAt: 3,
        }));

        await expect(pending).resolves.toMatchObject({ created_at: 3 });
        transport.close();
    });
});
