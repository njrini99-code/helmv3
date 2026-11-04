import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MiniRails, railTone, RoundTicker, tickerBars } from '../MiniCharts';

describe('MiniRails', () => {
  it('draws a Tour tick only with a value', () => {
    const { container } = render(<MiniRails rows={[{ label: 'A', value: 50, tour: 60 }, { label: 'B', value: 50 }]} />);
    expect(container.querySelectorAll('.ch-shs-tour')).toHaveLength(1);
  });
  it('tones against the Tour, and flat without one', () => {
    expect(railTone(70, 60)).toBe('gain');
    expect(railTone(50, 60)).toBe('loss');
    expect(railTone(50, null)).toBe('flat');
  });
});

describe('RoundTicker', () => {
  it('makes a lower score taller, on one range', () => {
    const [a, b] = tickerBars([{ id: 'a', score: 70 }, { id: 'b', score: 80 }]);
    expect(a!.h).toBeGreaterThan(b!.h);
    expect(a!.best).toBe(true);
    expect(b!.best).toBe(false);
  });
  it('a lone round has no best', () => {
    expect(tickerBars([{ id: 'a', score: 70 }])[0]!.best).toBe(false);
  });
  it('uses the smaller gap above 12 rounds', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ id: String(i), score: 70 + i }));
    const bars = tickerBars(many);
    expect(bars[1]!.x - bars[0]!.x - bars[0]!.w).toBeCloseTo(3);
  });
  it('renders one bar per round', () => {
    const { container } = render(<RoundTicker rounds={[{ id: 'a', score: 70 }, { id: 'b', score: 71 }]} />);
    expect(container.querySelectorAll('rect')).toHaveLength(2);
  });
});
