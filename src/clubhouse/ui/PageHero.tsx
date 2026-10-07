import type { ReactNode } from 'react';

/**
 * The shared page hero (the Frame, owner 2026-10-07): an eyebrow, the serif title, one line, and the page's actions
 * on the right. The page's `<main>` opts in with `data-canopy`, which sets the hero on the frame's green on desktop;
 * on a phone, or without the canopy, the same markup is a plain ivory head.
 */
export function PageHero({
  eyebrow,
  title,
  titleId,
  actions,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  titleId?: string;
  /** At most two controls; anything more belongs below the hero. */
  actions?: ReactNode;
  /** The one line under the title. */
  children?: ReactNode;
}) {
  return (
    <header className="ch-hero" data-canopy-head="">
      {eyebrow && <span className="ch-hero__eyebrow">{eyebrow}</span>}
      <h1 id={titleId} className="ch-hero__title ch-display">
        {title}
      </h1>
      {children && <p className="ch-hero__line">{children}</p>}
      {actions && <div className="ch-hero__actions">{actions}</div>}
    </header>
  );
}
