// @vitest-environment node

import type { SimplePool } from 'nostr-tools';
import { describe, expect, it, vi } from 'vitest';

import { createIdentityService } from './identity.service';

const OWNER_PUBKEY = 'a'.repeat(64);
const PROFILE_PUBKEY = 'b'.repeat(64);
const PUBLIC_TEST_IP = '93.184.216.34';

const createPublicResolver = () => vi.fn(async () => [PUBLIC_TEST_IP]);

describe('identity service nip05 verification', () => {
  it('reuses cached results for repeated nip05 checks', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ names: { alice: OWNER_PUBKEY } }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      }),
    );

    const serviceOptions = {
      fetchImpl: fetchMock,
      resolveHostname: createPublicResolver(),
    };
    const service = createIdentityService(serviceOptions);

    const first = await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
    });
    const second = await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
    });

    expect(first.results[0]?.status).toBe('verified');
    expect(second.results[0]?.status).toBe('verified');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('evicts old nip05 success cache entries when the max entry limit is reached', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      const name = new URL(url).searchParams.get('name') ?? 'alice';
      return new Response(JSON.stringify({ names: { [name]: OWNER_PUBKEY } }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    });

    const service = createIdentityService({
      fetchImpl: fetchMock,
      resolveHostname: createPublicResolver(),
      nip05SuccessCacheMaxEntries: 1,
    });

    await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
    });
    await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'bob@example.com' }],
    });
    await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not start new nip05 fetches after the inflight limit is reached', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ names: { alice: OWNER_PUBKEY } }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      }),
    );
    const service = createIdentityService({
      fetchImpl: fetchMock,
      resolveHostname: createPublicResolver(),
      nip05InflightMaxEntries: 0,
    });

    const result = await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
    });

    expect(result.results[0]).toMatchObject({
      status: 'error',
      error: 'Too many in-flight NIP-05 checks',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns error status when nip05 request times out', async () => {
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          'abort',
          () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          },
          { once: true },
        );
      });
    });

    const serviceOptions = {
      fetchImpl: fetchMock,
      defaultNip05TimeoutMs: 10,
      resolveHostname: createPublicResolver(),
    };
    const service = createIdentityService(serviceOptions);

    const result = await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      timeoutMs: 10,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
    });

    expect(result.results[0]?.status).toBe('error');
    expect(result.results[0]?.error).toBeDefined();
  });

  it('returns error when nip05 dns resolution exceeds timeout', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ names: { alice: OWNER_PUBKEY } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const resolveHostname = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return [PUBLIC_TEST_IP];
    });
    const serviceOptions = {
      fetchImpl: fetchMock,
      defaultNip05TimeoutMs: 5,
      resolveHostname,
    };
    const service = createIdentityService(serviceOptions);

    const result = await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      timeoutMs: 5,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
    });

    expect(result.results[0]?.status).toBe('error');
    expect(result.results[0]?.error).toContain('aborted');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dedupes concurrent nip05 checks by identity key', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return new Response(JSON.stringify({ names: { alice: OWNER_PUBKEY } }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    });

    const serviceOptions = {
      fetchImpl: fetchMock,
      resolveHostname: createPublicResolver(),
    };
    const service = createIdentityService(serviceOptions);

    const [first, second] = await Promise.all([
      service.verifyNip05Batch({
        ownerPubkey: OWNER_PUBKEY,
        checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
      }),
      service.verifyNip05Batch({
        ownerPubkey: OWNER_PUBKEY,
        checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
      }),
    ]);

    expect(first.results[0]?.status).toBe('verified');
    expect(second.results[0]?.status).toBe('verified');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    'alice@localhost',
    'alice@localhost.localdomain',
    'alice@127.0.0.1',
    'alice@127.1.2.3',
    'alice@0.0.0.0',
    'alice@10.0.0.1',
    'alice@100.64.0.1',
    'alice@172.16.0.1',
    'alice@192.168.1.10',
    'alice@169.254.169.254',
    'alice@metadata.google.internal',
  ])('does not fetch unsafe nip05 identifier %s', async (nip05) => {
    const fetchMock = vi.fn<typeof fetch>();
    const service = createIdentityService({ fetchImpl: fetchMock });

    const result = await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      checks: [{ pubkey: OWNER_PUBKEY, nip05 }],
    });

    expect(result.results[0]?.status).toBe('unverified');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch nip05 hostnames that resolve to unsafe addresses', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const resolveHostname = vi.fn(async () => ['10.0.0.1']);
    const serviceOptions = { fetchImpl: fetchMock, resolveHostname };
    const service = createIdentityService(serviceOptions);

    const result = await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
    });

    expect(result.results[0]?.status).toBe('unverified');
    expect(resolveHostname).toHaveBeenCalledWith('example.com');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches a valid public nip05 hostname', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ names: { alice: OWNER_PUBKEY } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const serviceOptions = {
      fetchImpl: fetchMock,
      resolveHostname: createPublicResolver(),
    };
    const service = createIdentityService(serviceOptions);

    const result = await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
    });

    expect(result.results[0]?.status).toBe('verified');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/.well-known/nostr.json?name=alice',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('sets fetch redirect handling to error for nip05 requests', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ names: { alice: OWNER_PUBKEY } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const serviceOptions = {
      fetchImpl: fetchMock,
      resolveHostname: createPublicResolver(),
    };
    const service = createIdentityService(serviceOptions);

    await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('returns error for nip05 responses that are not json', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response('<html>not json</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    const serviceOptions = {
      fetchImpl: fetchMock,
      resolveHostname: createPublicResolver(),
    };
    const service = createIdentityService(serviceOptions);

    const result = await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
    });

    expect(result.results[0]?.status).toBe('error');
    expect(result.results[0]?.error).toContain('content-type');
  });

  it.each([
    'text/html; note=application/json',
    'text/plain; charset=+json',
  ])('returns error when nip05 response only mentions json in content-type parameters: %s', async (contentType) => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ names: { alice: OWNER_PUBKEY } }), {
        status: 200,
        headers: { 'content-type': contentType },
      }),
    );
    const serviceOptions = {
      fetchImpl: fetchMock,
      resolveHostname: createPublicResolver(),
    };
    const service = createIdentityService(serviceOptions);

    const result = await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
    });

    expect(result.results[0]?.status).toBe('error');
    expect(result.results[0]?.error).toContain('content-type');
  });

  it('returns error for oversized nip05 responses', async () => {
    const oversized = JSON.stringify({ names: { alice: OWNER_PUBKEY }, padding: 'x'.repeat(140_000) });
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(oversized, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const serviceOptions = {
      fetchImpl: fetchMock,
      resolveHostname: createPublicResolver(),
    };
    const service = createIdentityService(serviceOptions);

    const result = await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
    });

    expect(result.results[0]?.status).toBe('error');
    expect(result.results[0]?.error).toContain('too large');
  });

  it('stops reading chunked nip05 responses after the size limit', async () => {
    let chunksRead = 0;
    let canceled = false;
    const chunks = [new Uint8Array(100_000), new Uint8Array(40_000)];
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          const chunk = chunks[chunksRead];
          chunksRead += 1;
          if (chunk) {
            controller.enqueue(chunk);
            return;
          }

          throw new Error('read past size limit');
        },
        cancel() {
          canceled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const serviceOptions = {
      fetchImpl: fetchMock,
      resolveHostname: createPublicResolver(),
    };
    const service = createIdentityService(serviceOptions);

    const result = await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
    });

    expect(result.results[0]?.status).toBe('error');
    expect(result.results[0]?.error).toContain('too large');
    expect(chunksRead).toBe(2);
    expect(canceled).toBe(true);
  });
});

