# Nostr UI Timeouts Budget Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Nostr UI routes from failing in the browser before the Fastify BFF can return partial, fallback, or empty responses.

**Architecture:** Keep both frontend and backend timeouts, but make their budgets ordered and explicit. Relay reads should have short `maxWaitMs` budgets, backend gateways should finish below the frontend HTTP timeout, and the frontend timeout should remain a final safety net for network, proxy, or server hangs.

**Tech Stack:** TypeScript, Fastify BFF, nostr-tools `SimplePool`, custom relay query executor, React 19, TanStack Query, Vitest, pnpm.

**Important Constraint:** Do not commit during execution unless the user explicitly asks. This repository's AGENTS.md overrides generic planning advice about frequent commits.

---

## Current Failure Mode

The active profile dialog feed commonly reaches the empty retry state because the frontend aborts before the backend fallback can answer.

Observed chain:

- `src/nostr-overlay/components/OccupantProfileDialog.tsx` renders `profile.feed.errorTitle` when `postsError` exists and no posts are available.
- `src/nostr-overlay/query/active-profile.query.ts` gets `postsError` from the active profile posts query.
- `src/nostr-overlay/hooks/useNostrOverlay.ts` maps active profile posts to `graphApiService.loadPosts`.
- `src/nostr-api/graph-api-service.ts` calls `GET /content/posts`.
- `src/nostr-api/http-client.ts` aborts requests after `10_000ms` by default.
- `server/src/modules/content/content.service.ts` currently lets content relay gateways wait up to `12_000ms`.

This ordering is wrong for UI routes:

```text
relay/default backend work can run for 10s-12s
frontend aborts at 10s
backend fallback response may never reach the UI
```

The profile `Following` tab often eventually loads because its follows path already uses shorter budgets through Graph and `contact-list-resolver`, and followers failures are converted into partial data. The profile `Feed` path did not receive the same hardening.

## Timeout Policy

Use this ordering for user-facing request/response endpoints:

```text
relay query maxWaitMs < backend gateway timeout < frontend HTTP timeout < infra/proxy timeout
```

Recommended starting budgets:

| Layer | Budget |
| --- | --- |
| Author relay metadata discovery, kind 10002/kind 3 | `2_000ms` |
| `/content/posts` relay event query | `3_500ms` |
| `/content/profile-stats` relay event queries | `3_500ms` to `5_000ms` |
| `/graph/followers` relay event queries | `3_500ms` |
| Backend gateway timeout for UI endpoints | `8_000ms` |
| Frontend HTTP default timeout | Keep `10_000ms` initially |
| SSE streams | Keep `timeoutMs: 0` |

The frontend timeout is still useful even if the backend has timeouts. It protects the browser from a down BFF, a broken proxy, a route handler bug before backend timeout setup, a stalled TCP connection, or any endpoint that is not backed by relay gateway timeouts. The backend timeout protects server resources and defines domain fallback behavior.

## File Map

| File | Responsibility In This Plan |
| --- | --- |
| `server/src/relay/author-relay-directory.ts` | Keep author relay metadata discovery from consuming the whole UI budget before posts are fetched. |
| `server/src/relay/author-relay-directory.test.ts` | Prove author metadata lookups pass `maxWaitMs` to the relay executor. |
| `server/src/modules/content/content.service.ts` | Apply explicit UI budgets to active profile posts and profile stats. |
| `server/src/modules/content/content.service.test.ts` | Regression tests for posts/profile-stats budgets and fallbacks. |
| `server/src/modules/graph/graph.service.ts` | Apply explicit shorter budgets to followers discovery. |
| `server/src/modules/graph/graph.service.test.ts` | Regression tests for followers timeout budget and fallback response. |
| `server/src/services/app-services.ts` | Optionally inject the shared contact list resolver into Content if profile stats reuses it. |
| `server/src/services/app-services.test.ts` | Prove Graph, Social, and Content share contact-list loading where needed. |
| `src/nostr-overlay/hooks/useNostrOverlay.ts` | Optional frontend orchestration improvement for active profile network loading. |
| `src/nostr-overlay/query/active-profile.query.test.ts` | Optional frontend regression coverage if active profile query orchestration changes. |
| `src/nostr-api/http-client.ts` | Inspect only. Do not raise the default timeout unless backend budgets cannot be brought below it. |
| `src/nostr-api/http-client.test.ts` | Verify timeout behavior if endpoint-specific client timeout changes are added. |

