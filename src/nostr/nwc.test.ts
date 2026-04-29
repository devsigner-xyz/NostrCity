import { describe, expect, test } from 'vitest';
import {
    createNwcClient,
    getNwcClientPubkey,
    parseNwcConnectionUri,
    resolveNwcEncryptionMode,
    resolveNwcInfoCapabilities,
} from './nwc';
import type { NostrEvent } from './types';

const PUBKEY = 'a'.repeat(64);
// TEST_VECTOR_DO_NOT_USE: deterministic fake NWC secret for unit tests only.
const SECRET = 'b'.repeat(64);

function createFakeIo() {
    let handler: ((event: NostrEvent) => void) | undefined;
    const published: NostrEvent[] = [];

    return {
        published,
        io: {
            async publish(event: NostrEvent) {
                published.push(event);
            },
            subscribe(_filter: unknown, next: (event: NostrEvent) => void) {
                handler = next;
                return () => {
                    handler = undefined;
                };
            },
        },
        emit(event: NostrEvent) {
            handler?.(event);
        },
    };
}

describe('nwc', () => {
    test('parses nostr+walletconnect uri and normalizes relays', () => {
        const parsed = parseNwcConnectionUri(
            `nostr+walletconnect://${PUBKEY}?relay=wss://relay.one.example/&relay=wss://relay.one.example&secret=${SECRET}`
        );

        expect(parsed).toEqual({
            walletServicePubkey: PUBKEY,
            relays: ['wss://relay.one.example'],
            secret: SECRET,
            uri: `nostr+walletconnect://${PUBKEY}?relay=wss://relay.one.example/&relay=wss://relay.one.example&secret=${SECRET}`,
        });
    });

    test('rejects invalid nwc uri inputs', () => {
        expect(() => parseNwcConnectionUri('https://example.com')).toThrow('Unsupported NWC URI scheme');
        expect(() => parseNwcConnectionUri(`nostr+walletconnect://invalid?relay=wss://relay.one.example&secret=${SECRET}`)).toThrow(
            'NWC URI pubkey must be 64-char lowercase hex'
        );
        expect(() => parseNwcConnectionUri(`nostr+walletconnect://${PUBKEY}?secret=${SECRET}`)).toThrow(
            'NWC URI requires at least one relay'
        );
        expect(() => parseNwcConnectionUri(`nostr+walletconnect://${PUBKEY}?relay=wss://relay.one.example&secret=short`)).toThrow(
            'NWC URI secret must be 32-byte hex'
        );
    });

    test('resolves capabilities from info content tokens', () => {
        expect(resolveNwcInfoCapabilities(' pay_invoice get_balance make_invoice notifications pay_invoice ')).toEqual({
            payInvoice: true,
            makeInvoice: true,
            notifications: true,
        });
    });

    test('picks encryption mode from encryption tags with nip44 priority', () => {
        expect(resolveNwcEncryptionMode([
            ['encryption', 'nip04'],
            ['encryption', 'nip44_v2 nip04'],
        ])).toBe('nip44_v2');

        expect(resolveNwcEncryptionMode([['encryption', 'nip04 nip04']])).toBe('nip04');
        expect(resolveNwcEncryptionMode([])).toBe('nip04');
        expect(() => resolveNwcEncryptionMode([['encryption', 'custom-mode']])).toThrow(
            'NWC info event does not advertise a supported encryption mode'
        );
    });

    test('derives a deterministic client pubkey from the shared secret', () => {
        expect(getNwcClientPubkey(SECRET)).toHaveLength(64);
        expect(getNwcClientPubkey(SECRET)).toMatch(/^[a-f0-9]{64}$/);
        expect(getNwcClientPubkey(SECRET)).toBe(getNwcClientPubkey(SECRET));
    });

    test('payInvoice publishes request and resolves preimage from response', async () => {
        const fake = createFakeIo();
        const client = createNwcClient({
            connection: {
                method: 'nwc',
                uri: `nostr+walletconnect://${PUBKEY}?relay=wss://relay.one.example&secret=${SECRET}`,
                walletServicePubkey: PUBKEY,
                relays: ['wss://relay.one.example'],
                secret: SECRET,
                encryption: 'nip04',
                restoreState: 'connected',
                capabilities: {
                    payInvoice: true,
                    makeInvoice: true,
                    notifications: false,
                },
            },
            io: fake.io,
            now: () => 100,
            timeoutMs: 100,
            encrypt: async (plaintext) => plaintext,
            decrypt: async (ciphertext) => ciphertext,
            verifyEvent: () => true,
        });

        const pending = client.payInvoice('lnbc1invoice');
        await Promise.resolve();
        expect(fake.published).toHaveLength(1);
        expect(fake.published[0]).toMatchObject({
            kind: 23194,
            pubkey: getNwcClientPubkey(SECRET),
            tags: expect.arrayContaining([
                ['p', PUBKEY],
                ['expiration', '160'],
            ]),
            created_at: 100,
        });

        const requestId = fake.published[0]?.id;
        fake.emit({
            kind: 23195,
            pubkey: PUBKEY,
            tags: [['p', getNwcClientPubkey(SECRET)], ['e', requestId ?? '']],
            content: JSON.stringify({
                result_type: 'pay_invoice',
                error: null,
                result: { preimage: 'abc123' },
            }),
            created_at: 101,
            id: 'r'.repeat(64),
            sig: 'c'.repeat(128),
        });

        await expect(pending).resolves.toEqual({ preimage: 'abc123' });
    });

    test('makeInvoice resolves invoice and expiry from response payload', async () => {
        const fake = createFakeIo();
        const client = createNwcClient({
            connection: {
                method: 'nwc',
                uri: `nostr+walletconnect://${PUBKEY}?relay=wss://relay.one.example&secret=${SECRET}`,
                walletServicePubkey: PUBKEY,
                relays: ['wss://relay.one.example'],
                secret: SECRET,
                encryption: 'nip04',
                restoreState: 'connected',
                capabilities: {
                    payInvoice: true,
                    makeInvoice: true,
                    notifications: false,
                },
            },
            io: fake.io,
            now: () => 100,
            timeoutMs: 100,
            encrypt: async (plaintext) => plaintext,
            decrypt: async (ciphertext) => ciphertext,
            verifyEvent: () => true,
        });

        const pending = client.makeInvoice({ amountMsats: 21000 });
        await Promise.resolve();
        const requestId = fake.published[0]?.id;
        fake.emit({
            kind: 23195,
            pubkey: PUBKEY,
            tags: [['p', getNwcClientPubkey(SECRET)], ['e', requestId ?? '']],
            content: JSON.stringify({
                result_type: 'make_invoice',
                error: null,
                result: { invoice: 'lnbc1invoice', expires_at: 222 },
            }),
            created_at: 101,
            id: 'r'.repeat(64),
            sig: 'c'.repeat(128),
        });

        await expect(pending).resolves.toEqual({ invoice: 'lnbc1invoice', expiresAt: 222 });
    });
});
