// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  formatLocalDockerReadyMessage,
  logLocalDockerReadyMessage,
  resolveHost,
  resolvePort,
} from './main';

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

  it('prints local Docker usage guidance only when Docker local mode is enabled', () => {
    expect(formatLocalDockerReadyMessage({ NOSTR_CITY_DOCKER_LOCAL: 'true' })).toContain(
      'Open Nostr City locally:',
    );
    expect(formatLocalDockerReadyMessage({ NOSTR_CITY_DOCKER_LOCAL: 'true' })).toContain(
      'http://127.0.0.1:3000/app/',
    );
    expect(formatLocalDockerReadyMessage({})).toBeUndefined();
  });

  it('writes local Docker usage guidance to stdout when enabled', () => {
    const messages: string[] = [];

    logLocalDockerReadyMessage(
      { NOSTR_CITY_DOCKER_LOCAL: 'true' },
      (message) => messages.push(message),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('http://127.0.0.1:3000/app/');

    logLocalDockerReadyMessage({}, (message) => messages.push(message));
    expect(messages).toHaveLength(1);
  });
});
