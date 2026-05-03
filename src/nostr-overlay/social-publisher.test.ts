import { describe, expect, test, vi } from 'vitest';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { createSocialPublisher, type SocialPublisher } from './social-publisher';
import { createWriteGateway } from '../nostr/write-gateway';

const TEST_SECRET_KEY = new Uint8Array(32).fill(2);
const TEST_PUBKEY = getPublicKey(TEST_SECRET_KEY);

function signTestEvent(event: { kind: number; created_at: number; tags: string[][]; content: string }) {
    return finalizeEvent({
        kind: event.kind,
        created_at: event.created_at,
        tags: event.tags.map((tag) => [...tag]),
        content: event.content,
    }, TEST_SECRET_KEY);
}

describe('social publisher', () => {
    test('exposes persisted ACK methods on the SocialPublisher interface', () => {
        const publisher = {} as SocialPublisher;
        const methods: {
            publishProfileMetadata: SocialPublisher['publishProfileMetadata'];
            publishContactList: SocialPublisher['publishContactList'];
            publishMuteList: SocialPublisher['publishMuteList'];
        } = publisher;

        expect(methods).toBe(publisher);
    });

    test('publishes contact lists through social relays and requires an ACK', async () => {
        const preservedTags = [['p', '3'.repeat(64), 'wss://relay.example', 'Synthetic']];
        const signedEvent = signTestEvent({
            kind: 3,
            created_at: 123,
            tags: preservedTags,
            content: '',
        });
        const publishContactList = vi.fn(async () => signedEvent);
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.damus.io'],
            failedRelays: [],
            timeoutRelays: [],
        }));
        const writeGateway = {
            publishEvent: vi.fn(),
            publishTextNote: vi.fn(),
            publishContactList,
        };

        const publisher = createSocialPublisher({
            writeGateway,
            publishForwardApi: { forward },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        const published = await publisher.publishContactList(['3'.repeat(64)], preservedTags);

        expect(publishContactList).toHaveBeenCalledWith(['3'.repeat(64)], preservedTags);
        expect(forward).toHaveBeenCalledWith({
            event: signedEvent,
            relayScope: 'social',
            relays: ['wss://relay.damus.io'],
        });
        expect(published).toBe(signedEvent);
    });

    test('preserves contact list metadata in fallback publishing', async () => {
        const retained = '3'.repeat(64);
        const removed = '4'.repeat(64);
        const appended = '5'.repeat(64);
        const publishEvent = vi.fn(async (event) => signTestEvent(event));
        const publisher = createSocialPublisher({
            writeGateway: {
                publishEvent,
                publishTextNote: vi.fn(),
            },
            publishForwardApi: {
                forward: vi.fn(async () => ({
                    ackedRelays: ['wss://relay.damus.io'],
                    failedRelays: [],
                    timeoutRelays: [],
                })),
            },
            resolveRelays: () => ['wss://relay.damus.io'],
            now: () => 321,
        });

        await publisher.publishContactList([retained, appended], [
            ['p', retained, 'wss://relay.example', 'Synthetic'],
            ['p', removed, 'wss://relay.example', 'Removed'],
        ]);

        expect(publishEvent).toHaveBeenCalledWith({
            kind: 3,
            content: '',
            created_at: 321,
            tags: [
                ['p', retained, 'wss://relay.example', 'Synthetic'],
                ['p', appended],
            ],
        });
    });

    test('publishes profile metadata through social relays and requires an ACK', async () => {
        const signedEvent = signTestEvent({
            kind: 0,
            created_at: 123,
            tags: [],
            content: '{"name":"Synthetic"}',
        });
        const publishProfileMetadata = vi.fn(async () => signedEvent);
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.damus.io'],
            failedRelays: [],
            timeoutRelays: [],
        }));
        const writeGateway = {
            publishEvent: vi.fn(),
            publishTextNote: vi.fn(),
            publishProfileMetadata,
        };

        const publisher = createSocialPublisher({
            writeGateway,
            publishForwardApi: { forward },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        const published = await publisher.publishProfileMetadata('{"name":"Synthetic"}');

        expect(publishProfileMetadata).toHaveBeenCalledWith('{"name":"Synthetic"}');
        expect(forward).toHaveBeenCalledWith({
            event: signedEvent,
            relayScope: 'social',
            relays: ['wss://relay.damus.io'],
        });
        expect(published).toBe(signedEvent);
    });

    test('publishes mute lists through social relays and requires an ACK', async () => {
        const mutedPubkey = '8'.repeat(64);
        const preservedTags = [['client', 'Nostr City']];
        const signedEvent = signTestEvent({
            kind: 10000,
            created_at: 123,
            tags: [],
            content: 'encrypted-mute-list',
        });
        const publishMuteList = vi.fn(async () => signedEvent);
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.damus.io'],
            failedRelays: [],
            timeoutRelays: [],
        }));
        const writeGateway = {
            publishEvent: vi.fn(),
            publishTextNote: vi.fn(),
            publishMuteList,
            decryptDm: vi.fn(async () => JSON.stringify([...preservedTags, ['p', mutedPubkey]])),
        };

        const publisher = createSocialPublisher({
            writeGateway,
            publishForwardApi: { forward },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        const published = await publisher.publishMuteList([mutedPubkey], preservedTags);

        expect(publishMuteList).toHaveBeenCalledWith([mutedPubkey], preservedTags);
        expect(forward).toHaveBeenCalledWith({
            event: signedEvent,
            relayScope: 'social',
            relays: ['wss://relay.damus.io'],
        });
        expect(published).toBe(signedEvent);
    });

    test('rejects mute lists when decrypted private tags do not match the requested mutation', async () => {
        const mutedPubkey = '8'.repeat(64);
        const wrongMutedPubkey = '9'.repeat(64);
        const signedEvent = signTestEvent({
            kind: 10000,
            created_at: 123,
            tags: [],
            content: 'encrypted-mute-list',
        });
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.damus.io'],
            failedRelays: [],
            timeoutRelays: [],
        }));
        const writeGateway = {
            publishEvent: vi.fn(),
            publishTextNote: vi.fn(),
            publishMuteList: vi.fn(async () => signedEvent),
            decryptDm: vi.fn(async () => JSON.stringify([['p', wrongMutedPubkey]])),
        };
        const publisher = createSocialPublisher({
            writeGateway: writeGateway as any,
            publishForwardApi: { forward },
            resolveOwnerPubkey: () => TEST_PUBKEY,
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        await expect(publisher.publishMuteList([mutedPubkey])).rejects.toThrow('Signed mute list did not match the requested write');
        expect(forward).not.toHaveBeenCalled();
    });

    test('rejects generic events before forwarding when the signer changes the request', async () => {
        const signedEvent = {
            id: '1'.repeat(64),
            pubkey: '2'.repeat(64),
            kind: 1,
            created_at: 123,
            tags: [],
            content: 'changed content',
            sig: '4'.repeat(128),
        };
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.damus.io'],
            failedRelays: [],
            timeoutRelays: [],
        }));
        const publisher = createSocialPublisher({
            writeGateway: {
                publishEvent: vi.fn(async () => signedEvent),
                publishTextNote: vi.fn(),
            },
            publishForwardApi: { forward },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        await expect(publisher.publishEvent({
            kind: 1,
            content: 'requested content',
            created_at: 123,
            tags: [],
        })).rejects.toThrow('Signed social event did not match the requested write');
        expect(forward).not.toHaveBeenCalled();
    });

    test('rejects invalid NIP-01 signed events before forwarding', async () => {
        const invalidSignedEvent = {
            id: '1'.repeat(64),
            pubkey: TEST_PUBKEY,
            kind: 1,
            created_at: 123,
            tags: [],
            content: 'hola',
            sig: '2'.repeat(128),
        };
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.damus.io'],
            failedRelays: [],
            timeoutRelays: [],
        }));
        const publisher = createSocialPublisher({
            writeGateway: {
                publishEvent: vi.fn(async () => invalidSignedEvent),
                publishTextNote: vi.fn(),
            },
            publishForwardApi: { forward },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        await expect(publisher.publishEvent({
            kind: 1,
            content: 'hola',
            created_at: 123,
            tags: [],
        })).rejects.toThrow('Signed social event failed NIP-01 verification');
        expect(forward).not.toHaveBeenCalled();
    });

    test('rejects profile metadata before forwarding when signed content changes', async () => {
        const signedEvent = {
            id: '5'.repeat(64),
            pubkey: '6'.repeat(64),
            kind: 0,
            created_at: 123,
            tags: [],
            content: '{"name":"Changed"}',
            sig: '7'.repeat(128),
        };
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.damus.io'],
            failedRelays: [],
            timeoutRelays: [],
        }));
        const publisher = createSocialPublisher({
            writeGateway: {
                publishEvent: vi.fn(),
                publishTextNote: vi.fn(),
                publishProfileMetadata: vi.fn(async () => signedEvent),
            },
            publishForwardApi: { forward },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        await expect(publisher.publishProfileMetadata('{"name":"Requested"}')).rejects.toThrow('Signed social event did not match the requested write');
        expect(forward).not.toHaveBeenCalled();
    });

    test('rejects contact lists before forwarding when signed tags drop requested follows', async () => {
        const followedPubkey = '3'.repeat(64);
        const signedEvent = {
            id: '1'.repeat(64),
            pubkey: '2'.repeat(64),
            kind: 3,
            created_at: 123,
            tags: [],
            content: '',
            sig: '4'.repeat(128),
        };
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.damus.io'],
            failedRelays: [],
            timeoutRelays: [],
        }));
        const publisher = createSocialPublisher({
            writeGateway: {
                publishEvent: vi.fn(),
                publishTextNote: vi.fn(),
                publishContactList: vi.fn(async () => signedEvent),
            },
            publishForwardApi: { forward },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        await expect(publisher.publishContactList([followedPubkey])).rejects.toThrow('Signed social event did not match the requested write');
        expect(forward).not.toHaveBeenCalled();
    });

    test('rejects wrong-owner signed events before forwarding', async () => {
        const ownerPubkey = 'a'.repeat(64);
        const wrongPubkey = 'b'.repeat(64);
        const followedPubkey = 'c'.repeat(64);
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.damus.io'],
            failedRelays: [],
            timeoutRelays: [],
        }));
        const createPublisher = (writeGateway: Parameters<typeof createSocialPublisher>[0]['writeGateway']) => createSocialPublisher({
            writeGateway,
            publishForwardApi: { forward },
            resolveOwnerPubkey: () => ownerPubkey,
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        await expect(createPublisher({
            publishEvent: vi.fn(async (event) => ({
                ...event,
                id: '1'.repeat(64),
                pubkey: wrongPubkey,
                sig: '2'.repeat(128),
            })),
            publishTextNote: vi.fn(),
        }).publishEvent({
            kind: 1,
            content: 'generic',
            created_at: 123,
            tags: [],
        })).rejects.toThrow('Signed social event did not match the active owner');

        await expect(createPublisher({
            publishEvent: vi.fn(),
            publishTextNote: vi.fn(async (content: string, tags: string[][] = []) => ({
                id: '3'.repeat(64),
                pubkey: wrongPubkey,
                kind: 1,
                created_at: 123,
                tags,
                content,
                sig: '4'.repeat(128),
            })),
        }).publishTextNote('text note', [])).rejects.toThrow('Signed social event did not match the active owner');

        await expect(createPublisher({
            publishEvent: vi.fn(),
            publishTextNote: vi.fn(),
            publishProfileMetadata: vi.fn(async (content: string) => ({
                id: '5'.repeat(64),
                pubkey: wrongPubkey,
                kind: 0,
                created_at: 123,
                tags: [],
                content,
                sig: '6'.repeat(128),
            })),
        }).publishProfileMetadata('{"name":"Synthetic"}')).rejects.toThrow('Signed social event did not match the active owner');

        await expect(createPublisher({
            publishEvent: vi.fn(),
            publishTextNote: vi.fn(),
            publishContactList: vi.fn(async () => ({
                id: '7'.repeat(64),
                pubkey: wrongPubkey,
                kind: 3,
                created_at: 123,
                tags: [['p', followedPubkey]],
                content: '',
                sig: '8'.repeat(128),
            })),
        }).publishContactList([followedPubkey])).rejects.toThrow('Signed social event did not match the active owner');

        await expect(createPublisher({
            publishEvent: vi.fn(),
            publishTextNote: vi.fn(),
            publishMuteList: vi.fn(async () => ({
                id: '9'.repeat(64),
                pubkey: wrongPubkey,
                kind: 10000,
                created_at: 123,
                tags: [],
                content: 'encrypted-mute-list',
                sig: 'a'.repeat(128),
            })),
        }).publishMuteList([followedPubkey])).rejects.toThrow('Signed social event did not match the active owner');

        expect(forward).not.toHaveBeenCalled();
    });

    test('rejects profile metadata when no social relay acknowledges the event', async () => {
        const signedEvent = signTestEvent({
            kind: 0,
            created_at: 123,
            tags: [],
            content: '{"name":"Synthetic"}',
        });
        const writeGateway = {
            publishEvent: vi.fn(),
            publishTextNote: vi.fn(),
            publishProfileMetadata: vi.fn(async () => signedEvent),
        };
        const publisher = createSocialPublisher({
            writeGateway,
            publishForwardApi: {
                forward: vi.fn(async () => ({
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: ['wss://relay.damus.io'],
                })),
            },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        await expect(publisher.publishProfileMetadata('{"name":"Synthetic"}')).rejects.toThrow('No social relays acknowledged the event');
    });

    test('rejects contact lists when no social relay acknowledges the event', async () => {
        const signedEvent = signTestEvent({
            kind: 3,
            created_at: 123,
            tags: [['p', '3'.repeat(64)]],
            content: '',
        });
        const writeGateway = {
            publishEvent: vi.fn(),
            publishTextNote: vi.fn(),
            publishContactList: vi.fn(async () => signedEvent),
        };
        const publisher = createSocialPublisher({
            writeGateway,
            publishForwardApi: {
                forward: vi.fn(async () => ({
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: ['wss://relay.damus.io'],
                })),
            },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        await expect(publisher.publishContactList(['3'.repeat(64)])).rejects.toThrow('No social relays acknowledged the event');
    });

    test('rejects mute lists when no social relay acknowledges the event', async () => {
        const signedEvent = signTestEvent({
            kind: 10000,
            created_at: 123,
            tags: [],
            content: 'encrypted-mute-list',
        });
        const writeGateway = {
            publishEvent: vi.fn(),
            publishTextNote: vi.fn(),
            publishMuteList: vi.fn(async () => signedEvent),
            decryptDm: vi.fn(async () => JSON.stringify([['client', 'Nostr City'], ['p', '8'.repeat(64)]])),
        };
        const publisher = createSocialPublisher({
            writeGateway,
            publishForwardApi: {
                forward: vi.fn(async () => ({
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: ['wss://relay.damus.io'],
                })),
            },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        await expect(publisher.publishMuteList(['8'.repeat(64)], [['client', 'Nostr City']])).rejects.toThrow('No social relays acknowledged the event');
    });

    test('rejects mute list events that expose muted pubkeys in public tags', async () => {
        const mutedPubkey = '8'.repeat(64);
        const signedEvent = {
            id: 'c'.repeat(64),
            pubkey: 'd'.repeat(64),
            kind: 10000,
            created_at: 123,
            tags: [['p', mutedPubkey]],
            content: 'encrypted-mute-list',
            sig: 'e'.repeat(128),
        };
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.damus.io'],
            failedRelays: [],
            timeoutRelays: [],
        }));
        const publisher = createSocialPublisher({
            writeGateway: {
                publishEvent: vi.fn(),
                publishTextNote: vi.fn(),
                publishMuteList: vi.fn(async () => signedEvent),
            },
            publishForwardApi: { forward },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        await expect(publisher.publishMuteList([mutedPubkey])).rejects.toThrow('Signed mute list must not expose muted pubkeys');
        expect(forward).not.toHaveBeenCalled();
    });

    test('does not fall back to public mute list tags when encrypted mute publishing is unavailable', async () => {
        const publishEvent = vi.fn(async (event) => signTestEvent(event));
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.damus.io'],
            failedRelays: [],
            timeoutRelays: [],
        }));
        const publisher = createSocialPublisher({
            writeGateway: {
                publishEvent,
                publishTextNote: vi.fn(),
            },
            publishForwardApi: { forward },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        await expect(publisher.publishMuteList(['8'.repeat(64)], [['client', 'Nostr City']])).rejects.toThrow('Encrypted mute list publishing is unavailable');
        expect(publishEvent).not.toHaveBeenCalled();
        expect(forward).not.toHaveBeenCalled();
    });

    test('deduplicates and filters contact list fallback pubkeys before signing', async () => {
        const firstPubkey = '1'.repeat(64);
        const secondPubkey = '2'.repeat(64);
        const publishEvent = vi.fn(async (event) => signTestEvent(event));
        const publisher = createSocialPublisher({
            writeGateway: {
                publishEvent,
                publishTextNote: vi.fn(),
            },
            publishForwardApi: {
                forward: vi.fn(async () => ({
                    ackedRelays: ['wss://relay.damus.io'],
                    failedRelays: [],
                    timeoutRelays: [],
                })),
            },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        await publisher.publishContactList([firstPubkey, 'not-a-pubkey', firstPubkey, secondPubkey]);

        expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({
            kind: 3,
            tags: [['p', firstPubkey], ['p', secondPubkey]],
        }));
    });

    test('rejects ACKs from relays that were not requested', async () => {
        const publisher = createSocialPublisher({
            writeGateway: {
                publishEvent: vi.fn(async () => signTestEvent({
                    kind: 1,
                    created_at: 123,
                    tags: [],
                    content: 'hola',
                })),
                publishTextNote: vi.fn(),
            },
            publishForwardApi: {
                forward: vi.fn(async () => ({
                    ackedRelays: ['wss://relay.primal.net'],
                    failedRelays: [],
                    timeoutRelays: [],
                })),
            },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        await expect(publisher.publishEvent({
            kind: 1,
            content: 'hola',
            created_at: 123,
            tags: [],
        })).rejects.toThrow('No social relays acknowledged the event');
    });

    test('forwards signed events to social relays and returns the signed event when at least one relay acks', async () => {
        const publishEvent = vi.fn(async () => signTestEvent({
            kind: 1,
            created_at: 123,
            tags: [],
            content: 'hola',
        }));
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.damus.io'],
            failedRelays: [],
            timeoutRelays: [],
        }));

        const publisher = createSocialPublisher({
            writeGateway: {
                publishEvent,
                publishTextNote: vi.fn(),
            },
            publishForwardApi: { forward },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        const published = await publisher.publishEvent({
            kind: 1,
            content: 'hola',
            created_at: 123,
            tags: [],
        });

        expect(publishEvent).toHaveBeenCalledWith({
            kind: 1,
            content: 'hola',
            created_at: 123,
            tags: [],
        });
        expect(forward).toHaveBeenCalledWith({
            event: published,
            relayScope: 'social',
            relays: ['wss://relay.damus.io'],
        });
        expect(published.pubkey).toBe(TEST_PUBKEY);
    });

    test('fails when no relay acknowledges the event', async () => {
        const publisher = createSocialPublisher({
            writeGateway: {
                publishEvent: vi.fn(async () => signTestEvent({
                    kind: 1,
                    created_at: 123,
                    tags: [],
                    content: 'hola',
                })),
                publishTextNote: vi.fn(),
            },
            publishForwardApi: {
                forward: vi.fn(async () => ({
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: ['wss://relay.damus.io'],
                })),
            },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        await expect(publisher.publishEvent({
            kind: 1,
            content: 'hola',
            created_at: 123,
            tags: [],
        })).rejects.toThrow('No social relays acknowledged the event');
    });

    test('preserves writeGateway method binding when publishTextNote delegates through this.publishEvent', async () => {
        const writeGateway = createWriteGateway({
            getSession: () => ({
                method: 'nip07',
                pubkey: 'b'.repeat(64),
                readonly: false,
                locked: false,
                createdAt: 1,
                capabilities: {
                    canSign: true,
                    canEncrypt: false,
                    encryptionSchemes: [],
                },
            }),
            getProvider: () => ({
                signEvent: vi.fn(async (event) => signTestEvent(event)),
            } as any),
        });
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.damus.io'],
            failedRelays: [],
            timeoutRelays: [],
        }));

        const publisher = createSocialPublisher({
            writeGateway,
            publishForwardApi: { forward },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        const published = await publisher.publishTextNote('hola ligada', []);

        expect(published.content).toBe('hola ligada');
        expect(forward).toHaveBeenCalledWith(expect.objectContaining({
            relayScope: 'social',
        }));
    });

    test('rejects publishing when resolved social relays are not allowed', async () => {
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.damus.io'],
            failedRelays: [],
            timeoutRelays: [],
        }));

        const publisher = createSocialPublisher({
            writeGateway: {
                publishEvent: vi.fn(async () => signTestEvent({
                    kind: 1,
                    created_at: 123,
                    tags: [],
                    content: 'hola',
                })),
                publishTextNote: vi.fn(),
            },
            publishForwardApi: { forward },
            resolveRelays: () => Array.from({ length: 10 }, (_, index) => `wss://relay-${index}.example`),
        });

        await expect(publisher.publishEvent({
            kind: 1,
            content: 'hola',
            created_at: 123,
            tags: [],
        })).rejects.toThrow('No allowed social relays configured');

        expect(forward).not.toHaveBeenCalled();
    });

    test('filters social relays to the backend allowlist', async () => {
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.damus.io'],
            failedRelays: [],
            timeoutRelays: [],
        }));

        const publisher = createSocialPublisher({
            writeGateway: {
                publishEvent: vi.fn(async () => signTestEvent({
                    kind: 1,
                    created_at: 123,
                    tags: [],
                    content: 'hola',
                })),
                publishTextNote: vi.fn(),
            },
            publishForwardApi: { forward },
            resolveRelays: () => [
                'wss://relay.snort.social',
                'wss://relay.damus.io',
                'wss://relay.bitcoiner.social',
            ],
        });

        await publisher.publishEvent({
            kind: 1,
            content: 'hola',
            created_at: 123,
            tags: [],
        });

        expect(forward).toHaveBeenCalledWith(expect.objectContaining({
            relayScope: 'social',
            relays: ['wss://relay.damus.io'],
        }));
    });
});
