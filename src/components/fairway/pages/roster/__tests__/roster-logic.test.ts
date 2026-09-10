import { describe, it, expect } from 'vitest';
import {
  buildFocusOutcomes,
  buildRosterReadouts,
  buildRosterVerdict,
  buildScoreFieldRows,
  fieldDomain,
  filterRosterByQuery,
  playerName,
  rosterHealthInputs,
  shortDay,
  sortByTrend,
  sortRosterTable,
  subtractDays,
  windowStartFor,
} from '../roster-logic';
import { computeNeedsAttention, computeRosterHealth } from '@/components/fairway/pages/coachhelm/roster-health';
import type { PlayersGridFocusArea } from '@/components/fairway/pages/coachhelm/PlayersGridView';
import type { RosterPlayer } from '../FairwayPlayerCard';

function makePlayer(overrides: Partial<RosterPlayer> = {}): RosterPlayer {
  return {
    id: 'p1',
    first_name: 'Jordan',
    last_name: 'Lee',
    avatar_url: null,
    hometown: null,
    state: null,
    graduation_year: 2027,
    handicap: 2,
    status: 'active',
    rounds_count: 0,
    avg_score: 0,
    active_focus_areas: 0,
    active_goals: 0,
    rounds: [],
    ...overrides,
  };
}

describe('subtractDays / windowStartFor', () => {
  it('subtracts calendar days as pure UTC string math', () => {
    expect(subtractDays('2026-09-10', 30)).toBe('2026-08-11');
    expect(subtractDays('2026-01-01', 1)).toBe('2025-12-31');
  });

  it('returns null for the all window and a real cutoff for 30d/90d', () => {
    expect(windowStartFor('all', '2026-09-10')).toBeNull();
    expect(windowStartFor('30d', '2026-09-10')).toBe('2026-08-11');
    expect(windowStartFor('90d', '2026-09-10')).toBe('2026-06-12');
  });
});

describe('shortDay / playerName', () => {
  it('formats a YYYY-MM-DD day without a Date round trip', () => {
    expect(shortDay('2026-08-31')).toBe('Aug 31');
  });

  it('falls back to "Player" for a nameless row', () => {
    expect(playerName({ first_name: null, last_name: null })).toBe('Player');
    expect(playerName({ first_name: 'Jordan', last_name: null })).toBe('Jordan');
  });
});

describe('buildScoreFieldRows', () => {
  const player = makePlayer({
    recent_trend: 'declining',
    recent_trend_delta: 2.5,
    rounds: [
      { id: 'r1', date: '2026-06-01', score: 74, toPar: 2, courseName: 'Old Course' },
      { id: 'r2', date: '2026-08-15', score: 78, toPar: 6, courseName: 'Old Course' },
    ],
  });

  it('plots every round when there is no window', () => {
    const [row] = buildScoreFieldRows([player], null);
    expect(row!.rounds).toHaveLength(2);
    expect(row!.avg).toBeCloseTo((74 + 78) / 2);
  });

  it('filters rounds to the window and recomputes the row average from what remains', () => {
    const [row] = buildScoreFieldRows([player], '2026-08-01');
    expect(row!.rounds).toHaveLength(1);
    expect(row!.rounds[0]!.id).toBe('r2');
    expect(row!.avg).toBe(78);
  });

  it('never re-derives trend from the window — it always carries the server all-time delta', () => {
    const [row] = buildScoreFieldRows([player], '2026-08-01');
    expect(row!.trend).toEqual({ direction: 'declining', delta: 2.5 });
  });

  it('reports no trend read when recent_trend is null, never a fabricated flat reading', () => {
    const [row] = buildScoreFieldRows([makePlayer({ recent_trend: null, recent_trend_delta: null })], null);
    expect(row!.trend).toBeNull();
  });
});

describe('sortByTrend', () => {
  it('orders decliners (worst first), then stable, then improvers (biggest gain first), then unread', () => {
    const rows = buildScoreFieldRows(
      [
        makePlayer({ id: 'a', first_name: 'A', recent_trend: 'improving', recent_trend_delta: -1 }),
        makePlayer({ id: 'b', first_name: 'B', recent_trend: 'declining', recent_trend_delta: 1 }),
        makePlayer({ id: 'c', first_name: 'C', recent_trend: 'declining', recent_trend_delta: 3 }),
        makePlayer({ id: 'd', first_name: 'D', recent_trend: null, recent_trend_delta: null }),
        makePlayer({ id: 'e', first_name: 'E', recent_trend: 'stable', recent_trend_delta: 0 }),
        makePlayer({ id: 'f', first_name: 'F', recent_trend: 'improving', recent_trend_delta: -3 }),
      ],
      null,
    );
    const order = sortByTrend(rows).map((r) => r.id);
    expect(order).toEqual(['c', 'b', 'e', 'f', 'a', 'd']);
  });
});

describe('fieldDomain', () => {
  it('uses the window start when one is set', () => {
    expect(fieldDomain([], '2026-08-01', '2026-09-10')).toEqual({ start: '2026-08-01', end: '2026-09-10' });
  });

  it('falls back to the oldest plotted round for the all window', () => {
    const rows = buildScoreFieldRows([makePlayer({ rounds: [{ id: 'r1', date: '2026-05-01', score: 74, toPar: 2, courseName: null }] })], null);
    expect(fieldDomain(rows, null, '2026-09-10')).toEqual({ start: '2026-05-01', end: '2026-09-10' });
  });
});

