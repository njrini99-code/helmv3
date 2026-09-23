/**
 * Scope + window label for the A7 distance-profile surface (addendum §13,
 * slice 1).
 *
 * ── WHY ROLLING 12 MONTHS, NOT "MATCH THE PAGE" ─────────────────────────
 * The instruction for this slice was to match whatever window the Game
 * Fingerprint page's existing Approach/Scoring sections use, and fall back
 * to a labeled rolling 12 months only if the page has no single window.
 * Checked directly (`player-fingerprint.ts`'s own doc comment on
 * `metrics_rounds`): those sections read `golf_player_stats_cache`, "whose
 * window is whatever the last recompute covered" — an opaque, externally
 * (cron-)computed window with no `window_start`/`window_end` this surface
 * could read and mirror. There is no single window to match, so this
 * module builds the documented fallback instead: a real, labeled rolling
 * window, so a coach never mistakes "this screen" for "that screen"'s
 * numbers.
 *
 * ── WHY window_end = today, NOT null ────────────────────────────────────
 * `loadPlayerContext` treats a `null` `window_end` as unbounded — every
 * round through the present AND any future-dated one. A closed
 * `[today-12mo, today]` range is both more precise and gives
 * `describeDistanceProfileWindow` two real dates to print.
 */
import { addMonths } from 'date-fns';
import { formatDateOnlyFull } from '@/lib/golf/date-only';
import type { AnalysisScope } from '../context/types';

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * A rolling 12-month `AnalysisScope` for one player, ending `now` (default
 * the real current instant — a caller passes a fixed `now` only in a test).
 * `analysis_cutoff` is `now` itself: nothing recorded after this instant is
 * "known" for this read, matching every other A1 caller's convention.
 */
export function buildRollingDistanceProfileScope(playerId: string, now: Date = new Date()): AnalysisScope {
  return {
    player_id: playerId,
    window_start: toDateOnly(addMonths(now, -12)),
    window_end: toDateOnly(now),
    analysis_cutoff: now.toISOString(),
  };
}

/**
 * The label a surface prints ALONGSIDE its numbers — "no surface displays
 * stronger certainty than its packet" extends to the window a number was
 * computed over, not just its support status. Falls back to a neutral
 * "all recorded rounds" only for a scope this module didn't build itself
 * (e.g. a lifetime scope some other caller constructs) — never fabricates
 * a window it cannot see.
 */
export function describeDistanceProfileWindow(scope: AnalysisScope): string {
  if (!scope.window_start || !scope.window_end) return 'All recorded rounds';
  const start = formatDateOnlyFull(scope.window_start);
  const end = formatDateOnlyFull(scope.window_end);
  return `Last 12 months (${start}–${end})`;
}
