import type { AppLocale } from '../i18n/types';

export const UI_SETTINGS_STORAGE_KEY = 'nostr.overlay.ui.v1';
export const UI_SETTINGS_LANGUAGE_CHANGE_EVENT = 'nostr.overlay.ui-language-change';
export const UI_THEME_PREFERENCE_VERSION = 2;
export type AgoraFeedLayout = 'list' | 'masonry';
export type UiLanguage = AppLocale;
export type UiTheme = 'light' | 'dark' | 'system';

const DEFAULT_AGORA_FEED_LAYOUT: AgoraFeedLayout = 'list';
const DEFAULT_THEME: UiTheme = 'light';
const DEFAULT_OCCUPIED_LABELS_ZOOM_LEVEL = 8;
const DEFAULT_STREET_LABELS_ENABLED = true;
const DEFAULT_SPECIAL_MARKERS_ENABLED = true;
const DEFAULT_VERIFIED_BUILDINGS_OVERLAY_ENABLED = false;
export const DEFAULT_STREET_LABELS_ZOOM_LEVEL = 2;
const DEFAULT_TRAFFIC_PARTICLES_COUNT = 12;
const DEFAULT_TRAFFIC_PARTICLES_SPEED = 1;

interface UiSettingsPayload {
    agoraFeedLayout?: AgoraFeedLayout;
    language?: UiLanguage;
    theme?: UiTheme;
    themePreferenceVersion?: number;
    occupiedLabelsZoomLevel?: number;
    streetLabelsEnabled?: boolean;
    specialMarkersEnabled?: boolean;
    verifiedBuildingsOverlayEnabled?: boolean;
    streetLabelsZoomLevel?: number;
    trafficParticlesCount?: number;
    trafficParticlesSpeed?: number;
}

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface UiSettingsState {
    agoraFeedLayout: AgoraFeedLayout;
    language: UiLanguage;
    theme: UiTheme;
    occupiedLabelsZoomLevel: number;
    streetLabelsEnabled: boolean;
    specialMarkersEnabled: boolean;
    verifiedBuildingsOverlayEnabled: boolean;
    streetLabelsZoomLevel: number;
    trafficParticlesCount: number;
    trafficParticlesSpeed: number;
}

function normalizeAgoraFeedLayout(value: unknown): AgoraFeedLayout {
    return value === 'masonry' ? 'masonry' : DEFAULT_AGORA_FEED_LAYOUT;
}

function detectDefaultLanguage(): UiLanguage {
    return 'es';
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

function normalizeOccupiedLabelsZoomLevel(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_OCCUPIED_LABELS_ZOOM_LEVEL;
    }

    return Math.max(1, Math.min(20, Math.round(value)));
}

function normalizeLanguage(value: unknown): UiLanguage {
    return value === 'es' || value === 'en' ? value : detectDefaultLanguage();
}

function normalizeTheme(value: unknown): UiTheme {
    return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_THEME;
}

function normalizeStoredTheme(value: unknown, preferenceVersion: unknown): UiTheme {
    const theme = normalizeTheme(value);
    return theme === 'system' && preferenceVersion !== UI_THEME_PREFERENCE_VERSION ? DEFAULT_THEME : theme;
}
function normalizeStreetLabelsZoomLevel(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_STREET_LABELS_ZOOM_LEVEL;
    }

    return Math.max(1, Math.min(20, Math.round(value)));
}

function normalizeStreetLabelsEnabled(value: boolean | undefined): boolean {
    return typeof value === 'boolean' ? value : DEFAULT_STREET_LABELS_ENABLED;
}

function normalizeSpecialMarkersEnabled(value: boolean | undefined): boolean {
    return typeof value === 'boolean' ? value : DEFAULT_SPECIAL_MARKERS_ENABLED;
}

function normalizeVerifiedBuildingsOverlayEnabled(value: boolean | undefined): boolean {
    return typeof value === 'boolean' ? value : DEFAULT_VERIFIED_BUILDINGS_OVERLAY_ENABLED;
}

function normalizeTrafficParticlesCount(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_TRAFFIC_PARTICLES_COUNT;
    }

    return Math.max(0, Math.min(50, Math.round(value)));
}

function normalizeTrafficParticlesSpeed(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_TRAFFIC_PARTICLES_SPEED;
    }

    const clamped = Math.max(0.2, Math.min(3, value));
    return Math.round(clamped * 10) / 10;
}

function isUiSettingsPayload(value: unknown): value is UiSettingsPayload {
    if (!value || typeof value !== 'object') {
        return false;
    }

    return true;
}

