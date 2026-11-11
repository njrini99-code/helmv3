import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { RoundHole } from '@/lib/types/golf';
import { TrackStrip } from '../parts';

/**
 * The hole strip (owner, 2026-11-11): every chip shows its hole number; a finished hole also carries its score as the
 * small mark the scorecard uses (a circle under par, a square over it, a plain figure for par). No chip shows a bare
 * score in the number's place: on the phone a played hole used to hide its number and show its score as a numeral, so
 * the row read "4 6 3 4 5 6 7".
 */
afterEach(cleanup);

const HOLES: RoundHole[] = [
  { number: 1, par: 4, yardage: 380, score: 3 },
  { number: 2, par: 4, yardage: 400, score: 4 },
  { number: 3, par: 3, yardage: 170, score: 4 },
  { number: 4, par: 5, yardage: 520, score: 7 },
  { number: 5, par: 5, yardage: 540, score: 3 },
  { number: 6, par: 4, yardage: 410, score: null },
  { number: 7, par: 4, yardage: 390, score: null },
];
const chips = () => [...document.querySelectorAll<HTMLElement>('.ch-rt-strip__h')];

describe('every chip shows its hole number; a finished hole also carries its score as the scorecard’s mark', () => {
  it('the number is the chip’s first line on every hole, played or not', () => {
    render(<TrackStrip holes={HOLES} current={5} onJump={() => {}} />);
    expect(chips().map((c) => c.querySelector(':scope > em')?.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    for (const chip of chips()) expect(chip.firstElementChild!.tagName).toBe('EM');
  });

  it('a played hole’s score is the ScoreMark under its number: a circle under par, a square over it, plain for par', () => {
    render(<TrackStrip holes={HOLES} current={5} onJump={() => {}} />);
    const mark = (i: number) => chips()[i]!.querySelector(':scope > .ch-score');
    expect(mark(0)!.className).toBe('ch-score ch-score--sm ch-score--birdie');
    expect(mark(0)!.textContent).toBe('3');
    expect(mark(1)!.className).toBe('ch-score ch-score--sm');
    expect(mark(2)!.className).toBe('ch-score ch-score--sm ch-score--bogey');
    expect(mark(3)!.className).toBe('ch-score ch-score--sm ch-score--double');
    expect(mark(4)!.className).toBe('ch-score ch-score--sm ch-score--eagle');
    // Not played: the number alone, and no mark.
    expect(mark(5)).toBeNull();
    expect(mark(6)).toBeNull();
    expect(chips()[0]!.classList.contains('is-done')).toBe(true);
    expect(chips()[5]!.classList.contains('is-done')).toBe(false);
  });

  it('each chip is still named by hole, score and to par (CH-11805)', () => {
    render(<TrackStrip holes={HOLES} current={5} onJump={() => {}} />);
    expect(screen.getByRole('button', { name: 'Hole 1, 3, 1 under' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hole 4, 7, 2 over' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Hole 6, current' })).toBeTruthy();
  });
});

describe('the phone strip draws both (rounds-track.css)', () => {
  const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/rounds-track.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // The phone block: everything from the shot screen's own phone rules on (the desk's strip is drawn before it).
  const phone = css.slice(css.indexOf('min-height: 100dvh;'));
  const rules = [...phone.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));
  const of = (re: RegExp) => rules.filter((r) => re.test(r.sel));

  it('no rule hides a hole’s number', () => {
    const numberRules = of(/\.ch-rt-strip__h[^,{]*\bem\b/);
    expect(numberRules.length).toBeGreaterThan(0);
    for (const r of numberRules) expect(r.body, r.sel).not.toMatch(/display:\s*none|visibility:\s*hidden|font-size:\s*0/);
  });

  it('the score keeps the mark’s box and shapes instead of being flattened to a numeral', () => {
    const base = of(/^\.ch-rt-strip \.ch-rt-strip__h \.ch-score$/)[0]!;
    expect(base.body).toMatch(/width: 20px;/);
    expect(base.body).toMatch(/height: 20px;/);
    expect(base.body).not.toMatch(/border-radius: 0/);
    const under = of(/^\.ch-rt-strip \.ch-rt-strip__h \.ch-score--birdie,\s*\.ch-rt-strip \.ch-rt-strip__h \.ch-score--eagle$/)[0]!;
    expect(under.body).toMatch(/border-radius: 50%;/);
    expect(under.body).toMatch(/var\(--ch-score-under-on-green\)/);
    const over = of(/^\.ch-rt-strip \.ch-rt-strip__h \.ch-score--bogey$/)[0]!;
    expect(over.body).toMatch(/border-radius: var\(--ch-radius-xs\);/);
    expect(over.body).toMatch(/box-shadow: var\(--ch-board-bogey-shadow\);/);
    // Red only under par (D-42): no over-par or par mark takes the under-par ink.
    for (const r of of(/ch-score--(bogey|double)/)) expect(r.body, r.sel).not.toMatch(/score-under/);
  });

  it('the chip is drawn 40px tall inside its 44px hit area, so the number and the mark both fit', () => {
    const plate = of(/^\.ch-rt-strip__h::before$/)[0]!;
    expect(plate.body).toMatch(/inset: 2px 4px;/);
    const chip = of(/^\.ch-rt-strip__h,\s*\.ch-rt-strip__h\.is-done,\s*\.ch-rt-strip__h\.is-cur,\s*\.ch-rt-strip__h\.is-cur\.is-done$/)[0]!;
    expect(chip.body).toMatch(/width: 44px;/);
    expect(chip.body).toMatch(/height: 44px;/);
  });
});
