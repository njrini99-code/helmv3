import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { classifySourceFreshness, summarizeTelemetryHealth } from '../freshness';
import { REPLAY_FIXTURES } from '../__fixtures__/replay-fixtures';

/**
 * Fault injection of the OBSERVABILITY SYSTEM ITSELF - brief 59.
 *
 * Every test here breaks a piece of observability and asserts two things
 * that must both hold:
 *
 *   1. The PRODUCT path continues. Telemetry never becomes a new failure for
 *      the user's action to handle.
 *   2. The OBSERVABILITY SURFACE marks itself degraded or unknown. It must
 *      never render green off the back of a read that did not happen -
 *      "no telemetry" is not "no errors".
 *
 * The second half is the one that is easy to get wrong, because a fail-open
 * module that returns an empty result and a fail-open module that returns an
 * empty result AND says so look identical from the caller's side until an
 * incident.
 */

const FIVE_MINUTES_MS = 5 * 60_000;
const NOW = new Date('2026-09-03T12:00:00.000Z');

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock('@/lib/supabase/admin');
  vi.doUnmock('@sentry/nextjs');
  vi.doUnmock('../../metrics');
});

/** A recorder client whose RPC resolves with the given PostgREST-shaped error. */
function clientRejectingWith(error: { code: string; message: string }) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({ data: null, error });
    },
  };
}

/**
 * The 40P01 replay fixture's INPUT, narrowed to the observe-result shape.
 * `ReplayFixture` is a union over two code paths, so the narrowing is a
 * runtime check rather than a cast - a fixture renamed or re-pathed fails
 * loudly here instead of silently spreading the wrong object.
 */
function anActionableError() {
  const fixture = REPLAY_FIXTURES.find((f) => f.id === 'deadlock_40P01');
  if (!fixture || fixture.path !== 'observe_result') {
    throw new Error('the deadlock_40P01 fixture is missing or is no longer an observe_result fixture');
  }
  return fixture.input;
}

describe('fault: the collector grant was revoked', () => {
  it('records nothing, reports the failure, and never throws into the caller', async () => {
    const { recordDbErrorOutOfBand } = await import('../record-db-error');
    const { observeSupabaseResult } = await import('../observe-result');

    const client = clientRejectingWith({ code: '42501', message: 'permission denied for function record_db_error_event' });
    const input = anActionableError();

    // The product path first: the observer still classifies and returns.
    const outcome = observeSupabaseResult({
      ...input,
      environment: 'fault',
      runtime: 'node',
      releaseSha: null,
      recorderClient: client,
    });
    expect(outcome.observed).toBe(true);
    expect(outcome.bucket).toBe('actionable_error');

    // The observability write itself: a clean, reported failure - NOT a
    // silent success, and NOT the migration-not-applied no-op (a revoked
    // grant is a real problem someone must fix).
    const result = await recordDbErrorOutOfBand(outcome.envelope!, { client });
    expect(result.ok).toBe(false);
    expect(result.skipped).toBeUndefined();
    expect(result.failure).toContain('permission denied');
  });
});

describe('fault: the observability table does not exist', () => {
  it('degrades to a clean no-op instead of logging a failure on every error', async () => {
    const { recordDbErrorOutOfBand } = await import('../record-db-error');
    const { observeSupabaseResult } = await import('../observe-result');
    const input = anActionableError();
    const client = clientRejectingWith({ code: '42P01', message: 'relation "helm_debug.db_error_events" does not exist' });

    const outcome = observeSupabaseResult({
      ...input,
      environment: 'fault',
      runtime: 'node',
      releaseSha: null,
      recorderClient: client,
    });
    const result = await recordDbErrorOutOfBand(outcome.envelope!, { client });

    // `ok: true` here means "correctly did nothing", which is why `skipped`
    // exists - a caller must be able to tell it apart from a real write.
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe('migration-not-applied');
    expect(result.errorId).toBeUndefined();
  });

  it('does not let a missing table make the surface look healthy', () => {
    // The write degraded cleanly, but the READ must still say so. A source
    // whose table is absent is blind, and a blind required source is red.
    const state = classifySourceFreshness({
      lastSampleAt: null,
      expectedIntervalMs: FIVE_MINUTES_MS,
      now: NOW,
      readable: false,
    });
    expect(state).toBe('blind');
    expect(summarizeTelemetryHealth([{ name: 'db_error_events', state, required: true }])).toBe('red');
  });
});

