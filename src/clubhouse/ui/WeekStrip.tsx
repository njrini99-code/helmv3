'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { Icon } from './Icon';
import { ScrollPager } from './ScrollPager';

export interface WeekStripDay {
  date: string;
  /** What sits over the number: the weekday's letter, its short name, or "Today". */
  top: string;
  num: number | string;
  isToday?: boolean;
  /** Event dots, up to `maxDots`. */
  dots: number;
  /** One more dot in its own tone: a reply still owed (amber) or a day on the road (gold). */
  flag?: 'reply' | 'trip';
  /** A competition day draws its type's mark in place of the dots. */
  mark?: LucideIcon;
  /** The day read as words. A button carries it as its name; a link or a plain day as hidden text. */
  label: string;
  /** A link to the day (Home), when the strip doesn't choose a day itself. */
  href?: string;
}

/**
 * B18: the one week strip (Home on phone and desktop, the Hub's week, the phone calendar). One look: a flat row of
 * seven days, the chosen day on the accent plate (it glides from day to day, CH-6606), today ringed, events as dots.
 *
 * Three ways to hold it:
 * - `onSelect`: the strip chooses a day (Hub, Calendar). Days are toggle buttons with one Tab stop; ← and → step a day,
 *   Home and End go to the ends, and at an end of the week ← or → turns the page when the strip pages.
 * - each day's `href`: the days are links (Home).
 * - neither: the days are read, not pressed.
 *
 * `onPage` with `around` makes it page: a swipe turns a week with the phone's own momentum, the way the calendar's day
 * pages (ScrollPager), and settles with one tick.
 */
export function WeekStrip({
  days,
  label,
  selected = null,
  onSelect,
  onPage,
  around,
  maxDots = 3,
  className,
}: {
  days: WeekStripDay[];
  label: string;
  selected?: string | null;
  onSelect?: (date: string) => void;
  onPage?: (dir: -1 | 1) => void;
  around?: { prev: WeekStripDay[]; next: WeekStripDay[] };
  maxDots?: number;
  className?: string;
}) {
  const list = useRef<HTMLOListElement | null>(null);
  const at = selected == null ? -1 : days.findIndex((d) => d.date === selected);
  const keys = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (!onSelect || e.altKey || e.metaKey || e.ctrlKey) return;
    const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? days.length - 1 : null;
    if (to == null) return;
    e.preventDefault();
    if (to < 0 || to >= days.length) {
      if (onPage) onPage(to < 0 ? -1 : 1);
      return;
    }
    onSelect(days[to]!.date);
    list.current?.querySelectorAll<HTMLButtonElement>('.ch-wks__d')[to]?.focus();
  };
  const row = (ds: WeekStripDay[], live: boolean) => (
    <ol
      ref={live ? list : undefined}
      className={'ch-wks' + (className ? ` ${className}` : '')}
      aria-label={live ? label : undefined}
      style={{ '--ch-wks-at': Math.max(0, at) } as CSSProperties}
      data-chosen={live && at >= 0 ? '' : undefined}
    >
      {ds.map((d, i) => {
        const cls = 'ch-wks__d' + (live && i === at ? ' is-on' : '') + (d.isToday ? ' is-today' : '');
        const face = (
          <>
            <em aria-hidden="true">{d.top}</em>
            <b className="ch-num" aria-hidden="true">
              {d.num}
            </b>
            <i aria-hidden="true">
              {d.mark ? (
                <Icon icon={d.mark} size={11} />
              ) : (
                Array.from({ length: Math.min(maxDots, d.dots) }, (_, j) => <span key={j} />)
              )}
              {d.flag && <span className={`is-${d.flag}`} />}
            </i>
          </>
        );
        return (
          <li key={d.date} aria-current={d.isToday ? 'date' : undefined} className={(d.isToday ? 'is-today' : '') + (d.mark ? ' is-major' : '') || undefined}>
            {onSelect ? (
              <button
                type="button"
                className={cls}
                aria-pressed={live && i === at}
                aria-label={d.label}
                tabIndex={!live ? -1 : i === (at >= 0 ? at : 0) ? 0 : -1}
                onClick={() => onSelect(d.date)}
                onKeyDown={(e) => keys(e, i)}
              >
                {face}
              </button>
            ) : d.href ? (
              <Link href={d.href} className={cls} tabIndex={live ? undefined : -1}>
                {face}
                <span className="ch-sr-only">{d.label}</span>
              </Link>
            ) : (
              <span className={cls}>
                {face}
                <span className="ch-sr-only">{d.label}</span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
  return onPage && around ? (
      <ScrollPager pageKey={days[0]?.date ?? ''} onSettle={onPage} prev={row(around.prev, false)} next={row(around.next, false)} className="ch-wks-pager" pageClassName="ch-wks-page">
        {row(days, true)}
      </ScrollPager>
  ) : (
    row(days, true)
  );
}