## Chunk 1: Author Relay Directory Budgets

Recommended skills: `nostr-specialist`, `fastify-best-practices`, `systematic-debugging`, `vitest`.

### Task 1: Add Tests For Author Relay Lookup Budgets

**Files:**

- Modify: `server/src/relay/author-relay-directory.test.ts`
- Modify: `server/src/relay/author-relay-directory.ts`

- [ ] **Step 1: Write the failing maxWaitMs test**

Add this test under `describe('createAuthorRelayDirectory', ...)`:

```ts
it('passes a bounded maxWaitMs to author relay metadata lookups', async () => {
  const query = vi.fn(async <TEvent>() => [] as TEvent[]);
  const pool = { querySync: vi.fn(async () => []) } as unknown as SimplePool;
  const directory = createAuthorRelayDirectory({
    pool,
    bootstrapRelays: ['wss://bootstrap.one'],
    defaultMaxWaitMs: 25,
    relayQueryExecutor: {
      query: query as RelayQueryExecutor['query'],
      queryMany: vi.fn() as RelayQueryExecutor['queryMany'],
    },
  });

  await expect(directory.getAuthorReadRelays(AUTHOR_PUBKEY)).resolves.toEqual([]);

  expect(query).toHaveBeenNthCalledWith(1, expect.objectContaining({
    relays: ['wss://bootstrap.one'],
    maxWaitMs: 25,
    filter: expect.objectContaining({ kinds: [10002] }),
  }));
  expect(query).toHaveBeenNthCalledWith(2, expect.objectContaining({
    relays: ['wss://bootstrap.one'],
    maxWaitMs: 25,
    filter: expect.objectContaining({ kinds: [3] }),
  }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project backend server/src/relay/author-relay-directory.test.ts
```

Expected: FAIL because `defaultMaxWaitMs` is not accepted and `maxWaitMs` is not passed.

- [ ] **Step 3: Implement minimal budget support**

In `server/src/relay/author-relay-directory.ts`, add:

```ts
const DEFAULT_MAX_WAIT_MS = 2_000;
```

Extend `CreateAuthorRelayDirectoryOptions`:

```ts
defaultMaxWaitMs?: number;
```

Inside `createAuthorRelayDirectory`:

```ts
const defaultMaxWaitMs = Math.max(1, Math.floor(options.defaultMaxWaitMs ?? DEFAULT_MAX_WAIT_MS));
```

Pass it into both metadata queries:

```ts
const relayListEvents = await relayQueryExecutor.query<NostrEventLike>({
  relays: options.bootstrapRelays,
  maxWaitMs: defaultMaxWaitMs,
  filter: {
    authors: [normalizedPubkey],
    kinds: [10002],
    limit: 1,
  },
});
```

```ts
const kind3Events = await relayQueryExecutor.query<NostrEventLike>({
  relays: options.bootstrapRelays,
  maxWaitMs: defaultMaxWaitMs,
  filter: {
    authors: [normalizedPubkey],
    kinds: [3],
    limit: 1,
  },
});
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project backend server/src/relay/author-relay-directory.test.ts
```

Expected: PASS.

## Chunk 2: Profile Feed Posts Budget

Recommended skills: `nostr-specialist`, `fastify-best-practices`, `test-driven-development`, `vitest`.

### Task 2: Bound `/content/posts`

**Files:**

- Modify: `server/src/modules/content/content.service.ts`
- Modify: `server/src/modules/content/content.service.test.ts`

- [ ] **Step 1: Write the failing relay maxWait test**

