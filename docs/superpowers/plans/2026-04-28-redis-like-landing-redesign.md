# Redis Like Landing Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public landing page with a Redis-inspired editorial dark theme while preserving the project's open-source, nonprofit positioning.

**Architecture:** Keep the landing self-contained in `src/landing/LandingPage.tsx` and `src/landing/style.css`, with all user-visible copy in `src/i18n/messages/{es,en}.ts`. Preserve theme persistence and existing public app/docs URL helpers.

**Tech Stack:** React 19, TypeScript, CSS, existing i18n provider, Vitest, Playwright smoke tests.

---

## Chunk 1: Landing Behavior Tests

### Task 1: Update landing assertions

**Files:**
- Modify: `src/landing/LandingPage.test.tsx`
- Modify: `tests/smoke/landing.spec.ts`

- [ ] Add assertions for the new hero copy, no hero visual preview, and two-column feature list marker.
- [ ] Run `pnpm exec vitest run --config vitest.config.mts --project frontend src/landing/LandingPage.test.tsx` and confirm the new assertions fail before implementation.

## Chunk 2: Landing Implementation

### Task 2: Rebuild markup and copy

**Files:**
- Modify: `src/landing/LandingPage.tsx`
- Modify: `src/i18n/messages/es.ts`
- Modify: `src/i18n/messages/en.ts`

- [ ] Replace the hero visual with text-only editorial layout.
- [ ] Add community/value strip and a feature list section rendered as two columns.
- [ ] Keep theme selector, app/docs/GitHub links, skip link, and localized copy.

### Task 3: Rebuild styles

**Files:**
- Modify: `src/landing/style.css`

- [ ] Apply dark-primary Redis-like design with the orange/yellow scale.
- [ ] Make `h1` and `h2` smaller than the mockup and current oversized direction.
- [ ] Make feature list explicitly two-column on desktop and one-column on mobile.

## Chunk 3: Verification

### Task 4: Run checks

**Files:**
- Test: `src/landing/LandingPage.test.tsx`
- Test: `tests/smoke/landing.spec.ts`

- [ ] Run focused frontend unit tests.
- [ ] Run `pnpm lint:frontend`.
- [ ] Run `pnpm typecheck:frontend`.
- [ ] Run `pnpm build:app`.
