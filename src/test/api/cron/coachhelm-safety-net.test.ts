/**
 * Regression coverage for Fix 1 (COACHHELM_APPROVED_FIXES_PLAN_2026-07-25.md
 * §1 "Fix 1 — Drain the 200 stranded rounds + honest cron self-reporting").
 *
 * Before the fix, this cron's eligibility query added
 * `.gte('created_at', sinceIso)` on top of the deterministic terminal-state
 * gate (`coachhelm_analyzed_at`/`coachhelm_failed_at IS NULL`). Any round
 * that stayed unprocessed past that rolling window aged permanently out of
 * the query's reach — the exact mechanism that let 112 (then 200) completed
 * rounds go unanalyzed indefinitely while the cron reported success on
 * every one of 332 runs. Widening the window (24h -> 30d, 2026-05-23) only
 * delayed the same failure mode; it didn't fix it.
 *
 * This file locks in:
 *   1. The date window is gone — a completed, unanalyzed round older than
 *      the old 30-day lookback is now selected and processed (the drain).
 *   2. A `logServerError('warning', ...)` alarm fires when the eligible
 *      backlog contains rows older than STALE_THRESHOLD_MS, so a silent
 *      backlog can never again hide behind a query window that simply
 *      stopped looking.
 *   3. The alarm stays silent on a clean run — zero pending, or pending
 *      rows that are not yet stale.
 *   4. The terminal-state gate itself (analyzed/failed already set) still
 *      excludes rows, unchanged from before.
 *
 * 2026-07-25 addition (Fix 3 companion change, §1/§3 of the same plan):
 * this route also gained a MIN_AGE_MS floor (`.lte('created_at', ...)`) so
 * the cron doesn't race a round still inside its first Inngest attempt's
 * own retry backoff window. Every `created_at` fixture below that predates
 * this change was seeded at or near "now" (irrelevant before the floor
 * existed) — those are shifted to `OLD_ENOUGH_MS` ago so they stay
 * eligible under the new filter without changing what each test is
 * actually asserting. A dedicated MIN_AGE_MS test is added at the bottom.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake),
}));

vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({
  postRoundTrigger: vi.fn().mockResolvedValue({ success: true }),
}));

const logServerErrorMock = vi.fn(async (..._args: unknown[]) => undefined);
const logServerEventMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...args: unknown[]) => logServerErrorMock(...args),
  logServerEvent: (...args: unknown[]) => logServerEventMock(...args),
  logServerException: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '@/app/api/cron/coachhelm-safety-net/route';
import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';

const postRoundTriggerMock = vi.mocked(postRoundTrigger);

type Row = Record<string, unknown>;

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
// Comfortably past the route's MIN_AGE_MS floor (10 minutes) without
// tying every fixture to that exact constant.
const OLD_ENOUGH_MS = 20 * MINUTE_MS;

function seed(golfRounds: Row[]) {
  fake = createFakeSupabase({ tables: { golf_rounds: golfRounds } });
}

function callGet() {
  return GET(
    new Request('http://x/api/cron/coachhelm-safety-net', {
      headers: { authorization: 'Bearer cs' },
    }) as unknown as import('next/server').NextRequest,
  );
}

/** A completed round eligible for the cron: no terminal state written yet. */
function pendingRound(overrides: Row): Row {
  return {
    status: 'completed',
    coachhelm_analyzed_at: null,
    coachhelm_failed_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  postRoundTriggerMock.mockReset();
  postRoundTriggerMock.mockResolvedValue({ success: true });
  logServerErrorMock.mockClear();
  logServerEventMock.mockClear();
  process.env.CRON_SECRET = 'cs';
  delete process.env.COACHHELM_SAFETY_NET_STALE_THRESHOLD_MS;
  delete process.env.COACHHELM_SAFETY_NET_SOFT_DEADLINE_MS;
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.CRON_SECRET;
  delete process.env.COACHHELM_SAFETY_NET_STALE_THRESHOLD_MS;
  delete process.env.COACHHELM_SAFETY_NET_SOFT_DEADLINE_MS;
});