describe('fault: Sentry is unavailable', () => {
  it('keeps the Realtime subscription working when capture throws', async () => {
    vi.doMock('@sentry/nextjs', () => ({
      captureMessage: vi.fn(() => {
        throw new Error('Sentry transport down');
      }),
      captureException: vi.fn(() => {
        throw new Error('Sentry transport down');
      }),
      addBreadcrumb: vi.fn(() => {
        throw new Error('Sentry transport down');
      }),
      withScope: vi.fn(),
    }));
    const { observeRealtimeChannel, __resetRealtimeCaptureDedupeForTests } = await import('../realtime');
    __resetRealtimeCaptureDedupeForTests();

    const seen: string[] = [];
    let emit: ((status: string) => void) | null = null;
    const channel = {
      subscribe(cb?: (status: string) => void) {
        emit = (status: string) => cb?.(status);
        return this;
      },
    };

    const returned = observeRealtimeChannel(channel, {
      feature: 'calendar',
      channelClass: 'calendar_events',
      subscriptionType: 'postgres_changes',
      onStatus: (status) => seen.push(status),
    });

    expect(returned).toBe(channel);
    expect(() => emit!('CHANNEL_ERROR')).not.toThrow();
    // The product's OWN status handler still ran - the whole point.
    expect(seen).toEqual(['CHANNEL_ERROR']);
  });

  it('keeps the Supabase observer working when the metrics transport throws', async () => {
    vi.doMock('../../metrics', () => ({
      recordDbFailure: vi.fn(() => {
        throw new Error('metrics transport down');
      }),
    }));
    const { observeSupabaseResult } = await import('../observe-result');
    const input = anActionableError();

    const client = clientRejectingWith({ code: 'X', message: 'unused' });
    const outcome = observeSupabaseResult({
      ...input,
      environment: 'fault',
      runtime: 'node',
      releaseSha: null,
      recorderClient: client,
    });

    // MEASURED FINDING, not an assertion that this is ideal. The observer
    // never throws (the product is safe, which is the hard requirement), but
    // the durable write sits DOWNSTREAM of the metric in observe-result.ts,
    // so a metrics fault also suppresses the durable evidence and the
    // returned envelope. In practice metrics.ts wraps every emit in its own
    // try/catch (`safeCount`/`safeDistribution` - "A Sentry failure must
    // never reach product code"), so this fault is not reachable through the
    // real module; this test pins the ORDERING consequence so a future
    // refactor that removes that inner guard is caught here.
    expect(outcome.observed).toBe(false);
    expect(outcome.envelope).toBeNull();
    expect(client.calls).toEqual([]);
  });
});

describe('fault: the recorder times out', () => {
  it('gives up on a bounded timeout rather than hanging the request', async () => {
    vi.useFakeTimers();
    const { recordDbErrorOutOfBand } = await import('../record-db-error');
    const { observeSupabaseResult } = await import('../observe-result');
    const input = anActionableError();

    const fast = clientRejectingWith({ code: 'X', message: 'unused' });
    const outcome = observeSupabaseResult({
      ...input,
      environment: 'fault',
      runtime: 'node',
      releaseSha: null,
      recorderClient: fast,
    });

    // A client whose RPC never settles - a struggling database.
    const hanging = {
      rpc: () => new Promise<never>(() => {}),
    };
    const pending = recordDbErrorOutOfBand(outcome.envelope!, { client: hanging });
    await vi.advanceTimersByTimeAsync(3_100);
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(result.skipped).toBe('timed-out');
  });
});

describe('fault: a collector throws', () => {
  it('leaves the product untouched and the surface not-green', async () => {
    // A collector runs from a cron route, never inside a user request, so
    // "product unaffected" is structural. What must be proven is that its
    // failure reaches the surface as a state rather than as silence.
    const blind = classifySourceFreshness({
      lastSampleAt: null,
      expectedIntervalMs: FIVE_MINUTES_MS,
      now: NOW,
      readable: false,
    });
    const stale = classifySourceFreshness({
      lastSampleAt: '2026-09-03T10:00:00.000Z',
      expectedIntervalMs: FIVE_MINUTES_MS,
      now: NOW,
      readable: true,
    });

    expect(blind).toBe('blind');
    expect(stale).toBe('stale');
    for (const state of [blind, stale] as const) {
      expect(summarizeTelemetryHealth([{ name: 'collector', state, required: true }])).not.toBe('green');
    }
  });

  it('never lets one healthy source paper over a blind one', () => {
    // The failure that matters: three green sources and one blind one must
    // not average out to green.
    const overall = summarizeTelemetryHealth([
      { name: 'a', state: 'healthy', required: true },
      { name: 'b', state: 'healthy', required: true },
      { name: 'c', state: 'healthy', required: true },
      { name: 'd', state: 'blind', required: true },
    ]);
    expect(overall).toBe('red');
  });
});

describe('fault: a Bridge reader throws', () => {
  it('returns a failed envelope with null data rather than an empty success', async () => {
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => {
        throw new Error('admin client unavailable');
      },
      getServiceRoleKey: () => null,
    }));
    const { fetchTelemetryHealth } = await import('@/lib/admin/database/telemetry');
    const result = await fetchTelemetryHealth();

    expect(result.status).toBe('error');
    expect(result.data).toBeNull();
    // A caller cannot mistake this for a healthy board: there is no overall
    // state to read at all, and `status` says why.
    expect(result.error).toBeTruthy();
  });
});

describe('the surface can never render green off a read that did not happen', () => {
  it('treats an empty source list as unknown, never green', () => {
    // "No sources" and "all sources healthy" are opposite facts that would
    // otherwise both produce an empty problem list.
    expect(summarizeTelemetryHealth([])).toBe('unknown');
  });

  it('separates "unreadable" from "read fine, no data yet"', () => {
    const unreadable = classifySourceFreshness({
      lastSampleAt: null,
      expectedIntervalMs: FIVE_MINUTES_MS,
      now: NOW,
      readable: false,
    });
    const empty = classifySourceFreshness({
      lastSampleAt: null,
      expectedIntervalMs: FIVE_MINUTES_MS,
      now: NOW,
      readable: true,
    });
    expect(unreadable).toBe('blind');
    expect(empty).toBe('unknown');
  });

  it('never reports green while any source is degraded or unknown', () => {
    for (const state of ['blind', 'stale', 'unknown', 'degraded'] as const) {
      expect(summarizeTelemetryHealth([{ name: 's', state, required: false }])).not.toBe('green');
    }
  });
});
