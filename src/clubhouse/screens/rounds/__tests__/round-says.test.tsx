// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChReviewHole } from '../../../data/round-review-shape';
import { holesWords, RoundSays, saysFigures } from '../RoundSays';

afterEach(cleanup);

const hole = (n: number, d: number, over: Partial<ChReviewHole> = {}): ChReviewHole => ({ n, par: 4, yards: null, score: 4 + d, putts: 2, fairway: null, gir: false, penalties: 0, shots: [], ...over });

describe('saysFigures (P-7 4.5.3)', () => {
  const holes = [hole(1, 1), hole(2, 0, { gir: true, putts: 1 }), hole(3, 2), hole(4, 1), hole(5, 0, { gir: true }), hole(6, 0, { gir: true, putts: 2 })];

  it('says each figure with the usual when there is one', () => {
    const f = saysFigures({ holes, startHole: null, usual: { bounce: 'Usually 26% · 20 rounds', ppg: null, closing: null, big: 'Usually 1.4 a round · 20 rounds' }, nine: false, who: null });
    expect(f.map((x) => [x.id, x.value, x.caption])).toEqual([
      ['bounce', '2 of 3', 'Par or better after a bogey · usually 26% · 20 rounds'],
      ['ppg', '5 on 3 greens', 'Greens hit in regulation with putts recorded'],
      ['closing', '+1', 'Holes 4 to 6'],
      ['big', '1', 'Double bogey or worse · usually 1.4 a round · 20 rounds'],
    ]);
  });

  it('says why when the round cannot support a figure, and hides the score figures with no scores', () => {
    const f = saysFigures({ holes: [hole(1, 0), hole(2, 0)], startHole: null, usual: null, nine: false, who: null });
    expect(f.find((x) => x.id === 'bounce')).toMatchObject({ value: null, caption: 'No bogeys to bounce back from' });
    expect(f.find((x) => x.id === 'ppg')).toMatchObject({ value: null, caption: 'Needs 3 greens hit' });
    expect(saysFigures({ holes: [], startHole: null, usual: null, nine: false, who: null }).map((x) => x.id)).toEqual(['bounce', 'ppg']);
  });

  it('shows the putts rate from 10 greens, and a nine-hole round keeps the per-round usual', () => {
    const ten = Array.from({ length: 10 }, (_, i) => hole(i + 1, 0, { gir: true, putts: i < 3 ? 1 : 2 }));
    expect(saysFigures({ holes: ten, startHole: null, usual: null, nine: false, who: null }).find((x) => x.id === 'ppg')!.value).toBe('1.70');
    const nine = saysFigures({ holes: holes.slice(0, 4), startHole: null, usual: { bounce: null, ppg: null, closing: null, big: 'Usually 1.4 a round · 20 rounds' }, nine: true, who: null });
    expect(nine.find((x) => x.id === 'big')!.caption).toBe('Double bogey or worse · usually 1.4 a round · 20 rounds');
  });

  it('cites no outside figure anywhere (no tour average)', () => {
    const all = saysFigures({ holes, startHole: null, usual: null, nine: false, who: null });
    for (const f of all) expect(`${f.caption} ${f.about}`).not.toMatch(/tour|1\.75|estimate/i);
  });

  it('names the closing holes in play order, and the coach reads the player by name', () => {
    expect(holesWords([17, 18, 1])).toBe('Holes 17, 18 and 1');
    const full = Array.from({ length: 18 }, (_, i) => hole(i + 1, 0));
    const f = saysFigures({ holes: full, startHole: 10, usual: null, nine: false, who: 'Lena' });
    expect(f.find((x) => x.id === 'closing')!.caption).toBe('Holes 7 to 9');
    expect(f.find((x) => x.id === 'closing')!.about).toBe('Lena’s score to par on the last three holes played.');
  });
});

describe('RoundSays', () => {
  it('reads label, value and caption in order, never a dash, and opens its definition', () => {
    const f = saysFigures({ holes: [hole(1, 0), hole(2, 0)], startHole: null, usual: null, nine: false, who: null });
    const { container, getByRole } = render(<RoundSays figures={f} />);
    const first = container.querySelector('figcaption')!;
    expect(first.textContent).toBe('Bounce-back—No bogeys to bounce back fromNo bogeys to bounce back from');
    expect(first.querySelector('[aria-hidden="true"]')!.textContent).toBe('—');
    const info = getByRole('button', { name: 'About bounce-back' });
    expect(info.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(info);
    expect(info.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.ch-says__about:not([hidden])')!.textContent).toContain('A bounce-back is a par or better');
  });
});
