/**
 * Pkg 9 gap 2 — "follow-up eligibility" (owner decision, 2026-09-23): before
 * this, nothing in the codebase named or computed this concept (checked
 * `recordFocusAreaOutcome`, the fixture-matrix doc, rows 39-41). The closest
 * real mechanism was `findActiveFocusAreaForMetric`'s duplicate-active guard
 * (development.ts) — which blocks a SECOND focus area while the first is
 * still active, and stops blocking the moment the first is `completed`. That
 * guard answers "is a new focus area on this metric allowed at all", not
 * "should the coach actually create one now" — a focus area can be
 * `completed` (or simply past its target date, abandoned) the instant it's
 * accepted, with zero evidence the player did anything differently since.
 * This module is that missing evidence gate.
 *
 * Distinct from `due-for-review.ts` on purpose: that module answers "does
 * this ACTIVE area need a check-in reminder soon" (date-window, `active` /
 * `in_progress` / `paused` only). This module answers "has this area run its
 * course (completed, or its target date has passed while it was still
 * actionable) AND has the player played enough rounds since it started for a
 * follow-up decision to mean anything" — the two are meant to be read side
 * by side in the same coach queue (#1998), not merged: "still open, check in
 * soon" vs. "ready for a follow-up decision".
 *
 * Deliberately pure and I/O-free (no `server-only`) — like `due-for-review.ts`,
 * so a client component (`DueForReviewPanel`) can run classification locally
 * against props already on the page. The `golf_rounds` read lives in the
 * sibling `follow-up-eligibility-loader.ts` (server-only).
 *
 * Owner rule: eligible when (status === 'completed' OR today is past
 * `target_date`) AND the player has played >= `FOLLOW_UP_ROUNDS_THRESHOLD`
 * completed rounds since the focus area's real start (`started_at` —
 * acceptance/active start, never `created_at`: a coach-proposed area a
 * player hasn't accepted yet has no improvement window to measure rounds
 * against). Due-but-under-threshold areas surface too, labeled
 * "waiting for rounds (n/3)" rather than being silently omitted — the coach
 * queue needs to show what's coming, not just what's ready.
 *
 * Deliberately does NOT feed Package 10 outcome measurement (whether the
 * metric actually improved) — this only answers whether a follow-up
 * decision is ripe to make, not what that decision should be.
 */
import { FOCUS_AREA_DUE_STATUSES } from './due-for-review';

/** Owner rule: >= 3 completed rounds since start before a follow-up is ripe. */
export const FOLLOW_UP_ROUNDS_THRESHOLD = 3;

export type FollowUpEligibilityReason = 'completed' | 'past_target_date';

export interface FollowUpEligibilityInput {
  id: string;
  player_id: string;
  status?: string | null;
  target_kind?: string | null;
  /** ISO date (YYYY-MM-DD), or a full timestamp — only the date part is read. */
  target_date?: string | null;
  /**
   * Owner decision follow-up (2026-09-23): the RAW
   * `golf_player_focus_areas.outcome_status` column, set directly by
   * `recordFocusAreaOutcomeImpl` (development.ts) regardless of whether the
   * area has a `from_insight_id` — that function persists the verdict on
   * the focus area itself precisely so a from_insight_id-less area doesn't
   * silently lose it (see that function's own doc). Deliberately named
   * `recordedOutcomeStatus`, NOT `outcome_status` — `PlayersGridFocusArea`
   * already has an `outcome_status` field (inherited from
   * `FocusAreaCardData`) that is derived from the SOURCE INSIGHT only and
   * reads `null` whenever `from_insight_id` is absent, even when this
   * focus area's own column is set. Reusing that name here would silently
   * read the wrong value for exactly the areas this exclusion most needs
   * to catch. A recorded outcome means the follow-up decision this module
   * exists to surface has already been made — the area is excluded
   * entirely, not just marked ineligible.
   */
  recordedOutcomeStatus?: string | null;
}

export interface FollowUpEligibilityEntry<T> {
  area: T;
  reason: FollowUpEligibilityReason;
  /** Completed golf_rounds for this area's player, on or after its
   *  `started_at` date — from `loadFollowUpRoundCounts`, never re-derived here. */
  roundsSinceStart: number;
  eligible: boolean;
  /** null when eligible; otherwise a coach-facing label, e.g. "waiting for
   *  rounds (1/3)". Never fabricated from `eligible` alone by a caller —
   *  compute it here so the threshold has one source of truth. */
  waitingLabel: string | null;
}

