// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildApp } from './app';
import {
  isProductionRuntime,
  validateProductionSecurityConfig,
} from './production-config';

const repoRoot = join(__dirname, '..', '..');

describe('production deployment config', () => {
  it('defines a package start script for Railway', async () => {
    const packageJson = JSON.parse(
      await readFile(join(repoRoot, 'package.json'), 'utf8'),
    ) as { main?: string; scripts?: Record<string, string> };

    expect(packageJson.main).toBe('server/dist/main.js');
    expect(packageJson.scripts?.['build:server']).toBe('tsc -p server/tsconfig.json');
    expect(packageJson.scripts?.build).toContain('pnpm build:server');
    expect(packageJson.scripts?.start).toBe('node server/dist/main.js');
  });

  it('defines Railway build, start, and healthcheck settings without requiring pnpm at runtime', async () => {
    const railwayJson = JSON.parse(
      await readFile(join(repoRoot, 'railway.json'), 'utf8'),
    ) as {
      build?: { builder?: string; buildCommand?: string };
      deploy?: { startCommand?: string; healthcheckPath?: string };
    };

    expect(railwayJson.build?.builder).toBe('RAILPACK');
    expect(railwayJson.build?.buildCommand).toContain('pnpm build');
    expect(railwayJson.deploy?.startCommand).toBe('node server/dist/main.js');
    expect(railwayJson.deploy?.healthcheckPath).toBe('/v1/health');
  });
});

describe('production security config', () => {
  it('treats NODE_ENV=production as production runtime', () => {
    expect(isProductionRuntime({ NODE_ENV: 'production' })).toBe(true);
  });

  it('treats Railway production environment as production runtime', () => {
    expect(isProductionRuntime({ RAILWAY_ENVIRONMENT_NAME: 'production' })).toBe(true);
  });

  it.each(['prod', 'Production', 'PROD'])(
    'treats Railway environment name %s as production runtime',
    (environmentName) => {
      expect(isProductionRuntime({ RAILWAY_ENVIRONMENT_NAME: environmentName })).toBe(true);
    },
  );

  it('does not treat local development as production runtime', () => {
    expect(isProductionRuntime({ NODE_ENV: 'test' })).toBe(false);
  });

  it('requires explicit cors origins in production', () => {
    expect(() => validateProductionSecurityConfig({ NODE_ENV: 'production' })).toThrow(
      'BFF_CORS_ORIGINS',
    );
  });

  it('requires explicit trust proxy in production', () => {
    expect(() =>
      validateProductionSecurityConfig({
        NODE_ENV: 'production',
        BFF_CORS_ORIGINS: 'https://nostrcity.xyz',
      }),
    ).toThrow('FASTIFY_TRUST_PROXY');
  });

  it('accepts explicit production security config', () => {
    expect(() =>
      validateProductionSecurityConfig({
        NODE_ENV: 'production',
        BFF_CORS_ORIGINS: 'https://nostrcity.xyz',
        FASTIFY_TRUST_PROXY: 'loopback',
      }),
    ).not.toThrow();
  });

  it.each(['false', 'loopback', '127.0.0.1,10.0.0.1'])(
    'accepts explicit FASTIFY_TRUST_PROXY=%s',
    (value) => {
      expect(() =>
        validateProductionSecurityConfig({
          NODE_ENV: 'production',
          BFF_CORS_ORIGINS: 'https://nostrcity.xyz',
          FASTIFY_TRUST_PROXY: value,
        }),
      ).not.toThrow();
    },
  );

  it('rejects accept-all trust proxy in production', () => {
    expect(() =>
      validateProductionSecurityConfig({
        NODE_ENV: 'production',
        BFF_CORS_ORIGINS: 'https://nostrcity.xyz',
        FASTIFY_TRUST_PROXY: 'true',
      }),
    ).toThrow('FASTIFY_TRUST_PROXY');
  });

  it('rejects disabled trust proxy in Railway production', () => {
    expect(() =>
      validateProductionSecurityConfig({
        RAILWAY_ENVIRONMENT_NAME: 'production',
        BFF_CORS_ORIGINS: 'https://nostrcity.xyz',
        FASTIFY_TRUST_PROXY: 'false',
      }),
    ).toThrow('FASTIFY_TRUST_PROXY');
  });

  it('rejects loopback-only trust proxy in Railway production', () => {
    expect(() =>
      validateProductionSecurityConfig({
        RAILWAY_ENVIRONMENT_NAME: 'production',
        BFF_CORS_ORIGINS: 'https://nostrcity.xyz',
        FASTIFY_TRUST_PROXY: 'loopback',
      }),
    ).toThrow('FASTIFY_TRUST_PROXY');
  });

  it('accepts explicit proxy allowlist in Railway production', () => {
    expect(() =>
      validateProductionSecurityConfig({
        RAILWAY_ENVIRONMENT_NAME: 'production',
        BFF_CORS_ORIGINS: 'https://nostrcity.xyz',
        FASTIFY_TRUST_PROXY: '100.64.0.0/10',
      }),
    ).not.toThrow();
  });

  it('fails to build in production when security config is missing', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousCors = process.env.BFF_CORS_ORIGINS;
    const previousTrustProxy = process.env.FASTIFY_TRUST_PROXY;

    process.env.NODE_ENV = 'production';
    delete process.env.BFF_CORS_ORIGINS;
    delete process.env.FASTIFY_TRUST_PROXY;

    try {
      expect(() => buildApp()).toThrow('Missing production security configuration');
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousCors === undefined) delete process.env.BFF_CORS_ORIGINS;
      else process.env.BFF_CORS_ORIGINS = previousCors;
      if (previousTrustProxy === undefined) delete process.env.FASTIFY_TRUST_PROXY;
      else process.env.FASTIFY_TRUST_PROXY = previousTrustProxy;
    }
  });
});
