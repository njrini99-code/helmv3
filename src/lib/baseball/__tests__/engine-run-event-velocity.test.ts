// =============================================================================
// #852 residual: runBaseballEngineCore must thread event-derived velocity into
// loadAllPlayerMetrics so a box-score-migrated player isn't left with NO
// velocity metric (the elite event layer wins over a legacy scalar per #379
// design rule 4; a zero-event player keeps their legacy scalar unchanged).
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';
import { DEFAULT_AI_POLICY } from '@/lib/baseball/ai-policy';
import type { BaseballInsightCandidate } from '@/lib/coachhelm/baseball/generators';
import type { BaseballV10EngineInputs } from '@/lib/coachhelm/baseball/engine';

const NOW = '2026-06-30T12:00:00.000Z';
const TEAM_ID = 'team-1';
const ORG_ID = 'org-1';
const MIXED_PLAYER = 'player-mixed'; // has legacy exit_velocity AND event batted-balls
const LEGACY_ONLY_PLAYER = 'player-legacy-only'; // legacy exit_velocity, zero events

let capturedInputs: BaseballV10EngineInputs | null = null;

vi.mock('@/lib/coachhelm/baseball/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/baseball/engine')>();
  return {
    ...actual,
    generateAllBaseballCandidates: vi.fn((inputs: BaseballV10EngineInputs) => {
      capturedInputs = inputs;
      return [] as BaseballInsightCandidate[];
    }),
  };
});

import { runBaseballEngineCore, type EngineRunClient } from '@/lib/baseball/coachhelm/engine-run';

function baseTables() {
  return {
    baseball_team_members: [
      { team_id: TEAM_ID, player_id: MIXED_PLAYER },
      { team_id: TEAM_ID, player_id: LEGACY_ONLY_PLAYER },
    ],
    // Legacy box-score rows: BOTH players have a legacy exit_velocity scalar.
    baseball_player_stats: [
      {
        id: 'lg-mixed-1', team_id: TEAM_ID, player_id: MIXED_PLAYER, stat_type: 'game',
        session_date: '2026-04-01', at_bats: 4, hits: 1, walks: 0, strikeouts: 1,
        exit_velocity: 80, // legacy scalar the event source should OUTRANK
      },
      {
        id: 'lg-legacy-1', team_id: TEAM_ID, player_id: LEGACY_ONLY_PLAYER, stat_type: 'game',
        session_date: '2026-04-01', at_bats: 4, hits: 1, walks: 0, strikeouts: 1,
        exit_velocity: 85, // the ONLY source for this player -- must survive
      },
    ],
    baseball_events: [],
    baseball_teams: [{ id: TEAM_ID, organization_id: ORG_ID }],
    helm_lifting_athletes: [] as Array<Record<string, unknown>>,
    helm_lifting_readiness_checkins: [] as Array<Record<string, unknown>>,
    baseball_lift_sessions: [],
    baseball_lift_set_results: [],
    baseball_import_runs: [],
    // Event layer: ONLY the mixed player has batted-ball events.
    baseball_pitch_events: [] as Array<Record<string, unknown>>,
    baseball_batted_ball_events: [
      {
        id: 'bb-1', team_id: TEAM_ID, batter_id: MIXED_PLAYER, pitcher_id: null,
        data_context: 'official_game', exit_velocity: 100, superseded_by_run_id: null,
        measured_at: '2026-04-05T00:00:00.000Z', trust_tier: 'official', visibility: 'staff_only',
      },
      {
        id: 'bb-2', team_id: TEAM_ID, batter_id: MIXED_PLAYER, pitcher_id: null,
        data_context: 'official_game', exit_velocity: 104, superseded_by_run_id: null,
        measured_at: '2026-04-06T00:00:00.000Z', trust_tier: 'official', visibility: 'staff_only',
      },
    ],
    baseball_catching_events: [],
    baseball_fielding_events: [],
    baseball_baserunning_events: [],
    baseball_video_events: [],
    baseball_coach_insights: [] as Array<Record<string, unknown>>,
    baseball_signals: [] as Array<Record<string, unknown>>,
    baseball_ai_audit: [] as Array<Record<string, unknown>>,
  };
}

