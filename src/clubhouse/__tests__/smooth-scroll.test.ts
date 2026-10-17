/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { chScrollsVertically } from '../lib/smooth-scroll';

/** A box with the given overflow and scroll sizes (jsdom lays nothing out, so the sizes are set by hand). */
function box(overflowY: string, sizes: { sh: number; ch: number; sw: number; cw: number }, overflowX = overflowY): HTMLElement {
  const el = document.createElement('div');
  el.style.overflowX = overflowX;
  el.style.overflowY = overflowY;
  Object.defineProperties(el, {
    scrollHeight: { value: sizes.sh },
    clientHeight: { value: sizes.ch },
    scrollWidth: { value: sizes.sw },
    clientWidth: { value: sizes.cw },
  });
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('canvas smooth scroll: which nested boxes keep the wheel', () => {
  it('a box that scrolls up and down keeps it', () => {
    expect(chScrollsVertically(box('auto', { sh: 600, ch: 264, sw: 300, cw: 300 }))).toBe(true);
  });

  it('a wide table that only scrolls sideways does not, so the canvas eases under it (Stats, Rounds)', () => {
    // overflow-x: auto computes overflow-y to auto as well.
    expect(chScrollsVertically(box('auto', { sh: 400, ch: 400, sw: 900, cw: 600 }))).toBe(false);
  });

  it('a box that is not a scroller does not, whatever its content', () => {
    expect(chScrollsVertically(box('visible', { sh: 800, ch: 200, sw: 300, cw: 300 }))).toBe(false);
    expect(chScrollsVertically(box('hidden', { sh: 800, ch: 200, sw: 300, cw: 300 }))).toBe(false);
  });
});
