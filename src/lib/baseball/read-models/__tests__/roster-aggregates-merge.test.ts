// =============================================================================
// Unit tests for mergeSeasonStatsIntoAggregates — the PURE merge logic behind
// the roster-stat-staleness fix (#roster-stat-staleness). Box-score-canonical
// season stats (baseball_player_season_stats) must win over the legacy
// baseball_player_aggregates row (CSV/manual stat-log path) for any player who
// has real, current season data, while never regressing a player who ONLY has
// the legacy row and no season_stats row at all.
// =============================================================================

import { describe, it, expect } from 'vitest';

import { mergeSeasonStatsIntoAggregates } from '../roster-aggregates-merge';
import type { BaseballPlayerAggregates } from '@/lib/types';

function legacyAggregate(p: Partial<BaseballPlayerAggregates>): BaseballPlayerAggregates {
  return {
    player_id: 'p1',
    team_id: 'team1',
    total_sessions: 0,
    practice_sessions: 0,
    game_sessions: 0,
    career_avg: null,
    career_obp: null,
    career_slg: null,
    career_ops: null,
    practice_avg: null,
    game_avg: null,
    pressure_gap: null,
    recent_trend: null,
    trend_magnitude: null,
    trend_velocity: null,
    last_5_avg: null,
    last_10_avg: null,
    season_avg: null,
    avg_pitch_velocity: null,
    max_pitch_velocity: null,
    development_stage: null,
    last_calculated_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...p,
  };
}

describe('mergeSeasonStatsIntoAggregates', () => {
  it('creates a new aggregate entry for a player with season stats but no legacy row', () => {
    const merged = mergeSeasonStatsIntoAggregates(
      {},
      [{ player_id: 'p1', avg: 0.333, obp: 0.4, slg: 0.5, ops: 0.9, g: 12, last_updated: '2026-06-01T00:00:00.000Z' }],
      'team1',
    );

    expect(merged.p1).toBeDefined();
    expect(merged.p1?.career_avg).toBe(0.333);
    expect(merged.p1?.career_ops).toBe(0.9);
    // Box-score game count IS the honest "sessions" figure here — no legacy
    // row exists, so total_sessions must come from `g`, not stay at 0.
    expect(merged.p1?.total_sessions).toBe(12);
    expect(merged.p1?.last_calculated_at).toBe('2026-06-01T00:00:00.000Z');
  });

  it('prefers season-stats figures over a legacy aggregates row for the same player', () => {
    const legacy = { p1: legacyAggregate({ career_avg: 0.1, career_ops: 0.3, total_sessions: 40 }) };

    const merged = mergeSeasonStatsIntoAggregates(
      legacy,
      [{ player_id: 'p1', avg: 0.35, obp: 0.42, slg: 0.55, ops: 0.97, g: 20, last_updated: '2026-06-15T00:00:00.000Z' }],
      'team1',
    );

    // Season-stats rate figures win — they're the box-score-canonical source.
    expect(merged.p1?.career_avg).toBe(0.35);
    expect(merged.p1?.career_ops).toBe(0.97);
    // total_sessions takes the MAX of legacy vs. box-score game count, so a
    // team with a longer legacy history never regresses to a smaller number.
    expect(merged.p1?.total_sessions).toBe(40);
  });

  it('does not mutate the input aggregates map', () => {
    const legacy = { p1: legacyAggregate({}) };
    const merged = mergeSeasonStatsIntoAggregates(
      legacy,
      [{ player_id: 'p1', avg: 0.3, obp: null, slg: null, ops: null, g: 5, last_updated: null }],
      'team1',
    );

    expect(legacy.p1?.career_avg).toBeNull();
    expect(merged).not.toBe(legacy);
    expect(merged.p1).not.toBe(legacy.p1);
  });

  it('leaves a player with only a legacy row (no season_stats row) untouched', () => {
    const legacy = { p1: legacyAggregate({ career_avg: 0.28, total_sessions: 15 }) };
    const merged = mergeSeasonStatsIntoAggregates(legacy, [], 'team1');

    expect(merged.p1?.career_avg).toBe(0.28);
    expect(merged.p1?.total_sessions).toBe(15);
  });

  it('falls back to the legacy career/game/season rate figures when a box-score row exists for the player but its rate fields are null (pure-pitcher/DH shape, g=0 this season)', () => {
    // recalculate_baseball_season_stats sets avg/obp/slg/ops to NULL whenever
    // v_ab/v_pa = 0. A pure pitcher who appears in a completed game's
    // pitching box score (but never bats) gets exactly this shape: a real
    // baseball_player_season_stats row with g=0 and every rate field null.
    // Per-field, the existing legacy value must still be shown rather than
    // the player regressing from "shows old numbers" to "shows nothing".
    const legacy = {
      p1: legacyAggregate({
        career_avg: 0.28,
        career_obp: 0.35,
        career_slg: 0.4,
        career_ops: 0.75,
        game_avg: 0.28,
        season_avg: 0.28,
      }),
    };

    const merged = mergeSeasonStatsIntoAggregates(
      legacy,
      [{ player_id: 'p1', avg: null, obp: null, slg: null, ops: null, g: 0, last_updated: '2026-06-20T00:00:00.000Z' }],
      'team1',
    );

    expect(merged.p1?.career_avg).toBe(0.28);
    expect(merged.p1?.career_obp).toBe(0.35);
    expect(merged.p1?.career_slg).toBe(0.4);
    expect(merged.p1?.career_ops).toBe(0.75);
    expect(merged.p1?.game_avg).toBe(0.28);
    expect(merged.p1?.season_avg).toBe(0.28);
  });

  it('still lets a genuine box-score value of 0 win over a nonzero legacy figure (box-score truth, once it exists, is never overridden by the legacy fallback)', () => {
    const legacy = {
      p1: legacyAggregate({ career_avg: 0.28, career_obp: 0.35, career_slg: 0.4, career_ops: 0.75 }),
    };

    const merged = mergeSeasonStatsIntoAggregates(
      legacy,
      [{ player_id: 'p1', avg: 0, obp: 0, slg: 0, ops: 0, g: 8, last_updated: '2026-06-20T00:00:00.000Z' }],
      'team1',
    );

    // avg: 0 is a real, current box-score figure (e.g. an 0-for-many slump),
    // not an absent sample — nullish-coalescing fallback must not treat a
    // legitimate 0 as missing and resurrect the stale nonzero legacy value.
    expect(merged.p1?.career_avg).toBe(0);
    expect(merged.p1?.career_obp).toBe(0);
    expect(merged.p1?.career_slg).toBe(0);
    expect(merged.p1?.career_ops).toBe(0);
  });
});
