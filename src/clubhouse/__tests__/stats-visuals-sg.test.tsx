import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PREVIEW_PLAYER } from '../preview/fixtures-stats';
import { LegBars } from '../screens/stats/LegBars';
import { legReadout, sgLegBars, sgLegRows } from '../screens/stats/leg-rows';
import { SgBars } from '../screens/stats/SgBars';
import type { ChPlayerProfile } from '../data/stats-player';

const withRounds = (eff: number): ChPlayerProfile => ({
  ...PREVIEW_PLAYER,
  win: { ...PREVIEW_PLAYER.win, rounds: eff, sgRounds: eff, effRounds: eff, effSgRounds: eff },
});

describe('sgLegRows: how sure each leg is', () => {
  it('ten rounds: off the tee and approach are steady, around the green and putting are early reads', () => {
    const rows = sgLegRows(PREVIEW_PLAYER, true);
    expect(rows.map((r) => [r.key, r.state])).toEqual([
      ['tee', 'steady'],
      ['approach', 'steady'],
      ['around', 'early'],
      ['putting', 'early'],
      ['total', 'steady'],
    ]);
    expect(rows[3]!.tag).toBe('Early read · 10 rounds');
    expect(rows[3]!.n).toBe(10);
    expect(rows.every((r) => r.value != null && r.se != null && r.se > 0)).toBe(true);
  });

  it('under its floor a leg has no value and says what it needs; the others still show', () => {
    const rows = sgLegRows(withRounds(4), false);
    expect(rows.map((r) => r.state)).toEqual(['early', 'early', 'none', 'none', 'early']);
    expect(rows[2]!.value).toBeNull();
    expect(rows[2]!.tag).toBe('Needs 5 rounds');
    expect(rows[0]!.tag).toBe('Early read · 4 rounds');
    // A player's own view carries no team mark.
    expect(rows.every((r) => r.team == null)).toBe(true);
  });

  it('two rounds: nothing reaches its floor', () => {
    expect(sgLegRows(withRounds(2), true).every((r) => r.state === 'none' && r.value == null)).toBe(true);
  });

  it('a coach’s legs carry the team’s value for the same leg', () => {
    const bars = sgLegBars(PREVIEW_PLAYER, true);
    expect(bars.every((b) => b.team != null)).toBe(true);
    expect(sgLegBars(PREVIEW_PLAYER, false).every((b) => b.team == null)).toBe(true);
  });

  it('reads a leg as a sentence: the figure, the rounds, the likely range, the team', () => {
    const [tee] = sgLegRows(PREVIEW_PLAYER, true);
    const text = legReadout(tee!, 'Team');
    expect(text).toMatch(/^Off the tee · \+0\.3 a round · 10 rounds · likely range −?\d\.\d to \+?\d\.\d · Team [+−]\d\.\d$/);
    expect(legReadout({ label: 'Putting', value: null, tag: 'Needs 5 rounds' })).toBe('Putting · Needs 5 rounds');
    expect(legReadout({ label: 'Putting', value: 0.2, n: 6, state: 'early', tag: 'Early read · 6 rounds', se: null })).toBe('Putting · +0.2 a round · Early read · 6 rounds');
  });
});

