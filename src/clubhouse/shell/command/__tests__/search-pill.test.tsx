import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../__tests__/dialog-polyfill';
import { CommandLayer } from '../CommandLayer';
import { SearchPill } from '../SearchPill';
import { clearPeople } from '../people';
import { resetRecent } from '../recent';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard' }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));

const COACH = 'coach' as const;
let desktop = true;
beforeAll(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  desktop = true;
  window.sessionStorage.clear();
  resetRecent();
  clearPeople();
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({ matches: query.includes('hover: hover') ? desktop : false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(cleanup);

function mount() {
  return render(
    <LazyMotion features={domAnimation}>
      <div className="ch-root" data-ui="clubhouse">
        <header>
          <SearchPill />
        </header>
        <main id="ch-canvas" />
        <CommandLayer role={COACH} pathname="/golf/dashboard" userId="u1" teamId="t1" />
      </div>
    </LazyMotion>,
  );
}

describe('the top bar search pill (B11)', () => {
  it('opens the one command palette, the same one Cmd K opens', () => {
    mount();
    const pill = screen.getByRole('button', { name: 'Search Clubhouse' });
    expect(pill).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.queryByRole('dialog', { name: 'Search Clubhouse' })).toBeNull();
    act(() => void fireEvent.click(pill));
    expect(screen.getByRole('dialog', { name: 'Search Clubhouse' })).toBeInTheDocument();
    // Pressed again while it is up: still the one palette.
    act(() => void fireEvent.click(pill));
    expect(screen.getAllByRole('dialog', { name: 'Search Clubhouse' })).toHaveLength(1);
  });

  it('takes focus as it is pressed, so Esc hands focus back to it (Safari focuses no button on a click)', () => {
    mount();
    const pill = screen.getByRole('button', { name: 'Search Clubhouse' });
    let focused = false;
    pill.addEventListener('focus', () => (focused = true));
    act(() => void fireEvent.click(pill));
    expect(focused).toBe(true);
  });

  it('shows the platform chord and announces it', () => {
    mount();
    const pill = screen.getByRole('button', { name: 'Search Clubhouse' });
    const apple = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
    expect(pill).toHaveAttribute('aria-keyshortcuts', apple ? 'Meta+K' : 'Control+K');
    expect(Array.from(pill.querySelectorAll('kbd')).map((k) => k.textContent)).toEqual([apple ? '⌘' : 'Ctrl', 'K']);
  });

  it('is not drawn on the phone, where the command layer does nothing', () => {
    desktop = false;
    mount();
    expect(screen.queryByRole('button', { name: 'Search Clubhouse' })).toBeNull();
  });
});
