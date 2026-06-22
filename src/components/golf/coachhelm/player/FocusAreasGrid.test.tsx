/**
 * P2-18 — Focus-area ratings must NOT mix incompatible units.
 *
 * A distance error (yards) and a causal effect-size (0-1) were both being
 * displayed as "strokes/round", which is mathematically wrong. These tests pin
 * the audit acceptance criteria:
 *   • Every "strokes/round" label traces to a real stroke-impact row.
 *   • Non-stroke signals render their NATIVE (non-stroke) unit.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { FocusAreasGrid } from './FocusAreasGrid';

// next/link → plain anchor (avoids the real useIntersection observer in jsdom).
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// framer-motion → inert passthrough (no animation timers in jsdom).
vi.mock('framer-motion', async () => {
  const React = await import('react');
  const passthrough = new Proxy(
    {},
    {
      get: () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        React.forwardRef<HTMLElement, any>((props, ref) => {
          const {
            children,
            initial: _i,
            animate: _a,
            exit: _e,
            transition: _t,
            variants: _v,
            ...rest
          } = props;
          void _i;
          void _a;
          void _e;
          void _t;
          void _v;
          return React.createElement('div', { ...rest, ref }, children);
        }),
    },
  );
  return { m: passthrough, useReducedMotion: () => true };
});

describe('FocusAreasGrid · P2-18 unit integrity', () => {
  it('labels a stroke-impact row strokes/round and shows its signed value', () => {
    render(
      <FocusAreasGrid
        focusAreas={[
          {
            area: 'Approach 150-175',
            strokesGained: -0.8,
            unit: 'strokes/round',
            trend: 'declining',
            recommendation: 'Tighten approach dispersion.',
          },
        ]}
      />,
    );

    expect(screen.getByText('strokes/round')).toBeInTheDocument();
    expect(screen.getByText('-0.8')).toBeInTheDocument();
  });

  it('renders a distance-error row in YARDS, never strokes/round', () => {
    render(
      <FocusAreasGrid
        focusAreas={[
          {
            area: 'Mid-Long Shots',
            // legacy ordering magnitude (= -value/10) kept, but never labelled strokes
            strokesGained: -2.4,
            value: 24,
            unit: 'yd from target',
            trend: 'stable',
            recommendation: 'Control distance on long approaches.',
          },
        ]}
      />,
    );

    expect(screen.getByText('yd from target')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    // The fabricated strokes label/value must NOT appear for a distance row.
    expect(screen.queryByText('strokes/round')).not.toBeInTheDocument();
    expect(screen.queryByText('-2.4')).not.toBeInTheDocument();
  });

  it('renders a causal effect-size row as a qualitative opportunity tier', () => {
    render(
      <FocusAreasGrid
        focusAreas={[
          {
            area: 'Tee accuracy',
            strokesGained: -0.85,
            value: 0.85,
            unit: 'opportunity',
            trend: 'stable',
            recommendation: 'Improving tee accuracy could lower scoring.',
          },
        ]}
      />,
    );

    expect(screen.getByText('opportunity')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.queryByText('strokes/round')).not.toBeInTheDocument();
  });

  it('maps opportunity strength to Low/Medium/High tiers', () => {
    render(
      <FocusAreasGrid
        focusAreas={[
          { area: 'A', strokesGained: -0.9, value: 0.9, unit: 'opportunity', trend: 'stable', recommendation: 'r' },
          { area: 'B', strokesGained: -0.6, value: 0.6, unit: 'opportunity', trend: 'stable', recommendation: 'r' },
          { area: 'C', strokesGained: -0.3, value: 0.3, unit: 'opportunity', trend: 'stable', recommendation: 'r' },
        ]}
      />,
    );

    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('defaults a unit-less (legacy) row to strokes/round for back-compat', () => {
    render(
      <FocusAreasGrid
        focusAreas={[
          {
            area: 'Putting',
            strokesGained: -0.5,
            trend: 'declining',
            recommendation: 'Work on lag putting.',
          },
        ]}
      />,
    );

    expect(screen.getByText('strokes/round')).toBeInTheDocument();
    expect(screen.getByText('-0.5')).toBeInTheDocument();
  });
});
