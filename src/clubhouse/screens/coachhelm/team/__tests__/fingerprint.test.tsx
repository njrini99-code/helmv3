import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChTeamPlayer } from '../../../../data/coachhelm-team-shape';
import { FingerPrint, fingerScale } from '../Cards';

/**
 * The roster's fingerprints (stats and charts audit 2026-11-15, CH-17): zero sat at 9 of 34 for everyone, so a gain stopped at about
 * 0.4 of a stroke and a loss at 1.3, with no mark either way, and every bar had a 2pt floor. Now one ruler for the roster, sized so
 * the largest gain and loss both fit, and no floor.
 */
afterEach(cleanup);

const player = (id: string, [tee, approach, short_game, putting]: Array<number | null>) =>
  ({ id, legs: { tee: { strokes: tee }, approach: { strokes: approach }, short_game: { strokes: short_game }, putting: { strokes: putting } } }) as unknown as ChTeamPlayer;

const bars = (p: ChTeamPlayer, scale?: { zero: number; perStroke: number }) => {
  const svg = render(<FingerPrint player={p} scale={scale} />).container.querySelector('svg')!;
  const h = Number(svg.getAttribute('height'));
  const out = [...svg.querySelectorAll('rect')].map((r) => ({ kind: r.getAttribute('class'), y: Number(r.getAttribute('y')), h: Number(r.getAttribute('height')) }));
  cleanup();
  return { h, out };
};

describe('FingerPrint · one ruler, nothing cut (CH-17)', () => {
  it('a gain of 0.4 and one of 1.0 draw in proportion; the old zero cut both to the same 7pt', () => {
    const roster = [player('a', [0.4, 1.0, -1.0, null])];
    const { out, h } = bars(roster[0]!, fingerScale(roster));
    const [small, big, loss] = out;
    expect(small!.kind).toBe('g');
    expect(big!.h / small!.h).toBeCloseTo(2.5, 5);
    expect(loss!.kind).toBe('l');
    expect(loss!.h).toBeCloseTo(big!.h, 5);
    for (const b of out) {
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.h).toBeLessThanOrEqual(h);
    }
  });

  it('every player on the roster reads on the same ruler, and a small figure keeps its own length (no floor)', () => {
    const roster = [player('a', [-2.5, 0.3, 0, 0.02]), player('b', [-0.5, -0.5, 0.2, 0.1])];
    const ruler = fingerScale(roster);
    const a = bars(roster[0]!, ruler).out;
    const b = bars(roster[1]!, ruler).out;
    // −2.5 against −0.5: five times the length on one ruler.
    expect(a[0]!.h / b[0]!.h).toBeCloseTo(5, 5);
    // +0.02 is a sliver, not a 2pt floor; zero draws nothing.
    expect(a.at(-1)!.h).toBeLessThan(1);
    expect(a).toHaveLength(3);
  });

  it('a roster with no figures keeps the zero at the middle', () => {
    expect(fingerScale([player('a', [null, null, null, null])]).zero).toBe(17);
  });
});
