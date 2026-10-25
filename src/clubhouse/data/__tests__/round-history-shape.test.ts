import { describe, expect, it } from 'vitest';
import { historyHoleIds, startHoleOf, toReviewHistory, type ChHistoryRoundRow } from '../round-history-shape';
import type { ChPlayHole } from '../stats-extra';

let seq = 0;
const row = (total: number, over: Partial<ChHistoryRoundRow> = {}): ChHistoryRoundRow => ({
  id: `r${String(seq++).padStart(3, '0')}`,
  course_id: null,
  course_name: 'Finley GC',
  tees_played: 'Blue',
  tee_id: null,
  round_date: '2026-09-15',
  holes_played: 18,
  total_score: total,
  front_nine: Math.floor(total / 2),
  back_nine: Math.ceil(total / 2),
  total_putts: 30,
  ...over,
});
/** Eighteen par 4s summing to `total`: the extra strokes on the first holes. */
const card = (total: number): ChPlayHole[] => {
  const extra = total - 72;
  return Array.from({ length: 18 }, (_, i) => ({ n: i + 1, par: 4, score: 4 + (i < Math.abs(extra) ? Math.sign(extra) : 0), putts: 2, gir: true, fairway: true }));
};

describe('toReviewHistory (P-7 stage 3)', () => {
  it('names the course, counts its rounds and says where the round stands', () => {
    const round = row(70, { round_date: '2026-10-01' });
    const others = [row(74, { round_date: '2026-09-01' }), row(76, { round_date: '2026-08-20' }), row(72, { course_name: 'Marsh', round_date: '2026-08-10' })];
    const holes = new Map(others.map((r) => [r.id, card(r.total_score!)] as const));
    const h = toReviewHistory({ round, list: [round, ...others], holes, seasonStart: '2026-08-01' });
    expect(h.course).toMatchObject({ name: 'Finley GC', rounds: 3 });
    expect(h.records.map((m) => m.label)).toEqual(['Career low', 'Best at Finley GC']);
    // Two earlier plays of every hole here.
    expect(h.hereBefore[1]).toEqual({ avg: 1, n: 2 });
    // Two other full rounds here: under the floor of three for the average ghost; the best from the same tees is 74.
    expect(h.ghosts.average).toBeNull();
    expect(h.ghosts.best).toMatchObject({ score: 74, date: '2026-09-01' });
    expect(h.usual).toEqual({ bounce: null, ppg: null, closing: null, big: null });
  });

  it('builds the usual from five earlier full rounds, never from a later one', () => {
    const round = row(72, { round_date: '2026-10-01' });
    const earlier = Array.from({ length: 5 }, (_, i) => row(74, { round_date: `2026-09-0${i + 1}`, course_name: 'Marsh' }));
    const later = row(80, { round_date: '2026-10-05', course_name: 'Marsh' });
    const holes = new Map([...earlier, later].map((r) => [r.id, card(r.total_score!)] as const));
    const h = toReviewHistory({ round, list: [later, ...earlier], holes, seasonStart: '2026-08-01' });
    expect(h.usual?.big).toBe('Usually 0.0 a round · 5 rounds');
    expect(h.usual?.ppg).toBe('Usually 2.00 · 5 rounds');
    expect(historyHoleIds(round, [later, ...earlier])).not.toContain(later.id);
  });

  it('a nine-hole round gets no usual and no ghosts', () => {
    const round = row(36, { holes_played: 9 });
    const h = toReviewHistory({ round, list: [round], holes: new Map(), seasonStart: '2026-08-01' });
    expect(h.usual).toBeNull();
    expect(h.ghosts).toEqual({ average: null, best: null });
  });

  it('reads the start hole, hole 1 being no start at all', () => {
    expect(startHoleOf(10, 18)).toBe(10);
    expect(startHoleOf('1', 18)).toBeNull();
    expect(startHoleOf(null, 18)).toBeNull();
    expect(startHoleOf(40, 18)).toBeNull();
  });
});
