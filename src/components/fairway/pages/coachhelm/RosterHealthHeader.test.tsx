// @vitest-environment jsdom
/**
 * ============================================================================
 * RosterHealthHeader — Wave 2 extraction from PlayersGridView.tsx.
 * ----------------------------------------------------------------------------
 * Pure-logic coverage for `computeRosterHealth` / `computeNeedsAttention`
 * (the SAME computation PlayersGridView's own suite exercises indirectly by
 * mounting the whole grid) plus a render smoke test for the instrument
 * itself, now that the Roster page is a second consumer of both.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  computeRosterHealth,
  computeNeedsAttention,
  RosterHealthHeader,
  NEEDS_ATTENTION_LIST_CAP,
} from './RosterHealthHeader';
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

describe('RosterHealthHeader — render', () => {
  it('renders the honest zero-roster state when there are no players', () => {
    render(
      <RosterHealthHeader
        health={computeRosterHealth([], [], {})}
        needs={[]}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.getByText('Who needs your attention')).toBeInTheDocument();
    expect(screen.getByText(/Awaiting roster/)).toBeInTheDocument();
  });

  it('renders the ranked needs list and routes "Add focus area" with the player id', async () => {
    const onAdd = vi.fn();
    const players = [player({ id: 'p1', first_name: 'Alex', last_name: 'Kim' })];
    const focusAreas: PlayersGridFocusArea[] = [];
    const playerStats: Record<string, PlayersGridStats> = { p1: stats({ recent_trend: 'declining' }) };
    const rows: RosterRow[] = [{ player: players[0]!, stats: playerStats.p1, activeCount: 0, completedCount: 0 }];

    render(
      <RosterHealthHeader
        health={computeRosterHealth(players, focusAreas, playerStats)}
        needs={computeNeedsAttention(rows)}
        onAdd={onAdd}
      />,
    );

    expect(screen.getAllByText('Alex Kim').length).toBeGreaterThan(0);
    const addButton = screen.getByRole('button', { name: 'Add focus area' });
    addButton.click();
    expect(onAdd).toHaveBeenCalledWith('p1');
  });

  it('prints a scoring average to a tenth, never the raw float', () => {
    // A coach saw "75.58333333333334 avg" on this row: `avg_score` is a raw
    // mean off the stats cache and carries full float precision.
    const players = [player({ id: 'p1', first_name: 'Alex', last_name: 'Kim' })];
    const playerStats: Record<string, PlayersGridStats> = {
      p1: stats({ recent_trend: 'declining', avg_score: 75.58333333333334 }),
    };
    const rows: RosterRow[] = [
      { player: players[0]!, stats: playerStats.p1, activeCount: 0, completedCount: 0 },
    ];

    render(
      <RosterHealthHeader
        health={computeRosterHealth(players, [], playerStats)}
        needs={computeNeedsAttention(rows)}
        onAdd={vi.fn()}
      />,
    );

    expect(screen.getByText('75.6 avg')).toBeInTheDocument();
    expect(screen.queryByText(/75\.58333/)).not.toBeInTheDocument();
  });

  it('caps the visible needs list at NEEDS_ATTENTION_LIST_CAP and says so honestly', () => {
    const flagged = Array.from({ length: NEEDS_ATTENTION_LIST_CAP + 2 }, (_, i) =>
      player({ id: `p${i}`, first_name: `Player`, last_name: `${i}` }),
    );
    // One extra, NOT-flagged player (covered + improving) so totalPlayers
    // differs numerically from needs.length — the assertions below must not
    // collide on the same digit rendered by two different instruments.
    const covered = player({ id: 'covered', first_name: 'Covered', last_name: 'Player' });
    const players = [...flagged, covered];

    const playerStats: Record<string, PlayersGridStats> = {};
    for (const p of flagged) playerStats[p.id] = stats({ recent_trend: 'declining' });
    playerStats[covered.id] = stats({ recent_trend: 'improving' });

    const rows: RosterRow[] = [
      ...flagged.map((p) => ({ player: p, stats: playerStats[p.id], activeCount: 0, completedCount: 0 })),
      { player: covered, stats: playerStats[covered.id], activeCount: 1, completedCount: 0 },
    ];
    const focusAreas: PlayersGridFocusArea[] = [focusArea({ player_id: covered.id, status: 'active' })];

    render(
      <RosterHealthHeader
        health={computeRosterHealth(players, focusAreas, playerStats)}
        needs={computeNeedsAttention(rows)}
        onAdd={vi.fn()}
      />,
    );

    // Header count stays the HONEST total (distinct from totalPlayers, which
    // is one higher thanks to the covered player above)...
    expect(screen.getByText(String(NEEDS_ATTENTION_LIST_CAP + 2))).toBeInTheDocument();
    // ...but only the capped number of "Add focus area" rows render.
    expect(screen.getAllByRole('button', { name: 'Add focus area' })).toHaveLength(NEEDS_ATTENTION_LIST_CAP);
    expect(screen.getByText(/more player/)).toBeInTheDocument();
  });
});

/**
 * ---------------------------------------------------------------------------
 * A roster with NO focus areas at all is a program that hasn't started, not a
 * program in trouble. Observed live on Guilford: 12 active players, every one
 * with rounds logged, ZERO focus areas in `golf_focus_areas` — so every player
 * matched `rounds > 0 && uncoached` and the instrument led with
 *
 *     12  players to look at — trending down or without a focus area.
 *
 * which reads as twelve problems the coach has let pile up. Underneath it, the
 * outcome panel showed "AWAITING OUTCOMES — 0 OF 1", whose `need: 1` implies
 * one outcome is pending a verdict when nothing has been prescribed at all.
 *
 * The triage framing is only meaningful once focus areas exist to be missing.
 * ------------------------------------------------------------------------- */
