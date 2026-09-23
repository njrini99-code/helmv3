/**
 * A9 slice 2 (repair-plan addendum §14.12): confounding-intervention
 * detection for `comparable-attribute.ts`'s comparable-opportunity path.
 *
 * Design decision (2026-09-23, in response to slice-2 review questions):
 * `multipleInterventions` is set when ANY OTHER insight's FIRST-EVER
 * `golf_insight_exposure` to this player falls inside
 * `[baselineWindow.start, followUpWindow.end]` — the window starts at
 * BASELINE start, not at this insight's own `interventionAt`, because an
 * intervention landing during the baseline contaminates the baseline
 * measurement just as much as one landing during follow-up.
 *
 * Matched on ANY metric, not just this insight's own `target_metric_id`:
 * insight→metric mapping isn't reliable enough to trust as a filter, and a
 * swing or practice change surfaced through one insight can plausibly move a
 * player's performance on a totally different metric than the one it was
 * surfaced on. The flag means "this measurement can't be isolated to this
 * one intervention" — erring toward flagging costs nothing, since a
 * "limited" result is still written (`comparable-attribute.ts` writes it
 * with a distinct `method_version`, never drops it).
 *
 * Does NOT count: this insight itself (excluded by id), or a re-surfacing of
 * it. `golf_coach_insights` carries no lineage/supersession key today — only
 * `signature`, which identifies the RULE that generated an insight (e.g.
 * `'doubles_after_bogey'`), not an identity chain across re-creates of "the
 * same" insight. If a lineage key is ever added, exclude its chain here too.
 *
 * A9 slice 2, deferred: focus-area/drill-change confounders (repair-plan
 * addendum's item (c)) are NOT checked here. There is no existing
 * player-scoped table with a reliable activation timestamp for a focus-area
 * change to join against without inventing one — see
 * `memory/features/coachhelm-ai.md`'s A9 section for this named follow-up.
 *
 * A failed query here must never silently read as "no confounder" — that
 * would UNDER-report confounding, the wrong direction for a downgrade flag.
 * Returns a typed failure instead; the caller (`comparable-attribute.ts`)
 * skips the write rather than guessing, and the retry horizon
 * (`RETRY_GRACE_DAYS`, route.ts) means the candidate gets a bounded number
 * of future chances rather than blocking forever.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';

type Sb = SupabaseClient<Database>;

export interface ConfounderCheckInput {
  insight_id: string;
  player_id: string;
  /** Inclusive lower bound — `baselineWindow.start`, NOT `interventionAt`. */
  windowStart: string;
  /** Inclusive upper bound — `followUpWindow.end`. Callers must only invoke
   *  this once that instant has already passed (see the caller's own
   *  `follow-up-window-open` gate) — evaluating the confounder flag before
   *  the window has closed could miss an intervention that lands later in
   *  the window, and the result is a PERMANENT row once written. */
  windowEnd: string;
}

export type ConfounderCheckResult =
  | { ok: true; multipleInterventions: boolean }
  | { ok: false; error: string };

interface ExposureRow {
  insight_id: string;
  shown_at: string;
}

/**
 * Scans this player's `golf_insight_exposure` rows for any OTHER insight
 * whose first-ever exposure lands in `[windowStart, windowEnd]`.
 *
 * Filters the fetch to `shown_at <= windowEnd` — an insight whose first
 * exposure comes after the window closes can't confound a window that
 * already ended, so there's no need to read a player's whole exposure
 * history. Paginated via `fetchAllRowsResult` (`.claude/rules/database.md`'s
 * documented 1,000-row PostgREST cap — a single player's cumulative exposure
 * history can exceed it over enough seasons), ordered `insight_id, shown_at,
 * id` so the FIRST row of each `insight_id` group is that insight's minimum
 * `shown_at` (its true first exposure, not just the first one inside the
 * window) — `id` breaks ties when two rows for the same insight share a
 * `shown_at` instant, keeping `.range()` page boundaries stable.
 */
export async function detectConfoundingInterventions(
  sb: Sb,
  input: ConfounderCheckInput,
): Promise<ConfounderCheckResult> {
  const { data, error } = await fetchAllRowsResult<ExposureRow>((from, to) =>
    sb
      .from('golf_insight_exposure')
      .select('insight_id, shown_at')
      .eq('player_id', input.player_id)
      .neq('insight_id', input.insight_id)
      .lte('shown_at', input.windowEnd)
      .order('insight_id', { ascending: true })
      .order('shown_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  );
  if (error) return { ok: false, error: error.message };

  const windowStartMs = new Date(input.windowStart).getTime();
  const seenInsightIds = new Set<string>();
  for (const row of data ?? []) {
    // Only the FIRST row seen per insight_id is its minimum shown_at, given
    // the ordering above — a later row for an already-seen insight_id is a
    // re-exposure, not a first exposure, and must not be re-checked.
    if (seenInsightIds.has(row.insight_id)) continue;
    seenInsightIds.add(row.insight_id);
    // Already filtered to shown_at <= windowEnd by the query itself, so only
    // the lower bound needs checking here.
    if (new Date(row.shown_at).getTime() >= windowStartMs) {
      return { ok: true, multipleInterventions: true };
    }
  }
  return { ok: true, multipleInterventions: false };
}
