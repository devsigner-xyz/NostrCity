// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { isPublicDemoMode } from './public-demo-mode';

describe('isPublicDemoMode', () => {
  it('enables demo mode for explicit true-like values', () => {
    expect(isPublicDemoMode({ NOSTR_CITY_PUBLIC_DEMO_MODE: 'true' })).toBe(true);
    expect(isPublicDemoMode({ NOSTR_CITY_PUBLIC_DEMO_MODE: '1' })).toBe(true);
  });

  it('keeps demo mode disabled by default and for false-like values', () => {
    expect(isPublicDemoMode({})).toBe(false);
    expect(isPublicDemoMode({ NOSTR_CITY_PUBLIC_DEMO_MODE: 'false' })).toBe(false);
  });
});
