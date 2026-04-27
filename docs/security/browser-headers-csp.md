# Browser Headers And CSP

## Scope

This policy applies to the Fastify BFF and static assets served by the Railway production service.

## Production Headers

- Content-Security-Policy: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: wss:; media-src 'self' https: blob:; worker-src 'self' blob:; manifest-src 'self'; form-action 'self'; upgrade-insecure-requests`
- Strict-Transport-Security: `max-age=31536000; includeSubDomains`
- Cross-Origin-Opener-Policy: `same-origin`
- Cross-Origin-Resource-Policy: `same-origin`
- X-Frame-Options: `DENY`
- X-Content-Type-Options: `nosniff`
- Referrer-Policy: `strict-origin-when-cross-origin`
- Permissions-Policy: `geolocation=(), microphone=(), camera=()`

## Exceptions

- `style-src 'unsafe-inline'` remains enabled because the current React, Vite, Tailwind, and shadcn/ui runtime can rely on inline style attributes and generated style behavior. Prefer hashes or nonces before removing this exception.
- `style-src https://fonts.googleapis.com` and `font-src https://fonts.gstatic.com` are explicit allowlists for the Google Fonts stylesheet and font files referenced by the landing page.
- `connect-src` allows `https:` and `wss:` so the browser app can call HTTPS APIs and connect to Nostr relays over WebSocket.
- `img-src` allows `https:`, `data:`, and `blob:` for remote Nostr profile images, generated previews, and browser-created object URLs.
- `media-src` allows `https:` and `blob:` for user-generated Nostr media and local preview URLs.
- `worker-src` allows `blob:` for browser worker creation by bundled dependencies if needed.
- Production CSP does not allow `script-src 'unsafe-eval'`.
- `Strict-Transport-Security` uses `includeSubDomains`; confirm any production subdomains are HTTPS-ready before attaching this service to additional hostnames.

## Development And Test Differences

- `Strict-Transport-Security` is only emitted in production-like runtime contexts: `NODE_ENV=production` or `RAILWAY_ENVIRONMENT_NAME=production`.
- `upgrade-insecure-requests` is only included in production-like CSP output.
- All other browser isolation and content-sniffing headers are emitted in development, test, and production.

## Verification

Run `pnpm test:unit:backend -- server/src/plugins/security-headers.test.ts`.

Run `pnpm build`.
