// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app';

describe('request context plugin', () => {
  const app = buildApp();

  beforeAll(async () => {
    app.get('/v1/test/context', async (request) => {
      return {
        requestId: request.context.requestId,
      };
    });

    app.post('/v1/test/context-log', async (request) => {
      request.context.authenticatedPubkey = 'f'.repeat(64);
      return { ok: true };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('adds x-request-id header and context.requestId', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/test/context' });

    const requestIdHeader = response.headers['x-request-id'];
    expect(typeof requestIdHeader).toBe('string');
    expect(requestIdHeader).toBeTruthy();
    expect(response.json()).toMatchObject({
      requestId: requestIdHeader,
    });
  });

  it('logs request metadata with sensitive fields redacted', async () => {
    const infoSpy = vi.spyOn(app.log, 'info');

    await app.inject({
      method: 'POST',
      url: '/v1/test/context-log?ownerPubkey=abcd&peerPubkey=efgh&q=secret%20search&hashtag=privacy&relayScope=focused&limit=10',
      headers: {
        authorization: 'Nostr sensitive-header-token',
        'x-forwarded-for': '203.0.113.1',
      },
      payload: {
        ownerPubkey: 'abcd',
        // TEST_VECTOR_DO_NOT_USE: fake credential used to verify log redaction.
        credential: 'nsec1super-secret-key',
        passphrase: 'password1234',
        event: {
          kind: 1,
          content: 'top-secret-content',
          sig: 'deadbeef',
        },
        relays: ['wss://relay.one', 'wss://relay.two'],
      },
    });

    expect(infoSpy).toHaveBeenCalled();
    const matchedCall = infoSpy.mock.calls.find(([entry]) =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      'event' in (entry as Record<string, unknown>) &&
      (entry as Record<string, unknown>).event === 'request.completed',
    );
    const [entry] = matchedCall ?? [];
    expect(entry).toBeDefined();

    const serialized = JSON.stringify(entry);
    expect(serialized).toContain('eventKind');
    expect(serialized).toContain('relayCount');
    expect(serialized).toContain('relayScope');
    expect(serialized).not.toContain('credential');
    expect(serialized).not.toContain('passphrase');
    expect(serialized).not.toContain('nsec1super-secret-key');
    expect(serialized).not.toContain('password1234');
    expect(serialized).not.toContain('top-secret-content');
    expect(serialized).not.toContain('deadbeef');
    expect(serialized).not.toContain('"ownerPubkey":');
    expect(serialized).not.toContain('"peerPubkey":');
    expect(serialized).not.toContain('"authenticatedPubkey":');
    expect(serialized).not.toContain('"q":');
    expect(serialized).not.toContain('"hashtag":');
    expect(serialized).not.toContain('authorization');
    expect(serialized).not.toContain('sensitive-header-token');
    expect(serialized).not.toContain('forwardedFor');
    expect(serialized).not.toContain('203.0.113.1');
    expect(serialized).not.toContain('wss://relay.one');
    expect(serialized).not.toContain('wss://relay.two');
    expect(serialized).not.toContain('secret search');

    infoSpy.mockRestore();
  });

  it('applies baseline security headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/test/context' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe(
      'strict-origin-when-cross-origin',
    );
    expect(response.headers['permissions-policy']).toContain('geolocation=()');
  });
});
