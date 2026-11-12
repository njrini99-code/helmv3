'use client';

import { useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from 'react';

/** Under a pixel of travel is rounding, not more to scroll to. */
const SLACK = 1;

const mark = (el: HTMLElement, name: 'start' | 'end', more: boolean) => {
  if (more) el.dataset[name] = 'true';
  else delete el.dataset[name];
};

/**
 * For a row or table that scrolls sideways: sets `data-start` while content is hidden before the visible part and
 * `data-end` while it is hidden after, so `.ch-hscroll` (ui.css) fades only the edge that is clipping something. Nothing is
 * drawn at rest, and nothing re-renders: the attributes are written straight to the element as it scrolls, as the
 * element resizes, and as children come and go. Returns the ref to put on the scroller; pass `own` to keep a ref the
 * component already holds on it.
 */
export function useHScroll<T extends HTMLElement>(own?: MutableRefObject<T | null>) {
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  return useCallback(
    (el: T | null) => {
      stop.current?.();
      stop.current = null;
      if (own) own.current = el;
      if (!el) return;
      const sync = () => {
        mark(el, 'start', el.scrollLeft > SLACK);
        mark(el, 'end', el.scrollWidth - el.clientWidth - el.scrollLeft > SLACK);
      };
      const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
      const watch = () => {
        if (!resize) return;
        resize.disconnect();
        resize.observe(el);
        for (const child of Array.from(el.children)) resize.observe(child);
      };
      const children = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => (watch(), sync()));
      el.addEventListener('scroll', sync, { passive: true });
      children?.observe(el, { childList: true });
      watch();
      sync();
      stop.current = () => {
        el.removeEventListener('scroll', sync);
        resize?.disconnect();
        children?.disconnect();
        delete el.dataset.start;
        delete el.dataset.end;
      };
    },
    [own],
  );
}

/** The least a kept item stands off the row's edge, and how far past the fade it stands where the edge fades. */
const KEEP_MIN = 16;
const KEEP_PAST_FADE = 4;

/**
 * For a tab or chip row that scrolls sideways: the chosen item (`selector`, inside `row`) is always whole and clear of
 * the fading edge. The row jumps there when it first shows and glides on a later choice (`key` is what was chosen;
 * `reduced` jumps every time). It holds through anything that resizes the row afterwards (the web font landing, a count
 * arriving, Text Size, a turn of the phone), which left the chosen tab cut at the screen's edge when the row was only
 * placed once. A row that fits is left alone.
 */
export function useKeepInView(row: RefObject<HTMLElement | null>, selector: string, key: unknown, reduced: boolean): void {
  const placed = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const reveal = (glide: boolean) => {
      const on = el.querySelector<HTMLElement>(selector);
      const most = el.scrollWidth - el.clientWidth;
      if (!on || most <= SLACK) return;
      const fade = parseFloat(getComputedStyle(el).getPropertyValue('--ch-hs-fade')) || 0;
      const clear = Math.max(KEEP_MIN, fade + KEEP_PAST_FADE);
      const r = el.getBoundingClientRect();
      const b = on.getBoundingClientRect();
      const by = b.left < r.left + clear ? b.left - r.left - clear : b.right > r.right - clear ? b.right - r.right + clear : 0;
      const left = Math.min(most, Math.max(0, el.scrollLeft + by));
      if (Math.abs(left - el.scrollLeft) > SLACK) el.scrollTo({ left, behavior: glide ? 'smooth' : 'auto' });
    };
    const first = placed.current !== el;
    placed.current = el;
    reveal(!first && !reduced);
    if (typeof ResizeObserver === 'undefined') return;
    let size = `${el.clientWidth}/${el.scrollWidth}`;
    const resize = new ResizeObserver(() => {
      const now = `${el.clientWidth}/${el.scrollWidth}`;
      if (now === size) return;
      size = now;
      reveal(false);
    });
    resize.observe(el);
    for (const child of Array.from(el.children)) resize.observe(child);
    return () => resize.disconnect();
  }, [row, selector, key, reduced]);
}
