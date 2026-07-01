// =============================================================================
// src/contracts/baseball/stats/game-vs-practice-separation.test.ts
//
// PRODUCT TRUTH THIS FILE PINS:
//   `baseball_player_season_stats` is a single pre-aggregated row per
//   (player, season) and does NOT distinguish official games from
//   scrimmages. The Stats Center read model (`getStatsCenter`) derives the
//   honest split itself from per-game box scores joined to
//   `baseball_games.game_type`: `battingOfficial` / `pitchingOfficial` must
//   NEVER absorb a scrimmage row, while `battingAll` / `pitchingAll` must
//   include both. A coach toggling "official only" must see a real subset,
//   not a relabeled superset.
//
// Source of truth: `getStatsCenter` in
// `src/lib/baseball/read-models/stats-center.ts`.
// =============================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

import { getStatsCenter } from '@/lib/baseball/read-models/stats-center';

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
        baseball_players: {
          id: 'p1',
          first_name: 'Mike',
          last_name: 'Trout',
          primary_position: 'CF',
        },
      },
    ],
  };
}

beforeEach(() => {
  fake = createFakeSupabase({ user: { id: 'user-1' } });
});

describe('Game-vs-practice separation (#377)', () => {
  it('battingOfficial/pitchingOfficial exclude scrimmage-typed games; battingAll/pitchingAll include them', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        ...seedAuthorizedTeam(),
        baseball_games: [
          { id: 'g-game', team_id: TEAM_ID, game_type: 'game', game_date: `${SEASON}-04-01` },
          { id: 'g-scrim', team_id: TEAM_ID, game_type: 'scrimmage', game_date: `${SEASON}-04-02` },
        ],
        baseball_box_score_batting: [
          { id: 'bb-1', team_id: TEAM_ID, game_id: 'g-game', player_id: 'p1', ab: 4, h: 2 },
          { id: 'bb-2', team_id: TEAM_ID, game_id: 'g-scrim', player_id: 'p1', ab: 4, h: 4 },
        ],
        baseball_box_score_pitching: [
          { id: 'bp-1', team_id: TEAM_ID, game_id: 'g-game', player_id: 'p1', ip: 6, er: 1 },
          { id: 'bp-2', team_id: TEAM_ID, game_id: 'g-scrim', player_id: 'p1', ip: 3, er: 0 },
        ],
        baseball_player_season_stats: [],
      },
    });

    const result = await getStatsCenter(TEAM_ID, { seasonYear: SEASON });
    expect(result.authorized).toBe(true);
    const row = result.rows.find((r) => r.playerId === 'p1');
    expect(row).toBeTruthy();

    // OFFICIAL splits see only the game-typed line.
    expect(row!.battingOfficial.g).toBe(1);
    expect(row!.battingOfficial.ab).toBe(4);
    expect(row!.battingOfficial.h).toBe(2);
    expect(row!.pitchingOfficial.g).toBe(1);
    expect(row!.pitchingOfficial.ip).toBe(6);

    // ALL splits absorb BOTH the game and the scrimmage line.
    expect(row!.battingAll.g).toBe(2);
    expect(row!.battingAll.ab).toBe(8);
    expect(row!.battingAll.h).toBe(6);
    expect(row!.pitchingAll.g).toBe(2);
    expect(row!.pitchingAll.ip).toBe(9);

    expect(result.summary.officialGames).toBe(1);
    expect(result.summary.scrimmages).toBe(1);
  });

  it('a game row with no explicit game_type defaults to official (honest default, never silently scrimmage)', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        ...seedAuthorizedTeam(),
        baseball_games: [
          { id: 'g-untagged', team_id: TEAM_ID, game_type: null, game_date: `${SEASON}-04-01` },
        ],
        baseball_box_score_batting: [
          { id: 'bb-1', team_id: TEAM_ID, game_id: 'g-untagged', player_id: 'p1', ab: 3, h: 1 },
        ],
        baseball_box_score_pitching: [],
        baseball_player_season_stats: [],
      },
    });

    const result = await getStatsCenter(TEAM_ID, { seasonYear: SEASON });
    const row = result.rows.find((r) => r.playerId === 'p1');
    expect(row!.battingOfficial.g).toBe(1);
    expect(result.summary.officialGames).toBe(1);
    expect(result.summary.scrimmages).toBe(0);
  });
});
