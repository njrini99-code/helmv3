import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChartText } from '../charts/ChartText';

describe('ChartText', () => {
  it('sizes in viewBox units, inline, so no --ch-type-* rule can scale it', () => {
    const { container } = render(<svg viewBox="0 0 100 100"><ChartText size={13} x={4} y={9}>Putting</ChartText></svg>);
    const text = container.querySelector('text')!;
    expect(text.style.fontSize).toBe('13px');
    expect(text.getAttribute('x')).toBe('4');
    expect(text.textContent).toBe('Putting');
  });
});
