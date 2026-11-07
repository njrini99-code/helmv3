import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { STATIONS, stationFigures, stationOrder, teamTotalOf, worstOf, type ChTeamLeg } from '@/clubhouse/data/coachhelm-team-shape';
import { COURSE_TAB, TEAM_BOARD_FIRST_VIEW } from '../flag';

const leg = (strokes: number | null): ChTeamLeg => ({ strokes, rounds: strokes == null ? 0 : 10, missing: null });
const legs = (t: number | null, a: number | null, s: number | null, p: number | null) => ({ tee: leg(t), approach: leg(a), short_game: leg(s), putting: leg(p) });

/** Coachhelm-team AC-TEAM-21 and AC-TEAM-22: the Team board is the coach's first view; the two owner flips are constants. */
describe('the Team board switch', () => {
  it('the route draws TeamBoard for the hole view', () => {
    const route = readFileSync(resolve(process.cwd(), 'src/clubhouse/routes/coachhelm.tsx'), 'utf8');
    expect(route).toMatch(/if \(!ask && TEAM_BOARD_FIRST_VIEW === 'hole'\) return <TeamBoard/);
    expect(route).toMatch(/if \(!ask\) return <CoachBoard/);
    expect(route.indexOf('<TeamBoard')).toBeLessThan(route.indexOf('<CoachBoard'));
  });

  it('the drawn defaults', () => {
    expect(TEAM_BOARD_FIRST_VIEW).toBe('hole');
    expect(COURSE_TAB).toBe(true);
  });
});

/** AC-HOLE-26. */
describe('station figures', () => {
  it('are the mean of the roster’s known legs', () => {
    const out = stationFigures([{ legs: legs(1, -2, null, 0) }, { legs: legs(3, -4, null, 0) }]);
    expect(out.tee).toEqual({ team: 2, n: 2 });
    expect(out.approach).toEqual({ team: -3, n: 2 });
    expect(out.short_game).toEqual({ team: null, n: 0 });
  });

  it('the hero is the mean of stored totals, never the sum of the legs', () => {
    expect(teamTotalOf([{ total: -1 }, { total: -3 }, { total: null }])).toBe(-2);
    expect(teamTotalOf([{ total: null }])).toBeNull();
  });

  it('biggest loss first, unknowns last', () => {
    const order = stationOrder({ tee: { team: 1, n: 1 }, approach: { team: -3, n: 1 }, short_game: { team: null, n: 0 }, putting: { team: -1, n: 1 } });
    expect(order).toEqual(['approach', 'putting', 'tee', 'short_game']);
    expect([...order].sort()).toEqual([...STATIONS].sort());
  });

  it('a worst leg is a losing one: nobody below zero has none', () => {
    expect(worstOf(legs(1, -2, -3, 0))).toBe('short_game');
    expect(worstOf(legs(1, 2, null, 0))).toBeNull();
  });
});
