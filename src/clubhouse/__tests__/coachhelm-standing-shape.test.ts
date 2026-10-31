import { describe, expect, it } from 'vitest';

/**
 * A20: Standing's "Refreshed" date is the team's own day, and its strokes gained prints to one decimal with ahead and behind
 * decided on what it prints.
 */

import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { refreshedOn, toChStanding, versus } from '../data/coachhelm-standing-shape';

const ok = { status: 'ok', roundsPlayed: 14, scoringAverage: 77.2 } as const;
const row = (metric_id: string, player_value: number, pga_value: number | null, team_avg: number | null, computed_at = '2026-10-20T12:00:00Z') =>
  ({ player_id: 'p1', metric_id, player_value, pga_value, team_avg, computed_at }) as unknown as PlayerStanding;

describe('Standing, honest dates and figures (A20)', () => {
  it('a refresh at 02:30 UTC on Oct 23 is Oct 22 for a team in Los Angeles', () => {
    expect(refreshedOn('2026-10-23T02:30:00Z', 'America/Los_Angeles')).toBe('Oct 22');
    expect(refreshedOn('2026-10-23T02:30:00Z', 'UTC')).toBe('Oct 23');
    expect(toChStanding([row('gir_pct', 58, 66, null, '2026-10-23T02:30:00Z')], ok, null, { role: 'player' }, 'America/Los_Angeles').refreshed).toBe('Oct 22');
  });

  it('a date with no time keeps its day in any zone, and nothing that does not parse is a date', () => {
    expect(refreshedOn('2026-10-22', 'America/Los_Angeles')).toBe('Oct 22');
    expect(refreshedOn('not a date', 'UTC')).toBeNull();
    expect(refreshedOn(null, 'UTC')).toBeNull();
  });

  it('strokes gained labels carry one decimal', () => {
    const s = toChStanding([row('sg_total', -0.84, 0, null)], ok);
    const sg = s.groups.flatMap((g) => g.rows).find((r) => r.id === 'sg_total')!;
    expect(sg.you).toBe('−0.8');
    expect(sg.vsTour?.text).toBe('0.8 strokes behind the Tour');
    expect(versus(-0.84, -0.42, 'higher_better', 'strokes', 'your team average', 'sg_total').text).toBe('0.4 strokes behind your team average');
  });

  it('ahead and behind use one-digit equality: +0.44 against +0.36 is level, and the counts agree', () => {
    expect(versus(0.44, 0.36, 'higher_better', 'strokes', 'your team average', 'sg_total')).toEqual({ sense: 'level', text: 'Level with your team average' });
    expect(versus(0.46, 0.34, 'higher_better', 'strokes', 'your team average', 'sg_total').sense).toBe('ahead');
    // A par scoring average keeps two decimals and its own equality.
    expect(versus(4.12, 4.08, 'lower_better', 'strokes', 'the Tour', 'scoring_par_4').sense).toBe('behind');
    // The Tour's row: +0.44 against +0.36 prints +0.4 against +0.4, so it is counted and not ahead.
    const s = toChStanding([row('sg_total', 0.44, 0.36, null)], ok);
    expect(s.counts.tour).toEqual({ of: 1, ahead: 0 });
  });
});

describe('Standing names its window and each row its own round count (owner decision 9, rows 104/105)', () => {
  const seasonRow = (metric_id: string, rounds_n: number, team_n = 6) =>
    ({ ...row(metric_id, 58, 66, 52), team_n, rounds_n, season_start: '2026-08-01' }) as unknown as PlayerStanding;
  const pressureOf = (s: ReturnType<typeof toChStanding>) => s.groups.find((g) => g.id === 'pressure')!.description;

  it('season rows: "This season" from 1 August, each row with its own count, and the page with the most any row stands on', () => {
    const s = toChStanding([seasonRow('gir_pct', 12), seasonRow('scoring_par_4', 14), seasonRow('practice_tournament_delta', 8)], ok, null, { role: 'player' }, 'UTC', 'season');
    expect(s.window).toEqual({ kind: 'season', label: 'This season', since: 'Aug 1' });
    const rows = s.groups.flatMap((g) => g.rows);
    expect(rows.find((r) => r.id === 'gir_pct')!.rounds).toBe(12);
    expect(rows.find((r) => r.id === 'practice_tournament_delta')!.rounds).toBe(8);
    // Not the stats cache's lifetime 14: the season's own figure, from the rows.
    expect(s.rounds).toBe(14);
    expect(pressureOf(s)).toMatch(/this season/);
    expect(pressureOf(s)).not.toMatch(/90 days/);
  });

  it('a coach reads the same season window in the coach’s words', () => {
    const s = toChStanding([seasonRow('opening_hole_delta', 9)], ok, null, { role: 'coach', first: 'Jonah' } as never, 'UTC', 'season');
    expect(pressureOf(s)).toBe('Tournament and qualifier scoring against practice this season, and what the opening hole costs.');
  });

  it('the season count is the rows’ own: a lifetime baseline never stands in for it', () => {
    const s = toChStanding([row('gir_pct', 58, 66, null)], { status: 'ok', roundsPlayed: 40, scoringAverage: 76 }, null, { role: 'player' }, 'UTC', 'season');
    expect(s.rounds).toBeNull();
    expect(s.window.since).toBeNull();
    expect(toChStanding([], ok, null, { role: 'player' }, 'UTC', 'season').rounds).toBeNull();
  });

  it('the lifetime table (the default, and the loader’s fallback) is "All time": rounds on file, no row counts, the 90-day pressure note', () => {
    const s = toChStanding([row('gir_pct', 58, 66, null), row('opening_hole_delta', 0.3, 0, null)], ok);
    expect(s.window).toEqual({ kind: 'all_time', label: 'All time', since: null });
    expect(s.rounds).toBe(14);
    expect(s.groups.flatMap((g) => g.rows).every((r) => r.rounds === null)).toBe(true);
    expect(pressureOf(s)).toMatch(/last 90 days/);
  });
});