describe('identity service profile resolve', () => {
  it('uses profile cache for repeated resolve requests', async () => {
    const querySync = vi.fn(async () => [
      {
        id: 'c'.repeat(64),
        pubkey: PROFILE_PUBKEY,
        created_at: 1_719_000_100,
        content: JSON.stringify({
          name: 'alice',
          nip05: 'alice@example.com',
        }),
      },
    ]);
    const pool = { querySync } as unknown as SimplePool;

    const service = createIdentityService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
      profileCacheTtlMs: 60_000,
    });

    const first = await service.resolveProfiles({
      ownerPubkey: OWNER_PUBKEY,
      pubkeys: [PROFILE_PUBKEY],
    });
    const second = await service.resolveProfiles({
      ownerPubkey: OWNER_PUBKEY,
      pubkeys: [PROFILE_PUBKEY],
    });

    expect(first.profiles[PROFILE_PUBKEY]).toMatchObject({
      pubkey: PROFILE_PUBKEY,
      name: 'alice',
      nip05: 'alice@example.com',
    });
    expect(second.profiles[PROFILE_PUBKEY]?.pubkey).toBe(PROFILE_PUBKEY);
    expect(querySync).toHaveBeenCalledTimes(1);
  });

  it('evicts old profile cache entries when the max entry limit is reached', async () => {
    const firstPubkey = 'b'.repeat(64);
    const secondPubkey = 'c'.repeat(64);
    const querySync = vi.fn(async (_relays: string[], filter: { authors?: string[] }) =>
      (filter.authors ?? []).map((pubkey, index) => ({
        id: `${index}`.padStart(64, 'd'),
        pubkey,
        created_at: 1_719_000_100,
        content: JSON.stringify({ name: `user-${pubkey[0]}` }),
      })),
    );
    const pool = { querySync } as unknown as SimplePool;

    const service = createIdentityService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
      profileCacheTtlMs: 60_000,
      profileCacheMaxEntries: 1,
    });

    await service.resolveProfiles({ ownerPubkey: OWNER_PUBKEY, pubkeys: [firstPubkey] });
    await service.resolveProfiles({ ownerPubkey: OWNER_PUBKEY, pubkeys: [secondPubkey] });
    await service.resolveProfiles({ ownerPubkey: OWNER_PUBKEY, pubkeys: [firstPubkey] });

    expect(querySync).toHaveBeenCalledTimes(3);
  });

  it('does not start new profile queries after the batch inflight limit is reached', async () => {
    const querySync = vi.fn(async () => []);
    const pool = { querySync } as unknown as SimplePool;

    const service = createIdentityService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
      profileBatchInflightMaxEntries: 0,
    });

    const result = await service.resolveProfiles({
      ownerPubkey: OWNER_PUBKEY,
      pubkeys: [PROFILE_PUBKEY],
    });

    expect(result.profiles[PROFILE_PUBKEY]).toEqual({
      pubkey: PROFILE_PUBKEY,
      createdAt: 0,
    });
    expect(querySync).not.toHaveBeenCalled();
  });
});
