# AGENTS.md

Agent-focused guidance for working in this repository. Keep this file current when project structure, commands, skills, or agent workflows change.

## Project Overview

Nostr City procedurally generates American-style city maps and exports map images and 3D city model assets. The current product also includes a Nostr-native social overlay, a Fastify Backend-for-Frontend (BFF), a VitePress documentation site, and a landing page.

Core stack: TypeScript, React 19, Vite, Tailwind CSS v4, shadcn/ui, Radix UI, Fastify, Nostr tooling, VitePress, Vitest, Playwright, pnpm, and Make.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `src/ts` | Procedural map generation and legacy UI/domain code. |
| `src/nostr` | Nostr domain services, auth, relays, feeds, DMs, zaps, wallet/WebLN/NWC logic. |
| `src/nostr-overlay` | React overlay app, routes, shell, Nostr UI surfaces, map bridge, query controllers. |
| `src/landing` | Public landing page React entry. |
| `src/components/ui` | Local shadcn/ui components. Prefer these before custom UI primitives. |
| `src/i18n` | i18n catalog, providers, translation helper, and `en`/`es` messages. |
| `server/src` | Fastify BFF with `/v1` routes, modules, relay services, plugins, and tests. |
| `app/index.html` | Vite app entry for `/app/`. |
| `index.html` | Vite landing entry. |
| `docs` | VitePress documentation. Most user-facing docs are Spanish. |
| `tests/smoke` | Playwright smoke tests. |
| `.opencode/agents` | Project-specific OpenCode subagents. |
| `.agents/skills` | Project-local skills. Prefer these over generic skills when relevant. |
| `context` | Reference material, especially Nostr-related upstream/context snapshots. Treat as read-mostly unless the task explicitly targets it. |

## Setup

- Use Node from `.nvmrc` (`20`) for CI parity. Newer local Node versions may work, but verify against Node 20 when failures are version-sensitive.
- Use pnpm through Corepack. The current workspace has `pnpm --version` at `10.33.0`; CI currently installs pnpm `10.29.3`.
- Install dependencies with `pnpm install`.
- Use `pnpm install --frozen-lockfile` when reproducing CI.

## Development Commands

| Command | Purpose |
| --- | --- |
| `make dev` | Start BFF, landing/app Vite server, and VitePress docs together. |
| `make dev-stop` | Kill local dev ports `3000`, `5173`, and `5174` if a prior run left processes alive. |
| `pnpm bff:dev` | Start Fastify BFF with `tsx watch` on `127.0.0.1:3000`. |
| `pnpm dev` | Start landing plus app Vite server on `127.0.0.1:5173`. |
| `pnpm docs:dev` | Start VitePress docs on `127.0.0.1:5174`. |
| `pnpm build` | Build app and docs. |
| `pnpm build:app` | Build Vite landing/app entries into `dist`. |
| `pnpm docs:build` | Build VitePress docs. |
| `pnpm preview` | Preview production Vite output. |
| `pnpm docs:preview` | Preview built docs on port `4174`. |

Local URLs used by the default stack: BFF health at `http://127.0.0.1:3000/v1/health`, landing/app at `http://127.0.0.1:5173/`, and docs at `http://127.0.0.1:5174/`.

Vite proxies `/v1/*` to `http://127.0.0.1:3000`. If only `pnpm dev` is running, overlay features that depend on BFF endpoints can fail with `Not found`.

## Quality And Testing

| Command | Purpose |
| --- | --- |
| `pnpm lint` | Full ESLint run for frontend, server, tests, and config files. |
| `pnpm lint:frontend` | ESLint for `src/**/*.{ts,tsx}`. |
| `pnpm lint:server` | ESLint for `server/src/**/*.ts`. |
| `pnpm lint:tests` | ESLint for tests. |
| `pnpm typecheck` | Frontend and server typecheck. |
| `pnpm typecheck:frontend` | Typecheck frontend TS project. |
| `pnpm typecheck:server` | Typecheck Fastify server TS project. |
| `pnpm typecheck:strict-report` | Strict TS report with `tsconfig.strict.json`. |
| `pnpm quality:budget` | Enforce quality budget. |
| `pnpm quality:strict-report` | Generate strict quality report. |
| `pnpm test` | Default unit test suite. |
| `pnpm test:unit` | Frontend and backend Vitest unit tests. |
| `pnpm test:unit:frontend` | Frontend Vitest project with jsdom. |
| `pnpm test:unit:backend` | Backend Vitest project with node environment. |
| `pnpm test:unit:watch` | Watch mode for Vitest. |
| `pnpm test:smoke` | Build and run Playwright smoke tests. |

Run focused checks for the files you changed. Before claiming a feature or fix is complete, run the closest relevant lint, typecheck, and test commands. Use the full CI sequence for broad changes: `pnpm lint`, `pnpm typecheck`, `pnpm quality:budget`, `pnpm build`, and `pnpm test:smoke`.

