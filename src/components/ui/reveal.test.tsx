// @vitest-environment jsdom
/**
 * ============================================================================
 * Reveal — useReducedMotionGuard gating (convention, not hydration parity)
 * ----------------------------------------------------------------------------
 * Pins that Reveal's entrance is gated through `useReducedMotionGuard` (the
 * repo-wide `boolean | null` -> `boolean` normalizer) rather than framer-
 * motion's raw `useReducedMotion`: `true` maps to skip-entrance
 * (`initial={false}`), `false` maps to the real fade/slide object.
 *
 * This is a type-normalization check, NOT a hydration-parity test. The third
 * case below documents a known, unresolved limitation instead of hiding it:
 * `useReducedMotionGuard` is `useReducedMotion() ?? false`, and since `null`
 * and `false` are both falsy, they select the identical ternary branch in
 * every consumer (Reveal included) — the guard never changes which branch
 * fires. For a user who genuinely prefers reduced motion, the server (`null`)
 * and the client's first paint (`true`) can still diverge; that gap is
 * separate, real, and NOT closed by this hook or this test.
 * ========================================================================== */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Reveal } from './reveal';

const motionState = vi.hoisted(() => ({ reducedMotion: false as boolean | null }));

// Same technique as TrajectoryCard.test.tsx / ViewSwitch.test.tsx: replace
// framer-motion with a deterministic passthrough so `useReducedMotionGuard`
// resolves predictably in jsdom, and forward the wrapped `initial` prop as a
// `data-initial` attribute so its value is directly assertable.
vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    useReducedMotion: () => motionState.reducedMotion,
    m: new Proxy(
      {},
      {
        get: (_target, prop) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          React.forwardRef<HTMLElement, any>(({ children, initial, animate, transition, ...rest }, ref) => {
            void animate;
            void transition;
            return React.createElement(
              prop as string,
              {
                ...rest,
                ref,
                'data-initial': initial === false ? 'false' : initial != null ? JSON.stringify(initial) : '',
              },
              children,
            );
          }),
      },
    ),
  };
});

describe('Reveal — useReducedMotionGuard gating', () => {
  it('uses the real fade/slide object for `initial` when reduced motion is off', () => {
    motionState.reducedMotion = false;
    const { container } = render(<Reveal slide={8}>content</Reveal>);
    const node = container.firstElementChild!;
    expect(node.getAttribute('data-initial')).toBe(JSON.stringify({ opacity: 0, y: 8 }));
  });

  it('skips the entrance (`initial={false}`) when reduced motion is on', () => {
    motionState.reducedMotion = true;
    const { container } = render(<Reveal slide={8}>content</Reveal>);
    const node = container.firstElementChild!;
    expect(node.getAttribute('data-initial')).toBe('false');
  });

  it('maps a `null` guard result (the real server/first-paint value) to the SAME branch as `false` — the guard is a no-op here, not a hydration fix', () => {
    motionState.reducedMotion = null;
    const { container } = render(<Reveal slide={8}>content</Reveal>);
    const node = container.firstElementChild!;
    expect(node.getAttribute('data-initial')).toBe(JSON.stringify({ opacity: 0, y: 8 }));
  });
});
