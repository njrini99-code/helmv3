/**
 * Pure classification for the Tracer admin activity feed
 * (src/app/golf/actions/admin-tracer-data.ts). Kept out of that file
 * because it carries a module-level `'use server'` directive, which
 * requires every exported function to be async — this is synchronous on
 * purpose so it can be unit-tested without mocking Supabase.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const STUCK_HOURS_THRESHOLD = 1;

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
 * it was ALSO started recently. A round idle 1h+ that was started 7+ days
 * ago wasn't recently active then halted; it was abandoned a while back, so
 * it renders as the quieter "abandoned" tier instead. Without this split,
 * an old abandoned round (created May, touched once, never resumed) reads
 * identically to a round that halted an hour ago — which is what let 10
 * months-old abandoned rounds sort to the top of every admin surface as
 * "stuck" forever.
 */
export function classifyInProgressActivity(
  createdAt: string | null,
  updatedAt: string,
  now: number = Date.now()
): InProgressActivityType | null {
  const updatedAtMs = new Date(updatedAt).getTime();
  if (now - updatedAtMs > THIRTY_DAYS_MS) return null;

  const hoursInactive = (now - updatedAtMs) / (1000 * 60 * 60);
  if (hoursInactive < STUCK_HOURS_THRESHOLD) return 'round_in_progress';

  const createdRecently = !!createdAt && now - new Date(createdAt).getTime() <= SEVEN_DAYS_MS;
  return createdRecently ? 'round_stuck' : 'round_abandoned';
}
