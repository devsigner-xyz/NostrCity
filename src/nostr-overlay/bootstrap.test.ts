import { describe, expect, test, vi } from 'vitest';
import { PUBLIC_SAVED_GROUPS_KIND } from '../nostr/groups';
import { __bootstrapTestUtils } from './bootstrap';

describe('bootstrap publish handling', () => {
    test('classifies fulfilled connection failures as failed relay publishes', () => {
        const result = __bootstrapTestUtils.publishAttemptsToResult([
            { status: 'fulfilled', value: '' },
            { status: 'fulfilled', value: 'connection failure: Error: timeout' },
            { status: 'rejected', reason: new Error('blocked: relay rejected') },
        ], ['wss://acked.example', 'wss://down.example', 'wss://blocked.example']);

        expect(result).toEqual({
            ackedRelays: ['wss://acked.example'],
            failedRelays: [
                { relay: 'wss://down.example', reason: 'connection failure: Error: timeout' },
                { relay: 'wss://blocked.example', reason: 'blocked: relay rejected' },
            ],
            timeoutRelays: [],
        });
    });
});

describe('bootstrap groups service helpers', () => {
    test('treats unavailable public saved groups lookup as empty', async () => {
        const client = {
            connect: vi.fn(async () => undefined),
            fetchLatestReplaceableEvent: vi.fn(async () => {
                throw new Error('relay timed out');
            }),
        };

        await expect(__bootstrapTestUtils.loadVerifiedPublicSavedGroupsEvent({
            client,
            ownerPubkey: 'a'.repeat(64),
        })).resolves.toBeNull();
        expect(client.connect).toHaveBeenCalledOnce();
        expect(client.fetchLatestReplaceableEvent).toHaveBeenCalledWith('a'.repeat(64), PUBLIC_SAVED_GROUPS_KIND);
    });

    test('treats unavailable public saved groups connection as empty', async () => {
        const client = {
            connect: vi.fn(async () => {
                throw new Error('connect timed out');
            }),
            fetchLatestReplaceableEvent: vi.fn(async () => null),
        };

        await expect(__bootstrapTestUtils.loadVerifiedPublicSavedGroupsEvent({
            client,
            ownerPubkey: 'a'.repeat(64),
        })).resolves.toBeNull();
        expect(client.fetchLatestReplaceableEvent).not.toHaveBeenCalled();
    });
});
