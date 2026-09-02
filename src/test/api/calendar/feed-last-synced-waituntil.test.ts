/**
 * Feed route — the `last_synced_at` stamp survives a Vercel function freeze.
 *
 * Until 2026-09-02 the route `void`ed this write with no rejection handler and
 * no platform registration. On Vercel the function freezes once the response
 * is sent, the in-flight PostgREST fetch dies, and the orphaned promise
 * rejected as an unhandled "fetch failed" (Sentry rel:cd27d9ac). These tests
 * pin the replacement: the write is handed to the platform's waitUntil, the
 * response never waits on it, and a failing write is logged — never thrown,
 * never left to reject unobserved.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  logServerError: vi.fn(async (..._args: unknown[]) => {}),
  logServerException: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: mocks.logServerError,
  logServerException: mocks.logServerException,
}));

type UpdateOutcome =
  | { kind: 'resolve'; value: unknown }
  | { kind: 'reject'; reason: unknown }
  | { kind: 'pending'; promise: Promise<unknown> };

let updateOutcome: UpdateOutcome = { kind: 'resolve', value: { data: null, error: null } };
const updateSpy = vi.fn();
const updateEqSpy = vi.fn();

/**
 * A PostgREST builder is a thenable, not a Promise. The rejected case builds
 * its promise lazily inside `then` so the rejection exists only once the
 * route has attached a handler — a mock that rejected eagerly could trip the
 * unhandled-rejection detector on its own and blur what is being proven.
 */
function updateThenable(): PromiseLike<unknown> {
  return {
    then(onfulfilled, onrejected) {
      const outcome = updateOutcome;
      const p =
        outcome.kind === 'resolve'
          ? Promise.resolve(outcome.value)
          : outcome.kind === 'reject'
            ? Promise.reject(outcome.reason)
            : outcome.promise;
      return p.then(onfulfilled, onrejected);
    },
  };
}

function feedsBuilder(token: string) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => ({
      data: {
        id: 'feed-1',
        feed_token: token,
        feed_type: 'all_events',
        team_id: 'team-1',
        user_id: 'user-1',
        name: 'Team Feed',
        is_active: true,
        last_synced_at: null,
      },
      error: null,
    })),
    update: vi.fn((patch: unknown) => {
      updateSpy(patch);
      return {
        eq: vi.fn((col: string, val: unknown) => {
          updateEqSpy(col, val);
          return updateThenable();
        }),
      };
    }),
  };
  return builder;
}

function eventsBuilder() {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(async () => ({ data: [], error: null })),
  };
  return builder;
}

function settingsBuilder() {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: { timezone: 'America/New_York' }, error: null })),
  };
  return builder;
}

function makeClient(token: string) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'golf_calendar_feeds') return feedsBuilder(token);
      if (table === 'golf_events') return eventsBuilder();
      if (table === 'golf_team_settings') return settingsBuilder();
      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: vi.fn(async () => ({ data: true, error: null })),
  };
}

let currentClient: ReturnType<typeof makeClient>;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => currentClient,
}));

import { __setVercelRequestContextForTests } from '@/lib/observability/vercel-wait-until';
import { GET } from '@/app/api/calendar/feeds/[token]/route';

// Distinct token per test so the route's module-level rate limiter never
// trips across tests in this file.
let tokenCounter = 0;
let TOKEN = '';

async function callRoute(): Promise<Response> {
  return GET(new Request(`http://x/api/calendar/feeds/${TOKEN}`) as never, {
    params: Promise.resolve({ token: TOKEN }),
  });
}

function handedToPlatform(waitUntil: ReturnType<typeof vi.fn>): Promise<unknown> {
  expect(waitUntil).toHaveBeenCalledTimes(1);
  const handed = waitUntil.mock.calls[0]![0] as Promise<unknown>;
  expect(handed).toBeInstanceOf(Promise);
  return handed;
}

