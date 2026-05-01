---
name: nostr-specialist
description: Use when building or debugging Nostr-compatible clients, relays, signers, wallets, or protocol integrations that require NIP-level compatibility, event semantics, relay behavior, or cryptographic signing and encryption decisions.
---

# Nostr Specialist

Protocol-first guidance for Nostr implementations. This skill stays agnostic to specific client products and focuses on interoperable behavior across NIPs.

## Quick Start

1. Identify the feature or failure domain.
2. Map it to NIPs in `references/nip-priority-matrix.md`.
3. Confirm edge cases and status in `references/nips-index.md`.
4. Read the canonical NIP files in `references/*.md` before implementing.
5. Validate behavior with `references/protocol-checklists.md`.

## Domain Routing

| Domain | Primary NIPs |
| --- | --- |
| Core protocol and event model | `01`, `09`, `10`, `18`, `25`, `31` |
| Identity and auth | `05`, `07`, `19`, `21`, `42`, `46`, `49`, `55` |
| Relay capability and discovery | `11`, `43`, `50`, `65`, `66`, `77`, `86` |
| Messaging and encryption | `17`, `44`, `59`, `C7`, `EE` |
| Lists, groups, and communities | `51`, `29`, `72`, `78`, `89` |
| Payments and wallets | `47`, `57`, `60`, `61`, `75`, `87` |
| Media and storage | `92`, `94`, `96`, `B7`, `98` |

Use `references/nips-index.md` as the entry point for exact NIP titles and status.

## Protocol Rules That Should Not Be Skipped

- Validate event shape and signature according to `NIP-01` before accepting or publishing.
- Treat relay behavior as capability-based: inspect `NIP-11`, then branch behavior by supported features.
- For identifiers and routing data (`npub`, `nprofile`, `nevent`, `naddr`, `nostr:`), align with `NIP-19` and `NIP-21`.
- Prefer modern/private messaging and encryption flows (`NIP-17`, `NIP-44`, `NIP-59`) and handle deprecations explicitly.
- For wallet and zap flows, keep request/response/event boundaries strict across `NIP-47` and `NIP-57`.

## Privacy And Key Handling

- Use `privacy-and-sensitive-data` whenever work touches keys, signer tokens, wallet connections, DMs, zaps, payment metadata, relay lists, browser storage, logs, telemetry, or test artifacts.
- Prefer extension or remote signers over raw private keys. Treat `nsec`, `ncryptsec`, bunker/nostrconnect secrets, NIP-46 tokens, and NWC connection URIs as secrets.
- Never log, persist, copy into examples, or expose secrets in screenshots, traces, HARs, docs, fixtures, or CI artifacts.
- Use least-privilege signer and wallet permissions where possible. Document relay-public metadata and payment-linkability limits when user-facing behavior depends on them.

## Deprecation and Status Handling

- Do not assume all NIPs are equally recommended.
- Always check status in `references/nips-index.md` before implementing.
- If a NIP is marked `deprecated`, `unrecommended`, `replaced`, or `superseded`, document migration behavior and fallback.
- Keep compatibility layers explicit and short-lived.

## NDK Mapping (Optional)

If using NDK, map protocol concerns to the same workflow:

- Relay topology and selection still comes from NIP requirements.
- Signing strategy (local key, extension signer, remote signer) still follows NIP constraints.
- Event construction, tags, and kind semantics should be validated against canonical NIPs, not framework defaults.

Use NDK as an implementation vehicle, not as a protocol source of truth.

## References

- NIP index with status: `references/nips-index.md`
- Priority matrix by domain: `references/nip-priority-matrix.md`
- Protocol checklists: `references/protocol-checklists.md`
- Canonical NIPs: `references/*.md`