For Playwright smoke tests, CI installs Chromium with `pnpm exec playwright install --with-deps chromium` before `pnpm test:smoke`.

## Coding Standards

- Keep changes minimal and localized. Do not refactor unrelated code while fixing a task.
- TypeScript is strict. Avoid `any`; if unavoidable, keep it narrow and justified.
- Use the `@/*` alias for frontend imports from `src` when it improves clarity.
- Preserve existing formatting style in touched files. ESLint uses `@typescript-eslint` recommended rules with warnings for unused vars and explicit `any`.
- Prefer existing components, hooks, services, and utilities before introducing new abstractions.
- Do not add backward-compatibility code unless there is persisted data, shipped behavior, external consumers, or an explicit requirement.
- Do not introduce user-visible strings directly in components, labels, placeholders, `title`, `aria-label`, or similar copy. Add keys to the existing i18n infrastructure in `src/i18n/messages/en.ts` and `src/i18n/messages/es.ts`, then use `useI18n()` or `translate()`.
- Avoid custom styles if shadcn defaults can be applied. Use existing `src/components/ui` primitives first.
- For Tailwind CSS v4 and shadcn/ui changes, keep theme variables in the existing CSS architecture and verify dark mode when relevant.
- For React UI work, follow existing component patterns. Do not add `useMemo` or `useCallback` by default; use them only when there is a clear performance or referential-stability reason already aligned with nearby code.

## Complexity And Module Boundaries

- Keep files focused on one primary responsibility. Avoid adding new behavior to files that already mix rendering, data fetching, state orchestration, domain rules, and side effects.
- For React, keep components primarily responsible for rendering and interaction wiring. Move reusable state orchestration into hooks, domain transformations into pure functions, and external I/O into services or controllers.
- For backend routes, keep handlers thin: validate input, call a service, and return a response. Put business rules in services and persistence or integration details behind injected dependencies.
- When touching a large or hard-to-reason-about file, prefer a small extraction related to the current change instead of adding more branching, unrelated state, or responsibilities.
- Use these refactoring triggers: long functions, deeply nested conditionals, duplicated feature logic, mixed UI/data/domain concerns, broad imports from unrelated areas, and tests that require excessive setup.
- Do not create speculative abstractions. Extract only when it reduces current complexity, improves testability, isolates a responsibility being changed now, or removes duplication that has appeared at least three times.

## Frontend And UI Guidance

- Landing code lives in `src/landing`; overlay app code lives in `src/nostr-overlay`; shared UI primitives live in `src/components/ui`.
- Use shadcn/Radix primitives for dialogs, menus, sheets, tabs, tooltips, forms, and similar accessible UI behavior.
- Keep keyboard navigation, focus states, screen-reader names, reduced-motion behavior, and mobile breakpoints in scope for UI changes.
- For visible copy changes, update both supported locales and preserve key naming by feature namespace.
- For route or shell changes in the overlay, check `src/nostr-overlay/shell` and route-related tests before changing top-level `App.tsx` behavior.

## Styling Policy

- Prefer shadcn/ui components, Radix primitives, Tailwind utility classes, and existing design tokens before adding custom CSS.
- Avoid growing global or page-level `styles.css` files. New custom CSS should be rare, localized, and justified by a limitation that Tailwind or shadcn/ui cannot reasonably solve.
- Custom CSS is acceptable for Tailwind v4 theme variables, global base styles, map or canvas rendering constraints, complex animations, third-party library overrides, and browser-specific fixes.
- Do not introduce new visual tokens directly in component CSS. Add semantic tokens to the existing Tailwind/theme CSS architecture and consume them through utilities.
- Prefer component variants, `cn()`, and shadcn-compatible composition over bespoke class systems.
- If a style can be expressed clearly with Tailwind utilities, do not add it to a CSS file.

## Backend Guidance

- The BFF is Fastify-based and built in `server/src/app.ts` through plugin and route registration.
- Keep API routes under the `/v1` prefix unless a task explicitly changes API versioning.
- Prefer dependency injection through `buildApp` options for testable services.
- Keep cross-cutting concerns in plugins: CORS, security headers, rate limiting, owner auth, request context, and error handling.
- Environment variables currently used by the BFF include `PORT`, `HOST`, `BFF_CORS_ORIGINS`, and `FASTIFY_TRUST_PROXY`.
- When adding endpoints, add service-level tests and route-level tests near the module being changed.

## Nostr Guidance

- Nostr behavior must follow relevant NIPs and existing domain models. Do not invent event shapes, tag semantics, relay behavior, encryption behavior, or signing flows.
- Use `nostr-specialist` for Nostr-related work, including relays, NIP-05, NIP-07, NIP-46, NWC, WebLN, zaps, feeds, DMs, follows, and auth.
- Use `context/nips-master`, `context/nostr-master`, and related context folders as references when the implementation needs protocol details.
- Treat browser localStorage keys as persisted data. Keep versioned storage migrations explicit and tested.

## Documentation Guidance

