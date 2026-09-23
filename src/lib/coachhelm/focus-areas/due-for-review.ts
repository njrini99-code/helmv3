/**
 * Pkg 9 slice 4 — the coach-facing "due for review" derivation.
 *
 * Pure and directive-free on purpose: it is shared by the server action
 * (`listDueFocusAreas` in `src/app/golf/actions/development.ts`, which is
 * `'use server'` and therefore cannot export a plain value or a non-async
 * helper — see the 2026-09-23 build-fix commit on this branch's slice 1a
 * predecessor) AND by the coach UI, which already has every focus area for
 * the roster in props (`intelligence/page.tsx` selects `target_kind` +
 * `target_date` into `PlayersGridFocusArea`) and derives "due" client-side
 * with no extra fetch, mirroring `RosterHealthHeader.computeRosterHealth`'s
 * own "derived from the same props, no new fetch" convention.
 *
 * "Due" is derived AT READ TIME from `target_date` — never written to a
 * column or a cron — so a coach adjusting a target date is reflected the
 * next render, with nothing to keep in sync.
 *
 * `target_kind === 'rounds'` areas are deliberately excluded: rounds-based
 * timeframes need the player's actual round count since `started_at`,
 * which neither this pure function nor the simple team-scoped read this
 * slice adds has in scope. Left for a later slice.
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

/** "Today" as a YYYY-MM-DD string in UTC — matches how `target_date` is
 *  stored (an ISO date with no time component), so comparison is a plain
 *  string compare with no timezone-boundary ambiguity. */
function toUtcIsoDate(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function addDaysToIsoDate(iso: string, days: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Classify one focus area as overdue / due soon / not due, at `opts.today`
 * (defaults to now). `null` covers every non-due case at once — the wrong
 * `target_kind`, no `target_date`, a non-actionable status, or a target
 * further out than the window — so callers filter with a single truthy
 * check instead of re-deriving each exclusion.
 *
 * Boundary (inclusive both ends): `target_date < today` → 'overdue';
 * `today <= target_date <= today + dueWithinDays` → 'due_soon'.
 */
export function focusAreaDueReason(
  area: FocusAreaDueInput,
  opts: { today?: Date; dueWithinDays?: number } = {},
): FocusAreaDueReason | null {
  if (area.target_kind !== 'date') return null;
  if (!area.target_date) return null;
  if (!area.status || !(FOCUS_AREA_DUE_STATUSES as readonly string[]).includes(area.status)) {
    return null;
  }

  const todayIso = toUtcIsoDate(opts.today ?? new Date());
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
 * of focus areas. Generic over `T` so the SAME function runs against the
 * server action's minimal DB row selection and the UI's richer
 * `PlayersGridFocusArea` props without either side needing an adapter.
 */
export function computeDueFocusAreas<
  T extends FocusAreaDueInput & { id: string; player_id: string; title?: string | null },
>(areas: readonly T[], opts: { today?: Date; dueWithinDays?: number } = {}): DueFocusAreaEntry<T>[] {
  return areas
    .map((area) => ({ area, reason: focusAreaDueReason(area, opts) }))
    .filter((entry): entry is DueFocusAreaEntry<T> => entry.reason !== null)
    .sort((a, b) => {
      if (a.reason !== b.reason) return a.reason === 'overdue' ? -1 : 1;
      return (a.area.target_date ?? '').localeCompare(b.area.target_date ?? '');
    });
}
