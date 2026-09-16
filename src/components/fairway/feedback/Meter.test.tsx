// @vitest-environment jsdom
/**
 * ============================================================================
 * Meter — a static MEASURE against a range (role="meter")
 * ----------------------------------------------------------------------------
 * Tone is computed, never passed in (brief: "accent within the optimum band,
 * warning between, danger beyond"). These pin the three bands for BOTH
 * directions native <meter> supports (higher-is-better via a high optimum,
 * lower-is-better via a low optimum) plus the two-sided default.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Meter } from './Meter';

function fillClass(container: HTMLElement) {
  return (container.querySelector('[role="meter"] [aria-hidden="true"]') as HTMLElement).className;
}

describe('Meter — aria semantics', () => {
  it('exposes value/min/max and a formatted aria-valuetext', () => {
    render(<Meter value={7.4} min={0} max={10} label="Confidence" formatValue={(v) => v.toFixed(1)} />);
    const meter = screen.getByRole('meter', { name: 'Confidence' });
    expect(meter).toHaveAttribute('aria-valuenow', '7.4');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '10');
    expect(meter).toHaveAttribute('aria-valuetext', '7.4');
  });

  it('clamps value to the min/max range', () => {
    render(<Meter value={999} min={0} max={10} label="Confidence" />);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '10');
  });

  it('shows the formatted value beside the track only when showValue is set', () => {
    render(<Meter value={62} label="Battery" showValue formatValue={(v) => `${v}%`} />);
    expect(screen.getByText('62%')).toBeInTheDocument();
  });
});

describe('Meter — computed tone bands (two-sided, optimum omitted → good band is exactly [low, high])', () => {
  // low=8 high=12 → band width 4. Distance beyond the band <= 4 is warning,
  // further than that is danger — symmetric on both sides.
  it('is accent within [low, high]', () => {
    const { container } = render(<Meter value={10} min={0} max={20} low={8} high={12} label="M" />);
    expect(screen.getByRole('meter')).toHaveAttribute('data-tone', 'accent');
    expect(fillClass(container)).toContain('bg-accent-650');
  });

  it('is warning within one band-width below low', () => {
    // distance from low(8) = 3, band width = 4 → warning.
    render(<Meter value={5} min={0} max={20} low={8} high={12} label="M" />);
    expect(screen.getByRole('meter')).toHaveAttribute('data-tone', 'warning');
  });

  it('is warning within one band-width above high', () => {
    // distance from high(12) = 3, band width = 4 → warning.
    render(<Meter value={15} min={0} max={20} low={8} high={12} label="M" />);
    expect(screen.getByRole('meter')).toHaveAttribute('data-tone', 'warning');
  });

  it('is danger further than one band-width below low', () => {
    // distance from low(8) = 8, band width = 4 → danger.
    const { container } = render(<Meter value={0} min={0} max={20} low={8} high={12} label="M" />);
    expect(screen.getByRole('meter')).toHaveAttribute('data-tone', 'danger');
    expect(fillClass(container)).toContain('bg-fw-danger');
  });
});

describe('Meter — optimum reverses which side of the band degrades', () => {
  it('optimum >= high (higher is better): values well above high stay accent, extending the good band up to max', () => {
    render(<Meter value={18} min={0} max={20} low={8} high={12} optimum={20} label="M" />);
    expect(screen.getByRole('meter')).toHaveAttribute('data-tone', 'accent');
  });

  it('optimum <= low (lower is better): values well below low stay accent, extending the good band down to min', () => {
    render(<Meter value={2} min={0} max={20} low={8} high={12} optimum={0} label="M" />);
    expect(screen.getByRole('meter')).toHaveAttribute('data-tone', 'accent');
  });
});