describe('LegBars: read, pin, keys', () => {
  const rows = () => sgLegBars(PREVIEW_PLAYER, true);
  const show = () => render(<LegBars rows={rows()} baseline="Zero is the Tour baseline" teamName="Team" />);
  const row = (i: number) => document.querySelectorAll('.ch-lb__r')[i] as HTMLElement;
  const read = () => document.querySelector('.ch-sv-read')!.textContent;
  const live = () => document.querySelector('[aria-live="polite"]')!.textContent;

  it('is a focusable group named with every leg, not a flat image', () => {
    show();
    const group = screen.getByRole('group', { name: /Strokes gained per round by leg: Off the tee .+, Approach .+, Around green .+, Putting .+/ });
    expect(group.getAttribute('tabindex')).toBe('0');
  });

  it('rests on a hint, reads a leg under the pointer, and does not announce a hover', () => {
    show();
    // B14: the whisker is one standard error (about 68%), which the readout calls the likely range; "margin of error" implies 95%.
    expect(read()).toBe('Select a leg to see its likely range.');
    fireEvent.pointerEnter(row(1), { pointerType: 'mouse' });
    expect(read()).toMatch(/^Approach · [+−]\d\.\d a round · 10 rounds · likely range/);
    expect(live()).toBe('');
    fireEvent.pointerLeave(row(1), { pointerType: 'mouse' });
    expect(read()).toBe('Select a leg to see its likely range.');
  });

  it('pins a leg on a tap and announces it; Esc lets go', () => {
    show();
    fireEvent.click(row(3));
    expect(row(3).hasAttribute('data-pinned')).toBe(true);
    expect(read()).toMatch(/^Putting · .+ Early read · 10 rounds/);
    expect(live()).toBe(read());
    fireEvent.keyDown(screen.getByRole('group'), { key: 'Escape' });
    expect(live()).toBe('');
    expect(row(3).hasAttribute('data-pinned')).toBe(false);
  });

  it('steps with the arrow keys and announces each step', () => {
    show();
    const group = screen.getByRole('group');
    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(live()).toMatch(/^Off the tee/);
    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(live()).toMatch(/^Approach/);
    fireEvent.keyDown(group, { key: 'End' });
    expect(live()).toMatch(/^Putting/);
  });

  it('draws a whisker on every leg that has a range, hollow marks for early reads, and a note naming them', () => {
    show();
    expect(document.querySelectorAll('.ch-sv-whisk')).toHaveLength(4);
    expect([...document.querySelectorAll('.ch-lb__r')].map((r) => r.classList.contains('is-early'))).toEqual([false, false, true, true]);
    expect(document.querySelector('.ch-sv-note')!.textContent).toBe('Muted bars are early reads (Around green, Putting) and can still move a lot.');
    // An early read carries no gain or loss color on its figure.
    expect(row(3).querySelector('.ch-lb__v')!.className).not.toMatch(/ch-gain|ch-loss/);
    expect(row(1).querySelector('.ch-lb__v')!.className).toMatch(/ch-gain|ch-loss/);
  });

  it('a leg under its floor says what it needs where the bar would be, with no bar and no whisker', () => {
    render(<LegBars rows={sgLegBars(withRounds(4), false)} baseline="Zero is the Tour baseline" />);
    const putting = row(3);
    expect(putting.querySelector('.ch-sv-needs')!.textContent).toBe('Needs 5 rounds');
    expect(putting.querySelector('.ch-lb__bar')).toBeNull();
    expect(putting.querySelector('.ch-sv-whisk')).toBeNull();
    expect(putting.querySelector('.ch-lb__v')!.textContent).toBe('—');
  });

  it('keeps the bar on the data’s own scale: a whisker never moves it', () => {
    show();
    const scaled = rows().flatMap((r) => [r.value, r.team]).map((v) => Math.abs(v ?? 0));
    const scale = Math.max(1, Math.ceil(Math.max(0, ...scaled)));
    const approach = rows()[1]!;
    expect(parseFloat((row(1).querySelector('.ch-lb__bar') as HTMLElement).style.width)).toBeCloseTo((Math.abs(approach.value!) / scale) * 50, 1);
  });
});

describe('SgBars: the phone’s rows', () => {
  const rows = () => sgLegRows(PREVIEW_PLAYER, false);
  const leg = (i: number) => document.querySelectorAll('.ch-stm-leg')[i] as HTMLElement;
  const live = () => document.querySelector('[aria-live="polite"]')!.textContent;

  it('rests on the same words as the desktop legs: the whisker is the likely range (B14)', () => {
    render(<SgBars rows={rows()} />);
    expect(document.querySelector('.ch-sv-read')!.textContent).toBe('Tap a leg to see its likely range.');
  });

  it('five rows, the total last, each a tap target that pins its reading', () => {
    render(<SgBars rows={rows()} />);
    expect(document.querySelectorAll('.ch-stm-leg')).toHaveLength(5);
    expect(leg(4).className).toContain('is-total');
    fireEvent.click(leg(4));
    expect(leg(4).hasAttribute('data-pinned')).toBe(true);
    expect(live()).toMatch(/^Total · [+−]\d\.\d a round · 10 rounds · likely range/);
    expect(document.querySelector('.ch-sv-read')!.textContent).toBe(live());
  });

  it('a muted row is an early read and a row under its floor says what it needs', () => {
    render(<SgBars rows={sgLegRows(withRounds(4), false)} />);
    expect(leg(0).className).toContain('is-early');
    expect(leg(3).querySelector('.ch-sv-needs')!.textContent).toBe('Needs 5 rounds');
    expect(leg(3).querySelector('.ch-stm-leg__v')).toBeNull();
  });
});
