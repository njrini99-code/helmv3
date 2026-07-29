// =============================================================================
// LandingHeader — the mobile menu's scroll lock must not unstick the header.
//
// WHY THIS EXISTS. Reported 2026-07-29: "when I click the hamburger, if I'm
// scrolled, it still does not drop down. Only if I'm at the top."
//
// The menu was opening correctly every time. What broke was WHERE. The lock
// was `document.body.style.overflow = 'hidden'`, and the `overflow` shorthand
// sets overflow-x as well — which, per the comment already in
// globals.css:173-188, "forces overflow-y to compute to `auto`, turning
// <html>/<body> into a scroll container". `position: sticky` resolves against
// its nearest scrolling ancestor, so the header stopped sticking to the
// viewport and stuck to the top of body's scrollport instead: the document
// top. Measured on production at scrollY 2200 — header at y = -2200, the open
// menu at y = -2014, both far above the fold. At scrollY 0 the document top
// and the viewport top are the same place, which is precisely why it worked
// at the top and nowhere else.
//
// jsdom cannot lay out `position: sticky`, so this suite does not try to
// assert geometry — that was measured in a real browser. It pins the two
// decisions that geometry depends on, which is what a future edit would get
// wrong:
//
//   1. the lock goes on the document element, NEVER on <body>
//   2. Lenis is actually stopped, because `overflow: hidden` does not stop it
//      (measured: with the document element locked, a wheel gesture still
//      moved the page from scrollY 2200 to 2499)
//
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test/utils';
import { LandingHeader } from './LandingHeader';
import { setMarketingScroller } from '@/lib/motion/gsap/scroller-handle';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
}

function closeMenu() {
  fireEvent.click(screen.getByRole('button', { name: /close menu/i }));
}

beforeEach(() => {
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
});

afterEach(() => {
  setMarketingScroller(undefined);
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
});

describe('LandingHeader mobile menu — scroll lock', () => {
  it('locks the document element, and leaves <body> alone', () => {
    render(<LandingHeader onRequestDemo={vi.fn()} />);
    openMenu();

    expect(document.documentElement.style.overflow).toBe('hidden');

    // The actual regression. A body lock creates a second scroll container and
    // sends the sticky header to the top of the document.
    expect(
      document.body.style.overflow,
      'The mobile-menu scroll lock is back on <body>. The `overflow` shorthand ' +
        'sets overflow-x too, which turns <body> into a scroll container and ' +
        'breaks `position: sticky` on the header — the menu then opens above ' +
        'the viewport and reads as "the hamburger does nothing when scrolled". ' +
        'Lock document.documentElement instead. See globals.css:173-188.',
    ).not.toBe('hidden');
  });

  it('restores the previous overflow when the menu closes', () => {
    render(<LandingHeader onRequestDemo={vi.fn()} />);
    openMenu();
    expect(document.documentElement.style.overflow).toBe('hidden');

    closeMenu();
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('stops and restarts the smooth scroller while open', () => {
    // Lenis owns the scroll position on `/` and `/products` and moves the page
    // with programmatic scrollTo, which overflow:hidden does not block. If this
    // stops being called the lock silently becomes decorative on exactly the
    // two pages that matter most.
    const stop = vi.fn();
    const start = vi.fn();
    setMarketingScroller({ scrollTo: vi.fn(), stop, start });

    render(<LandingHeader onRequestDemo={vi.fn()} />);
    openMenu();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();

    closeMenu();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('does not throw when no scroller is registered', () => {
    // /about and /pricing never mount the provider — getMarketingScroller()
    // returns undefined there and the optional calls must no-op, not crash the
    // whole header.
    setMarketingScroller(undefined);
    render(<LandingHeader onRequestDemo={vi.fn()} />);
    expect(() => openMenu()).not.toThrow();
    expect(document.documentElement.style.overflow).toBe('hidden');
  });

  it('actually opens the menu (non-vacuity)', () => {
    // Every assertion above would pass if the button silently did nothing.
    render(<LandingHeader onRequestDemo={vi.fn()} />);
    const menu = document.getElementById('landing-mobile-menu');
    expect(menu).not.toBeNull();
    expect(menu!.hasAttribute('hidden')).toBe(true);

    openMenu();
    expect(menu!.hasAttribute('hidden')).toBe(false);
    expect(screen.getByRole('button', { name: /close menu/i })).toBeTruthy();
  });
});
