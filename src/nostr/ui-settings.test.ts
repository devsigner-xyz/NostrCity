import { beforeEach, describe, expect, test } from 'vitest';
import {
    UI_SETTINGS_STORAGE_KEY,
    getDefaultUiSettings,
    loadUiSettings,
    saveUiSettings,
} from './ui-settings';

describe('ui-settings', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    test('returns default settings when storage is empty', () => {
        const state = loadUiSettings(window.localStorage);
        expect(state).toEqual(getDefaultUiSettings());
        expect(state.agoraFeedLayout).toBe('list');
        expect(state.theme).toBe('light');
        expect(state.occupiedLabelsZoomLevel).toBe(8);
        expect(state.streetLabelsEnabled).toBe(true);
        expect(state.specialMarkersEnabled).toBe(true);
        expect(state.verifiedBuildingsOverlayEnabled).toBe(false);
        expect(state.streetLabelsZoomLevel).toBe(2);
        expect(state.trafficParticlesCount).toBe(12);
        expect(state.trafficParticlesSpeed).toBe(1);
        expect((state as unknown as Record<string, unknown>).language).toBe('es');
    });

    test('defaults to spanish when no language has been chosen yet', () => {
        Object.defineProperty(window.navigator, 'language', {
            value: 'en-US',
            configurable: true,
        });

        const state = getDefaultUiSettings();

        expect((state as unknown as Record<string, unknown>).language).toBe('es');
    });

    test('persists selected language when saving ui settings', () => {
        saveUiSettings(
            {
                ...getDefaultUiSettings(),
                language: 'es',
            } as Parameters<typeof saveUiSettings>[0],
            window.localStorage
        );

        const stored = JSON.parse(window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY) || '{}') as Record<string, unknown>;
        const loaded = loadUiSettings(window.localStorage) as unknown as Record<string, unknown>;

        expect(stored.language).toBe('es');
        expect(loaded.language).toBe('es');
    });

    test('persists selected theme when saving ui settings', () => {
        saveUiSettings(
            {
                ...getDefaultUiSettings(),
                theme: 'dark',
            },
            window.localStorage
        );

        const stored = JSON.parse(window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY) || '{}') as Record<string, unknown>;
        const loaded = loadUiSettings(window.localStorage);

        expect(stored.theme).toBe('dark');
        expect(stored.themePreferenceVersion).toBe(2);
        expect(loaded.theme).toBe('dark');
    });

    test('uses light for a legacy persisted system default', () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
            language: 'es',
            theme: 'system',
        }));

        expect(loadUiSettings(window.localStorage).theme).toBe('light');
    });

    test('respects system after it is selected with the current preference version', () => {
        saveUiSettings(
            {
                ...getDefaultUiSettings(),
                theme: 'system',
            },
            window.localStorage
        );

        expect(loadUiSettings(window.localStorage).theme).toBe('system');
    });
    test('falls back to defaults when payload is malformed', () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, '{bad-json');
        expect(loadUiSettings(window.localStorage)).toEqual(getDefaultUiSettings());
    });

    test('normalizes zoom threshold when saving', () => {
        const saved = saveUiSettings(
            {
                ...getDefaultUiSettings(),
                agoraFeedLayout: 'masonry',
                occupiedLabelsZoomLevel: 99,
                streetLabelsEnabled: true,
                specialMarkersEnabled: false,
                verifiedBuildingsOverlayEnabled: true,
                streetLabelsZoomLevel: 99,
                trafficParticlesCount: 99,
                trafficParticlesSpeed: 99,
            },
            window.localStorage
        );

        expect(saved.occupiedLabelsZoomLevel).toBe(20);
        expect(saved.streetLabelsZoomLevel).toBe(20);
        expect(saved.agoraFeedLayout).toBe('masonry');
        expect(saved.specialMarkersEnabled).toBe(false);
        expect(saved.trafficParticlesCount).toBe(50);
        expect(saved.trafficParticlesSpeed).toBe(3);
        expect(loadUiSettings(window.localStorage).agoraFeedLayout).toBe('masonry');
        expect(loadUiSettings(window.localStorage).occupiedLabelsZoomLevel).toBe(20);
        expect(loadUiSettings(window.localStorage).streetLabelsZoomLevel).toBe(20);
        expect(loadUiSettings(window.localStorage).trafficParticlesCount).toBe(50);
        expect(loadUiSettings(window.localStorage).trafficParticlesSpeed).toBe(3);
    });

    test('normalizes traffic particle settings when saving out-of-range values', () => {
        const saved = saveUiSettings(
            {
                ...getDefaultUiSettings(),
                agoraFeedLayout: 'list',
                occupiedLabelsZoomLevel: 8,
                streetLabelsEnabled: true,
                specialMarkersEnabled: true,
                verifiedBuildingsOverlayEnabled: false,
                streetLabelsZoomLevel: 10,
                trafficParticlesCount: -5,
                trafficParticlesSpeed: -10,
            },
            window.localStorage
        );

        expect(saved.trafficParticlesCount).toBe(0);
        expect(saved.trafficParticlesSpeed).toBe(0.2);
        expect(saved.agoraFeedLayout).toBe('list');

        const loaded = loadUiSettings(window.localStorage);
        expect(loaded.agoraFeedLayout).toBe('list');
        expect(loaded.trafficParticlesCount).toBe(0);
        expect(loaded.trafficParticlesSpeed).toBe(0.2);
    });

    test('normalizes street labels enabled flag when saving malformed data', () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
            occupiedLabelsZoomLevel: 8,
            streetLabelsEnabled: 'yes',
            specialMarkersEnabled: true,
            streetLabelsZoomLevel: 10,
        }));

        const loaded = loadUiSettings(window.localStorage);
        expect(loaded.streetLabelsEnabled).toBe(true);
    });

    test('falls back to street label zoom default 2 when persisted value is malformed', () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
            occupiedLabelsZoomLevel: 8,
            streetLabelsEnabled: true,
            specialMarkersEnabled: true,
            streetLabelsZoomLevel: 'bad-value',
        }));

        const loaded = loadUiSettings(window.localStorage);
        expect(loaded.streetLabelsZoomLevel).toBe(2);
    });

    test('normalizes verified buildings overlay flag when payload is malformed', () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
            occupiedLabelsZoomLevel: 8,
            streetLabelsEnabled: true,
            specialMarkersEnabled: true,
            verifiedBuildingsOverlayEnabled: 'true',
            streetLabelsZoomLevel: 10,
        }));

        const loaded = loadUiSettings(window.localStorage);
        expect(loaded.verifiedBuildingsOverlayEnabled).toBe(false);
    });

    test('normalizes special markers flag when payload is malformed', () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
            agoraFeedLayout: 'gallery',
            occupiedLabelsZoomLevel: 8,
            streetLabelsEnabled: true,
            specialMarkersEnabled: 'enabled',
            verifiedBuildingsOverlayEnabled: false,
            streetLabelsZoomLevel: 10,
        }));

        const loaded = loadUiSettings(window.localStorage);
        expect(loaded.agoraFeedLayout).toBe('list');
        expect(loaded.specialMarkersEnabled).toBe(true);
    });

    test('falls back to light theme when payload is malformed', () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
            theme: 'sepia',
        }));

        const loaded = loadUiSettings(window.localStorage);
        expect(loaded.theme).toBe('light');
    });
});
