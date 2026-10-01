/**
 * ============================================================================
 * unified-notifications-model — PURE normalize / categorize / merge / sort
 * ----------------------------------------------------------------------------
 * The read-side data model for the unified in-app notifications feed. Kept
 * separate from `unified-notifications.ts` (a `'use server'` file, which per
 * Next.js can only export async server actions — a plain sync helper export
 * there breaks the build) so every piece of this logic is a plain, testable
 * function with zero Supabase/Next.js dependency.
 *
 * Sources unioned into ONE item shape:
 *   • `notifications`               — CoachHelm dispatch.ts + task-reminders.ts
 *     writes (new_insight, goal_achieved, round_review_ready, task reminders…).
 *     `data.coachhelm_category` (see src/lib/coachhelm/v3/notifications/
 *     dispatch.ts) carries the TRUE semantic category; `type` alone collapses
 *     every CoachHelm category to the single `dev_plan_assigned` enum value.
 *   • `golf_calendar_notifications` — event/RSVP lifecycle rows (golf.ts).
 *     Always categorized 'events'.
 *
 * `category` is one of the DELIVERY_NOTIFICATION_GROUPS ids
 * (src/lib/coachhelm/v3/notifications/types.ts) — the SAME taxonomy the
 * settings panel's category toggles use, reused verbatim so the feed's filter
 * chips never invent a second vocabulary.
 * ========================================================================== */

import { DELIVERY_NOTIFICATION_GROUPS } from '@/lib/coachhelm/v3/notifications/types';
import type { Json } from '@/lib/types/database';

/** The two tables a unified item can come from. */
export type NotificationSource = 'notifications' | 'golf_calendar_notifications';

/** Mirrors DELIVERY_NOTIFICATION_GROUPS ids — see the drift-guard test. */
export type NotificationCategoryId =
  | 'messages'
  | 'events'
  | 'announcements'
  | 'tasks'
  | 'coachhelm'
  | 'pipeline'
  | 'profile_views';

/** Every category id, in taxonomy order — derived so the feed's filter chips
 *  can never drift from the canonical settings-panel groups. */
export const NOTIFICATION_CATEGORY_IDS: readonly NotificationCategoryId[] =
  DELIVERY_NOTIFICATION_GROUPS.map((g) => g.id as NotificationCategoryId);

/** The one normalized item shape the feed UI renders. */
export interface UnifiedNotificationItem {
  id: string;
  source: NotificationSource;
  category: NotificationCategoryId;
  title: string;
  body: string | null;
  action_url: string | null;
  created_at: string;
  read_at: string | null;
}

/** Subset of `notifications` columns the list/count queries select. */
export interface RawNotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  created_at: string | null;
  read_at: string | null;
  data: Json | null;
}

/** Subset of `golf_calendar_notifications` columns the list query selects. */
export interface RawCalendarNotificationRow {
  id: string;
  notification_type: string;
  title: string | null;
  message: string | null;
  action_url: string | null;
  created_at: string | null;
  read_at: string | null;
}

// A row with neither a real created_at nor any way to place it in time sorts
// to the very bottom (oldest) rather than crashing the sort or floating to
// the top as a false "newest" item.
const EPOCH = new Date(0).toISOString();

function readJsonObject(data: Json | null): Record<string, unknown> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

/**
 * `notifications` → category. `data.coachhelm_category` (always set by
 * dispatch.ts) is the authoritative signal for CoachHelm rows — the `type`
 * enum alone can't distinguish them (every CoachHelm category collapses to
 * `dev_plan_assigned`, see dispatch.ts's CATEGORY_DELIVERY map). Task
 * reminders (task-reminders.ts) tag `data.task_type: 'task_reminder'` under
 * the shared `event_reminder` enum value, so that check comes before the
 * `type` switch too — otherwise every task reminder would misfile as 'events'.
 */
export function categorizeNotificationRow(row: Pick<RawNotificationRow, 'type' | 'data'>): NotificationCategoryId {
  const data = readJsonObject(row.data);
  if (typeof data.coachhelm_category === 'string') return 'coachhelm';
  // Per-category receipt types (dispatch.ts inAppTypeFor, once the enum
  // migration lands) are CoachHelm by construction.
  if (row.type.startsWith('coachhelm_')) return 'coachhelm';
  if (data.task_type === 'task_reminder') return 'tasks';
  // Announcement fan-out rows (announcements.ts createEnrichedAnnouncement)
  // share the `event_reminder` enum value the same way task reminders do —
  // the `data.announcement_id` tag is the authoritative signal.
  if (typeof data.announcement_id === 'string') return 'announcements';

  switch (row.type) {
    case 'message':
      return 'messages';
    case 'event_reminder':
      return 'events';
    case 'team_invite':
    case 'team_join_request':
    case 'team_join_approved':
    case 'team_join_rejected':
    case 'team_join':
      return 'pipeline';
    case 'profile_view':
    case 'watchlist_add':
    case 'video_view':
      return 'profile_views';
    case 'dev_plan_assigned':
      // Defensive fallback: an engine-authored row that lost its
      // `data.coachhelm_category` tag is still a CoachHelm signal, not a
      // generic event.
      return 'coachhelm';
    default:
      return 'events';
  }
}

