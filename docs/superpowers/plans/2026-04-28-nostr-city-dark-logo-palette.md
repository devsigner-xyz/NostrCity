# Nostr City Dark Logo Palette Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the existing `Nostr City Dark` map preset so it matches the approved dark logo palette while preserving accessibility contrast.

**Architecture:** This is a data-only preset update. The map renderer already consumes color-scheme keys from `src/colour_schemes.ts`, while `src/colour_schemes.json` mirrors the same catalog values.

**Tech Stack:** TypeScript, Vitest, existing map style color-scheme tests.

---

## Chunk 1: Palette Update

### Task 1: Pin The New Palette In Tests

**Files:**
- Modify: `src/colour_schemes.test.ts`
- Modify: `src/ts/ui/style-occupancy.test.ts`

- [ ] **Step 1: Update the `Nostr City Dark` expected palette**

Replace the previous orange/green expectations with the approved logo palette:

```ts
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
```

- [ ] **Step 2: Update style occupancy fixtures**

Change the occupied/hovered override fixture in `src/ts/ui/style-occupancy.test.ts` to match the new cyan and magenta interactive states.

- [ ] **Step 3: Run focused tests and confirm they fail before implementation**

Run: `pnpm exec vitest run src/colour_schemes.test.ts src/ts/ui/style-occupancy.test.ts`

Expected: FAIL because implementation still uses the previous palette.

### Task 2: Apply The Palette To Both Catalogs

**Files:**
- Modify: `src/colour_schemes.ts`
- Modify: `src/colour_schemes.json`

- [ ] **Step 1: Update `Nostr City Dark` in `src/colour_schemes.ts`**

Apply the exact palette from the approved spec.

- [ ] **Step 2: Update `Nostr City Dark` in `src/colour_schemes.json`**

Keep every changed value identical to `src/colour_schemes.ts`.

- [ ] **Step 3: Run focused tests and confirm they pass**

Run: `pnpm exec vitest run src/colour_schemes.test.ts src/ts/ui/style-occupancy.test.ts`

Expected: PASS.

- [ ] **Step 4: Run focused typecheck if needed**

Run: `pnpm typecheck:frontend`

Expected: PASS or no new errors attributable to this palette update.
