// =============================================================================
// Unit tests for roster-legacy-aggregates-source.ts (#379) — the sole
// remaining direct reader of the deprecated legacy aggregates table for the
// roster surfaces (roster.ts + RosterClient.tsx both call this instead of
// querying the table inline).
// =============================================================================

import { describe, it, expect } from 'vitest';

import { fetchRosterLegacyAggregates } from '../roster-legacy-aggregates-source';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';
import type { BaseballPlayerAggregates } from '@/lib/types';

function legacyRow(overrides: Partial<BaseballPlayerAggregates> = {}): BaseballPlayerAggregates {
  return {
    player_id: 'p1',
    team_id: 'team-1',
    total_sessions: 10,
    practice_sessions: 6,
    game_sessions: 4,
    career_avg: 0.31,
    career_obp: 0.4,
    career_slg: 0.5,
    career_ops: 0.9,
    practice_avg: 0.32,
    game_avg: 0.29,
    pressure_gap: null,
    recent_trend: null,
    trend_magnitude: null,
    trend_velocity: null,
    last_5_avg: null,
    last_10_avg: null,
    season_avg: 0.31,
    avg_pitch_velocity: null,
    max_pitch_velocity: null,
    development_stage: null,
    last_calculated_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('fetchRosterLegacyAggregates', () => {
  it('keys rows by player_id, scoped to the requested team', async () => {
    const fake: FakeSupabase = createFakeSupabase({
      tables: {
        baseball_player_aggregates: [
          legacyRow({ player_id: 'p1', team_id: 'team-1' }),
          legacyRow({ player_id: 'p2', team_id: 'team-1', career_avg: 0.27 }),
          legacyRow({ player_id: 'p3', team_id: 'team-OTHER' }),
        ] as unknown as Record<string, unknown>[],
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await fetchRosterLegacyAggregates(fake as any, 'team-1');

    expect(result.error).toBe(false);
    expect(Object.keys(result.aggregates).sort()).toEqual(['p1', 'p2']);
    expect(result.aggregates.p1?.career_avg).toBe(0.31);
    expect(result.aggregates.p2?.career_avg).toBe(0.27);
  });

  it('returns an empty, honest map when the team has no legacy rows', async () => {
    const fake: FakeSupabase = createFakeSupabase({
      tables: { baseball_player_aggregates: [] },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await fetchRosterLegacyAggregates(fake as any, 'team-empty');

    expect(result.error).toBe(false);
    expect(result.aggregates).toEqual({});
  });
});
