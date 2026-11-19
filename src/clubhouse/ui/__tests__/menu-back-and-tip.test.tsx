import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Audit 2026-11-18 (P2), the shared overlay layer:
 * - Back with a menu open on the phone left the page: the menu now owns one same-address history entry, so Back closes it.
 * - A tooltip showed after Escape closed a menu on the phone: focus handed back to the trigger is quiet, and a tip never
 *   opens for quiet focus.
 */
vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ href, replace, children, ...rest }: { href: string; replace?: boolean; children: React.ReactNode }) => (
    <a href={href} data-replace={replace ? '' : undefined} {...rest}>
      {children}
    </a>
  ),
}));

import { Menu } from '../Menu';
import { Tooltip } from '../Tooltip';

let phone = true;
beforeEach(() => {
  phone = true;
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('max-width') ? phone : q.includes('focus') ? false : false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }));
  window.history.replaceState(null, '', '/golf/dashboard/recruiting');
});
afterEach(async () => {
  cleanup();
  // A menu left open at cleanup takes its entry back off a task later (useBackCloses): let that Back land here, not in the next case.
  await new Promise((r) => setTimeout(r, 50));
  vi.unstubAllGlobals();
});

function Host({ onPick = () => {} }: { onPick?: () => void }) {
  return (
    <LazyMotion features={domAnimation}>
      <div className="ch-root" data-ui="clubhouse">
        <Menu
          label="Sort"
          items={[
            { label: 'Recently updated', onSelect: onPick },
            { label: 'Open board', href: '/golf/dashboard/recruiting/board' },
          ]}
          trigger={(p) => (
            <Tooltip label="More">
              <button type="button" {...p} aria-label="More">
                More
              </button>
            </Tooltip>
          )}
        />
      </div>
    </LazyMotion>
  );
}

/** A history stack the test can read: pushState, replaceState and an async back() with its popstate, as a browser does. */
function fakeHistory(start: string) {
  const real = { push: window.history.pushState.bind(window.history), replace: window.history.replaceState.bind(window.history) };
  real.replace(null, '', start);
  let stack: Array<{ url: string; state: unknown }> = [{ url: start, state: null }];
  let idx = 0;
  let pending = 0;
  const pushSpy = vi.spyOn(window.history, 'pushState').mockImplementation((state: unknown, _t: string, url?: string | URL | null) => {
    stack = stack.slice(0, idx + 1);
    stack.push({ url: url ? String(url) : stack[idx]!.url, state });
    idx += 1;
    real.replace(state, '', stack[idx]!.url);
  });
  const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
    pending += 1;
    window.setTimeout(() => {
      pending -= 1;
      if (idx === 0) return;
      idx -= 1;
      real.replace(stack[idx]!.state, '', stack[idx]!.url);
      act(() => void window.dispatchEvent(new PopStateEvent('popstate', { state: stack[idx]!.state })));
    }, 5);
  });
  return {
    /** What a router.push does: a new entry on top. */
    push: (url: string) => window.history.pushState(null, '', url),
    urls: () => stack.slice(0, idx + 1).map((e) => e.url),
    at: () => idx,
    settle: async () => {
      await act(async () => {
        for (let i = 0; i < 20 && pending > 0; i++) await new Promise((r) => setTimeout(r, 10));
        await new Promise((r) => setTimeout(r, 20));
      });
    },
    restore: () => {
      pushSpy.mockRestore();
      backSpy.mockRestore();
    },
  };
}

const menuOpen = () => screen.getByRole('button', { name: 'More' }).getAttribute('aria-expanded') === 'true';
const popTo = async (state: unknown) => {
  await act(async () => {
    window.history.replaceState(state, '');
    window.dispatchEvent(new PopStateEvent('popstate', { state }));
  });
};

describe('Menu on the phone and Back (audit 2026-11-18)', () => {
  it('opening pushes one entry on the same address; Back closes the menu and stays on the page', async () => {
    render(<Host />);
    const before = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(menuOpen()).toBe(true);
    expect(window.history.length).toBe(before + 1);
    expect(location.pathname).toBe('/golf/dashboard/recruiting');
    await popTo(null);
    expect(menuOpen()).toBe(false);
    expect(location.pathname).toBe('/golf/dashboard/recruiting');
  });

  it('a link picked from the open menu replaces its entry rather than stacking on it', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menuitem', { name: 'Open board' }).hasAttribute('data-replace')).toBe(true);
  });

  it('an action picked runs once the menu’s entry is off: one that navigates ends on its page with no entry left behind', async () => {
    const h = fakeHistory('/golf/dashboard/calendar');
    const onPick = vi.fn(() => h.push('/golf/dashboard/calendar/hours'));
    render(<Host onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(h.urls()).toEqual(['/golf/dashboard/calendar', '/golf/dashboard/calendar']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Recently updated' }));
    // Not before the entry's own Back has landed (Codex review on #2593: Calendar's Practice hours pushes from its action).
    expect(onPick).not.toHaveBeenCalled();
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    await h.settle();
    expect(h.urls()).toEqual(['/golf/dashboard/calendar', '/golf/dashboard/calendar/hours']);
    expect(location.pathname).toBe('/golf/dashboard/calendar/hours');
    h.restore();
  });

  it('a menu removed while open (its row deleted) leaves no entry behind', async () => {
    const h = fakeHistory('/golf/dashboard/practice/plan/p1/edit');
    const view = render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(h.urls()).toHaveLength(2);
    view.unmount();
    await h.settle();
    expect(h.at()).toBe(0);
    expect((window.history.state as { chOverlay?: number } | null)?.chOverlay).toBeUndefined();
    h.restore();
  });

  it('on the desktop the menu pushes nothing and a pick runs at once', () => {
    phone = false;
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);
    const before = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(window.history.length).toBe(before);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Recently updated' }));
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});

describe('No tooltip for focus a menu hands back (audit 2026-11-18)', () => {
  // First: a tip just dismissed holds the shared tip clock for a moment (tooltip-clock.ts).
  it('keyboard focus that arrives on its own still shows the tip', async () => {
    phone = false;
    render(<Host />);
    await act(async () => {
      // A key press first, so the focus is a keyboard's (:focus-visible) after the clicks of the cases above.
      fireEvent.keyDown(document.body, { key: 'Tab' });
      screen.getByRole('button', { name: 'More' }).focus();
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(document.querySelector('.ch-tip')).not.toBeNull();
  });
  it('Escape closes the menu, focus returns to the trigger, and no tip opens', async () => {
    phone = false;
    render(<Host />);
    const more = screen.getByRole('button', { name: 'More' });
    fireEvent.click(more);
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    });
    expect(document.activeElement).toBe(more);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(document.querySelector('.ch-tip')).toBeNull();
  });

});
