import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A12: a finger's press waits 70ms before the button shrinks, so a scroll that starts on a button never makes it flinch; a tap
 * that lifts sooner still shows its press for 90ms; a cancel or a move past 10px never shrinks it; a mouse presses at once.
 */

import { PRESS_TAP_SHOW_MS, PRESS_TOUCH_DELAY_MS, useChPress } from '../press';

function Harness() {
  useChPress(true);
  return (
    <div data-ui="clubhouse">
      <button type="button" className="ch-btn">
        Save
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

const animate = vi.fn((..._args: unknown[]) => ({ cancel: vi.fn() }) as unknown as Animation);
const original = Element.prototype.animate;
/** The press animations (to a scale under 1), as distinct from the spring back. */
const presses = () => animate.mock.calls.filter((c) => (c[0] as Array<{ scale: string }>)[1]!.scale !== '1').length;
const springs = () => animate.mock.calls.filter((c) => (c[0] as Array<{ scale: string }>)[1]!.scale === '1').length;

beforeEach(() => {
  vi.useFakeTimers();
  animate.mockClear();
  Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
  render(<Harness />);
});
afterEach(() => {
  cleanup();
  Element.prototype.animate = original;
  vi.useRealTimers();
});

const save = () => screen.getByText('Save');

describe('the touch press waits (A12)', () => {
  it('no scale at 50ms after a touch down; the scale at 70ms', () => {
    act(() => void save().dispatchEvent(pointer('pointerdown', 'touch')));
    act(() => vi.advanceTimersByTime(50));
    expect(presses()).toBe(0);
    act(() => vi.advanceTimersByTime(PRESS_TOUCH_DELAY_MS - 50));
    expect(presses()).toBe(1);
  });

  it('a tap lifted at 30ms still shows its press for 90ms, then springs back', () => {
    act(() => void save().dispatchEvent(pointer('pointerdown', 'touch')));
    act(() => vi.advanceTimersByTime(30));
    act(() => void save().dispatchEvent(pointer('pointerup', 'touch')));
    expect(presses()).toBe(1);
    expect(springs()).toBe(0);
    act(() => vi.advanceTimersByTime(PRESS_TAP_SHOW_MS));
    expect(springs()).toBe(1);
  });

  it('a cancel at 40ms never scales', () => {
    act(() => void save().dispatchEvent(pointer('pointerdown', 'touch')));
    act(() => vi.advanceTimersByTime(40));
    act(() => void save().dispatchEvent(pointer('pointercancel', 'touch')));
    act(() => vi.advanceTimersByTime(200));
    expect(presses()).toBe(0);
  });

  it('a move past 10px before the delay is a scroll: never scales', () => {
    act(() => void save().dispatchEvent(pointer('pointerdown', 'touch', { y: 100 })));
    act(() => void save().dispatchEvent(pointer('pointermove', 'touch', { y: 88 })));
    act(() => vi.advanceTimersByTime(200));
    expect(presses()).toBe(0);
  });

  it('a mouse press scales at 0ms', () => {
    act(() => void save().dispatchEvent(pointer('pointerdown', 'mouse')));
    expect(presses()).toBe(1);
  });
});
