import { afterEach, describe, expect, it, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../nostr/ui-settings';
import {
  SITE_THEME_CHANGE_EVENT,
  readSiteThemePreference,
  readStoredSiteThemeValue,
  resolveSiteTheme,
  saveSiteThemePreference,
} from './theme-preference';

function mockSystemTheme(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('site theme preference', () => {
  it('resolves to light when no explicit preference is stored', () => {
    mockSystemTheme(true);

    expect(readStoredSiteThemeValue()).toBeNull();
    expect(readSiteThemePreference()).toBe('light');
    expect(resolveSiteTheme()).toBe('light');
  });

  it('uses light for a legacy persisted system default', () => {
    window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ theme: 'system' }));

    expect(readStoredSiteThemeValue()).toBe('system');
    expect(readSiteThemePreference()).toBe('light');
    expect(resolveSiteTheme()).toBe('light');
  });

  it('distinguishes an explicit system preference from a missing theme value', () => {
    window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
      theme: 'system',
      themePreferenceVersion: 2,
    }));

    expect(readStoredSiteThemeValue()).toBe('system');
    expect(readSiteThemePreference()).toBe('system');
  });

  it('uses a stored light or dark preference ahead of the system theme', () => {
    mockSystemTheme(true);
    window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ theme: 'light' }));

    expect(readSiteThemePreference()).toBe('light');
    expect(resolveSiteTheme()).toBe('light');
  });

  it('persists the selected theme without dropping other UI settings', () => {
    window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en', streetLabelsEnabled: false }));
    const listener = vi.fn();
    window.addEventListener(SITE_THEME_CHANGE_EVENT, listener);

    saveSiteThemePreference('dark');

    const stored = JSON.parse(window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY) || '{}') as Record<string, unknown>;
    expect(stored).toEqual({
      language: 'en',
      streetLabelsEnabled: false,
      theme: 'dark',
      themePreferenceVersion: 2,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(SITE_THEME_CHANGE_EVENT, listener);
  });
});
