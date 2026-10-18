/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { chScrollsVertically, chWheelScroller } from '../lib/smooth-scroll';

/** A box with the given overflow and scroll sizes (jsdom lays nothing out, so the sizes are set by hand). */
function box(overflowY: string, sizes: { sh: number; ch: number; sw: number; cw: number; top?: number }, overflowX = overflowY, parent: HTMLElement = document.body): HTMLElement {
  const el = document.createElement('div');
  el.scrollTop = sizes.top ?? 0;
  el.style.overflowX = overflowX;
  el.style.overflowY = overflowY;
  Object.defineProperties(el, {
    scrollHeight: { value: sizes.sh },
    clientHeight: { value: sizes.ch },
    scrollWidth: { value: sizes.sw },
    clientWidth: { value: sizes.cw },
  });
  parent.appendChild(el);
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

describe('the wheel everywhere: which box a wheel scrolls', () => {
  const room = { sh: 1000, ch: 400, sw: 300, cw: 300 };

  it('the nearest box that scrolls up and down and has room that way', () => {
    const outer = box('auto', room);
    const inner = box('auto', room, 'auto', outer);
    const row = inner.appendChild(document.createElement('span'));
    expect(chWheelScroller(row, 1)).toBe(inner);
  });

  it('a box with no room left that way, in a box with none either, scrolls nothing; the other way it scrolls', () => {
    const outer = box('auto', room);
    const inner = box('auto', { ...room, top: 0 }, 'auto', outer);
    expect(chWheelScroller(inner, -1)).toBeNull();
    expect(chWheelScroller(inner, 1)).toBe(inner);
  });

  it('a box out of room that contains its overscroll (a modal body) stops the wheel there', () => {
    const outer = box('auto', room);
    const body = box('auto', { ...room, top: 600 }, 'auto', outer);
    body.style.overscrollBehaviorY = 'contain';
    expect(chWheelScroller(body, 1)).toBeNull();
  });

  it('a dialog is an edge: the page behind it never moves', () => {
    const page = box('auto', room);
    const dialog = page.appendChild(document.createElement('div'));
    dialog.setAttribute('role', 'dialog');
    const text = dialog.appendChild(document.createElement('p'));
    expect(chWheelScroller(text, 1)).toBeNull();
  });
});
