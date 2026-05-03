<!-- prettier-ignore -->
<div align="center">

<img src="./public/logo-v2-light.png" alt="Nostr City" height="160" />

# Nostr City

*Explore Nostr as a living city instead of a linear timeline.*

![Node.js](https://img.shields.io/badge/Node.js-24-3c873a?style=flat-square)
![pnpm](https://img.shields.io/badge/pnpm-10-F69220?style=flat-square&logo=pnpm&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-blue?style=flat-square&logo=typescript&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-4-6E9F18?style=flat-square&logo=vitest&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-1.59-2EAD33?style=flat-square&logo=playwright&logoColor=white)
[![License: LGPL-3.0-only](https://img.shields.io/badge/License-LGPL--3.0--only-blue?style=flat-square)](./LICENSE)

[Overview](#overview) • [Features](#features) • [Supported NIPs](#supported-nips) • [Getting Started](#getting-started) • [Project Structure](#project-structure) • [Scripts](#scripts) • [Contributing](#contributing)

</div>

Nostr City is an experimental open source app that turns Nostr activity into an explorable social map. It combines procedural city generation with a React overlay for profiles, follows, posts, relays, DMs, zaps, notifications, wallet settings, and discovery flows.

The project started from the procedural city generator in [ProbableTrain/MapGenerator](https://github.com/ProbableTrain/MapGenerator), then evolved into a Nostr-native interface with a Fastify Backend-for-Frontend, VitePress docs, i18n, and automated tests.

## Overview

The workspace has four main runtime surfaces:

- **Public site**: public marketing and onboarding entry at `/`.
- **App**: generated city map plus the Nostr overlay at `/app/`.
- **BFF**: Fastify API under `/v1/*` for Nostr-facing backend routes.
- **Docs**: VitePress documentation, currently written primarily in Spanish.

In development, Vite proxies `/v1/*` to the local BFF so the browser app can use the same API paths locally and in production.

## Features

- **Procedural city generation** with roads, water, parks, blocks, buildings, and map presets.
- **Map exports** for images and 3D STL city model assets.
- **Nostr social overlay** with profiles, follows, feeds, articles, notifications, DMs, relays, user search, and discovery routes.
- **Wallet and zap surfaces** with WebLN/NWC-oriented domain code.
- **Fastify BFF** with identity, graph, content, social, notifications, users, DM, and publish modules.
- **Modern frontend stack** using React 19, Vite, Tailwind CSS v4, shadcn/ui-compatible components, Radix UI, and React Router.
- **Documentation site** powered by VitePress.
- **Quality gates** with ESLint, TypeScript, Vitest, and Playwright smoke tests.

## Supported NIPs

Nostr City currently supports or integrates the following NIPs. Notes marked partial, legacy, or scoped mean the app uses that NIP for the listed product flows rather than implementing every optional client behavior.

- [x] NIP-01: Basic protocol flow description
- [x] NIP-02: Follow List (no petname UI)
- [x] NIP-04: Encrypted Direct Message (legacy kind `4` read/decrypt fallback)
- [x] NIP-05: Mapping Nostr keys to DNS-based internet identifiers
- [x] NIP-07: `window.nostr` capability for web browsers
- [x] NIP-09: Event Deletion Request (scoped to viewer reaction deletion handling)
- [x] NIP-10: Text Notes and Threads
- [x] NIP-11: Relay Information Document
- [x] NIP-17: Private Direct Messages
- [x] NIP-18: Reposts
- [x] NIP-19: bech32-encoded entities (`npub`, `nprofile`, `note`, `nevent`)
- [x] NIP-21: `nostr:` URI scheme (inline content references)
- [x] NIP-23: Long-form Content
- [x] NIP-25: Reactions
- [x] NIP-27: Text Note References
- [x] NIP-29: Relay-based Groups (partial group discovery, timeline, join/leave, and saved groups flows)
- [x] NIP-44: Encrypted Payloads (Versioned)
- [x] NIP-46: Nostr Remote Signing
- [x] NIP-47: Nostr Wallet Connect
- [x] NIP-50: Search Capability
- [x] NIP-51: Lists (`kind:10000` mute lists and `kind:10009` saved groups)
- [x] NIP-57: Lightning Zaps
- [x] NIP-59: Gift Wrap
- [x] NIP-65: Relay List Metadata
- [x] NIP-92: Media Attachments (`imeta` image/video rendering and uploaded image tags)
- [x] NIP-98: HTTP Auth
- [x] NIP-B7: Blossom (image upload integration)

See [NIPs used](./docs/protocolo/nips-usadas.md) for the user-facing protocol explanation and current limitations.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) `24` as defined in `.nvmrc`
- [pnpm](https://pnpm.io/) via Corepack
- Git
- Docker Desktop or Docker Engine with Docker Compose, if you want the one-command local container setup.

### Run Locally With Docker

Docker is the easiest way to run the full app locally without using the public read-only demo.

```bash
docker compose up --build
```

Then open:

| Surface | URL |
| --- | --- |
| Landing | `http://127.0.0.1:3000/` |
| App | `http://127.0.0.1:3000/app/` |
| Docs | `http://127.0.0.1:3000/docs/` |
| BFF health check | `http://127.0.0.1:3000/v1/health` |

Stop it with:

```bash
docker compose down
```

The compose file binds to `127.0.0.1` by default and builds with `NOSTR_CITY_PUBLIC_DEMO_MODE=false`, so full supported login methods remain available locally.

### Install Dependencies

```bash
corepack enable
corepack use pnpm@10.33.0
pnpm install
```

### Run Everything Locally

```bash
make dev
```

This starts the local stack:

| Surface | URL |
| --- | --- |
| Landing | `http://127.0.0.1:5173/` |
| App | `http://127.0.0.1:5173/app/` |
| BFF health check | `http://127.0.0.1:3000/v1/health` |
| Docs | `http://127.0.0.1:5174/docs/` |

> [!TIP]
> If a previous dev session left ports busy, run `make dev-stop` before starting again.

### Run Services Separately

```bash
pnpm bff:dev
pnpm dev
pnpm docs:dev
```

> [!IMPORTANT]
> Overlay features that call `/v1/*` expect the BFF to be running. If you only run `pnpm dev`, those API-backed features can fail locally.

## Project Structure

| Path | Purpose |
| --- | --- |
| `src/ts` | Procedural map generation and legacy domain/UI code. |
| `src/nostr` | Nostr domain services for auth, relays, feeds, DMs, zaps, wallets, profiles, and persistence. |
| `src/nostr-overlay` | React overlay app, routes, shell, map bridge, controllers, settings, and social UI. |
| `src/landing` | Public site React entry. |
| `src/components/ui` | Local shadcn/ui-compatible primitives. |
| `src/i18n` | English and Spanish message catalogs and translation helpers. |
| `server/src` | Fastify BFF, plugins, `/v1` modules, services, and backend tests. |
| `docs` | VitePress documentation and project notes. |
| `tests/smoke` | Playwright smoke tests. |
| `public` | Project icons and Nostr City logos. |

## Scripts

| Command | Description |
| --- | --- |
| `make dev` | Start BFF, Vite app, and docs together. |
| `make dev-stop` | Stop local dev ports `3000`, `5173`, and `5174`. |
| `pnpm dev` | Start the public site and app Vite server. |
| `pnpm bff:dev` | Start the Fastify BFF in watch mode. |
| `pnpm docs:dev` | Start the VitePress docs server. |
| `pnpm build` | Build the app and docs. |
| `pnpm lint` | Run the full ESLint check. |
| `pnpm typecheck` | Typecheck frontend and server projects. |
| `pnpm test` | Run frontend and backend unit tests. |
| `pnpm test:smoke` | Build and run Playwright smoke tests. |

## Configuration

### Local Environment Files

Copy `.env.example` to `.env` only for local overrides. `.env` is ignored by git and must not contain committed secrets.

```bash
cp .env.example .env
```

`NOSTR_CITY_PUBLIC_DEMO_MODE=false` keeps all supported login methods available for local/self-hosted usage. Set `NOSTR_CITY_PUBLIC_DEMO_MODE=true` only for a public read-only demo deployment such as `nostrcity.xyz`.

Public demo deployments must set `NOSTR_CITY_PUBLIC_DEMO_MODE=true` before `pnpm build`, because Vite inlines frontend env values at build time and the BFF reads the same flag at runtime.

`VITE_*` and `NOSTR_CITY_PUBLIC_*` variables are public browser configuration in Vite builds, not secrets.

The BFF reads these environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Host used by the Fastify server. |
| `PORT` | `3000` | Port used by the Fastify server. |
| `BFF_CORS_ORIGINS` | Local Vite and preview origins | Comma-separated allowed origins. |
| `BFF_RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window in milliseconds. |
| `BFF_RATE_LIMIT_MAX` | `120` | Max requests per route/IP/window. |
| `BFF_RATE_LIMIT_MAX_STORE_ENTRIES` | `10000` | Max in-memory rate-limit entries. |
| `BFF_RATE_LIMIT_STORE` | In-memory outside production | Set to `redis` for shared production rate-limit storage. |
| `BFF_AUTH_REPLAY_STORE` | Uses Redis when `BFF_RATE_LIMIT_STORE=redis`, memory outside production | Set to `redis` for shared replay protection of Nostr auth proofs. Production requires Redis-backed replay protection. |
| `BFF_REDIS_KEY_PREFIX` | `nostr-city:local:bff:` outside production | Required in production when Redis security features are enabled. Use a per-environment prefix such as `nostr-city:prod:bff:`. |
| `BFF_REDIS_KEY_HASH_SECRET` | local development secret outside production | Required in production. Used to HMAC user-derived Redis key material so IPs, pubkeys, event IDs, and routes are not stored in cleartext keys. |
| `REDIS_URL` | unset | Required when Redis-backed security features are enabled; on Railway reference the Redis service `REDIS_URL`. Production public Redis URLs must use `rediss://` and include a password; `redis://` is accepted only for local/private/internal hosts. |
| `BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK` | unset | Temporary production risk acceptance for in-memory rate limits. Requires owner and review date variables. |
| `BFF_RATE_LIMIT_IN_MEMORY_RISK_OWNER` | unset | Required owner when accepting temporary in-memory production risk. |
| `BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE` | unset | Required non-stale `YYYY-MM-DD` review date when accepting temporary in-memory production risk. |
| `FASTIFY_TRUST_PROXY` | `loopback` | Fastify trust proxy setting: `false`, `loopback`, or comma-separated allow list. Production rejects `true`; Railway production also rejects `false` and `loopback`. |

Frontend public URL overrides:

| Variable | Description |
| --- | --- |
| `NOSTR_CITY_PUBLIC_DEMO_MODE` | Set to `true` only for a public read-only demo that allows `npub` access and hides signer/local account login paths. |
| `VITE_APP_URL` | App URL used by docs or public site links when hosted separately. |
| `VITE_DOCS_URL` | Docs URL used by public site links when hosted separately. |

## Documentation

The user-facing documentation lives in `docs` and is primarily Spanish.

```bash
pnpm docs:dev
pnpm docs:build
```

Useful entry points:

- [Documentation home](./docs/index.md)
- [What is Nostr City?](./docs/conceptos/que-es-nostr-city.md)
- [Getting started](./docs/empezar/primeros-pasos.md)
- [Export and STL](./docs/empezar/exportacion-y-stl.md)

## Testing And Quality

For focused changes, run the closest relevant checks. For CI parity, run:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:smoke
```

CI installs dependencies with `pnpm install --frozen-lockfile`, runs the same core checks, installs Playwright Chromium, and then executes smoke tests.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow, coding standards, testing guidance, and pull request checklist.

## Project Origin

Nostr City includes modified code derived from [ProbableTrain/MapGenerator](https://github.com/ProbableTrain/MapGenerator), originally created by Keir and contributors. Attribution and license notices are preserved in the dedicated repository files.
