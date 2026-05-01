import { describe, expect, test } from 'vitest';
import { mapGroupRelayError, normalizeGroupRelayPublishResult } from './groups-transport';

describe('groups transport helpers', () => {
    test('maps relay policy failures to sanitized UI-facing errors', () => {
        expect(mapGroupRelayError('restricted: invite required for this group')).toEqual({
            code: 'restricted',
            message: 'This group is restricted.',
        });
        expect(mapGroupRelayError('blocked: pubkey is muted by relay')).toEqual({
            code: 'blocked',
            message: 'The relay blocked this action.',
        });
        expect(mapGroupRelayError('duplicate: already have this event id')).toEqual({
            code: 'duplicate',
            message: 'This event was already published.',
        });
    });

    test('does not expose raw relay error details for unknown failures', () => {
        expect(mapGroupRelayError('restricted')).toEqual({ code: 'unknown', message: 'The relay rejected this action.' });
        expect(mapGroupRelayError('database stack trace with pubkey abc')).toEqual({
            code: 'unknown',
            message: 'The relay rejected this action.',
        });
    });

    test('normalizes relay publish results and sanitizes failed relay reasons', () => {
        expect(normalizeGroupRelayPublishResult({
            ackedRelays: [],
            failedRelays: [{ relay: 'wss://relay.example', reason: 'blocked: spam policy internals' }],
            timeoutRelays: ['wss://slow.example'],
        })).toEqual({
            ackedRelays: [],
            failedRelays: [
                {
                    relay: 'wss://relay.example',
                    error: { code: 'blocked', message: 'The relay blocked this action.' },
                },
            ],
            timeoutRelays: ['wss://slow.example'],
        });
    });
});
