import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricValue } from './MetricValue';

describe('MetricValue', () => {
  it('prints the registry text in tabular numerals with the tone class', () => {
    const { container } = render(<MetricValue metricId="sg_putting" value={-0.834} />);
    const figure = container.querySelector('.tabular-nums');
    expect(figure?.textContent).toBe('−0.83');
    expect(figure?.className).toContain('text-fw-warning-ink');
    expect(screen.getByText('Strokes gained: putting, minus 0.83')).toBeTruthy();
  });

  it('prints good signed values green and plain values in ink', () => {
    const { container, rerender } = render(<MetricValue metricId="round_to_par" value={-2} />);
    expect(container.querySelector('.tabular-nums')?.className).toContain('text-fw-success-ink');
    rerender(<MetricValue metricId="scoring_average" value={72.75} />);
    const figure = container.querySelector('.tabular-nums');
    expect(figure?.textContent).toBe('72.8');
    expect(figure?.className).not.toMatch(/success|warning/);
  });

  it('shows no number under the floor and says how many more', () => {
    const { container } = render(<MetricValue metricId="scoring_average" value={71} sample={1} />);
    expect(container.querySelector('.tabular-nums')?.textContent).toBe('—');
    expect(container.textContent).toContain('Needs 2 more rounds');
  });

  it('tags an early read and a differing window', () => {
    const { container } = render(
      <MetricValue metricId="scrambling_pct" value={27} sample={12} window="last_90_days" showLabel />,
    );
    expect(container.textContent).toContain('Scrambling');
    expect(container.textContent).toContain('27%');
    expect(container.textContent).toContain('Last 90 days · Early read');
    expect(container.querySelector('.tabular-nums')?.className).toContain('text-secondary');
  });
});
