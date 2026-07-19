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
import { render, screen, within } from '@testing-library/react';
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

/**
 * ============================================================================
 * FocusAreasGrid — interactive card must be a BLOCK button, not a collapsed
 * icon box (prod regression: overlapping columns on mobile)
 * ----------------------------------------------------------------------------
 * The interactive card (always taken when a real onAreaClick is wired) was
 * wrapped in <IconButton>, whose size-md forced `inline-flex items-center
 * justify-center w-11 h-11` — crushing the whole vertical card (badge, name,
 * big number, bar, recommendation, View details) into a 44px icon-sized flex
 * box, so every element overlapped. jsdom has no layout engine, so this pins
 * the class-level contract that makes the collapse impossible: the card is a
 * real <button> that stacks its content as a block, and every content piece is
 * actually present in that one stacked card.
 * ========================================================================== */
/**
 * ============================================================================
 * #974 — no two Focus Areas show identical recommendation text; a "yd from
 * target" row never shows a nonsensical literal "0"; priority badges are
 * derived from a stable per-render index (never a duplicate-key collision).
 * ========================================================================== */
describe('FocusAreasGrid · #974 recommendation + headline honesty', () => {
  it('falls back to a band-specific recommendation when two areas share the identical sentence', () => {
    render(
      <FocusAreasGrid
        focusAreas={[
          {
            area: 'Short 50-100',
            strokesGained: -1.2,
            value: 24,
            unit: 'yd from target',
            trend: 'declining',
            recommendation: 'Work on distance control.',
          },
          {
            area: 'Long 190-220',
            strokesGained: -0.9,
            value: 18,
            unit: 'yd from target',
            trend: 'declining',
            recommendation: 'Work on distance control.',
          },
        ]}
      />,
    );

    // The first card keeps the upstream sentence verbatim.
    expect(screen.getByText('Work on distance control.')).toBeInTheDocument();
    // The second card, sharing the identical sentence, must NOT render it a
    // second time — it gets a band-specific fallback naming its own area.
    expect(screen.queryAllByText('Work on distance control.')).toHaveLength(1);
    expect(screen.getByText(/Long 190-220 shots/i)).toBeInTheDocument();
  });

  it('never renders a literal "0" headline for a yd-from-target row (says "--" instead)', () => {
    render(
      <FocusAreasGrid
        focusAreas={[
          {
            area: 'Short 50-100',
            strokesGained: -1.2,
            value: 0,
            unit: 'yd from target',
            trend: 'declining',
            recommendation: 'Tighten wedge distances.',
          },
        ]}
      />,
    );

    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getByText('--')).toBeInTheDocument();
  });

  it('gives every rendered card a unique key even when two areas share the same name', () => {
    // Duplicate `area` strings used to collide on `key={area.area}`; assert
    // both rows still render distinctly (index-qualified key) rather than
    // React silently dropping/merging one.
    render(
      <FocusAreasGrid
        focusAreas={[
          { area: 'Putting', strokesGained: -0.5, trend: 'declining', recommendation: 'Rec A.' },
          { area: 'Putting', strokesGained: -0.3, trend: 'stable', recommendation: 'Rec B.' },
        ]}
      />,
    );

    expect(screen.getAllByText('Putting')).toHaveLength(2);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});

describe('FocusAreasGrid — interactive card layout (mobile collapse regression)', () => {
  function renderInteractive() {
    return render(
      <FocusAreasGrid
        onAreaClick={vi.fn()}
        focusAreas={[
          {
            area: 'Approach 150-175',
            strokesGained: -0.9,
            unit: 'strokes/round',
            trend: 'stable',
            recommendation: 'Monitor approach dispersion this month.',
          },
        ]}
      />,
    );
  }

  it('renders the interactive card as a <button>, never an inline-flex icon box', () => {
    renderInteractive();
    const card = screen.getByRole('button', { name: /Focus area: Approach 150-175/i });
    expect(card.tagName).toBe('BUTTON');
    // Block layout is the contract that keeps the stack from collapsing.
    expect(card.className).toMatch(/\bblock\b/);
    expect(card.className).toMatch(/\bw-full\b/);
    // The exact collapse-causing utilities must never reappear on this card.
    expect(card.className).not.toMatch(/\binline-flex\b/);
    expect(card.className).not.toMatch(/\bjustify-center\b/);
    expect(card.className).not.toMatch(/\b[hw]-11\b/);
  });

  it('keeps every stacked content piece present inside the one card', () => {
    renderInteractive();
    const card = screen.getByRole('button', { name: /Focus area: Approach 150-175/i });
    // Name, trend label, rating + unit, recommendation, and the details hint
    // all live in the same stacked card — proof the layout did not drop or
    // overlap-hide any element.
    expect(within(card).getByText('Approach 150-175')).toBeInTheDocument();
    expect(within(card).getByText('Stable')).toBeInTheDocument();
    expect(within(card).getByText('-0.9')).toBeInTheDocument();
    expect(within(card).getByText('strokes/round')).toBeInTheDocument();
    expect(within(card).getByText('Monitor approach dispersion this month.')).toBeInTheDocument();
    expect(within(card).getByText('View details')).toBeInTheDocument();
  });
});
