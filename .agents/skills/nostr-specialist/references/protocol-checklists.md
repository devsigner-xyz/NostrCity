# Protocol Checklists

Use these checklists before claiming protocol compatibility.

## 1) Event Validity Baseline

- [ ] Events include canonical fields (`id`, `pubkey`, `created_at`, `kind`, `tags`, `content`, `sig`).
- [ ] Event hash is computed from canonical serialization and matches `id`.
- [ ] Signature verification succeeds before processing or persistence.
- [ ] Invalid signatures and malformed events are rejected with deterministic error handling.
- [ ] Replaceable and addressable event semantics are handled correctly where applicable.

## 2) Relay Interoperability

- [ ] Relay metadata/capabilities are discovered and cached (`NIP-11` behavior).
- [ ] Filters are minimal and explicit; no overbroad subscriptions by default.
- [ ] End-of-stream and close behavior is handled correctly per relay protocol flow.
- [ ] Publish acks/errors are observed and surfaced.
- [ ] Relay list metadata and relay preference semantics are respected.

## 3) Identity and Authentication

- [ ] `npub`/`nsec`/`note`/`nevent`/`naddr` parsing and encoding are round-trip safe.
- [ ] `nostr:` URI parsing is strict and unambiguous.
- [ ] DNS identity mapping (`NIP-05`) is validated with failure/fallback behavior defined.
- [ ] Client-to-relay auth challenge flow (`NIP-42`) handles nonce/challenge lifecycle safely.
- [ ] Remote signing (`NIP-46`) message authenticity and authorization are validated.

## 4) Messaging and Encryption

- [ ] Private messaging flow follows modern NIP guidance (`NIP-17`, `NIP-44`, `NIP-59` where applicable).
- [ ] Encryption context is bound to expected peer/session constraints.
- [ ] Decryption failures are handled without leaking sensitive metadata.
- [ ] Legacy DM compatibility is explicit and isolated.

## 5) Payments and Wallets

- [ ] Wallet request and response event types are validated before acting.
- [ ] Zap request and zap receipt semantics are consistent and verifiable.
- [ ] Amount/unit conversion and invoice metadata are validated.
- [ ] Payment failure paths are explicit and idempotent.

## 6) Media and Storage

- [ ] File metadata integrity is validated against event payloads.
- [ ] HTTP auth flow for media operations is scoped and time-bound.
- [ ] Media server lists and discovery data are treated as untrusted inputs.
- [ ] Upload references and retrieval references remain content-addressable when possible.

## 7) Compatibility and Status Hygiene

- [ ] All implemented NIPs are checked against `nips-index.md` status.
- [ ] Deprecated/unrecommended/replaced flows are marked in code and docs.
- [ ] Fallback behavior is intentional, testable, and temporary.
- [ ] New feature work states exactly which NIPs are required and which are optional.
