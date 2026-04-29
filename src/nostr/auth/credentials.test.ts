import { describe, expect, test } from 'vitest';
import {
    type CredentialKind,
    detectCredentialKind,
    parseCredential,
} from './credentials';

const SAMPLE_NPUB = 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw';
// TEST_VECTOR_DO_NOT_USE: public fixture for unsupported nsec handling.
const SAMPLE_NSEC = 'nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5';
const SAMPLE_HEX = 'f'.repeat(64);

function expectKind(input: string, kind: CredentialKind) {
    expect(detectCredentialKind(input)).toBe(kind);
}

describe('detectCredentialKind', () => {
    test('detects npub, hex and bunker markers', () => {
        expectKind(SAMPLE_NPUB, 'npub');
        expectKind(SAMPLE_HEX, 'hex');
        expectKind('bunker://abc?relay=wss://relay.example.com', 'bunker');
        expectKind('nostrconnect://abc?relay=wss://relay.example.com&secret=test', 'bunker');
    });

    test('returns unknown when marker is unsupported or disallowed for login', () => {
        expectKind('note1something', 'unknown');
        expectKind(SAMPLE_NSEC, 'unknown');
    });
});

describe('parseCredential', () => {
    test('parses npub into hex and preserves original value', () => {
        const parsed = parseCredential(SAMPLE_NPUB);
        expect(parsed.kind).toBe('npub');
        if (parsed.kind !== 'npub') {
            throw new Error('Expected npub credential');
        }

        expect(parsed.original).toBe(SAMPLE_NPUB);
        expect(parsed.pubkeyHex).toMatch(/^[a-f0-9]{64}$/);
    });

    test('parses hex and normalizes to lowercase', () => {
        const parsed = parseCredential('A'.repeat(64));
        expect(parsed.kind).toBe('hex');
        if (parsed.kind !== 'hex') {
            throw new Error('Expected hex credential');
        }

        expect(parsed.hex).toBe('a'.repeat(64));
    });

    test('parses bunker marker as nip46 candidate', () => {
        const signerPubkey = 'a'.repeat(64);
        const uri = `bunker://${signerPubkey}?relay=wss://relay.example.com`;
        const parsed = parseCredential(uri);

        expect(parsed.kind).toBe('bunker');
        if (parsed.kind !== 'bunker') {
            throw new Error('Expected bunker credential');
        }

        expect(parsed.original).toBe(uri);
        expect(parsed.bunkerUri).toBe(uri);
        expect(parsed.parsedNip46.type).toBe('bunker');
        if (parsed.parsedNip46.type !== 'bunker') {
            throw new Error('Expected bunker URI parsing result');
        }

        expect(parsed.parsedNip46.remoteSignerPubkey).toBe(signerPubkey);
        expect(parsed.parsedNip46.relays).toEqual(['wss://relay.example.com']);
    });

    test('parses nostrconnect marker as nip46 candidate', () => {
        const clientPubkey = 'b'.repeat(64);
        // TEST_VECTOR_DO_NOT_USE: fake NIP-46 secret used only for parser coverage.
        const uri = `nostrconnect://${clientPubkey}?relay=wss://relay.example.com&secret=my-secret&perms=sign_event%3A1`;
        const parsed = parseCredential(uri);

        expect(parsed.kind).toBe('bunker');
        if (parsed.kind !== 'bunker') {
            throw new Error('Expected bunker credential');
        }

        expect(parsed.parsedNip46.type).toBe('nostrconnect');
        if (parsed.parsedNip46.type !== 'nostrconnect') {
            throw new Error('Expected nostrconnect URI parsing result');
        }

        expect(parsed.parsedNip46.clientPubkey).toBe(clientPubkey);
        expect(parsed.parsedNip46.secret).toBe('my-secret');
        expect(parsed.parsedNip46.perms).toEqual(['sign_event:1']);
    });

    test('throws for unsupported credential format', () => {
        expect(() => parseCredential('invalid-key-value')).toThrow('Unsupported credential format');
    });

    test('throws for nsec credential because nsec login is removed', () => {
        expect(() => parseCredential(SAMPLE_NSEC)).toThrow('nsec credential login is no longer supported');
    });

    test('throws for invalid bunker uri payload', () => {
        expect(() => parseCredential(`bunker://${'a'.repeat(64)}`)).toThrow(
            'bunker uri requires at least one relay'
        );
    });
});
