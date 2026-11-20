'use client';

import { CH_PHONE_QUERY } from '@/clubhouse/lib/phone-query';
import { useEffect, type RefObject } from 'react';

/**
 * The phone's large titles (iOS large-title behaviour, owner 2026-10-08 "cardless, native-feeling phone Clubhouse").
 * The bar's section switcher always shows (owner, 2026-10-16: on Stats it seemed gone while "Team stats" was in view).
 * A pushed page that opens with its own large title does not show its name twice: the bar's pushed title is hidden at
 * rest and fades in from 36 to 52px of scroll as the large title goes up under the bar (MOTION-AND-VISUAL 3.3). Pages
 * with no large title keep the bar's title.
 *
 * Which element is a page's large title is decided once, by one class: `.ch-large-title` (ui/LargeTitle.tsx, owner
 * decision 4, 2026-10-24: one 34 semibold sans title on every phone section root, CONS-27). The same class drives the
 * CSS (styles/shell.css, "Phone large titles"), whose `:has()` hides the bar's title from the first paint and, where
 * Safari has a scroll timeline, fades both titles from the scroll itself; this hook is the older phones' fallback for
 * those fades, and marks the bar's scroll edge. Every section root's loading
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

/**
 * The scroll over which the bar's title fades in (MOTION-AND-VISUAL 3.3; S4.3): from 36 to 52px, the last third of the
 * large title's way under the bar, so the page shows its name once, the large title or the bar's, never both at rest.
 */
export const CH_BAR_TITLE_RANGE = { from: 36, to: 52 } as const;

/** The bar title's opacity at scroll `y`: 0 until 36px, 1 from 52px, linear between. Scroll-linked, so no curve. */
export function barTitleOnScroll(y: number): number {
  const { from, to } = CH_BAR_TITLE_RANGE;
  return Math.min(1, Math.max(0, (y - from) / (to - from)));
}

/** The bar's pushed title, which a page's large title hides at rest (never the section switcher it may hold). */
function barTitleOf(bar: HTMLElement): HTMLElement | null {
  for (const el of Array.from(bar.querySelectorAll<HTMLElement>('.ch-topbar__pslot > .ch-pbar__title, .ch-topbar__pstand .ch-pbar__title'))) {
    if (!el.querySelector('.ch-sw')) return el;
  }
  return null;
}

/** Whether CSS drives the title's fade from the scroll itself (no script per frame). */
function scrollDriven(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('animation-timeline: scroll()');
}

/**
 * Watches the page's large title and the page's scroll for the shell's top bar `bar`, inside `canvas`. Marks the bar
 * `data-scrolled` once any content has scrolled under it (the bar's scroll edge), and, where CSS has no scroll timeline,
 * fades the large title out over 0 to 52px and the bar's title in over 36 to 52px from the scroll (MOTION-AND-VISUAL
 * 3.3). One passive scroll listener, read once a frame; a MutationObserver on the canvas finds the title again as pages
 * and their skeletons swap. Returns the teardown, which leaves the bar and the titles as it found them.
 */
export function watchLargeTitle(bar: HTMLElement, canvas: HTMLElement): () => void {
  let target: HTMLElement | null = null;
  /** The bar title the fallback last wrote, so a page swap or the teardown hands it back to the stylesheet. */
  let written: HTMLElement | null = null;
  let frame = 0;
  const cssFade = scrollDriven();
  const edgeNow = () => {
    frame = 0;
    const y = window.scrollY;
    const scrolled = y > REFRESH_EDGE_AT;
    if (bar.hasAttribute('data-scrolled') !== scrolled) bar.toggleAttribute('data-scrolled', scrolled);
    if (cssFade) return;
    if (target) {
      const opacity = titleOnScroll(y);
      target.style.opacity = opacity === 1 ? '' : String(opacity);
    }
    // The bar's title is hidden at rest by the stylesheet only on a page with a large title; elsewhere it is left alone.
    const title = target ? barTitleOf(bar) : null;
    if (written && written !== title) written.style.opacity = '';
    written = title;
    if (title) title.style.opacity = String(barTitleOnScroll(y));
  };
  const watch = () => {
    const next = findLargeTitle(canvas);
    if (next === target) return;
    if (target) target.style.opacity = '';
    target = next;
    edgeNow();
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
    window.removeEventListener('scroll', onScroll);
    if (frame) cancelAnimationFrame(frame);
    bar.removeAttribute('data-scrolled');
    if (target) target.style.opacity = '';
    if (written) written.style.opacity = '';
  };
}

