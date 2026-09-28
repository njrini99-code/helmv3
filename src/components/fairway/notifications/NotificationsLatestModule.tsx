"use client";

/**
 * ============================================================================
 * NotificationsLatestModule — compact home-page "Latest" digest
 * ----------------------------------------------------------------------------
 * 4-5 most recent unified-notifications items on the coach/player home. "View
 * all" opens the SAME NotificationBell panel (via NotificationPanelContext)
 * rather than growing a second feed UI. Renders NOTHING while loading; once
 * loaded with zero items (or after "Dismiss all") it shows a small "You're
 * all caught up" state (owner 2026-09-27). A footer carries the bell's total
 * unread count and a "Dismiss all" (mark every notification read).
 * ========================================================================== */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, X } from "lucide-react";
import { Button, IconButton } from "@/components/fairway/controls/button";
import { cn } from "@/lib/utils";
import { NotificationRow, notificationPersonFor } from "./NotificationRow";
import { useNotificationPanel } from "./NotificationPanelContext";
import { useNotificationBadges } from "@/contexts/notification-badge-context";
import {
  getUnifiedNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/golf/actions/unified-notifications";
import {
  countUnread,
  type UnifiedNotificationItem,
} from "@/app/golf/actions/unified-notifications-model";

const LATEST_LIMIT = 5;
/** Newest item key the viewer dismissed on mobile; a newer item brings the module back. */
const DISMISS_KEY = "golf:latest-notifications-dismissed";

function itemKey(item: UnifiedNotificationItem): string {
  return `${item.source}:${item.id}`;
}

/** A run of consecutive items about the same person in the same category. */
export interface NotificationGroup {
  /**
   * React key: the newest member's `source:id`, so it is unique even when the
   * same person appears in two separate runs (keying on the person made two
   * "Cole Bennett" runs collide).
   */
  key: string;
  /** `category:person` for person rows (what consecutive items must share to
   *  merge); null for rows not about a person, which never merge. */
  matchKey: string | null;
  /** Newest first (the feed is sorted newest first); never empty. */
  items: [UnifiedNotificationItem, ...UnifiedNotificationItem[]];
}

/**
 * Owner 2026-09-27: two "Message from Cole Bennett" in a row read as clutter.
 * Consecutive items from the same person and category collapse into one row
 * that shows the newest preview and a count; rows not about a person never
 * group. Unread totals are still counted per item, not per group.
 */
export function groupConsecutive(
  items: readonly UnifiedNotificationItem[],
): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  for (const item of items) {
    const person = notificationPersonFor(item);
    const matchKey = person ? `${item.category}:${person.toLowerCase()}` : null;
    const last = groups[groups.length - 1];
    if (matchKey && last && last.matchKey === matchKey) {
      last.items.push(item);
    } else {
      groups.push({ key: itemKey(item), matchKey, items: [item] });
    }
  }
  return groups;
}

export interface NotificationsLatestModuleProps {
  /**
   * PERF-03: the items read on the server with the dashboard. When given,
   * the module renders them at first paint and makes no client read (a
   * client read queued behind the shell's own actions). Omit to fetch here.
   */
  initialItems?: UnifiedNotificationItem[];
  /** Lower-cased full name → avatar URL, so rows about people show their face. */
  people?: Readonly<Record<string, string | null>>;
}

