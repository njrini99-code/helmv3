/**
 * Regression test for #920 (insight-staleness engine, fix 2/4).
 *
 * Before the fix, coachhelm-roster-sweep skipped a player whenever ANY of
 * their rounds had `coachhelm_analyzed_at` set within the last 12h — even
 * if that was an OLDER round and the player's genuinely MOST RECENT
 * completed round was still unanalyzed. A player who played again shortly
 * after an earlier round got (re-)analyzed within the same 12h window would
 * be silently skipped by the nightly sweep, leaving their latest round's
 * insights permanently stale until the next sweep window happened to fall
 * outside the 12h skip.
 *
 * The fix: skip a player ONLY when their MOST RECENT completed round's
 * `coachhelm_analyzed_at` is set — i.e. sweep whenever the latest round is
 * unanalyzed, regardless of when some earlier round was analyzed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake),
}));

// Side-effect-only import in the route — no-op it so loading the route
// doesn't pull in the real (heavy) insights.ts module graph.
vi.mock('@/app/golf/actions/insights', () => ({}));

vi.mock('@/lib/coachhelm/v2/trigger-insights-bridge', () => ({
  triggerPlayerInsightsAfterRound: vi.fn(async () => ({ success: true, insights_created: 1 })),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

import { GET } from '@/app/api/cron/coachhelm-roster-sweep/route';
import { triggerPlayerInsightsAfterRound } from '@/lib/coachhelm/v2/trigger-insights-bridge';

const triggerMock = vi.mocked(triggerPlayerInsightsAfterRound);

type Row = Record<string, unknown>;

function seed(golfRounds: Row[]) {
  fake = createFakeSupabase({
    tables: {
      golf_team_members: [
        { id: 'm-a', team_id: 'team-1', player_id: 'player-A', status: 'active' },
        { id: 'm-b', team_id: 'team-1', player_id: 'player-B', status: 'active' },
        { id: 'm-c', team_id: 'team-1', player_id: 'player-C', status: 'active' },
      ],
      golf_rounds: golfRounds,
    },
  });
}

function callGet() {
  return GET(
    new Request('http://x/api/cron/coachhelm-roster-sweep', {
      headers: { authorization: 'Bearer cs' },
    }) as unknown as import('next/server').NextRequest,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  triggerMock.mockClear();
  triggerMock.mockResolvedValue({ success: true, insights_created: 1 });
  process.env.CRON_SECRET = 'cs';
});

describe('GET /api/cron/coachhelm-roster-sweep — latest-round-only skip (#920 fix 2)', () => {
  it('rejects without bearer token', async () => {
    delete process.env.CRON_SECRET;
    seed([]);
    const res = await GET(
      new Request('http://x/api/cron/coachhelm-roster-sweep') as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(401);
  });

  it('skips a player only when their MOST RECENT completed round is analyzed, and sweeps a player whose latest round is unanalyzed even though an earlier round of theirs was recently analyzed', async () => {
    seed([
      // Player A: single completed round, already analyzed — SKIP.
      {
        id: 'rA-1',
        player_id: 'player-A',
        status: 'completed',
        round_date: '2026-07-15',
        created_at: '2026-07-15T10:00:00Z',
        coachhelm_analyzed_at: '2026-07-15T12:00:00Z',
      },
      // Player B: the actual bug scenario. An OLDER round was analyzed
      // WITHIN the last 12h (the old code's window would have skipped B
      // outright) but the player's genuinely MOST RECENT completed round
      // (later created_at) is still unanalyzed — must NOT be skipped.
      {
        id: 'rB-old',
        player_id: 'player-B',
        status: 'completed',
        round_date: '2026-07-10',
        created_at: '2026-07-10T10:00:00Z',
        coachhelm_analyzed_at: '2026-07-16T20:00:00Z', // analyzed recently
      },
      {
        id: 'rB-new',
        player_id: 'player-B',
        status: 'completed',
        round_date: '2026-07-16',
        created_at: '2026-07-16T22:00:00Z', // more recent than rB-old
        coachhelm_analyzed_at: null, // latest round is UNANALYZED
      },
      // Player C: no completed rounds at all — always processed (matches
      // pre-existing behavior; the engine itself reports the empty state).
    ]);

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      playersTotal: number;
      playersProcessed: number;
      alreadyAnalyzedSkipped: number;
      analyzed: number;
      failed: number;
    };

    expect(body.success).toBe(true);
    expect(body.playersTotal).toBe(3);
    expect(body.alreadyAnalyzedSkipped).toBe(1);
    expect(body.playersProcessed).toBe(2); // B and C
    expect(body.analyzed).toBe(2);
    expect(body.failed).toBe(0);

    const calledPlayerIds = triggerMock.mock.calls.map((call) => call[0]);
    expect(calledPlayerIds.sort()).toEqual(['player-B', 'player-C']);
    expect(calledPlayerIds).not.toContain('player-A');
  });
});
