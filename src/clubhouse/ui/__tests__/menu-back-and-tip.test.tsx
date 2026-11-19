import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
afterEach(() => {
  cleanup();
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

  it('an action picked waits for the menu’s entry to come off before it runs', async () => {
    const onPick = vi.fn();
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    render(<Host onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Recently updated' }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
    await popTo(null);
    expect(onPick).toHaveBeenCalledTimes(1);
    back.mockRestore();
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
