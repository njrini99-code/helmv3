import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DeltaChip, deltaState } from '../DeltaChip';

afterEach(cleanup);

const chip = (el: HTMLElement) => el.querySelector('.ch-delta') as HTMLElement;

describe('DeltaChip', () => {
  it('tones a difference only past one standard error, the better way for the metric', () => {
    // Scoring: lower is better, so −1.4 against an SE of 0.5 is a gain.
    const gain = render(<DeltaChip value={-1.4} se={0.5} better="lower" against="than his season average" />).container;
    expect(chip(gain)).toHaveClass('ch-delta--gain');
    expect(gain.textContent).toContain('−1.4');
    expect(gain.textContent).toContain('Better by 1.4 strokes than his season average');
    cleanup();
    // A rate: higher is better, so −3 points is a loss.
    const loss = render(<DeltaChip value={-3} se={1} better="higher" unit="pts" />).container;
    expect(chip(loss)).toHaveClass('ch-delta--loss');
    expect(loss.textContent).toContain('−3 pts');
  });

  it('reads Level inside one standard error, under the threshold, or with no standard error at all', () => {
    for (const props of [
      { value: 0.4, se: 0.9 },
      { value: 0.04, se: 0.01, threshold: 0.05 },
      { value: 2, se: null },
    ]) {
      const { container } = render(<DeltaChip better="lower" {...props} />);
      expect(chip(container)).toHaveClass('ch-delta--level');
      expect(container.textContent).toMatch(/^Level/);
      expect(container.textContent).toContain('no clear change');
      cleanup();
    }
  });

  it('points the triangle by better or worse, not by the sign, so hue never carries it alone', () => {
    const up = render(<DeltaChip value={-2} se={0.5} better="lower" />).container;
    expect(up.querySelector('path')?.getAttribute('d')).toBe('M3 0.5 6 5.5H0Z');
    cleanup();
    const down = render(<DeltaChip value={-2} se={0.5} better="higher" />).container;
    expect(down.querySelector('path')?.getAttribute('d')).toBe('M3 5.5 0 0.5H6Z');
    cleanup();
    const level = render(<DeltaChip value={0.1} se={0.5} better="higher" />).container;
    expect(level.querySelector('rect')).not.toBeNull();
  });

  it('shows an em dash and says so for no data', () => {
    const { container } = render(<DeltaChip value={null} se={0.4} better="lower" />);
    expect(chip(container)).toHaveClass('ch-delta--none');
    expect(container.textContent).toBe('—No data');
  });

  it('agrees with deltaState', () => {
    expect(deltaState(-1, 0.5, 'lower')).toBe('gain');
    expect(deltaState(1, 0.5, 'lower')).toBe('loss');
    expect(deltaState(0.2, 0.5, 'lower')).toBe('level');
    expect(deltaState(undefined, 0.5, 'lower')).toBeNull();
  });
});
