import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LazyMotion, domAnimation } from 'motion/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * F-0009 (audit 2026-10-29): the first click on a Team Hub row's More opened nothing. The menu closed on ANY scroll in
 * the document (a smooth scroll still settling, a tab strip), opened and shut in the same frame. It closes only when a
 * scroll moved its trigger; any other scroll leaves it open, placed again.
 */
vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
vi.mock('../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
import { Menu } from '../Menu';
afterEach(cleanup);

let triggerTop = 100;
function show() {
  render(
    <LazyMotion features={domAnimation}>
      <div data-ui="clubhouse" className="ch-root">
        <div data-testid="elsewhere" />
        <Menu
          label="Actions"
          items={[{ label: 'Edit', onSelect: () => {} }]}
          trigger={(p) => (
            <button
              type="button"
              {...p}
              ref={(el) => {
                p.ref(el);
                if (el) el.getBoundingClientRect = () => ({ top: triggerTop, bottom: triggerTop + 32, left: 400, right: 432, width: 32, height: 32, x: 400, y: triggerTop, toJSON: () => ({}) }) as DOMRect;
              }}
            >
              More
            </button>
          )}
        />
      </div>
    </LazyMotion>,
  );
}

describe('Menu and scrolling (F-0009)', () => {
  it('a scroll elsewhere leaves it open; a scroll that moves the trigger closes it', async () => {
    triggerTop = 100;
    show();
    await userEvent.setup().click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    act(() => {
      screen.getByTestId('elsewhere').dispatchEvent(new Event('scroll'));
    });
    expect(screen.getByRole('button', { name: 'More' }).getAttribute('aria-expanded')).toBe('true');
    triggerTop = 60;
    act(() => {
      document.dispatchEvent(new Event('scroll'));
    });
    expect(screen.getByRole('button', { name: 'More' }).getAttribute('aria-expanded')).toBe('false');
  });
});
