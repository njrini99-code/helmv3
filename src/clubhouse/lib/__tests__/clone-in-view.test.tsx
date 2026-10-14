import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloneInView } from '../nav-motion';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

/** Lays out `#page`'s blocks at the given tops (each 100 tall), as the window would see them. */
function page(tops: Record<string, number>) {
  document.body.innerHTML = `<div id="page"><section id="a"><p id="a1">a1</p><p id="a2">a2</p></section><section id="b"></section><section id="c"></section></div>`;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const top = tops[this.id] ?? 0;
    return { top, bottom: top + 100, height: 100, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
  return document.getElementById('page')!;
}

describe('cloneInView (the back pop copy)', () => {
  it('leaves out blocks wholly below the window and keeps everything above it', () => {
    const copy = cloneInView(page({ a: -150, a1: -150, a2: -50, b: 300, c: 900 }), 800, 4);
    expect(Array.from(copy.children).map((el) => el.id)).toEqual(['a', 'b']);
    expect(copy.querySelector('#a')!.children).toHaveLength(2);
  });

  it('splits a block reaching past the foot of the window, down to the depth given', () => {
    const tall = page({ a: 750, a1: 750, a2: 850, b: 900, c: 1000 });
    expect(Array.from(cloneInView(tall, 800, 4).querySelector('#a')!.children).map((el) => el.id)).toEqual(['a1']);
    expect(cloneInView(tall, 800, 1).querySelector('#a')!.children).toHaveLength(2);
  });

  it('copies the source without changing it', () => {
    const src = page({ a: 0, b: 900, c: 1000 });
    cloneInView(src, 800, 4);
    expect(src.children).toHaveLength(3);
  });
});
