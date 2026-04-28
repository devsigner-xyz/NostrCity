# Nostr City Dark Logo Palette Design

## Goal

Adapt the `Nostr City Dark` map preset so it visually matches the dark Nostr City logo: deep black-blue base, blue city-grid energy, magenta/purple accents, cyan highlights, and luminous white contrast.

## Scope

- Update only the existing `Nostr City Dark` color values.
- Keep the preset name and theme-to-preset behavior unchanged.
- Keep label colors accessible against their map surfaces.
- Update tests that pin the preset palette and any affected rendering fixtures.

## Selected Direction

Use the approved "Logo completo" direction:

- Background and frame: near-black blue.
- Buildings: dark navy/purple blocks with violet strokes.
- Roads: cyan minor roads, violet outlines, and luminous white main roads.
- Water: deep electric blue with bright cyan labels.
- Parks: dark purple with bright pink/magenta labels.
- Interactive states: occupied buildings use cyan, hovered buildings use magenta.

## Palette

| Key | Value | Role |
| --- | --- | --- |
| `bgColour` | `#030511` | Near-black blue exterior background. |
| `bgColourIn` | `#080D2A` | Slightly lighter city interior. |
| `buildingColour` | `#10164A` | Dark navy/purple building tops. |
| `buildingSideColour` | `#070A24` | Deep shadowed building sides. |
| `buildingStroke` | `#8E35FF` | Violet grid/logo outline. |
| `seaColour` | `#073D85` | Deep electric blue water. |
| `grassColour` | `#392072` | Dark purple park surface. |
| `minorRoadColour` | `#35D7FF` | Cyan local road glow. |
| `minorRoadOutline` | `#13205F` | Deep blue local road outline. |
| `majorRoadColour` | `#D33CFF` | Magenta arterial road accent. |
| `majorRoadOutline` | `#8E35FF` | Violet arterial outline. |
| `mainRoadColour` | `#F6F8FF` | Luminous white main road. |
| `mainRoadOutline` | `#8E35FF` | Violet main road outline. |
| `frameColour` | `#030511` | Frame matches dark logo background. |
| `frameTextColour` | `#F6F8FF` | Bright white frame text. |
| `occupiedBuildingColour` | `#35D7FF` | Cyan occupied/pin highlight. |
| `occupiedBuildingStroke` | `#8EEAFF` | Light cyan occupied stroke. |
| `hoveredBuildingColour` | `#D33CFF` | Magenta hover highlight. |
| `hoveredBuildingStroke` | `#F6F8FF` | White hover stroke. |
| `streetLabelColour` | `#030511` | Dark labels for cyan, magenta, and white roads. |
| `waterLabelColour` | `#8EEAFF` | Light cyan labels over water. |
| `parkLabelColour` | `#FF8AF3` | Pink/magenta labels over parks. |

The same values must be applied to both `src/colour_schemes.ts` and `src/colour_schemes.json`.

## Verification

- Run the focused color-scheme and style tests.
- Preserve the WCAG AA contrast test for street, water, and park labels.