/**
 * Classify one focus area as follow-up-ripe or not, relative to
 * `todayIso` (caller-resolved, zone-safe — same `todayIsoInZone(teamTimezone)`
 * convention `due-for-review.ts` documents; never computed inside).
 *
 * The `status === 'completed'` leg fires regardless of `target_kind` — a
 * player who finished the work early is done, whatever the timeframe said.
 * The "past target date" leg is gated on `FOCUS_AREA_DUE_STATUSES` (the same
 * `active`/`in_progress`/`paused` set `due-for-review.ts` uses): a `proposed`
 * area was never accepted (no real start, matches the owner's "accepted/
 * active start, not creation of a proposal" rule) and a `declined` area is
 * already resolved — neither should read as "past its target date, waiting
 * on rounds" forever in the coach queue. A rounds-kind target only becomes
 * eligible by being explicitly completed; there is no "past due" for a
 * rounds target here (see `due-for-review.ts`'s own note on that gap).
 *
 * "Past" the target date matches `due-for-review.ts`'s `overdue` boundary:
 * strictly before `todayIso`, not on it — a target due today is not yet
 * "past" it.
 *
 * Checked BEFORE the `completed` leg below: `recordFocusAreaOutcomeImpl`
 * ALSO sets `status: 'completed'` on the same write that sets
 * `outcome_status` (see that function's doc) — without this check first, a
 * recorded-outcome area would keep satisfying the `completed` leg and sit
 * in the queue forever, which is exactly the gap this exclusion closes.
 */
export function followUpEligibilityReason(
  area: FollowUpEligibilityInput,
  todayIso: string,
): FollowUpEligibilityReason | null {
  if (area.recordedOutcomeStatus) return null;
  if (area.status === 'completed') return 'completed';
  if (
    area.status &&
    (FOCUS_AREA_DUE_STATUSES as readonly string[]).includes(area.status) &&
    area.target_kind === 'date' &&
    area.target_date &&
    area.target_date.slice(0, 10) < todayIso
  ) {
    return 'past_target_date';
  }
  return null;
}

/**
 * Filter + classify a set of focus areas into follow-up-eligibility entries.
 * `roundsSinceStartByFocusArea` comes from `loadFollowUpRoundCounts` — this
 * function stays pure and takes the counts as data, mirroring
 * `computeDueFocusAreas`'s split between derivation and I/O.
 *
 * `roundsSinceStartByFocusArea` must be a SUCCESSFUL result (the caller
 * already branched on `loadFollowUpRoundCounts`'s `null` — a failed read —
 * before reaching here; see `DueForReviewPanel`). Given that, a focus area
 * with NO entry in the map didn't fail to load a count — it was never
 * started (`started_at` was null), which `loadFollowUpRoundCounts` excludes
 * on purpose. Such an area is excluded here too, not defaulted to 0 rounds:
 * a legacy `completed` row with no recorded `started_at` would otherwise
 * show a permanent "waiting for rounds (0/3)" it can never climb out of.
 */
export function computeFollowUpEligibility<T extends FollowUpEligibilityInput>(
  areas: readonly T[],
  roundsSinceStartByFocusArea: ReadonlyMap<string, number>,
  opts: { todayIso: string; roundsThreshold?: number },
): FollowUpEligibilityEntry<T>[] {
  const threshold = opts.roundsThreshold ?? FOLLOW_UP_ROUNDS_THRESHOLD;
  const out: FollowUpEligibilityEntry<T>[] = [];
  for (const area of areas) {
    const reason = followUpEligibilityReason(area, opts.todayIso);
    if (!reason) continue;
    if (!roundsSinceStartByFocusArea.has(area.id)) continue;
    const roundsSinceStart = roundsSinceStartByFocusArea.get(area.id)!;
    const eligible = roundsSinceStart >= threshold;
    out.push({
      area,
      reason,
      roundsSinceStart,
      eligible,
      waitingLabel: eligible ? null : `waiting for rounds (${roundsSinceStart}/${threshold})`,
    });
  }
  return out;
}
