import { describe, expect, it } from 'vitest';
import type { ChRound } from '../season';
import { sgWindowLine, sgWindowSpoken } from '../../lib/sg-window-line';
import { sgWindowOf } from '../sg-window';

/*
 * F-0005 (audit 2026-11-13): Roster's strokes gained reads each player's last ten rounds (QA-1), which reached back into June and July
 * while the cards sit under "over the season" and the phone profile's "This season" card. The figure keeps its window and now names it:
 * how many rounds carry it, and the months they were played.
 */

let seq = 0;
const round = (date: string, over: Partial<ChRound> = {}): ChRound =>
  ({
    id: `r${String(seq++).padStart(3, '0')}`,
    player_id: 'p-cole',
    course_name: 'Poplar Grove',
    tees_played: null,
    round_date: date,
    round_type: 'tournament',
    total_score: 74,
    score_to_par: 2,
    front_nine: 37,
    back_nine: 37,
    holes_played: 18,
    total_putts: null,
    total_gir: null,
    total_gir_possible: null,
    total_fairways_hit: null,
    total_fairways: null,
    strokes_gained_total: -6,
    strokes_gained_tee: null,
    strokes_gained_approach: null,
    strokes_gained_around_green: null,
    strokes_gained_putting: null,
    ...over,
  }) as ChRound;

describe('sgWindowOf: the rounds a roster strokes gained figure reads (F-0005)', () => {
  it("Cole: two total-only qualifiers in September take two of the ten; the eight June–July rounds carry the figure", () => {
    const qualifiers = [round('2026-09-26', { total_only: true, front_nine: null, back_nine: null, strokes_gained_total: null }), round('2026-09-25', { total_only: true, front_nine: null, back_nine: null, strokes_gained_total: null })];
    const summer = ['2026-07-10', '2026-07-02', '2026-06-28', '2026-06-24', '2026-06-20', '2026-06-16', '2026-06-12', '2026-06-08', '2026-06-01', '2026-05-20'].map((d) => round(d));
    expect(sgWindowOf([...qualifiers, ...summer])).toEqual({ n: 8, from: '2026-06-08', to: '2026-07-10' });
  });

  it('no round with strokes gained in the ten is no window', () => {
    expect(sgWindowOf([round('2026-09-26', { strokes_gained_total: null })])).toBeNull();
    expect(sgWindowOf([])).toBeNull();
  });

  it('practice and nine-hole rounds are not in the ten, as the figure reads it', () => {
    expect(sgWindowOf([round('2026-10-01', { round_type: 'practice' }), round('2026-09-30', { holes_played: 9 }), round('2026-09-20'), round('2026-09-10'), round('2026-09-01')])).toEqual({ n: 3, from: '2026-09-01', to: '2026-09-20' });
  });
});

describe('sgWindowLine: the window, where the figure is drawn', () => {
  it('names the count and the months', () => {
    expect(sgWindowLine({ n: 8, from: '2026-06-08', to: '2026-07-10' })).toBe('Last 8 · Jun–Jul');
    expect(sgWindowLine({ n: 3, from: '2026-09-01', to: '2026-09-20' })).toBe('Last 3 · Sep');
  });

  it('a window across a new year names both years', () => {
    expect(sgWindowLine({ n: 10, from: '2025-11-20', to: '2026-03-02' })).toBe('Last 10 · Nov 2025–Mar 2026');
  });

  it('no window, no line', () => {
    expect(sgWindowLine(null)).toBeNull();
    expect(sgWindowLine(undefined)).toBeNull();
  });

  it('spoken in full for a screen reader', () => {
    expect(sgWindowSpoken({ n: 8, from: '2026-06-08', to: '2026-07-10' })).toBe('over the last 8 rounds with strokes gained, June to July');
    expect(sgWindowSpoken({ n: 3, from: '2026-09-01', to: '2026-09-20' })).toBe('over the last 3 rounds with strokes gained, in September');
  });
});