export function getDefaultUiSettings(): UiSettingsState {
    return {
        agoraFeedLayout: DEFAULT_AGORA_FEED_LAYOUT,
        language: detectDefaultLanguage(),
        theme: DEFAULT_THEME,
        occupiedLabelsZoomLevel: DEFAULT_OCCUPIED_LABELS_ZOOM_LEVEL,
        streetLabelsEnabled: DEFAULT_STREET_LABELS_ENABLED,
        specialMarkersEnabled: DEFAULT_SPECIAL_MARKERS_ENABLED,
        verifiedBuildingsOverlayEnabled: DEFAULT_VERIFIED_BUILDINGS_OVERLAY_ENABLED,
        streetLabelsZoomLevel: DEFAULT_STREET_LABELS_ZOOM_LEVEL,
        trafficParticlesCount: DEFAULT_TRAFFIC_PARTICLES_COUNT,
        trafficParticlesSpeed: DEFAULT_TRAFFIC_PARTICLES_SPEED,
    };
}

export function loadUiSettings(storage: StorageLike | null = getDefaultStorage()): UiSettingsState {
    if (!storage) {
        return getDefaultUiSettings();
    }

    const raw = storage.getItem(UI_SETTINGS_STORAGE_KEY);
    if (!raw) {
        return getDefaultUiSettings();
    }

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!isUiSettingsPayload(parsed)) {
            return getDefaultUiSettings();
        }

        return {
            agoraFeedLayout: normalizeAgoraFeedLayout(parsed.agoraFeedLayout),
            language: normalizeLanguage(parsed.language),
            theme: normalizeStoredTheme(parsed.theme, parsed.themePreferenceVersion),
            occupiedLabelsZoomLevel: normalizeOccupiedLabelsZoomLevel(parsed.occupiedLabelsZoomLevel),
            streetLabelsEnabled: normalizeStreetLabelsEnabled(parsed.streetLabelsEnabled),
            specialMarkersEnabled: normalizeSpecialMarkersEnabled(parsed.specialMarkersEnabled),
            verifiedBuildingsOverlayEnabled: normalizeVerifiedBuildingsOverlayEnabled(parsed.verifiedBuildingsOverlayEnabled),
            streetLabelsZoomLevel: normalizeStreetLabelsZoomLevel(parsed.streetLabelsZoomLevel),
            trafficParticlesCount: normalizeTrafficParticlesCount(parsed.trafficParticlesCount),
            trafficParticlesSpeed: normalizeTrafficParticlesSpeed(parsed.trafficParticlesSpeed),
        };
    } catch {
        return getDefaultUiSettings();
    }
}

export function saveUiSettings(
    state: UiSettingsState,
    storage: StorageLike | null = getDefaultStorage()
): UiSettingsState {
    const nextState: UiSettingsState = {
        agoraFeedLayout: normalizeAgoraFeedLayout(state.agoraFeedLayout),
        language: normalizeLanguage(state.language),
        theme: normalizeTheme(state.theme),
        occupiedLabelsZoomLevel: normalizeOccupiedLabelsZoomLevel(state.occupiedLabelsZoomLevel),
        streetLabelsEnabled: normalizeStreetLabelsEnabled(state.streetLabelsEnabled),
        specialMarkersEnabled: normalizeSpecialMarkersEnabled(state.specialMarkersEnabled),
        verifiedBuildingsOverlayEnabled: normalizeVerifiedBuildingsOverlayEnabled(state.verifiedBuildingsOverlayEnabled),
        streetLabelsZoomLevel: normalizeStreetLabelsZoomLevel(state.streetLabelsZoomLevel),
        trafficParticlesCount: normalizeTrafficParticlesCount(state.trafficParticlesCount),
        trafficParticlesSpeed: normalizeTrafficParticlesSpeed(state.trafficParticlesSpeed),
    };

    if (storage) {
        const previousLanguage = loadUiSettings(storage).language;
        const payload: UiSettingsPayload = {
            agoraFeedLayout: nextState.agoraFeedLayout,
            language: nextState.language,
            theme: nextState.theme,
            themePreferenceVersion: UI_THEME_PREFERENCE_VERSION,
            occupiedLabelsZoomLevel: nextState.occupiedLabelsZoomLevel,
            streetLabelsEnabled: nextState.streetLabelsEnabled,
            specialMarkersEnabled: nextState.specialMarkersEnabled,
            verifiedBuildingsOverlayEnabled: nextState.verifiedBuildingsOverlayEnabled,
            streetLabelsZoomLevel: nextState.streetLabelsZoomLevel,
            trafficParticlesCount: nextState.trafficParticlesCount,
            trafficParticlesSpeed: nextState.trafficParticlesSpeed,
        };
        storage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(payload));

        if (typeof window !== 'undefined' && previousLanguage !== nextState.language) {
            window.dispatchEvent(new CustomEvent(UI_SETTINGS_LANGUAGE_CHANGE_EVENT, {
                detail: nextState.language,
            }));
        }
    }

    return nextState;
}
