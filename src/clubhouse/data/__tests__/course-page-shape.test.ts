import { describe, expect, it } from 'vitest';
import { toCourseHistory, type ChCourseListRow } from '../course-page-shape';
import type { ChPlayHole } from '../stats-extra';

let seq = 0;
const row = (total: number, over: Partial<ChCourseListRow> = {}): ChCourseListRow => ({
  id: `r${String(seq++).padStart(3, '0')}`,
  course_id: null,
  course_name: 'Finley GC',
  course_city: 'Chapel Hill',
  course_state: 'NC',
  tee_id: null,
  tees_played: 'Blue',
  round_date: '2026-09-15',
  round_type: 'practice',
  holes_played: 18,
  total_score: total,
  score_to_par: total - 72,
  front_nine: Math.floor(total / 2),
  back_nine: Math.ceil(total / 2),
  total_putts: 30,
  total_gir: null,
  total_gir_possible: null,
  total_fairways_hit: null,
  total_fairways: null,
  notes: null,
  ...over,
});
const card = (total: number): ChPlayHole[] => Array.from({ length: 18 }, (_, i) => ({ n: i + 1, par: 4, score: 4 + (i < total - 72 ? 1 : 0), putts: 2, gir: null, fairway: null }));
const base = { library: null, coachNote: null, window: 'all' as const, seasonStart: '2026-08-01', who: null };

describe('toCourseHistory (P-7 4.2)', () => {
  const list = [row(76, { round_date: '2026-10-03', notes: 'Commit on the 7 tee' }), row(70, { round_date: '2026-03-14', tees_played: 'White' }), row(74, { round_date: '2025-09-20' }), row(80, { course_name: 'Marsh' })];

  it('says the course in the hero and the figures', () => {
    const res = toCourseHistory({ ...base, rawKey: 'n-finley%20gc', list, holes: new Map() });
    expect(res.kind).toBe('ok');
    const h = res.kind === 'ok' ? res.data : null!;
    expect(h.name).toBe('Finley GC');
    expect(h.hero.kicker).toBe('Your history · 3 rounds');
    expect(h.hero.place).toBe('Chapel Hill, NC · Blue tees (2) · White (1)');
    expect(h.hero.figure).toMatchObject({ kind: 'average', early: 3 });
    expect(h.hero.figure.kind === 'average' && h.hero.figure.toPar).toBeCloseTo(4 / 3, 9);
    expect(h.figures.map((f) => [f.label, f.value, f.sub])).toEqual([
      ['Best', '70', 'Mar 14 · −2'],
      ['Last time', '76', 'Oct 3 · +4'],
      ['Rounds', '3', 'Since Sept 2025'],
      ['Putts', '30.0', 'a round · 3 rounds'],
    ]);
    expect(h.lastTime).toMatchObject({ line: 'Oct 3 · 76 · Blue tees · Practice', note: 'Commit on the 7 tee' });
    expect(h.rounds.map((r) => r.score)).toEqual([76, 70, 74]);
    expect(h.holes).toEqual([]);
  });

  it('one round: Last time in the hero, Only round in the figures; the coach reads the player', () => {
    const res = toCourseHistory({ ...base, who: 'Lena', rawKey: 'n-marsh', list, holes: new Map() });
    const h = res.kind === 'ok' ? res.data : null!;
    expect(h.hero.kicker).toBe('Lena’s history · 1 round');
    expect(h.hero.figure).toMatchObject({ kind: 'last', value: 80 });
    expect(h.figures[0]!.label).toBe('Only round');
  });

  it('redirects a name key whose name now has a library id, and does not find a stranger course', () => {
    const linked = [row(72, { course_id: '0b3c6a1e-1111-4222-8333-944455556666' }), row(74)];
    expect(toCourseHistory({ ...base, rawKey: 'n-finley%20gc', list: linked, holes: null })).toEqual({ kind: 'redirect', key: '0b3c6a1e-1111-4222-8333-944455556666' });
    expect(toCourseHistory({ ...base, rawKey: 'n-nowhere', list, holes: null })).toEqual({ kind: 'notFound' });
    expect(toCourseHistory({ ...base, rawKey: 'bad key', list, holes: null })).toEqual({ kind: 'notFound' });
  });

  it('builds the hole figures from rounds with hole scores and says the coverage', () => {
    const rows = [row(74), row(73), row(75), row(72, { front_nine: null, back_nine: null })];
    const holes = new Map(rows.slice(0, 3).map((r) => [r.id, card(r.total_score!)] as const));
    const res = toCourseHistory({ ...base, rawKey: 'n-finley%20gc', list: rows, holes });
    const h = res.kind === 'ok' ? res.data : null!;
    expect(h.holes).toHaveLength(18);
    expect(h.holes[0]!.stats.n).toBe(3);
    expect(h.coverage).toBe('Hole stats from 3 of 4 rounds');
    expect(h.arc?.rounds).toBe(3);
  });
});
