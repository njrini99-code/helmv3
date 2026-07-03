/**
 * Reveal.tsx tests — mount-based entrance + stagger + reduced-motion gating.
 *
 * Mocks framer-motion the same way `HeroInsightCard.test.tsx` does (a `m`
 * Proxy that renders the underlying DOM tag), extended to CAPTURE the last
 * props passed to `m.div` via `vi.hoisted` state, so the stagger delay merged
 * into `inkSettles`'s variant (see Reveal.tsx's comment on why a top-level
 * `transition` prop would be ignored) is directly assertable.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as React from 'react';

const state = vi.hoisted(() => ({
  reduced: false,
  lastProps: null as Record<string, unknown> | null,
}));

vi.mock('framer-motion', () => ({
  useReducedMotion: () => state.reduced,
  m: new Proxy(
    {},
    {
      get: (_target, prop) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props: any) => {
          state.lastProps = props;
          const { children, initial: _i, animate: _a, variants: _v, ...rest } = props;
          void _i;
          void _a;
          void _v;
          return React.createElement(prop as string, rest, children);
        },
    },
  ),
}));

import { Reveal } from './Reveal';
import { STAGGER_STEP } from './motion';

interface VisibleTarget {
  transition?: { delay?: number };
}
interface RevealVariants {
  hidden: Record<string, unknown>;
  visible: VisibleTarget;
}

function variants(): RevealVariants {
  return state.lastProps?.variants as RevealVariants;
}

describe('Reveal — generic entrance wrapper', () => {
  beforeEach(() => {
    state.reduced = false;
    state.lastProps = null;
  });

  it('renders its children', () => {
    render(<Reveal>hello</Reveal>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('animates from the "hidden" variant to "visible"', () => {
    render(<Reveal>x</Reveal>);
    expect(state.lastProps?.initial).toBe('hidden');
    expect(state.lastProps?.animate).toBe('visible');
  });

  it('defaults staggerIndex to 0 — no delay', () => {
    render(<Reveal>x</Reveal>);
    expect(variants().visible.transition?.delay).toBe(0);
  });

  it('staggers a sibling by staggerIndex × STAGGER_STEP', () => {
    render(<Reveal staggerIndex={3}>x</Reveal>);
    expect(variants().visible.transition?.delay).toBeCloseTo(3 * STAGGER_STEP);
  });

  it('clamps a negative staggerIndex to zero delay (never animates backward)', () => {
    render(<Reveal staggerIndex={-4}>x</Reveal>);
    expect(variants().visible.transition?.delay).toBe(0);
  });

  it('reduced motion: final state instantly, zero delay regardless of staggerIndex', () => {
    state.reduced = true;
    render(<Reveal staggerIndex={5}>x</Reveal>);
    expect(variants().hidden).toMatchObject({ opacity: 1, y: 0, filter: 'blur(0px)' });
    expect(variants().visible.transition?.delay).toBe(0);
  });

  it('passes className through to the wrapping element', () => {
    render(<Reveal className="test-marker">x</Reveal>);
    expect(state.lastProps?.className).toBe('test-marker');
  });
});
