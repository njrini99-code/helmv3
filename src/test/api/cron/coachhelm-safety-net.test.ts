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
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...args: unknown[]) => logServerErrorMock(...args),
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
  process.env.CRON_SECRET = 'cs';
  delete process.env.COACHHELM_SAFETY_NET_STALE_THRESHOLD_MS;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.COACHHELM_SAFETY_NET_STALE_THRESHOLD_MS;
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
