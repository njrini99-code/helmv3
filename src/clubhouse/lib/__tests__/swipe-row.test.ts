import { describe, expect, it } from 'vitest';
import { SWIPE_ACTION_PX, SWIPE_CLAIM_PX, swipeArmed, swipeAxis, swipeFullMark, swipeLanding, swipeOffset } from '../swipe-row';

const W = 390;
const both = { leading: true, trailing: true };

/** The swipe row's rules (C8, owner decision 14): claim, follow, full mark, landing. */
describe('swipe row rules', () => {
  it('claims an axis only past the slop, by the larger component', () => {
    expect(swipeAxis(SWIPE_CLAIM_PX - 1, 0)).toBeNull();
    expect(swipeAxis(12, 4)).toBe('x');
    expect(swipeAxis(4, 12)).toBe('y');
  });

  it('follows 1:1 up to the full mark, gives past it, and never opens a side with no action', () => {
    const full = swipeFullMark(W);
    expect(swipeOffset(80, W, both)).toBe(80);
    expect(swipeOffset(-80, W, both)).toBe(-80);
    expect(swipeOffset(full + 100, W, both)).toBeLessThan(full + 100);
    expect(swipeOffset(full + 100, W, both)).toBeGreaterThan(full);
    expect(swipeOffset(80, W, { leading: false, trailing: true })).toBe(0);
    expect(swipeOffset(-80, W, { leading: true, trailing: false })).toBe(0);
  });

  it('arms at the full mark, which is never under one and a half actions', () => {
    expect(swipeFullMark(100)).toBe(SWIPE_ACTION_PX * 1.5);
    expect(swipeArmed(swipeFullMark(W) - 1, W)).toBe(false);
    expect(swipeArmed(-swipeFullMark(W), W)).toBe(true);
  });

  it('lands where the throw carries it: shut, open on the action, or the full action', () => {
    expect(swipeLanding(0, 0, W)).toEqual({ kind: 'closed' });
    expect(swipeLanding(10, 0, W)).toEqual({ kind: 'closed' });
    expect(swipeLanding(50, 0, W)).toEqual({ kind: 'open', side: 'leading', offset: SWIPE_ACTION_PX });
    expect(swipeLanding(-50, 0, W)).toEqual({ kind: 'open', side: 'trailing', offset: -SWIPE_ACTION_PX });
    expect(swipeLanding(-swipeFullMark(W), 0, W)).toEqual({ kind: 'full', side: 'trailing' });
    expect(swipeLanding(120, 2, W)).toEqual({ kind: 'full', side: 'leading' });
  });

  it('a throw back toward shut never runs the action, however far the row had gone', () => {
    expect(swipeLanding(swipeFullMark(W) + 40, -5, W)).toEqual({ kind: 'closed' });
  });
});
