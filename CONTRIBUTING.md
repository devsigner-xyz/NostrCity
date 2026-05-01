# Contributing

This guide covers the human development workflow for Nostr City. Local agent/tooling files are intentionally not part of the repository.

## Requirements

- Use the Node.js version in `.nvmrc`.
- Use pnpm through Corepack.
- Use `pnpm install --frozen-lockfile` when reproducing CI locally.

```bash
corepack enable
pnpm install
```

## Development

Start the full local stack:

```bash
make dev
```

This starts the Fastify BFF, the Vite landing/app server, and the VitePress docs server.

Local URLs:

| Surface | URL |
| --- | --- |
| Landing | `http://127.0.0.1:5173/` |
| App | `http://127.0.0.1:5173/app/` |
| BFF health check | `http://127.0.0.1:3000/v1/health` |
| Docs | `http://127.0.0.1:5174/docs/` |

If a previous dev session left ports busy, run:

```bash
make dev-stop
```

Run services separately when needed:

```bash
pnpm bff:dev
pnpm dev
pnpm docs:dev
```

Vite proxies `/v1/*` to `http://127.0.0.1:3000`. Overlay features that call `/v1/*` expect the BFF to be running.

## Quality Checks

Run focused checks for the files you changed. For CI parity, run:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:smoke
```

Common focused commands:

| Command | Purpose |
| --- | --- |
| `pnpm lint` | Full ESLint run for frontend, server, tests, and config files. |
| `pnpm lint:frontend` | ESLint for `src/**/*.{ts,tsx}`. |
| `pnpm lint:server` | ESLint for `server/src/**/*.ts`. |
| `pnpm lint:tests` | ESLint for tests. |
| `pnpm typecheck` | Frontend and server typecheck. |
| `pnpm typecheck:frontend` | Typecheck frontend TS project. |
| `pnpm typecheck:server` | Typecheck Fastify server TS project. |
| `pnpm test` | Default unit test suite. |
| `pnpm test:unit` | Frontend and backend Vitest unit tests. |
| `pnpm test:unit:frontend` | Frontend Vitest project with jsdom. |
| `pnpm test:unit:backend` | Backend Vitest project with node environment. |
| `pnpm test:smoke` | Build and run Playwright smoke tests. |

CI installs dependencies with `pnpm install --frozen-lockfile`, runs `pnpm lint`, `pnpm typecheck`, `pnpm build`, installs Playwright Chromium, and runs `pnpm test:smoke`.

## Code Standards

- Keep changes minimal and localized.
- TypeScript is strict; avoid `any` unless it is narrow and justified.
- Use the `@/*` alias for frontend imports from `src` when it improves clarity.
- Prefer existing components, hooks, services, and utilities before introducing new abstractions.
- Do not add backward-compatibility code unless there is persisted data, shipped behavior, external consumers, or an explicit requirement.
- Do not introduce user-visible strings directly in components, labels, placeholders, `title`, `aria-label`, or similar copy. Add keys to `src/i18n/messages/en.ts` and `src/i18n/messages/es.ts`, then use `useI18n()` or `translate()`.
- Spanish copy must use correct orthography and natural phrasing. Preserve placeholders such as `{{count}}` exactly.

## Frontend And UI

- Landing code lives in `src/landing`.
- Overlay app code lives in `src/nostr-overlay`.
- Shared UI primitives live in `src/components/ui`.
- Use shadcn/Radix primitives for dialogs, menus, sheets, tabs, tooltips, forms, and similar accessible UI behavior.
- Prefer shadcn/ui components, Radix primitives, Tailwind utility classes, and existing design tokens before adding custom CSS.
- Keep keyboard navigation, focus states, screen-reader names, reduced-motion behavior, and mobile breakpoints in scope for UI changes.
- For route or shell changes in the overlay, check `src/nostr-overlay/shell` and route-related tests before changing top-level `App.tsx` behavior.

## Backend

- The BFF is Fastify-based and built in `server/src/app.ts` through plugin and route registration.
- Keep API routes under the `/v1` prefix unless a task explicitly changes API versioning.
- Keep route handlers thin: validate input, call a service, and return a response.
- Put business rules in services and persistence or integration details behind injected dependencies.
- Keep cross-cutting concerns in plugins: CORS, security headers, rate limiting, owner auth, request context, and error handling.
- When adding endpoints, add service-level tests and route-level tests near the module being changed.

## Nostr

- Nostr behavior must follow relevant NIPs and existing domain models.
- Do not invent event shapes, tag semantics, relay behavior, encryption behavior, or signing flows.
- Treat browser localStorage keys as persisted data. Keep versioned storage migrations explicit and tested.

## Documentation

- VitePress docs live in `docs`.
- User-facing docs are primarily Spanish.
- Documentation updates should explain current application behavior and user/contributor guidance, not act as a changelog of code changes.
- If landing or docs links change, check `src/site/app-url.ts`, `src/site/docs-url.ts`, and their tests.
- Run `pnpm docs:build` before claiming docs build health.

## Pull Request Checklist

- Run the closest relevant checks for your change.
- Run the full CI parity sequence for broad frontend, backend, docs, build tooling, or smoke-test changes.
- Update docs when behavior, setup, routes, or supported protocol functionality changes.
- Do not commit secrets, local databases, generated build output, or local agent/tooling files.
