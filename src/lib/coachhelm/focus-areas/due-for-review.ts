/**
 * Pkg 9 slice 4 — the coach-facing "due for review" derivation.
 *
 * Pure and directive-free on purpose — the coach UI, which already has
 * every focus area for the roster in props (`intelligence/page.tsx` selects
 * `target_kind` + `target_date` into `PlayersGridFocusArea`), derives "due"
 * client-side with no extra fetch, mirroring
 * `RosterHealthHeader.computeRosterHealth`'s own "derived from the same
 * props, no new fetch" convention.
 *
 * "Due" is derived AT READ TIME from `target_date` — never written to a
 * column or a cron — so a coach adjusting a target date is reflected the
 * next render, with nothing to keep in sync.
 *
 * `target_kind === 'rounds'` areas are deliberately excluded: rounds-based
 * timeframes need the player's actual round count since `started_at`,
 * which this pure function has no scope for. Left for a later slice.
 *
 * TIMEZONE (#1998 review fix): `target_date` is a coach-local CALENDAR date
 * (a plain `<input type=date>` value, `YYYY-MM-DD`, no time component) — it
 * means "this day on the team's wall clock", not a UTC instant. An earlier
 * version of this module computed "today" via `new Date()` read in UTC,
 * which is exactly the bug `src/lib/golf/timezone.ts`'s `todayIsoInZone` /
 * `task-overdue.ts`'s `isGolfTaskOverdueInZone` were already written to fix
 * (#1487): from the evening on, in every zone west of UTC, "today" had
 * already rolled over in UTC while it was still yesterday on the wall — an
 * area due TODAY read as `'overdue'` for the entire evening. This module no
 * longer computes "today" at all — every caller must resolve
 * `todayIsoInZone(teamTimezone)` SERVER-SIDE (the team's actual zone,
 * `golf_team_settings.timezone`, default `'America/New_York'` — see
 * `intelligence/page.tsx`) and pass the resulting `YYYY-MM-DD` string in as
 * `todayIso`. Deliberately no `Date`-based default: computing it inside a
 * CLIENT component (`DueForReviewPanel`) would also diverge between SSR
 * (UTC on the server) and hydration (the browser's own zone), a hydration
 * mismatch on top of the wrong answer.
 */

/** The statuses "due for review" evaluates — mirrors
 *  `ACTIONABLE_FOCUS_AREA_STATUSES` in `development.ts` (live, ongoing
 *  work). 'proposed' (not yet accepted — no real improvement window) and
 *  'completed' / 'declined' (already resolved) are never "due". */
export const FOCUS_AREA_DUE_STATUSES = ['active', 'in_progress', 'paused'] as const;

export type FocusAreaDueReason = 'overdue' | 'due_soon';

/** Default review-window boundary: a target within this many days counts
 *  as "due soon" (inclusive of today). */
export const FOCUS_AREA_DUE_WITHIN_DAYS_DEFAULT = 7;

export interface FocusAreaDueInput {
  /** Optional (not just nullable) so callers whose row type marks `status`
   *  optional — e.g. `FocusAreaCardData` — are structurally assignable. */
  status?: string | null;
  target_kind?: string | null;
  /** ISO date (YYYY-MM-DD), or a full timestamp — only the date part is read. */
  target_date?: string | null;
}

function addDaysToIsoDate(iso: string, days: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Classify one focus area as overdue / due soon / not due, relative to
 * `opts.todayIso` — the caller's already-zone-resolved `YYYY-MM-DD` "today"
 * (see the module doc: `todayIsoInZone(teamTimezone)`, resolved server-side,
 * never computed here). `null` covers every non-due case at once — the
 * wrong `target_kind`, no `target_date`, a non-actionable status, or a
 * target further out than the window — so callers filter with a single
 * truthy check instead of re-deriving each exclusion.
 *
 * Boundary (inclusive both ends): `target_date < todayIso` → 'overdue';
 * `todayIso <= target_date <= todayIso + dueWithinDays` → 'due_soon'.
 */
export function focusAreaDueReason(
  area: FocusAreaDueInput,
  opts: { todayIso: string; dueWithinDays?: number },
): FocusAreaDueReason | null {
  if (area.target_kind !== 'date') return null;
  if (!area.target_date) return null;
  if (!area.status || !(FOCUS_AREA_DUE_STATUSES as readonly string[]).includes(area.status)) {
    return null;
  }

  const { todayIso } = opts;
  const dueWithinDays = opts.dueWithinDays ?? FOCUS_AREA_DUE_WITHIN_DAYS_DEFAULT;
  const targetIso = area.target_date.slice(0, 10);

  if (targetIso < todayIso) return 'overdue';
  const boundaryIso = addDaysToIsoDate(todayIso, dueWithinDays);
  if (targetIso <= boundaryIso) return 'due_soon';
  return null;
}

export interface DueFocusAreaEntry<T> {
  area: T;
  reason: FocusAreaDueReason;
}

/**
 * Filter + classify + sort (overdue first, then soonest target_date) a set
 * of focus areas, relative to the caller's zone-resolved `opts.todayIso`
 * (see the module doc). Generic over `T` so the same function runs against
 * any row shape that carries the due-relevant fields — currently just the
 * UI's `PlayersGridFocusArea` props.
 */
export function computeDueFocusAreas<
  T extends FocusAreaDueInput & { id: string; player_id: string; title?: string | null },
>(areas: readonly T[], opts: { todayIso: string; dueWithinDays?: number }): DueFocusAreaEntry<T>[] {
  return areas
    .map((area) => ({ area, reason: focusAreaDueReason(area, opts) }))
    .filter((entry): entry is DueFocusAreaEntry<T> => entry.reason !== null)
    .sort((a, b) => {
      if (a.reason !== b.reason) return a.reason === 'overdue' ? -1 : 1;
      return (a.area.target_date ?? '').localeCompare(b.area.target_date ?? '');
    });
}
