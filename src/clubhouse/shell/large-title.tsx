'use client';

import { CH_PHONE_QUERY } from '@/clubhouse/lib/phone-query';
import { useEffect, type RefObject } from 'react';

/**
 * The phone's large titles (iOS large-title behaviour, owner 2026-10-08 "cardless, native-feeling phone Clubhouse").
 * The bar's section switcher always shows (owner, 2026-10-16: on Stats it seemed gone while "Team stats" was in view).
 * A pushed page that opens with its own large title does not show its name twice: while the large title is in view
 * the bar's pushed title is hidden, and as the large title scrolls up under the bar it fades in. Pages with no large
 * title keep the bar's title.
 *
 * Which element is a page's large title is decided once, by one class: `.ch-large-title` (ui/LargeTitle.tsx, owner
 * decision 4, 2026-10-24: one 34 semibold sans title on every phone section root, CONS-27). The same class drives the
 * CSS (styles/shell.css, "Phone large titles"), whose `:has()` hides the bar's title from the first paint; this hook
 * only adds `data-large-title="tucked"` to the bar once the title has gone under it. Every section root's loading
 * skeleton draws the same title block (ui/LargeTitle.tsx LargeTitleSkeleton, CONS-13), so the bar's title stays hidden
 * from the skeleton to the page and nothing flickers as the page lands.
 *
 * Home's greeting (its green hero swaps its own title), Calendar's month, a round's course and a qualifier's name are
 * deliberately not large titles: the hero is Home's own head, and the others are the content's heading, not the page's
 * name, so the bar keeps "Calendar", "Round" and "Qualifier" over them.
 */
export const CH_LARGE_TITLES = ['.ch-large-title'] as const;

const SELECTOR = CH_LARGE_TITLES.join(', ');
/** Never a large title: a visually hidden heading, or one inside a pushed screen or a dialog (they have their own bar). */
const EXCLUDED = '.ch-sr-only, .ch-pscreen, dialog, .ch-topbar';

/** The page's large title inside `root`, or null when the page has none (its bar keeps its title). */
export function findLargeTitle(root: ParentNode): HTMLElement | null {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(SELECTOR))) {
    if (el.closest(EXCLUDED)) continue;
    return el;
  }
  return null;
}

/**
 * Whether a large title has gone up under the bar: it no longer shows below the bar's bottom edge, and it is above
 * that edge rather than below the fold.
 */
export function isTucked(entry: Pick<IntersectionObserverEntry, 'isIntersecting' | 'boundingClientRect'>, barBottom: number): boolean {
  return !entry.isIntersecting && entry.boundingClientRect.bottom <= barBottom + 1;
}

const PHONE = CH_PHONE_QUERY;

/** Refresh: the shade under the bar waits for 8px of scroll (DESIGN_LANGUAGE 5). */
const REFRESH_EDGE_AT = 8;
/**
 * The scroll over which a large title goes under the bar (production audit 2026-11-15, S4.3): the bar's 44pt collapsed
 * and about 96pt expanded, so 52px. It fades as it goes and never scales (the 0.86 shrink is gone, MOT-06: an iOS
 * large title scrolls with the content, it is not scaled by a script). Where Safari runs scroll-driven animations (26 and
 * later) the fade is CSS on the scroll timeline (styles/shell.css, "ch-lt-under"); this is the older phones' fallback.
 */
export const CH_LARGE_TITLE_RANGE = 52;
const REFRESH_TITLE_MIN_OPACITY = 0.1;

/** The large title's opacity at scroll `y`: over the first 52px it fades to 10%. Scroll-linked, so no curve, and the same
 *  under Reduce Motion (S4.9: the person's own scroll drives it). */
export function titleOnScroll(y: number): number {
  const p = Math.min(1, Math.max(0, y / CH_LARGE_TITLE_RANGE));
  return 1 - (1 - REFRESH_TITLE_MIN_OPACITY) * p;
}

/** Whether CSS drives the title's fade from the scroll itself (no script per frame). */
function scrollDriven(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('animation-timeline: scroll()');
}

