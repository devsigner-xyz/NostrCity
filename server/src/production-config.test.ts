// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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

  it('defines Railway build, start, and healthcheck settings', async () => {
    const railwayJson = JSON.parse(
      await readFile(join(repoRoot, 'railway.json'), 'utf8'),
    ) as {
      build?: { builder?: string; buildCommand?: string };
      deploy?: { startCommand?: string; healthcheckPath?: string };
    };

    expect(railwayJson.build?.builder).toBe('RAILPACK');
    expect(railwayJson.build?.buildCommand).toContain('pnpm build');
    expect(railwayJson.deploy?.startCommand).toBe('pnpm start');
    expect(railwayJson.deploy?.healthcheckPath).toBe('/v1/health');
  });
});
