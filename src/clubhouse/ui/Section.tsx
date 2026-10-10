import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

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
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="ch-backlink">
      <ChevronLeft size={15} strokeWidth={2.2} aria-hidden="true" />
      {children}
    </Link>
  );
}
