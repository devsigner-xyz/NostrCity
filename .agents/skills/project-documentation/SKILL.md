---
name: project-documentation
description: Use when planning or updating Nostr City documentation, especially VitePress guides, app behavior explanations, stack coverage, or supported Nostr protocol feature documentation.
---

# Project Documentation

## Overview

Nostr City documentation explains how the application currently works. It is not a changelog, release log, or implementation diary.

Use this skill to decide whether a plan or code change must include VitePress documentation work, and to keep that work structured around user understanding, stack context, and supported protocol functionality.

## When to Use

- Planning features, fixes, or refactors that change user-visible behavior.
- Changing authentication, relays, Nostr flows, NWC, WebLN, zaps, feeds, DMs, follows, exports, or map generation behavior.
- Changing the stack, commands, deployment assumptions, BFF routes, docs navigation, or site routing.
- Creating or editing pages under `docs` or `docs/.vitepress`.
- Writing handoff plans that mention docs, onboarding, architecture, protocol support, or product behavior.

Do not use this for changelog generation. Use `release-compiler` for release notes and migration logs.

## Planning Rule

Every implementation plan must include a documentation checkpoint when the work can affect how a user, contributor, or operator understands the application.

The checkpoint should answer:

| Question | If yes, plan this docs work |
| --- | --- |
| Does behavior change? | Update the relevant guide in `docs/empezar`, `docs/cuenta-y-acceso`, `docs/conceptos`, `docs/protocolo`, or `docs/faq`. |
| Does the stack or workflow change? | Update or create the stack documentation section and verify commands in `AGENTS.md` if needed. |
| Does protocol support change? | Update the supported protocol functionality section and distinguish supported, partial, and unsupported behavior. |
| Does navigation change? | Update `docs/.vitepress/config.mts` sidebar/nav entries. |
| Does the change only affect internals? | Document only if it changes architecture, operations, troubleshooting, or contributor understanding. |

If docs are not needed, state why in the plan in one sentence.

## Documentation Shape

Prefer current-state explanation over history:

- Explain what the app does now.
- Explain when and why a user would use it.
- Explain relevant limits and prerequisites.
- Link related pages instead of duplicating long explanations.
- Avoid lists of commits, tickets, or "changed in this PR" notes.

VitePress docs are mostly Spanish. Keep Spanish pages in Spanish unless the task asks otherwise.

## Required Coverage Areas

Keep documentation organized around these areas when relevant:

| Area | Purpose | Typical location |
| --- | --- | --- |
| App behavior | User-facing flows, product concepts, map and social overlay behavior | `docs/empezar`, `docs/conceptos`, `docs/cuenta-y-acceso`, `docs/faq` |
| Stack | Runtime, frontend, backend, docs tooling, test/build commands, deployment assumptions | Dedicated stack page or architecture docs |
| Supported protocol functionality | Nostr/NIP/WebLN/NWC features that the app actually supports, with limitations | `docs/protocolo` |

For protocol documentation, do not imply unsupported capabilities. Use explicit support states such as supported, partially supported, planned, or not supported.

## Verification

For docs-only changes, run `pnpm docs:build` when feasible.

For plans, include the nearest verification command instead of claiming it was run.

## Common Mistakes

| Mistake | Correction |
| --- | --- |
| Writing a changelog page | Rewrite as current behavior, guide, limitation, or reference. |
| Documenting planned protocol support as available | Mark it planned or omit it until supported. |
| Updating a page but not the sidebar | Check `docs/.vitepress/config.mts`. |
| Treating docs as optional polish | Include a docs checkpoint in plans whenever behavior, stack, or protocol support changes. |
