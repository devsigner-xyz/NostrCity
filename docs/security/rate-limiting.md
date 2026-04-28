# Production Rate Limiting

## Scope

Applies to all `/v1` Fastify routes.

## Current Controls

- Default: 120 requests per minute per client IP and route.
- Route overrides exist for identity, content, graph and publish endpoints.
- The in-memory store is appropriate for development and test environments.
- The Redis store is available for production and uses atomic Redis scripting for shared counters.
- Redis key material derived from users is HMAC-hashed before it is written to Redis keys.
- Redis-backed Nostr auth replay protection is required in production through `BFF_AUTH_REPLAY_STORE=redis` or `BFF_RATE_LIMIT_STORE=redis`.

## Production Requirement

Production must use shared rate limit storage, preferably Redis. In-memory production mode requires explicit `BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK=true` and dated risk acceptance.

When Redis-backed security features are enabled, `REDIS_URL`, `BFF_REDIS_KEY_PREFIX`, and `BFF_REDIS_KEY_HASH_SECRET` are required in production. The BFF connects to Redis and verifies `PING` at startup. If Redis is unavailable at startup or during request-time rate-limit or auth-replay checks, requests fail closed instead of silently falling back to memory.

Redis request-time checks use a bounded command timeout and disable offline queueing. Rate-limit keys are stored under `<BFF_REDIS_KEY_PREFIX>rate-limit:v1:<hmac>`. Auth replay keys are stored under `<BFF_REDIS_KEY_PREFIX>auth-replay:v1:<hmac>`. The HMAC prevents Redis keys from exposing raw client IPs, routes, pubkeys, or auth event IDs.

## Railway Variables

- `BFF_RATE_LIMIT_STORE`: set to `redis` when Redis integration is enabled.
- `BFF_AUTH_REPLAY_STORE`: set to `redis` when replay protection is not implicitly enabled by `BFF_RATE_LIMIT_STORE=redis`.
- `BFF_REDIS_KEY_PREFIX`: required in production. Use a per-environment prefix, for example `nostr-city:prod:bff:`.
- `BFF_REDIS_KEY_HASH_SECRET`: required in production. Store as a secret; do not reuse it outside this app/environment.
- `REDIS_URL`: required when Redis-backed security features are enabled; on Railway reference the Redis service `REDIS_URL`. Production public Redis URLs must use `rediss://` and include a password; `redis://` is accepted only for local/private/internal hosts.
- `BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK`: temporary risk acceptance only.
- `BFF_RATE_LIMIT_IN_MEMORY_RISK_OWNER`: required owner when temporary in-memory production risk is accepted.
- `BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE`: required non-stale `YYYY-MM-DD` review date when temporary in-memory production risk is accepted.

## Redis ACL And Privacy

Configure the Redis user so it can access only the configured application prefix. For example, if `BFF_REDIS_KEY_PREFIX=nostr-city:prod:bff:`, the Redis ACL key pattern should be limited to `~nostr-city:prod:bff:*` where the provider supports ACLs.

Do not put raw IP addresses, pubkeys, event IDs, NIP-05 identifiers, or route names in Redis keys. Use the application HMAC helpers for user-derived key material.

## Client IP Assumption

Rate limits are keyed by Fastify `request.ip`, route, window and maximum request count. Production is detected from `NODE_ENV=production` or Railway environment names `production`/`prod` case-insensitively.

In production, `FASTIFY_TRUST_PROXY` must be bounded, such as `loopback`, `false`, or a comma-separated proxy allowlist. `FASTIFY_TRUST_PROXY=true` is rejected because it trusts all forwarded IP headers and can make per-IP rate limits spoofable. On Railway production, `FASTIFY_TRUST_PROXY=false` and `FASTIFY_TRUST_PROXY=loopback` are rejected because they can key limits by the Railway proxy rather than the real client IP; configure an explicit Railway proxy allowlist instead.

## Residual Risk

In-memory counters reset on process restart and are not shared across replicas, so multi-replica deployments can bypass per-client limits by distributing requests across instances. Redis mode removes that multi-replica bypass for app-level rate limits.

In-memory auth replay tracking is also per process. Production must use Redis-backed replay protection so a Nostr auth proof cannot be reused once per backend replica.

App-level rate limiting does not mitigate volumetric DDoS. Upstream protection may still be required.

## Temporary Risk Acceptance

Status: Accepted only when all temporary risk variables above are set
Owner: Set in `BFF_RATE_LIMIT_IN_MEMORY_RISK_OWNER`
Review date: Set in `BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE`
Reason: Redis/shared store not yet provisioned or temporarily unavailable for the deployment.
Compensating controls: route-specific limits, Railway health checks, logs/monitoring.

## Verification

Run `pnpm test:unit:backend -- server/src/plugins/rate-limit.test.ts`.
Run `pnpm test:unit:backend -- server/src/security/auth-replay-store.test.ts server/src/plugins/owner-auth.test.ts server/src/modules/publish/publish.routes.test.ts`.
