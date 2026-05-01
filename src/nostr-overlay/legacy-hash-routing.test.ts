import { describe, expect, it } from 'vitest';
import { cleanLegacyHashRoutePath, overlayRouterBasenameFromPathname } from './legacy-hash-routing';

describe('cleanLegacyHashRoutePath', () => {
    it('converts legacy app hash routes to BrowserRouter paths', () => {
        expect(cleanLegacyHashRoutePath('/app/', '#/wallet')).toBe('/app/wallet');
        expect(cleanLegacyHashRoutePath('/app/', '#/relays/detail?url=wss%3A%2F%2Frelay.one')).toBe('/app/relays/detail?url=wss%3A%2F%2Frelay.one');
    });

    it('leaves non-legacy hash fragments unchanged', () => {
        expect(cleanLegacyHashRoutePath('/app/wallet', '')).toBeUndefined();
        expect(cleanLegacyHashRoutePath('/app/wallet', '#section')).toBeUndefined();
        expect(cleanLegacyHashRoutePath('/docs/', '#/wallet')).toBeUndefined();
    });
});

describe('overlayRouterBasenameFromPathname', () => {
    it('uses the app basename only for app-prefixed deployments', () => {
        expect(overlayRouterBasenameFromPathname('/app/')).toBe('/app');
        expect(overlayRouterBasenameFromPathname('/app/wallet')).toBe('/app');
        expect(overlayRouterBasenameFromPathname('/notifications')).toBeUndefined();
    });
});
