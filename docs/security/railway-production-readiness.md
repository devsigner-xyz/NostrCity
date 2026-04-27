# Railway Production Readiness

## Scope

This checklist applies to the Railway production service for Nostr City.

## Required Variables

- `BFF_CORS_ORIGINS`: must be explicit; do not use localhost in production.
- `FASTIFY_TRUST_PROXY`: must be explicit; document the chosen value internally without exposing it in public reports. Prefer a bounded proxy setting such as `loopback` or an allowlist unless `true` has been reviewed and accepted for the deployment boundary.
- `PORT`: provided by Railway.
- `HOST`: optional; the app defaults to `0.0.0.0`.

## Secret-Safe Verification

Run read-only commands only. Do not paste values in docs, PRs, issues, or prompts.

```bash
railway status --json
railway variables --kv | cut -d= -f1
```

When reporting, say only whether each required variable is present. Do not include the configured value. If the CLI output cannot be filtered to names only, do not share the command output.

## Deployment Config

- `railway.json` build command uses `pnpm install --frozen-lockfile` and `pnpm build`.
- Start command is `pnpm start`.
- Healthcheck path is `/v1/health`.

## Audit Evidence

Record the date, service, environment, required variable names present, latest deployment status, and healthcheck result. Redact values.
