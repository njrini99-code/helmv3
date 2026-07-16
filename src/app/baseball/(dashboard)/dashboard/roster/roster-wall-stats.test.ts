/**
 * roster-wall-stats.ts tests — regression coverage for two fixes to the
 * coach Roster wall (visual-audit 2026-07-16, coach-roster-academics.md):
 *
 *  (a) [DISHONEST] The desktop wall used to show a 5th "SESS" column sourced
 *      from `agg.total_sessions` — `Math.max(legacy.total_sessions, boxScore.g)`
 *      in legacy-stat-adapters.ts — which reads as "games this season" next to
 *      four columns that ARE current-season truth, but almost always resolves
 *      to a deprecated legacy row count instead (14-22 shown for an 8-game
 *      season). WALL_COLUMNS/buildWallStats must never reintroduce it.
 *  (b) [BROKEN] The phone wall used to hand `PlayerRowPlate` two fixed-width
 *      stat columns (AVG + OPS), leaving no reserved width for the name plate
 *      and causing most rows to render 0-1 characters of the player's name.
 *      buildWallStatsMobile must return exactly the one headline figure (OPS)
 *      the row has room for.
 *  (c) [BROKEN, follow-up FIX_FIRST on PR #882] The Position/Status/Development
 *      triage boards (TriageColumn/TriageBoard in RosterFairway.tsx) render
 *      the SAME shared `PlayerRowPlate` molecule inside a card that's only
 *      ~360-400px wide at every breakpoint, but kept a 2-stat row (OPS +
 *      freshness) after the Roster Wall was cut to 1 — so once the Roster
 *      Wall's `min-w-[64px]` name floor shipped, these boards had no width
 *      budget left for it, and on the Status board the row's own trailing
 *      RosterRowMenu kebab (Edit/Remove) risked getting clipped by PaperCard's
 *      `overflow-hidden` too. `buildBoardStats` must return exactly the one
 *      figure (freshness) these boards have room for.
 *  (d) [BROKEN, round-3 FIX_FIRST on PR #882] The Status board's `pending`
 *      column swaps the 44px RosterRowMenu kebab (c)'s budget assumed for
 *      `PendingMemberActions` (Approve/Decline) — even icon-only, ~94px, more
 *      than double the kebab. `buildPendingBoardStats` must return an EMPTY
 *      stat list so that column reclaims the width `buildBoardStats`'s one
 *      freshness figure would otherwise spend (see
 *      roster-triage-pending-row-width.test.tsx for the full width budget).
 */
import { describe, it, expect } from 'vitest';
import type { BaseballPlayerAggregates } from '@/lib/types';
import type { Freshness } from '@/components/baseball/roster/roster-triage';
import {
  EM_DASH,
  WALL_COLUMNS,
  buildWallStats,
  buildWallStatsMobile,
  buildBoardStats,
  buildPendingBoardStats,
} from './roster-wall-stats';

