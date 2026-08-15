/**
 * ViewHeader — guaranteed-visible reveal contract.
 *
 * Regression test for the invisible-header bug on /golf/dashboard/documents,
 * /golf/dashboard/announcements, and /golf/dashboard/whats-new (reproduced
 * identically on production): the eyebrow/H1/subhead were present in the DOM
 * but permanently invisible, leaving ~300px of blank space where the header
 * should be.
 *
 * Root cause: the previous implementation used framer-motion's
 * `motion.header`/`motion.div` with `initial="hidden"` variants. That
 * computes an inline `style="opacity:0; transform:translateY(8px)"` on the
 * SERVER (framer-motion's SSR-safe initial-style calculation), so the SSR'd
 * HTML already had every child sitting at `opacity: 0` before any client JS
 * ran. The hidden→visible transition ONLY ever fires from framer-motion's
 * own client-side mount effect — with no fallback, if that effect never
 * fires (client JS erroring elsewhere in the page, a hydration mismatch
 * upstream, a stalled bundle — any of which stays outside this component),
 * the header sits frozen at opacity 0 forever.
 *
 * Two isolated reproductions of the OLD framer-motion path (a plain client
 * render, and a faithful two-module-instance SSR→hydrate simulation
 * mirroring Next.js's separate server/client bundles) both completed the
 * hidden→visible transition correctly in isolation — so the bug was never a
 * broken stagger/variant wiring, it was the architecture: a JS-driven inline
 * style has no guaranteed terminal state if the JS never runs. This mirrors
 * the identical, already-fixed symptom class in `AnimatedPage`/`AnimatedItem`
 * (`src/components/golf/layout/AnimatedPage.tsx`, audit W1 "shot-blank").
 *
 * Fix: the reveal is now a pure CSS animation (`.animate-fade-in-up`,
 * globals.css — the SAME utility AnimatedItem uses) with a per-item
 * `animation-delay` standing in for the old `staggerChildren`. A CSS
 * `@keyframes` animation starts painting on the very first frame with zero
 * JS dependency, so there is nothing left to get stuck on. This test
 * asserts there is no JS-gated opacity/transform in the rendered output —
 * mirroring `AnimatedPage.test.tsx`'s regression contract for the same bug
 * class.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ViewHeader } from './view-header';

describe('ViewHeader — guaranteed-visible reveal', () => {
  it('renders eyebrow/title/description/meta with no inline opacity/transform style gating visibility', () => {
    render(
      <ViewHeader
        eyebrow="Documents"
        title="Team documents."
        description="Plans, releases, and forms — all in one place."
        meta={<span>3 files</span>}
      />,
    );

    const title = screen.getByText('Team documents.');
    const eyebrow = screen.getByText('Documents');
    const description = screen.getByText(/Plans, releases, and forms/);
    const meta = screen.getByText('3 files');

    for (const el of [title, eyebrow, description, meta]) {
      expect(el).toBeInTheDocument();
    }

    // The old framer-motion implementation computed an inline
    // `style="opacity:0; transform:translateY(8px)"` on each item wrapper as
    // part of its SSR-safe initial-style calculation — that inline style is
    // exactly what left the DOM stuck invisible when the client-side mount
    // effect that was supposed to clear it never ran. There must be no such
    // JS-driven inline opacity/transform gating visibility in the critical
    // path; `animation-delay`/`animation-fill-mode` (the stagger timing) are
    // fine to leave inline since they never hide content on their own — the
    // underlying CSS keyframe (`.animate-fade-in-up`) runs independent of JS.
    for (const el of [title, eyebrow, description, meta]) {
      const wrapper = el.parentElement;
      expect(wrapper).not.toBeNull();
      const style = wrapper?.getAttribute('style') ?? '';
      expect(style).not.toMatch(/opacity\s*:\s*0\b/);
      expect(style).not.toMatch(/transform\s*:\s*translateY/);
    }
  });

  it('drives the entrance purely via CSS classes honoring prefers-reduced-motion', () => {
    render(<ViewHeader eyebrow="Eyebrow" title="Title" />);

    const title = screen.getByText('Title');
    const wrapper = title.parentElement;

    // `.animate-fade-in-up` is a plain CSS @keyframes animation (globals.css)
    // with `animation-fill-mode: forwards` — it starts painting on first
    // frame and guarantees a terminal opacity:1 with zero JS/network
    // dependency. `motion-reduce:animate-none` guarantees full opacity
    // immediately for prefers-reduced-motion users, and globals.css also
    // collapses the animation to a 1ms duration under
    // `@media (prefers-reduced-motion: reduce)` — both paths are pure CSS,
    // correct even if hydration never completes.
    expect(wrapper?.className).toContain('animate-fade-in-up');
    expect(wrapper?.className).toContain('motion-reduce:animate-none');
  });

  it('staggers items via animation-delay (no framer-motion staggerChildren)', () => {
    render(
      <ViewHeader
        eyebrow="Eyebrow"
        title="Title"
        description="Description copy"
      />,
    );

    const eyebrowDelay = screen.getByText('Eyebrow').parentElement?.style.animationDelay;
    const titleDelay = screen.getByText('Title').parentElement?.style.animationDelay;
    const descriptionDelay = screen.getByText('Description copy').parentElement?.style.animationDelay;

    expect(eyebrowDelay).toBe('20ms');
    expect(titleDelay).toBe('80ms');
    expect(descriptionDelay).toBe('140ms');
  });

  it('disableAnimation renders static (unanimated) wrappers with no animation class', () => {
    render(<ViewHeader title="Title" disableAnimation />);

    const wrapper = screen.getByText('Title').parentElement;
    expect(wrapper?.className ?? '').not.toContain('animate-fade-in-up');
    expect(wrapper?.getAttribute('style')).toBeNull();
  });

  it('never throws or blocks rendering — no async engine required', () => {
    expect(() =>
      render(
        <ViewHeader
          eyebrow="Eyebrow"
          title="Title"
          description="Description"
          meta={<span>Meta</span>}
          primaryAction={<span>Do it</span>}
          secondaryActions={<span>Other</span>}
        />,
      ),
    ).not.toThrow();

    expect(screen.getByText('Title')).toBeInTheDocument();
  });

  it('renders a plain <header> (data-slot="view-header") with no framer-motion root switch', () => {
    const { container } = render(<ViewHeader title="Title" />);
    const header = container.querySelector('[data-slot="view-header"]');
    expect(header?.tagName).toBe('HEADER');
  });
});
