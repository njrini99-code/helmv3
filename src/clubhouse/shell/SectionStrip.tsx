'use client';

import Link from 'next/link';
import { m, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react';
import { useCallback, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { haptic } from '../lib/haptics';
import { chSpring } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import { LinkPending } from './LinkPending';
import { CH_PHONE_TABS, isRebuilt, type ChRole } from './nav';
import { usePhoneChromeState } from './phone-chrome';
import { useSectionSwitch } from './section-switch';
import { usePrefetchTabs } from './use-prefetch-tabs';

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
  const reduced = useChReducedMotion();
  const { immersive, noTabs } = usePhoneChromeState();
  const row = useRef<HTMLDivElement>(null);
  const [shut, setShut] = useState(true);
  const shutRef = useRef(true);
  const zero = useMotionValue(0);
  const progress = sw?.progress ?? zero;
  const y = useTransform(progress, (p) => `${(Math.min(Math.max(p, 0), 1) - 1) * 100}%`);
  const fade = useTransform(progress, [0, 0.4, 1], [0, 0.55, 1]);

  // The first sections are fetched ahead of the first tap (P0-2), as the tab bar's were.
  usePrefetchTabs(
    (sw?.sections ?? []).filter((s) => CH_PHONE_TABS[role].includes(s.id) && isRebuilt(s.href, role)).map((s) => s.href),
    pathname,
  );

  /** The current pill in the middle of the row, so it is under the finger that opened it. */
  const centre = useCallback(() => {
    const el = row.current;
    const on = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !on) return;
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

  if (!sw?.enabled) return null;

  /** Tapping the open section closes the strip and does what a retapped tab did (CH-1907): pop, or scroll to the top. */
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
                className="ch-strip__pill"
                aria-current={on ? 'page' : undefined}
                onClick={(e) => (sw.current?.id === s.id ? retap(e, s.href) : sw.choose(s))}
              >
                {on && <m.span layoutId="ch-strip-plate" className="ch-strip__plate" transition={chSpring('settle', reduced)} aria-hidden="true" />}
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
                <LinkPending />
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
                <Avatar name={user.name} size={24} />
                <span className="ch-strip__label">Account</span>
              </button>
            </>
          )}
        </m.div>
      </m.nav>
    </>
  );
}
