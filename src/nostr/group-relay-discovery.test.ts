import { describe, expect, test, vi } from 'vitest';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import {
    discoverNip29GroupsFromRelays,
    resolveNip29GroupDiscoveryRelays,
} from './group-relay-discovery';
import type { NostrEvent } from './types';

const SELF_SECRET_KEY = new Uint8Array(32).fill(8);
const SELF_PUBKEY = getPublicKey(SELF_SECRET_KEY);

function event(input: Partial<NostrEvent> = {}): NostrEvent {
    return {
        id: input.id ?? 'e'.repeat(64),
        pubkey: input.pubkey ?? 'f'.repeat(64),
        kind: input.kind ?? 39000,
        created_at: input.created_at ?? 100,
        tags: input.tags ?? [],
        content: input.content ?? '',
    };
}

function signedMetadataEvent(id: string): NostrEvent {
    return finalizeEvent({
        kind: 39000,
        created_at: 100,
        content: '',
        tags: [['d', id]],
    }, SELF_SECRET_KEY);
}

describe('group relay discovery', () => {
    test('uses configured group relays, saved group relays, and public r tags for discovery', () => {
        expect(resolveNip29GroupDiscoveryRelays({
            configuredGroupRelays: ['wss://groups.fiatjaf.com/'],
            savedGroups: [{ relay: 'wss://groups.0xchat.com', id: 'maps' }],
            publicRelayTags: ['wss://relay.groups.nip29.com', 'https://invalid.example'],
        })).toEqual([
            'wss://groups.fiatjaf.com',
            'wss://groups.0xchat.com',
            'wss://relay.groups.nip29.com',
        ]);
    });

    test('discovers relay-authored groups and ignores one failed relay', async () => {
        const fetchRelayInfo = vi.fn(async (relay: string) => {
            if (relay === 'wss://broken.example') {
                throw new Error('relay unavailable');
            }

            return { self: SELF_PUBKEY };
        });
        const fetchMetadataEvents = vi.fn(async (relay: string, _author: string) => [
            signedMetadataEvent(relay.includes('one') ? 'maps' : 'parks'),
            event({ pubkey: 'a'.repeat(64), tags: [['d', 'spoofed']] }),
        ]);

        await expect(discoverNip29GroupsFromRelays({
            relays: ['wss://one.example', 'wss://broken.example', 'wss://two.example'],
            fetchRelayInfo,
            fetchMetadataEvents,
        })).resolves.toEqual([
            { relay: 'wss://one.example', id: 'maps' },
            { relay: 'wss://two.example', id: 'parks' },
        ]);
    });

    test('ignores malformed relay-authored group ids without failing discovery', async () => {
        await expect(discoverNip29GroupsFromRelays({
            relays: ['wss://one.example'],
            fetchRelayInfo: async () => ({ self: SELF_PUBKEY }),
            fetchMetadataEvents: async (_relay, _author) => [
                signedMetadataEvent('Bad Group'),
                signedMetadataEvent('maps'),
            ],
        })).resolves.toEqual([{ relay: 'wss://one.example', id: 'maps' }]);
    });

    test('ignores unsigned relay-authored metadata', async () => {
        await expect(discoverNip29GroupsFromRelays({
            relays: ['wss://one.example'],
            fetchRelayInfo: async () => ({ self: SELF_PUBKEY }),
            fetchMetadataEvents: async () => [event({ pubkey: SELF_PUBKEY, tags: [['d', 'maps']] })],
        })).resolves.toEqual([]);
    });

    test('ignores relay metadata when NIP-11 self is not a valid hex pubkey', async () => {
        const fetchMetadataEvents = vi.fn(async () => [event({ pubkey: 'not-a-hex-key', tags: [['d', 'maps']] })]);

        await expect(discoverNip29GroupsFromRelays({
            relays: ['wss://one.example'],
            fetchRelayInfo: async () => ({ self: 'not-a-hex-key' }),
            fetchMetadataEvents,
        })).resolves.toEqual([]);
        expect(fetchMetadataEvents).not.toHaveBeenCalled();
    });
});