describe('buildRosterVerdict', () => {
  it('says trends are unavailable when no player has a read yet', () => {
    const players = [makePlayer({ recent_trend: null })];
    const { rows } = rosterHealthInputs(players);
    const needs = computeNeedsAttention(rows);
    const parts = buildRosterVerdict(players, 'Helm Golf', needs, 0);
    expect(parts.map((p) => p.text).join('')).toContain('Trends appear once players have rounds to compare.');
  });

  it('names the biggest improver and worst decliner with real deltas', () => {
    const players = [
      makePlayer({ id: 'a', first_name: 'Alex', recent_trend: 'improving', recent_trend_delta: -0.5, rounds_count: 6 }),
      makePlayer({ id: 'b', first_name: 'Bo', recent_trend: 'improving', recent_trend_delta: -2.1, rounds_count: 6 }),
      makePlayer({ id: 'c', first_name: 'Casey', recent_trend: 'declining', recent_trend_delta: 3.2, rounds_count: 6 }),
    ];
    const { rows } = rosterHealthInputs(players);
    const needs = computeNeedsAttention(rows);
    const parts = buildRosterVerdict(players, 'Helm Golf', needs, 3);
    const text = parts.map((p) => p.text).join('');
    expect(text).toContain('2 improving, 1 sliding.');
    expect(text).toContain('Bo');
    expect(text).toContain('2.1 strokes');
    expect(text).toContain('Casey');
    expect(text).toContain('3.2 strokes');
  });

  it('never prints "0 sliding" as a clause when nobody is declining — omits the clause entirely', () => {
    const players = [makePlayer({ id: 'a', recent_trend: 'improving', recent_trend_delta: -1 })];
    const { rows } = rosterHealthInputs(players);
    const needs = computeNeedsAttention(rows);
    const parts = buildRosterVerdict(players, 'Helm Golf', needs, 1);
    const text = parts.map((p) => p.text).join('');
    expect(text).not.toContain('sliding the most');
  });

  it("says the roster's covered when nobody needs a look and players have rounds", () => {
    const players = [makePlayer({ id: 'a', recent_trend: 'stable', recent_trend_delta: 0, active_focus_areas: 1, rounds_count: 4 })];
    const parts = buildRosterVerdict(players, 'Helm Golf', [], 1);
    expect(parts.map((p) => p.text).join('')).toContain("Roster's covered.");
  });

  it('says there is nothing to assess yet when no player has rounds', () => {
    const players = [makePlayer({ id: 'a', recent_trend: null })];
    const parts = buildRosterVerdict(players, 'Helm Golf', [], 0);
    expect(parts.map((p) => p.text).join('')).toContain('Nothing to assess yet.');
  });
});

describe('buildRosterReadouts', () => {
  it('breaks the needs-attention count down by real priority buckets', () => {
    const players = [
      makePlayer({ id: 'a', recent_trend: 'declining', active_focus_areas: 0, rounds_count: 5 }),
      makePlayer({ id: 'b', recent_trend: 'declining', active_focus_areas: 1, rounds_count: 5 }),
      // Stable AND coached — not flagged, so the bucket totals below stay
      // exactly "1 down & uncoached, 1 down" (no uncoached-only bucket).
      makePlayer({ id: 'c', recent_trend: 'stable', active_focus_areas: 1, rounds_count: 5 }),
    ];
    const focusAreas: PlayersGridFocusArea[] = [
      { id: 'fa1', area_type: 'general', title: null, player_id: 'b', status: 'active' },
      { id: 'fa2', area_type: 'general', title: null, player_id: 'c', status: 'active' },
    ];
    const { statsByPlayer, rows } = rosterHealthInputs(players);
    const health = computeRosterHealth(players, focusAreas, statsByPlayer);
    const needs = computeNeedsAttention(rows);
    const readouts = buildRosterReadouts(health, needs, 3);
    const attention = readouts.find((r) => r.key === 'attention')!;
    expect(attention.value).toBe('2');
    expect(attention.note).toBe('1 down & uncoached, 1 down');
  });
});

describe('filterRosterByQuery / sortRosterTable', () => {
  const players = [
    makePlayer({ id: 'a', first_name: 'Alex', last_name: 'Kim', avg_score: 80, handicap: 4, rounds_count: 2 }),
    makePlayer({ id: 'b', first_name: 'Bo', last_name: 'Adams', avg_score: 74, handicap: 1, rounds_count: 9 }),
  ];

  it('filters case-insensitively across the full name', () => {
    expect(filterRosterByQuery(players, 'bo ad').map((p) => p.id)).toEqual(['b']);
    expect(filterRosterByQuery(players, '').map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('sorts by last name by default and by the requested field otherwise', () => {
    expect(sortRosterTable(players, 'name').map((p) => p.id)).toEqual(['b', 'a']);
    expect(sortRosterTable(players, 'avg').map((p) => p.id)).toEqual(['b', 'a']);
    expect(sortRosterTable(players, 'handicap').map((p) => p.id)).toEqual(['b', 'a']);
    expect(sortRosterTable(players, 'rounds').map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('buildFocusOutcomes', () => {
  it('only surfaces focus areas with a recorded outcome, joined to the player', () => {
    const players = [makePlayer({ id: 'a', first_name: 'Alex', last_name: 'Kim' })];
    const focusAreas: PlayersGridFocusArea[] = [
      { id: 'fa1', area_type: 'general', title: null, player_id: 'a', status: 'completed', outcome_status: 'improved' },
      { id: 'fa2', area_type: 'general', title: null, player_id: 'a', status: 'active', outcome_status: null },
    ];
    const rows = buildFocusOutcomes(focusAreas, players);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ playerId: 'a', name: 'Alex Kim', href: '/golf/dashboard/roster/a', tone: 'improved' });
  });
});
