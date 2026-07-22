'use client';

/**
 * ============================================================================
 * NotificationsLatestModule — compact home-page "Latest" digest
 * ----------------------------------------------------------------------------
 * 4-5 most recent unified-notifications items on the coach/player home. "View
 * all" opens the SAME NotificationBell panel (via NotificationPanelContext)
 * rather than growing a second feed UI. Honest-empty: renders NOTHING once
 * loaded with zero items — the bell (always present in the top bar) stays the
 * one source of truth, so an empty "Latest" card would just be dead space on
 * an already-busy home page.
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Surface, Button, SkeletonList } from '@/components/fairway';
import { NotificationRow } from './NotificationRow';
import { useNotificationPanel } from './NotificationPanelContext';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { getUnifiedNotifications, markNotificationRead } from '@/app/golf/actions/unified-notifications';
import type { UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';

const LATEST_LIMIT = 5;

export function NotificationsLatestModule() {
  const router = useRouter();
  const badges = useNotificationBadges();
  const { setOpen } = useNotificationPanel();

  const [items, setItems] = useState<UnifiedNotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await getUnifiedNotifications({ limit: LATEST_LIMIT });
        if (cancelled) return;
        if (result.success && result.data) {
          setItems(result.data.items);
        }
      } catch {
        // Treated the same as "genuinely nothing new" — see the honest-empty
        // note above. The bell in the top bar is the resilient source of
        // truth; this module just quietly declines to render.
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleItemClick = useCallback(
    (item: UnifiedNotificationItem) => {
      const wasUnread = item.read_at == null;
      const readAt = new Date().toISOString();
      setItems((prev) =>
        prev.map((i) => (i.id === item.id && i.source === item.source ? { ...i, read_at: i.read_at ?? readAt } : i)),
      );
      if (item.action_url) router.push(item.action_url);
      if (wasUnread) {
        void markNotificationRead(item.id, item.source).then(() => badges.refetch());
      }
    },
    [badges, router],
  );

  if (loading) {
    return (
      <section aria-label="Latest notifications" className="flex flex-col gap-3">
        <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">Latest</h2>
        <Surface elevation="border" padding="sm">
          <SkeletonList rows={3} label="Loading latest notifications" />
        </Surface>
      </section>
    );
  }

  if (!loaded || items.length === 0) return null;

  return (
    <section aria-label="Latest notifications" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">Latest</h2>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          View all
        </Button>
      </div>
      {/* Section hairline — the same "more-green ruling" every other home
          section band uses (Recent Rounds, etc.). */}
      <div aria-hidden="true" className="h-px w-full bg-accent-300" />
      <Surface elevation="border" padding="none">
        <ul className="divide-y divide-border-subtle">
          {items.map((item) => (
            <li key={`${item.source}:${item.id}`}>
              <NotificationRow item={item} onClick={handleItemClick} density="compact" />
            </li>
          ))}
        </ul>
      </Surface>
    </section>
  );
}
