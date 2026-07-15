// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { RosterReadModel } from '../read-models/roster';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

// Imported AFTER the mock registration above so getRoster resolves the
// mocked createClient, not the real Supabase server client (mirrors the
// pattern already established in command-center.test.ts).
const { getRoster } = await import('../read-models/roster');

describe('roster read model shape (#411)', () => {
  it('distinguishes roster failure from healthy empty roster', () => {
    const failed: RosterReadModel = {
      teamId: 'team-1',
      authorized: true,
      members: [],
      aggregates: {},
      rosterError: true,
      aggregatesError: false,
    };
    const empty: RosterReadModel = {
      teamId: 'team-1',
      authorized: true,
      members: [],
      aggregates: {},
      rosterError: false,
      aggregatesError: false,
    };

    expect(failed.rosterError).toBe(true);
    expect(empty.rosterError).toBe(false);
    expect(failed.members).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// getRoster() integration (#379) — pins that the read model resolves each
// player's aggregate figures through the shared legacy-stat-adapters.ts
// precedence rule (via roster-aggregates-merge.ts + the new
// roster-legacy-aggregates-source.ts fetch) rather than a hand-rolled join,
// now that roster.ts no longer references the deprecated table directly.
// -----------------------------------------------------------------------------
describe('getRoster — adapter precedence (#379)', () => {
  const TEAM_ID = 'team-adapter-1';
  const CURRENT_YEAR = new Date().getFullYear();

  function member(id: string, playerId: string) {
    return {
      id,
      team_id: TEAM_ID,
      jersey_number: 1,
      joined_at: '2026-01-01T00:00:00.000Z',
      status: 'active',
      player: {
        id: playerId,
        first_name: 'Test',
        last_name: playerId,
        email: null,
        primary_position: 'SS',
        secondary_position: null,
        grad_year: 2027,
        city: null,
        state: null,
        avatar_url: null,
        recruiting_activated: false,
      },
    };
  }

  function legacyRow(playerId: string, careerAvg: number) {
    return {
      player_id: playerId,
      team_id: TEAM_ID,
      total_sessions: 8,
      practice_sessions: 4,
      game_sessions: 4,
      career_avg: careerAvg,
      career_obp: careerAvg,
      career_slg: careerAvg,
      career_ops: careerAvg,
      practice_avg: careerAvg,
      game_avg: careerAvg,
      pressure_gap: null,
      recent_trend: null,
      trend_magnitude: null,
      trend_velocity: null,
      last_5_avg: null,
      last_10_avg: null,
      season_avg: careerAvg,
      avg_pitch_velocity: null,
      max_pitch_velocity: null,
      development_stage: null,
      last_calculated_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
  }

  function baseTables(overrides: Record<string, unknown[]> = {}) {
    return {
      baseball_coaches: [{ id: 'coach-1', user_id: 'user-1' }],
      baseball_team_coach_staff: [
        { id: 'staff-1', team_id: TEAM_ID, coach_id: 'coach-1', status: 'active' },
      ],
      baseball_team_members: [
        member('m1', 'p-boxscore'),
        member('m2', 'p-legacy-only'),
        member('m3', 'p-pitcher-null-rate'),
      ],
      baseball_player_aggregates: [
        legacyRow('p-boxscore', 0.2),
        legacyRow('p-legacy-only', 0.25),
        legacyRow('p-pitcher-null-rate', 0.33),
      ],
      baseball_player_season_stats: [],
      ...overrides,
    };
  }

  it('prefers box-score/season data over the legacy row when both exist', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: baseTables({
        baseball_player_season_stats: [
          {
            player_id: 'p-boxscore',
            team_id: TEAM_ID,
            season_year: CURRENT_YEAR,
            avg: 0.4,
            obp: 0.45,
            slg: 0.5,
            ops: 0.95,
            g: 12,
            last_updated: '2026-07-01T00:00:00.000Z',
          },
        ],
      }),
    });

    const result = await getRoster(TEAM_ID);

    expect(result.authorized).toBe(true);
    expect(result.rosterError).toBe(false);
    expect(result.aggregates['p-boxscore']?.career_avg).toBe(0.4);
    expect(result.aggregates['p-boxscore']?.game_sessions).toBe(12);
  });

  it('falls back to the legacy row untouched for a player with no season-stats row', async () => {
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables: baseTables() });

    const result = await getRoster(TEAM_ID);

    expect(result.aggregates['p-legacy-only']?.career_avg).toBe(0.25);
  });

  it('keeps the legacy career_avg when the box-score row has a null rate (pure-pitcher case)', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: baseTables({
        baseball_player_season_stats: [
          {
            player_id: 'p-pitcher-null-rate',
            team_id: TEAM_ID,
            season_year: CURRENT_YEAR,
            avg: null,
            obp: null,
            slg: null,
            ops: null,
            g: 0,
            last_updated: '2026-07-01T00:00:00.000Z',
          },
        ],
      }),
    });

    const result = await getRoster(TEAM_ID);

    expect(result.aggregates['p-pitcher-null-rate']?.career_avg).toBe(0.33);
  });

  it('returns unauthorized for a non-staff user without touching stat tables', async () => {
    fake = createFakeSupabase({
      user: { id: 'stranger' },
      tables: baseTables(),
    });

    const result = await getRoster(TEAM_ID);

    expect(result.authorized).toBe(false);
    expect(result.members).toEqual([]);
    expect(result.aggregates).toEqual({});
  });
});
