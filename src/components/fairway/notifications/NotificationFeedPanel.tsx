'use client';

/**
 * ============================================================================
 * NotificationFeedPanel — presentational body for the unified notifications
 * feed (day-grouped Today / Yesterday / Earlier, category filter chips, mark-
 * all-read, honest empty/error/loading states). Pure props-in, callbacks-out —
 * `NotificationBell` owns the fetch, the open state, and both the desktop
 * PopoverPanel / mobile Sheet chrome this renders inside.
 *
 * Presentation borrows FairwayWhatsNew's proven pattern (day buckets, type
 * filter segments, honest states) — sourced from the real unified feed
 * instead of a CoachHelm-only 7-day digest.
 * ========================================================================== */

import { BellOff, Inbox } from 'lucide-react';
import { Segmented, Button, EmptyState, InlineNotice, SkeletonList, type SegmentedOption } from '@/components/fairway';
import { NotificationRow } from './NotificationRow';
import { categoryShortLabel } from './category-meta';
import {
  countByCategory,
  DAY_BUCKET_LABEL,
  groupByDayBucket,
  itemMatchesFilter,
  NOTIFICATION_CATEGORY_IDS,
  type NotificationFilter,
  type UnifiedNotificationItem,
} from '@/app/golf/actions/unified-notifications-model';

export interface NotificationFeedPanelProps {
  items: UnifiedNotificationItem[];
  /** True only on a first-ever load with nothing to show yet — subsequent
   *  background refreshes keep the existing list visible (no flicker). */
  loading: boolean;
  error: string | null;
  filter: NotificationFilter;
  onFilterChange: (filter: NotificationFilter) => void;
  onItemClick: (item: UnifiedNotificationItem) => void;
  onMarkAllRead: () => void;
  markingAllRead: boolean;
  unreadCount: number;
}

export function NotificationFeedPanel({
  items,
  loading,
  error,
  filter,
  onFilterChange,
  onItemClick,
  onMarkAllRead,
  markingAllRead,
  unreadCount,
}: NotificationFeedPanelProps) {
  const counts = countByCategory(items);
  const availableCategories = NOTIFICATION_CATEGORY_IDS.filter((id) => counts[id] > 0);
  const showFilters = availableCategories.length > 1;

  const filterOptions: SegmentedOption<NotificationFilter>[] = [
    { value: 'all', label: 'All' },
    ...availableCategories.map((id) => ({ value: id, label: categoryShortLabel(id) })),
  ];

  const visibleItems = items.filter((item) => itemMatchesFilter(item, filter));
  const grouped = groupByDayBucket(visibleItems);
  const isFiltered = filter !== 'all';

  return (
    <div className="flex max-h-[70vh] min-h-0 flex-col md:max-h-[520px]">
      {/* Header — title + mark-all-read. The Sheet/Popover chrome supplies its
          own title/close elsewhere on mobile vs desktop, so this stays a
          quiet action row, not a second competing heading. */}
      <div className="flex flex-shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-3 md:px-3 md:pt-1">
        <h2 className="font-fw-sans text-body-sm font-semibold text-text-primary">
          Notifications
          {unreadCount > 0 ? (
            <span className="ml-1.5 font-fw-mono text-caption tabular-nums text-text-tertiary">
              ({unreadCount} unread)
            </span>
          ) : null}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onMarkAllRead}
          busy={markingAllRead}
          disabled={unreadCount === 0}
        >
          Mark all read
        </Button>
      </div>

      {showFilters ? (
        <div className="flex-shrink-0 overflow-x-auto px-4 pb-2 md:px-3">
          <Segmented
            value={filter}
            onValueChange={onFilterChange}
            options={filterOptions}
            size="sm"
            aria-label="Filter notifications by category"
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="px-2 py-1">
            <SkeletonList rows={4} label="Loading notifications" />
          </div>
        ) : error ? (
          <div className="px-2 py-2">
            <InlineNotice tone="danger" title="Unable to load notifications">
              {error}
            </InlineNotice>
          </div>
        ) : grouped.length === 0 && isFiltered ? (
          <EmptyState
            variant="subtle"
            icon={Inbox}
            title="No matching notifications"
            description="Nothing of this type right now. Clear the filter to see everything."
            action={
              <Button variant="secondary" size="sm" onClick={() => onFilterChange('all')}>
                Show all
              </Button>
            }
          />
        ) : grouped.length === 0 ? (
          <EmptyState
            variant="subtle"
            icon={BellOff}
            title="You're all caught up"
            description="New insights, events, and reminders will show up here."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {grouped.map(({ bucket, items: bucketItems }) => (
              <section key={bucket} aria-label={`${DAY_BUCKET_LABEL[bucket]}, ${bucketItems.length} notifications`}>
                <h3 className="px-2 pb-1 font-fw-sans text-eyebrow font-medium uppercase tracking-[0.1em] text-text-tertiary">
                  {DAY_BUCKET_LABEL[bucket]}
                </h3>
                <ul>
                  {bucketItems.map((item) => (
                    <li key={`${item.source}:${item.id}`}>
                      <NotificationRow item={item} onClick={onItemClick} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
