// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** A8.6 and A8.7: the green's bold label is the side most misses finish on; a month's spark reads nine-hole rounds per 18. */

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

import type { ChLibraryRound } from '../../../data/rounds-shape';
import { MonthSpark } from '../../rounds/parts';
import { GreenDiagram } from '../OverviewZones';

afterEach(cleanup);

describe('GreenDiagram (A8.6)', () => {
  it('bolds the worst side, not "Short" by default', () => {
    render(<GreenDiagram short={10} long={15} left={45} right={30} gir={52} />);
    const label = (side: string) => [...document.querySelectorAll('text')].find((t) => t.textContent?.startsWith(side))!;
    expect(label('Left').getAttribute('font-weight')).toBe('700');
    expect(label('Short').getAttribute('font-weight')).toBe('600');
  });
});

describe('GreenDiagram · arcs from nothing (CH-22)', () => {
  const widths = () => [...document.querySelectorAll('path[stroke-width]')].map((p) => Number(p.getAttribute('stroke-width')));
  it('a side no miss finishes on draws no weight, and 20% against 40% draws half the weight', () => {
    render(<GreenDiagram short={0} long={20} left={40} right={40} gir={50} />);
    const [short, long, left] = widths();
    expect(short).toBe(0);
    expect(long! / left!).toBeCloseTo(0.5, 5);
  });

  it('a side past half of the misses scales all four down together, so 60% and 80% stay apart and under 18', () => {
    render(<GreenDiagram short={60} long={0} left={0} right={40} gir={50} />);
    const [short, , , right] = widths();
    expect(short).toBeLessThanOrEqual(18);
    expect(right! / short!).toBeCloseTo(40 / 60, 5);
  });
});

describe('MonthSpark (A8.7)', () => {
  const r = (id: string, toPar: number, holes: number) => ({ id, toPar, holes }) as unknown as ChLibraryRound;
  it('a nine-hole +2 is a +4 round: it does not stand as the best bar against an 18-hole +3', () => {
    // Newest first, as the library lists them.
    render(<MonthSpark rounds={[r('nine', 2, 9), r('full', 3, 18)]} />);
    const [full, nine] = [...document.querySelectorAll('.ch-rd-grp__spark i')].map((i) => i as HTMLElement);
    // Each bar runs from the par line, over par below it (stats and charts audit 2026-11-15, CH-09): the nine's +4 per 18 hangs
    // further below par than the 18-hole +3, so it never reads as the better round.
    const h = (el: HTMLElement) => parseFloat(el.style.height);
    expect(h(nine!)).toBeGreaterThan(h(full!));
    expect(parseFloat(nine!.style.top)).toBe(parseFloat(full!.style.top));
  });
});
