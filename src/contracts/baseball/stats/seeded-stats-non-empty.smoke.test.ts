// =============================================================================
// src/contracts/baseball/stats/seeded-stats-non-empty.smoke.test.ts
//
// PRODUCT TRUTH THIS FILE PINS (#379 acceptance criteria — "Add a seeded-data
// smoke test that asserts Stats Center is non-empty when the seed claims
// stats exist"):
//   `scripts/seed-baseball-stats.mjs` seeds a team's stats and prints a per-
//   player "seeded" summary. Before #379's fix, that script wrote ONLY the
//   legacy flat/aggregate layer (`baseball_player_stats` /
//   `baseball_player_aggregates`) — `src/lib/baseball/read-models/
//   stats-center.ts` reads ONLY the box-score/season layer, so a "seeded"
//   team looked fully populated on Command Center/Roster/Passport and
//   completely empty on Stats Center. This test runs the ACTUAL reconciled
//   seed logic (`seedTeamStats`, exported from the seed script itself — not a
//   hand-built fixture reimplementing it) against a fake Supabase client and
//   asserts `getStatsCenter()` shows real, non-empty rows for the players the
//   seed claims to have stats for. If this ever regresses to legacy-only
//   writes, this test goes red.
// =============================================================================

import { describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

import { getStatsCenter } from '@/lib/baseball/read-models/stats-center';
import { seedTeamStats } from '../../../../scripts/seed-baseball-stats.mjs';

const TEAM_ID = 'team-1';
// Fixed mid-year timestamp — decoupled from the real "today" so this test
// can never flake near a calendar-year boundary regardless of when CI runs
// it (the seed script's session dates walk backward from `now` by up to
// ~130 days).
const SEASON = 2026;
const FIXED_NOW = Date.UTC(SEASON, 5, 15);

// Every `Math.random()` draw inside the seed logic resolves to this constant,
// which deterministically (a) always picks `stat_type: 'game'` (index 2 of
// `['game','game','game','practice','practice']`) and (b) produces a
// non-zero AB for the batter and a non-zero IP for the pitcher — so every
// session becomes a real box-score line, not a matter of chance.
const DETERMINISTIC_RANDOM = () => 0.4;

const members = [
  {
    team_id: TEAM_ID,
    player_id: 'p1',
    jersey_number: 24,
    baseball_players: { id: 'p1', first_name: 'Mike', last_name: 'Trout', primary_position: 'CF' },
  },
  {
    team_id: TEAM_ID,
    player_id: 'p2',
    jersey_number: 34,
    baseball_players: { id: 'p2', first_name: 'Justin', last_name: 'Verlander', primary_position: 'P' },
  },
];

describe('Seeded stats are non-empty in Stats Center (#379 smoke test)', () => {
  it('a team the seed claims has stats shows non-noData rows via getStatsCenter — not the empty state', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_coaches: [{ id: 'staff-coach-1', user_id: 'user-1' }],
        baseball_team_coach_staff: [{ id: 'staff-1', team_id: TEAM_ID, coach_id: 'staff-coach-1' }],
        baseball_team_members: members,
      },
      rpc: {
        recalculate_baseball_season_stats: async () => ({ data: null, error: null }),
      },
    });

    // Exercise the real reconciled seed logic — the same function
    // scripts/seed-baseball-stats.mjs's run() calls once it has fetched the
    // roster — against the fake client, not a re-derived fixture.
    const summaries = await seedTeamStats(fake, {
      teamId: TEAM_ID,
      coachId: 'coach-1',
      members,
      dryRun: false,
      randomFn: DETERMINISTIC_RANDOM,
      now: FIXED_NOW,
      log: false,
    });

    expect(summaries).toHaveLength(2);
    // The seed claims every player has stats — box-score rows must exist for
    // each, not just the legacy flat rows.
    for (const summary of summaries) {
      expect(summary.sessionCount).toBeGreaterThan(0);
      expect(summary.gameBoxScoreCount).toBeGreaterThan(0);
    }

    const result = await getStatsCenter(TEAM_ID, { seasonYear: SEASON });

    expect(result.authorized).toBe(true);
    expect(result.rows).toHaveLength(2);

    // The exact #379 symptom, as a red/green gate: a "seeded" team must not
    // render every player as empty on Stats Center.
    const nonEmptyRows = result.rows.filter((r) => !r.noData);
    expect(nonEmptyRows.length).toBeGreaterThan(0);
    expect(result.summary.playersWithData).toBeGreaterThan(0);

    const batter = result.rows.find((r) => r.playerId === 'p1');
    expect(batter).toBeTruthy();
    expect(batter!.noData).toBe(false);
    expect(batter!.battingAll.g).toBeGreaterThan(0);

    const pitcher = result.rows.find((r) => r.playerId === 'p2');
    expect(pitcher).toBeTruthy();
    expect(pitcher!.noData).toBe(false);
    expect(pitcher!.pitchingAll.g).toBeGreaterThan(0);
  });
});