Add a test near the existing post lookup tests in `content.service.test.ts`:

```ts
it('uses a short relay budget for active profile post lookups', async () => {
  const query = vi.fn(async <TEvent>() => [
    {
      id: '8'.repeat(64),
      pubkey: TARGET_PUBKEY,
      created_at: 30,
      tags: [],
      content: 'bounded post',
    } as TEvent,
  ]);
  const pool = { querySync: vi.fn(async () => []) } as unknown as SimplePool;

  const service = createContentService({
    pool,
    bootstrapRelays: ['wss://bootstrap.one'],
    relayQueryExecutor: { query, queryMany: vi.fn() } as RelayQueryExecutor,
    authorRelayDirectory: {
      getAuthorReadRelays: vi.fn(async () => ['wss://relay.author']),
      getAuthorWriteRelays: vi.fn(async () => []),
    },
  });

  await service.getPosts({
    ownerPubkey: OWNER_PUBKEY,
    pubkey: TARGET_PUBKEY,
    limit: 10,
    scopedReadRelays: ['wss://owner.scope'],
  });

  expect(query).toHaveBeenCalledWith(expect.objectContaining({
    relays: expect.any(Array),
    maxWaitMs: 3_500,
    filter: expect.objectContaining({
      authors: [TARGET_PUBKEY],
      kinds: [1],
    }),
  }));
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project backend server/src/modules/content/content.service.test.ts
```

Expected: FAIL because post lookups do not pass `maxWaitMs` yet.

- [ ] **Step 3: Add content timeout constants**

In `server/src/modules/content/content.service.ts`, replace the single content timeout with explicit constants:

```ts
const DEFAULT_RELAY_QUERY_TIMEOUT_MS = 8_000;
const CONTENT_POSTS_RELAY_QUERY_MAX_WAIT_MS = 3_500;
```

Keep `DEFAULT_RELAY_QUERY_TIMEOUT_MS` as the gateway timeout used by `createRelayGateway`.

- [ ] **Step 4: Pass maxWaitMs to post relay queries**

In `fetchPosts`, update the relay query:

```ts
return options.relayQueryExecutor.query<NostrEventLike>({
  relays,
  signal: context.signal,
  maxWaitMs: CONTENT_POSTS_RELAY_QUERY_MAX_WAIT_MS,
  filter: {
    authors: [pubkey],
    kinds: [1],
    until,
    limit: query.limit + 1,
  },
});
```

- [ ] **Step 5: Keep the existing timeout fallback**

Do not remove this behavior in `GatewayContentService.getPosts`:

```ts
if (!isRelayGatewayTimeoutError(error)) {
  throw error;
}

return {
  posts: [],
  nextUntil: null,
  hasMore: false,
};
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project backend server/src/modules/content/content.service.test.ts
```

Expected: PASS.

## Chunk 3: Profile Stats Budget And Shared Contact List

Recommended skills: `nostr-specialist`, `fastify-best-practices`, `solid`, `vitest`.

### Task 3: Bound `/content/profile-stats`

**Files:**

- Modify: `server/src/modules/content/content.service.ts`
- Modify: `server/src/modules/content/content.service.test.ts`
- Modify: `server/src/services/app-services.ts`
- Modify: `server/src/services/app-services.test.ts`

- [ ] **Step 1: Write a failing maxWait test for stats relay queries**

Add a test in `content.service.test.ts`:

