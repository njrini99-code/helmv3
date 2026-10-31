'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop } from '../../shell/phone-chrome';
import { Icon } from '../../ui/Icon';
import { PageIntro } from '../../ui/Ledger';
import { Segmented } from '../../ui/Segmented';
import { EmptyState, Skeleton } from '../../ui/States';
import { formatToPar } from './format';
import { useTourPaths } from './paths';
import type { ChTourLoad } from './types';
import '../../styles/tournaments.css';

/**
 * The pieces every Tournaments view shares (base-owned, `.ch-tour-*` in styles/tournaments.css): the view's root and
 * head, the Events / Compare / History switch, the loading and failed page states, the crumb back to the season, and the
 * small marks (chips, coverage, a to-par that is red only under par).
 */

/** The layout a view draws: the prop when a caller forces one (a test, the preview), else the viewport's. */
export function useTourPhone(forced?: boolean): boolean {
  const auto = useChPhone();
  return forced ?? auto;
}

/**
 * The phone's top bar. A root (Events, Compare, History) is the section's name at the left; a pushed page (an event)
 * goes back to the season. Desktop ignores it.
 */
export function TourPhoneTop({ phone, title, back }: { phone: boolean; title: string; back?: { label: string; href: string } }) {
  const router = useRouter();
  if (!phone) return null;
  return back ? (
    <PhoneTop heading={false} title={title} back={{ label: back.label, onBack: () => router.push(back.href) }} />
  ) : (
    <PhoneTop heading={false} start title={title} />
  );
}

export type ChTourView = 'home' | 'desk' | 'review' | 'history' | 'links' | 'compare' | 'lineup' | 'form' | 'live' | 'player';

/** A view's root: `<main>` on the Ledger canopy (desktop), the view's name for tests and shots, the phone flag. */
export function TourMain({ view, phone, labelledBy, className, busy, label, children }: { view: ChTourView; phone: boolean; labelledBy?: string; className?: string; busy?: boolean; label?: string; children: ReactNode }) {
  return (
    <main
      className={'ch-tour' + (className ? ` ${className}` : '') + (phone ? ' is-phone' : '')}
      aria-labelledby={label ? undefined : labelledBy}
      aria-label={label}
      aria-busy={busy || undefined}
      data-ch-code={busy ? 'CH-16401' : undefined}
      data-ch-tour-view={view}
      data-canopy={phone ? undefined : ''}
    >
      {children}
    </main>
  );
}

/**
 * The view's head. Desktop: the canopy head (an eyebrow, the title, one line, then `meta` such as a row of chips, and the
 * actions on the right). Phone: the kit's PageIntro, `meta`, and the actions at full width.
 */
export function TourHead({ id, phone, eyebrow, title, line, meta, actions, crumb, tight = false }: { id: string; phone: boolean; eyebrow: ReactNode; title: ReactNode; line?: ReactNode; meta?: ReactNode; actions?: ReactNode; crumb?: ReactNode; tight?: boolean }) {
  if (phone)
    return (
      <>
        {crumb}
        <PageIntro className="ch-tour-intro" eyebrow={eyebrow} title={title} titleId={id} brief={line} large />
        {meta}
        {actions && <div className="ch-tour-head__a">{actions}</div>}
      </>
    );
  return (
    <>
      {crumb}
      <header className="ch-tour-head" data-canopy-head={tight ? 'tight' : ''}>
        <div className="ch-tour-head__t">
          <span className="ch-tour-head__k ch-num">{eyebrow}</span>
          <h1 id={id}>{title}</h1>
          {line && <p>{line}</p>}
          {meta}
        </div>
        {actions && <div className="ch-tour-head__a">{actions}</div>}
      </header>
    </>
  );
}

