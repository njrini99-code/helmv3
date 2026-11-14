import { describe, expect, it } from 'vitest';
import { courseGlances, type ChGlanceRow } from '../course-glance';
import { roundTotals } from '../round-scope';
import { toHoles, toReview, type ChHoleRow, type ChReviewRoundRow } from '../round-review-shape';
import { toLibraryRound } from '../rounds-shape';
import { toTeamRounds } from '../team-rounds-shape';

/*
 * F-0003 (audit 2026-11-13): one round, one score. A round's stored `total_score` can go stale after its holes are edited
 * (round-total.ts: no trigger rewrites it), so Dylan's 19 Jul round has holes summing to 79 (Out 40, In 39, +7 on a par 72)
 * while total_score says 78 and score_to_par 6. The rule (round-scope.ts `roundTotals`): a round with all its holes reads its
 * total and to-par from them; otherwise from its nines (written with the holes); otherwise the stored total. Every shape that
 * prints a round's score goes through it, so the review, the lists and the course glance print the same 79 (+7).
 */

const FRONT = [5, 4, 5, 4, 5, 4, 4, 5, 4]; // 40
const BACK = [4, 4, 5, 4, 4, 5, 4, 5, 4]; // 39
const holeRows: ChHoleRow[] = [...FRONT, ...BACK].map((score, i) => ({ hole_number: i + 1, par: 4, yardage: null, score, putts: null, fairway_hit: null, gir: null, penalty_strokes: null }));

const drifted: ChReviewRoundRow = {
  id: '4625ba2c-0000-4000-8000-000000000000',
  player_id: 'p-dylan',
  course_name: 'Poplar Grove',
  tees_played: null,
  round_date: '2026-07-19',
  round_type: 'tournament',
  total_score: 78,
  score_to_par: 6,
  front_nine: 40,
  back_nine: 39,
  holes_played: 18,
  total_putts: null,
  total_fairways_hit: null,
  total_fairways: null,
  total_gir: null,
  total_gir_possible: null,
  course_rating: null,
  course_slope: null,
  ai_recap: null,
  notes: null,
  strokes_gained_total: null,
  strokes_gained_tee: null,
  strokes_gained_approach: null,
  strokes_gained_around_green: null,
  strokes_gained_putting: null,
};

const review = (r: ChReviewRoundRow, holes = toHoles(holeRows, [])) =>
  toReview(r, { holes, holesError: false, shotsError: false, playerName: null, teeYards: null });

describe('roundTotals: one rule for a round score (F-0003)', () => {
  it('a round with all its holes reads its total and to-par from them', () => {
    expect(roundTotals({ ...drifted, front_nine: null, back_nine: null }, holeRows)).toEqual({ total: 79, toPar: 7 });
  });

  it('without its holes, the nines; without those, the stored total', () => {
    expect(roundTotals(drifted)).toEqual({ total: 79, toPar: 7 });
    expect(roundTotals({ ...drifted, front_nine: null, back_nine: null })).toEqual({ total: 78, toPar: 6 });
  });

  it('a partial card is not the total: one hole short or one hole unscored falls back', () => {
    const bare = { ...drifted, front_nine: null, back_nine: null };
    expect(roundTotals(bare, holeRows.slice(0, 17))).toEqual({ total: 78, toPar: 6 });
    expect(roundTotals(bare, holeRows.map((h, i) => (i === 3 ? { ...h, score: null } : h)))).toEqual({ total: 78, toPar: 6 });
  });

  it('a hole without its par keeps the holes total and shifts the stored to-par by the same strokes', () => {
    expect(roundTotals(drifted, holeRows.map((h, i) => (i === 0 ? { ...h, par: null } : h)))).toEqual({ total: 79, toPar: 7 });
  });

  it('the holes correct a recorded score; a round with none recorded stays without one, as every list leaves it out (110102)', () => {
    expect(roundTotals({ ...drifted, total_score: null, score_to_par: null, front_nine: null, back_nine: null }, holeRows)).toEqual({ total: null, toPar: null });
  });

  it('a nine-hole round with its nine holes reads them', () => {
    const nine = { ...drifted, holes_played: 9, total_score: 39, score_to_par: 3, front_nine: null, back_nine: null };
    expect(roundTotals(nine, holeRows.slice(0, 9))).toEqual({ total: 40, toPar: 4 });
  });
});

describe('111501 every shape that prints a round score agrees (F-0003)', () => {
  it('the review header reads the holes when the nines are missing', () => {
    const r = review({ ...drifted, front_nine: null, back_nine: null });
    expect([r.score, r.toPar, r.front.score, r.back.score]).toEqual([79, 7, 40, 39]);
  });

  it('the review, the Rounds list and Team rounds print 79 (+7) for the drifted round', () => {
    const r = review(drifted);
    const lib = toLibraryRound(drifted)!;
    const team = toTeamRounds([{ ...drifted, qualifier_round_number: null, created_at: '2026-07-19T20:00:00Z' }], new Map([['p-dylan', 'Dylan Brooks']])).list[0]!;
    expect([r.score, r.toPar]).toEqual([79, 7]);
    expect([lib.score, lib.toPar]).toEqual([79, 7]);
    expect([team.score, team.toPar]).toEqual([79, 7]);
  });

  it('the course glance in round setup reads the same total as the course page', () => {
    const g: ChGlanceRow = { id: drifted.id, course_id: null, course_name: 'Poplar Grove', round_date: '2026-07-19', holes_played: 18, total_score: 78, front_nine: 40, back_nine: 39, total_putts: null, notes: null };
    const glance = Object.values(courseGlances([g, { ...g, id: 'other', round_date: '2026-07-01', total_score: 75, front_nine: 37, back_nine: 38 }]))[0]!;
    expect(glance.last?.score).toBe(79);
    expect(glance.best).toBe(75);
    expect(glance.average).toBe(77);
  });
});
