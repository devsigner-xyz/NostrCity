# Production Rate Limiting

## Scope

Applies to all `/v1` Fastify routes.

## Current Controls

- Default: 120 requests per minute per client IP and route.
- Route overrides exist for identity, content, graph and publish endpoints.
- The in-memory store is appropriate for development and test environments.
- The Redis store is available for production and uses atomic Redis scripting for shared counters.

## Production Requirement

Production must use shared rate limit storage, preferably Redis. In-memory production mode requires explicit `BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK=true` and dated risk acceptance.

When `BFF_RATE_LIMIT_STORE=redis`, `REDIS_URL` is required. The BFF connects to Redis and verifies `PING` at startup. If Redis is unavailable at startup or during request-time rate-limit checks, requests fail closed instead of silently falling back to memory.

Redis request-time checks use a bounded command timeout and disable offline queueing. Rate-limit keys use the `nostr-city:bff:rate-limit:v1:` prefix for Redis ACL/keyspace separation.

## Railway Variables

- `BFF_RATE_LIMIT_STORE`: set to `redis` when Redis integration is enabled.
- `REDIS_URL`: required when `BFF_RATE_LIMIT_STORE=redis`; on Railway use `${{Redis.REDIS_URL}}`. Production public Redis URLs must use `rediss://` and include authentication material; `redis://` is accepted only for local/private/internal hosts.
- `BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK`: temporary risk acceptance only.
- `BFF_RATE_LIMIT_IN_MEMORY_RISK_OWNER`: required owner when temporary in-memory production risk is accepted.
- `BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE`: required non-stale `YYYY-MM-DD` review date when temporary in-memory production risk is accepted.

## Client IP Assumption

Rate limits are keyed by Fastify `request.ip`, route, window and maximum request count. Production is detected from `NODE_ENV=production` or Railway environment names `production`/`prod` case-insensitively.

In production, `FASTIFY_TRUST_PROXY` must be bounded, such as `loopback`, `false`, or a comma-separated proxy allowlist. `FASTIFY_TRUST_PROXY=true` is rejected because it trusts all forwarded IP headers and can make per-IP rate limits spoofable. On Railway production, `FASTIFY_TRUST_PROXY=false` and `FASTIFY_TRUST_PROXY=loopback` are rejected because they can key limits by the Railway proxy rather than the real client IP; configure an explicit Railway proxy allowlist instead.

## Residual Risk

In-memory counters reset on process restart and are not shared across replicas, so multi-replica deployments can bypass per-client limits by distributing requests across instances. Redis mode removes that multi-replica bypass for app-level rate limits.

App-level rate limiting does not mitigate volumetric DDoS. Upstream protection may still be required.

## Temporary Risk Acceptance

Status: Accepted only when all temporary risk variables above are set
Owner: Set in `BFF_RATE_LIMIT_IN_MEMORY_RISK_OWNER`
Review date: Set in `BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE`
Reason: Redis/shared store not yet provisioned or temporarily unavailable for the deployment.
Compensating controls: route-specific limits, Railway health checks, logs/monitoring.

## Verification

Run `pnpm test:unit:backend -- server/src/plugins/rate-limit.test.ts`.
