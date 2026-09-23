/**
 * Scope + window label for the A4 slice 3b Round Review sequence-attribution
 * mount (addendum §13, work package A4).
 *
 * ── WHY ROLLING 12 MONTHS ────────────────────────────────────────────────
 * The Round Review page has no single existing window this addendum could
 * read and mirror: `getPlayerStandingForReview` (`round-review-system.ts`)
 * reads a cron-refreshed cache (`v3-standing-refresh`) whose window is
 * whatever the last refresh covered, not a `window_start`/`window_end` this
 * surface could read back. There is no window to match, so — same
 * reasoning the A7 Scoring/Distance-Profile surfaces already documented for
 * the sibling Game Fingerprint page — this builds a real, labeled rolling
 * window instead: a coach never mistakes this section's numbers for a
 * different screen's.
 *
 * ── WHY A SEPARATE COPY, NOT A SHARED IMPORT ────────────────────────────
 * A7's `distance-profile-window.ts` (`coachhelm_a7_distance_profile_surface`
 * / `coachhelm_a7_scoring_surface`, PR #2010) builds the identical rolling
 * scope but is not on `main` yet. This PR is scoped to stack on #2015 and
 * #2020 only — importing from #2010 would make this PR depend on a THIRD
 * unmerged PR. The month-arithmetic below is a deliberate, small copy of
 * that module's own UTC-safe logic (see its doc comment for the full
 * leap-year/local-time reasoning), not a reinvention — reconcile the two
 * into one shared module whenever #2010 lands.
 *
 * ── WHY window_end = today, NOT null ────────────────────────────────────
 * `loadPlayerContext` treats a `null` `window_end` as unbounded. A closed
 * `[today-12mo, today]` range is both more precise and gives
 * `describeSequenceAttributionWindow` two real dates to print.
 */
import { formatDateOnlyFull } from '@/lib/golf/date-only';
import type { AnalysisScope } from '../context/types';

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Subtracts `months` from `date`, computed entirely from UTC calendar
 * fields. Mirrors `date-fns`' own `addMonths` end-of-month clamping (Jan 31
 * minus 1 month -> Feb 28, never overflowing into March) without reading
 * local-time getters — see `distance-profile-window.ts` (#2010) for the
 * full account of the local-time bug this avoids.
 */
function subtractMonthsUTC(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const endOfTargetMonth = new Date(Date.UTC(year, month - months + 1, 0));
  const daysInTargetMonth = endOfTargetMonth.getUTCDate();

  return day >= daysInTargetMonth
    ? endOfTargetMonth
    : new Date(Date.UTC(endOfTargetMonth.getUTCFullYear(), endOfTargetMonth.getUTCMonth(), day));
}

/**
 * A rolling 12-month `AnalysisScope` for one player, ending `now` (default
 * the real current instant — a caller passes a fixed `now` only in a test).
 * `analysis_cutoff` is `now` itself, matching every other A1 caller.
 */
export function buildRollingSequenceAttributionScope(playerId: string, now: Date = new Date()): AnalysisScope {
  return {
    player_id: playerId,
    window_start: toDateOnly(subtractMonthsUTC(now, 12)),
    window_end: toDateOnly(now),
    analysis_cutoff: now.toISOString(),
  };
}

/** Human-readable window label for the section's header, matching
 *  `describeDistanceProfileWindow`'s (#2010) exact phrasing so a coach who
 *  has seen that surface reads the same convention here. */
export function describeSequenceAttributionWindow(scope: AnalysisScope): string {
  if (!scope.window_start || !scope.window_end) return 'All recorded rounds';
  const start = formatDateOnlyFull(scope.window_start);
  const end = formatDateOnlyFull(scope.window_end);
  return `Last 12 months (${start}–${end})`;
}
