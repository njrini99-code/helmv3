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

/** "Message from Cole Bennett" → "Cole Bennett": the eyebrow already says
 *  Message, so the headline carries the person. */
function headlineFor(item: UnifiedNotificationItem): string {
  if (item.category === 'messages') {
    const m = /^message from\s+(.+)$/i.exec(item.title.trim());
    if (m?.[1]) return m[1];
  }
  return item.title;
}

const CATEGORY_EYEBROW: Record<string, string> = {
  messages: 'Message',
  events: 'Event',
  announcements: 'Announcement',
  tasks: 'Task',
  coachhelm: 'CoachHelm',
  pipeline: 'Roster',
  profile_views: 'Profile',
};

/**
 * Owner 2026-09-27: "make them more recognizable, a true notifications hub,
 * premium". Each row reads eyebrow (type · time) → headline (who / what) →
 * one-line preview, next to a category tile, with the unread dot at the right.
 */
export function NotificationRow({ item, onClick, density = 'comfortable' }: NotificationRowProps) {
  const Icon = categoryIcon(item.category);
  const unread = isUnread(item);
  const compact = density === 'compact';
  const headline = headlineFor(item);
  const eyebrow = CATEGORY_EYEBROW[item.category] ?? 'Update';

  return (
    <PressTarget
      onClick={() => onClick(item)}
      className={cn(
        'group flex w-full items-center gap-3.5 rounded-fw-md text-left',
        'transition-colors duration-fast hover:bg-surface-sunken active:translate-y-[0.5px]',
        compact ? 'px-3.5 py-3' : 'px-4 py-3.5',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid flex-shrink-0 place-items-center rounded-full',
          compact ? 'h-10 w-10' : 'h-11 w-11',
          unread ? 'bg-accent-fill text-text-on-accent-fill' : 'bg-accent-50 text-accent-700',
        )}
      >
        <Icon size={compact ? 17 : 18} strokeWidth={1.75} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-fw-sans text-caption text-text-tertiary">
          <span className="font-semibold uppercase tracking-[0.06em] text-accent-700">{eyebrow}</span>
          <span aria-hidden>·</span>
          <time dateTime={item.created_at} title={fullDateTime(item.created_at)} className="tabular-nums">
            {relativeTimeFrom(item.created_at)}
          </time>
        </p>
        <p
          className={cn(
            'mt-0.5 truncate font-fw-sans text-body text-text-primary',
            unread ? 'font-semibold' : 'font-medium',
          )}
        >
          <span className="sr-only">{unread ? 'Unread: ' : ''}</span>
          {headline}
        </p>
        {item.body ? (
          <p
            className={cn(
              'mt-0.5 font-fw-sans text-body-sm text-text-secondary',
              compact ? 'truncate' : 'line-clamp-2',
            )}
          >
            {item.body}
          </p>
        ) : null}
      </div>

      {unread ? (
        <span aria-hidden className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-accent-500" />
      ) : (
        <span className="h-2.5 w-2.5 flex-shrink-0" aria-hidden />
      )}
    </PressTarget>
  );
}
