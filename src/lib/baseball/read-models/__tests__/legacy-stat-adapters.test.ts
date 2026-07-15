// =============================================================================
// Unit tests for legacy-stat-adapters.ts — the shared precedence rule (#379)
// every legacy-flat read-model migration builds on: box-score > legacy-
// fallback > no-data, a permanent practice carve-out, and null-safe
// event-derived fields.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  adaptLegacyPlayerStats,
  adaptLegacyStatsMap,
  type LegacyAggregateRow,
  type BoxScoreGameContextRow,
} from '../legacy-stat-adapters';

function legacyRow(overrides: Partial<LegacyAggregateRow> = {}): LegacyAggregateRow {
  return {
    player_id: 'p1',
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
    ...overrides,
  };
}

function boxScoreRow(overrides: Partial<BoxScoreGameContextRow> = {}): BoxScoreGameContextRow {
  return {
    player_id: 'p1',
    avg: 0.3,
    obp: 0.38,
    slg: 0.45,
    ops: 0.83,
    sessions: 10,
    last_updated: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('adaptLegacyPlayerStats — precedence tiers', () => {
  it('tags box-score as the source when a box-score row exists, even alongside a legacy row', () => {
    const result = adaptLegacyPlayerStats({
      playerId: 'p1',
      legacy: legacyRow({ career_avg: 0.1 }),
      boxScore: boxScoreRow({ avg: 0.35 }),
    });

    expect(result.sourceLayer).toBe('box-score');
    expect(result.game.avg).toBe(0.35);
  });

  it('never blends a box-score row field-by-field with the legacy row for the same player', () => {
    // Box-score row has a null obp (an unusual partial row); the legacy row
    // has a real career_obp. Box-score still wins outright — it must not
    // silently fall back to the legacy figure, which would double-report a
    // stale number as if it were canonical.
    const result = adaptLegacyPlayerStats({
      playerId: 'p1',
      legacy: legacyRow({ career_obp: 0.5 }),
      boxScore: boxScoreRow({ obp: null }),
    });

    expect(result.sourceLayer).toBe('box-score');
    expect(result.game.obp).toBeNull();
  });

  it('falls back to the legacy row when no box-score row exists for the player', () => {
    const result = adaptLegacyPlayerStats({
      playerId: 'p1',
      legacy: legacyRow({ career_avg: 0.28, career_obp: 0.36, career_slg: 0.4, career_ops: 0.76 }),
      boxScore: null,
    });

    expect(result.sourceLayer).toBe('legacy-fallback');
    expect(result.game.avg).toBe(0.28);
    expect(result.game.obp).toBe(0.36);
    expect(result.game.slg).toBe(0.4);
    expect(result.game.ops).toBe(0.76);
  });

  it('reports no-data (never a fabricated number) when neither source has a row', () => {
    const result = adaptLegacyPlayerStats({ playerId: 'p1', legacy: null, boxScore: null });

    expect(result.sourceLayer).toBe('no-data');
    expect(result.game.avg).toBeNull();
    expect(result.game.obp).toBeNull();
    expect(result.game.slg).toBeNull();
    expect(result.game.ops).toBeNull();
    expect(result.game.sessions).toBe(0);
    expect(result.totalSessions).toBe(0);
  });
});

describe('adaptLegacyPlayerStats — session counts (honest floor)', () => {
  it('takes the MAX of legacy and box-score session counts, never hiding real games', () => {
    const result = adaptLegacyPlayerStats({
      playerId: 'p1',
      legacy: legacyRow({ game_sessions: 40, total_sessions: 55 }),
      boxScore: boxScoreRow({ sessions: 12 }),
    });

    expect(result.game.sessions).toBe(40);
    expect(result.totalSessions).toBe(55);
  });

  it('uses the box-score count when it is larger than the legacy count', () => {
    const result = adaptLegacyPlayerStats({
      playerId: 'p1',
      legacy: legacyRow({ game_sessions: 3, total_sessions: 3 }),
      boxScore: boxScoreRow({ sessions: 20 }),
    });

    expect(result.game.sessions).toBe(20);
    expect(result.totalSessions).toBe(20);
  });
});

describe('adaptLegacyPlayerStats — practice carve-out', () => {
  it('always passes practice fields through from the legacy row, unaffected by box-score presence', () => {
    const withBoxScore = adaptLegacyPlayerStats({
      playerId: 'p1',
      legacy: legacyRow({ practice_avg: 0.42, practice_sessions: 9 }),
      boxScore: boxScoreRow(),
    });
    const withoutBoxScore = adaptLegacyPlayerStats({
      playerId: 'p1',
      legacy: legacyRow({ practice_avg: 0.42, practice_sessions: 9 }),
      boxScore: null,
    });

    expect(withBoxScore.practice).toEqual({ avg: 0.42, sessions: 9 });
    expect(withoutBoxScore.practice).toEqual({ avg: 0.42, sessions: 9 });
    // Practice never leaks into the game-context shape.
    expect(withBoxScore.game.avg).not.toBe(withBoxScore.practice.avg);
  });

  it('reports empty practice context (never fabricated) when there is no legacy row at all', () => {
    const result = adaptLegacyPlayerStats({ playerId: 'p1', legacy: null, boxScore: boxScoreRow() });

    expect(result.practice).toEqual({ avg: null, sessions: 0 });
  });
});

describe('adaptLegacyPlayerStats — event-derived fields (null-safe)', () => {
  it('defaults exit-velocity fields to null when no event input is given (no legacy equivalent exists)', () => {
    const result = adaptLegacyPlayerStats({
      playerId: 'p1',
      legacy: legacyRow(), // avg_pitch_velocity / max_pitch_velocity both null here
      boxScore: boxScoreRow(),
    });

    expect(result.event).toEqual({
      avgExitVelocity: null,
      maxExitVelocity: null,
      avgPitchVelocity: null,
      maxPitchVelocity: null,
    });
  });

  it('populates only the event-derived fields explicitly supplied, leaving the rest null', () => {
    const result = adaptLegacyPlayerStats({
      playerId: 'p1',
      legacy: null,
      boxScore: boxScoreRow(),
      event: { avgExitVelocity: 91.4 },
    });

    expect(result.event.avgExitVelocity).toBe(91.4);
    expect(result.event.maxExitVelocity).toBeNull();
    expect(result.event.avgPitchVelocity).toBeNull();
    expect(result.event.maxPitchVelocity).toBeNull();
  });

  it('falls back to the legacy avg/max pitch-velocity scalars when no event input is given — a legitimate, previously-captured fallback (#379 residual)', () => {
    const result = adaptLegacyPlayerStats({
      playerId: 'p1',
      legacy: legacyRow({ avg_pitch_velocity: 88, max_pitch_velocity: 95 }),
      boxScore: boxScoreRow(),
    });

    expect(result.event.avgPitchVelocity).toBe(88);
    expect(result.event.maxPitchVelocity).toBe(95);
    // Exit velocity has NO legacy column at all — stays null-safe even
    // though this same legacy row carries real pitch-velocity data.
    expect(result.event.avgExitVelocity).toBeNull();
    expect(result.event.maxExitVelocity).toBeNull();
  });

  it('prefers an explicit event-grain pitch-velocity reading over the legacy fallback when both are present', () => {
    const result = adaptLegacyPlayerStats({
      playerId: 'p1',
      legacy: legacyRow({ avg_pitch_velocity: 88, max_pitch_velocity: 95 }),
      boxScore: boxScoreRow(),
      event: { avgPitchVelocity: 92.3 },
    });

    expect(result.event.avgPitchVelocity).toBe(92.3);
    // maxPitchVelocity wasn't supplied in the event input -> falls back to
    // the legacy scalar independently, per-field (not all-or-nothing).
    expect(result.event.maxPitchVelocity).toBe(95);
  });

  it('reports null pitch-velocity (never fabricated) when neither an event reading nor a legacy row exists', () => {
    const result = adaptLegacyPlayerStats({
      playerId: 'p1',
      legacy: null,
      boxScore: boxScoreRow(),
    });

    expect(result.event.avgPitchVelocity).toBeNull();
    expect(result.event.maxPitchVelocity).toBeNull();
  });
});

describe('adaptLegacyStatsMap', () => {
  it('resolves every player across the union of legacy and box-score inputs with the correct tier', () => {
    const legacyAggregates = {
      legacyOnly: legacyRow({ player_id: 'legacyOnly', career_avg: 0.2 }),
      both: legacyRow({ player_id: 'both', career_avg: 0.1 }),
    };
    const boxScoreRows = [
      boxScoreRow({ player_id: 'boxOnly', avg: 0.4 }),
      boxScoreRow({ player_id: 'both', avg: 0.33 }),
    ];

    const result = adaptLegacyStatsMap({ legacyAggregates, boxScoreRows });

    expect(result.legacyOnly?.sourceLayer).toBe('legacy-fallback');
    expect(result.legacyOnly?.game.avg).toBe(0.2);

    expect(result.boxOnly?.sourceLayer).toBe('box-score');
    expect(result.boxOnly?.game.avg).toBe(0.4);

    expect(result.both?.sourceLayer).toBe('box-score');
    expect(result.both?.game.avg).toBe(0.33);
  });

  it('does not mutate its inputs', () => {
    const legacyAggregates = { p1: legacyRow({ career_avg: 0.2 }) };
    const boxScoreRows = [boxScoreRow({ avg: 0.4 })];

    const result = adaptLegacyStatsMap({ legacyAggregates, boxScoreRows });

    expect(legacyAggregates.p1?.career_avg).toBe(0.2);
    expect(result).not.toBe(legacyAggregates);
    expect(result.p1?.game.avg).toBe(0.4);
  });

  it('threads per-player event-derived fields through the batch form', () => {
    const legacyAggregates = { p1: legacyRow() };
    const boxScoreRows = [boxScoreRow()];
    const eventDerivedByPlayer = { p1: { avgExitVelocity: 88.2 } };

    const result = adaptLegacyStatsMap({ legacyAggregates, boxScoreRows, eventDerivedByPlayer });

    expect(result.p1?.event.avgExitVelocity).toBe(88.2);
    expect(result.p1?.event.avgPitchVelocity).toBeNull();
  });
});
