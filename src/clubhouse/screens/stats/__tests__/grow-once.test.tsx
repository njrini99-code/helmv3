import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGrowOnce } from '../shs-motion';

type Entry = { isIntersecting: boolean; target: Element };
let observers: Array<{ cb: (e: Entry[]) => void; watched: Set<Element>; options?: IntersectionObserverInit }> = [];
class FakeIO {
  watched = new Set<Element>();
  constructor(cb: (e: Entry[]) => void, options?: IntersectionObserverInit) {
    observers.push({ cb, watched: this.watched, options });
  }
  observe(el: Element) {
    this.watched.add(el);
  }
  unobserve(el: Element) {
    this.watched.delete(el);
  }
  disconnect() {
    this.watched.clear();
  }
}

function Page({ atRest = false, k = 0, cards = 2 }: { atRest?: boolean; k?: number; cards?: number }) {
  const root = useRef<HTMLDivElement>(null);
  useGrowOnce(root, atRest, [k]);
  return (
    <div ref={root}>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} data-testid={`c${i}`} className="ch-shs-card" />
      ))}
    </div>
  );
}

const live = () => observers[observers.length - 1]!;
const see = (el: Element) => live().cb([{ isIntersecting: true, target: el }]);
const seen = () => [...document.querySelectorAll('.ch-shs-card')].map((c) => c.classList.contains('is-seen'));

beforeEach(() => {
  observers = [];
  vi.stubGlobal('IntersectionObserver', FakeIO);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Stats-home criterion 82, M-STATS-12 to 15. */
describe('marks grow once', () => {
  it('starts a card when a quarter of it is in view, and not before', () => {
    render(<Page />);
    expect(live().options?.threshold).toBe(0.25);
    expect(seen()).toEqual([false, false]);
    const a = document.querySelector('[data-testid="c0"]')!;
    live().cb([{ isIntersecting: false, target: a }]);
    expect(seen()).toEqual([false, false]);
    see(a);
    expect(seen()).toEqual([true, false]);
  });

  it('stops watching a card once seen, so a scroll back regrows nothing', () => {
    render(<Page />);
    const a = document.querySelector('[data-testid="c0"]')!;
    see(a);
    expect(live().watched.has(a)).toBe(false);
  });

  it('a window change or refresh neither clears a seen card nor watches it again', () => {
    const { rerender } = render(<Page k={0} />);
    const a = document.querySelector('[data-testid="c0"]')!;
    see(a);
    rerender(<Page k={1} />);
    expect(a.classList.contains('is-seen')).toBe(true);
    expect(live().watched.has(a)).toBe(false);
    expect(live().watched.has(document.querySelector('[data-testid="c1"]')!)).toBe(true);
    rerender(<Page k={2} />);
    expect(a.classList.contains('is-seen')).toBe(true);
    expect(live().watched.has(a)).toBe(false);
  });

  it('a landing after a Try again, or Reduce Motion, draws at rest with no watcher', () => {
    render(<Page atRest />);
    expect(seen()).toEqual([true, true]);
    expect(observers).toHaveLength(0);
  });

  it('a card arriving later still grows once', () => {
    const { rerender } = render(<Page k={0} cards={1} />);
    rerender(<Page k={1} cards={2} />);
    const b = document.querySelector('[data-testid="c1"]')!;
    expect(live().watched.has(b)).toBe(true);
    see(b);
    expect(b.classList.contains('is-seen')).toBe(true);
  });

  it('with no IntersectionObserver, everything draws at rest', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<Page />);
    expect(seen()).toEqual([true, true]);
  });
});
