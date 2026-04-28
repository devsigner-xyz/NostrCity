# Railway Production Readiness

## Scope

This checklist applies to the Railway production service for Nostr City.

## Required Variables

- `BFF_CORS_ORIGINS`: must be explicit; do not use localhost in production.
- `FASTIFY_TRUST_PROXY`: must be an explicit Railway proxy allowlist in Railway production. `true` is rejected because it trusts all forwarded IP headers; `false` and `loopback` are rejected on Railway because they can key client IPs to the proxy.
- `BFF_RATE_LIMIT_STORE`: set to `redis` for shared production rate-limit storage, or document temporary in-memory risk acceptance.
- `BFF_AUTH_REPLAY_STORE`: set to `redis` unless `BFF_RATE_LIMIT_STORE=redis` already enables the shared Redis security store.
- `BFF_REDIS_KEY_PREFIX`: set to a production-only prefix such as `nostr-city:prod:bff:`.
- `BFF_REDIS_KEY_HASH_SECRET`: set to a secret value of at least 32 characters. Do not expose or reuse it across environments.
- `REDIS_URL`: required when Redis-backed security features are enabled; use the Railway Redis reference and do not expose the value. Public Redis URLs must use TLS and a password.
- `BFF_RATE_LIMIT_ACCEPT_IN_MEMORY_RISK`, `BFF_RATE_LIMIT_IN_MEMORY_RISK_OWNER`, and `BFF_RATE_LIMIT_IN_MEMORY_RISK_REVIEW_DATE`: required only for temporary in-memory production risk acceptance.
- `PORT`: provided by Railway.
- `HOST`: optional; the app defaults to `0.0.0.0`.

## Secret-Safe Verification

Run read-only commands only. Do not paste values in docs, PRs, issues, or prompts.

```bash
railway status --json
railway variables --kv | cut -d= -f1
```

When reporting, say only whether each required variable is present. Do not include the configured value. If the CLI output cannot be filtered to names only, do not share the command output.

## Redis Privacy Posture

- Redis keys must stay inside the configured `BFF_REDIS_KEY_PREFIX` keyspace.
- User-derived key material is HMAC-hashed before use in Redis keys; do not inspect or copy raw key material into logs or support notes.
- If the provider supports Redis ACLs, restrict the Redis user to the configured prefix, for example `~nostr-city:prod:bff:*`.

## Deployment Config

- `railway.json` build command uses `pnpm install --frozen-lockfile` and `pnpm build`.
- Start command is `pnpm start`.
- Healthcheck path is `/v1/health`.

## Audit Evidence

Record the date, service, environment, required variable names present, latest deployment status, and healthcheck result. Redact values.
