import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The Ledger's building blocks (owner, 2026-10-08: "too cardy, build components"; the Coach Home "Mobile clubhouse
 * pass" board, round 3: "fewer containers, one feature card"). A page is assembled from these instead of one-off cards:
 * rows sit on the canvas between fine seams, figures sit between two hairlines, and at most one green FeatureCard
 * carries the screen's single most important thing. Section (ui/Section.tsx) heads each group.
 */

/** Rows on the canvas, separated by seams. No container: the list's edge is the section's edge. */
export function LedgerList({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <ul className={'ch-lgr' + (className ? ` ${className}` : '')} aria-label={label}>
      {children}
    </ul>
  );
}

/**
 * One row: an optional lead (a time, an avatar, a key), the title with its line under it, and a trailing value. With
 * `href` the whole row is a link that tints on press and shows a chevron; otherwise it is plain text.
 */
export function LedgerRow({
  lead,
  title,
  meta,
  trail,
  href,
  onClick,
  current = false,
}: {
  lead?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trail?: ReactNode;
  href?: string;
  onClick?: () => void;
  /** The row that is happening now or selected: its lead and title take the green. */
  current?: boolean;
}) {
  const body = (
    <>
      {lead != null && <span className="ch-lgr__lead">{lead}</span>}
      <span className="ch-lgr__txt">
        <span className="ch-lgr__title">{title}</span>
        {meta != null && <span className="ch-lgr__meta">{meta}</span>}
      </span>
      {trail != null && <span className="ch-lgr__trail ch-num">{trail}</span>}
      {(href || onClick) && <ChevronRight className="ch-lgr__go" size={16} aria-hidden="true" />}
    </>
  );
  const cls = 'ch-lgr__row' + (current ? ' is-current' : '') + (href || onClick ? ' is-link' : '');
  return (
    <li className="ch-lgr__item">
      {href ? (
        <Link href={href} className={cls}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" className={cls} onClick={onClick}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

/** A screen's key figures between two hairlines, divided by soft rules. Two to four figures. */
export function FigureRow({ items }: { items: ReadonlyArray<{ label: ReactNode; value: ReactNode; note?: ReactNode; tone?: 'gain' | 'loss' | 'under' }> }) {
  return (
    <dl className="ch-fgr" style={{ ['--ch-fgr-n' as string]: items.length }}>
      {items.map((it, i) => (
        <div key={i} className="ch-fgr__c">
          <dt>{it.label}</dt>
          <dd className={'ch-num' + (it.tone ? ` is-${it.tone}` : '')}>{it.value}</dd>
          {it.note != null && <dd className="ch-fgr__note">{it.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

/**
 * The one green card a screen may have: its single most important thing (Up next, the priority insight, a live
 * qualifier). A kicker line with an optional chip on the right, the title, one line, and an optional foot.
 */
export function FeatureCard({
  kicker,
  chip,
  title,
  line,
  foot,
  href,
  soon = false,
}: {
  kicker: ReactNode;
  chip?: ReactNode;
  title: ReactNode;
  line?: ReactNode;
  foot?: ReactNode;
  href?: string;
  /** The chip in the gilt key: it is about to happen. */
  soon?: boolean;
}) {
  const body = (
    <>
      <span className="ch-feat__k">
        <span className="ch-feat__kicker">{kicker}</span>
        {chip != null && <span className={'ch-feat__chip' + (soon ? ' is-soon' : '')}>{chip}</span>}
      </span>
      <span className="ch-feat__title">{title}</span>
      {line != null && <span className="ch-feat__line">{line}</span>}
      {foot != null && <span className="ch-feat__foot">{foot}</span>}
    </>
  );
  return href ? (
    <Link href={href} className="ch-feat is-link">
      {body}
    </Link>
  ) : (
    <div className="ch-feat">{body}</div>
  );
}

/** A screen's opening on the phone (and anywhere without the framed head): eyebrow, title, one brief line. */
export function PageIntro({ eyebrow, title, titleId, brief, action }: { eyebrow?: ReactNode; title: ReactNode; titleId?: string; brief?: ReactNode; action?: ReactNode }) {
  return (
    <header className="ch-intro">
      {eyebrow != null && <span className="ch-intro__eyebrow">{eyebrow}</span>}
      <span className="ch-intro__row">
        <h1 id={titleId} className="ch-intro__title">
          {title}
        </h1>
        {action != null && <span className="ch-intro__action">{action}</span>}
      </span>
      {brief != null && <p className="ch-intro__brief">{brief}</p>}
    </header>
  );
}
