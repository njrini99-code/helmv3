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
/** Refresh: how far a large title shrinks as it scrolls under the bar (DESIGN_LANGUAGE 5, 8). */
const REFRESH_TITLE_MIN_SCALE = 0.86;

/** Refresh: the scroll over which it does (classes-roster-home 08 #10). */
const REFRESH_TITLE_RANGE = 56;
const REFRESH_TITLE_MIN_OPACITY = 0.1;

/** The large title at scroll `y`: over the first 56px it shrinks to 86% and fades to 10%. Reduced: it fades only. Scroll-linked, so no curve. */
export function titleOnScroll(y: number, reduced: boolean): { scale: number; opacity: number } {
  const p = Math.min(1, Math.max(0, y / REFRESH_TITLE_RANGE));
  return { scale: reduced ? 1 : 1 - (1 - REFRESH_TITLE_MIN_SCALE) * p, opacity: 1 - (1 - REFRESH_TITLE_MIN_OPACITY) * p };
}

function motionAllowed(el: Element): boolean {
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return !el.closest("[data-motion='off']");
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
  // clubhouse_refresh_v1 (PR 3): the root's attribute, read once here; off, nothing below touches the title and the edge shows at 0.
  const refresh = !!canvas.closest("[data-ch-refresh='on']");
  const edgeNow = () => {
    frame = 0;
    const y = window.scrollY;
    bar.toggleAttribute('data-scrolled', y > (refresh ? REFRESH_EDGE_AT : 0));
    if (refresh && target) {
      const { scale, opacity } = titleOnScroll(y, !motionAllowed(canvas));
      target.style.scale = scale === 1 ? '' : String(scale);
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
    if (refresh && target) {
      target.style.scale = '';
      target.style.opacity = '';
    }
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