/** `golf_calendar_notifications` rows are always event/RSVP lifecycle items. */
export function categorizeCalendarNotificationRow(
  _row: Pick<RawCalendarNotificationRow, 'notification_type'>,
): NotificationCategoryId {
  return 'events';
}

export function normalizeNotificationRow(row: RawNotificationRow): UnifiedNotificationItem {
  return {
    id: row.id,
    source: 'notifications',
    category: categorizeNotificationRow(row),
    title: row.title,
    body: row.body,
    action_url: row.action_url,
    created_at: row.created_at ?? EPOCH,
    read_at: row.read_at,
  };
}

export function normalizeCalendarNotificationRow(row: RawCalendarNotificationRow): UnifiedNotificationItem {
  return {
    id: row.id,
    source: 'golf_calendar_notifications',
    category: categorizeCalendarNotificationRow(row),
    title: row.title ?? 'Calendar update',
    body: row.message,
    action_url: row.action_url,
    created_at: row.created_at ?? EPOCH,
    read_at: row.read_at,
  };
}

/** NaN-safe millisecond value for sorting — an unparsable timestamp sorts as
 *  the oldest possible item instead of throwing or floating to the top. */
function timeValue(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * Union two already-fetched, per-source item lists into one feed, newest
 * first. Stable for equal timestamps (Array#sort is stable per spec — the
 * relative order of same-instant items from the same source is preserved).
 * Pass `limit` to cap the merged result (applied AFTER the merge/sort, so a
 * limit never favors one source over the other).
 */
export function mergeAndSortNotifications(
  a: readonly UnifiedNotificationItem[],
  b: readonly UnifiedNotificationItem[],
  limit?: number,
): UnifiedNotificationItem[] {
  const merged = [...a, ...b].sort((x, y) => timeValue(y.created_at) - timeValue(x.created_at));
  return typeof limit === 'number' && limit >= 0 ? merged.slice(0, limit) : merged;
}

export function isUnread(item: Pick<UnifiedNotificationItem, 'read_at'>): boolean {
  return item.read_at == null;
}

export function countUnread(items: readonly Pick<UnifiedNotificationItem, 'read_at'>[]): number {
  return items.reduce((n, item) => n + (isUnread(item) ? 1 : 0), 0);
}

// ── Query limit clamping ─────────────────────────────────────────────────────

export const DEFAULT_NOTIFICATIONS_LIMIT = 30;
export const MAX_NOTIFICATIONS_LIMIT = 100;

/** Clamp a caller-supplied `limit` to a sane, positive, integer bound. */
export function clampNotificationsLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit) || limit <= 0) return DEFAULT_NOTIFICATIONS_LIMIT;
  return Math.min(Math.floor(limit), MAX_NOTIFICATIONS_LIMIT);
}

// ── Day-bucket grouping (Today / Yesterday / Earlier) ───────────────────────

export type DayBucket = 'today' | 'yesterday' | 'earlier';

function startOfDay(d: Date): number {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c.getTime();
}

/** Buckets one item's `created_at` relative to `now` (defaults to `new Date()`,
 *  injectable for deterministic tests). Unparsable dates fall to 'earlier'. */
export function dayBucketFor(iso: string, now: Date = new Date()): DayBucket {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'earlier';
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  if (t >= todayStart) return 'today';
  if (t >= yesterdayStart) return 'yesterday';
  return 'earlier';
}

/** Groups already-sorted (newest-first) items into Today/Yesterday/Earlier,
 *  preserving each bucket's incoming order. Empty buckets are omitted. */
export function groupByDayBucket(
  items: readonly UnifiedNotificationItem[],
  now: Date = new Date(),
): Array<{ bucket: DayBucket; items: UnifiedNotificationItem[] }> {
  const buckets: Record<DayBucket, UnifiedNotificationItem[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  };
  for (const item of items) {
    buckets[dayBucketFor(item.created_at, now)].push(item);
  }
  return (['today', 'yesterday', 'earlier'] as const)
    .filter((bucket) => buckets[bucket].length > 0)
    .map((bucket) => ({ bucket, items: buckets[bucket] }));
}

export const DAY_BUCKET_LABEL: Record<DayBucket, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  earlier: 'Earlier',
};

// ── Category filtering ──────────────────────────────────────────────────────

/** 'all' plus every category id — the filter chip row's value space. */
export type NotificationFilter = 'all' | NotificationCategoryId;

export function itemMatchesFilter(item: UnifiedNotificationItem, filter: NotificationFilter): boolean {
  return filter === 'all' || item.category === filter;
}