describe('GET /api/cron/coachhelm-safety-net', () => {
  it('rejects without bearer token', async () => {
    delete process.env.CRON_SECRET;
    seed([]);
    const res = await GET(
      new Request('http://x/api/cron/coachhelm-safety-net') as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(401);
  });

  it('returns a summary when there are no pending rounds, and does not fire the stale-backlog alarm', async () => {
    seed([]);
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      pending: number;
      recovered: number;
      failed: number;
      concurrency: number;
    };
    expect(body.success).toBe(true);
    expect(body.pending).toBe(0);
    expect(body.recovered).toBe(0);
    expect(body.failed).toBe(0);
    expect(body.concurrency).toBe(5);
    expect(postRoundTriggerMock).not.toHaveBeenCalled();
    expect(logServerErrorMock).not.toHaveBeenCalled();
  });

  it('returns 500 when fetching rounds errors', async () => {
    fake = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'boom', code: 'XX' },
        }),
      })),
    } as unknown as FakeSupabase;
    const res = await callGet();
    expect(res.status).toBe(500);
  });

  it('selects a completed, unanalyzed round older than the old 30-day lookback window — the drain', async () => {
    // 45 days old: inside the terminal-state gate, but the OLD `.gte`
    // filter (rolling 30-day window) would have excluded it.
    const oldCreatedAt = new Date(Date.now() - 45 * DAY_MS).toISOString();
    seed([pendingRound({ id: 'r-old', player_id: 'p-old', created_at: oldCreatedAt })]);

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pending: number; recovered: number };
    expect(body.pending).toBe(1);
    expect(body.recovered).toBe(1);
    expect(postRoundTriggerMock).toHaveBeenCalledWith(
      fake,
      expect.objectContaining({ roundId: 'r-old', playerId: 'p-old', triggerReason: 'safety_net' }),
    );
  });

  it('still excludes rounds that already have a terminal state written, regardless of age', async () => {
    const oldCreatedAt = new Date(Date.now() - 45 * DAY_MS).toISOString();
    seed([
      pendingRound({ id: 'r-analyzed', player_id: 'p1', created_at: oldCreatedAt, coachhelm_analyzed_at: oldCreatedAt }),
      pendingRound({ id: 'r-failed', player_id: 'p2', created_at: oldCreatedAt, coachhelm_failed_at: oldCreatedAt }),
      pendingRound({ id: 'r-pending', player_id: 'p3', created_at: oldCreatedAt }),
    ]);

    const res = await callGet();
    const body = (await res.json()) as { pending: number };
    expect(body.pending).toBe(1);
    expect(postRoundTriggerMock).toHaveBeenCalledTimes(1);
    expect(postRoundTriggerMock).toHaveBeenCalledWith(fake, expect.objectContaining({ roundId: 'r-pending' }));
  });

  it('fires the stale-backlog warning when eligible rows are older than the staleness threshold', async () => {
    const oldCreatedAt = new Date(Date.now() - 45 * DAY_MS).toISOString();
    seed([pendingRound({ id: 'r-old', player_id: 'p-old', created_at: oldCreatedAt })]);

    await callGet();

    expect(logServerErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('staleBacklog'),
      expect.objectContaining({
        action: 'cron.coachhelm.safetyNet.staleBacklog',
        featureArea: 'coachhelm',
      }),
      'warning',
    );
  });

  /**
   * Production emitted this same alarm as TWO unrelated incidents 30 minutes
   * apart (fingerprints 45c7f4b9 "200 completed round(s)…" and bd702e2f
   * "20 completed round(s)…") — one backlog draining, reported as two
   * warnings that could never dedupe or stay resolved. Incident fingerprints
   * hash a normalised message prefix that only redacts integers of 5+ digits
   * (lib/admin/incident-grouping.ts), so every distinct count minted a new
   * group. Separately, the count itself was `staleBacklog.length` — a subset
   * of a BATCH_LIMIT-capped page, so it could never exceed 200 and an
   * operator could not tell a 200-round backlog from a 20,000-round one.
   */
  describe('stale-backlog alarm is dedupable and reports the true backlog size', () => {
    function staleCall() {
      return logServerErrorMock.mock.calls.find(
        (c) => typeof c[0] === 'string' && (c[0] as string).includes('staleBacklog'),
      );
    }

    it('keeps the message count-stable so one draining backlog is ONE incident', async () => {
      const stale = (n: number) =>
        Array.from({ length: n }, (_, i) =>
          pendingRound({
            id: `r${i}`,
            player_id: `p${i}`,
            created_at: new Date(Date.now() - 45 * DAY_MS - i * 1000).toISOString(),
          }),
        );

      seed(stale(7));
      await callGet();
      const firstMessage = staleCall()?.[0];

      logServerErrorMock.mockClear();
      seed(stale(3));
      await callGet();
      const secondMessage = staleCall()?.[0];

      expect(firstMessage).toBeDefined();
      // Different backlog sizes, byte-identical message — one fingerprint.
      expect(secondMessage).toBe(firstMessage);
      expect(firstMessage).not.toMatch(/\d/);
    });

    it('reports the true backlog in extra, and flags when the page was saturated', async () => {
      seed([
        pendingRound({ id: 'r1', player_id: 'p1', created_at: new Date(Date.now() - 45 * DAY_MS).toISOString() }),
        pendingRound({ id: 'r2', player_id: 'p2', created_at: new Date(Date.now() - 46 * DAY_MS).toISOString() }),
      ]);

      await callGet();

      expect(staleCall()?.[1]).toEqual(
        expect.objectContaining({
          extra: expect.objectContaining({
            staleCount: 2,
            staleInThisPage: 2,
            batchLimit: 200,
            pageSaturated: false,
            thresholdDays: 30,
          }),
        }),
      );
    });
  });

  it('does not fire the stale-backlog warning on a clean run with pending rows that are not yet stale', async () => {
    const freshCreatedAt = new Date(Date.now() - 1 * DAY_MS).toISOString();
    seed([pendingRound({ id: 'r-fresh', player_id: 'p-fresh', created_at: freshCreatedAt })]);

    const res = await callGet();
    const body = (await res.json()) as { pending: number };
    expect(body.pending).toBe(1);
    expect(logServerErrorMock).not.toHaveBeenCalled();
  });

  it('processes pending rounds with chunked concurrency', async () => {
    const rounds = Array.from({ length: 12 }, (_, i) =>
      pendingRound({
        id: `r${i}`,
        player_id: `p${i}`,
        created_at: new Date(Date.now() - OLD_ENOUGH_MS - i * 1000).toISOString(),
      }),
    );
    seed(rounds);

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pending: number; recovered: number; failed: number };
    expect(body.pending).toBe(12);
    expect(body.recovered).toBe(12);
    expect(body.failed).toBe(0);
    expect(postRoundTriggerMock).toHaveBeenCalledTimes(12);
  });

  it('checkpoints at the soft deadline and leaves unstarted rounds eligible for the next tick', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00.000Z'));
    process.env.COACHHELM_SAFETY_NET_SOFT_DEADLINE_MS = '1000';

    const rounds = Array.from({ length: 12 }, (_, i) =>
      pendingRound({
        id: `r${i}`,
        player_id: `p${i}`,
        created_at: new Date(Date.now() - OLD_ENOUGH_MS - i * 1000).toISOString(),
      }),
    );
    seed(rounds);
    postRoundTriggerMock.mockImplementation(async () => {
      // Five concurrent calls consume more than the test deadline before the
      // route considers launching its second chunk.
      vi.setSystemTime(new Date(Date.now() + 250));
      return { success: true };
    });

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pending: number;
      processed: number;
      deferred: number;
      deadlineReached: boolean;
      recovered: number;
      failed: number;
    };
    expect(body).toMatchObject({
      pending: 12,
      processed: 5,
      deferred: 7,
      deadlineReached: true,
      recovered: 5,
      failed: 0,
    });
    expect(postRoundTriggerMock).toHaveBeenCalledTimes(5);
    // Deferred work is not misclassified or logged as a failure.
    expect(logServerErrorMock).not.toHaveBeenCalled();
  });

  it('counts eligibility and stale-backlog setup against the soft deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00.000Z'));
    process.env.COACHHELM_SAFETY_NET_SOFT_DEADLINE_MS = '1000';
    seed([
      pendingRound({
        id: 'r-stale',
        player_id: 'p-stale',
        created_at: new Date(Date.now() - 45 * DAY_MS).toISOString(),
      }),
    ]);
    logServerErrorMock.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date(Date.now() + 1000));
    });

    const res = await callGet();
    const body = (await res.json()) as {
      processed: number;
      deferred: number;
      deadlineReached: boolean;
    };
    expect(body).toMatchObject({
      processed: 0,
      deferred: 1,
      deadlineReached: true,
    });
    expect(postRoundTriggerMock).not.toHaveBeenCalled();
  });

  it('rejects an override that would consume the one-minute response reserve', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00.000Z'));
    process.env.COACHHELM_SAFETY_NET_SOFT_DEADLINE_MS = '299000';
    const rounds = Array.from({ length: 12 }, (_, i) =>
      pendingRound({
        id: `r${i}`,
        player_id: `p${i}`,
        created_at: new Date(Date.now() - OLD_ENOUGH_MS - i * 1000).toISOString(),
      }),
    );
    seed(rounds);
    postRoundTriggerMock.mockImplementation(async () => {
      vi.setSystemTime(new Date(Date.now() + 50_000));
      return { success: true };
    });

    const res = await callGet();
    const body = (await res.json()) as {
      processed: number;
      deferred: number;
      deadlineReached: boolean;
    };
    expect(body).toMatchObject({
      processed: 5,
      deferred: 7,
      deadlineReached: true,
    });
    expect(postRoundTriggerMock).toHaveBeenCalledTimes(5);
  });

  it('counts rejected postRoundTrigger calls as failed', async () => {
    seed([pendingRound({ id: 'r1', player_id: 'p1', created_at: new Date(Date.now() - OLD_ENOUGH_MS).toISOString() })]);
    postRoundTriggerMock.mockRejectedValueOnce(new Error('engine_boom'));

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recovered: number; failed: number };
    expect(body.recovered).toBe(0);
    expect(body.failed).toBe(1);
  });

  it('counts structured postRoundTrigger failures as failed', async () => {
    seed([pendingRound({ id: 'r1', player_id: 'p1', created_at: new Date(Date.now() - OLD_ENOUGH_MS).toISOString() })]);
    postRoundTriggerMock.mockResolvedValueOnce({ success: false, error: 'team disabled coachhelm' });

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recovered: number; failed: number };
    expect(body.recovered).toBe(0);
    expect(body.failed).toBe(1);
  });

  // The cron is the THIRD consumer of one engine outcome, after
  // triggerPlayerInsightsAfterRound (which classifies it) and postRoundTrigger
  // (which logs it at the classified severity). It used to log at a hardcoded
  // 'error', so every routine outcome appeared in the Errors tab moments after
  // the same outcome had been logged as 'info'/'warning' — visible in
  // production as two groups with identical counts ("No completed rounds in
  // the last 90 days" at info n=6 from postRoundTrigger.engineFailure, and at
  // error n=6 from cron.coachhelm.safetyNet.postRoundTrigger).
  describe('engine-classified outcomes are not re-logged as cron errors', () => {
    function seedOnePending() {
      seed([
        pendingRound({
          id: 'r1',
          player_id: 'p1',
          created_at: new Date(Date.now() - OLD_ENOUGH_MS).toISOString(),
        }),
      ]);
    }

    it('logs an engine_no_team_membership outcome at warning + skipSentry and counts it as skipped, not failed', async () => {
      seedOnePending();
      postRoundTriggerMock.mockResolvedValueOnce({
        success: false,
        error: 'No active team membership for player',
        code: 'engine_no_team_membership',
      });

      const res = await callGet();
      const body = (await res.json()) as { failed: number; skippedExpected: number };
      expect(body.failed).toBe(0);
      expect(body.skippedExpected).toBe(1);

      expect(logServerErrorMock).toHaveBeenCalledWith(
        expect.stringContaining('cron.safetyNet.postRoundTrigger failed'),
        expect.objectContaining({ skipSentry: true, errorCode: 'engine_no_team_membership' }),
        'warning',
      );
    });

    it('routes an engine_no_recent_rounds outcome to logServerEvent at info, never logServerError', async () => {
      seedOnePending();
      postRoundTriggerMock.mockResolvedValueOnce({
        success: false,
        error:
          'No completed rounds in the last 90 days yet — insights will populate after the next round',
        code: 'engine_no_recent_rounds',
      });

      const res = await callGet();
      const body = (await res.json()) as { failed: number; skippedExpected: number };
      expect(body.failed).toBe(0);
      expect(body.skippedExpected).toBe(1);

      expect(logServerEventMock).toHaveBeenCalledWith(
        expect.stringContaining('cron.safetyNet.postRoundTrigger failed'),
        expect.objectContaining({ skipSentry: true, errorCode: 'engine_no_recent_rounds' }),
        'info',
      );
      expect(logServerErrorMock).not.toHaveBeenCalledWith(
        expect.stringContaining('cron.safetyNet.postRoundTrigger failed'),
        expect.anything(),
        expect.anything(),
      );
    });

    it('a rejected call has no engine classification, so it stays a hard error', async () => {
      seedOnePending();
      postRoundTriggerMock.mockRejectedValueOnce(new Error('engine_boom'));

      const res = await callGet();
      const body = (await res.json()) as { failed: number; skippedExpected: number };
      expect(body.failed).toBe(1);
      expect(body.skippedExpected).toBe(0);
      expect(logServerErrorMock).toHaveBeenCalledWith(
        expect.stringContaining('cron.safetyNet.postRoundTrigger failed'),
        expect.objectContaining({ action: 'cron.coachhelm.safetyNet.postRoundTrigger' }),
        'error',
      );
    });
  });

  it('excludes a completed, unanalyzed round created within the MIN_AGE_MS floor (still inside its first Inngest retry window)', async () => {
    seed([pendingRound({ id: 'r-fresh', player_id: 'p-fresh', created_at: new Date().toISOString() })]);

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pending: number; recovered: number };
    expect(body.pending).toBe(0);
    expect(body.recovered).toBe(0);
    expect(postRoundTriggerMock).not.toHaveBeenCalled();
  });

  it('includes a round once it is older than the MIN_AGE_MS floor, alongside one still inside it', async () => {
    seed([
      pendingRound({ id: 'r-old-enough', player_id: 'p1', created_at: new Date(Date.now() - OLD_ENOUGH_MS).toISOString() }),
      pendingRound({ id: 'r-too-fresh', player_id: 'p2', created_at: new Date().toISOString() }),
    ]);

    const res = await callGet();
    const body = (await res.json()) as { pending: number; recovered: number };
    expect(body.pending).toBe(1);
    expect(body.recovered).toBe(1);
    expect(postRoundTriggerMock).toHaveBeenCalledTimes(1);
    expect(postRoundTriggerMock).toHaveBeenCalledWith(fake, expect.objectContaining({ roundId: 'r-old-enough' }));
  });
});
