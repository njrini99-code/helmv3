'use client';

import { useEffect, type RefObject } from 'react';

/**
 * The phone's large titles (iOS large-title behaviour, owner 2026-10-08 "cardless, native-feeling phone Clubhouse").
 * A page that opens with its own large title ("Roster", "Lineup decisions", "Team stats") no longer shows its name
 * twice: while the large title is in view the bar's title is hidden, and as the large title scrolls up under the bar
 * the bar's title fades in. Pages with no large title keep the bar's title.
 *
 * Which element is a page's large title is decided here, once, rather than on each screen: a screen can opt in with
 * `data-ch-large-title`, and the screens that already draw one are listed by their own title class. The same list
 * drives the CSS (styles/shell.css, "Phone large titles"), whose `:has()` hides the bar's title from the first paint;
 * this hook only adds `data-large-title="tucked"` to the bar once the title has gone under it. A skeleton that draws
 * the title's block (Settings, Recruiting) matches too, so the bar does not show a title and then lose it.
 *
 * Calendar's month, a round's course and a qualifier's name are deliberately not here: they are the content's
 * heading, not the page's name, and the bar keeps "Calendar", "Round" and "Qualifier" over them.
 */
export const CH_LARGE_TITLES = [
  '[data-ch-large-title]',
  '.ch-rsm-title',
  '.ch-recm-title',
  '.ch-setm-title',
  '.ch-qf-head h1',
  '.ch-rd-h h1',
  '.ch-hl-h__t',
  '.ch-stm-head h1',
] as const;

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

const PHONE = '(max-width: 820px)';

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
  const edgeNow = () => {
    frame = 0;
    bar.toggleAttribute('data-scrolled', window.scrollY > 0);
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
  };
}

/**
 * `watchLargeTitle` for the shell's top bar, on the phone only (desktop never runs it; a resize across 820px starts or
 * stops it). The fade is CSS on the D-64 quick duration; reduced motion and Animations off swap at once.
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
      if (mql.matches && el && canvas) stop = watchLargeTitle(el, canvas);
    };
    start();
    mql.addEventListener('change', start);
    return () => {
      mql.removeEventListener('change', start);
      stop();
    };
  }, [bar]);
}
