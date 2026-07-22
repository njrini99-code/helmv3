'use client';

/**
 * ============================================================================
 * NotificationBell — the ONE app-wide notifications entry point
 * ----------------------------------------------------------------------------
 * Mounted once in FairwayTopBar's actions slot (FairwayDashboardShell), so
 * every dashboard route — both homes included — gets it for free. Desktop
 * (>=md) opens a PopoverPanel; mobile opens a Sheet. Badge count is read
 * straight from NotificationBadgeProvider's existing 45s poll (no second poll
 * loop); the item LIST is fetched on demand when the panel opens.
 *
 * Open state lives in NotificationPanelContext so the home "Latest" module's
 * "View all" can open this SAME instance instead of growing its own feed UI.
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { IconButton, PopoverPanel, Sheet } from '@/components/fairway';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { useNotificationPanel } from './NotificationPanelContext';
import { NotificationFeedPanel } from './NotificationFeedPanel';
import {
  getUnifiedNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/app/golf/actions/unified-notifications';
import type { NotificationFilter, UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';

const FEED_LIMIT = 30;

export function NotificationBell() {
  const router = useRouter();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const badges = useNotificationBadges();
  const { open, setOpen } = useNotificationPanel();

  const [items, setItems] = useState<UnifiedNotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const unreadTotal = badges.notificationsUnread + badges.calendarNotifications;

  const load = useCallback(async () => {
    try {
      const result = await getUnifiedNotifications({ limit: FEED_LIMIT });
      if (result.success && result.data) {
        setItems(result.data.items);
        setError(null);
      } else if (!result.authExpired) {
        setError(result.error ?? 'Failed to load notifications');
      }
    } catch {
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on every open — cheap indexed query. The panel below only shows the
  // skeleton when there's nothing to display yet (`items.length === 0`), so
  // re-opening the bell with a warm list never flickers — this refresh just
  // quietly reconciles in the background.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void load();
  }, [open, load]);

  const handleItemClick = useCallback(
    (item: UnifiedNotificationItem) => {
      const wasUnread = item.read_at == null;
      const readAt = new Date().toISOString();
      setItems((prev) =>
        prev.map((i) => (i.id === item.id && i.source === item.source ? { ...i, read_at: i.read_at ?? readAt } : i)),
      );
      setOpen(false);
      if (item.action_url) router.push(item.action_url);
      if (wasUnread) {
        void markNotificationRead(item.id, item.source).then(() => badges.refetch());
      }
    },
    [badges, router, setOpen],
  );

  const handleMarkAllRead = useCallback(() => {
    setMarkingAllRead(true);
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((i) => ({ ...i, read_at: i.read_at ?? readAt })));
    void markAllNotificationsRead()
      .then(() => badges.refetch())
      .finally(() => setMarkingAllRead(false));
  }, [badges]);

  const trigger = (
    <IconButton
      aria-label={unreadTotal > 0 ? `Notifications, ${unreadTotal} unread` : 'Notifications'}
      variant="ghost"
    >
      <span className="relative inline-flex">
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        {unreadTotal > 0 ? (
          <span
            aria-hidden
            className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-500 px-1 font-fw-mono text-caption font-semibold leading-none text-text-on-accent"
          >
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        ) : null}
      </span>
    </IconButton>
  );

  const panel = (
    <NotificationFeedPanel
      items={items}
      loading={loading && items.length === 0}
      error={items.length === 0 ? error : null}
      filter={filter}
      onFilterChange={setFilter}
      onItemClick={handleItemClick}
      onMarkAllRead={handleMarkAllRead}
      markingAllRead={markingAllRead}
      unreadCount={unreadTotal}
    />
  );

  if (isDesktop) {
    return (
      <PopoverPanel
        open={open}
        onOpenChange={setOpen}
        trigger={trigger}
        side="bottom"
        align="end"
        surface="matte"
        ariaLabel="Notifications"
        className="w-[400px] max-w-[calc(100vw-2rem)] p-0"
      >
        {panel}
      </PopoverPanel>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen} trigger={trigger} side="bottom" title="Notifications">
      <Sheet.Body className="px-0 py-0">{panel}</Sheet.Body>
    </Sheet>
  );
}