```ts
it('uses bounded relay budgets for profile stats lookups', async () => {
  const follower = 'c'.repeat(64);
  const query = vi.fn(async <TEvent>(request: Parameters<RelayQueryExecutor['query']>[0]) => {
    const filter = request.filter as Record<string, unknown>;
    if (Array.isArray(filter.authors) && filter.authors.includes(TARGET_PUBKEY)) {
      return [{
        id: '6'.repeat(64),
        pubkey: TARGET_PUBKEY,
        created_at: 100,
        tags: [['p', 'd'.repeat(64)]],
        content: '',
      } as TEvent];
    }

    if (Array.isArray(filter['#p'])) {
      return [{
        id: '7'.repeat(64),
        pubkey: follower,
        created_at: 90,
        tags: [['p', TARGET_PUBKEY]],
        content: '',
      } as TEvent];
    }

    return [] as TEvent[];
  });

  const service = createContentService({
    pool: { querySync: vi.fn(async () => []) } as unknown as SimplePool,
    bootstrapRelays: ['wss://bootstrap.one'],
    relayQueryExecutor: { query, queryMany: vi.fn() } as RelayQueryExecutor,
  });

  await service.getProfileStats({
    ownerPubkey: OWNER_PUBKEY,
    pubkey: TARGET_PUBKEY,
    candidateAuthors: follower,
    scopedReadRelays: ['wss://relay.stats'],
  });

  expect(query).toHaveBeenCalledWith(expect.objectContaining({ maxWaitMs: expect.any(Number) }));
  for (const call of query.mock.calls) {
    expect(call[0].maxWaitMs).toBeLessThanOrEqual(5_000);
  }
});
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project backend server/src/modules/content/content.service.test.ts
```

Expected: FAIL because stats queries do not pass bounded `maxWaitMs` yet.

- [ ] **Step 3: Add profile stats relay budget**

In `content.service.ts`, add:

```ts
const PROFILE_STATS_RELAY_QUERY_MAX_WAIT_MS = 3_500;
```

Pass it to the kind `3` query and to `discoverFollowers` query callbacks:

```ts
const events = await options.relayQueryExecutor.query<NostrEventLike>({
  relays,
  signal: context.signal,
  maxWaitMs: PROFILE_STATS_RELAY_QUERY_MAX_WAIT_MS,
  filter: {
    authors: [targetPubkey],
    kinds: [3],
    limit: 1,
  },
});
```

```ts
return options.relayQueryExecutor.query<NostrEventLike>({
  relays,
  filter,
  signal: context.signal,
  maxWaitMs: PROFILE_STATS_RELAY_QUERY_MAX_WAIT_MS,
});
```

- [ ] **Step 4: Consider shared contact list resolver only if stats still duplicate contact-list queries**

If manual or test evidence shows `profile-stats` duplicates the same target kind `3` query as Graph or Social, add `contactListResolver?: ContactListResolver` to `ContentServiceOptions` and inject it from `createAppServices`.

