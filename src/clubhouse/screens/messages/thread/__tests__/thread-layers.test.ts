import { describe, expect, it } from 'vitest';
import { KEYBOARD_EASE, KEYBOARD_MS } from '../../motion/messages-motion';
import {
  BAR_CLEAR_PX,
  COMPOSER_CLEAR_PX,
  FLAT_SCROLL_PX,
  KEYBOARD_MIN_PX,
  LAYER_PAD,
  barIsFlat,
  keyboardHeight,
  layerPadding,
  pinnedToBottom,
  rideLift,
  rideShift,
  rideTiming,
} from '../thread-layers';

/** MSG-203: the numbers that keep the first and last message clear of the glass bars. */
describe('layer padding', () => {
  it('falls back to the artifact\'s --pad-top / --pad-bot before anything is measured', () => {
    expect(layerPadding({ kind: 'phone', barHeight: 0, composerHeight: 0 })).toEqual({ top: 132, bottom: 104 });
    expect(layerPadding({ kind: 'desk', barHeight: 0, composerHeight: 0 })).toEqual({ top: 76, bottom: 92 });
    expect(LAYER_PAD.phone).toEqual({ top: 132, bottom: 104 });
  });
  it('is the measured bar plus its clearance on top, and the composer plus its clearance at the foot', () => {
    // The artifact: a 104 phone bar sits over 132 of padding, an 84 composer over 104; a 64 desktop bar over 76, a 74 composer over 92.
    expect(layerPadding({ kind: 'phone', barHeight: 104, composerHeight: 84 })).toEqual({ top: 132, bottom: 104 });
    expect(layerPadding({ kind: 'desk', barHeight: 64, composerHeight: 74 })).toEqual({ top: 76, bottom: 92 });
    expect(BAR_CLEAR_PX).toEqual({ phone: 28, desk: 12 });
    expect(COMPOSER_CLEAR_PX).toEqual({ phone: 20, desk: 18 });
  });
  it('grows with the bars: a taller status bar and a grown draft push the first and last messages clear', () => {
    expect(layerPadding({ kind: 'phone', barHeight: 109, composerHeight: 84 }).top).toBe(137);
    expect(layerPadding({ kind: 'phone', barHeight: 109, composerHeight: 160 }).bottom).toBe(180);
    expect(layerPadding({ kind: 'desk', barHeight: 64, composerHeight: 140 }).bottom).toBe(158);
  });
  it('measures each bar on its own: an unmeasured composer keeps the fallback while the bar is known', () => {
    expect(layerPadding({ kind: 'phone', barHeight: 120, composerHeight: 0 })).toEqual({ top: 148, bottom: 104 });
  });
});

describe('bar state', () => {
  it('is flat at the top (under 2 px) and shows its hairline once content has scrolled under it', () => {
    expect(FLAT_SCROLL_PX).toBe(2);
    expect(barIsFlat(0)).toBe(true);
    expect(barIsFlat(1.9)).toBe(true);
    expect(barIsFlat(2)).toBe(false);
    expect(barIsFlat(480)).toBe(false);
  });
});

/** MSG-307, MOT-KB-1: how tall the keyboard is, from visualViewport and the shell's published height. */
describe('keyboard height', () => {
  const web = { native: false, layoutHeight: 844, viewportHeight: 844, scale: 1, published: 0 };
  it('reads 0 with the whole screen visible', () => {
    expect(keyboardHeight(web)).toBe(0);
  });
  it('on the web is the layout viewport minus the visible area', () => {
    expect(keyboardHeight({ ...web, viewportHeight: 528 })).toBe(316);
  });
  it('on the web ignores a shrink under 120 px (Safari\'s toolbar collapsing is not a keyboard), even if the shell published it', () => {
    expect(KEYBOARD_MIN_PX).toBe(120);
    expect(keyboardHeight({ ...web, viewportHeight: 760, published: 84 })).toBe(0);
    expect(keyboardHeight({ ...web, viewportHeight: 725 })).toBe(0);
    expect(keyboardHeight({ ...web, viewportHeight: 724 })).toBe(120);
  });
  it('ignores a pinch-zoom: a zoomed visual viewport is smaller, not covered', () => {
    expect(keyboardHeight({ ...web, viewportHeight: 400, scale: 2 })).toBe(0);
    expect(keyboardHeight({ ...web, native: true, viewportHeight: 400, scale: 2, published: 300 })).toBe(0);
  });
  it('in the app takes keyboardWillShow\'s height as it is (a hardware keyboard\'s bar is short), or the viewport when it reports more', () => {
    expect(keyboardHeight({ native: true, layoutHeight: 844, viewportHeight: 844, scale: 1, published: 55 })).toBe(55);
    expect(keyboardHeight({ native: true, layoutHeight: 844, viewportHeight: 844, scale: 1, published: 336 })).toBe(336);
    expect(keyboardHeight({ native: true, layoutHeight: 844, viewportHeight: 520, scale: 1, published: 0 })).toBe(324);
    expect(keyboardHeight({ native: true, layoutHeight: 844, viewportHeight: 520, scale: 1, published: 336 })).toBe(336);
  });
  it('a missing visualViewport reads as nothing covered', () => {
    expect(keyboardHeight({ native: false, layoutHeight: 844, viewportHeight: 0, scale: 1, published: 316 })).toBe(0);
    expect(keyboardHeight({ native: false, layoutHeight: 844, viewportHeight: Number.NaN, scale: 1, published: 0 })).toBe(0);
  });
});

describe('ride lift', () => {
  it('is the keyboard minus the home indicator\'s padding that would have dropped (the artifact: 316 high, 294 lift)', () => {
    expect(rideLift(316, 30)).toBe(294);
    expect(rideLift(336, 8)).toBe(336);
    expect(rideLift(336, 4)).toBe(336);
  });
  it('is 0 with no keyboard, and never negative', () => {
    expect(rideLift(0, 30)).toBe(0);
    expect(rideLift(10, 60)).toBe(0);
  });
});

describe('ride shift (the list stays on the last message)', () => {
  it('opening at the bottom: the list starts low by the scroll the new floor caused', () => {
    expect(rideShift({ opening: true, atBottom: true, before: 1000, after: 1294 })).toBe(294);
  });
  it('opening while reading further up: the list does not move', () => {
    expect(rideShift({ opening: true, atBottom: false, before: 400, after: 400 })).toBe(0);
    expect(rideShift({ opening: true, atBottom: false, before: 400, after: 694 })).toBe(0);
  });
  it('closing: the list starts high by what the browser\'s clamp took off the scroll', () => {
    expect(rideShift({ opening: false, atBottom: true, before: 1294, after: 1000 })).toBe(-294);
    expect(rideShift({ opening: false, atBottom: false, before: 300, after: 300 })).toBe(0);
  });
  it('pins within 24 px of the end, not 60', () => {
    expect(pinnedToBottom(0)).toBe(true);
    expect(pinnedToBottom(23)).toBe(true);
    expect(pinnedToBottom(24)).toBe(false);
  });
});

describe('ride timing (MOT-KB-1)', () => {
  it('is the keyboard\'s 480 ms on cubic-bezier(0.32, 0.72, 0, 1), from the motion module', () => {
    expect(rideTiming(false)).toEqual({ ms: KEYBOARD_MS, easing: KEYBOARD_EASE });
    expect(KEYBOARD_MS).toBe(480);
    expect(KEYBOARD_EASE).toBe('cubic-bezier(0.32, 0.72, 0, 1)');
  });
  it('plays nothing under Reduce Motion (the composer is placed at once)', () => {
    expect(rideTiming(true)).toBeNull();
  });
});
