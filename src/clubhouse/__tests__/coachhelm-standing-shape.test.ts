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
