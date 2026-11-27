'use client';

import type { MouseEvent, ReactNode } from 'react';
import type { ShsChange } from './shs-figures';
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
 * A summary card: the whole card pushes its detail (Enter and Space too). A press deepens the surface (the pressed wash, `data-ch-pressed`)
 * and never scales the card (CH-1606; the owner's newest design: "presses deepen the surface and never scale"). A chart inside
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
  return (
    // A press anywhere opens the card; VoiceOver and the keyboard get the one real button inside it (STATS-8).
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- the button below is the keyboard path
    <section data-ctl="CTL-P004-030"
      className={'ch-shs-card ch-shs-sum' + (feature ? ' ch-shs-feature' : '')} suppressHydrationWarning
      data-go={go}
      data-ch="stats-card"
      data-ch-pressable=""
      onClick={onClick}
    >
      <button data-ctl="CTL-P004-031" type="button" className="ch-shs-sum__key" data-ch-no-open aria-label={ariaLabel} onClick={open} />
      <div className="ch-shs-ah">
        <h3>
          {icon && <ShsIcon name={icon} />}
          {title}
        </h3>
        {meta != null && <span className="ch-shs-ah__meta ch-num">{meta}</span>}
        {feature ? (
          // The chevron is the keyboard's way in when the chart holds focus: 24 drawn, 44 to the finger.
          <button data-ctl="CTL-P004-032"
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

/**
 * A plain card: the same box, with no chevron and no tap (`acard`, the style today's re-homed blocks take too). Its title sits in the
 * green title bar (look-09 option F); `feature` makes it the screen's one deep green card, which holds the headline figures.
 */
export function ShsCard({
  title,
  meta,
  flush = false,
  feature = false,
  anchor,
  children,
}: {
  title: string;
  meta?: ReactNode;
  flush?: boolean;
  feature?: boolean;
  /** A place a push can land on. */
  anchor?: string;
  children: ReactNode;
}) {
  return (
    <section className={'ch-shs-card' + (flush ? ' is-flushb' : '') + (feature ? ' ch-shs-feature' : '')} suppressHydrationWarning aria-label={title} data-ch-anchor={anchor}>
      <div className="ch-shs-ah">
        <h3>{title}</h3>
        {meta != null && <span className="ch-shs-ah__meta ch-num">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

export function ShsPill({ tone, children }: { tone: 'gain' | 'loss' | 'flat'; children: ReactNode }) {
  return <span className={`ch-shs-pill is-${tone}`}>{children}</span>;
}

/**
 * A scoring change as a chip and its words. A clear change chips its figure with an arrow ("↓ 0.9 lower", then "than the 10 before").
 * No clear change chips the verdict and leaves the signed figure plain after it ("No clear change", then "−0.9 vs previous 10"): a
 * boxed "−0.9" beside "No clear change" read as a change and its denial at once (owner's screenshot, 27 Nov 2026). The words are
 * Home's, so the two screens still say the same thing (W27).
 */
export function ShsChangeChip({ change }: { change: Pick<ShsChange, 'chip' | 'tone' | 'direction' | 'words' | 'vs'> }) {
  if (change.direction === 'flat' && change.chip && change.vs != null) {
    return (
      <>
        <ShsPill tone="flat">No clear change</ShsPill>
        <span>
          <span className="ch-num">{change.chip}</span> {change.vs}
        </span>
      </>
    );
  }
  return (
    <>
      {change.chip && (
        <ShsPill tone={change.tone}>
          {change.direction !== 'flat' && <ShsArrow direction={change.direction} />}
          {change.chip}
        </ShsPill>
      )}
      <span>{change.words}</span>
    </>
  );
}

export function ShsArrow({ direction }: { direction: 'down' | 'up' | 'flat' }) {
  const d = direction === 'down' ? 'M6 2v7.5M2.8 6.5 6 9.7l3.2-3.2' : direction === 'up' ? 'M6 10V2.5M2.8 5.5 6 2.3l3.2 3.2' : 'M2 6h8';
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
