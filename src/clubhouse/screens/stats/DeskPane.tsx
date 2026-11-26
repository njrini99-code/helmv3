'use client';

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { BackLink } from '../../ui/Section';

/** The nearest ancestor that scrolls (the desktop canvas), or null when the page itself does. */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === 'auto' || o === 'scroll') return p;
  }
  return null;
}

/**
 * The desk's drill (Team stats and a player's stats), opened from a card across the page's whole width (look-09, Nick 21 Nov
 * 2026: "Full width, back to overview"). It replaces the overview, so its cards can stand two across, and Back (or Escape) returns
 * to the overview where it was left, with focus on the card that opened the drill. Nothing is pushed or written to the address.
 *
 * It opens at its top, or on the block the card named (`data-ch-anchor`).
 */
export function DeskDetail({
  detail,
  hash,
  title,
  back,
  anchor = null,
  onBack,
  controls = null,
  children,
}: {
  /** The drill showing: a new one opens at its top. */
  detail: string;
  /** The drill's address name, as the phone's pushed screen carries it. */
  hash: string;
  title: string;
  /** What Back returns to ("Overview"). */
  back: string;
  /** A block inside the drill to open on, when the card named one. */
  anchor?: string | null;
  onBack: () => void;
  /** The window switch and filter, which apply to the drill too. */
  controls?: ReactNode;
  children: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  const backRef = useRef<() => void>(onBack);
  backRef.current = onBack;

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const scroller = scrollerOf(el);
    const block = anchor ? el.querySelector<HTMLElement>(`[data-ch-anchor="${anchor}"]`) : null;
    if (block) {
      block.scrollIntoView({ block: 'start' });
    } else if (scroller) {
      scroller.scrollTop = 0;
    } else {
      window.scrollTo(0, 0);
    }
    el.querySelector<HTMLElement>('.ch-backlink')?.focus({ preventScroll: true });
  }, [detail, anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // A sheet, menu or popover open over the drill takes its own Escape.
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      backRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section ref={root} className="ch-shs-screen ch-shs-dfull" aria-labelledby="ch-shs-dfull-t" data-ch-shs-detail={hash}>
      <BackLink data-ctl="CTL-P004-002" className="ch-shs-dfull__back" onClick={onBack}>
        {back}
      </BackLink>
      <h2 id="ch-shs-dfull-t" className="ch-shs-dfull__t">
        {title}
      </h2>
      {controls}
      <div className="ch-shs-d-sheet ch-shs-d-sheet--body ch-shs-dfull__body">{children}</div>
    </section>
  );
}

/**
 * Where the overview was when a drill opened, so Back returns to it: the canvas's scroll and the card that was chosen.
 */
export function useDeskReturn() {
  const saved = useRef<{ top: number; card: string | null } | null>(null);
  const pending = useRef(false);
  const remember = (from: HTMLElement | null, card: string | null) => {
    const scroller = from ? scrollerOf(from) : null;
    saved.current = { top: scroller ? scroller.scrollTop : window.scrollY, card };
  };
  const returning = () => {
    pending.current = true;
  };
  /** Called by the overview once it has drawn again. */
  const restore = (from: HTMLElement | null) => {
    if (!pending.current || !saved.current || !from) return;
    pending.current = false;
    const { top, card } = saved.current;
    const scroller = scrollerOf(from);
    if (scroller) scroller.scrollTop = top;
    else window.scrollTo(0, top);
    if (card) from.querySelector<HTMLElement>(`[data-ch="stats-card"][data-go="${card}"] button, [data-ch="stats-card"][data-go="${card}"]`)?.focus({ preventScroll: true });
  };
  return { remember, returning, restore };
}

/** The desk's overview: the cards as a bento across the page. Once drawn it hands itself to `onDrawn`, which puts Back's return in place. */
export function DeskOverview({ onDrawn, children }: { onDrawn: (el: HTMLElement | null) => void; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => onDrawn(el.current), []);
  return (
    <div ref={el} className="ch-shs-desk__sum">
      {children}
    </div>
  );
}
