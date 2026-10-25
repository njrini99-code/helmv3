import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * The Ledger section (owner, 2026-10-07: "flush, not so card heavy"): a heading on the canvas over an engraved rule,
 * with a caption under it and the section's actions on the right; the body sits flush below, with no card. Keep a
 * card only for a real object inside it (a scorecard, a table that scrolls, a form, a dialog).
 */
export function Section({
  id,
  title,
  meta,
  actions,
  className,
  children,
}: {
  id?: string;
  title?: ReactNode;
  /** One caption under the heading: a count, a window, a source. */
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const head = title || actions;
  return (
    <section className={'ch-sec' + (className ? ` ${className}` : '')} aria-labelledby={id && title ? `${id}-t` : undefined}>
      {head && (
        <div className="ch-sec__head">
          <div className="ch-sec__titles">
            {title && (
              <h2 id={id ? `${id}-t` : undefined} className="ch-sec__title">
                {title}
              </h2>
            )}
            {meta && <div className="ch-sec__meta">{meta}</div>}
          </div>
          {actions && <div className="ch-sec__actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** The way back from a sub-screen, above its page head: a quiet link with the parent's name. */
export function BackLink({ href, onClick, className, children }: { href?: string; onClick?: () => void; className?: string; children: ReactNode }) {
  // CONS-29: the one desktop back: a link to the parent page, or a button that steps back inside one (a picker, a panel).
  const cls = 'ch-backlink' + (className ? ` ${className}` : '');
  const body = (
    <>
      <Icon icon={ChevronLeft} size={16} />
      {children}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" className={cls} onClick={onClick}>
      {body}
    </button>
  );
}
