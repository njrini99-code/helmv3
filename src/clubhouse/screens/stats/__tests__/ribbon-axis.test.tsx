// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Ribbon } from '../ShsBlocks';

afterEach(cleanup);

const pts = (values: number[]) => values.map((value, i) => ({ label: `R${i + 1}`, value }));
const figures = (c: HTMLElement) => [...c.querySelectorAll('.ry')].map((e) => e.textContent);

describe('Ribbon · the axis is always a scale', () => {
  it('a best round at par: the dashed line prints par’s value, so the axis reads 72 and 75, never "75" alone', () => {
    const { container } = render(<Ribbon points={pts([72, 72, 74, 75, 75, 74])} lowerIsBetter reference={{ value: 72, label: 'Par' }} />);
    const ref = container.querySelector('.rref')!;
    expect(ref.textContent).toBe('72');
    expect(ref.getAttribute('data-ch-rib-ref')).toBe('value');
    expect(figures(container)).toEqual(['75']);
  });

  it('a range clear of the reference keeps both of its own figures, and the line keeps its name', () => {
    const { container } = render(<Ribbon points={pts([73, 75, 76, 74])} lowerIsBetter reference={{ value: 72, label: 'Par' }} />);
    expect(container.querySelector('.rref')!.textContent).toBe('Par');
    expect(figures(container)).toEqual(['73', '76']);
  });

  it('with no reference it prints the best and the worst', () => {
    const { container } = render(<Ribbon points={pts([44, 52, 61])} format={(v) => `${Math.round(v)}%`} />);
    expect(container.querySelector('.rref')).toBeNull();
    expect(figures(container)).toEqual(['61%', '44%']);
  });
});
