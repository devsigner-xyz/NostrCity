// @vitest-environment node

import { createHash } from 'node:crypto';
import { finalizeEvent, getPublicKey } from 'nostr-tools';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app';
import type { SocialService } from './social.service';

const HOST = 'api.local.test';
const OWNER_SECRET_KEY = Uint8Array.from(Array.from({ length: 32 }, () => 0x11));
const OTHER_SECRET_KEY = Uint8Array.from(Array.from({ length: 32 }, () => 0x22));
const OWNER_PUBKEY = getPublicKey(OWNER_SECRET_KEY);

const VALID_PUBKEY = 'a'.repeat(64);
const VALID_EVENT_ID = 'b'.repeat(64);
const VALID_EVENT_ID_2 = 'c'.repeat(64);

const hashPayload = (payload: unknown): string => {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
};

const buildNostrAuthHeader = ({
  secretKey,
  method,
  url,
  payload,
}: {
  secretKey: Uint8Array;
  method: string;
  url: string;
  payload: unknown;
}): string => {
  const event = finalizeEvent(
    {
      kind: 27_235,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['u', url],
        ['method', method.toUpperCase()],
        ['nonce', `nonce-${Math.random().toString(16).slice(2, 12)}`],
        ['payload', hashPayload(payload)],
      ],
      content: '',
    },
    secretKey,
  );

  return `Nostr ${Buffer.from(JSON.stringify(event)).toString('base64')}`;
};

