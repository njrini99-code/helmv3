/**
 * Fairway · Calendar · settings — shared types for S9 (calendar subscriptions).
 *
 * `calendar-feeds.ts` keeps its `CalendarFeedRecord`/`ActionResult` interfaces
 * private (no `export`) — this derives the row shape straight off
 * `getCalendarFeeds`'s own return type instead of hand-copying field names, so
 * a real drift in that action's shape fails `tsc --noEmit` here, not silently.
 */

import type { getCalendarFeeds } from '@/app/golf/actions/calendar-feeds';

type CalendarFeedsResult = Awaited<ReturnType<typeof getCalendarFeeds>>;

/**
 * One row of `getCalendarFeeds`'s success payload.
 *
 * `calendar-feeds.ts`'s local `ActionResult<T>` types `success` as a plain
 * `boolean` (not a `true`/`false` discriminant) with `data`/`error` BOTH
 * independently optional — unlike golf.ts's exported `ActionResult`, it is
 * not a discriminated union, so `Extract<..., { success: true }>` would
 * collapse to `never` here. Every real call site (including this plan's own
 * `CalendarSubscriptionsSheet`) checks `result.success && result.data`
 * together for exactly this reason; this type derives the row shape the same
 * way, off `data` directly rather than a `success` narrow.
 */
export type CalendarFeedRow = NonNullable<CalendarFeedsResult['data']>[number];

/** Derived from the row itself (not hand-copied) so a real backend addition
 *  (e.g. a future 'tournament' feed) shows up here automatically. Today this
 *  is `'team' | 'personal'` — the two types `createCalendarFeed` accepts. */
export type CalendarFeedType = CalendarFeedRow['type'];
