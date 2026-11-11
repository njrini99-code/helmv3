'use client';

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { chScrollIntoView } from '../../lib/smooth-scroll';

/** The nearest ancestor that scrolls (the desktop canvas), or null when the page itself does. */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === 'auto' || o === 'scroll') return p;
  }
  return null;
}

/**
 * The desk's drill pane (Team stats and a player's stats): the chosen card's detail, standing beside the cards.
 *
 * It is as tall as what it holds and never scrolls inside itself, so it ends on a whole card. A pane shorter than the window rests
 * under the top bar. A taller one travels with the page: going down it moves until its last card is in view and holds there, going
 * up it moves until its title is back under the bar. Both holds are `position: sticky` (styles/stats-redesign.css); this only says
 * which edge holds, when the scroll turns round, and sets the pane's place in its column so the turn moves nothing. When the pane
 * is the longer column, the cards hold at their last one the same way, so no blank canvas stands beside the pane's end.
 *
 * Choosing a card opens its drill at the top (or on the block the card named), under the bar, wherever the page is: beside the
 * card that was chosen, never back at the head of the page.
 */
export function DeskPane({
  detail,
  hash,
  title,
  anchor = null,
  children,
}: {
  /** The drill showing: a new one opens at its top. */
  detail: string;
  /** The drill's address name, as the phone's pushed screen carries it. */
  hash: string;
  title: string;
  /** A block inside the drill to open on (`data-ch-anchor`), when the card named one. */
  anchor?: string | null;
  children: ReactNode;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const lead = useRef<HTMLSpanElement>(null);
  const pane = useRef<HTMLElement>(null);
  const turn = useRef<{ dir: 'down' | 'up'; last: number }>({ dir: 'down', last: 0 });
  const opened = useRef(false);
  const reduced = useChReducedMotion();

  useEffect(() => {
    const railEl = rail.current;
    const leadEl = lead.current;
    const paneEl = pane.current;
    if (!railEl || !leadEl || !paneEl) return;
    const scroller = scrollerOf(railEl);
    const at = () => (scroller ? scroller.scrollTop : window.scrollY);
    // The cards beside the pane, and the row both stand in: the row carries the three heights its two columns hold against.
    const cards = railEl.previousElementSibling as HTMLElement | null;
    const row = railEl.parentElement ?? railEl;
    const measure = () => {
      row.style.setProperty('--ch-shs-pane-h', `${paneEl.offsetHeight}px`);
      row.style.setProperty('--ch-shs-sum-h', `${cards?.offsetHeight ?? 0}px`);
      row.style.setProperty('--ch-shs-port-h', `${scroller ? scroller.clientHeight : window.innerHeight}px`);
    };
    measure();
    const sizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    sizes?.observe(paneEl);
    if (cards) sizes?.observe(cards);
    if (scroller) sizes?.observe(scroller);
    turn.current.last = at();
    const onScroll = () => {
      const now = at();
      const t = turn.current;
      const dir = now > t.last ? 'down' : now < t.last ? 'up' : t.dir;
      t.last = now;
      if (dir === t.dir) return;
      t.dir = dir;
      // Where the pane stands now becomes its place in the column, so handing the hold to the other edge moves nothing.
      leadEl.style.height = `${Math.max(0, paneEl.getBoundingClientRect().top - railEl.getBoundingClientRect().top)}px`;
      railEl.dataset.dir = dir;
    };
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      sizes?.disconnect();
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
    };
  }, []);

  useLayoutEffect(() => {
    // The first drill is where the page put it; only a choice moves the pane.
    if (!opened.current) {
      opened.current = true;
      return;
    }
    const railEl = rail.current;
    const leadEl = lead.current;
    const paneEl = pane.current;
    if (!railEl || !leadEl || !paneEl) return;
    const scroller = scrollerOf(railEl);
    const block = anchor ? paneEl.querySelector<HTMLElement>(`[data-ch-anchor="${anchor}"]`) : null;
    const rest = parseFloat(getComputedStyle(paneEl).scrollMarginTop) || 0;
    const portTop = scroller ? scroller.getBoundingClientRect().top : 0;
    // Under the bar, measured down the column; less the block's own depth in the pane when the card named one.
    const want = portTop + rest - railEl.getBoundingClientRect().top - (block ? Math.max(0, block.offsetTop - 12) : 0);
    // A drill longer than what is left of the page makes the page longer: it is read from its top, beside the card that opened it.
    leadEl.style.height = `${Math.max(0, want)}px`;
    (railEl.parentElement ?? railEl).style.setProperty('--ch-shs-pane-h', `${paneEl.offsetHeight}px`);
    railEl.dataset.dir = 'down';
    turn.current = { dir: 'down', last: scroller ? scroller.scrollTop : window.scrollY };
    const shown = block ?? paneEl;
    const top = shown.getBoundingClientRect().top - portTop;
    const port = scroller ? scroller.clientHeight : window.innerHeight;
    if (top < rest - 1 || top > port - 96) chScrollIntoView(shown, reduced);
    // Only a choice re-places the pane: a change of the motion setting is not one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, anchor]);

  return (
    <div ref={rail} className="ch-shs-desk__rail">
      <span ref={lead} className="ch-shs-desk__lead" aria-hidden="true" />
      <aside ref={pane} className="ch-shs-screen ch-shs-desk__det" aria-labelledby="ch-shs-desk-det-t" data-ch-shs-detail={hash}>
        <h2 id="ch-shs-desk-det-t" className="ch-shs-desk__dett">
          {title}
        </h2>
        <div className="ch-shs-d-sheet ch-shs-d-sheet--body">{children}</div>
      </aside>
    </div>
  );
}
