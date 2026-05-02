// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { normalizePublicRelayUrl } from './relay-url-policy';
import { normalizeScopedReadRelaysInput } from './request-scoped-relays';

describe('normalizePublicRelayUrl', () => {
  it('blocks unsafe relay URLs', () => {
    const blocked = [
      'ws://relay.example',
      'wss://localhost',
      'wss://127.0.0.1',
      'wss://10.0.0.2',
      'wss://172.16.0.2',
      'wss://192.168.1.5',
      'wss://169.254.169.254',
      'wss://[::1]',
      'wss://host.docker.internal',
      'wss://user:pass@relay.example',
      'https://relay.example',
    ];

    for (const value of blocked) {
      expect(normalizePublicRelayUrl(value)).toBeNull();
    }
  });

  it('normalizes safe public relay URLs', () => {
    expect(normalizePublicRelayUrl('wss://relay.example/')).toBe('wss://relay.example');
    expect(normalizePublicRelayUrl('wss://relay.example?x=1#frag')).toBe('wss://relay.example');
    expect(normalizePublicRelayUrl('wss://relay.example:443/')).toBe('wss://relay.example');
  });
});

describe('normalizeScopedReadRelaysInput', () => {
  it('drops invalid and non-public relay targets', () => {
    expect(normalizeScopedReadRelaysInput([
      'wss://relay.example/',
      'wss://relay.example',
      'wss://relay.example?x=1',
      'ws://relay.example',
      'wss://localhost',
      'wss://192.168.1.5',
      'wss://user:pass@relay.example',
      'https://relay.example',
      'wss://relay.two',
    ])).toEqual([
      'wss://relay.example',
      'wss://relay.two',
    ]);
  });
});
