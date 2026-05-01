import { describe, expect, test, vi } from 'vitest';
import { getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { nip44 } from 'nostr-tools';
import {
    NIP46_RECOMMENDED_PERMISSIONS,
    createNip46CipherForSigner,
    createNip46Runtime,
    createNostrConnectUri,
    generateNip46PairingSecret,
    parseNip46AuthUrl,
    redactNip46Status,
} from './runtime';
import { parseNip46Uri, type ParsedBunkerUri, type ParsedNostrConnectUri } from './uri';

function parseBunkerUri(input: string): ParsedBunkerUri {
    const parsed = parseNip46Uri(input);
    if (parsed.type !== 'bunker') {
        throw new Error('Expected bunker URI');
    }

    return parsed;
}

function parseNostrConnectUri(input: string): ParsedNostrConnectUri {
    const parsed = parseNip46Uri(input);
    if (parsed.type !== 'nostrconnect') {
        throw new Error('Expected nostrconnect URI');
    }

    return parsed;
}

describe('NIP-46 runtime', () => {
    test('creates a bunker runtime that encrypts and decrypts with NIP-44 v2', async () => {
        const clientSecretKey = new Uint8Array(32).fill(7);
        const signerSecretKey = new Uint8Array(32).fill(8);
        const signerPubkey = getPublicKey(signerSecretKey);

        const runtime = createNip46Runtime({
            parsedUri: parseBunkerUri(`bunker://${signerPubkey}?relay=wss://relay.example`),
            pool: { publish: vi.fn(), subscribe: vi.fn(() => ({ close: vi.fn() })), close: vi.fn() },
            clientSecretKey,
        });

        expect(runtime.localPubkey).toBe(getPublicKey(clientSecretKey));
        expect(runtime.remoteSignerPubkey).toBe(signerPubkey);

        const signerCipher = createNip46CipherForSigner({ localSecretKey: signerSecretKey, remotePubkey: runtime.localPubkey });
        const ciphertext = await runtime.cipher!.encrypt('{"id":"req-1","method":"ping","params":[]}');

        expect(ciphertext.startsWith('#')).toBe(false);
        expect(await signerCipher.decrypt(ciphertext)).toBe('{"id":"req-1","method":"ping","params":[]}');

        const response = await signerCipher.encrypt('{"id":"req-1","result":"pong"}');
        expect(await runtime.cipher!.decrypt(response)).toBe('{"id":"req-1","result":"pong"}');
    });

    test('runtime transport signs kind 24133 requests with the client pubkey by default', async () => {
        const clientSecretKey = new Uint8Array(32).fill(11);
        const signerSecretKey = new Uint8Array(32).fill(12);
        const signerPubkey = getPublicKey(signerSecretKey);
        const publishedEvents: Array<Parameters<typeof verifyEvent>[0]> = [];
        const publish = vi.fn((_relays: string[], event: Parameters<typeof verifyEvent>[0]) => {
            publishedEvents.push(event);
            return [Promise.resolve('wss://relay.example')];
        });
        const runtime = createNip46Runtime({
            parsedUri: parseBunkerUri(`bunker://${signerPubkey}?relay=wss://relay.example`),
            pool: { publish, subscribe: vi.fn(() => ({ close: vi.fn() })), close: vi.fn() },
            clientSecretKey,
        });

        await runtime.transport.publish({
            kind: 24133,
            pubkey: runtime.localPubkey,
            tags: [['p', signerPubkey]],
            content: 'encrypted-request',
            created_at: 1714078911,
        });

        const publishedEvent = publishedEvents[0];
        expect(publishedEvent).toMatchObject({
            kind: 24133,
            pubkey: runtime.localPubkey,
            tags: [['p', signerPubkey]],
            content: 'encrypted-request',
            created_at: 1714078911,
        });
        expect(publishedEvent?.id).toMatch(/^[a-f0-9]{64}$/);
        expect(publishedEvent?.sig).toMatch(/^[a-f0-9]{128}$/);
        expect(verifyEvent(publishedEvent as Parameters<typeof verifyEvent>[0])).toBe(true);
    });

    test('creates nostrconnect runtime before remote signer pubkey is known without building a signer cipher', () => {
        const clientSecretKey = new Uint8Array(32).fill(13);
        const clientPubkey = getPublicKey(clientSecretKey);
        const nostrConnectUri = createNostrConnectUri({
            clientPubkey,
            relays: ['wss://relay.example'],
            secret: 'PAIRING_SECRET_DO_NOT_USE',
        });

        const runtime = createNip46Runtime({
            parsedUri: parseNostrConnectUri(nostrConnectUri),
            pool: { publish: vi.fn(), subscribe: vi.fn(() => ({ close: vi.fn() })), close: vi.fn() },
            clientSecretKey,
        });

        expect(runtime.localPubkey).toBe(clientPubkey);
        expect(runtime.remoteSignerPubkey).toBeUndefined();
        expect(runtime.cipher).toBeUndefined();
        expect(runtime.createCipher).toBeDefined();
    });

    test('uses learned signer and updated relays when runtime is recreated after switch_relays', async () => {
        const clientSecretKey = new Uint8Array(32).fill(14);
        const signerSecretKey = new Uint8Array(32).fill(15);
        const signerPubkey = getPublicKey(signerSecretKey);
        const publish = vi.fn(() => [Promise.resolve('wss://relay.updated.example')]);
        const runtime = createNip46Runtime({
            parsedUri: parseNostrConnectUri(createNostrConnectUri({
                clientPubkey: getPublicKey(clientSecretKey),
                relays: ['wss://relay.initial.example'],
                secret: 'PAIRING_SECRET_DO_NOT_USE',
            })),
            pool: { publish, subscribe: vi.fn(() => ({ close: vi.fn() })), close: vi.fn() },
            clientSecretKey,
            remoteSignerPubkey: signerPubkey,
            relays: ['wss://relay.updated.example'],
        });

        await runtime.transport.publish({
            kind: 24133,
            pubkey: runtime.localPubkey,
            tags: [['p', signerPubkey]],
            content: await runtime.createCipher!(signerPubkey).encrypt('hello'),
            created_at: 1714078911,
        });

        expect(runtime.remoteSignerPubkey).toBe(signerPubkey);
        expect(publish).toHaveBeenCalledWith(['wss://relay.updated.example'], expect.objectContaining({ tags: [['p', signerPubkey]] }));
    });

    test('generates URL-safe pairing secrets with at least 128 bits of entropy', () => {
        const secret = generateNip46PairingSecret();

        expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(secret.length).toBeGreaterThanOrEqual(22);
        expect(new Set(Array.from({ length: 16 }, () => generateNip46PairingSecret())).size).toBe(16);
    });

    test('generates nostrconnect URI with recommended group and NIP-44 permissions', () => {
        const clientPubkey = 'a'.repeat(64);
        const uri = createNostrConnectUri({
            clientPubkey,
            relays: ['wss://relay.example'],
            secret: 'PAIRING_SECRET_DO_NOT_USE',
            name: 'Nostr City',
        });

        const parsed = parseNip46Uri(uri);
        expect(parsed.type).toBe('nostrconnect');
        if (parsed.type !== 'nostrconnect') throw new Error('Expected nostrconnect URI');
        expect(parsed.clientPubkey).toBe(clientPubkey);
        expect(parsed.secret).toBe('PAIRING_SECRET_DO_NOT_USE');
        expect(parsed.perms).toEqual(NIP46_RECOMMENDED_PERMISSIONS);
        expect(parsed.perms).toEqual(expect.arrayContaining(['sign_event:9021', 'sign_event:9022', 'nip44_encrypt', 'nip44_decrypt']));
    });

    test('redacts secrets and full URIs in status messages', () => {
        const fullUri = `bunker://${'a'.repeat(64)}?relay=wss://relay.example&secret=SUPER_SECRET`;

        expect(redactNip46Status(`Connecting to ${fullUri}`)).not.toContain(fullUri);
        expect(redactNip46Status(`secret=SUPER_SECRET ${fullUri}`)).not.toContain('SUPER_SECRET');
        expect(redactNip46Status(`secret=SUPER_SECRET ${fullUri}`)).toContain('[redacted');
    });

    test('accepts auth_url only for https and exposes hostname without full URL', () => {
        expect(parseNip46AuthUrl('auth_url:https://signer.example/connect?token=SECRET_DO_NOT_USE')).toEqual({
            hostname: 'signer.example',
        });
        expect(parseNip46AuthUrl('auth_url:http://signer.example/connect')).toBeNull();
        expect(parseNip46AuthUrl('auth_url:not a url')).toBeNull();
    });

    test('runtime cipher output is compatible with nostr-tools nip44 v2 helpers', async () => {
        const clientSecretKey = new Uint8Array(32).fill(9);
        const signerSecretKey = new Uint8Array(32).fill(10);
        const signerPubkey = getPublicKey(signerSecretKey);
        const cipher = createNip46CipherForSigner({ localSecretKey: clientSecretKey, remotePubkey: signerPubkey });
        const conversationKey = nip44.v2.utils.getConversationKey(signerSecretKey, getPublicKey(clientSecretKey));

        const encrypted = await cipher.encrypt('hello');

        expect(nip44.v2.decrypt(encrypted, conversationKey)).toBe('hello');
    });
});
