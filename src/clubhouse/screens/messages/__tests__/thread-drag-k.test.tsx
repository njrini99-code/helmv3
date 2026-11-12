import { describe, expect, it } from 'vitest';
import { readTypeK } from '../../../lib/type-k';
import { TIMES_DRAG_PX } from '../use-thread-drag-times';

describe('drag for times at the reader’s Text Size (MOB-MSG-8)', () => {
  it('reaches as far as the time column is placed', () => {
    const el = document.createElement('div');
    el.style.setProperty('--ch-type-scale', '1.353');
    document.body.appendChild(el);
    expect(TIMES_DRAG_PX * readTypeK(el)).toBeCloseTo(78.5, 0);
  });
  it('is one at the default', () => {
    expect(readTypeK(document.body)).toBe(1);
  });
});
