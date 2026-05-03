import { describe, expect, test, vi } from 'vitest';
import type { HttpClient } from './http-client';
import { createPublishForwardApi } from './publish-forward-api';

describe('publish forward API', () => {
    test('maps redacted relay indexes back to requested relays locally', async () => {
        const relays = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
        const postJson = vi.fn(async () => ({
            ackedRelayIndexes: [1],
            failedRelays: [{ relayIndex: 0, reason: 'publish_failed' }],
            timeoutRelayIndexes: [2],
        }));
        const api = createPublishForwardApi({
            client: {
                requestRaw: vi.fn(),
                requestJson: vi.fn(),
                getJson: vi.fn(),
                postJson: postJson as unknown as HttpClient['postJson'],
            },
        });

        const result = await api.forward({
            event: {
                id: '1'.repeat(64),
                pubkey: '2'.repeat(64),
                kind: 1,
                created_at: 123,
                tags: [],
                content: 'hola',
                sig: '3'.repeat(128),
            },
            relayScope: 'social',
            relays,
        });

        expect(result).toEqual({
            ackedRelays: ['wss://nos.lol'],
            failedRelays: [{ relay: 'wss://relay.damus.io', reason: 'publish_failed' }],
            timeoutRelays: ['wss://relay.primal.net'],
        });
        expect(postJson).toHaveBeenCalledWith('/publish/forward', expect.objectContaining({ includeAuth: true }));
    });
});
