import { describe, expect, test } from 'vitest';
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
