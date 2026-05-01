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
        const fetchMetadataEvents = vi.fn(async (relay: string, _author?: string) => {
            if (relay === 'wss://broken.example') {
                throw new Error('relay unavailable');
            }

            return [
                signedMetadataEvent(relay.includes('one') ? 'maps' : 'parks'),
                event({ pubkey: 'a'.repeat(64), tags: [['d', 'spoofed']] }),
            ];
        });

        await expect(discoverNip29GroupsFromRelays({
            relays: ['wss://one.example', 'wss://broken.example', 'wss://two.example'],
            fetchRelayInfo,
            fetchMetadataEvents,
        })).resolves.toEqual([
            { relay: 'wss://one.example', id: 'maps' },
            { relay: 'wss://two.example', id: 'parks' },
        ]);
    });

    test('does not block discovery when one relay never finishes metadata fetch', async () => {
        vi.useFakeTimers();
        const discoveryPromise = discoverNip29GroupsFromRelays({
            relays: ['wss://slow.example', 'wss://one.example'],
            fetchRelayInfo: async () => ({ self: SELF_PUBKEY }),
            fetchMetadataEvents: async (relay) => {
                if (relay === 'wss://slow.example') {
                    return new Promise<NostrEvent[]>(() => undefined);
                }

                return [signedMetadataEvent('maps')];
            },
            timeoutMs: 500,
        });
        let discovered: unknown = null;
        void discoveryPromise.then((groups) => {
            discovered = groups;
        });

        await vi.advanceTimersByTimeAsync(600);

        expect(discovered).toEqual([{ relay: 'wss://one.example', id: 'maps' }]);
        vi.useRealTimers();
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

    test('falls back to unfiltered valid metadata when NIP-11 self is missing or invalid', async () => {
        const fetchMetadataEvents = vi.fn(async (_relay: string, _author?: string) => [
            signedMetadataEvent('maps'),
            event({ pubkey: SELF_PUBKEY, tags: [['d', 'unsigned']] }),
            signedMetadataEvent('Bad Group'),
        ]);

        await expect(discoverNip29GroupsFromRelays({
            relays: ['wss://one.example', 'wss://two.example'],
            fetchRelayInfo: async (relay) => (relay.includes('one') ? {} : { self: 'not-a-hex-key' }),
            fetchMetadataEvents,
        })).resolves.toEqual([
            { relay: 'wss://one.example', id: 'maps' },
            { relay: 'wss://two.example', id: 'maps' },
        ]);
        expect(fetchMetadataEvents).toHaveBeenCalledWith('wss://one.example', undefined);
        expect(fetchMetadataEvents).toHaveBeenCalledWith('wss://two.example', undefined);
    });

    test('uses author-filtered metadata fetch when NIP-11 self is valid', async () => {
        const fetchMetadataEvents = vi.fn(async () => [signedMetadataEvent('maps')]);

        await discoverNip29GroupsFromRelays({
            relays: ['wss://one.example'],
            fetchRelayInfo: async () => ({ self: SELF_PUBKEY }),
            fetchMetadataEvents,
        });

        expect(fetchMetadataEvents).toHaveBeenCalledWith('wss://one.example', SELF_PUBKEY);
    });
});
