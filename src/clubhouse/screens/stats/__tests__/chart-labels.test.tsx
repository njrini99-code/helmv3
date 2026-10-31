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

describe('MonthSpark (A8.7)', () => {
  const r = (id: string, toPar: number, holes: number) => ({ id, toPar, holes }) as unknown as ChLibraryRound;
  it('a nine-hole +2 is a +4 round: it does not stand as the best bar against an 18-hole +3', () => {
    // Newest first, as the library lists them.
    render(<MonthSpark rounds={[r('nine', 2, 9), r('full', 3, 18)]} />);
    const [full, nine] = [...document.querySelectorAll('.ch-rd-grp__spark i')].map((i) => parseFloat((i as HTMLElement).style.height));
    // Taller is better: the 18-hole +3 beats the nine's +4 per 18.
    expect(full!).toBeGreaterThan(nine!);
  });
});
