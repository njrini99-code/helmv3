import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * The honest states every Clubhouse surface needs, kept visually distinct:
 *   EmptyState   - the read worked and there is genuinely nothing yet
 *   InlineNotice - a part of the page could not load (./Notices, client)
 *   Skeleton     - the page is on its way (route loading only)
 * A failed read is never rendered as an empty state. This file is
 * server-safe so server components can pass icons into it.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  secondaryAction,
  progress,
  compact = false,
  size = 'section',
  code,
}: {
  icon?: LucideIcon;
  title: string;
  body?: ReactNode;
  /** The one primary action. */
  action?: ReactNode;
  /** An optional second action, never more (v2). */
  secondaryAction?: ReactNode;
  /** Page size only: how far the space is from filling in, for example 2 of 5 rounds posted. */
  progress?: { done: number; total: number; label: string };
  compact?: boolean;
  /**
   * `section` for a part of a page; `page` when the whole page body is empty
   * (the v2 empty state: a medallion, a title that names what belongs, one or
   * two sentences on how the space fills, one primary action).
   */
  size?: 'section' | 'page';
  /** Catalog number (docs/clubhouse/catalog). */
  code?: string;
}) {
  if (size === 'page') {
    return (
      <section className="ch-empty-page" data-ch-code={code}>
        <div className="ch-empty-page__in">
          {icon && (
            <span className="ch-empty-page__art" aria-hidden="true">
              <span className="ch-empty-page__ic">
                <Icon icon={icon} size={26} />
              </span>
            </span>
          )}
          <h2 className="ch-empty-page__title">{title}</h2>
          {body && <p className="ch-empty-page__body">{body}</p>}
          {progress && (
            <div className="ch-empty-page__prog">
              <span className="ch-empty-page__seg" aria-hidden="true">
                {Array.from({ length: progress.total }, (_, i) => (
                  <i key={i} className={i < progress.done ? 'is-on' : undefined} />
                ))}
              </span>
              <span className="ch-empty-page__prog-t ch-num">
                {progress.done} of {progress.total} {progress.label}
              </span>
            </div>
          )}
          {(action || secondaryAction) && (
            <div className="ch-empty-page__a">
              {action}
              {secondaryAction}
            </div>
          )}
        </div>
      </section>
    );
  }
  return (
    <div className={'ch-empty' + (compact ? ' ch-empty--compact' : '')} data-ch-code={code}>
      {icon && (
        <span className="ch-empty__icon ch-well-soft">
          <Icon icon={icon} size={compact ? 16 : 18} />
        </span>
      )}
      <p className="ch-empty__title">{title}</p>
      {body && <p className="ch-empty__body">{body}</p>}
      {(action || secondaryAction) && (
        <div className="ch-empty__action">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

/** CH-1609: nothing for 150ms, then the block fades in; one shared shimmer, still when motion is off (base.css). */
export function Skeleton({ width, height = 12, radius = 6 }: { width?: number | string; height?: number; radius?: number }) {
  return <span className="ch-skel" style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}