Do not add this abstraction speculatively if the budget fix resolves the profile feed issue.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project backend server/src/modules/content/content.service.test.ts server/src/services/app-services.test.ts
```

Expected: PASS.

## Chunk 4: Graph Followers Budget

Recommended skills: `nostr-specialist`, `fastify-best-practices`, `vitest`.

### Task 4: Bound `/graph/followers`

**Files:**

- Modify: `server/src/modules/graph/graph.service.ts`
- Modify: `server/src/modules/graph/graph.service.test.ts`

- [ ] **Step 1: Write failing followers budget test**

Add a test near follower discovery tests in `graph.service.test.ts`:

```ts
it('uses a short relay budget for followers discovery queries', async () => {
  const follower = 'c'.repeat(64);
  const query = vi.fn(async <TEvent>(request: Parameters<RelayQueryExecutor['query']>[0]) => {
    const filter = request.filter as Record<string, unknown>;
    if (Array.isArray(filter['#p'])) {
      return [{
        id: '5'.repeat(64),
        pubkey: follower,
        created_at: 90,
        tags: [['p', TARGET_PUBKEY]],
        content: '',
      } as TEvent];
    }

    return [] as TEvent[];
  });

  const service = createGraphService({
    pool: { querySync: vi.fn(async () => []) } as unknown as SimplePool,
    bootstrapRelays: ['wss://bootstrap.one'],
    relayQueryExecutor: { query, queryMany: vi.fn() } as RelayQueryExecutor,
  });

  await service.getFollowers({
    ownerPubkey: OWNER_PUBKEY,
    pubkey: TARGET_PUBKEY,
    candidateAuthors: follower,
    scopedReadRelays: ['wss://relay.one'],
  });

  expect(query).toHaveBeenCalledWith(expect.objectContaining({
    maxWaitMs: 3_500,
  }));
});
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project backend server/src/modules/graph/graph.service.test.ts
```

Expected: FAIL because follower discovery does not pass `maxWaitMs` yet.

- [ ] **Step 3: Add graph followers budget constants**

In `graph.service.ts`:

```ts
const DEFAULT_FOLLOWERS_RELAY_QUERY_TIMEOUT_MS = 8_000;
const FOLLOWERS_RELAY_QUERY_MAX_WAIT_MS = 3_500;
```

- [ ] **Step 4: Pass maxWaitMs inside followers discovery**

In the `discoverFollowers` `queryEvents` callback:

```ts
return options.relayQueryExecutor.query<NostrEventLike>({
  relays,
  filter,
  signal: context.signal,
  maxWaitMs: FOLLOWERS_RELAY_QUERY_MAX_WAIT_MS,
});
```

- [ ] **Step 5: Preserve fallback behavior**

Do not remove the existing catch in `GatewayGraphService.getFollowers`:

```ts
return {
  pubkey: normalizePubkey(query.pubkey),
  followers: [],
  complete: false,
};
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project backend server/src/modules/graph/graph.service.test.ts
```

Expected: PASS.

## Chunk 5: Active Profile Network Orchestration

Recommended skills: `frontend-specialist`, `react-best-practices`, `vitest`.

### Task 5: Only Change Frontend Orchestration If The Backend Fix Is Not Enough

**Files:**

- Inspect: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Test if modified: `src/nostr-overlay/query/active-profile.query.test.ts` or the narrowest existing `useNostrOverlay` test

- [ ] **Step 1: Manually verify after Chunks 1-4 first**

Start the stack:

```bash
make dev
```

Open the profile that failed and check the `Feed` and `Following` tabs.

Expected: no frontend `Request timed out after 10000ms` for `/content/posts`, `/content/profile-stats`, or `/graph/followers`.

- [ ] **Step 2: If Following is still slow, add a frontend test with deferred promises**

Test intent:

```ts
// Arrange loadFollows to resolve, keep loadFollowers pending, and verify follows can be exposed
// without requiring followers to finish first.
```

Use existing active-profile query tests as the model. Prefer behavior assertions over implementation details.

- [ ] **Step 3: Keep changes minimal**

If needed, reorganize `activeProfileService.loadNetwork` in `useNostrOverlay.ts` so independent work starts earlier:

```ts
const followsPromise = graphApiService.loadFollows(...);
const followersPromise = graphApiService.loadFollowers(...).catch(...);
const relaySuggestionsPromise = loadProfileRelaySuggestions(...).catch(...);

const followsResult = await followsPromise;
const [followersResult, relaySuggestionsByType] = await Promise.all([
  followersPromise,
  relaySuggestionsPromise,
]);
```

Do not split the public query shape unless tests show a clear UI need.

- [ ] **Step 4: Run frontend focused tests if modified**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/query/active-profile.query.test.ts
```

Expected: PASS.

## Chunk 6: Frontend HTTP Timeout Policy

Recommended skills: `systematic-debugging`, `vitest`.

### Task 6: Keep Frontend Timeout As Safety Net

**Files:**

- Inspect: `src/nostr-api/http-client.ts`
- Test if modified: `src/nostr-api/http-client.test.ts`

- [ ] **Step 1: Do not raise `DEFAULT_TIMEOUT_MS` as the first fix**

The current default is:

```ts
const DEFAULT_TIMEOUT_MS = 10_000;
```

Keep it initially. Backend UI endpoints should answer before this.

- [ ] **Step 2: Preserve stream exceptions**

Confirm these long-lived streams keep explicit timeout disablement:

