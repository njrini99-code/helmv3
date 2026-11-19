'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { m, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react';
import { useCallback, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { haptic } from '../lib/haptics';
import { useChReducedMotion } from '../lib/reduced-motion';
import { useSlidePlate } from '../lib/slide-plate';
import { LinkPending } from './LinkPending';
import { navLinkPrefetch } from './link-prefetch';
import { CH_PHONE_TABS, type ChRole } from './nav';
import { usePhoneChromeState } from './phone-chrome';
import { useSectionSwitch } from './section-switch';
import { useIdleRowsAhead, usePrefetchTabs } from './use-prefetch-tabs';

/**
 * The section strip (CH-1808, docs/clubhouse/phone/section-strip.md): every section as a pill in one row that slides
 * out from under the top bar, the current one centred on the green plate, and last the account pill. It rides the
 * switcher's `progress`, so a tap springs it and a pull on the bar moves it with the finger; its pills fade with it as
 * one group. Shut, it is hidden and inert, but its links stay in the document: the navigation classifier reads them as
 * the phone's section roots (lib/nav-motion.ts). The page behind is not dimmed; a tap anywhere off the strip closes it.
 * Phone only.
 */
export function SectionStrip({ pathname, role, user }: { pathname: string; role: ChRole; user?: { name: string } }) {
  const sw = useSectionSwitch();
  const router = useRouter();
  const reduced = useChReducedMotion();
  const { immersive, noTabs } = usePhoneChromeState();
  const row = useRef<HTMLDivElement>(null);
  const [shut, setShut] = useState(true);
  const shutRef = useRef(true);
  const zero = useMotionValue(0);
  const progress = sw?.progress ?? zero;
  const y = useTransform(progress, (p) => `${(Math.min(Math.max(p, 0), 1) - 1) * 100}%`);
  const fade = useTransform(progress, [0, 0.4, 1], [0, 0.55, 1]);

  // The first sections are fetched whole ahead of the tap (P0-2), as the tab bar's were, and so are the last two others
  // visited, for the way back. At every width (the frame mounts the strip at every width): the desktop sidebar's first
  // links are the same sections, and a switch there waited on the server for the whole page (owner, desktop Safari,
  // 2026-10-16).
  // The switch's sections are already the rebuilt ones for this role and its features (phoneSectionsFor). Filtered again
  // here without the features, Tournaments (golf_tournaments_v1) was never fetched ahead, so a revisit drew its skeleton
  // for 600 ms (E-3, audit 2026-11-19).
  const rebuiltSections = sw?.sections ?? [];
  usePrefetchTabs(
    rebuiltSections.filter((s) => CH_PHONE_TABS[role].includes(s.id)).map((s) => s.href),
    pathname,
    rebuiltSections.map((s) => s.href),
  );
  // And the first few rows on each page, while it is idle (row 13).
  useIdleRowsAhead(pathname);

  /** The current pill in the middle of the row, so it is under the finger that opened it. */
  const centre = useCallback(() => {
    const el = row.current;
    const on = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !on) return;
    // A choice held the row still while the strip shut (F-0046); opening again lets it snap.
    delete el.dataset.holding;
    el.scrollLeft = on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2;
  }, []);

  // Shut is a state only at its edge, so the strip is hidden and inert at rest and never re-renders per frame. As it
  // starts out, the row is centred in that same frame, before it is seen.
  useMotionValueEvent(progress, 'change', (p) => {
    const now = p <= 0.001;
    if (now === shutRef.current) return;
    shutRef.current = now;
    if (!now) centre();
    setShut(now);
  });
  useLayoutEffect(() => {
    if (sw?.open) centre();
  }, [sw?.open, centre]);

  // The plate slides from the pill it left to the one chosen, on the compositor (lib/slide-plate.ts): 260 ms on the iOS
  // curve, a translate with the width change drawn by a rounded clip (MOTION-AND-VISUAL 3.3; MAC-17; F-29: no layout property
  // animated), each label taking its ink as the plate
  // crosses it. The page under it swaps at once.
  useSlidePlate(row, '[aria-current="page"] > .ch-strip__plate', sw?.shown?.id ?? null, { reduced, still: () => shutRef.current, tween: 'thumb', ink: '.ch-strip__pill' });

  if (!sw?.enabled) return null;

  /**
   * Tapping the open section closes the strip and does what a retapped tab did (CH-1907; MOTION-AND-VISUAL 3.3): pop, or
   * scroll the page to the top, smoothly unless Reduce Motion is on.
   */
  const retap = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    sw.setOpen(false);
    const level = (window.history.state as { chPhone?: unknown } | null)?.chPhone;
    if (typeof level === 'number' && level > 0) {
      e.preventDefault();
      window.history.go(-level);
      return;
    }
    if ((pathname.replace(/\/$/, '') || '/') !== href) return;
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' });
  };

  /**
   * Choosing another section (F-0008, F-0046; MOTION-AND-VISUAL 3.3). The selection haptic ticks (sw.choose), and a pill
   * an end of the row clips scrolls wholly into view, smoothly unless Reduce Motion is on; otherwise the row holds still,
   * unsnapped, so the focused pill doesn't recentre it under the plate's glide. The route change waits a frame, so the
   * strip's close is on the compositor before the new page's commit can hold its first frame. The switch itself swaps
   * the page at once (mot-03). A modified click (a new tab) is left to the link.
   */
  const choose = (e: MouseEvent<HTMLAnchorElement>, s: (typeof sw.sections)[number]) => {
    sw.choose(s);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (row.current) {
      row.current.dataset.holding = '';
      revealPill(row.current, e.currentTarget, reduced);
    }
    requestAnimationFrame(() => window.setTimeout(() => router.push(s.href, { scroll: false }), 0));
  };

  const hidden = shut && !sw.open;
  return (
    <>
      <div className="ch-strip-catch" hidden={!sw.open} aria-hidden="true" onClick={() => sw.setOpen(false)} />
      <m.nav
        id="ch-strip"
        className="ch-strip"
        aria-label="Sections"
        data-ch-code="CH-1808"
        data-shut={hidden ? '' : undefined}
        inert={hidden || immersive || noTabs || undefined}
        style={{ y }}
      >
        <m.div ref={row} className="ch-strip__row" style={{ opacity: fade }}>
          {sw.sections.map((s) => {
            const on = sw.shown?.id === s.id;
            const count = sw.counts[s.id] ?? null;
            return (
              <Link
                key={s.id}
                href={s.href}
                // The page on screen is never prefetched: that was a second request for its own address (MAC-12, link-prefetch.ts).
                prefetch={navLinkPrefetch(s.href, pathname)}
                // RouteFrame puts the page's scroll back (or at the top) itself; Next's own handling read the arriving page's
                // layout inside the commit on every switch (getClientRects, 22ms at 4x CPU, Chromium, 2026-10-16).
                scroll={false}
                className="ch-strip__pill"
                aria-current={on ? 'page' : undefined}
                onClick={(e) => (sw.current?.id === s.id ? retap(e, s.href) : choose(e, s))}
              >
                {on && <span className="ch-strip__plate" aria-hidden="true" />}
                <Icon icon={s.icon} size={16} />
                <span className="ch-strip__label">{s.label}</span>
                {count != null && (
                  <>
                    {' '}
                    <span className="ch-strip__count ch-num">
                      {count > 99 ? '99+' : count} <span className="ch-sr-only">new</span>
                    </span>
                  </>
                )}
                {/* The route change is the router's (a frame after the tap), so the link never reports pending itself. */}
                <LinkPending pending={sw.switching && sw.shown?.id === s.id} />
              </Link>
            );
          })}
          {user && (
            <>
              <span className="ch-strip__sep" aria-hidden="true" />
              <button
                type="button"
                className="ch-strip__pill ch-strip__me"
                aria-haspopup="dialog"
                aria-expanded={sw.accountOpen}
                aria-controls="ch-account"
                onClick={() => {
                  // CH-1704: the tick as the sheet opens (the More sheet's, before the strip).
                  haptic('select');
                  sw.setOpen(false);
                  sw.setAccountOpen(true);
                }}
              >
                <Avatar name={user.name} size="xs" />
                <span className="ch-strip__label">Account</span>
              </button>
            </>
          )}
        </m.div>
      </m.nav>
    </>
  );
}

/**
 * Scrolls the strip's row so `pill` is wholly in view, clear of the row's inline scroll padding (the edge fade): only
 * when an end clips it, and only as far as it takes. Smooth unless Reduce Motion is on (MOTION-AND-VISUAL 3.3, 3.11).
 */
export function revealPill(row: HTMLElement, pill: HTMLElement, reduced: boolean): void {
  const pad = parseFloat(getComputedStyle(row).scrollPaddingInlineStart) || 0;
  const start = pill.offsetLeft - pad;
  const end = pill.offsetLeft + pill.offsetWidth + pad - row.clientWidth;
  const to = row.scrollLeft > start ? start : row.scrollLeft < end ? end : null;
  if (to === null) return;
  row.scrollTo({ left: Math.max(0, to), behavior: reduced ? 'instant' : 'smooth' });
}
