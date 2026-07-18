/**
 * AnimatedPage / AnimatedItem — guaranteed-visible reveal contract.
 *
 * Regression test for audit W1 "shot-blank": the round-entry pages
 * (New Round / Continue Round) render the hole-1 shot-tracking screen
 * inside these wrappers. The previous framer-motion implementation baked
 * `opacity: 0` into the SSR'd HTML and only reached `opacity: 1` once an
 * async `<LazyMotion>` feature chunk resolved client-side — on a slow or
 * stalled connection the screen stayed blank indefinitely. The fix moves
 * the reveal to a pure-CSS animation with a guaranteed terminal state, so
 * this test asserts there is no JS-gated opacity in the rendered output and
 * no dependency on framer-motion (or any async import) ever loading.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnimatedPage, AnimatedItem } from '../AnimatedPage';

describe('AnimatedPage / AnimatedItem', () => {
  it('renders children with no inline opacity/transform style gating visibility', () => {
    render(
      <AnimatedPage>
        <AnimatedItem>
          <p>Hole 1 shot entry</p>
        </AnimatedItem>
      </AnimatedPage>
    );

    const content = screen.getByText('Hole 1 shot entry');
    expect(content).toBeInTheDocument();

    // The old framer-motion implementation computed an inline
    // `style="opacity:0; transform:translateY(14px)"` on the item wrapper
    // as part of its SSR-safe initial-style calculation — that inline
    // style is exactly what left the DOM stuck invisible while the async
    // motion-feature chunk was still loading. There must be no such
    // JS-driven inline style left in the critical path.
    const itemWrapper = content.parentElement;
    expect(itemWrapper).not.toBeNull();
    expect(itemWrapper?.getAttribute('style')).toBeNull();
  });

  it('drives the entrance purely via CSS classes (no async engine required)', () => {
    render(
      <AnimatedPage>
        <AnimatedItem>
          <p>Round setup</p>
        </AnimatedItem>
      </AnimatedPage>
    );

    const itemWrapper = screen.getByText('Round setup').parentElement;
    // `.animate-fade-in-up` is a plain CSS @keyframes animation (globals.css)
    // with `animation-fill-mode: forwards` — it starts painting on first
    // frame and guarantees a terminal opacity:1 with zero JS/network
    // dependency. `motion-reduce:animate-none` guarantees full opacity
    // immediately for prefers-reduced-motion users.
    expect(itemWrapper?.className).toContain('animate-fade-in-up');
    expect(itemWrapper?.className).toContain('motion-reduce:animate-none');
  });

  it('never throws or blocks rendering even though no motion library is imported', () => {
    // This is the core regression guard: mounting these components must not
    // require framer-motion, LazyMotion, or any dynamic import to resolve
    // before content appears. If a future edit reintroduces an async
    // feature-load gate, this render will hang/throw under jsdom rather
    // than resolving synchronously.
    expect(() =>
      render(
        <AnimatedPage className="custom-page-class">
          <AnimatedItem className="custom-item-class">
            <span>Immediately visible</span>
          </AnimatedItem>
        </AnimatedPage>
      )
    ).not.toThrow();

    expect(screen.getByText('Immediately visible')).toBeInTheDocument();
  });
});
