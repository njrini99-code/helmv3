/**
 * The window a weekly coach recap covers.
 *
 * `builder.ts` documents the intent as "the 7 days ending on the Sunday this
 * cron fires", but computed it as:
 *
 *     const weekStart = new Date(weekEnd.getTime() - 7 * 86400_000);
 *     …
 *     .gte('round_date', weekStart.toISOString().slice(0, 10))
 *     .lte('round_date', weekEnd.toISOString().slice(0, 10));
 *
 * `round_date` is a DATE column and both bounds are inclusive, so subtracting a
 * full seven days spans EIGHT calendar days. Two consecutive fires produced
 * `[2026-08-03, 2026-08-10]` and `[2026-08-10, 2026-08-17]` — the boundary day
 * counted in both emails, and the subject line rendered the same 8-day span as
 * "the week".
 *
 * Six days back, inclusive of both ends, is seven days. Consecutive weeks then
 * tile exactly: no day reported twice, no day skipped.
 *
 * TWO DIFFERENT BOUNDS ARE RETURNED ON PURPOSE. `round_date` is a DATE and must
 * be filtered on calendar days; `golf_coach_insights.created_at` is a timestamp
 * and must be filtered on instants. Collapsing them to one value is what let
 * the calendar range drift in the first place.
 */
export interface RecapWindow {
  /** Inclusive first calendar day, `YYYY-MM-DD`, for DATE columns. */
  startDate: string;
  /** Inclusive last calendar day, `YYYY-MM-DD`, for DATE columns. */
  endDate: string;
  /** Start instant for timestamp columns — midnight UTC on `startDate`. */
  startInstant: string;
  /** End instant for timestamp columns — the exact moment the cron fired. */
  endInstant: string;
}

const DAY_MS = 86_400_000;

export function recapDateWindow(weekEndIso: string): RecapWindow {
  const end = new Date(weekEndIso);
  const endDate = end.toISOString().slice(0, 10);

  // Six days, not seven — both bounds are inclusive.
  const start = new Date(end.getTime() - 6 * DAY_MS);
  const startDate = start.toISOString().slice(0, 10);

  return {
    startDate,
    endDate,
    // Midnight on the first day, so an insight created early on that day is not
    // dropped by an instant bound that lands mid-morning.
    startInstant: `${startDate}T00:00:00.000Z`,
    endInstant: weekEndIso,
  };
}
