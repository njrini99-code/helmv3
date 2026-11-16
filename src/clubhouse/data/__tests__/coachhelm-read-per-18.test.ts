import { describe, expect, it } from 'vitest';
import { lookupMetricSource } from '@/lib/coachhelm/v3/causality/metric-sources';
import { readPoints, roundNote, windowFigure, type ReadRoundRow } from '../coachhelm-read-extras-shape';

// Stats and charts audit 2026-11-15, SC-06: in a CoachHelm read of strokes gained, penalties or score to par, a nine-hole round was a
// full point on the line (Cole B's nine-hole −2.90 beside his 18-hole −3.66 average) and pulled the window figure up. Stats weighs a
// nine at half a round and shows it per 18; the read now does the same.

function round(id: string, date: string, holes: 9 | 18, over: Partial<ReadRoundRow> = {}): ReadRoundRow {
  return {
    id,
    round_date: date,
    holes_played: holes,
    total_score: holes === 9 ? 40 : 78,
    front_nine: holes === 9 ? 40 : 39,
    back_nine: holes === 9 ? null : 39,
    total_putts: null,
    score_to_par: holes === 9 ? 4 : 6,
    strokes_gained_total: null,
    strokes_gained_tee: null,
    strokes_gained_approach: null,
    strokes_gained_around_green: null,
    strokes_gained_putting: null,
    total_penalties: null,
    ...over,
  };
}

describe('a CoachHelm read is per 18 holes (SC-06)', () => {
  const rounds = [
    round('a', '2026-10-01', 18, { strokes_gained_total: -3.66 }),
    round('b', '2026-10-08', 9, { strokes_gained_total: -2.9 }),
    round('c', '2026-10-15', 18, { strokes_gained_total: -3.66 }),
  ];

  it('a nine-hole −2.90 plots as −5.80 and weighs half', () => {
    const got = readPoints('sg_total', { rounds, cache: [] })!;
    [-3.66, -5.8, -3.66].forEach((v, i) => expect(got.points[i]!.value).toBeCloseTo(v));
    expect(got.points.map((p) => p.weight)).toEqual([1, 0.5, 1]);
    // (−3.66 − 2.90 − 3.66) over 2.5 whole rounds, never the plain mean of the three.
    expect(windowFigure(got.def, got.points)).toBeCloseTo(-10.22 / 2.5);
  });

  it('a share still pools its counts', () => {
    const def = lookupMetricSource('gir_pct');
    expect(def?.kind).toBe('round_stats_cache_ratio');
    if (def?.kind !== 'round_stats_cache_ratio') return;
    const cache = [
      { round_id: 'a', [def.numerator]: 9, [def.denominator]: 18 },
      { round_id: 'b', [def.numerator]: 6, [def.denominator]: 9 },
    ];
    const got = readPoints('gir_pct', { rounds: rounds.slice(0, 2), cache })!;
    expect(windowFigure(got.def, got.points)).toBeCloseTo((15 / 27) * def.scale);
  });

  it('a round’s note keeps its own count', () => {
    const def = lookupMetricSource('penalty_rate_per_round')!;
    const got = readPoints('penalty_rate_per_round', { rounds: [rounds[1]!], cache: [{ round_id: 'b', penalty_strokes: 2 }] })!;
    expect(got.points[0]!.value).toBe(4);
    expect(roundNote(def, got.points[0])).toBe('2 penalties');
  });
});
