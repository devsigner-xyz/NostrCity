# NIP-05 SSRF Policy

## Scope

This policy applies to server-side NIP-05 verification requests under `/v1/identity/nip05/verify-batch`.

## Allowed Targets

Only HTTPS public hostnames are allowed for `/.well-known/nostr.json?name=<local-part>` requests.

The service rejects IP literals in NIP-05 identifiers before any DNS lookup or fetch. Public hostnames are resolved before fetch, and every resolved address must be public.

## Blocked Targets

- `localhost`, `localhost.localdomain`, and `*.localhost` names.
- Known metadata/internal names, including `metadata.google.internal`.
- IPv4 literals in the identifier domain.
- IPv4 loopback, private, carrier-grade NAT, link-local, protocol-assignment, benchmarking, documentation, multicast, reserved, and unspecified ranges returned by DNS.
- IPv6 unspecified, loopback, unique-local, link-local, multicast, documentation, 6to4, and IPv4-mapped private/reserved ranges returned by DNS.

## Response Controls

- Fetch uses `redirect: 'error'` because NIP-05 fetchers must ignore redirects.
- Response `content-type` must be JSON: `application/json` or a structured `+json` subtype.
- Maximum streamed response body size is 128 KiB before JSON parsing succeeds.
- DNS pre-resolution, fetch, and response-body reading share the identity service NIP-05 timeout settings.
- Success and error cache behavior remains inherited from the identity service.

## Residual Risk

DNS pre-resolution reduces accidental internal fetches, but it does not fully eliminate DNS rebinding or time-of-check/time-of-use risk because the runtime fetch implementation performs its own connection resolution after the pre-check.

Production deployments should also enforce infrastructure egress controls that prevent access to private networks, link-local metadata services, and other internal-only address spaces from the BFF service.

## Verification

Run `pnpm test:unit:backend -- server/src/modules/identity/identity.service.test.ts`.

Run `pnpm test:unit:backend -- server/src/modules/identity/identity.service.test.ts server/src/modules/identity/identity.routes.test.ts`.

Run `pnpm test:unit:backend && pnpm lint:server && pnpm typecheck:server`.