/** Events, Compare and History: three routes of one page, switched like a section (it swaps at once). */
export function TourViewSwitch({ current, phone }: { current: 'home' | 'compare' | 'history'; phone: boolean }) {
  const router = useRouter();
  const paths = useTourPaths();
  const go = (v: 'home' | 'compare' | 'history') => router.push(v === 'home' ? paths.home() : v === 'compare' ? paths.compare() : paths.history());
  return (
    <div className={'ch-tour-views' + (phone ? ' is-phone' : '')}>
      <Segmented
        label="Tournaments view"
        size={phone ? 'sm' : 'md'}
        block={phone}
        value={current}
        onChange={go}
        options={[
          { value: 'home', label: 'Events' },
          { value: 'compare', label: 'Compare' },
          { value: 'history', label: 'History' },
        ]}
      />
    </div>
  );
}

/** "‹ Tournaments": back to the season from an event's own pages. */
export function TourCrumb({ href, children = 'Tournaments' }: { href: string; children?: ReactNode }) {
  return (
    <Link href={href} className="ch-tour-crumb">
      <Icon icon={ChevronLeft} size={15} />
      {children}
    </Link>
  );
}

/**
 * The loading state at the view's final geometry (CH-16401): the head's eyebrow and title as placeholders, then the
 * view's own body blocks, in place, marked busy.
 */
export function TourLoading({ view, phone, title, className, children }: { view: ChTourView; phone: boolean; title: string; className?: string; children: ReactNode }) {
  return (
    <TourMain view={view} phone={phone} busy label={`Loading ${title.toLowerCase()}`} className={'ch-tour--skel' + (className ? ` ${className}` : '')}>
      <header className="ch-tour-head" data-canopy-head={phone ? undefined : ''}>
        <div className="ch-tour-head__t">
          <Skeleton width={150} height={13} />
          <Skeleton width={phone ? 200 : 300} height={phone ? 34 : 44} radius={10} />
        </div>
      </header>
      {children}
    </TourMain>
  );
}

/** The page failure (CH-16201): the head stays, then "Tournaments didn’t load" with Try again. */
export function TourFailed({ view, phone, id, eyebrow, title, className }: { view: ChTourView; phone: boolean; id: string; eyebrow: ReactNode; title: ReactNode; className?: string }) {
  return (
    <TourMain view={view} phone={phone} labelledBy={id} className={className}>
      <TourHead id={id} phone={phone} eyebrow={eyebrow} title={title} />
      <EmptyState size="page" tone="danger" code="CH-16201" title="Tournaments didn’t load" body="Nothing is lost. Your events and scores are still saved; try again in a moment." />
    </TourMain>
  );
}

/** Load gate: the skeleton, the failure, or the view. */
export function tourGate(load: ChTourLoad | undefined, states: { loading: () => ReactNode; failed: () => ReactNode; ready: () => ReactNode }): ReactNode {
  if (load === 'loading') return states.loading();
  if (load === 'failed') return states.failed();
  return states.ready();
}

/** A small pill: neutral, positive (confirmed, complete) or warning (provisional, missing data). */
export function TourChip({ tone, dot = false, children }: { tone?: 'ok' | 'warn' | 'live'; dot?: boolean; children: ReactNode }) {
  return (
    <span className={'ch-tour-chip' + (tone ? ` is-${tone}` : '')}>
      {dot && <i aria-hidden="true" />}
      {children}
    </span>
  );
}

/** A to-par in the team's ink, red only under par (D-42). */
export function ToPar({ value, className }: { value: number | null | undefined; className?: string }) {
  const under = value != null && value < 0;
  return <span className={'ch-num' + (under ? ' ch-tour-under' : '') + (className ? ` ${className}` : '')}>{formatToPar(value)}</span>;
}

/** Shot-data coverage: a short bar and "11 of 15", or "Scorecards only". */
export function Coverage({ withShots, of }: { withShots: number; of: number }) {
  const pct = of ? Math.round((withShots / of) * 100) : 0;
  return (
    <span className="ch-tour-cov">
      <span className="ch-tour-cov__bar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className="ch-num">{withShots ? `${withShots} of ${of}` : 'Scorecards only'}</span>
    </span>
  );
}
