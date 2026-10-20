/**
 * Build the rows `recordInsightExposure` writes for a surfaced insight list.
 *
 * Extracted from `insight-delivery.ts` because that file is `'use server'` —
 * every export there must be an async server action, so a pure helper could not
 * live in it and therefore could not be tested directly.
 *
 * ── WHY rank_score EXISTS HERE ──────────────────────────────────────────────
 *
 * `golf_insight_exposure.rank_score` was NULL on every row ever written.
 * Measured 2026-08-18: 127,295 rows, `rank_position` populated on all of them,
 * `rank_score` on none.
 *
 * The score was never missing — it was DISCARDED. `rankEvidenceInsights`
 * computes one per insight, sorts on it, then `.map((row) => row.insight)`,
 * dropping it one line before the ledger would have recorded it. The old
 * builder took `Array<{ id, player_id }>`, so a score could not even be
 * expressed at the call site.
 *
 * It is worth recording rather than dropping the column because
 * `rank_position` is LIST-RELATIVE: position 0 of a two-item feed and position
 * 0 of a twenty-item feed are indistinguishable, and a change in ranking
 * quality over time is invisible. `rank_score` is absolute and comparable
 * across surfaces and across time — which matters now specifically, because
 * `readStrokeImpact` (6d2ea74b7) fixed the feed reading `strokes_impact` from a
 * key present on 0 of 501 insights. Every score computed before that fix came
 * from a null impact. Recording the score is what lets that change be seen
 * instead of asserted.
 */

export interface ExposureRow {
  insight_id: string;
  player_id: string;
  coach_id: string | null;
  surface: string;
  rank_position: number;
  /** Absent — never 0 — when this surface produced no comparable score. */
  rank_score?: number;
  /**
   * Slice 1 (`coachhelm_support_v1`): the factors behind the rank, for the
   * audit view's "Ranked first: 0.9 strokes × Observed …" (03 §2.2, 04 §1.2).
   * Absent when the flag is off or the row carries no ladder yet.
   */
  rank_factors?: RankFactors;
}

/**
 * Rung weight R (03 §2.2): Seen repeatedly 1.0 · Observed 0.85 · Likely 0.65
 * · Working hypothesis 0.4 · Not enough yet 0.
 */
export const RUNG_WEIGHT: Readonly<Record<string, number>> = {
  seen_repeatedly: 1,
  observed: 0.85,
  likely: 0.65,
  working_hypothesis: 0.4,
  not_enough_yet: 0,
};

/** Strokes a round cap for ranking (03 §2.2; 04 §2). */
export const RANK_STROKES_CAP = 3;

export interface RankFactors {
  version: 'support_v1';
  /** The score this surface actually ranked on (unchanged by Slice 1); null when it did not rank. */
  score: number | null;
  /** Strokes a round at stake from the SHRUNK estimate, capped at 3; null when not estimated. */
  S: number | null;
  /** Rung weight from {@link RUNG_WEIGHT}. */
  R: number;
  ladder: string;
  q_adj: number | null;
  position: number;
  surface: string;
}

/**
 * The factors written on an exposure row, read from the insight's evidence as
 * the support pass left it. Null when the evidence has no `ladder` (the pass
 * has not run on it). A, N, F, W and G (03 §2.2) are not computed yet and are
 * left out rather than recorded as a neutral 1.0 that was never measured.
 */
export function rankFactorsFromEvidence(
  evidence: unknown,
  ctx: { score: number | undefined; position: number; surface: string },
): RankFactors | null {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return null;
  const ev = evidence as Record<string, unknown>;
  const ladder = typeof ev.ladder === 'string' ? ev.ladder : null;
  if (!ladder || !(ladder in RUNG_WEIGHT)) return null;
  const support = ev.support && typeof ev.support === 'object' ? (ev.support as Record<string, unknown>) : null;
  const qAdj = typeof support?.q_adj === 'number' && Number.isFinite(support.q_adj) ? support.q_adj : null;
  const shrunk = typeof ev.strokes_shrunk === 'number' && Number.isFinite(ev.strokes_shrunk) ? ev.strokes_shrunk : null;
  return {
    version: 'support_v1',
    score: ctx.score !== undefined && Number.isFinite(ctx.score) ? ctx.score : null,
    S: shrunk === null ? null : Math.min(RANK_STROKES_CAP, Math.abs(shrunk)),
    R: RUNG_WEIGHT[ladder]!,
    ladder,
    q_adj: qAdj,
    position: ctx.position,
    surface: ctx.surface,
  };
}

