# NWC Secret Handling

## Secret Classes

- NWC secret: never persisted.
- NWC URI containing `secret=`: never persisted.
- Wallet metadata: can be persisted if it does not allow spending or signing.

## Runtime Behavior

NWC secrets exist only in memory during the current JavaScript runtime. Reload returns NWC to `reconnect-required`.

## Legacy Cleanup

Existing `sessionStorage` payloads under `nostr.overlay.wallet.session.v1` are deleted and ignored.

## Residual Risk

An active XSS can still read in-memory secrets during an active session. CSP and XSS prevention remain required.

## Verification

Run `pnpm test:unit:frontend -- src/nostr/wallet-settings.test.ts`.
Run `rg "sessionStorage.*secret|secret=.*walletconnect" src/nostr src/nostr-overlay`.
