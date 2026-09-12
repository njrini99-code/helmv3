// @vitest-environment jsdom
/**
 * ============================================================================
 * ChartShell — useReducedMotionGuard gating (convention, not hydration parity)
 * ----------------------------------------------------------------------------
 * Same intent as reveal.test.tsx: pins that ChartShell's entrance variant is
 * gated through `useReducedMotionGuard` rather than the raw framer-motion
 * hook, and documents (rather than hides) that the guard is a no-op for the
 * `reduce ? false : ...` ternary shape — `null` and `false` both select the
 * animated branch, so a real reduced-motion user's server/first-paint
 * divergence is not closed by this hook. See reveal.test.tsx for the fuller
 * explanation.
 * ========================================================================== */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ChartShell } from './chart-shell';

const motionState = vi.hoisted(() => ({ reducedMotion: false as boolean | null }));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    useReducedMotion: () => motionState.reducedMotion,
    m: new Proxy(
      {},
      {
        get: (_target, prop) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          React.forwardRef<HTMLElement, any>(({ children, initial, animate, transition, variants, ...rest }, ref) => {
            void animate;
            void transition;
            void variants;
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

function getSection(container: HTMLElement): HTMLElement {
  return container.querySelector('section')!;
}

describe('ChartShell — useReducedMotionGuard gating', () => {
  it('animates from the "hidden" variant when reduced motion is off', () => {
    motionState.reducedMotion = false;
    const { container } = render(<ChartShell title="Strokes Gained">chart</ChartShell>);
    expect(getSection(container).getAttribute('data-initial')).toBe(JSON.stringify('hidden'));
  });

  it('skips the entrance (`initial={false}`) when reduced motion is on', () => {
    motionState.reducedMotion = true;
    const { container } = render(<ChartShell title="Strokes Gained">chart</ChartShell>);
    expect(getSection(container).getAttribute('data-initial')).toBe('false');
  });

  it('also skips the entrance when `noEntrance` is set, independent of the motion guard', () => {
    motionState.reducedMotion = false;
    const { container } = render(
      <ChartShell title="Strokes Gained" noEntrance>
        chart
      </ChartShell>,
    );
    expect(getSection(container).getAttribute('data-initial')).toBe('false');
  });

  it('maps a `null` guard result (the real server/first-paint value) to the SAME branch as `false` — the guard is a no-op here, not a hydration fix', () => {
    motionState.reducedMotion = null;
    const { container } = render(<ChartShell title="Strokes Gained">chart</ChartShell>);
    expect(getSection(container).getAttribute('data-initial')).toBe(JSON.stringify('hidden'));
  });
});