export function NotificationsLatestModule({
  initialItems,
  people,
}: NotificationsLatestModuleProps = {}) {
  const router = useRouter();
  const badges = useNotificationBadges();
  const { setOpen } = useNotificationPanel();

  const seeded = initialItems !== undefined;
  const [items, setItems] = useState<UnifiedNotificationItem[]>(() =>
    (initialItems ?? []).slice(0, LATEST_LIMIT),
  );
  const [loading, setLoading] = useState(!seeded);
  const [loaded, setLoaded] = useState(seeded);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [caughtUp, setCaughtUp] = useState(false);
  const [dismissingAll, setDismissingAll] = useState(false);

  useEffect(() => {
    try {
      setDismissedKey(window.localStorage.getItem(DISMISS_KEY));
    } catch {
      // Storage blocked: the module simply stays visible.
    }
  }, []);

  const handleDismiss = useCallback(() => {
    const newest = items[0];
    if (!newest) return;
    const key = itemKey(newest);
    setDismissedKey(key);
    try {
      window.localStorage.setItem(DISMISS_KEY, key);
    } catch {
      // Storage blocked: dismissed for this visit only.
    }
  }, [items]);

  useEffect(() => {
    if (seeded) return;
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
  }, [seeded]);

  /** Opens the newest item and marks every item in the group read. */
  const handleGroupClick = useCallback(
    (group: NotificationGroup) => {
      const newest = group.items[0];
      if (!newest) return;
      const unreadMembers = group.items.filter((i) => i.read_at == null);
      const readAt = new Date().toISOString();
      const keys = new Set(group.items.map(itemKey));
      setItems((prev) =>
        prev.map((i) =>
          keys.has(itemKey(i)) ? { ...i, read_at: i.read_at ?? readAt } : i,
        ),
      );
      if (newest.action_url) router.push(newest.action_url);
      if (unreadMembers.length > 0) {
        void Promise.all(
          unreadMembers.map((i) => markNotificationRead(i.id, i.source)),
        ).then(() => badges.refetch());
      }
    },
    [badges, router],
  );

  const handleDismissAll = useCallback(async () => {
    const previous = items;
    const readAt = new Date().toISOString();
    setDismissingAll(true);
    setItems((prev) =>
      prev.map((i) => ({ ...i, read_at: i.read_at ?? readAt })),
    );
    setCaughtUp(true);
    try {
      const result = await markAllNotificationsRead();
      if (!result.success) throw new Error(result.error ?? "mark all failed");
      void badges.refetch();
    } catch {
      setItems(previous);
      setCaughtUp(false);
    } finally {
      setDismissingAll(false);
    }
  }, [badges, items]);

  /**
   * While loading, render NOTHING — not a skeleton.
   *
   * This module's contract (see the header) is that it renders nothing once
   * loaded with zero items, because an empty "Latest" card is dead space and
   * the bell in the top bar is the real source of truth. That decision is
   * right, but the loading branch contradicted it: it rendered the "Latest"
   * heading plus three skeleton rows for the length of the fetch, and then —
   * on every load with no notifications, which is the common case on a quiet
   * team — deleted itself, heading and all, with the rest of the home page
   * jumping up to fill the hole.
   *
   * A skeleton is a promise that content is coming. This module cannot make
   * that promise, because it does not yet know whether it has anything to
   * show. Reserving space for content that may not exist is what produced the
   * appear-then-vanish; declining to reserve it is consistent with what the
   * module already does when the answer is empty.
   *
   * The trade is deliberate: when there ARE notifications the section now
   * arrives rather than resolving in place. That is one downward shift when
   * real content lands, instead of an upward shift every time nothing does.
   */
  if (loading) return null;

  if (!loaded) return null;

  const unreadCount = countUnread(items);
  // The bell's total covers more than the 5 rows shown here.
  const unreadTotal = caughtUp
    ? 0
    : Math.max(
        badges.notificationsUnread + badges.calendarNotifications,
        unreadCount,
      );
  const showCaughtUp = caughtUp || items.length === 0;
  const groups = groupConsecutive(items);

  // Mobile-only dismissal: hidden until something newer than the dismissed
  // item arrives. Desktop always shows it (md:flex overrides the hide).
  const newest = items[0];
  const dismissedOnMobile = newest != null && dismissedKey === itemKey(newest);

  return (
    <section
      aria-label="Latest notifications"
      className={cn(
        "flex-col overflow-hidden rounded-fw-lg border border-border-subtle bg-surface shadow-soft",
        dismissedOnMobile ? "hidden md:flex" : "flex",
      )}
    >
      <div className="fw-plinth-green flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-baseline gap-3">
          <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">
            Latest
          </h2>
          {/* DS-N7: the key for the rows' unread dot, in words. */}
          {!showCaughtUp && unreadCount > 0 ? (
            <span
              data-slot="latest-unread-key"
              className="flex items-center gap-1.5 font-fw-sans text-caption text-text-secondary"
            >
              {/* accent-ink is the plinth's light green: the same hue as the
                  rows' dot, bright enough to read on the deep green header. */}
              <span
                aria-hidden
                className="h-2 w-2 rounded-full bg-accent-ink"
              />
              {unreadCount} new
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            View all
          </Button>
          {showCaughtUp ? null : (
            <IconButton
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={handleDismiss}
              aria-label="Dismiss latest notifications"
            >
              <X aria-hidden />
            </IconButton>
          )}
        </div>
      </div>
      {showCaughtUp ? (
        <div
          data-slot="latest-caught-up"
          className="flex items-center gap-3 px-4 py-5"
        >
          <span
            aria-hidden
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-accent-fill text-text-on-accent-fill"
          >
            <CheckCheck size={18} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="font-fw-sans text-body font-semibold text-text-primary">
              You&apos;re all caught up
            </p>
            <p className="font-fw-sans text-body-sm text-text-secondary">
              New messages and team updates will show up here.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/*
            Owner 2026-09-27: one continuous list on the card surface — no
            per-row tiles, borders or gaps. The hairline between rows is
            inset to the text column (px-4 16 + avatar 40 + gap-3 12 = 68px),
            iOS / Linear style, so the avatars read as one column.
          */}
          <ul data-slot="latest-list" className="flex flex-col">
            {groups.map((group) => (
              <li
                key={group.key}
                className={cn(
                  "relative",
                  "before:pointer-events-none before:absolute before:left-[68px] before:right-0 before:top-0 before:h-px before:bg-border-subtle",
                  "first:before:hidden",
                )}
              >
                <NotificationRow
                  item={group.items[0]}
                  count={group.items.length}
                  unread={countUnread(group.items) > 0}
                  onClick={() => handleGroupClick(group)}
                  density="compact"
                  people={people}
                />
              </li>
            ))}
          </ul>
          {unreadTotal > 0 ? (
            <div
              data-slot="latest-footer"
              className="flex items-center justify-between gap-3 border-t border-border-subtle bg-surface-sunken px-4 py-2"
            >
              <span className="font-fw-sans text-body-sm text-text-secondary tabular-nums">
                {unreadTotal > 10 ? "10+" : unreadTotal} unread notification
                {unreadTotal === 1 ? "" : "s"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismissAll}
                disabled={dismissingAll}
              >
                Dismiss all
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