/** Per-category counts (plus 'all') for the filter chips' badge numbers. */
export function countByCategory(
  items: readonly UnifiedNotificationItem[],
): Record<NotificationFilter, number> {
  const counts = { all: items.length } as Record<NotificationFilter, number>;
  for (const id of NOTIFICATION_CATEGORY_IDS) counts[id] = 0;
  for (const item of items) counts[item.category] += 1;
  return counts;
}

// ── First page: stale calendar collapse + CoachHelm reservation (rows 53/56) ─

/**
 * Calendar rows describe events and RSVPs; after a month the event is almost
 * always past. Prod had 1,581 of 3,480 unread calendar rows older than 30
 * days (median unread age 27 days, one user at 407 unread), which made the
 * badge a number nobody could act on. Older calendar rows stop counting as
 * unread and collapse into one summary item on the first page. Nothing is
 * deleted or marked read in the database.
 */
export const CALENDAR_UNREAD_MAX_AGE_DAYS = 30;

export function calendarUnreadCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - CALENDAR_UNREAD_MAX_AGE_DAYS * 86_400_000).toISOString();
}

export const CALENDAR_OLDER_SUMMARY_ID = 'calendar-older-summary';

/** CoachHelm slots held on a first page: min(5, floor(limit / 3)). */
export function reservedCoachHelmSlots(limit: number): number {
  return Math.min(5, Math.floor(limit / 3));
}

/**
 * The feed's first page. Calendar rows older than the cutoff are dropped and
 * replaced by one summary item (already "read", so it never counts toward
 * the badge and a click only navigates). CoachHelm receipts get a reserved
 * share of the page: with 4,971 calendar rows against 228 CoachHelm rows for
 * the active players' users, a time-only merge let a calendar burst push
 * every receipt out of a limit-N page. Displaced items are the OLDEST
 * non-CoachHelm ones; the result stays newest-first.
 */
export function composeFirstPage(args: {
  notifications: readonly UnifiedNotificationItem[];
  calendar: readonly UnifiedNotificationItem[];
  /** Total calendar rows (read or not) older than the cutoff, from a count query. */
  staleCalendarCount: number;
  limit: number;
  now?: Date;
}): UnifiedNotificationItem[] {
  const cutoffIso = calendarUnreadCutoffIso(args.now);
  const cutoff = Date.parse(cutoffIso);
  const freshCalendar = args.calendar.filter((c) => timeValue(c.created_at) >= cutoff);
  const merged = mergeAndSortNotifications(args.notifications, freshCalendar);

  const hasSummary = args.staleCalendarCount > 0;
  const capacity = Math.max(0, args.limit - (hasSummary ? 1 : 0));
  let page = merged.slice(0, capacity);

  const held = page.filter((i) => i.category === 'coachhelm').length;
  const want = Math.min(reservedCoachHelmSlots(args.limit), capacity) - held;
  if (want > 0) {
    const promoted = merged
      .slice(capacity)
      .filter((i) => i.category === 'coachhelm')
      .slice(0, want);
    if (promoted.length > 0) {
      let toDrop = promoted.length;
      const kept: UnifiedNotificationItem[] = [];
      for (let i = page.length - 1; i >= 0; i--) {
        const item = page[i]!;
        if (toDrop > 0 && item.category !== 'coachhelm') {
          toDrop--;
          continue;
        }
        kept.unshift(item);
      }
      page = mergeAndSortNotifications(kept, promoted);
    }
  }

  if (hasSummary) {
    const n = args.staleCalendarCount;
    page.push({
      id: CALENDAR_OLDER_SUMMARY_ID,
      source: 'golf_calendar_notifications',
      category: 'events',
      title: `${n} older calendar ${n === 1 ? 'update' : 'updates'}`,
      body: `Calendar updates from more than ${CALENDAR_UNREAD_MAX_AGE_DAYS} days ago.`,
      action_url: '/golf/dashboard/calendar',
      created_at: cutoffIso,
      read_at: cutoffIso,
    });
  }
  return page;
}

/** The insight a CoachHelm receipt points at, when it points at one. */
export function insightIdOfReceipt(data: Json | null): string | null {
  const obj = readJsonObject(data);
  return typeof obj.insightId === 'string' && obj.insightId ? obj.insightId : null;
}

/**
 * Which receipts point at an insight the reader can no longer see. `rows` may
 * repeat an id (page rows + unread scan); each id counts once.
 */
export function partitionExpiredReceipts(
  rows: ReadonlyArray<{ id: string; read_at: string | null; data: Json | null }>,
  visibleInsightIds: ReadonlySet<string>,
): { expired: Set<string>; expiredUnread: number } {
  const expired = new Set<string>();
  let expiredUnread = 0;
  for (const r of rows) {
    if (expired.has(r.id)) continue;
    const insightId = insightIdOfReceipt(r.data);
    if (!insightId || visibleInsightIds.has(insightId)) continue;
    expired.add(r.id);
    if (r.read_at == null) expiredUnread++;
  }
  return { expired, expiredUnread };
}
