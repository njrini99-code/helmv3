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
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={'ch-empty' + (compact ? ' ch-empty--compact' : '')}>
      {icon && (
        <span className="ch-empty__icon ch-well-soft">
          <Icon icon={icon} size={compact ? 16 : 18} />
        </span>
      )}
      <p className="ch-empty__title">{title}</p>
      {body && <p className="ch-empty__body">{body}</p>}
      {action && <div className="ch-empty__action">{action}</div>}
    </div>
  );
}

export function Skeleton({ width, height = 12, radius = 6 }: { width?: number | string; height?: number; radius?: number }) {
  return <span className="ch-skel" style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

