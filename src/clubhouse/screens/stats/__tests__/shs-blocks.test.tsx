import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChCompare } from '../../../data/stats-figures';
import { AgainstBefore, Ribbon } from '../ShsBlocks';

/**
 * My stats phone, Against before (stats and charts audit 2026-11-15): the pill's arrow says a clear change only (CH-19); inside
 * the noise it prints the signed figure in neutral ink with no arrow. And each dumbbell puts better on the right (CH-14).
 */
afterEach(cleanup);

const compare = (rows: ChCompare['rows']): ChCompare => ({ lastRounds: 5, previousRounds: 5, lastHoleRounds: 5, previousHoleRounds: 5, rows });
const row = (over: Partial<ChCompare['rows'][number]>): ChCompare['rows'][number] => ({ label: 'Scoring avg', last: 74.2, previous: 74.5, unit: '', digits: 1, lowerIsBetter: true, se: 0.8, ...over });

describe('AgainstBefore · arrows for clear changes only (CH-19)', () => {
  it('−0.3 on an error of 0.8 shows no arrow and the signed figure', () => {
    const { container } = render(<AgainstBefore compare={compare([row({})])} rows={['Scoring avg']} previous />);
    const pill = container.querySelector('.ch-shs-db')!.querySelector('svg');
    expect(pill).toBeNull();
    expect(container.querySelector('.ch-shs-db')!.textContent).toContain('−0.3');
  });

  it('a clear change keeps its arrow', () => {
    const { container } = render(<AgainstBefore compare={compare([row({ last: 72.0, previous: 75.0, se: 0.8 })])} rows={['Scoring avg']} previous />);
    expect(container.querySelector('.ch-shs-db svg')).not.toBeNull();
  });

  it('a lower score sits to the right of the higher one: better is right (CH-14)', () => {
    const { container } = render(<AgainstBefore compare={compare([row({ last: 72.0, previous: 75.0 })])} rows={['Scoring avg']} previous />);
    const left = (cls: string) => parseFloat((container.querySelector(`.ch-shs-db .${cls}`) as HTMLElement).style.left);
    expect(left('now')).toBeGreaterThan(left('was'));
  });
});

describe('Ribbon · rounds sit by their dates (CH-11)', () => {
  it('three rounds with a month off between the second and third draw the second near the first', () => {
    const pts = [
      { label: 'Oct 1', value: 72, at: '2026-10-01' },
      { label: 'Oct 3', value: 74, at: '2026-10-03' },
      { label: 'Nov 2', value: 73, at: '2026-11-02' },
    ];
    const { container } = render(<Ribbon points={pts} lowerIsBetter />);
    const d = container.querySelector('path.ln')!.getAttribute('d')!;
    const xs = [...d.matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]));
    expect(xs).toHaveLength(3);
    expect(xs[1]! - xs[0]!).toBeLessThan(0.5 * (xs[2]! - xs[1]!));
  });

  it('with no dates the rounds stay evenly spaced', () => {
    const { container } = render(<Ribbon points={[{ label: 'a', value: 72 }, { label: 'b', value: 74 }, { label: 'c', value: 73 }]} lowerIsBetter />);
    const xs = [...container.querySelector('path.ln')!.getAttribute('d')!.matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]));
    expect(xs[1]! - xs[0]!).toBeCloseTo(xs[2]! - xs[1]!, 5);
  });
});
