import type { ReactNode } from 'react';

/**
 * The design system's Surface (design/handoff/design-system/components/surfaces):
 * warm paper, 16px radius, a 7% ink ring and a soft 8/20 shadow. Head is a
 * 15px title with a caption subtitle and actions on the right; an optional
 * hairline rule; a 16/20 body; and a darker ivory footer bar that holds the
 * source line on the left and actions on the right.
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
  variant?: 'default' | 'flat';
  children?: ReactNode;
}) {
  const head = title || actions;
  return (
    <section className={'ch-surface' + (variant === 'flat' ? ' ch-surface--flat' : '')} aria-labelledby={id && title ? `${id}-t` : undefined}>
      {head && (
        <div className="ch-surface__head">
          <div style={{ minWidth: 0 }}>
            {title && (
              <h3 id={id ? `${id}-t` : undefined} className="ch-surface__title">
                {title}
              </h3>
            )}
            {subtitle && <div className="ch-surface__sub">{subtitle}</div>}
          </div>
          {actions && <div className="ch-surface__actions">{actions}</div>}
        </div>
      )}
      {head && rule && <div className="ch-surface__rule" />}
      {padded ? <div className="ch-surface__body">{children}</div> : children}
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
