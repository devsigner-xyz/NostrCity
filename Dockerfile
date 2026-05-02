# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG NOSTR_CITY_PUBLIC_DEMO_MODE=false
ENV NOSTR_CITY_PUBLIC_DEMO_MODE=$NOSTR_CITY_PUBLIC_DEMO_MODE
ENV VITEPRESS_LAST_UPDATED=false
COPY . .
RUN pnpm build
RUN pnpm prune --prod

FROM node:24-bookworm-slim AS runtime
WORKDIR /app

# This image is intended for local/self-hosted use. Compose binds it to 127.0.0.1.
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server/dist ./server/dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/v1/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/dist/main.js"]
