import { describe, expect, it } from 'vitest';
import { dragOffset, TIMES_DRAG_PX } from '../use-thread-drag-times';

describe('drag for times', () => {
  it('follows at 60% to the left and stops at 58', () => {
    expect(dragOffset(-50, TIMES_DRAG_PX)).toBe(-30);
    expect(dragOffset(-500, TIMES_DRAG_PX)).toBe(-TIMES_DRAG_PX);
  });
  it('does nothing to the right', () => {
    expect(dragOffset(40, TIMES_DRAG_PX)).toBe(0);
  });
});
