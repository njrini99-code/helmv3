// =============================================================================
// src/contracts/baseball/stats/command-center-stats-center-drift.test.ts
//
// PRODUCT TRUTH THIS FILE PINS (#379 acceptance criteria — "Add a drift check
// proving Command Center stats and Stats Center stats do not contradict the
// same player/team/time period") — REVISED after review:
//
//   The original version of this test hand-built a `baseball_player_
//   aggregates` fixture with ZERO practice sessions to force Command
//   Center's blended average to equal Stats Center's game-only average — a
//   fixture that bypassed `seedTeamStats()` entirely. A review of this PR
//   caught that this overclaims what Phase 0 delivers: for any
//   REALISTICALLY-seeded player (the seed script picks `stat_type:
//   'practice'` for ~40% of every player's sessions), Command Center's
//   `career_avg` (which BLENDS game + practice sessions) and Stats Center's
//   `battingAll.avg` (game-only) still legitimately disagree — reconciling
//   THAT is a later #379 phase (migrating Command Center behind the shared
//   `legacy-stat-adapters.ts` module), not this one.
//
//   This revision runs the ACTUAL `seedTeamStats()` reconciliation path
//   (same import the sibling smoke test uses — not a hand-built fixture)
//   with a realistic game+practice session mix (deterministic `mulberry32`
//   PRNG, not `Math.random()`, so this stays reproducible and flake-free)
//   and pins BOTH halves of the true picture:
//     1. What Phase 0 DOES reconcile: the GAME-CONTEXT number agrees
//        between the two layers. Stats Center's box-score-derived
//        `battingAll.avg` and the legacy aggregate's OWN game-only figure
//        (`game_avg`) are the identical `hits / at-bats` computed from the
//        identical game-type sessions via two independent code paths — no
//        drift in the underlying game data itself.
//     2. What Phase 0 does NOT (yet) reconcile: Command Center's DISPLAYED
//        `careerAvg` (game+practice blended) still diverges from Stats
//        Center's DISPLAYED `battingAll.avg` (game-only) for this realistic
//        player. That is an open Phase 0 gap, not a false "reconciled"
//        claim — see docs/baseball/stats-architecture.md's Phase 0 status
//        note.
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
import { seedTeamStats } from '../../../../scripts/seed-baseball-stats.mjs';

const TEAM_ID = 'team-1';
const SEASON = 2026;
// Fixed mid-year timestamp — decoupled from the real "today" so this test
// can never flake near a calendar-year boundary regardless of when CI runs
// it (mirrors the sibling smoke test's rationale).
const FIXED_NOW = Date.UTC(SEASON, 5, 15);

// Deterministic PRNG (mulberry32) — the same implementation already used by
// scripts/seed-baseball-box-scores.mjs for reproducible seed data. Unlike a
// constant-value stub (which would deterministically pick the SAME
// stat_type for every session — fine for a minimal smoke check, but not a
// realistic player), this produces a genuinely varied, realistic game +
// practice session mix while staying 100% reproducible across CI runs.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Chosen empirically (verified by this file's own sanity test below): this
// seed's session mix gives the player below BOTH game and practice at-bats,
// not the degenerate all-game case a constant-value RNG would produce. If a
// future change to the seed script's draw order ever made this seed
// degenerate, the sanity test fails loudly instead of this file silently
// going vacuous again.
const REALISTIC_SEED = 20260379;

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

const members = [
  {
    team_id: TEAM_ID,
    player_id: 'p1',
    jersey_number: 24,
    baseball_players: { id: 'p1', first_name: 'Mike', last_name: 'Trout', primary_position: 'CF' },
  },
];

describe('Command Center vs Stats Center drift (#379)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- seedTeamStats is imported from a plain .mjs script (no ambient types); its return shape is asserted on directly below.
  let summaries: any;

  beforeEach(async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: seedAuthorizedTeam(),
      rpc: {
        recalculate_baseball_season_stats: async () => ({ data: null, error: null }),
      },
    });

    // Exercise the REAL reconciled seed logic — not a hand-built fixture —
    // with a realistic (deterministic, reproducible) game+practice mix.
    summaries = await seedTeamStats(fake, {
      teamId: TEAM_ID,
      coachId: 'coach-1',
      members,
      dryRun: false,
      randomFn: mulberry32(REALISTIC_SEED),
      now: FIXED_NOW,
      log: false,
    });
  });

  it('sanity: this seed is realistic — the player has BOTH game and practice at-bats, not the degenerate all-game case', () => {
    const p1 = summaries.find((s: { playerId: string }) => s.playerId === 'p1');
    expect(p1).toBeTruthy();
    expect(p1.practiceAtBats).toBeGreaterThan(0);
    expect(p1.gameBoxScoreCount).toBeGreaterThan(0);
  });

  it('reconciled: the GAME-CONTEXT number agrees between the two layers (no drift in the underlying game data)', async () => {
    const p1 = summaries.find((s: { playerId: string }) => s.playerId === 'p1');
    const statsCenter = await getStatsCenter(TEAM_ID, { seasonYear: SEASON });
    expect(statsCenter.authorized).toBe(true);

    const scPlayer = statsCenter.rows.find((r) => r.playerId === 'p1');
    expect(scPlayer).toBeTruthy();
    expect(scPlayer!.noData).toBe(false);

    // Stats Center's box-score-derived game average and the legacy
    // aggregate's OWN game-only average (game_avg — computed independently,
    // straight from the same underlying session data) must be the identical
    // number: this is the actual #379 reconciliation this seed script
    // delivers.
    expect(scPlayer!.battingAll.avg).toBeCloseTo(p1.aggregateRow.game_avg as number, 3);
  });

  it("KNOWN OPEN GAP: Command Center's blended average still diverges from Stats Center's game-only average for a realistic player", async () => {
    const p1 = summaries.find((s: { playerId: string }) => s.playerId === 'p1');
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

    // Command Center still reads baseball_player_aggregates.career_avg
    // directly (grandfathered — see stat-layer-manifest.ts), which BLENDS
    // this player's game AND practice sessions. Since this player has real
    // practice at-bats (asserted in the sanity test above), that blended
    // number is NOT the same as Stats Center's game-only battingAll.avg —
    // Phase 0 does not claim otherwise. Reconciling these two DISPLAYED
    // numbers requires migrating Command Center behind the shared
    // legacy-stat-adapters.ts module, a later #379 phase (see
    // docs/baseball/stats-architecture.md).
    expect(p1.practiceAtBats).toBeGreaterThan(0);
    expect(ccPlayer!.careerAvg).not.toBeCloseTo(scPlayer!.battingAll.avg as number, 3);
    // ...and the gap is exactly explained by the blend: CC's number equals
    // the FULL (game+practice) aggregate average, not the game-only one.
    expect(ccPlayer!.careerAvg).toBeCloseTo(p1.aggregateRow.career_avg as number, 3);
  });
});
