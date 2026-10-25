'use client';

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { haptic } from '../lib/haptics';

/**
 * P006-B2, B18: a page that turns left and right with the phone's own momentum (scroll-snap, one page a swipe), and a
 * selection tick once a page settles. Three pages: the one before, the one on show, the one after. When a neighbour
 * settles, `onSettle` gets its way (-1 or 1); the caller moves `pageKey` on and the pager recentres, so the swipe never
 * runs out. The neighbours are clipped to the page's height (`--ch-pager-page-h`) and are inert: only the page on show
 * is read or tapped. The calendar's day and the week strip page with it.
 */
export function ScrollPager({
  pageKey,
  onSettle,
  prev,
  next,
  children,
  className,
  pageClassName,
  label,
  frozen = false,
}: {
  pageKey: string;
  onSettle: (dir: -1 | 1) => void;
  prev: ReactNode;
  next: ReactNode;
  children: ReactNode;
  className: string;
  pageClassName: string;
  label?: string;
  /** P-4: a drag holds the page still (no paging under a lifted card); `data-frozen` turns the scroll off. */
  frozen?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mid = useRef<HTMLElement | null>(null);
  const settle = useRef(onSettle);
  settle.current = onSettle;
  const still = useRef(frozen);
  still.current = frozen;
  // On the page, before paint: a recentre never shows as a jump.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.clientWidth;
  }, [pageKey]);
  useEffect(() => {
    const el = ref.current;
    const m = mid.current;
    if (!el || !m) return;
    const fit = new ResizeObserver(() => el.style.setProperty('--ch-pager-page-h', `${m.offsetHeight}px`));
    fit.observe(m);
    let timer = 0;
    const done = () => {
      window.clearTimeout(timer);
      const w = el.clientWidth;
      if (!w || still.current) return;
      const i = Math.round(el.scrollLeft / w);
      if (i === 1 || Math.abs(el.scrollLeft - i * w) > 2) return;
      haptic('select');
      settle.current(i === 0 ? -1 : 1);
    };
    // `scrollend` where WebKit has it; else the scroll going quiet.
    const quiet = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(done, 140);
    };
    const hasEnd = 'onscrollend' in window;
    el.addEventListener(hasEnd ? 'scrollend' : 'scroll', hasEnd ? done : quiet, { passive: true });
    return () => {
      fit.disconnect();
      window.clearTimeout(timer);
      el.removeEventListener(hasEnd ? 'scrollend' : 'scroll', hasEnd ? done : quiet);
    };
  }, []);
  return (
    <div className={className} ref={ref} data-frozen={frozen ? '' : undefined}>
      <section className={`${pageClassName} is-side`} inert aria-hidden="true">
        {prev}
      </section>
      <section className={pageClassName} ref={mid} aria-label={label}>
        {children}
      </section>
      <section className={`${pageClassName} is-side`} inert aria-hidden="true">
        {next}
      </section>
    </div>
  );
}