describe('ICS team feed route — last_synced_at write is registered with waitUntil and never rejects', () => {
  beforeEach(() => {
    tokenCounter += 1;
    TOKEN = `synctoken${String(tokenCounter).padStart(4, '0')}`.padEnd(40, 'f');
    updateOutcome = { kind: 'resolve', value: { data: null, error: null } };
    currentClient = makeClient(TOKEN);
  });

  afterEach(() => {
    __setVercelRequestContextForTests(null);
    vi.clearAllMocks();
  });

  it("hands the write to the platform's waitUntil and answers without waiting for it", async () => {
    const waitUntil = vi.fn();
    __setVercelRequestContextForTests({ waitUntil });
    let release!: (value: unknown) => void;
    updateOutcome = {
      kind: 'pending',
      promise: new Promise((resolve) => {
        release = resolve;
      }),
    };

    const res = await callRoute();

    // The response is here and the write has not settled: the route did not
    // block on it.
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
    const handed = handedToPlatform(waitUntil);
    expect(updateSpy).toHaveBeenCalledWith({ last_synced_at: expect.any(String) });
    expect(updateEqSpy).toHaveBeenCalledWith('id', 'feed-1');

    release({ data: null, error: null });
    await expect(handed).resolves.toBeUndefined();
    expect(mocks.logServerError).not.toHaveBeenCalled();
    expect(mocks.logServerException).not.toHaveBeenCalled();
  });

  it('a write whose fetch dies is logged, and the promise handed to the platform never rejects', async () => {
    const waitUntil = vi.fn();
    __setVercelRequestContextForTests({ waitUntil });
    updateOutcome = { kind: 'reject', reason: new TypeError('fetch failed') };

    const res = await callRoute();
    expect(res.status).toBe(200);

    // THE invariant. A rejection here is the Sentry issue, verbatim.
    await expect(handedToPlatform(waitUntil)).resolves.toBeUndefined();

    expect(mocks.logServerException).toHaveBeenCalledTimes(1);
    const [error, context] = mocks.logServerException.mock.calls[0]!;
    expect((error as Error).message).toBe('fetch failed');
    expect(context).toMatchObject({
      action: 'calendarFeedApi.get.recordSync',
      route: '/api/calendar/feeds/[token]',
      source: 'route_handler',
      handled: true,
      teamId: 'team-1',
    });
    // The feed_token is a path-segment credential; it must never reach a log.
    expect(JSON.stringify(context)).not.toContain(TOKEN);
  });

  it('a write that resolves with a PostgREST error is logged as a warning, not thrown', async () => {
    const waitUntil = vi.fn();
    __setVercelRequestContextForTests({ waitUntil });
    updateOutcome = {
      kind: 'resolve',
      value: {
        data: null,
        error: { message: 'canceling statement due to statement timeout', code: '57014' },
      },
    };

    const res = await callRoute();
    expect(res.status).toBe(200);
    await expect(handedToPlatform(waitUntil)).resolves.toBeUndefined();

    expect(mocks.logServerException).not.toHaveBeenCalled();
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
    const [message, context, severity] = mocks.logServerError.mock.calls[0]!;
    expect(message).toContain('last_synced_at');
    expect(message).toContain('statement timeout');
    expect(severity).toBe('warning');
    expect(context).toMatchObject({ errorCode: '57014', teamId: 'team-1' });
  });

  it('outside Vercel there is no waitUntil to register with, and a failing write still cannot reject', async () => {
    // No request context installed: vercelWaitUntil reports false and the
    // write runs detached, which is fine on a plain Node server that never
    // freezes — but it must still be caught. Vitest fails this file on any
    // unhandled rejection, so the assertion below is the handled half.
    updateOutcome = { kind: 'reject', reason: new TypeError('fetch failed') };

    const res = await callRoute();
    expect(res.status).toBe(200);

    await vi.waitFor(() => expect(mocks.logServerException).toHaveBeenCalledTimes(1));
  });
});
