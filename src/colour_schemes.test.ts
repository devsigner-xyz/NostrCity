import { describe, expect, test } from 'vitest';
import colourSchemes from './colour_schemes';

function hexToRgb(hex: string): [number, number, number] {
    const normalized = hex.replace('#', '');
    return [
        Number.parseInt(normalized.slice(0, 2), 16),
        Number.parseInt(normalized.slice(2, 4), 16),
        Number.parseInt(normalized.slice(4, 6), 16),
    ];
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
    const [r, g, b] = [red, green, blue].map((channel) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
    const foregroundLuminance = relativeLuminance(hexToRgb(foreground));
    const backgroundLuminance = relativeLuminance(hexToRgb(background));
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);

    return (lighter + 0.05) / (darker + 0.05);
}

describe('colour schemes defaults', () => {
    test('legacy presets are not exposed in the map preset catalog', () => {
        expect(Object.keys(colourSchemes)).not.toEqual(expect.arrayContaining([
            'Default',
            'Drawn (slow)',
            'Drawn2 (slow)',
            'Paper',
            'GoogleNoZoom',
            'Assassin',
        ]));
    });

    test('Nostr City Light replaces Google as the default light preset', () => {
        const nostrCityLight = (colourSchemes as any)['Nostr City Light'];

        expect((colourSchemes as any).Google).toBeUndefined();
        expect(nostrCityLight).toMatchObject({
            bgColour: 'rgb(236,236,236)',
            bgColourIn: 'rgb(248,249,250)',
            buildingModels: false,
            zoomBuildings: true,
            outlineSize: 2,
        });
    });

    test('Nostr City Dark uses the dark logo neon palette', () => {
        const nostrCityDark = (colourSchemes as any)['Nostr City Dark'];

        expect(nostrCityDark).toMatchObject({
            bgColour: '#030511',
            bgColourIn: '#080D2A',
            buildingColour: '#10164A',
            buildingSideColour: '#070A24',
            buildingStroke: '#8E35FF',
            seaColour: '#073D85',
            grassColour: '#392072',
            minorRoadColour: '#35D7FF',
            minorRoadOutline: '#13205F',
            majorRoadColour: '#D33CFF',
            majorRoadOutline: '#8E35FF',
            mainRoadColour: '#F6F8FF',
            mainRoadOutline: '#8E35FF',
            frameColour: '#030511',
            frameTextColour: '#F6F8FF',
            occupiedBuildingColour: '#35D7FF',
            occupiedBuildingStroke: '#8EEAFF',
            hoveredBuildingColour: '#D33CFF',
            hoveredBuildingStroke: '#F6F8FF',
            streetLabelColour: '#030511',
            waterLabelColour: '#8EEAFF',
            parkLabelColour: '#FF8AF3',
            zoomBuildings: true,
            buildingModels: false,
            outlineSize: 2,
        });
    });

    test('Nostr City Dark label colours pass WCAG AA contrast against their map surfaces', () => {
        const nostrCityDark = (colourSchemes as any)['Nostr City Dark'];
        const minimumNormalTextContrast = 4.5;

        expect(contrastRatio(nostrCityDark.streetLabelColour, nostrCityDark.minorRoadColour)).toBeGreaterThanOrEqual(minimumNormalTextContrast);
        expect(contrastRatio(nostrCityDark.streetLabelColour, nostrCityDark.majorRoadColour)).toBeGreaterThanOrEqual(minimumNormalTextContrast);
        expect(contrastRatio(nostrCityDark.streetLabelColour, nostrCityDark.mainRoadColour)).toBeGreaterThanOrEqual(minimumNormalTextContrast);
        expect(contrastRatio(nostrCityDark.waterLabelColour, nostrCityDark.seaColour)).toBeGreaterThanOrEqual(minimumNormalTextContrast);
        expect(contrastRatio(nostrCityDark.parkLabelColour, nostrCityDark.grassColour)).toBeGreaterThanOrEqual(minimumNormalTextContrast);
    });
});