function agg(overrides: Partial<BaseballPlayerAggregates> = {}): BaseballPlayerAggregates {
  return {
    player_id: 'p1',
    team_id: 't1',
    total_sessions: 22, // deliberately far above any plausible games-played count
    practice_sessions: 0,
    game_sessions: 0,
    career_avg: 0.288,
    career_obp: 0.36,
    career_slg: 0.5,
    career_ops: 1.752,
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
    last_calculated_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('WALL_COLUMNS — desktop header', () => {
  it('never includes SESS (the deprecated legacy row-count column)', () => {
    expect(WALL_COLUMNS).toEqual(['AVG', 'OBP', 'SLG', 'OPS']);
    expect(WALL_COLUMNS).not.toContain('SESS');
  });
});

describe('buildWallStats — desktop 4-column row', () => {
  it('returns exactly 4 em-dash stats when a player has no aggregates (no fabricated SESS zero)', () => {
    const stats = buildWallStats(undefined, false);
    expect(stats).toHaveLength(4);
    expect(stats.every((s) => s.value === EM_DASH)).toBe(true);
  });

  it('returns AVG/OBP/SLG/OPS from career_* fields, in that order, with no 5th (SESS) entry', () => {
    const stats = buildWallStats(agg(), false);
    expect(stats).toHaveLength(4);
    expect(stats.map((s) => s.value)).toEqual(['.288', '.360', '.500', '1.752']);
    // total_sessions (22) never surfaces anywhere in the row.
    expect(stats.some((s) => s.value === 22 || s.value === '22')).toBe(false);
  });

  it('flags only the OPS entry (index 3) as the leader, matching desktop\'s green-ink column', () => {
    const stats = buildWallStats(agg(), true);
    expect(stats[3]?.leader).toBe(true);
    expect(stats.slice(0, 3).every((s) => !s.leader)).toBe(true);
  });

  it('renders an em dash for any individual null rate rather than a fabricated 0', () => {
    const stats = buildWallStats(agg({ career_avg: null }), false);
    expect(stats[0]?.value).toBe(EM_DASH);
  });
});

describe('buildWallStatsMobile — phone 1-column row (#roster-mobile-name-collapse)', () => {
  it('returns exactly ONE stat (OPS) — not the old two (AVG + OPS)', () => {
    const stats = buildWallStatsMobile(agg(), false);
    expect(stats).toHaveLength(1);
    expect(stats[0]?.label).toBe('OPS');
  });

  it('never includes an AVG entry', () => {
    const stats = buildWallStatsMobile(agg(), false);
    expect(stats.some((s) => s.label === 'AVG')).toBe(false);
  });

  it('formats the OPS value the same way the desktop wall does', () => {
    const stats = buildWallStatsMobile(agg(), false);
    expect(stats[0]?.value).toBe('1.752');
  });

  it('passes the leader flag through onto the single OPS entry', () => {
    const stats = buildWallStatsMobile(agg(), true);
    expect(stats[0]?.leader).toBe(true);
  });

  it('returns a single em-dash OPS stat (not a fabricated zero) when a player has no aggregates', () => {
    const stats = buildWallStatsMobile(undefined, false);
    expect(stats).toEqual([{ label: 'OPS', value: EM_DASH }]);
  });
});

describe('buildBoardStats — triage board 1-column row (#roster-triage-kebab-clip)', () => {
  function freshness(overrides: Partial<Freshness> = {}): Freshness {
    return { level: 'fresh', days: 2, label: '2d', ...overrides };
  }

  it('returns exactly ONE stat — not the old two (OPS + freshness)', () => {
    const stats = buildBoardStats(freshness());
    expect(stats).toHaveLength(1);
  });

  it('surfaces the freshness label under an "Updated" label, self-labeled (no shared header on the triage boards)', () => {
    const stats = buildBoardStats(freshness({ label: '2d' }));
    expect(stats[0]?.label).toBe('Updated');
    expect(stats[0]?.value).toBe('2d');
  });

  it('never includes a raw OPS entry', () => {
    const stats = buildBoardStats(freshness());
    expect(stats.some((s) => s.label === 'OPS')).toBe(false);
  });

  it('flags the entry as leader only when the freshness level is "fresh"', () => {
    expect(buildBoardStats(freshness({ level: 'fresh' }))[0]?.leader).toBe(true);
    expect(buildBoardStats(freshness({ level: 'recent' }))[0]?.leader).toBe(false);
    expect(buildBoardStats(freshness({ level: 'stale' }))[0]?.leader).toBe(false);
  });

  it('renders "No data" honestly for a player with no captured sessions, not a fabricated value', () => {
    const stats = buildBoardStats(freshness({ level: 'none', days: null, label: 'No data' }));
    expect(stats).toEqual([{ label: 'Updated', value: 'No data', leader: false }]);
  });
});

describe('buildPendingBoardStats — Status board "Awaiting Join" row, 0-column (#roster-pending-actions-clip)', () => {
  it('returns an empty stat list — not the shared 1-column freshness figure', () => {
    expect(buildPendingBoardStats()).toEqual([]);
  });

  it('always returns a fresh empty array (no accidental caller-shared/mutated reference)', () => {
    expect(buildPendingBoardStats()).not.toBe(buildPendingBoardStats());
  });
});
