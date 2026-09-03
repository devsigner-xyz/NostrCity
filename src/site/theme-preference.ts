import {
  UI_SETTINGS_STORAGE_KEY,
  UI_THEME_PREFERENCE_VERSION,
  type UiTheme,
} from '../nostr/ui-settings';

export type SiteTheme = 'light' | 'dark';

export const SITE_THEME_CHANGE_EVENT = 'nostr.site.theme-change';
export const SITE_THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getDefaultStorage(): StorageLike | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getStoredPayload(storage: StorageLike | null): Record<string, unknown> {
  if (!storage) {
    return {};
  }

  const raw = storage.getItem(UI_SETTINGS_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? { ...parsed } : {};
  } catch {
    return {};
  }
}

function readSystemTheme(): SiteTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia(SITE_THEME_MEDIA_QUERY).matches ? 'dark' : 'light';
}

export function readStoredSiteThemeValue(storage: StorageLike | null = getDefaultStorage()): UiTheme | null {
  const theme = getStoredPayload(storage).theme;
  return theme === 'light' || theme === 'dark' || theme === 'system' ? theme : null;
}

export function readSiteThemePreference(storage: StorageLike | null = getDefaultStorage()): UiTheme {
  const payload = getStoredPayload(storage);
  const theme = payload.theme;

  if (theme === 'system' && payload.themePreferenceVersion !== UI_THEME_PREFERENCE_VERSION) {
    return 'light';
  }

  return theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'light';
}

export function resolveSiteTheme(storage: StorageLike | null = getDefaultStorage()): SiteTheme {
  const preference = readSiteThemePreference(storage);
  return preference === 'system' ? readSystemTheme() : preference;
}

export function saveSiteThemePreference(theme: SiteTheme, storage: StorageLike | null = getDefaultStorage()): SiteTheme {
  if (storage) {
    const payload = getStoredPayload(storage);
    storage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
      ...payload,
      theme,
      themePreferenceVersion: UI_THEME_PREFERENCE_VERSION,
    }));
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SITE_THEME_CHANGE_EVENT, { detail: theme }));
  }

  return theme;
}
