'use client';

/**
 * NotificationRow — the ONE row renderer shared by NotificationFeedPanel (the
 * bell's full list) and NotificationsLatestModule (the home-page compact
 * digest), so both surfaces read as the same product.
 *
 * A `PressTarget` (the unstyled pressable primitive, not a raw <button> —
 * `helm/no-raw-button` only allowlists raw elements inside fairway/controls
 * itself) with the row's own layout as className.
 */

import { PressTarget } from '@/components/fairway/controls/press-target';
import { cn } from '@/lib/utils';
import { categoryIcon } from './category-meta';
import { relativeTimeFrom, fullDateTime } from './time-format';
import type { UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';
import { isUnread } from '@/app/golf/actions/unified-notifications-model';

export interface NotificationRowProps {
  item: UnifiedNotificationItem;
  onClick: (item: UnifiedNotificationItem) => void;
  /** Compact rows for the home "Latest" module (tighter padding, no body line). */
  density?: 'comfortable' | 'compact';
}

export function NotificationRow({ item, onClick, density = 'comfortable' }: NotificationRowProps) {
  const Icon = categoryIcon(item.category);
  const unread = isUnread(item);
  const compact = density === 'compact';

  return (
    <PressTarget
      onClick={() => onClick(item)}
      className={cn(
        'group flex w-full items-start gap-3 rounded-fw-md text-left',
        'transition-colors duration-fast hover:bg-surface-sunken active:translate-y-[0.5px]',
        compact ? 'px-3 py-2' : 'px-3 py-2.5',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid flex-shrink-0 place-items-center rounded-xl',
          compact ? 'h-8 w-8' : 'h-9 w-9',
          item.category === 'coachhelm' ? 'bg-accent-50 text-accent-700' : 'bg-surface-sunken text-text-secondary',
        )}
      >
        <Icon size={compact ? 15 : 16} strokeWidth={1.75} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              'min-w-0 flex-1 truncate font-fw-sans font-medium text-text-primary',
              compact ? 'text-body-sm' : 'text-body-sm',
            )}
          >
            <span className="sr-only">{unread ? 'Unread: ' : ''}</span>
            {item.title}
          </p>
          <time
            dateTime={item.created_at}
            title={fullDateTime(item.created_at)}
            className="flex-shrink-0 font-fw-sans text-caption tabular-nums text-text-tertiary"
          >
            {relativeTimeFrom(item.created_at)}
          </time>
        </div>
        {!compact && item.body ? (
          <p className="mt-0.5 line-clamp-2 font-fw-sans text-body-sm text-text-tertiary">{item.body}</p>
        ) : null}
      </div>

      {unread ? (
        <span
          aria-hidden
          className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-accent-500"
        />
      ) : (
        <span className="mt-1.5 h-2 w-2 flex-shrink-0" aria-hidden />
      )}
    </PressTarget>
  );
}