describe('social routes', () => {
  const socialService: SocialService = {
    getFollowingFeed: async () => ({
      items: [],
      hasMore: false,
      nextUntil: null,
    }),
    getArticlesFeed: async () => ({
      items: [],
      hasMore: false,
      nextUntil: null,
    }),
    getArticleById: async () => ({
      event: null,
    }),
    getThread: async () => ({
      root: null,
      replies: [],
      hasMore: false,
      nextUntil: null,
    }),
    getEngagement: async (query) => ({
      byEventId: Object.fromEntries(
        query.eventIds.map((eventId) => [
          eventId,
          {
            replies: 0,
            reposts: 0,
            reactions: 0,
            zaps: 0,
            zapSats: 0,
          },
        ]),
      ),
    }),
    getViewerReactions: async (query) => ({
      byEventId: Object.fromEntries(
        query.eventIds.map((eventId) => [
          eventId,
          {
            eventId,
            reactionEventId: '7'.repeat(64),
            emoji: '🔥',
            createdAt: 123,
          },
        ]),
      ),
    }),
    getViewerZaps: async (query) => ({
      byEventId: Object.fromEntries(
        query.eventIds.map((eventId) => [
          eventId,
          {
            eventId,
            zapReceiptEventId: '8'.repeat(64),
            amountSats: 21,
            createdAt: 123,
          },
        ]),
      ),
    }),
    getViewerReplies: async (query) => ({
      byEventId: Object.fromEntries(
        query.eventIds.map((eventId) => [
          eventId,
          {
            eventId,
            replyEventId: '9'.repeat(64),
            createdAt: 123,
          },
        ]),
      ),
    }),
  };
  const app = buildApp({ socialService });
  const publicDemoApp = buildApp({ socialService, publicDemoMode: true });

  beforeAll(async () => {
    await app.ready();
    await publicDemoApp.ready();
  });

  afterAll(async () => {
    await app.close();
    await publicDemoApp.close();
  });

  it('does not register viewer-specific routes in public demo mode', async () => {
    const reactions = await publicDemoApp.inject({
      method: 'POST',
      url: '/v1/social/viewer-reactions',
      payload: { ownerPubkey: OWNER_PUBKEY, eventIds: [VALID_EVENT_ID] },
    });
    const zaps = await publicDemoApp.inject({
      method: 'POST',
      url: '/v1/social/viewer-zaps',
      payload: { ownerPubkey: OWNER_PUBKEY, eventIds: [VALID_EVENT_ID] },
    });
    const replies = await publicDemoApp.inject({
      method: 'POST',
      url: '/v1/social/viewer-replies',
      payload: { ownerPubkey: OWNER_PUBKEY, eventIds: [VALID_EVENT_ID] },
    });

    expect(reactions.statusCode).toBe(404);
    expect(zaps.statusCode).toBe(404);
    expect(replies.statusCode).toBe(404);
  });

  it('returns following feed envelope for valid query', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/social/feed/following?ownerPubkey=${VALID_PUBKEY}&limit=20&until=1719000000`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [],
      hasMore: false,
      nextUntil: null,
    });
  });

  it('returns articles feed envelope for valid query', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/social/feed/articles?ownerPubkey=${VALID_PUBKEY}&limit=20&until=1719000000&hashtag=nostr`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [],
      hasMore: false,
      nextUntil: null,
    });
  });

  it('returns article detail envelope for valid event id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/social/articles/${VALID_EVENT_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      event: null,
    });
  });

  it('returns thread envelope for valid query', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/social/thread/${VALID_EVENT_ID}?limit=20&until=1719000000`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      root: null,
      replies: [],
      hasMore: false,
      nextUntil: null,
    });
  });

  it('returns engagement envelope for valid body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/social/engagement',
      payload: {
        eventIds: [VALID_EVENT_ID, VALID_EVENT_ID_2],
        until: 1719000000,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      byEventId: {
        [VALID_EVENT_ID]: {
          replies: 0,
          reposts: 0,
          reactions: 0,
          zaps: 0,
          zapSats: 0,
        },
        [VALID_EVENT_ID_2]: {
          replies: 0,
          reposts: 0,
          reactions: 0,
          zaps: 0,
          zapSats: 0,
        },
      },
    });
  });

  it('returns engagement envelope when until is omitted', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/social/engagement',
      payload: {
        eventIds: [VALID_EVENT_ID],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      byEventId: {
        [VALID_EVENT_ID]: {
          replies: 0,
          reposts: 0,
          reactions: 0,
          zaps: 0,
          zapSats: 0,
        },
      },
    });
  });

  it('returns viewer reactions envelope for valid body', async () => {
    const payload = {
      ownerPubkey: OWNER_PUBKEY,
      eventIds: [VALID_EVENT_ID],
    };
    const response = await app.inject({
      method: 'POST',
      url: '/v1/social/viewer-reactions',
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OWNER_SECRET_KEY,
          method: 'POST',
          url: `http://${HOST}/v1/social/viewer-reactions`,
          payload,
        }),
        host: HOST,
      },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      byEventId: {
        [VALID_EVENT_ID]: {
          eventId: VALID_EVENT_ID,
          reactionEventId: '7'.repeat(64),
          emoji: '🔥',
          createdAt: 123,
        },
      },
    });
  });

  it('returns viewer zaps envelope for valid body', async () => {
    const payload = {
      ownerPubkey: OWNER_PUBKEY,
      eventIds: [VALID_EVENT_ID],
    };
    const response = await app.inject({
      method: 'POST',
      url: '/v1/social/viewer-zaps',
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OWNER_SECRET_KEY,
          method: 'POST',
          url: `http://${HOST}/v1/social/viewer-zaps`,
          payload,
        }),
        host: HOST,
      },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      byEventId: {
        [VALID_EVENT_ID]: {
          eventId: VALID_EVENT_ID,
          zapReceiptEventId: '8'.repeat(64),
          amountSats: 21,
          createdAt: 123,
        },
      },
    });
  });

  it('returns viewer replies envelope for valid body', async () => {
    const payload = {
      ownerPubkey: OWNER_PUBKEY,
      eventIds: [VALID_EVENT_ID],
    };
    const response = await app.inject({
      method: 'POST',
      url: '/v1/social/viewer-replies',
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OWNER_SECRET_KEY,
          method: 'POST',
          url: `http://${HOST}/v1/social/viewer-replies`,
          payload,
        }),
        host: HOST,
      },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      byEventId: {
        [VALID_EVENT_ID]: {
          eventId: VALID_EVENT_ID,
          replyEventId: '9'.repeat(64),
          createdAt: 123,
        },
      },
    });
  });

  it('returns 401 for viewer reactions without auth in full mode', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/social/viewer-reactions',
      payload: {
        ownerPubkey: OWNER_PUBKEY,
        eventIds: [VALID_EVENT_ID],
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 403 for viewer reactions when auth pubkey mismatches ownerPubkey', async () => {
    const payload = {
      ownerPubkey: OWNER_PUBKEY,
      eventIds: [VALID_EVENT_ID],
    };
    const response = await app.inject({
      method: 'POST',
      url: '/v1/social/viewer-reactions',
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OTHER_SECRET_KEY,
          method: 'POST',
          url: `http://${HOST}/v1/social/viewer-reactions`,
          payload,
        }),
        host: HOST,
      },
      payload,
    });

    expect(response.statusCode).toBe(403);
  });

  it('returns 200 for viewer reactions when auth pubkey matches ownerPubkey', async () => {
    const payload = {
      ownerPubkey: OWNER_PUBKEY,
      eventIds: [VALID_EVENT_ID],
    };
    const response = await app.inject({
      method: 'POST',
      url: '/v1/social/viewer-reactions',
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OWNER_SECRET_KEY,
          method: 'POST',
          url: `http://${HOST}/v1/social/viewer-reactions`,
          payload,
        }),
        host: HOST,
      },
      payload,
    });

    expect(response.statusCode).toBe(200);
  });

  it('returns 400 when following query is missing ownerPubkey', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/social/feed/following?limit=20&until=1719000000',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when articles query is missing ownerPubkey', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/social/feed/articles?limit=20&until=1719000000',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when ownerPubkey is not lowercase hex', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/social/feed/following?ownerPubkey=${'A'.repeat(64)}&limit=20&until=1719000000`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when following query has invalid limit', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/social/feed/following?ownerPubkey=${VALID_PUBKEY}&limit=0&until=1719000000`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when following query has invalid until', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/social/feed/following?ownerPubkey=${VALID_PUBKEY}&limit=20&until=-1`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when hashtag exceeds max length', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/social/feed/following?ownerPubkey=${VALID_PUBKEY}&limit=20&until=1719000000&hashtag=${'x'.repeat(65)}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('ignores unexpected query properties without changing response contract', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/social/feed/following?ownerPubkey=${VALID_PUBKEY}&limit=20&until=1719000000&unknownFlag=x`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [],
      hasMore: false,
      nextUntil: null,
    });
  });

  it('returns 400 when thread path param is invalid', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/social/thread/not-a-valid-event-id?limit=20&until=1719000000',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when article detail path param is invalid', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/social/articles/not-a-valid-event-id',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when thread query has invalid limit', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/social/thread/${VALID_EVENT_ID}?limit=1000&until=1719000000`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when thread query has invalid until', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/social/thread/${VALID_EVENT_ID}?limit=20&until=-1`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when engagement body is missing eventIds', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/social/engagement',
      payload: {
        until: 1719000000,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when engagement eventIds is empty', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/social/engagement',
      payload: {
        eventIds: [],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when engagement eventIds contains invalid id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/social/engagement',
      payload: {
        eventIds: [VALID_EVENT_ID, 'not-a-valid-event-id'],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when engagement eventIds exceeds max length', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/social/engagement',
      payload: {
        eventIds: Array.from({ length: 101 }, (_, index) =>
          index.toString(16).padStart(64, '0'),
        ),
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when engagement until is invalid', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/social/engagement',
      payload: {
        eventIds: [VALID_EVENT_ID],
        until: -1,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when engagement until exceeds max bound', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/social/engagement',
      payload: {
        eventIds: [VALID_EVENT_ID],
        until: 2_147_483_648,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });
});
