/**
 * ============================================================================
 * MicroBar — fill direction, aria-label, reduced-motion no-op
 * ----------------------------------------------------------------------------
 * MicroBar draws a static fill (no framer-motion, no transition) — there is
 * nothing to gate behind `prefers-reduced-motion`, so the reduced-motion case
 * asserts the primitive renders identically under a `matchMedia` mock that
 * reports the reduced-motion media query as matched.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MicroBar } from '../MicroBar';

describe('MicroBar — fill direction + color', () => {
  it('fills LEFT in accent when the value is negative and goodDirection is "low"', () => {
    render(<MicroBar value={-1.2} domain={6} goodDirection="low" label="1.2 shots better" />);
    const fill = screen.getByRole('img', { name: '1.2 shots better' }).querySelector('[data-direction]');
    expect(fill).not.toBeNull();
    expect(fill!.getAttribute('data-direction')).toBe('left');
    expect(fill!.getAttribute('data-tone')).toBe('accent');
    expect(fill!.className).toContain('bg-accent-500');
  });

  it('fills RIGHT in warning when the value is positive and goodDirection is "low"', () => {
    render(<MicroBar value={2.4} domain={6} goodDirection="low" label="2.4 shots worse" />);
    const fill = screen.getByRole('img', { name: '2.4 shots worse' }).querySelector('[data-direction]');
    expect(fill).not.toBeNull();
    expect(fill!.getAttribute('data-direction')).toBe('right');
    expect(fill!.getAttribute('data-tone')).toBe('warning');
    expect(fill!.className).toContain('bg-fw-warning');
  });

  it('inverts the color mapping (not the side) when goodDirection is "high"', () => {
    render(<MicroBar value={2.4} domain={6} goodDirection="high" label="2.4 up" />);
    const fill = screen.getByRole('img', { name: '2.4 up' }).querySelector('[data-direction]');
    // Same positive value still fills right — only the color flips.
    expect(fill!.getAttribute('data-direction')).toBe('right');
    expect(fill!.getAttribute('data-tone')).toBe('accent');
  });

  it('renders no fill at all for a value of exactly zero (honest flat rail)', () => {
    render(<MicroBar value={0} domain={6} goodDirection="low" label="even with average" />);
    const rail = screen.getByRole('img', { name: 'even with average' });
    expect(rail.querySelector('[data-direction]')).toBeNull();
  });
});

describe('MicroBar — accessibility', () => {
  it('exposes the given label via role="img" and hides the visual fill from AT', () => {
    render(<MicroBar value={-1.2} domain={6} goodDirection="low" label="1.2 shots better than average" />);
    const rail = screen.getByRole('img', { name: '1.2 shots better than average' });
    expect(rail).toBeInTheDocument();
    const fill = rail.querySelector('[data-direction]');
    expect(fill!.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('MicroBar — reduced motion is a no-op', () => {
  it('renders the identical fill under a prefers-reduced-motion:reduce media query (no animation to guard)', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;

    try {
      render(<MicroBar value={-1.2} domain={6} goodDirection="low" label="reduced motion case" />);
      const fill = screen
        .getByRole('img', { name: 'reduced motion case' })
        .querySelector('[data-direction]');
      expect(fill).not.toBeNull();
      expect(fill!.getAttribute('style')).toMatch(/width:\s*10%/);
    } finally {
      window.matchMedia = original;
    }
  });
});