- VitePress docs live in `docs`. Use `pnpm docs:dev` for local authoring and `pnpm docs:build` before claiming docs build health.
- Keep Spanish docs in Spanish unless the task asks otherwise.
- If landing or docs links change, check `src/site/app-url.ts`, `src/site/docs-url.ts`, and their tests.
- Architecture/spec work commonly lives in `docs/superpowers/specs`.

## Before Finishing Code Changes

- Confirm changed files still have a clear primary responsibility.
- If a touched file grew significantly, check whether a focused extraction would reduce future maintenance cost.
- Confirm UI changes use shadcn/ui and Tailwind utilities before custom CSS.
- Confirm new user-visible copy is localized through `src/i18n`.
- Run the closest relevant lint, typecheck, and tests before claiming completion.

## Agent Workflow

- Before implementing or answering, check whether a project skill applies and load it with the `skill` tool.
- Prefer project-local skills in `.agents/skills` over generic skills when both apply.
- If a project-local skill exists on disk but does not appear in skill discovery, treat it as a discovery/configuration issue. Do not edit `skills-lock.json` or skill metadata unless the user asked for skill maintenance.
- Use `.opencode/agents` subagents for complex or specialized work when their domain matches the task.
- For multi-domain work, start with `project-orchestrator` or dispatch independent agents in parallel when tasks do not share mutable state.
- When elaborating plans, always include recommended skills for each chunk of the task.
- Do not commit, amend, reset, checkout, or push unless the user explicitly asks.

## Agent Selection Policy

- Use `frontend-specialist` for React implementation, shadcn/ui composition, Tailwind utility styling, frontend tests, and routine UI code changes.
- Use `ui-ux-designer` for visual strategy, UX critique, layout direction, and design handoff only. Do not use it as the default implementation agent.
- Use `refactoring-expert` for focused behavior-preserving refactors in large files, mixed-responsibility modules, duplicated logic, or hard-to-test code.
- Use `project-orchestrator` only for project briefs or tasks spanning multiple independent domains. Do not invoke it for single-area fixes.
- Prefer one primary specialist per task. Add secondary specialists only when their domain is truly required, such as `accessibility-auditor` for formal a11y review or `i18n-specialist` for translation architecture.
- If two agents appear applicable, choose the one closest to the file being changed and the outcome requested; avoid parallel agents that would edit the same files.

## Recommended Skills By Work Type

| Work type | Recommended skills |
| --- | --- |
| AGENTS.md or agent guidance | `create-agentsmd`, `writing-skills` if editing or fixing skills themselves. |
| Nostr protocol, relays, auth, DMs, zaps, NWC, WebLN | `nostr-specialist`, plus `bitcoin-bips-development` for Bitcoin-level compatibility. |
| React UI implementation or landing/overlay UX | `frontend-specialist`, `shadcn`, `tailwind-v4-shadcn`, `tailwind-css-patterns`, `accessibility`. |
| Visual strategy or UX critique | `ui-ux-designer`, `web-design-guidelines`, `accessibility`. |
| React performance or composition | `vercel-react-best-practices`, `vercel-composition-patterns`, `react-best-practices`. |
| Fastify BFF or Node backend | `fastify-best-practices`, `nodejs-backend-patterns`, `nodejs-best-practices`. |
| Tests | `vitest` for unit tests, `playwright-best-practices` for smoke/e2e tests. |
| Vite or docs tooling | `vite`, `vitepress`. |
| Three.js or 3D exports/visualization | Relevant `threejs-*` skills. |
| Refactoring and architecture | `refactor`, `solid`, `improve-codebase-architecture`, `typescript-advanced-types`. |
| Accessibility or design review | `accessibility`, `web-design-guidelines`. |

## Custom Agents

- Project-specific agents live in `.opencode/agents`.
- Keep agent files in OpenCode markdown format with YAML frontmatter: `description`, `mode`, and optional `tools`.
- Use `mode: subagent` for specialist agents intended for delegation.
- Key agents include `project-orchestrator`, `frontend-specialist`, `backend-architect`, `fullstack-developer`, `i18n-specialist`, `unit-test-generator`, `e2e-test-automator`, `code-reviewer`, `error-detective`, `security-auditor`, `accessibility-auditor`, and `tech-writer`.
- After changing agents, verify discovery with `opencode agent list`.

## Project Skills

- Project-specific skills live in `.agents/skills`.
- Keep skill files in the expected `SKILL.md` format with valid YAML frontmatter.
- Use skill names with letters, numbers, and hyphens only.
- After changing skills, verify discovery with `opencode debug skill`.
- Do not remove or rename local skills without checking whether agents, docs, or plans reference them.

## CI Reference

CI runs on GitHub Actions with this sequence: checkout, pnpm setup, Node from `.nvmrc`, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm quality:budget`, `pnpm build`, Playwright Chromium install, and `pnpm test:smoke`.

Use this as the final verification target for changes that affect frontend, backend, docs, build tooling, or smoke-test behavior.
