import { describe, expect, test } from 'vitest';
import { parseNip46Uri } from './uri';

// TEST_VECTOR_DO_NOT_USE: fake NIP-46 pubkey/secret URI fixtures only.
const HEX64 = 'a'.repeat(64);

describe('parseNip46Uri', () => {
    test('parses bunker uri with relays and optional secret', () => {
        const parsed = parseNip46Uri(
            `bunker://${HEX64}?relay=wss://relay.one.example&relay=wss://relay.two.example&secret=s3cr3t`
        );

        expect(parsed.type).toBe('bunker');
        if (parsed.type !== 'bunker') {
            throw new Error('Expected bunker result');
        }

        expect(parsed.remoteSignerPubkey).toBe(HEX64);
        expect(parsed.relays).toEqual(['wss://relay.one.example', 'wss://relay.two.example']);
        expect(parsed.secret).toBe('s3cr3t');
    });

    test('parses nostrconnect uri with required secret', () => {
        const parsed = parseNip46Uri(
            `nostrconnect://${HEX64}?relay=wss://relay.one.example&relay=wss://relay.two.example&secret=abc123&perms=sign_event%3A1%2Cnip44_encrypt&name=Demo+Client`
        );

        expect(parsed.type).toBe('nostrconnect');
        if (parsed.type !== 'nostrconnect') {
            throw new Error('Expected nostrconnect result');
        }

        expect(parsed.clientPubkey).toBe(HEX64);
        expect(parsed.relays).toEqual(['wss://relay.one.example', 'wss://relay.two.example']);
        expect(parsed.secret).toBe('abc123');
        expect(parsed.perms).toEqual(['sign_event:1', 'nip44_encrypt']);
        expect(parsed.name).toBe('Demo Client');
    });

    test('rejects bunker uri without relays', () => {
        expect(() => parseNip46Uri(`bunker://${HEX64}`)).toThrow('bunker uri requires at least one relay');
    });

    test('rejects nostrconnect uri without secret', () => {
        expect(() => parseNip46Uri(`nostrconnect://${HEX64}?relay=wss://relay.one.example`)).toThrow(
            'nostrconnect uri requires secret parameter'
        );
    });

    test('rejects unsupported scheme and invalid pubkeys', () => {
        expect(() => parseNip46Uri('https://example.com')).toThrow('Unsupported NIP-46 URI scheme');
        expect(() => parseNip46Uri('bunker://invalid?relay=wss://relay.one.example')).toThrow(
            'NIP-46 URI pubkey must be 64-char lowercase hex'
        );
    });
});
