// @vitest-environment node

import { finalizeEvent } from 'nostr-tools';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

import { buildApp } from '../../app';
import type { AuthReplayStore } from '../../security/auth-replay-store';
import { publishRoutes } from './publish.routes';
import type { PublishForwardRequestDto } from './publish.schemas';
import { relayScopePolicies, type PublishService } from './publish.service';

const SECRET_KEY = Uint8Array.from(Array.from({ length: 32 }, () => 0x33));
const OTHER_SECRET_KEY = Uint8Array.from(Array.from({ length: 32 }, () => 0x44));
const HOST = 'api.local.test';

const buildSignedEvent = (kind = 1) => {
  return finalizeEvent(
    {
      kind,
      created_at: 1_719_000_000,
      tags: [],
      content: 'hello',
    },
    SECRET_KEY,
  );
};

const buildPayload = (): PublishForwardRequestDto => {
  return {
    event: buildSignedEvent(),
    relayScope: 'social',
    relays: ['wss://relay.damus.io', 'wss://nos.lol'],
  };
};

const buildNostrAuthHeader = (
  method: string,
  url: string,
  payload?: unknown,
  secretKey: Uint8Array = SECRET_KEY,
  nonce?: string,
): string => {
  const normalizedMethod = method.toUpperCase();
  const tags: string[][] = [
    ['u', url],
    ['method', normalizedMethod],
    ['nonce', nonce ?? `nonce-${Math.random().toString(16).slice(2, 12)}`],
  ];

  if (payload !== undefined && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) {
    const serializedPayload = JSON.stringify(payload);
    const payloadHash = createHash('sha256').update(serializedPayload).digest('hex');
    tags.push(['payload', payloadHash]);
  }

  const event = finalizeEvent(
    {
      kind: 27_235,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: '',
    },
    secretKey,
  );

  return `Nostr ${Buffer.from(JSON.stringify(event)).toString('base64')}`;
};

