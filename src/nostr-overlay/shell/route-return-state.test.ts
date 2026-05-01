import { describe, expect, test } from 'vitest';
import { buildLocationTarget, routeReturnStateFromUnknown } from './route-return-state';

describe('route-return-state', () => {
    test('builds a target from pathname and search', () => {
        expect(buildLocationTarget({ pathname: '/agora', search: '?tag=nostr' })).toBe('/agora?tag=nostr');
        expect(buildLocationTarget({ pathname: '/notifications', search: '' })).toBe('/notifications');
    });

    test('returns empty state for unknown or blank route return values', () => {
        expect(routeReturnStateFromUnknown(null)).toEqual({});
        expect(routeReturnStateFromUnknown('bad')).toEqual({});
        expect(routeReturnStateFromUnknown({ returnTo: '', returnFocusEventId: '' })).toEqual({});
        expect(routeReturnStateFromUnknown({ returnTo: '   ', returnFocusEventId: '\t\n' })).toEqual({});
    });

    test('ignores unsafe or malformed return targets while preserving focus state', () => {
        for (const returnTo of [
            'https://evil.example',
            'javascript:alert(1)',
            'not-a-route',
            '//evil.example',
        ]) {
            expect(routeReturnStateFromUnknown({ returnTo, returnFocusEventId: 'event-1' })).toEqual({
                returnFocusEventId: 'event-1',
            });
        }
    });

    test('preserves valid route return state strings', () => {
        expect(
            routeReturnStateFromUnknown({
                returnTo: '/agora?tag=nostr',
                returnFocusEventId: 'event-1',
            }),
        ).toEqual({
            returnTo: '/agora?tag=nostr',
            returnFocusEventId: 'event-1',
        });
    });

    test('preserves app-local route return targets', () => {
        for (const returnTo of ['/', '/agora', '/agora?tag=nostr', '/notifications', '/agora/notes/abc']) {
            expect(routeReturnStateFromUnknown({ returnTo })).toEqual({ returnTo });
        }
    });
});
