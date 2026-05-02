// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../app';
import type { GroupsService } from './groups.service';

describe('groups routes', () => {
  const getRelayGroups = vi.fn(async () => ({
    relay: 'wss://groups.example',
    verifiedRelaySelf: true,
    groups: [
      {
        relay: 'wss://groups.example',
        id: 'maps',
        name: 'Map makers',
        private: false,
        restricted: false,
        hidden: false,
        closed: false,
        metadataVerified: true,
      },
    ],
  }));

  const app = buildApp({
    groupsService: { getRelayGroups } as GroupsService,
  });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns public relay group discovery without auth or owner identity', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/groups/relay-groups?relay=${encodeURIComponent('wss://groups.example')}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      relay: 'wss://groups.example',
      verifiedRelaySelf: true,
      groups: [
        {
          relay: 'wss://groups.example',
          id: 'maps',
          name: 'Map makers',
          private: false,
          restricted: false,
          hidden: false,
          closed: false,
          metadataVerified: true,
        },
      ],
    });
    expect(getRelayGroups).toHaveBeenLastCalledWith({ relay: 'wss://groups.example' });
  });

  it('rejects user identity fields in the public discovery query', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/groups/relay-groups?relay=${encodeURIComponent('wss://groups.example')}&ownerPubkey=${'a'.repeat(64)}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
  });
});