// ---------------------------------------------------------------------------
// Dedup (#1506) — one exposure row per (insight, coach, surface, day)
// ---------------------------------------------------------------------------
//
// `recordExposureForReturned` fires on every server render of a feed —
// navigation, refresh, revalidatePath, any refetch — not once per view.
// Measured against production 2026-08-18: grouping coach_feed by
// (insight, coach, day) averaged 28.3 rows per bucket, max 349 in one day.
// That is what feeds inverse-exposure ranking, so an unbounded render count
// would de-rank insights belonging to coaches who simply navigate more.
//
// Fix is issue #1506's Option 1: collapse to one row per
// (insight_id, coach_id, surface) per day. This is the app-level,
// "racy-but-adequate" form — a concurrent request can still double-write
// between the read and the insert. The robust version needs a unique index,
// which is a migration on the shared production DB and an owner decision
// (tracked in #1506); this only needs to cut ~350x amplification down to ~1x,
// not make it atomic.

/** The (insight, coach, surface) identity a day's worth of exposure collapses to. */
export function exposureDedupeKey(row: {
  insight_id: string;
  coach_id?: string | null;
  surface?: string | null;
}): string {
  return `${row.insight_id}::${row.coach_id ?? ''}::${row.surface ?? ''}`;
}

/**
 * Drop rows whose (insight_id, coach_id, surface) key is already in
 * `alreadyRecordedKeys` — i.e. already written today. Pure and order-preserving
 * so it can run directly on the payload right before insert.
 */
export function dedupeExposureRows<
  T extends { insight_id: string; coach_id: string | null; surface: string | null },
>(rows: readonly T[], alreadyRecordedKeys: ReadonlySet<string>): T[] {
  return rows.filter((row) => !alreadyRecordedKeys.has(exposureDedupeKey(row)));
}

/** Start of "today" in UTC, as an ISO timestamp — the dedup window boundary. */
export function startOfUtcDayIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export interface SurfacedInsight {
  id: string;
  player_id: string;
  /** Read only for `rank_factors` (Slice 1). */
  evidence?: unknown;
}

/**
 * @param insights   the list as SURFACED (post rank, dedupe and slice)
 * @param surface    ledger surface key, e.g. 'coach_feed'
 * @param coachId    viewing coach, or null on player-facing surfaces
 * @param scoreById  rank score per insight id. Omit on surfaces that pick a
 *                   single insight without ranking — a fabricated 0 there
 *                   would read as "ranked last" rather than "not ranked".
 * @param opts.rankFactors  write `rank_factors` (flag `coachhelm_support_v1`;
 *                   the caller checks the flag, this module stays pure).
 */
export function buildExposureRows(
  insights: readonly SurfacedInsight[],
  surface: string,
  coachId?: string | null,
  scoreById?: ReadonlyMap<string, number>,
  opts: { rankFactors?: boolean } = {},
): ExposureRow[] {
  if (!Array.isArray(insights) || insights.length === 0) return [];

  return insights
    .filter((ins) => ins && ins.id && ins.player_id)
    // Position is re-derived AFTER filtering: it describes the list the user
    // actually saw, so a dropped malformed row must not leave a gap in it.
    .map((ins, idx) => {
      const score = scoreById?.get(ins.id);
      const row: ExposureRow = {
        insight_id: ins.id,
        player_id: ins.player_id,
        coach_id: coachId ?? null,
        surface,
        rank_position: idx,
      };
      // `!== undefined` rather than a truthiness check: a genuine 0 is a real
      // score (an insight with no measurable stroke impact) and must not be
      // erased into "unknown".
      if (score !== undefined && Number.isFinite(score)) row.rank_score = score;
      if (opts.rankFactors) {
        const factors = rankFactorsFromEvidence(ins.evidence, { score, position: idx, surface });
        if (factors) row.rank_factors = factors;
      }
      return row;
    });
}
