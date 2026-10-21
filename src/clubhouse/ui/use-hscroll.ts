'use client';

import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';

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
