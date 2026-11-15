'use client';

import { createContext, useContext, type ReactNode } from 'react';

/** True inside a Surface: a card in a card is always wrong (SYS-3), so development says so. */
const InSurface = createContext(false);

/**
 * The design system's Surface (design/handoff/design-system/components/surfaces): the card. Warm paper, the card
 * radius and the ONE card depth (`--ch-card-shadow`, tokens.css: a lit top edge, a hairline ring, a contact shadow and
 * an ambient fall; design/handoff/depth.css is the reference). Head is a title with a caption subtitle and actions on
 * the right; an optional hairline rule; a body; and a footer that holds the source line on the left and actions on the
 * right.
 *
 * `variant`: `card` is the refreshed card (the larger radius, the note as a band); `flat` is a ring with no depth, for
 * a surface inside another; `feature` is the view's one green card (flat `--ch-feature-bg`, `--ch-feature-shadow`,
 * on-green inks), at most one per view. A screen never writes its own card or feature shadow.
 */
export function Surface({
  id,
  title,
  subtitle,
  actions,
  rule = false,
  footer,
  footerNote,
  padded = true,
  variant = 'default',
  level = 3,
  children,
}: {
  id?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  rule?: boolean;
  footer?: ReactNode;
  /** Caption on the footer's left (source, status). */
  footerNote?: ReactNode;
  padded?: boolean;
  variant?: 'default' | 'flat' | 'card' | 'feature';
  /** The title's heading level: 3 inside a Zone (the default), 2 when the Surface is a page's top-level section (F-0063). */
  level?: 2 | 3;
  children?: ReactNode;
}) {
  const nested = useContext(InSurface);
  if (nested && process.env.NODE_ENV !== 'production') console.warn('Clubhouse: a Surface inside a Surface. Use a section or a Ledger row inside the outer card (SYS-3).', title ?? id ?? '');
  const head = title || actions;
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <section className={'ch-surface' + (variant === 'default' ? '' : ` ch-surface--${variant}`)} aria-labelledby={id && title ? `${id}-t` : undefined}>
      {head && (
        <div className="ch-surface__head">
          <div style={{ minWidth: 0 }}>
            {title && (
              <H id={id ? `${id}-t` : undefined} className="ch-surface__title">
                {title}
              </H>
            )}
            {subtitle && <div className="ch-surface__sub">{subtitle}</div>}
          </div>
          {actions && <div className="ch-surface__actions">{actions}</div>}
        </div>
      )}
      {head && rule && <div className="ch-surface__rule" />}
      <InSurface.Provider value={true}>{padded ? <div className="ch-surface__body">{children}</div> : children}</InSurface.Provider>
      {(footer || footerNote) && (
        <div className="ch-surface__foot">
          <span className="ch-surface__note">{footerNote}</span>
          {footer && <span className="ch-surface__foot-acts">{footer}</span>}
        </div>
      )}
    </section>
  );
}

/** The design system's Inset: a toasted-ivory sunken well for evidence inside a Surface. */
export function Inset({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={'ch-inset' + (className ? ` ${className}` : '')}>{children}</div>;
}
