import 'server-only';

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
 * course (completed, or its target date has passed) AND has the player
 * played enough rounds since it started for a follow-up decision to mean
 * anything" — a `completed` or overdue area is exactly the case
 * `due-for-review.ts` excludes (its `FOCUS_AREA_DUE_STATUSES` never includes
 * `completed`/`declined`, and "past the target date" already graduated out
 * of `due_soon` into `overdue` there). The two modules are meant to be read
 * side by side in the same coach queue (#1998), not merged: "still open,
 * check in soon" vs. "ready for a follow-up decision".
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
import type { SupabaseClient } from '@supabase/supabase-js';
import { fromUntyped } from '@/lib/supabase/untyped';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

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
 * convention `due-for-review.ts` documents; never computed inside). `null`
 * covers both "still actively being worked" and "a rounds-target area with
 * no target_date to compare" — a rounds-kind area only becomes eligible by
 * being explicitly completed, per the owner rule; there is no "past due" for
 * a rounds target here (see due-for-review.ts's own note on that gap).
 *
 * "Past" the target date matches `due-for-review.ts`'s `overdue` boundary:
 * strictly before `todayIso`, not on it — a target due today is not yet
 * "past" it.
 */
export function followUpEligibilityReason(
  area: FollowUpEligibilityInput,
  todayIso: string,
): FollowUpEligibilityReason | null {
  if (area.status === 'completed') return 'completed';
  if (area.target_kind === 'date' && area.target_date && area.target_date.slice(0, 10) < todayIso) {
    return 'past_target_date';
  }
  return null;
}

/**
 * Filter + classify a set of focus areas into follow-up-eligibility entries.
 * `roundsSinceStartByFocusArea` comes from `loadFollowUpRoundCounts` — this
 * function stays pure and takes the counts as data, mirroring
 * `computeDueFocusAreas`'s split between derivation and I/O.
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
    const roundsSinceStart = roundsSinceStartByFocusArea.get(area.id) ?? 0;
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

export interface FollowUpRoundCountInput {
  id: string;
  player_id: string;
  /** Accept/active start — `null` (still `proposed`) means no window to
   *  count rounds against; such areas are simply left out of the result map,
   *  same as `computeFollowUpEligibility` would never call `followUpEligibilityReason`
   *  true for a non-completed proposed area in practice. */
  started_at: string | null;
}

/**
 * Batch-loads a completed-round count per focus area, counting only rounds
 * on or after that area's own `started_at` date (matches
 * `loadWindowRoundsByPlayer`'s `round_date >= startDate` string-comparison
 * convention in progress-drivers.ts — `golf_rounds.round_date` is a plain
 * date, no timezone conversion needed). One query per player-id chunk
 * (`chunkIds`), each paged past PostgREST's 1000-row cap
 * (`fetchAllRowsResult`) — per CLAUDE.md's pagination/URL-size rules.
 *
 * Returns `null` — not an empty Map — on any read failure, so a caller never
 * confuses "the read failed" with "zero rounds played" (same contract as
 * `loadFocusAreaPracticeLogData`'s `null`-means-unknown convention). Areas
 * with no `started_at` are simply absent from the returned map.
 */
export async function loadFollowUpRoundCounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  areas: readonly FollowUpRoundCountInput[],
): Promise<Map<string, number> | null> {
  const out = new Map<string, number>();
  const started = areas.filter(
    (a): a is FollowUpRoundCountInput & { started_at: string } => Boolean(a.started_at),
  );
  if (started.length === 0) return out;

  const playerIds = [...new Set(started.map((a) => a.player_id))];
  const earliestStartDate = started.reduce((min, a) => {
    const d = a.started_at.slice(0, 10);
    return d < min ? d : min;
  }, started[0]!.started_at.slice(0, 10));

  type RoundRow = { player_id: string; round_date: string | null };
  const rounds: RoundRow[] = [];
  try {
    for (const batch of chunkIds(playerIds)) {
      const { data, error } = await fetchAllRowsResult<RoundRow>((from, to) =>
        fromUntyped(supabase, 'golf_rounds')
          .select('player_id, round_date')
          .in('player_id', batch)
          .eq('status', 'completed')
          .gte('round_date', earliestStartDate)
          .order('id', { ascending: true })
          .range(from, to),
      );
      if (error) throw error;
      rounds.push(...(data ?? []));
    }
  } catch (error) {
    await logServerError(
      `[follow-up-eligibility] golf_rounds batch read failed — round counts will render as absent, not as a false "0 rounds": ${describeError(error)}`,
      { action: 'followUpEligibility.loadFollowUpRoundCounts', featureArea: 'development' },
      'warning',
    );
    return null;
  }

  for (const area of started) {
    const startDate = area.started_at.slice(0, 10);
    const count = rounds.filter((r) => r.player_id === area.player_id && r.round_date && r.round_date >= startDate)
      .length;
    out.set(area.id, count);
  }
  return out;
}
