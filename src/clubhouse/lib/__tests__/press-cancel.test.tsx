import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * dsx-08: one pressed state for every control, and a press that lets go the moment a tap turns into something else. A
 * touch already pressing that moves past the slop, anything scrolling under a finger, a long press's menu, or the app
 * going to the background end it at once, with no linger, so a row is never left lit by a scroll.
 */

import { PRESSED_TARGET, PRESS_SLOP_PX, PRESS_TOUCH_DELAY_MS, useChPress } from '../press';

function Harness() {
  useChPress(true);
  return (
    <div data-ui="clubhouse">
      <div role="tablist">
        <button type="button" role="tab" aria-selected="true">
          Season
        </button>
      </div>
      <div role="listbox">
        <div role="option" aria-selected="false" tabIndex={-1}>
          Fairway
        </div>
      </div>
      <div role="switch" aria-checked="false" tabIndex={0}>
        Alerts
      </div>
      <div role="menuitem" tabIndex={-1}>
        Rename
      </div>
      <details>
        <summary>More</summary>
      </details>
      <div data-testid="scroller" style={{ overflow: 'auto' }}>
        <a href="#row">A row</a>
      </div>
    </div>
  );
}

function pointer(type: string, pointerType: 'touch' | 'mouse', { x = 0, y = 0 } = {}) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(e, { pointerId: { value: 1 }, pointerType: { value: pointerType }, isPrimary: { value: true } });
  return e;
}
const pressed = (text: string) => screen.getByText(text).hasAttribute('data-ch-pressed');
const hold = (el: Element, y = 100) => {
  act(() => void el.dispatchEvent(pointer('pointerdown', 'touch', { y })));
  act(() => vi.advanceTimersByTime(PRESS_TOUCH_DELAY_MS));
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('every control presses the same way (dsx-08)', () => {
  it.each(['Season', 'Fairway', 'Alerts', 'Rename', 'More'])('%s takes the pressed state', (text) => {
    render(<Harness />);
    hold(screen.getByText(text));
    expect(pressed(text)).toBe(true);
  });

  it('the target list names every pressable role once', () => {
    for (const r of ['tab', 'option', 'menuitem', 'switch', 'checkbox', 'radio', 'link', 'button']) expect(PRESSED_TARGET).toContain(`[role="${r}"]`);
    expect(new Set(PRESSED_TARGET.split(',')).size).toBe(PRESSED_TARGET.split(',').length);
  });
});

describe('a tap that turns into a scroll lets go at once (dsx-08)', () => {
  it('a held touch that moves past the slop drops its press with no linger', () => {
    render(<Harness />);
    const row = screen.getByText('A row');
    hold(row);
    expect(pressed('A row')).toBe(true);
    act(() => void row.dispatchEvent(pointer('pointermove', 'touch', { y: 100 - PRESS_SLOP_PX - 2 })));
    expect(pressed('A row')).toBe(false);
  });

  it('a small wobble under the slop keeps it', () => {
    render(<Harness />);
    const row = screen.getByText('A row');
    hold(row);
    act(() => void row.dispatchEvent(pointer('pointermove', 'touch', { y: 100 - PRESS_SLOP_PX + 4 })));
    expect(pressed('A row')).toBe(true);
  });

  it('a nested scroller scrolling under a held finger ends the press', () => {
    render(<Harness />);
    hold(screen.getByText('A row'));
    act(() => void screen.getByTestId('scroller').dispatchEvent(new Event('scroll')));
    expect(pressed('A row')).toBe(false);
  });

  it('a scroll during the touch delay means the press never shows', () => {
    render(<Harness />);
    const row = screen.getByText('A row');
    act(() => void row.dispatchEvent(pointer('pointerdown', 'touch')));
    act(() => void screen.getByTestId('scroller').dispatchEvent(new Event('scroll')));
    act(() => vi.advanceTimersByTime(300));
    expect(pressed('A row')).toBe(false);
  });

  it('a mouse press survives a scroll (a wheel under a held button is not a cancel)', () => {
    render(<Harness />);
    act(() => void screen.getByText('A row').dispatchEvent(pointer('pointerdown', 'mouse')));
    act(() => void screen.getByTestId('scroller').dispatchEvent(new Event('scroll')));
    expect(pressed('A row')).toBe(true);
  });

  it('a long press that opens a menu ends the press', () => {
    render(<Harness />);
    const row = screen.getByText('A row');
    hold(row);
    act(() => void row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })));
    expect(pressed('A row')).toBe(false);
  });

  it('leaving the app mid-press ends it', () => {
    render(<Harness />);
    hold(screen.getByText('A row'));
    act(() => void window.dispatchEvent(new Event('blur')));
    expect(pressed('A row')).toBe(false);
  });
});
