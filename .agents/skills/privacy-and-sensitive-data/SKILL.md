---
name: privacy-and-sensitive-data
description: Use when work touches sensitive data, browser storage, logs, telemetry, analytics, screenshots, traces, HARs, secrets, keys, wallet data, DMs, payment metadata, or privacy/security claims.
---

# Privacy And Sensitive Data

## Overview

Privacy is a design constraint, not cleanup. Minimize collection, keep secrets out of durable surfaces, and make every storage/logging/artifact decision explicit.

## When To Use

- Browser storage: `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, cookies, Playwright `storageState`.
- Logs, traces, screenshots, videos, HAR files, error tracking, analytics, telemetry, support diagnostics.
- Secrets or identifiers: auth tokens, session IDs, private keys, `nsec`, `ncryptsec`, NWC URIs/secrets, NIP-46 tokens, WebLN wallet details, relay-auth challenges.
- User data: profile/contact data, relay lists, DMs, zap/payment metadata, invoices, preimages, map exports, clipboard/location/camera/microphone data.
- Documentation or UI claims: "private", "secure", "local-only", "encrypted", "no tracking".

## Quick Reference

For each sensitive data touchpoint, answer before implementing:

| Question | Required answer |
| --- | --- |
| What data class is this? | public, user data, credential, wallet/payment, private message, diagnostic, or telemetry |
| Is it necessary? | collect/store/log the minimum; prefer no collection |
| Where can it persist? | name storage keys, logs, artifacts, third parties, and retention |
| How is it protected? | redaction, hashing, encryption, consent, TTL, deletion path |
| How is it verified? | tests for redaction, migration, deletion, and artifact safety |

## Red Flags

Stop and require an explicit privacy decision when you hear or think:

- "It is only for debugging" before logging payloads, tokens, relay URLs, invoices, DMs, or wallet data.
- "It is only local" before writing browser storage, screenshots, traces, HARs, or `storageState`.
- "It is only CI/internal" before uploading logs or artifacts from auth, DM, zap, WebLN, or NWC flows.
- "We can document it as private/secure" before verifying implementation, storage, telemetry, and third-party services.

## Rules

- Speed, demo pressure, or support urgency does not justify raw sensitive data in durable storage, logs, or artifacts. Stop and require a threat model, explicit approval, and tests.
- Do not store raw private keys, NWC secrets, bearer tokens, session cookies, DMs, decrypted wallet data, invoices, preimages, or payment metadata in browser storage unless explicitly required by a threat model and user consent.
- Prefer extension or remote signers over raw key handling. Prefer synthetic identities and fake wallet data in tests.
- Never log request/response bodies by default. Use allowlisted structured fields; redact `authorization`, cookies, tokens, private keys, NWC/NIP-46 secrets, invoices, DMs, wallet payloads, and user-provided relay URLs.
- Keep screenshots, videos, traces, HARs, and `storageState` failure-scoped, sanitized, short-retention, and never generated with real keys or wallet credentials.
- Add artifact-safety checks for sensitive patterns when CI uploads traces, HARs, screenshots, videos, or storage snapshots.
- No third-party analytics or telemetry without explicit approval. Do not send stable Nostr or wallet identifiers unless justified and documented.
- Browser permissions require explicit user action, plain-language purpose, fallback, and a way to clear stored state.
- Privacy claims in docs or UI must match implementation and disclose public relay data, local storage, encryption limits, telemetry, and third-party services.

## Common Mistakes

| Mistake | Correction |
| --- | --- |
| "It is only localStorage." | Treat it as durable persisted data with schema, TTL/deletion, and tests. |
| "Support needs full payloads." | Use correlation IDs, safe error codes, and redacted allowlisted fields. |
| "CI artifacts are internal." | Assume artifacts can leak; sanitize or do not upload. |
| "Private means encrypted." | Say exactly what is public, local, encrypted, or not stored. |