/**
 * The desk page title (D16, owner 19 Nov 2026): the same elements the one desk title rule styles (styles/shell.css, "The
 * page head"), and a loading skeleton's head in their place, so the crumb is already hidden while a page loads and
 * nothing changes in the bar as it lands. A visually hidden heading or a dialog's title is not the page's.
 */
export const CH_DESK_TITLES = [
  'main[data-canopy] [data-canopy-head] h1',
  "main[data-ch-crh='on'].ch-rsd .ch-rs-head h1",
  'main h1[data-ch-large-title]',
  'main [data-ch-page-title]',
  "main[aria-busy='true'] [data-canopy-head]",
] as const;
const DESK_SELECTOR = CH_DESK_TITLES.join(', ');
const DESK_EXCLUDED = '.ch-sr-only, dialog, .ch-topbar';

/** The page's desk title inside `root`, or null when the page has none (its bar keeps its whole breadcrumb). */
export function findDeskTitle(root: ParentNode): HTMLElement | null {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(DESK_SELECTOR))) {
    if (el.closest(DESK_EXCLUDED)) continue;
    return el;
  }
  return null;
}

/** Whether the desk title has gone under the bar: its last line has passed the bar's bottom edge. */
export function deskTitleUnder(title: DOMRect, bar: DOMRect): boolean {
  return title.bottom <= bar.bottom;
}

/**
 * Row 41: the desktop bar's scroll edge. The canvas is the desktop scroller (Lenis eases its own scrollTop, so its
 * scroll events still fire), so the canvas's scroll, not the window's, marks the bar `data-scrolled` once content has
 * gone under it. One passive listener, read once a frame.
 *
 * The large-title collapse (D16, owner 19 Nov 2026; Apple's large title, Linear's toolbar title): on a page with a desk
 * title the bar's last crumb (the page's own name) is hidden while the title is in view (`data-desk-title="shown"`) and
 * comes in once the title has gone under the bar (`"under"`), so the page names itself once. A page with no desk title
 * leaves the attribute off and keeps its whole breadcrumb. A MutationObserver finds the title again as pages and their
 * skeletons swap; the first state on each page is set with no transition (`data-desk-title-first`, dropped a frame later,
 * as NavPlate's plate), so Back with a restored scroll never fades the crumb in. Returns the teardown, which leaves the
 * bar as it found it.
 */
export function watchCanvasScroll(bar: HTMLElement, canvas: HTMLElement): () => void {
  let frame = 0;
  let settle = 0;
  let title: HTMLElement | null = null;
  const titleNow = (first: boolean) => {
    const state = title ? (deskTitleUnder(title.getBoundingClientRect(), bar.getBoundingClientRect()) ? 'under' : 'shown') : null;
    if (bar.getAttribute('data-desk-title') === state) return;
    if (first) {
      bar.setAttribute('data-desk-title-first', '');
      if (settle) cancelAnimationFrame(settle);
      settle = requestAnimationFrame(() => {
        settle = requestAnimationFrame(() => {
          settle = 0;
          bar.removeAttribute('data-desk-title-first');
        });
      });
    }
    if (state) bar.setAttribute('data-desk-title', state);
    else bar.removeAttribute('data-desk-title');
  };
  const edgeNow = () => {
    frame = 0;
    bar.toggleAttribute('data-scrolled', canvas.scrollTop > 0);
    titleNow(false);
  };
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(edgeNow);
  };
  const watch = () => {
    const next = findDeskTitle(canvas);
    if (next === title) return;
    title = next;
    titleNow(true);
  };
  // In the mutation's own microtask, before the frame paints, so a page's title and the bar change together.
  const mo = new MutationObserver(watch);
  mo.observe(canvas, { childList: true, subtree: true });
  canvas.addEventListener('scroll', onScroll, { passive: true });
  watch();
  edgeNow();
  return () => {
    mo.disconnect();
    canvas.removeEventListener('scroll', onScroll);
    if (frame) cancelAnimationFrame(frame);
    if (settle) cancelAnimationFrame(settle);
    bar.removeAttribute('data-scrolled');
    bar.removeAttribute('data-desk-title');
    bar.removeAttribute('data-desk-title-first');
  };
}

/**
 * `watchLargeTitle` for the shell's top bar on the phone, and `watchCanvasScroll` (the scroll edge only) on desktop; a
 * resize across 820px swaps them. The titles' fades follow the scroll, so they are the same under Reduce Motion.
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
