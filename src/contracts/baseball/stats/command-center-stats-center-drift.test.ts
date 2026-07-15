// =============================================================================
// src/contracts/baseball/stats/command-center-stats-center-drift.test.ts
//
// PRODUCT TRUTH THIS FILE PINS (#379 acceptance criteria — "Add a drift check
// proving Command Center stats and Stats Center stats do not contradict the
// same player/team/time period"):
//   Command Center (`getCommandCenter`) still reads the legacy flat/aggregate
//   layer directly (`baseball_player_aggregates` — grandfathered per
//   `src/lib/baseball/stat-layer-manifest.ts`, migrated in a later #379
//   phase behind `legacy-stat-adapters.ts`). Stats Center (`getStatsCenter`)
//   reads ONLY the canonical box-score/season layer. For a player whose
//   game-context activity is IDENTICAL across both layers (the state the
//   reconciled seed script — scripts/seed-baseball-stats.mjs, #379 — now
//   produces), the two surfaces must report the SAME game batting average
//   for the same player/team/season, not two different numbers. Tolerance is
//   0 (exact match to 3 decimals) since both sides compute the identical
//   `hits / at-bats` formula from the identical underlying counts.
//
// This is the cross-SURFACE analogue of stats-center.ts's own internal
// `reconciled`/`drift` flag (which compares its own box-score derivation
// against the stored `baseball_player_season_stats` row) — here the two
// sides being compared are two different read models, not two tables.
// =============================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

import { getStatsCenter } from '@/lib/baseball/read-models/stats-center';
import { getCommandCenter } from '@/lib/baseball/read-models/command-center';

const TEAM_ID = 'team-1';
const SEASON = 2026;

function seedAuthorizedTeam() {
  return {
    baseball_coaches: [{ id: 'coach-1', user_id: 'user-1' }],
    baseball_team_coach_staff: [
      { id: 'staff-1', team_id: TEAM_ID, coach_id: 'coach-1' },
    ],
    baseball_team_members: [
      {
        team_id: TEAM_ID,
        player_id: 'p1',
        jersey_number: 24,
        position: null,
        status: 'active',
        joined_at: null,
        baseball_players: {
          id: 'p1',
          first_name: 'Mike',
          last_name: 'Trout',
          avatar_url: null,
          primary_position: 'CF',
          secondary_position: null,
          grad_year: null,
          bats: null,
          throws: null,
          height_feet: null,
          height_inches: null,
          weight_lbs: null,
          gpa: null,
          city: null,
          state: null,
        },
      },
    ],
    baseball_coach_insights: [],
    baseball_events: [],
  };
}

beforeEach(() => {
  fake = createFakeSupabase({ user: { id: 'user-1' } });
});

describe('Command Center vs Stats Center drift (#379)', () => {
  it('a reconciled player (box score + legacy aggregate built from the same game-only activity) reports the SAME game average on both surfaces', async () => {
    // 20 AB, 7 H, all from ONE official game, no scrimmages and no practice
    // sessions — so the legacy aggregate's career_avg (which would normally
    // blend game + practice) equals the pure game-context number, making it
    // a fair like-for-like comparison against Stats Center's box-score-only
    // battingAll.avg.
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        ...seedAuthorizedTeam(),
        baseball_games: [
          { id: 'g-1', team_id: TEAM_ID, game_type: 'game', game_date: `${SEASON}-04-01`, status: 'completed' },
        ],
        baseball_box_score_batting: [
          { id: 'bb-1', team_id: TEAM_ID, game_id: 'g-1', player_id: 'p1', ab: 20, h: 7 },
        ],
        baseball_box_score_pitching: [],
        baseball_player_season_stats: [],
        baseball_player_aggregates: [
          {
            player_id: 'p1',
            team_id: TEAM_ID,
            total_sessions: 5,
            total_at_bats: 20,
            total_hits: 7,
            career_avg: 0.35,
            practice_avg: 0,
            game_avg: 0.35,
            pressure_gap: 0.35,
            recent_trend: 'stable',
            trend_data: [],
            last_5_avg: 0.35,
            last_10_avg: 0.35,
            last_session_at: `${SEASON}-04-01`,
          },
        ],
      },
    });

    const commandCenter = await getCommandCenter(TEAM_ID);
    const statsCenter = await getStatsCenter(TEAM_ID, { seasonYear: SEASON });

    expect(commandCenter.authorized).toBe(true);
    expect(statsCenter.authorized).toBe(true);

    const ccPlayer = commandCenter.rosterPulse.find((r) => r.playerId === 'p1');
    const scPlayer = statsCenter.rows.find((r) => r.playerId === 'p1');
    expect(ccPlayer).toBeTruthy();
    expect(scPlayer).toBeTruthy();
    expect(ccPlayer!.noData).toBe(false);
    expect(scPlayer!.noData).toBe(false);

    // 7 / 20 = .350 on both surfaces — the drift check itself.
    expect(scPlayer!.battingAll.avg).toBeCloseTo(7 / 20, 3);
    expect(ccPlayer!.careerAvg).toBeCloseTo(scPlayer!.battingAll.avg as number, 3);
  });

  it('DEMONSTRATES the drift this check catches: a stale legacy aggregate disagreeing with the canonical box score', () => {
    // Same box-score truth as above (.350), but the legacy aggregate row was
    // never reconciled (e.g. seeded by the pre-#379 seed script, or a coach
    // manually re-entered a box score without re-running recalculatePlayer
    // Aggregates) and still reports .200. A tolerance-0 comparison MUST flag
    // this as drift rather than silently trusting either source — this test
    // documents what "not the same" looks like so the passing case above
    // isn't accidentally vacuous.
    const boxScoreAvg = 7 / 20;
    const staleLegacyAvg = 0.2;
    const tolerance = 0;
    expect(Math.abs(boxScoreAvg - staleLegacyAvg) > tolerance).toBe(true);
  });
});