/**
 * Watches the page's large title and the page's scroll for the shell's top bar `bar`, inside `canvas`. Sets on the
 * bar `data-large-title="tucked"` once the large title is under it (the bar's title fades in), and `data-scrolled`
 * once any content has scrolled under it (the bar's scroll edge). One IntersectionObserver on the title and one
 * passive scroll listener; a MutationObserver on the canvas finds the title again as pages and their skeletons swap.
 * Returns the teardown, which leaves the bar as it found it.
 */
export function watchLargeTitle(bar: HTMLElement, canvas: HTMLElement): () => void {
  let target: HTMLElement | null = null;
  let io: IntersectionObserver | null = null;
  const setTucked = (on: boolean) => {
    if (on) bar.setAttribute('data-large-title', 'tucked');
    else bar.removeAttribute('data-large-title');
  };
  const watch = () => {
    const next = findLargeTitle(canvas);
    if (next === target) return;
    io?.disconnect();
    io = null;
    target = next;
    // A new page starts with its title in view; the observer's first report corrects a restored scroll.
    setTucked(false);
    if (!next || typeof IntersectionObserver === 'undefined') return;
    const edge = Math.max(0, Math.round(bar.getBoundingClientRect().bottom));
    io = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        if (e) setTucked(isTucked(e, e.rootBounds?.top ?? edge));
      },
      { rootMargin: `-${edge}px 0px 0px 0px`, threshold: 0 },
    );
    io.observe(next);
  };
  let frame = 0;
  const cssFade = scrollDriven();
  const edgeNow = () => {
    frame = 0;
    const y = window.scrollY;
    const scrolled = y > REFRESH_EDGE_AT;
    if (bar.hasAttribute('data-scrolled') !== scrolled) bar.toggleAttribute('data-scrolled', scrolled);
    if (target && !cssFade) {
      const opacity = titleOnScroll(y);
      target.style.opacity = opacity === 1 ? '' : String(opacity);
    }
  };
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(edgeNow);
  };
  // In the mutation's own microtask, before the frame paints, so a page's title and the bar change together.
  const mo = new MutationObserver(watch);
  mo.observe(canvas, { childList: true, subtree: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  watch();
  edgeNow();
  return () => {
    mo.disconnect();
    io?.disconnect();
    window.removeEventListener('scroll', onScroll);
    if (frame) cancelAnimationFrame(frame);
    bar.removeAttribute('data-large-title');
    bar.removeAttribute('data-scrolled');
    if (target) target.style.opacity = '';
  };
}

/**
 * Row 41: the desktop bar's scroll edge. The canvas is the desktop scroller (Lenis eases its own scrollTop, so its
 * scroll events still fire), so the canvas's scroll, not the window's, marks the bar `data-scrolled` once content has
 * gone under it. One passive listener, read once a frame. Returns the teardown, which leaves the bar as it found it.
 */
export function watchCanvasScroll(bar: HTMLElement, canvas: HTMLElement): () => void {
  let frame = 0;
  const edgeNow = () => {
    frame = 0;
    bar.toggleAttribute('data-scrolled', canvas.scrollTop > 0);
  };
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(edgeNow);
  };
  canvas.addEventListener('scroll', onScroll, { passive: true });
  edgeNow();
  return () => {
    canvas.removeEventListener('scroll', onScroll);
    if (frame) cancelAnimationFrame(frame);
    bar.removeAttribute('data-scrolled');
  };
}

/**
 * `watchLargeTitle` for the shell's top bar on the phone, and `watchCanvasScroll` (the scroll edge only) on desktop; a
 * resize across 820px swaps them. The fade is CSS on the D-64 quick duration; reduced motion and Animations off swap at
 * once.
 */
export function usePhoneLargeTitle(bar: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const mql = window.matchMedia(PHONE);
    let stop = () => {};
    const start = () => {
      stop();
      stop = () => {};
      const el = bar.current;
      const canvas = document.getElementById('ch-canvas');
      if (el && canvas) stop = mql.matches ? watchLargeTitle(el, canvas) : watchCanvasScroll(el, canvas);
    };
    start();
    mql.addEventListener('change', start);
    return () => {
      mql.removeEventListener('change', start);
      stop();
    };
  }, [bar]);
}
