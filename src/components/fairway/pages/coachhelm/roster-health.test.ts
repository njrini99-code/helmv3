/**
 * ============================================================================
 * roster-health — pure-logic coverage for `computeRosterHealth` /
 * `computeNeedsAttention`, moved here from `RosterHealthHeader.test.tsx` when
 * that file's dead `RosterHealthHeader` JSX component (and the render tests
 * that only exercised it) were deleted. These two functions' only remaining
 * caller is `FairwayCoachRoster.tsx`.
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import { computeRosterHealth, computeNeedsAttention } from './roster-health';
import type { PlayersGridPlayer, PlayersGridFocusArea, PlayersGridStats, RosterRow } from './PlayersGridView';

function player(overrides: Partial<PlayersGridPlayer> = {}): PlayersGridPlayer {
  return {
    id: 'p1',
    first_name: 'Jordan',
    last_name: 'Lee',
    avatar_url: null,
    graduation_year: 2027,
    handicap: 2,
    hometown: null,
    state: null,
    ...overrides,
  };
}

function stats(overrides: Partial<PlayersGridStats> = {}): PlayersGridStats {
  return {
    rounds_played: 5,
    avg_score: 74.2,
    avg_putts: null,
    fairway_pct: null,
    gir_pct: null,
    best_score: null,
    recent_trend: null,
    ...overrides,
  };
}

function focusArea(overrides: Partial<PlayersGridFocusArea> = {}): PlayersGridFocusArea {
  return {
    id: 'fa1',
    area_type: 'general',
    title: null,
    player_id: 'p1',
    ...overrides,
  };
}

describe('computeRosterHealth', () => {
  it('is honestly empty for a zero-player roster', () => {
    const health = computeRosterHealth([], [], {});
    expect(health.totalPlayers).toBe(0);
    expect(health.coverage).toBe(0);
    expect(health.totalOutcomes).toBe(0);
  });

  it('counts coverage from active/in_progress focus areas only', () => {
    const players = [player({ id: 'p1' }), player({ id: 'p2' }), player({ id: 'p3' })];
    const focusAreas = [
      focusArea({ player_id: 'p1', status: 'active' }),
      focusArea({ player_id: 'p2', status: 'proposed' }), // not yet accepted — doesn't count
      focusArea({ player_id: 'p2', status: 'declined' }), // rejected — doesn't count
    ];
    const health = computeRosterHealth(players, focusAreas, {});
    expect(health.totalPlayers).toBe(3);
    expect(health.playersWithActive).toBe(1);
    expect(health.coverage).toBeCloseTo(1 / 3);
    expect(health.activeAreas).toBe(1);
  });

  it('tallies recorded outcomes (improved/no_change/worsened) verbatim', () => {
    const focusAreas = [
      focusArea({ id: 'a', outcome_status: 'improved' }),
      focusArea({ id: 'b', outcome_status: 'improved' }),
      focusArea({ id: 'c', outcome_status: 'no_change' }),
      focusArea({ id: 'd', outcome_status: 'worsened' }),
      focusArea({ id: 'e', outcome_status: null }), // not yet recorded — excluded
    ];
    const health = computeRosterHealth([player()], focusAreas, {});
    expect(health.outcomeTally).toEqual({ improved: 2, noChange: 1, worsened: 1 });
    expect(health.totalOutcomes).toBe(4);
  });

  it('counts players with at least one recorded round from the props-fed stats record (no recompute)', () => {
    const players = [player({ id: 'p1' }), player({ id: 'p2' })];
    const playerStats: Record<string, PlayersGridStats> = {
      p1: stats({ rounds_played: 3 }),
      p2: stats({ rounds_played: 0 }),
    };
    const health = computeRosterHealth(players, [], playerStats);
    expect(health.playersWithRounds).toBe(1);
  });
});

describe('computeNeedsAttention', () => {
  function row(overrides: Partial<RosterRow> = {}): RosterRow {
    return {
      player: player(),
      stats: stats(),
      activeCount: 0,
      completedCount: 0,
      ...overrides,
    };
  }

  it('flags a declining, uncoached player as the highest priority', () => {
    const rows = [row({ stats: stats({ recent_trend: 'declining' }), activeCount: 0 })];
    const needs = computeNeedsAttention(rows);
    expect(needs).toHaveLength(1);
    expect(needs[0]!.priority).toBe(3);
    expect(needs[0]!.reason).toBe('Trending down · no focus area');
  });

  it('flags a declining but coached player at a lower priority', () => {
    const rows = [row({ stats: stats({ recent_trend: 'declining' }), activeCount: 1 })];
    const needs = computeNeedsAttention(rows);
    expect(needs[0]!.priority).toBe(2);
    expect(needs[0]!.reason).toBe('Trending down');
  });

  it('flags a player with rounds but no focus area at the lowest triage priority', () => {
    const rows = [row({ stats: stats({ recent_trend: 'stable', rounds_played: 4 }), activeCount: 0 })];
    const needs = computeNeedsAttention(rows);
    expect(needs[0]!.priority).toBe(1);
    expect(needs[0]!.reason).toBe('No focus area yet');
  });

  it('does not flag a covered, non-declining player', () => {
    const rows = [row({ stats: stats({ recent_trend: 'improving', rounds_played: 4 }), activeCount: 1 })];
    expect(computeNeedsAttention(rows)).toHaveLength(0);
  });

  it('does not flag a player with no rounds and no focus area (nothing to triage yet)', () => {
    const rows = [row({ stats: stats({ recent_trend: null, rounds_played: 0 }), activeCount: 0 })];
    expect(computeNeedsAttention(rows)).toHaveLength(0);
  });

  it('sorts by priority, then by avg score descending within the same priority', () => {
    const rows = [
      row({
        player: player({ id: 'low-score' }),
        stats: stats({ recent_trend: 'declining', avg_score: 70 }),
        activeCount: 0,
      }),
      row({
        player: player({ id: 'high-score' }),
        stats: stats({ recent_trend: 'declining', avg_score: 90 }),
        activeCount: 0,
      }),
    ];
    const needs = computeNeedsAttention(rows);
    expect(needs.map((n) => n.row.player.id)).toEqual(['high-score', 'low-score']);
  });
});
