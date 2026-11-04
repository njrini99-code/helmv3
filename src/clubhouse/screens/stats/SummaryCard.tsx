'use client';

import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { haptic } from '../../lib/haptics';

/** The drawn 8 x 14 chevron. */
export function ShsChevron() {
  return (
    <svg className="ch-shs-chev" width="8" height="14" viewBox="0 0 8 14" aria-hidden="true">
      <path d="M1.5 1.5 6.5 7l-5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS = {
  flag: <path d="M4 14.5V2m0 .5h7.5l-1.8 2.8 1.8 2.7H4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  tee: (
    <>
      <circle cx="8" cy="4.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.5 8.5h5L8.6 10v4.5H7.4V10z" fill="currentColor" />
    </>
  ),
  target: (
    <>
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="8" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </>
  ),
  chip: (
    <>
      <path d="M2 12.5c2.5-6 6.5-8 12-8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 2.6" />
      <circle cx="13.2" cy="4.6" r="1.8" fill="currentColor" />
    </>
  ),
  putt: (
    <>
      <ellipse cx="8" cy="12.5" rx="5.5" ry="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 12.5V2l4 1.8L8 5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </>
  ),
} as const;

export type ShsIconName = keyof typeof ICONS;

/** One shared map of the four part glyphs and the flag: Stats part cards and Home's legs draw the same ones (02 Override 6). */
export function ShsIcon({ name }: { name: ShsIconName }) {
  return (
    <span className="ch-shs-pi">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        {ICONS[name]}
      </svg>
    </span>
  );
}

/**
 * A summary card: the whole card pushes its detail (Enter and Space too), and presses at 0.97 with the wash (08 CP-131). A chart inside
 * marks itself `data-ch-no-open`, so a drag reads the chart and never opens the page.
 */
export function SummaryCard({
  go,
  onOpen,
  title,
  icon,
  meta,
  ariaLabel,
  feature = false,
  children,
}: {
  go: string;
  onOpen: () => void;
  title: string;
  icon?: ShsIconName;
  meta?: ReactNode;
  /** Title and figure, read as one (06's table). */
  ariaLabel: string;
  feature?: boolean;
  children: ReactNode;
}) {
  const open = () => {
    haptic('select');
    onOpen();
  };
  const onClick = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as Element).closest?.('[data-ch-no-open]')) return;
    open();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    open();
  };
  return (
    <section
      className={'ch-shs-card ch-shs-sum' + (feature ? ' ch-shs-feature' : '')}
      data-go={go}
      data-ch="stats-card"
      data-ch-press-scale=".97"
      role="link"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className="ch-shs-ah">
        <h3>
          {icon && <ShsIcon name={icon} />}
          {title}
        </h3>
        {meta != null && <span className="ch-shs-ah__meta">{meta}</span>}
        {feature ? (
          // The chevron is the keyboard's way in when the chart holds focus: 24 drawn, 44 to the finger.
          <button
            type="button"
            className="ch-shs-dlink"
            aria-label={`Open ${title.toLowerCase()} details`}
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
          >
            <ShsChevron />
          </button>
        ) : (
          <ShsChevron />
        )}
      </div>
      {children}
    </section>
  );
}

/** A plain card: the same box, with no chevron and no tap (`acard`, the style today's re-homed blocks take too). */
export function ShsCard({ title, meta, flush = false, children }: { title: string; meta?: ReactNode; flush?: boolean; children: ReactNode }) {
  return (
    <section className={'ch-shs-card' + (flush ? ' is-flushb' : '')} aria-label={title}>
      <div className="ch-shs-ah">
        <h3>{title}</h3>
        {meta != null && <span className="ch-shs-ah__meta">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

export function ShsPill({ tone, children }: { tone: 'gain' | 'loss' | 'flat'; children: ReactNode }) {
  return <span className={`ch-shs-pill is-${tone}`}>{children}</span>;
}

export function ShsArrow({ direction }: { direction: 'down' | 'up' | 'flat' }) {
  const d = direction === 'down' ? 'M6 2v7.5M2.8 6.5 6 9.7l3.2-3.2' : direction === 'up' ? 'M6 10V2.5M2.8 5.5 6 2.3l3.2 3.2' : 'M2 6h8';
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