describe('publish routes', () => {
  const forwardMock = vi.fn<PublishService['forward']>();
  const publishService: PublishService = {
    forward: forwardMock,
  };

  const app = buildApp({ publishService });

  beforeEach(() => {
    forwardMock.mockReset();
  });

  const requestPublish = async (
    payload: PublishForwardRequestDto,
    authMode: 'valid' | 'missing' | 'mismatch' = 'valid',
  ) => {
    const url = '/v1/publish/forward';
    const headers: Record<string, string> = {
      host: HOST,
    };

    if (authMode !== 'missing') {
      headers.authorization = buildNostrAuthHeader(
        'POST',
        `http://${HOST}${url}`,
        payload,
        authMode === 'mismatch' ? OTHER_SECRET_KEY : SECRET_KEY,
      );
    }

    return app.inject({
      method: 'POST',
      url,
      payload,
      headers,
    });
  };

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with relay ack arrays for valid signed event', async () => {
    forwardMock.mockResolvedValueOnce({
      ackedRelays: ['wss://relay.damus.io'],
      failedRelays: [{ relay: 'wss://nos.lol', reason: 'publish_failed' }],
      timeoutRelays: [],
    });

    const response = await requestPublish(buildPayload());

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ackedRelays: ['wss://relay.damus.io'],
      failedRelays: [{ relay: 'wss://nos.lol', reason: 'publish_failed' }],
      timeoutRelays: [],
    });
    expect(forwardMock).toHaveBeenCalledOnce();
  });

  it('returns 401 when auth proof is missing', async () => {
    const response = await requestPublish(buildPayload(), 'missing');

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: 'UNAUTHORIZED',
      },
    });
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it('returns 403 when auth pubkey does not match event.pubkey', async () => {
    const response = await requestPublish(buildPayload(), 'mismatch');

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: 'FORBIDDEN',
      },
    });
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it('returns 401 when same auth proof is replayed', async () => {
    forwardMock.mockResolvedValue({
      ackedRelays: ['wss://relay.damus.io'],
      failedRelays: [],
      timeoutRelays: [],
    });

    const payload = buildPayload();
    const url = '/v1/publish/forward';
    const replayAuthorization = buildNostrAuthHeader(
      'POST',
      `http://${HOST}${url}`,
      payload,
      SECRET_KEY,
      'fixed-replay-nonce',
    );

    const first = await app.inject({
      method: 'POST',
      url,
      payload,
      headers: {
        authorization: replayAuthorization,
        host: HOST,
      },
    });

    const second = await app.inject({
      method: 'POST',
      url,
      payload,
      headers: {
        authorization: replayAuthorization,
        host: HOST,
      },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(401);
    expect(second.json()).toMatchObject({
      error: {
        code: 'UNAUTHORIZED',
      },
    });
    expect(forwardMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when publish auth replay storage fails', async () => {
    const failingReplayStore: AuthReplayStore = {
      consume: async () => {
        throw new Error('redis unavailable');
      },
      close: async () => undefined,
    };
    const isolatedForwardMock = vi.fn<PublishService['forward']>();
    const isolatedApp = buildApp({
      publishService: { forward: isolatedForwardMock },
      authReplayStore: failingReplayStore,
    });
    await isolatedApp.ready();

    try {
      const payload = buildPayload();
      const url = '/v1/publish/forward';
      const response = await isolatedApp.inject({
        method: 'POST',
        url,
        payload,
        headers: {
          authorization: buildNostrAuthHeader('POST', `http://${HOST}${url}`, payload),
          host: HOST,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(isolatedForwardMock).not.toHaveBeenCalled();
    } finally {
      await isolatedApp.close();
    }
  });

  it('fails fast when owner auth plugin is not registered first', async () => {
    const isolatedApp = Fastify({ logger: false });
    isolatedApp.register(publishRoutes, { service: publishService });

    try {
      let readyError: unknown;
      try {
        await isolatedApp.ready();
      } catch (error) {
        readyError = error;
      }

      expect(readyError).toBeInstanceOf(Error);
      expect((readyError as Error).message).toContain('ownerAuthPlugin');
    } finally {
      await isolatedApp.close();
    }
  });

  it('returns deterministic 400 when event id is invalid', async () => {
    const payload = buildPayload();
    payload.event.id = 'f'.repeat(64);

    const response = await requestPublish(payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'EVENT_ID_INVALID',
        message: 'event.id does not match NIP-01 hash',
      },
    });
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it('returns deterministic 400 when event signature is invalid', async () => {
    const payload = buildPayload();
    payload.event.sig = 'f'.repeat(128);

    const response = await requestPublish(payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'EVENT_SIG_INVALID',
        message: 'event.sig is invalid for event.pubkey',
      },
    });
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it('returns 400 when relay URL is invalid or unsupported scheme', async () => {
    for (const relay of ['not-a-url', 'ws://relay.damus.io', 'wss://relay.damus.io:7447', 'wss://relay.damus.io/custom']) {
      const payload = buildPayload();
      payload.relays = [relay];

      const response = await requestPublish(payload);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: {
          code: 'RELAY_URL_INVALID',
        },
      });
    }

    expect(forwardMock).not.toHaveBeenCalled();
  });

  it('returns 400 when relay destination is private/internal', async () => {
    const payload = buildPayload();
    payload.relays = ['wss://127.0.0.1'];

    const response = await requestPublish(payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'RELAY_URL_PRIVATE',
      },
    });
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it('returns 400 when relay count exceeds scope cap', async () => {
    const payload = buildPayload();
    const maxRelays = relayScopePolicies[payload.relayScope].maxRelays;
    payload.relays = Array.from(
      { length: maxRelays + 1 },
      (_, index) => `wss://relay-${index}.example.com`,
    );

    const response = await requestPublish(payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'RELAY_COUNT_EXCEEDED',
      },
    });
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it('returns 400 when relayScope policy blocks event kind', async () => {
    const payload = buildPayload();
    payload.relayScope = 'dm';

    const response = await requestPublish(payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'RELAY_SCOPE_POLICY_VIOLATION',
      },
    });
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it('returns 400 when relay host is not allowed for relayScope', async () => {
    const payload = buildPayload();
    payload.relayScope = 'dm';
    payload.event = buildSignedEvent(4);
    payload.relays = ['wss://relay.example.com'];

    const response = await requestPublish(payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'RELAY_SCOPE_POLICY_VIOLATION',
      },
    });
    expect(forwardMock).not.toHaveBeenCalled();
  });
});
