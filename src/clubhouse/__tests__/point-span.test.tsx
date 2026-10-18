import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { withPointSpan } from '../ui/point-span';

/** A hero figure's decimal point gets its own span, so the figure keeps its text and the point gets its room. */
describe('withPointSpan', () => {
  it('wraps the first decimal point and keeps the figure as it reads', () => {
    const { container } = render(<b>{withPointSpan('73.4')}</b>);
    expect(container.querySelector('b')!.innerHTML).toBe('73<span class="ch-num__pt">.</span>4');
    expect(container.textContent).toBe('73.4');
  });

  it('leaves a figure without a point, and the no-data dash, as they were', () => {
    expect(withPointSpan('72')).toBe('72');
    expect(withPointSpan('—')).toBe('—');
  });
});
