// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app';
import type { SocialService } from './social.service';

const VALID_PUBKEY = 'a'.repeat(64);
const VALID_EVENT_ID = 'b'.repeat(64);
const VALID_EVENT_ID_2 = 'c'.repeat(64);

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

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
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
      url: `/v1/social/feed/articles?ownerPubkey=${VALID_PUBKEY}&limit=20&until=1719000000`,
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
    const response = await app.inject({
      method: 'POST',
      url: '/v1/social/viewer-reactions',
      payload: {
        ownerPubkey: VALID_PUBKEY,
        eventIds: [VALID_EVENT_ID],
      },
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
    const response = await app.inject({
      method: 'POST',
      url: '/v1/social/viewer-zaps',
      payload: {
        ownerPubkey: VALID_PUBKEY,
        eventIds: [VALID_EVENT_ID],
      },
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
    const response = await app.inject({
      method: 'POST',
      url: '/v1/social/viewer-replies',
      payload: {
        ownerPubkey: VALID_PUBKEY,
        eventIds: [VALID_EVENT_ID],
      },
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
