// @vitest-environment jsdom
/**
 * ============================================================================
 * AgendaStrip — the coach-home hour rail (home.v2.md §4 / "Primitives")
 * ----------------------------------------------------------------------------
 * Locks the four contracts the spec calls out: an accessible hidden-list
 * equivalent for the decorative pills, tone → fill mapping, the
 * reduced-motion guard (never raw `useReducedMotion`), and the "now" tick
 * only appearing when `nowMinutes` is actually provided (mount-gated by the
 * caller — this component must never fabricate the current time itself).
 * ========================================================================== */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgendaStrip, type AgendaStripEvent } from './AgendaStrip';

// Framer-motion passthrough (same pattern as TeamCategoryLeakBand.test.tsx /
// HubInsightSignalCard.test.tsx) — `m.div` renders as a plain DOM element so
// `useReducedMotionGuard`'s underlying `useReducedMotion()` resolves
// deterministically in jsdom, and `LazyMotion` is a no-op passthrough (the
// component only uses it to gate which framer-motion features load, never to
// change what's in the DOM). `initial` is surfaced as `data-initial` so the
// reduced-motion assertions below can read it back without needing a real
// animation engine.
vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    useReducedMotion: vi.fn(() => false),
    LazyMotion: ({ children }: { children: React.ReactNode }) => children,
    m: new Proxy(
      {},
      {
        get: (_target, prop) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          React.forwardRef<HTMLElement, any>((props, ref) => {
            const { children, initial, animate: _animate, transition: _transition, ...rest } = props;
            void _animate;
            void _transition;
            return React.createElement(
              prop as string,
              { ...rest, ref, 'data-initial': initial === false ? 'skip' : 'fade' },
              children,
            );
          }),
      },
    ),
  };
});

const EVENTS: AgendaStripEvent[] = [
  { id: 'e1', label: 'Morning practice', startMinutes: 480, endMinutes: 570, tone: 'info' },
  { id: 'e2', label: 'Qualifier round', startMinutes: 720, endMinutes: 900, tone: 'accent' },
  { id: 'e3', label: 'Team meeting', startMinutes: 960, endMinutes: 960, tone: 'neutral' },
];

describe('AgendaStrip', () => {
  it('lists every event\'s title and time in a visually-hidden list, for screen readers', () => {
    render(<AgendaStrip events={EVENTS} />);
    const list = screen.getByRole('list');
    expect(list.className).toContain('sr-only');
    const items = list.querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[0]!.textContent).toContain('Morning practice');
    expect(items[0]!.textContent).toContain('8a');
    expect(items[1]!.textContent).toContain('Qualifier round');
  });

  it('fills each pill with its own tone\'s color class, never a shared default', () => {
    const { container } = render(<AgendaStrip events={EVENTS} />);
    const info = container.querySelector('[data-slot="agenda-strip-event"][data-tone="info"]');
    const accent = container.querySelector('[data-slot="agenda-strip-event"][data-tone="accent"]');
    const neutral = container.querySelector('[data-slot="agenda-strip-event"][data-tone="neutral"]');
    expect(info?.className).toContain('bg-warm-400');
    expect(accent?.className).toContain('bg-accent-500');
    expect(neutral?.className).toContain('bg-warm-300');
  });

  it('renders the "now" tick only when nowMinutes is provided and inside the visible range', () => {
    const { container: withoutNow } = render(<AgendaStrip events={EVENTS} nowMinutes={null} />);
    expect(withoutNow.querySelector('[data-slot="agenda-strip-now"]')).toBeNull();

    const { container: outOfRange } = render(<AgendaStrip events={EVENTS} nowMinutes={60} />);
    expect(outOfRange.querySelector('[data-slot="agenda-strip-now"]')).toBeNull();

    const { container: withNow } = render(<AgendaStrip events={EVENTS} nowMinutes={600} />);
    expect(withNow.querySelector('[data-slot="agenda-strip-now"]')).not.toBeNull();
  });

  it('skips the entrance fade under prefers-reduced-motion (never raw useReducedMotion)', async () => {
    const { useReducedMotion } = await import('framer-motion');
    vi.mocked(useReducedMotion).mockReturnValueOnce(true);
    const { container } = render(<AgendaStrip events={EVENTS} />);
    const pill = container.querySelector('[data-slot="agenda-strip-event"]');
    expect(pill?.getAttribute('data-initial')).toBe('skip');
  });

  it('fades pills in when motion is not reduced', () => {
    const { container } = render(<AgendaStrip events={EVENTS} />);
    const pill = container.querySelector('[data-slot="agenda-strip-event"]');
    expect(pill?.getAttribute('data-initial')).toBe('fade');
  });
});