- `src/nostr-api/social-notifications-api-service.ts` uses `timeoutMs: 0` for `/notifications/stream`.
- `src/nostr-api/dm-api-service.ts` uses `timeoutMs: 0` for DM stream subscription.

- [ ] **Step 3: Only add endpoint-specific client timeout if backend evidence requires it**

If a specific non-stream endpoint must legitimately run over 10 seconds, set it on that call only:

```ts
await client.getJson<ResponseDto>('/some/path', {
  query: {...},
  timeoutMs: 15_000,
});
```

Do not make this change for `/content/posts`; the correct fix is backend budgeting.

- [ ] **Step 4: Run focused tests if modified**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-api/http-client.test.ts
```

Expected: PASS.

## Chunk 7: Secondary Timeout Audit

Recommended skills: `systematic-debugging`, `fastify-best-practices`, `nostr-specialist`.

### Task 7: Audit Similar Endpoints Without Expanding The First Fix

**Files:**

- Inspect: `server/src/modules/social/social.service.ts`
- Inspect: `server/src/modules/dm/dm.service.ts`
- Inspect: `server/src/modules/notifications/notifications.service.ts`
- Inspect: `server/src/modules/users/users.service.ts`

- [ ] **Step 1: Confirm social feed and articles already have short budgets**

`server/src/modules/social/social.service.ts` already has:

```ts
const FEED_RELAY_QUERY_MAX_WAIT_MS = 3_500;
const ARTICLE_DETAIL_RELAY_QUERY_MAX_WAIT_MS = 2_500;
```

Do not change these unless tests or manual checks show failures.

- [ ] **Step 2: Review thread and engagement separately**

Thread and engagement do not block first render of the profile feed. Treat them as follow-up work unless opening threads or metrics show frontend timeouts.

- [ ] **Step 3: Review DM, notifications, and user search separately**

These routes use the relay executor and gateway defaults in several places. Do not include them in the profile-feed fix unless there are reproducible failures.

- [ ] **Step 4: Record any findings in a follow-up plan**

If audit finds repeated symptoms, create a separate plan instead of mixing it into this profile timeout fix.

## Verification

Recommended skills: `verification-before-completion`, `playwright-best-practices`.

### Focused Automated Verification

Run backend tests touched by the first implementation scope:

```bash
pnpm exec vitest run --config vitest.config.mts --project backend server/src/relay/author-relay-directory.test.ts server/src/modules/content/content.service.test.ts server/src/modules/graph/graph.service.test.ts server/src/services/app-services.test.ts
```

Run frontend tests only if frontend files changed:

```bash
pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-api/http-client.test.ts src/nostr-overlay/query/active-profile.query.test.ts
```

Run type/lint checks for changed areas:

```bash
pnpm lint:server
pnpm typecheck:server
```

If frontend files changed:

```bash
pnpm lint:frontend
pnpm typecheck:frontend
```

### Manual Verification

- [ ] Start the stack with `make dev`.
- [ ] Open the active profile dialog for the profile that was failing, for example BTC Sessions.
- [ ] Open the `Feed` tab.
- [ ] Confirm `/v1/content/posts` returns before `10s`.
- [ ] Confirm the UI does not show `No se pudo cargar el feed` for normal slow relay behavior.
- [ ] Open `Following`.
- [ ] Confirm `/v1/graph/followers` and `/v1/content/profile-stats` do not produce frontend `Request timed out after 10000ms`.
- [ ] Confirm SSE streams still work and are not aborted by the default HTTP timeout.

## Recommended Initial Scope

Implement only these chunks first:

- Chunk 1: Author relay directory budgets.
- Chunk 2: `/content/posts` budget.
- Chunk 3: `/content/profile-stats` budget, without shared resolver unless tests show duplicate contact-list loading.
- Chunk 4: `/graph/followers` budget.
- Automated backend verification.
- Manual profile dialog check.

Defer Chunk 5 unless `Following` still feels slow after backend budgets are fixed. Defer Chunk 7 into a separate follow-up unless there are reproducible timeouts in those areas.
