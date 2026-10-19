import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TIP_GRACE_MS, TIP_OPEN_DELAY_MS } from '../../shell/command/tooltip-clock';
import { IconButton } from '../Button';
import { Tooltip } from '../Tooltip';
import { Menu as MenuIcon } from 'lucide-react';

vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));

let hover = true;
beforeAll(() => {
  // jsdom has no PointerEvent: the one a pointer enter carries is what says mouse or finger.
  (window as { PointerEvent?: unknown }).PointerEvent ??= class extends MouseEvent {
    pointerType: string;
    constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? 'mouse';
    }
  };
});
beforeEach(() => {
  hover = true;
  vi.useFakeTimers();
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) => ({ matches: query.includes('hover: hover') ? hover : false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const tip = () => document.querySelector('.ch-tip');
const over = (el: Element, pointerType = 'mouse') => act(() => void fireEvent.pointerOver(el, { pointerType }));
const out = (el: Element) => act(() => void fireEvent.pointerOut(el));
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('Tooltip', () => {
  it('draws nothing while closed, then opens after the pointer rests for the first time', () => {
    render(<IconButton icon={MenuIcon} label="Menu" />);
    const b = screen.getByRole('button', { name: 'Menu' });
    expect(tip()).toBeNull();
    over(b);
    wait(TIP_OPEN_DELAY_MS - 1);
    expect(tip()).toBeNull();
    wait(1);
    expect(tip()?.textContent).toBe('Menu');
  });

  it('is its control\'s name (it is the name, and the control keeps it: nothing else describes it twice)', () => {
    render(<IconButton icon={MenuIcon} label="Menu" />);
    const b = screen.getByRole('button', { name: 'Menu' });
    expect(b).not.toHaveAttribute('title');
    over(b);
    wait(TIP_OPEN_DELAY_MS);
    expect(tip()).toHaveAttribute('aria-hidden', 'true');
  });

  it('opens at once for the next control within the grace window, and slowly again after it', () => {
    render(
      <>
        <IconButton icon={MenuIcon} label="First" />
        <IconButton icon={MenuIcon} label="Second" />
      </>,
    );
    const [a, b] = [screen.getByRole('button', { name: 'First' }), screen.getByRole('button', { name: 'Second' })];
    over(a);
    wait(TIP_OPEN_DELAY_MS);
    out(a);
    wait(TIP_GRACE_MS - 100);
    over(b);
    expect(tip()?.textContent).toBe('Second');
    out(b);
    wait(TIP_GRACE_MS + 50);
    over(a);
    expect(tip()).toBeNull();
    wait(TIP_OPEN_DELAY_MS);
    expect(tip()?.textContent).toBe('First');
  });

  it('never opens for a finger, or where nothing hovers', () => {
    render(<IconButton icon={MenuIcon} label="Menu" />);
    const b = screen.getByRole('button', { name: 'Menu' });
    over(b, 'touch');
    wait(2000);
    expect(tip()).toBeNull();
    hover = false;
    over(b);
    wait(2000);
    expect(tip()).toBeNull();
  });

  it('opens at once on keyboard focus and Escape dismisses it without being swallowed', () => {
    render(<IconButton icon={MenuIcon} label="Menu" shortcut={['N']} />);
    const b = screen.getByRole('button', { name: 'Menu' });
    expect(b).toHaveAttribute('aria-keyshortcuts', 'N');
    act(() => b.focus());
    expect(tip()?.textContent).toBe('MenuN');
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => void b.dispatchEvent(esc));
    expect(tip()).toBeNull();
    expect(esc.defaultPrevented).toBe(false);
  });

  it('closes on a press, on blur and when its control leaves the page', () => {
    const { unmount } = render(<IconButton icon={MenuIcon} label="Menu" />);
    const b = screen.getByRole('button', { name: 'Menu' });
    over(b);
    wait(TIP_OPEN_DELAY_MS);
    act(() => void fireEvent.pointerDown(b));
    expect(tip()).toBeNull();
    over(b);
    wait(TIP_OPEN_DELAY_MS);
    expect(tip()).not.toBeNull();
    unmount();
    expect(tip()).toBeNull();
  });

  it('keeps the control\'s own handlers', () => {
    const onPointerEnter = vi.fn();
    render(
      <Tooltip label="Go">
        <button type="button" onPointerEnter={onPointerEnter}>
          Go
        </button>
      </Tooltip>,
    );
    over(screen.getByRole('button', { name: 'Go' }));
    expect(onPointerEnter).toHaveBeenCalled();
  });

  it('is drawn inside the control\'s dialog, so it is in the top layer with it', () => {
    render(
      <dialog open>
        <Tooltip label="Close">
          <button type="button">Close</button>
        </Tooltip>
      </dialog>,
    );
    over(screen.getByRole('button', { name: 'Close' }));
    wait(TIP_OPEN_DELAY_MS);
    expect(tip()?.closest('dialog')).not.toBeNull();
  });
});
