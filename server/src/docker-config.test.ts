// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');

describe('Docker local distribution config', () => {
  it('uses Node 24, pnpm build, non-root runtime, and the built server entrypoint', async () => {
    const dockerfile = await readFile(join(root, 'Dockerfile'), 'utf8');

    expect(dockerfile).toContain('FROM node:24');
    expect(dockerfile).toContain('corepack enable');
    expect(dockerfile).toContain('COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./');
    expect(dockerfile).toContain('pnpm install --frozen-lockfile');
    expect(dockerfile).toContain('pnpm build');
    expect(dockerfile).toContain('pnpm prune --prod');
    expect(dockerfile).toContain('ARG NOSTR_CITY_PUBLIC_DEMO_MODE=false');
    expect(dockerfile).toContain('ENV NOSTR_CITY_PUBLIC_DEMO_MODE=$NOSTR_CITY_PUBLIC_DEMO_MODE');
    expect(dockerfile).toContain('USER node');
    expect(dockerfile).toContain('server/dist/main.js');
    expect(dockerfile).toContain('/v1/health');
  });

  it('keeps compose local-only and demo mode disabled by default', async () => {
    const compose = await readFile(join(root, 'docker-compose.yml'), 'utf8');

    expect(compose).toContain('127.0.0.1:3000:3000');
    expect(compose).toContain('NOSTR_CITY_PUBLIC_DEMO_MODE: ${NOSTR_CITY_PUBLIC_DEMO_MODE:-false}');
    expect(compose).toContain('HOST: 0.0.0.0');
    expect(compose).toContain('PORT: 3000');
    expect(compose).toContain('NOSTR_CITY_DOCKER_LOCAL: "true"');
    expect(compose).not.toContain('NODE_ENV: production');
  });

  it('excludes local secrets and heavy artifacts from the Docker build context', async () => {
    const dockerignore = await readFile(join(root, '.dockerignore'), 'utf8');

    expect(dockerignore).toContain('.env');
    expect(dockerignore).toContain('.env.*');
    expect(dockerignore).toContain('node_modules');
    expect(dockerignore).toContain('dist');
    expect(dockerignore).toContain('server/dist');
    expect(dockerignore).toContain('context');
    expect(dockerignore).toContain('docs/superpowers');
    expect(dockerignore).toContain('plans');
    expect(dockerignore).toContain('.agents');
    expect(dockerignore).toContain('.opencode');
    expect(dockerignore).toContain('test-results');
    expect(dockerignore).toContain('playwright-report');
  });

  it('does not require git metadata while building docs inside Docker', async () => {
    const dockerfile = await readFile(join(root, 'Dockerfile'), 'utf8');
    const vitepressConfig = await readFile(join(root, 'docs', '.vitepress', 'config.mts'), 'utf8');

    expect(dockerfile).toContain('VITEPRESS_LAST_UPDATED=false');
    expect(vitepressConfig).toContain("process.env.VITEPRESS_LAST_UPDATED !== 'false'");
  });
});
