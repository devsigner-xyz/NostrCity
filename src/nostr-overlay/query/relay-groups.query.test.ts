/** @vitest-environment jsdom */

import { describe, expect, test, vi } from 'vitest';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { fetchRelayGroupsForRelay } from './relay-groups.query';
import type { NostrClient, NostrEvent, NostrFilter } from '../../nostr/types';

const SELF_SECRET_KEY = new Uint8Array(32).fill(12);
const SELF_PUBKEY = getPublicKey(SELF_SECRET_KEY);

function signedMetadataEvent(input: { id: string; name?: string; about?: string }): NostrEvent {
    const tags = [['d', input.id]];
    if (input.name) {
        tags.push(['name', input.name]);
    }
    if (input.about) {
        tags.push(['about', input.about]);
    }

    return finalizeEvent({
        kind: 39000,
        created_at: 100,
        content: '',
        tags,
    }, SELF_SECRET_KEY);
}

function unsignedEvent(input: Partial<NostrEvent> = {}): NostrEvent {
    return {
        id: input.id ?? 'e'.repeat(64),
        pubkey: input.pubkey ?? SELF_PUBKEY,
        kind: input.kind ?? 39000,
        created_at: input.created_at ?? 100,
        tags: input.tags ?? [['d', 'spoofed']],
        content: input.content ?? '',
    };
}

function createClient(events: NostrEvent[]): NostrClient & { fetchEvents: ReturnType<typeof vi.fn> } {
    return {
        connect: vi.fn(async () => undefined),
        fetchLatestReplaceableEvent: vi.fn(async () => null),
        fetchEvents: vi.fn(async (_filter: NostrFilter) => events),
    };
}

describe('fetchRelayGroupsForRelay', () => {
    test('fetches kind 39000 from one relay using NIP-11 self as author', async () => {
        const client = createClient([signedMetadataEvent({ id: 'maps', name: 'Map makers', about: 'Cities and transit.' })]);
        const fetchRelayInfo = vi.fn(async () => ({ self: SELF_PUBKEY }));

        await expect(fetchRelayGroupsForRelay({
            relayUrl: 'wss://groups.example',
            fetchRelayInfo,
            createClient: () => client,
        })).resolves.toEqual([
            {
                relay: 'wss://groups.example',
                id: 'maps',
                name: 'Map makers',
                description: 'Cities and transit.',
            },
        ]);

        expect(fetchRelayInfo).toHaveBeenCalledWith('wss://groups.example');
        expect(client.connect).toHaveBeenCalledTimes(1);
        expect(client.fetchEvents).toHaveBeenCalledWith({ kinds: [39000], authors: [SELF_PUBKEY] });
    });

    test('ignores spoofed metadata that does not validate against NIP-11 self', async () => {
        const spoofedAuthor = 'a'.repeat(64);
        const client = createClient([
            unsignedEvent({ pubkey: SELF_PUBKEY, tags: [['d', 'unsigned']] }),
            unsignedEvent({ pubkey: spoofedAuthor, tags: [['d', 'spoofed']] }),
            signedMetadataEvent({ id: 'trusted', name: 'Trusted group' }),
        ]);

        await expect(fetchRelayGroupsForRelay({
            relayUrl: 'wss://groups.example',
            fetchRelayInfo: async () => ({ self: SELF_PUBKEY }),
            createClient: () => client,
        })).resolves.toEqual([
            {
                relay: 'wss://groups.example',
                id: 'trusted',
                name: 'Trusted group',
            },
        ]);
    });

    test('falls back to unfiltered group metadata when NIP-11 self is missing or invalid', async () => {
        const client = createClient([
            signedMetadataEvent({ id: 'maps', name: 'Maps' }),
            unsignedEvent({ pubkey: SELF_PUBKEY, tags: [['d', 'unsigned']] }),
        ]);

        await expect(fetchRelayGroupsForRelay({
            relayUrl: 'wss://groups.example',
            fetchRelayInfo: async () => ({ self: 'not-a-hex-key' }),
            createClient: () => client,
        })).resolves.toEqual([
            { relay: 'wss://groups.example', id: 'maps', name: 'Maps' },
        ]);

        expect(client.connect).toHaveBeenCalledTimes(1);
        expect(client.fetchEvents).toHaveBeenCalledWith({ kinds: [39000] });
    });
});
