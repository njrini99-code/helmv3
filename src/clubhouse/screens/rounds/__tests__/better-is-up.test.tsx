// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MONTH_SPARK_MIN_SPAN, MonthSpark, monthSparkBars, PUTTS_SCALE, puttsShare, Ribbon } from '../parts';
import { seasonFrom, toLibraryRound, type ChLibraryRound, type ChRoundListRow } from '../../../data/rounds-shape';

afterEach(cleanup);

/** Stats visuals Q1 and 7.2: the Rounds library draws scores better-is-up, with the real values kept on the ticks. */
describe('the season ribbon reads better as up', () => {
  const r = (id: string, date: string, toPar: number) => ({ id, date, score: 72 + toPar, toPar, type: 'practice' as const });
  const rounds = [r('a', '2026-08-02', -2), r('b', '2026-08-09', 3), r('c', '2026-08-16', 0)];

  it('puts an under-par round above the par line and an over-par one below it', () => {
    const { container } = render(<Ribbon rounds={rounds} avg={0.3} />);
    const par = container.querySelector('line.is-par')!;
    const parY = Number(par.getAttribute('y1'));
    const bar = (cls: string) => container.querySelector(`rect.ch-rd-rib__bar.${cls}`)!;
    const under = bar('is-under');
    const over = bar('is-over');
    // The under-par bar ends at the par line from above; the over-par bar starts at it and hangs below.
    expect(Number(under.getAttribute('y')) + Number(under.getAttribute('height'))).toBeCloseTo(parY, 6);
    expect(Number(over.getAttribute('y'))).toBeCloseTo(parY, 6);
    // A hanging bar grows from its top (the par line), so its reveal starts there.
    expect(over.getAttribute('class')).toContain('is-down');
    expect(under.getAttribute('class')).not.toContain('is-down');
  });

  it('keeps the real tick values, with under par above and over par below', () => {
    const { container } = render(<Ribbon rounds={rounds} avg={0.3} />);
    const ticks = [...container.querySelectorAll('text.ch-rd-rib__t')]
      .filter((t) => /^(Par|[+−]\d)$/.test(t.textContent ?? ''))
      .map((t) => ({ label: t.textContent, y: Number(t.getAttribute('y')) }))
      .sort((a, b) => a.y - b.y);
    expect(ticks.map((t) => t.label)).toEqual(['−2', '−1', 'Par', '+1', '+2', '+3']);
  });

  it('writes each score at the far end of its bar, clear of the dates', () => {
    const { container } = render(<Ribbon rounds={rounds} avg={0.3} />);
    const values = [...container.querySelectorAll('text.ch-rd-rib__v')].map((t) => Number(t.getAttribute('y')));
    const date = Math.min(...[...container.querySelectorAll('text.ch-rd-rib__d')].map((t) => Number(t.getAttribute('y'))));
    const parY = Number(container.querySelector('line.is-par')!.getAttribute('y1'));
    // Under par: the score above the bar; over par: below its end; both above the date row.
    expect(values[0]!).toBeLessThan(parY);
    expect(values[1]!).toBeGreaterThan(parY);
    for (const v of values) expect(v).toBeLessThan(date - 10);
  });
});

describe('the month spark reads better as up', () => {
  const lib = (id: string, toPar: number): ChLibraryRound => ({ id, date: '2026-09-01', course: 'C', tee: null, teeColor: null, type: null, holes: 18, score: 72 + toPar, toPar, out: null, inn: null, fairways: null, greens: null, putts: null, countable: true });

  it('runs each bar from the par line, under par up and over par down, oldest first (CH-09)', () => {
    // Newest first, as the library lists them.
    const { container } = render(<MonthSpark rounds={[lib('c', 4), lib('b', -1), lib('a', 1)]} />);
    const zero = parseFloat((container.querySelector('b') as HTMLElement).style.top);
    const bars = [...container.querySelectorAll('i')].map((i) => ({ top: parseFloat((i as HTMLElement).style.top), h: parseFloat((i as HTMLElement).style.height) }));
    // +1, −1, +4: the over-par bars start at par and hang below it, the under-par bar ends at par from above.
    expect(bars[0]!.top).toBeCloseTo(zero, 5);
    expect(bars[1]!.top + bars[1]!.h).toBeCloseTo(zero, 5);
    expect(bars[2]!.top).toBeCloseTo(zero, 5);
    // Lengths are the strokes from par on one scale: +4 is four times +1 and −1.
    expect(bars[2]!.h / bars[0]!.h).toBeCloseTo(4, 1);
    expect(bars[1]!.h).toBeCloseTo(bars[0]!.h, 1);
    expect(container.querySelectorAll('i.is-under')).toHaveLength(1);
  });

  it('a +1 and a +2 month draw a stroke apart on a range at least ten strokes wide, not as 100% and 24% (CH-09)', () => {
    const { bars } = monthSparkBars([1, 2]);
    expect(bars[1]!.height - bars[0]!.height).toBeLessThanOrEqual(100 / MONTH_SPARK_MIN_SPAN + 0.1);
    expect(bars[1]!.height / bars[0]!.height).toBeCloseTo(2, 1);
  });
});

describe('putts on the Rounds library read as Stats counts them', () => {
  const row = (id: string, putts: number | null, extra: Partial<ChRoundListRow> = {}): ChRoundListRow => ({
    id,
    course_name: 'C',
    tees_played: null,
    round_date: '2026-09-10',
    round_type: 'qualifier',
    total_score: 74,
    score_to_par: 2,
    front_nine: 37,
    back_nine: 37,
    holes_played: 18,
    total_putts: putts,
    total_gir: null,
    total_gir_possible: null,
    total_fairways_hit: null,
    total_fairways: null,
    ...extra,
  });

  it('a round written 0 putts has none recorded, and the season mean leaves it out', () => {
    const list = [row('a', 30), row('b', 0), row('c', 32)].map((x) => toLibraryRound(x)!);
    expect(list.map((x) => x.putts)).toEqual([30, null, 32]);
    expect(seasonFrom(list, '2026-08-01').putts).toBe(31);
  });
});

describe('putts bars read one way on the Rounds page (CH-14)', () => {
  it('the season bar and a round’s meter are both the putts per 18, longer for more', () => {
    expect(puttsShare(30)).toBeCloseTo(30 / PUTTS_SCALE, 6);
    expect(puttsShare(34)).toBeGreaterThan(puttsShare(30));
    // A nine-hole round's 16 putts is 32 a round.
    expect(puttsShare(16, 9)).toBeCloseTo(32 / PUTTS_SCALE, 6);
  });
});
