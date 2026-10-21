import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { triplePlusCount } from '../data/stats-figures';
import { mixPercents, mixReadout, mixRows, pctText, perRoundText } from '../screens/stats/mix-rows';
import { ScoreMixBar } from '../screens/stats/ScoreMixBar';

// The preview player's ten rounds: 180 holes.
const COUNTS = { eagle: 1, birdie: 19, par: 100, bogey: 48, double: 12 };
const PER = { eagle: 0.06, birdie: 1.9, par: 9.8, bogey: 4.8, double: 1.2 };

describe('mixPercents: whole percents that add up to 100 (largest remainder)', () => {
  it('the preview mix: 0.6, 10.6, 55.6, 26.7, 6.7 become 0, 10, 56, 27, 7', () => {
    const p = mixPercents([1, 19, 100, 48, 12]);
    expect(p).toEqual([0, 10, 56, 27, 7]);
    expect(p.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('always sums to 100 and never moves a share a point or more off its exact value', () => {
    const cases = [
      [1, 1, 1],
      [1, 2, 3, 4, 5],
      [7, 0, 0, 0, 0],
      [3, 3, 3, 3, 3],
      [0, 1, 0, 0, 2],
      [2, 11, 37, 19, 3],
      [1, 0, 98, 0, 1],
    ];
    for (const c of cases) {
      const total = c.reduce((a, b) => a + b, 0);
      const p = mixPercents(c);
      expect(p.reduce((a, b) => a + b, 0)).toBe(100);
      p.forEach((v, i) => expect(Math.abs(v - (c[i]! / total) * 100)).toBeLessThan(1));
    }
  });

  it('a tie in the remainder goes to the larger share, then to the earlier result', () => {
    expect(mixPercents([1, 1, 1])).toEqual([34, 33, 33]);
    expect(mixPercents([1, 2])).toEqual([33, 67]);
  });

  it('no holes: all zeros, never NaN', () => {
    expect(mixPercents([0, 0, 0, 0, 0])).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('the mix rows and their words', () => {
  it('a result with holes that rounds to none reads "<1%"; no holes reads "0%"', () => {
    expect(pctText(1, 0)).toBe('<1%');
    expect(pctText(0, 0)).toBe('0%');
    expect(pctText(19, 10)).toBe('10%');
  });

  it('holes a round as Game detail prints them: two decimals only for a small non-zero rate', () => {
    expect(perRoundText(0.06)).toBe('0.06');
    expect(perRoundText(1.9)).toBe('1.9');
    expect(perRoundText(0)).toBe('0.0');
  });

  it('rows run eagle, birdie, par, bogey, double, with the counts unchanged', () => {
    const rows = mixRows(COUNTS, PER);
    expect(rows.map((r) => [r.label, r.count, r.pctText, r.perRound])).toEqual([
      ['Eagle or better', 1, '<1%', 0.06],
      ['Birdie', 19, '10%', 1.9],
      ['Par', 100, '56%', 9.8],
      ['Bogey', 48, '27%', 4.8],
      ['Double or worse', 12, '7%', 1.2],
    ]);
    // A rate the calculator could not give prints nothing, never a zero.
    expect(mixRows(COUNTS, { birdie: null })[1]!.perRound).toBeNull();
  });

  it('reads a result as a sentence, with the triples inside double or worse when they fit', () => {
    const rows = mixRows(COUNTS, PER);
    expect(mixReadout(rows[1]!, 180)).toBe('Birdie · 19 of 180 holes · 10% · 1.9 a round');
    expect(mixReadout(rows[4]!, 180, 3)).toBe('Double or worse · 12 of 180 holes · 7% · 1.2 a round · 3 triple or worse');
    // A triple count that cannot be inside the doubles is not shown; nor is one the read did not give.
    expect(mixReadout(rows[4]!, 180, 13)).toBe('Double or worse · 12 of 180 holes · 7% · 1.2 a round');
    expect(mixReadout(rows[4]!, 180, null)).toBe('Double or worse · 12 of 180 holes · 7% · 1.2 a round');
    // Only double or worse carries triples.
    expect(mixReadout(rows[3]!, 180, 3)).toBe('Bogey · 48 of 180 holes · 27% · 4.8 a round');
    expect(mixReadout(mixRows({ eagle: 0, birdie: 0, par: 1, bogey: 0, double: 0 })[2]!, 1)).toBe('Par · 1 of 1 hole · 100%');
  });

  it('triplePlusCount counts holes three or more over par', () => {
    const h = (score: number, par: number) => ({ round_id: 'r', hole_number: 1, par, score });
    expect(triplePlusCount([h(7, 4), h(6, 4), h(8, 4), h(3, 3), h(6, 3)])).toBe(3);
    expect(triplePlusCount([])).toBe(0);
  });
});

describe('ScoreMixBar: read, pin, keys', () => {
  const show = (props: Partial<Parameters<typeof ScoreMixBar>[0]> = {}) => render(<ScoreMixBar counts={COUNTS} perRound={PER} triple={3} label="Every hole, by result" {...props} />);
  const seg = (k: string) => document.querySelector(`.ch-sv-mix-seg.is-${k}`) as HTMLElement;
  const key = (i: number) => document.querySelectorAll('.ch-sv-mix-key li')[i] as HTMLElement;
  const read = () => document.querySelector('.ch-sv-read')!.textContent;
  const live = () => document.querySelector('[aria-live="polite"]')!.textContent;

  it('is a focusable group named with every result and its holes, ordered under par to over par', () => {
    show();
    const group = screen.getByRole('group', {
      name: 'Every hole, by result, under par to the left and over par to the right: Eagle or better 1 of 180, Birdie 19 of 180, Par 100 of 180, Bogey 48 of 180, Double or worse 12 of 180 holes. Use the arrow keys to read each result.',
    });
    expect(group.getAttribute('tabindex')).toBe('0');
    expect([...document.querySelectorAll('.ch-sv-mix-seg')].map((s) => s.className.replace('ch-sv-mix-seg is-', ''))).toEqual(['eagle', 'birdie', 'par', 'bogey', 'double']);
    expect(document.querySelector('.ch-sv-mix-axis')!.textContent).toBe('Under parOver par');
  });

  it('sizes each segment by its holes and labels it with its share; the key carries every share and the rate a round', () => {
    show();
    expect(seg('par').style.flexGrow).toBe('100');
    expect(seg('eagle').style.flexGrow).toBe('1');
    expect(seg('birdie').textContent).toBe('10%');
    expect([...document.querySelectorAll('.ch-sv-mix-key li')].map((l) => l.textContent)).toEqual([
      'Eagle or better<1%0.06 a round',
      'Birdie10%1.9 a round',
      'Par56%9.8 a round',
      'Bogey27%4.8 a round',
      'Double or worse7%1.2 a round',
    ]);
  });

  it('rests on a hint, reads a result under the pointer, and does not announce a hover', () => {
    show();
    expect(read()).toBe('Select a result to see how many holes.');
    fireEvent.pointerEnter(seg('birdie'), { pointerType: 'mouse' });
    expect(read()).toBe('Birdie · 19 of 180 holes · 10% · 1.9 a round');
    expect(live()).toBe('');
    expect(seg('birdie').hasAttribute('data-active')).toBe(true);
    expect(document.querySelector('.ch-sv-mix')!.hasAttribute('data-has-active')).toBe(true);
    fireEvent.pointerLeave(seg('birdie'), { pointerType: 'mouse' });
    expect(read()).toBe('Select a result to see how many holes.');
  });

  it('a tap on a segment or its key entry pins it and announces it; a second tap lets go', () => {
    show();
    fireEvent.click(key(4));
    expect(read()).toBe('Double or worse · 12 of 180 holes · 7% · 1.2 a round · 3 triple or worse');
    expect(live()).toBe('Double or worse · 12 of 180 holes · 7% · 1.2 a round · 3 triple or worse');
    expect(seg('double').hasAttribute('data-pinned')).toBe(true);
    expect(key(4).hasAttribute('data-pinned')).toBe(true);
    fireEvent.click(seg('double'));
    expect(live()).toBe('');
    expect(read()).toBe('Select a result to see how many holes.');
  });

  it('arrow keys step left to right, Home and End jump, Esc clears', () => {
    show();
    const group = screen.getByRole('group');
    fireEvent.keyDown(group, { key: 'Home' });
    expect(live()).toBe('Eagle or better · 1 of 180 holes · <1% · 0.06 a round');
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(live()).toMatch(/^Birdie · 19 of 180/);
    fireEvent.keyDown(group, { key: 'End' });
    expect(live()).toMatch(/^Double or worse · 12 of 180/);
    fireEvent.keyDown(group, { key: 'Escape' });
    expect(live()).toBe('');
  });

  it('a result with no holes draws no segment, and the main key still reads it as 0%', () => {
    show({ counts: { ...COUNTS, eagle: 0 }, perRound: { ...PER, eagle: 0 } });
    expect(seg('eagle')).toBeNull();
    expect(key(0).textContent).toBe('Eagle or better0%0.0 a round');
    fireEvent.click(key(0));
    expect(read()).toBe('Eagle or better · 0 of 179 holes · 0% · 0.0 a round');
  });

  it('compact (each par): no axis, no rate a round, and a result with no holes is left out of the key', () => {
    show({ counts: { eagle: 0, birdie: 4, par: 22, bogey: 10, double: 4 }, perRound: undefined, triple: undefined, label: 'Par 3s', compact: true });
    expect(document.querySelector('.ch-sv-mix.is-compact')).not.toBeNull();
    expect(document.querySelector('.ch-sv-mix-axis')).toBeNull();
    expect([...document.querySelectorAll('.ch-sv-mix-key li')].map((l) => l.textContent)).toEqual(['Birdie10%', 'Par55%', 'Bogey25%', 'Double or worse10%']);
    expect(read()).toBe('Select a result.');
    fireEvent.click(key(3));
    expect(read()).toBe('Double or worse · 4 of 40 holes · 10%');
  });

  it('under 30 holes the mix is an early read: muted, with its tag; from 30 it is plain', () => {
    show({ counts: { eagle: 0, birdie: 3, par: 12, bogey: 7, double: 2 }, perRound: null });
    expect(document.querySelector('.ch-sv-mix.is-early')).not.toBeNull();
    expect(document.querySelector('.ch-sv-note')!.textContent).toBe('Early read · 24 holes: these shares can still move a lot.');
    // The shares still read.
    expect(seg('par').textContent).toBe('50%');
    document.body.innerHTML = '';
    show({ counts: { eagle: 0, birdie: 3, par: 18, bogey: 7, double: 2 }, perRound: null });
    expect(document.querySelector('.ch-sv-mix.is-early')).toBeNull();
    expect(document.querySelector('.ch-sv-note')).toBeNull();
  });

  it('no holes at all: says so instead of an empty bar', () => {
    show({ counts: { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 } });
    expect(document.querySelector('.ch-sv-mix')).toBeNull();
    expect(document.querySelector('.ch-sv-mix-none')!.textContent).toBe('No holes scored yet.');
  });
});
