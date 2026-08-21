/**
 * Pure classification for the Tracer admin activity feed
 * (src/app/golf/actions/admin-tracer-data.ts). Kept out of that file
 * because it carries a module-level `'use server'` directive, which
 * requires every exported function to be async — this is synchronous on
 * purpose so it can be unit-tested without mocking Supabase.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
/** Exported so other "is this round genuinely stuck" callers (the admin
 *  Bridge briefing's `checkStuckRounds`) use the SAME idle-window definition
 *  as this classifier, rather than a second, independently-drifting pair of
 *  numbers. */
export const STUCK_HOURS_THRESHOLD = 1;
/** Upper bound on idle time for the loud "stuck" tier. A round idle less
 *  than this was plausibly touched today and then halted — worth an urgent
 *  badge. Past it, "stuck" stops meaning "just halted" and starts meaning
 *  "quietly dead," which is what the quieter "abandoned" tier is for. */
export const STUCK_TIER_MAX_IDLE_HOURS = 24;

export type InProgressActivityType = 'round_in_progress' | 'round_stuck' | 'round_abandoned';

/**
 * Classifies an `in_progress` round's presentation in the Tracer activity
 * feed / round inspector.
 *
 * Mirrors the "created in the last 30 days" recency gate already applied to
 * `round_started` activity (admin-tracer-data.ts, ~line 804) — a round
 * nobody has touched in months doesn't belong in "recent activity" at all,
 * so this returns `null` outside that window and the caller should not
 * surface an activity item (though the round itself may still be listed
 * elsewhere, e.g. the round inspector table).
 *
 * Within the window, a round idle 1h+ only counts as "stuck" — the loud,
 * highest-priority state that should sort to the top with a red badge — if
 * it has ALSO been idle less than STUCK_TIER_MAX_IDLE_HOURS. Idle longer
 * than that, it renders as the quieter "abandoned" tier instead.
 *
 * PR #1559 originally gated this on the round's `created_at` instead
 * (`createdAt` within the last 7 days) — a proxy for "was this recently
 * active," not the thing itself. Verified against production 2026-08-21:
 * 3 of 10 live in-progress rounds, created within the last 6 days but idle
 * 88–133 hours, still tiered "stuck" under that proxy — a round created
 * recently but abandoned days ago read identically to one that halted an
 * hour ago. Idle duration (already computed below as `hoursInactive`) is a
 * direct measure of "recently active", so `createdAt` is no longer part of
 * this decision at all — an old round touched 10 minutes ago is exactly as
 * "stuck" as a brand-new one touched 10 minutes ago, and a round created
 * yesterday but idle for days is exactly as "abandoned" as one created
 * months ago.
 */
export function classifyInProgressActivity(
  updatedAt: string,
  now: number = Date.now()
): InProgressActivityType | null {
  const updatedAtMs = new Date(updatedAt).getTime();
  if (now - updatedAtMs > THIRTY_DAYS_MS) return null;

  const hoursInactive = (now - updatedAtMs) / (1000 * 60 * 60);
  if (hoursInactive < STUCK_HOURS_THRESHOLD) return 'round_in_progress';

  return hoursInactive < STUCK_TIER_MAX_IDLE_HOURS ? 'round_stuck' : 'round_abandoned';
}
