import { isUnread, type NotificationCategoryId, type UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';

/**
 * The phone notification feed as stacks (owner 2026-10-12, the "lock screen stack" drop; section-strip.md). Pure, so the
 * rules are tested apart from the motion:
 *
 *   New       unread items, stacked by kind (the settings panel's categories: Messages, Events, CoachHelm...). The stack
 *             with the newest item comes first; inside a stack, newest first. A kind with one item is a plain card.
 *   Earlier   everything read, in one stack under New, newest first.
 *   Clearing  a card swiped away, or a stack's clear, marks it read: it leaves New and joins Earlier. Nothing is deleted.
 *   Open      one stack is fanned out at a time; when New holds a single stack, it opens fanned out.
 */
export interface ChNotificationStack {
  /** `new:<category>` or `earlier`. */
  key: string;
  kind: 'new' | 'earlier';
  category: NotificationCategoryId | null;
  /** Newest first. Never empty. */
  items: UnifiedNotificationItem[];
  unread: number;
}

export interface ChNotificationFeed {
  fresh: ChNotificationStack[];
  earlier: ChNotificationStack | null;
  unread: number;
}

const time = (i: UnifiedNotificationItem) => {
  const t = Date.parse(i.created_at);
  return Number.isNaN(t) ? 0 : t;
};
const newestFirst = (a: UnifiedNotificationItem, b: UnifiedNotificationItem) => time(b) - time(a);

/** The item's identity across both sources (an id is only unique within its table). */
export function notificationKey(item: Pick<UnifiedNotificationItem, 'id' | 'source'>): string {
  return `${item.source}:${item.id}`;
}

export function stackFeed(items: readonly UnifiedNotificationItem[]): ChNotificationFeed {
  const byKind = new Map<NotificationCategoryId, UnifiedNotificationItem[]>();
  const read: UnifiedNotificationItem[] = [];
  for (const item of items) {
    if (!isUnread(item)) {
      read.push(item);
      continue;
    }
    const list = byKind.get(item.category) ?? [];
    list.push(item);
    byKind.set(item.category, list);
  }
  const fresh: ChNotificationStack[] = [...byKind.entries()]
    .map(([category, list]) => {
      const sorted = [...list].sort(newestFirst);
      return { key: `new:${category}`, kind: 'new' as const, category, items: sorted, unread: sorted.length };
    })
    .sort((a, b) => newestFirst(a.items[0]!, b.items[0]!));
  const earlier = read.length ? { key: 'earlier', kind: 'earlier' as const, category: null, items: [...read].sort(newestFirst), unread: 0 } : null;
  return { fresh, earlier, unread: fresh.reduce((n, s) => n + s.unread, 0) };
}

/** Which stack shows fanned out: the one chosen, while it still exists; else the only New stack, when there is one. */
export function openStack(feed: ChNotificationFeed, chosen: string | null): string | null {
  const keys = [...feed.fresh.map((s) => s.key), ...(feed.earlier ? [feed.earlier.key] : [])];
  if (chosen !== null && keys.includes(chosen)) return chosen;
  if (chosen === null && feed.fresh.length === 1 && feed.fresh[0]!.items.length > 1) return feed.fresh[0]!.key;
  return null;
}

/** The items marked read now: a local copy with `read_at` set on the given keys, so the feed restacks at once. */
export function markLocallyRead(items: readonly UnifiedNotificationItem[], keys: ReadonlySet<string>, at: string): UnifiedNotificationItem[] {
  return items.map((i) => (keys.has(notificationKey(i)) && !i.read_at ? { ...i, read_at: at } : i));
}

/** A notification's age as the feed shows it: Now, 9m, 2h, 3d, then the date. */
export function ago(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 1) return 'Now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "2 more" under a folded stack's top card. */
export function moreLabel(stack: ChNotificationStack): string | null {
  const n = stack.items.length - 1;
  return n > 0 ? `${n} more` : null;
}