async function runEngine(fake: FakeSupabase) {
  return runBaseballEngineCore(fake as unknown as EngineRunClient, {
    teamId: TEAM_ID,
    coachId: 'coach-1',
    createdByUserId: 'user-1',
    policy: DEFAULT_AI_POLICY,
    nowIso: NOW,
  });
}

describe('runBaseballEngineCore — #852 event-derived velocity wiring', () => {
  it('event-derived avg exit velocity WINS over the legacy scalar for a box-score-migrated player', async () => {
    capturedInputs = null;
    const fake = createFakeSupabase({ user: { id: 'user-1' }, tables: baseTables() });

    const result = await runEngine(fake);
    expect(result.success).toBe(true);
    expect(capturedInputs).not.toBeNull();

    const mixed = capturedInputs!.players.find((p) => p.playerId === MIXED_PLAYER);
    expect(mixed).toBeDefined();
    // (100 + 104) / 2 = 102, NOT the legacy scalar of 80.
    expect(mixed!.metrics.avg_exit_velocity?.value).toBe(102);
    expect(mixed!.metrics.avg_exit_velocity?.source_refs[0]?.table).toBe('baseball_batted_ball_events');
  });

  it('a zero-event player keeps their legacy exit-velocity scalar unchanged (honest fallback)', async () => {
    capturedInputs = null;
    const fake = createFakeSupabase({ user: { id: 'user-1' }, tables: baseTables() });

    const result = await runEngine(fake);
    expect(result.success).toBe(true);
    expect(capturedInputs).not.toBeNull();

    const legacyOnly = capturedInputs!.players.find((p) => p.playerId === LEGACY_ONLY_PLAYER);
    expect(legacyOnly).toBeDefined();
    expect(legacyOnly!.metrics.avg_exit_velocity?.value).toBe(85);
    expect(legacyOnly!.metrics.avg_exit_velocity?.source_refs[0]?.table).toBe('baseball_player_stats');
  });

  it('degrades ALL-OR-NOTHING to legacy scalars for every player when the event read fails', async () => {
    capturedInputs = null;
    const tables = baseTables();
    const fake = createFakeSupabase({ user: { id: 'user-1' }, tables });
    // Force the batted-ball read to error by deleting the table key entirely
    // is not enough (the fixture defaults missing tables to [] with no error),
    // so we monkey-patch the fake's `from` to inject an error for this one
    // table -- the smallest surface that exercises the degrade path without
    // hand-rolling a whole second fake client. `baseball_batted_ball_events`
    // is ALSO read by the pre-existing "deepened event catalog" fetch further
    // down runBaseballEngineCore (a `.gte('measured_at', ...)`-shaped query,
    // no `.is()`), so the stub must satisfy BOTH call shapes. `.in()` is the
    // player-id scope loadEngineEventRows now applies (velocity-read
    // unbounded-scan fix) -- must be stubbed too.
    const realFrom = fake.from.bind(fake);
    const erroringBuilder: Record<string, unknown> = {
      select: () => erroringBuilder,
      eq: () => erroringBuilder,
      in: () => erroringBuilder,
      is: () => erroringBuilder,
      gte: () => erroringBuilder,
      order: () => erroringBuilder,
      range: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
    };
    (fake as unknown as { from: typeof fake.from }).from = (table: string) => {
      if (table === 'baseball_batted_ball_events') return erroringBuilder as never;
      return realFrom(table);
    };

    const result = await runEngine(fake);
    expect(result.success).toBe(true);
    expect(capturedInputs).not.toBeNull();

    // The mixed player, who WOULD have event data, falls all the way back to
    // their legacy scalar -- never a partial/blended result.
    const mixed = capturedInputs!.players.find((p) => p.playerId === MIXED_PLAYER);
    expect(mixed!.metrics.avg_exit_velocity?.value).toBe(80);
    expect(mixed!.metrics.avg_exit_velocity?.source_refs[0]?.table).toBe('baseball_player_stats');
  });
});