describe('RosterHealthHeader — a roster with no focus areas yet', () => {
  /** 12 players, all with rounds, none coached — the Guilford shape. */
  function bareRoster() {
    const players = Array.from({ length: 12 }, (_, i) =>
      player({ id: `p${i}`, first_name: 'Player', last_name: `${i}` }),
    );
    const playerStats: Record<string, PlayersGridStats> = {};
    for (const p of players) playerStats[p.id] = stats({ rounds_played: 6, recent_trend: 'stable' });
    const rows: RosterRow[] = players.map((p) => ({
      player: p,
      stats: playerStats[p.id]!,
      activeCount: 0,
      completedCount: 0,
    }));
    return { players, focusAreas: [] as PlayersGridFocusArea[], playerStats, rows };
  }

  it('does not frame an un-started program as N players to look at', () => {
    const { players, focusAreas, playerStats, rows } = bareRoster();
    render(
      <RosterHealthHeader
        health={computeRosterHealth(players, focusAreas, playerStats)}
        needs={computeNeedsAttention(rows)}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.queryByText(/players to look at/)).not.toBeInTheDocument();
    expect(screen.getByText(/none set on this roster yet/)).toBeInTheDocument();
  });

  it('still lists the players so the coach knows where to start', () => {
    const { players, focusAreas, playerStats, rows } = bareRoster();
    render(
      <RosterHealthHeader
        health={computeRosterHealth(players, focusAreas, playerStats)}
        needs={computeNeedsAttention(rows)}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Add focus area' })).toHaveLength(
      NEEDS_ATTENTION_LIST_CAP,
    );
  });

  it('does not claim an outcome is pending when nothing was ever prescribed', () => {
    const { players, focusAreas, playerStats, rows } = bareRoster();
    render(
      <RosterHealthHeader
        health={computeRosterHealth(players, focusAreas, playerStats)}
        needs={computeNeedsAttention(rows)}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.queryByText('0 of 1')).not.toBeInTheDocument();
    expect(screen.queryByText(/Awaiting outcomes/)).not.toBeInTheDocument();
  });

  it('counts every prescribed area as awaiting a verdict once areas DO exist', () => {
    const { players, playerStats, rows } = bareRoster();
    // Three areas prescribed, none carrying an outcome yet: the honest reading
    // is "0 of 3 recorded", not "0 of 1".
    const focusAreas = [
      focusArea({ id: 'fa1', player_id: 'p0', status: 'active' }),
      focusArea({ id: 'fa2', player_id: 'p1', status: 'active' }),
      focusArea({ id: 'fa3', player_id: 'p2', status: 'completed' }),
    ];
    render(
      <RosterHealthHeader
        health={computeRosterHealth(players, focusAreas, playerStats)}
        needs={computeNeedsAttention(rows)}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.getByText(/Awaiting outcomes/)).toBeInTheDocument();
    expect(screen.getByText('0 of 3')).toBeInTheDocument();
  });
});
