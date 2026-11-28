import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MOTION-AND-VISUAL 3.8, the row wash. A row, a menu item or an option takes the linen wash (`--ch-sel`, drawn by its
 * `[data-ch-pressed]` rule): in over press (110ms) on ease-out, out over release (280ms) on the iOS curve. A finger's
 * press waits 50ms in lib/press.ts (the CSS delay token is gone, 3.2), so a scroll that starts on a row never presses it;
 * a tap shorter than 50ms still flashes the wash for 110ms, as on iOS. A button scales instead and never washes.
 */

import { PRESS_TAP_SHOW_MS, PRESS_TOUCH_DELAY_MS, PRESS_WASH_IN, PRESS_WASH_OUT, useChPress } from '../press';

const REST = 'rgba(0, 0, 0, 0)';
const WASH = 'rgb(235, 228, 210)';

function Harness({ motion = true }: { motion?: boolean }) {
  useChPress(motion);
  return (
    <div data-ui="clubhouse">
      <a href="#row" className="ch-lgr__row is-link">
        A row
      </a>
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

type Call = [Keyframe[], KeyframeAnimationOptions];
const animate = vi.fn(function (this: Element, ..._args: unknown[]) {
  return { cancel: vi.fn() } as unknown as Animation;
});
/** A CSS transition the mark starts on the row's background, which the wash replaces. */
const transition = { transitionProperty: 'background-color', cancel: vi.fn() };
const original = { animate: Element.prototype.animate, getAnimations: Element.prototype.getAnimations, style: window.getComputedStyle };

beforeEach(() => {
  vi.useFakeTimers();
  animate.mockClear();
  transition.cancel.mockClear();
  Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
  Element.prototype.getAnimations = (() => [transition]) as unknown as typeof Element.prototype.getAnimations;
  // The pressed rule paints the wash; anything else is clear.
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (el: Element) => ({ backgroundColor: el.hasAttribute('data-ch-pressed') ? WASH : REST, scale: '1' }) as CSSStyleDeclaration,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Element.prototype.animate = original.animate;
  Element.prototype.getAnimations = original.getAnimations;
  delete document.documentElement.dataset.motion;
  vi.useRealTimers();
});

const row = () => screen.getByText('A row');
const washes = () => (animate.mock.calls as unknown as Call[]).filter(([frames]) => 'backgroundColor' in (frames[0] ?? {}));
const pressed = () => row().hasAttribute('data-ch-pressed');

describe('the row wash (3.8)', () => {
  it('a held finger presses the row at 50ms, not before, and the wash comes in over press on ease-out', () => {
    render(<Harness />);
    act(() => void row().dispatchEvent(pointer('pointerdown', 'touch')));
    act(() => vi.advanceTimersByTime(PRESS_TOUCH_DELAY_MS - 1));
    expect(pressed()).toBe(false);
    expect(washes()).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1));
    expect(pressed()).toBe(true);
    expect(washes()).toHaveLength(1);
    const [frames, opts] = washes()[0]!;
    expect(frames).toEqual([{ backgroundColor: REST }, { backgroundColor: WASH }]);
    expect(opts).toEqual(PRESS_WASH_IN);
    expect(opts).toEqual({ duration: 110, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    // The CSS transition the mark set off is cancelled, so the wash is the only one running.
    expect(transition.cancel).toHaveBeenCalled();
  });

  it('letting go fades the wash over release on the iOS curve, to the colour the sheet gives the row then', () => {
    render(<Harness />);
    act(() => void row().dispatchEvent(pointer('pointerdown', 'touch')));
    act(() => vi.advanceTimersByTime(300));
    act(() => void row().dispatchEvent(pointer('pointerup', 'touch')));
    expect(pressed()).toBe(false);
    expect(washes()).toHaveLength(2);
    const [frames, opts] = washes()[1]!;
    // From the wash, with the end left open: the live colour under the fade, never one read before a toggle changed it.
    expect(frames).toEqual([{ backgroundColor: WASH, offset: 0 }]);
    expect(opts).toEqual(PRESS_WASH_OUT);
    expect(opts).toEqual({ duration: 280, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
  });

  it('a tap shorter than 50ms still flashes the wash for 110ms, then fades it', () => {
    render(<Harness />);
    act(() => void row().dispatchEvent(pointer('pointerdown', 'touch')));
    act(() => vi.advanceTimersByTime(20));
    act(() => void row().dispatchEvent(pointer('pointerup', 'touch')));
    expect(pressed()).toBe(true);
    expect(washes()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(PRESS_TAP_SHOW_MS - 1));
    expect(pressed()).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(pressed()).toBe(false);
    expect(washes()).toHaveLength(2);
    expect(washes()[1]![1]).toEqual(PRESS_WASH_OUT);
  });

  it('a scroll that starts on the row never presses it', () => {
    render(<Harness />);
    act(() => void row().dispatchEvent(pointer('pointerdown', 'touch', { y: 100 })));
    act(() => vi.advanceTimersByTime(30));
    act(() => void row().dispatchEvent(pointer('pointermove', 'touch', { y: 70 })));
    act(() => vi.advanceTimersByTime(300));
    act(() => void row().dispatchEvent(pointer('pointerup', 'touch', { y: 70 })));
    act(() => vi.advanceTimersByTime(300));
    expect(pressed()).toBe(false);
    expect(washes()).toHaveLength(0);
  });

  it('a scroll the browser takes over before 50ms never presses it either', () => {
    render(<Harness />);
    act(() => void row().dispatchEvent(pointer('pointerdown', 'touch')));
    act(() => vi.advanceTimersByTime(30));
    act(() => void row().dispatchEvent(pointer('pointercancel', 'touch')));
    act(() => vi.advanceTimersByTime(300));
    expect(pressed()).toBe(false);
    expect(washes()).toHaveLength(0);
  });

  it('a scroll after the press showed drops it at once, the wash fading', () => {
    render(<Harness />);
    act(() => void row().dispatchEvent(pointer('pointerdown', 'touch')));
    act(() => vi.advanceTimersByTime(80));
    expect(pressed()).toBe(true);
    act(() => void row().dispatchEvent(pointer('pointercancel', 'touch')));
    expect(pressed()).toBe(false);
    expect(washes()[1]![1]).toEqual(PRESS_WASH_OUT);
  });

  it('a mouse presses at once', () => {
    render(<Harness />);
    act(() => void row().dispatchEvent(pointer('pointerdown', 'mouse')));
    expect(pressed()).toBe(true);
    expect(washes()).toHaveLength(1);
  });

  it('runs under Reduce Motion (a colour, not a movement), and flips with Animations off', () => {
    render(<Harness motion={false} />);
    act(() => void row().dispatchEvent(pointer('pointerdown', 'mouse')));
    expect(washes()).toHaveLength(1);
    act(() => void row().dispatchEvent(pointer('pointerup', 'mouse')));
    act(() => vi.advanceTimersByTime(PRESS_TAP_SHOW_MS));
    cleanup();
    animate.mockClear();
    document.documentElement.dataset.motion = 'off';
    render(<Harness motion={false} />);
    act(() => void row().dispatchEvent(pointer('pointerdown', 'mouse')));
    expect(pressed()).toBe(true);
    expect(washes()).toHaveLength(0);
  });

  it('a button scales and never washes', () => {
    render(<Harness />);
    const save = screen.getByText('Save');
    act(() => void save.dispatchEvent(pointer('pointerdown', 'mouse')));
    expect(save.hasAttribute('data-ch-pressed')).toBe(true);
    expect(washes()).toHaveLength(0);
    const [frames, opts] = (animate.mock.calls as unknown as Call[])[0]!;
    expect(frames).toEqual([{ scale: '1' }, { scale: '0.97' }]);
    expect(opts.easing).toBe('cubic-bezier(0.22, 1, 0.36, 1)');
  });
});
