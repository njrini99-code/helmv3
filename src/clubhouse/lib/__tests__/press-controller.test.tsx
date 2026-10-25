import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * B6: the pressed look. The control under the finger carries `data-ch-pressed`: a quick tap shows it for at least 90ms,
 * a scroll (a move past 10px) never sets it, and it runs with motion off as well, since it is a state, not a movement.
 */

import { PRESS_TAP_SHOW_MS, PRESS_TOUCH_DELAY_MS, useChPress } from '../press';

function Harness({ motion = true }: { motion?: boolean }) {
  useChPress(motion);
  return (
    <div data-ui="clubhouse">
      <a href="#row" className="ch-navitem">
        A row
      </a>
      <button type="button" className="ch-rt-opt">
        Fairway
      </button>
      <button type="button" disabled>
        Off
      </button>
    </div>
  );
}

/** A pointer event as WebKit sends it (jsdom has no PointerEvent). */
function pointer(type: string, pointerType: 'touch' | 'mouse', { x = 0, y = 0 } = {}) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(e, { pointerId: { value: 1 }, pointerType: { value: pointerType }, isPrimary: { value: true } });
  return e;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const pressed = (text: string) => screen.getByText(text).hasAttribute('data-ch-pressed');

describe('the pressed look (B6)', () => {
  it('a 40ms tap shows data-ch-pressed for at least 90ms, then lets go', () => {
    render(<Harness />);
    const row = screen.getByText('A row');
    act(() => void row.dispatchEvent(pointer('pointerdown', 'touch')));
    act(() => vi.advanceTimersByTime(40));
    act(() => void row.dispatchEvent(pointer('pointerup', 'touch')));
    expect(pressed('A row')).toBe(true);
    act(() => vi.advanceTimersByTime(PRESS_TAP_SHOW_MS - 1));
    expect(pressed('A row')).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(pressed('A row')).toBe(false);
  });

  it('a held touch shows it from 70ms and keeps it while held', () => {
    render(<Harness />);
    const opt = screen.getByText('Fairway');
    act(() => void opt.dispatchEvent(pointer('pointerdown', 'touch')));
    act(() => vi.advanceTimersByTime(PRESS_TOUCH_DELAY_MS - 1));
    expect(pressed('Fairway')).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(pressed('Fairway')).toBe(true);
    act(() => vi.advanceTimersByTime(500));
    expect(pressed('Fairway')).toBe(true);
    act(() => void opt.dispatchEvent(pointer('pointerup', 'touch')));
    expect(pressed('Fairway')).toBe(false);
  });

  it('a scroll (a move of 20px) never sets it', () => {
    render(<Harness />);
    const row = screen.getByText('A row');
    act(() => void row.dispatchEvent(pointer('pointerdown', 'touch', { y: 100 })));
    act(() => void row.dispatchEvent(pointer('pointermove', 'touch', { y: 80 })));
    act(() => vi.advanceTimersByTime(300));
    act(() => void row.dispatchEvent(pointer('pointerup', 'touch', { y: 80 })));
    act(() => vi.advanceTimersByTime(300));
    expect(pressed('A row')).toBe(false);
  });

  it('a cancel drops it at once', () => {
    render(<Harness />);
    const opt = screen.getByText('Fairway');
    act(() => void opt.dispatchEvent(pointer('pointerdown', 'mouse')));
    expect(pressed('Fairway')).toBe(true);
    act(() => void opt.dispatchEvent(pointer('pointercancel', 'mouse')));
    expect(pressed('Fairway')).toBe(false);
  });

  it('runs with motion off, and never on a disabled control', () => {
    render(<Harness motion={false} />);
    act(() => void screen.getByText('Fairway').dispatchEvent(pointer('pointerdown', 'mouse')));
    expect(pressed('Fairway')).toBe(true);
    act(() => void screen.getByText('Off').dispatchEvent(pointer('pointerdown', 'mouse')));
    expect(pressed('Off')).toBe(false);
  });
});
