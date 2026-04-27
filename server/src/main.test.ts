// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { resolveHost, resolvePort } from './main';

describe('server main config helpers', () => {
  it('uses defaults when host/port are missing', () => {
    expect(resolveHost(undefined)).toBe('0.0.0.0');
    expect(resolvePort(undefined)).toBe(3000);
  });

  it('accepts valid custom port', () => {
    expect(resolvePort('8080')).toBe(8080);
  });

  it('rejects invalid port values', () => {
    expect(() => resolvePort('0')).toThrow('Invalid PORT value');
    expect(() => resolvePort('65536')).toThrow('Invalid PORT value');
    expect(() => resolvePort('abc')).toThrow('Invalid PORT value');
  });
});
