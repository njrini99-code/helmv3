import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The Ledger's building blocks (owner, 2026-10-08: "too cardy, build components"; the Coach Home "Mobile clubhouse
 * pass" board, round 3: "fewer containers, one feature card"). A page is assembled from these instead of one-off cards:
 * rows sit on the canvas between fine seams, figures sit between two hairlines, and at most one green FeatureCard
 * carries the screen's single most important thing. Section (ui/Section.tsx) heads each group.
 */

/** What each piece takes besides its content: a page's own class, its catalog number and, where the words on screen
 * don't say enough, an accessible name. */
interface KitProps {
  className?: string;
  /** Catalog number (docs/clubhouse/catalog), as `data-ch-code`. */
  code?: string;
  /** The accessible name (`aria-label`). */
  label?: string;
}

const cx = (base: string, className?: string) => base + (className ? ` ${className}` : '');

/** Rows on the canvas, separated by seams. No container: the list's edge is the section's edge. */
export function LedgerList({ label, children, className, code }: KitProps & { children: ReactNode }) {
  return (
    <ul className={cx('ch-lgr', className)} aria-label={label} data-ch-code={code}>
      {children}
    </ul>
  );
}

/**
 * One row: an optional lead (a time, an avatar, a key), the title with its line under it, and a trailing value. With
 * `href` the whole row is a link, with `onClick` a button (both, and the click runs as the link is followed): it tints
 * on press and shows a chevron; otherwise it is plain text. `className`, `code` and `label` go on the row itself, but a
 * plain row's name goes on its list item, since a plain box can't carry one.
 */
export function LedgerRow({
  lead,
  title,
  meta,
  trail,
  href,
  onClick,
  current = false,
  className,
  code,
  label,
}: KitProps & {
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
  const cls = cx('ch-lgr__row' + (current ? ' is-current' : '') + (href || onClick ? ' is-link' : ''), className);
  return (
    <li className="ch-lgr__item" aria-label={href || onClick ? undefined : label}>
      {href ? (
        <Link href={href} className={cls} data-ch-code={code} aria-label={label} onClick={onClick}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" className={cls} data-ch-code={code} aria-label={label} onClick={onClick}>
          {body}
        </button>
      ) : (
        <div className={cls} data-ch-code={code}>
          {body}
        </div>
      )}
    </li>
  );
}

/** A screen's key figures between two hairlines, divided by soft rules. Two to four figures. */
export function FigureRow({
  items,
  className,
  code,
  label,
}: KitProps & { items: ReadonlyArray<{ label: ReactNode; value: ReactNode; note?: ReactNode; tone?: 'gain' | 'loss' | 'under' }> }) {
  return (
    <dl className={cx('ch-fgr', className)} style={{ ['--ch-fgr-n' as string]: items.length }} data-ch-code={code} aria-label={label}>
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
 * qualifier). A kicker line with an optional chip on the right, the title, one line, and an optional foot. With `href`
 * it is a link, with `onClick` a button (keep its foot free of links and buttons then); either way a press lays a shade
 * over it and it never scales (CH-1617). Unlinked and named (`label`), it is a named group.
 */
export function FeatureCard({
  kicker,
  chip,
  title,
  line,
  foot,
  href,
  onClick,
  soon = false,
  className,
  code,
  label,
}: KitProps & {
  kicker: ReactNode;
  chip?: ReactNode;
  title: ReactNode;
  line?: ReactNode;
  foot?: ReactNode;
  href?: string;
  onClick?: () => void;
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
  if (href)
    return (
      <Link href={href} className={cx('ch-feat is-link', className)} data-ch-code={code} aria-label={label} onClick={onClick}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" className={cx('ch-feat is-link', className)} data-ch-code={code} aria-label={label} onClick={onClick}>
        {body}
      </button>
    );
  return (
    <div className={cx('ch-feat', className)} data-ch-code={code} role={label ? 'group' : undefined} aria-label={label}>
      {body}
    </div>
  );
}

/**
 * A screen's opening on the phone (and anywhere without the framed head): eyebrow, title, one brief line. The title is
 * the page's h1, or an h2 (`level={2}`) where the phone bar already holds the h1; `label` names it where its words are
 * terse (a month without its year).
 */
export function PageIntro({
  eyebrow,
  title,
  titleId,
  brief,
  action,
  level = 1,
  className,
  code,
  label,
}: KitProps & { eyebrow?: ReactNode; title: ReactNode; titleId?: string; brief?: ReactNode; action?: ReactNode; level?: 1 | 2 }) {
  const Heading = level === 2 ? 'h2' : 'h1';
  return (
    <header className={cx('ch-intro', className)} data-ch-code={code}>
      {eyebrow != null && <span className="ch-intro__eyebrow">{eyebrow}</span>}
      <span className="ch-intro__row">
        <Heading id={titleId} className="ch-intro__title" aria-label={label}>
          {title}
        </Heading>
        {action != null && <span className="ch-intro__action">{action}</span>}
      </span>
      {brief != null && <p className="ch-intro__brief">{brief}</p>}
    </header>
  );
}
