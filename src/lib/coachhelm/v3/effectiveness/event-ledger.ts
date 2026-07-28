/**
 * P1-12 — Insight effectiveness EVENT LEDGER
 * ============================================================================
 *
 * A truth-by-construction trust layer for CoachHelm insights. Every trust
 * signal is derived ONLY from real rows in three append-only event tables:
 *
 *   golf_insight_exposure  — one row each time an insight was actually SHOWN
 *   golf_insight_action    — one row each time someone actually ACTED on it
 *   golf_insight_outcome   — one row each time we MEASURED what happened after
 *
 * Because the rollup counts only persisted rows, the system cannot lie:
 *   - an insight that was never surfaced has zero exposure rows  → shown === 0
 *   - an insight that was never acted on has zero action rows    → acted === 0
 *   - "worked" can only be counted from outcome rows we measured → measured-bound
 * There is no default/optimistic seeding anywhere. Absence of evidence reads
 * as `new_hypothesis`, never as success.
 *
 * Writers run server-side with the SERVICE-ROLE admin client (bypassing RLS so
 * the ledger captures every exposure regardless of the viewer) and are
 * FAILURE-SILENT: a telemetry write must never throw into the caller's happy
 * path (rendering a list, recording a tap). All failures funnel to
 * logServerError and return void.
 *
 * Pure derivation helpers (`deriveTrustStatus`, `deriveTrend`) are exported for
 * deterministic unit testing — they contain the only branching logic and never
 * touch the database.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

// ============================================================================
// PUBLIC TYPES (shared contract — other agents depend on these exact shapes)
// ============================================================================

export type TrustStatus =
  | 'proven'
  | 'promising'
  | 'needs_validation'
  | 'new_hypothesis'
  | 'underperforming';

export interface TrustSignal {
  insightId: string;
  /** count of exposure rows — the insight was actually surfaced this many times */
  shown: number;
  /** count of action rows — someone actually acted on it this many times */
  acted: number;
  /** count of outcome rows whose improvement was positive ("it worked") */
  worked: number;
  /** count of outcome rows we actually measured (denominator for the work rate) */
  measured: number;
  /** sign-trend of the last up-to-3 measured outcomes, or null when < 1 measured */
  recentTrend: 'up' | 'down' | 'flat' | null;
  status: TrustStatus;
}

// ============================================================================
// PURE DERIVATION HELPERS (deterministic — unit-tested in event-ledger.test.ts)
// ============================================================================

/** A measured outcome "worked" when its improvement is strictly positive. */
const OUTCOME_WORKED_THRESHOLD = 0;

/** How many of the most-recent measured outcomes feed the recent-trend signal. */
export const RECENT_TREND_WINDOW = 3;

/**
 * Derive the trust status from how many outcomes were MEASURED and how many of
 * those WORKED. This is the single source of the status ladder — the contract:
 *
 *   measured === 0                          → 'new_hypothesis'   (no evidence)
 *   0 < measured < 3                        → 'needs_validation' (too few)
 *   measured >= 3, rate >= 0.6              → 'proven'
 *   rate >= 0.4                             → 'promising'
 *   else                                    → 'underperforming'
 *
 * `rate = worked / measured`. Guards: a non-positive `measured` is treated as
 * zero evidence; `worked` is clamped to [0, measured] so a malformed call can
 * never manufacture a >1.0 rate.
 */
export function deriveTrustStatus(measured: number, worked: number): TrustStatus {
  const m = Number.isFinite(measured) && measured > 0 ? Math.floor(measured) : 0;
  if (m === 0) return 'new_hypothesis';

  const w = Number.isFinite(worked) ? Math.min(Math.max(Math.floor(worked), 0), m) : 0;
  if (m < 3) return 'needs_validation';

  const rate = w / m;
  if (rate >= 0.6) return 'proven';
  if (rate >= 0.4) return 'promising';
  return 'underperforming';
}

/**
 * Derive the recent-trend direction from a list of outcome `improvement` values
 * ordered NEWEST-FIRST. Only the first `RECENT_TREND_WINDOW` (3) entries count.
 *
 *   net positive signs  → 'up'    (more recent outcomes improved than regressed)
 *   net negative signs  → 'down'
 *   equal / all-zero    → 'flat'
 *   empty list          → null    (no measured outcomes to trend on)
 *
 * Non-finite/null entries are ignored (they carry no sign). If every considered
 * entry is null/zero the trend is 'flat' when at least one was present, else null.
 */
export function deriveTrend(improvements: Array<number | null | undefined>): 'up' | 'down' | 'flat' | null {
  if (!Array.isArray(improvements) || improvements.length === 0) return null;

  const considered = improvements.slice(0, RECENT_TREND_WINDOW);
  let pos = 0;
  let neg = 0;
  let seen = 0;

  for (const raw of considered) {
    if (raw === null || raw === undefined || !Number.isFinite(raw)) continue;
    seen += 1;
    if (raw > OUTCOME_WORKED_THRESHOLD) pos += 1;
    else if (raw < OUTCOME_WORKED_THRESHOLD) neg += 1;
  }

  if (seen === 0) return null;
  if (pos > neg) return 'up';
  if (neg > pos) return 'down';
  return 'flat';
}

// ============================================================================
// SERVICE-ROLE WRITERS (server only; failure-silent)
// ============================================================================

const FEATURE_AREA = 'coachhelm_effectiveness';

/**
 * Record one or more insight EXPOSURE events — "this insight was actually shown".
 * Call from the read path that renders a ranked insight list (server side).
 * No-op on empty input; never throws.
 */
export async function recordInsightExposure(
  rows: Array<{
    insight_id: string;
    player_id: string;
    coach_id?: string | null;
    surface?: string;
    rank_position?: number;
    rank_score?: number;
  }>,
): Promise<void> {
  if (!Array.isArray(rows) || rows.length === 0) return;
  try {
    const admin = createAdminClient();
    const payload = rows.map((r) => ({
      insight_id: r.insight_id,
      player_id: r.player_id,
      coach_id: r.coach_id ?? null,
      surface: r.surface ?? null,
      rank_position: r.rank_position ?? null,
      rank_score: r.rank_score ?? null,
    }));
    const { error } = await admin.from('golf_insight_exposure').insert(payload);
    if (error) {
      await logServerError(`recordInsightExposure insert failed: ${error.message}`, {
        action: 'recordInsightExposure',
        featureArea: FEATURE_AREA,
        errorCode: error.code,
        extra: { count: payload.length },
      });
    }
  } catch (err) {
    await logServerError(
      `recordInsightExposure threw: ${describeError(err)}`,
      { action: 'recordInsightExposure', featureArea: FEATURE_AREA },
    );
  }
}

/**
 * Record one insight ACTION event — "someone actually acted on this insight"
 * (dismissed, opened drill, started plan, etc. — `action_type` is free-form).
 * Never throws.
 */
export async function recordInsightAction(row: {
  insight_id: string;
  player_id: string;
  actor_id?: string | null;
  actor_role?: string;
  action_type: string;
  metadata?: unknown;
}): Promise<void> {
  if (!row?.insight_id || !row?.player_id || !row?.action_type) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('golf_insight_action').insert({
      insight_id: row.insight_id,
      player_id: row.player_id,
      actor_id: row.actor_id ?? null,
      actor_role: row.actor_role ?? null,
      action_type: row.action_type,
      // metadata is jsonb; cast the unknown payload to the Json shape.
      metadata: (row.metadata ?? null) as never,
    });
    if (error) {
      await logServerError(`recordInsightAction insert failed: ${error.message}`, {
        action: 'recordInsightAction',
        featureArea: FEATURE_AREA,
        errorCode: error.code,
        extra: { actionType: row.action_type },
      });
    }
  } catch (err) {
    await logServerError(
      `recordInsightAction threw: ${describeError(err)}`,
      { action: 'recordInsightAction', featureArea: FEATURE_AREA },
    );
  }
}

/**
 * Record one insight OUTCOME event — "we measured what happened after this
 * insight was surfaced". `improvement` carries the signed delta the trust
 * rollup reads (positive = worked). Never throws.
 */
export async function recordInsightOutcome(row: {
  insight_id: string;
  player_id: string;
  metric?: string;
  baseline_value?: number;
  outcome_value?: number;
  improvement?: number;
  window_days?: number;
  related_round_id?: string | null;
}): Promise<void> {
  if (!row?.insight_id || !row?.player_id) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('golf_insight_outcome').insert({
      insight_id: row.insight_id,
      player_id: row.player_id,
      metric: row.metric ?? null,
      baseline_value: row.baseline_value ?? null,
      outcome_value: row.outcome_value ?? null,
      improvement: row.improvement ?? null,
      window_days: row.window_days ?? null,
      related_round_id: row.related_round_id ?? null,
    });
    if (error) {
      await logServerError(`recordInsightOutcome insert failed: ${error.message}`, {
        action: 'recordInsightOutcome',
        featureArea: FEATURE_AREA,
        errorCode: error.code,
        extra: { metric: row.metric ?? null },
      });
    }
  } catch (err) {
    await logServerError(
      `recordInsightOutcome threw: ${describeError(err)}`,
      { action: 'recordInsightOutcome', featureArea: FEATURE_AREA },
    );
  }
}

// ============================================================================
// READ / ROLLUP — keyed by insight id
// ============================================================================

/**
 * Roll up trust signals for a set of insight ids. Runs exactly ONE batched
 * query per ledger table (exposure / action / outcome) over the id set, then
 * aggregates per insight in memory and derives status + recent trend.
 *
 * Every returned id is present in the map (even ids with zero rows → a
 * `new_hypothesis` signal with all-zero counts), so callers can address the
 * result by id without null-checking. On any read failure the function returns
 * an empty map rather than throwing — analytics degrade to "no signal yet".
 */
export async function getInsightEffectivenessSignals(
  insightIds: string[],
): Promise<Map<string, TrustSignal>> {
  const result = new Map<string, TrustSignal>();
  // Dedupe + drop falsy ids so the IN-list is clean and stable.
  const ids = Array.from(new Set((insightIds ?? []).filter((id): id is string => !!id)));
  if (ids.length === 0) return result;

  // Seed every requested id with a zero-evidence signal. Real rows can only
  // ADD to these counts — they can never subtract. This is what makes
  // "not-shown can't be surfaced; not-acted can't be acted" hold.
  for (const id of ids) {
    result.set(id, {
      insightId: id,
      shown: 0,
      acted: 0,
      worked: 0,
      measured: 0,
      recentTrend: null,
      status: 'new_hypothesis',
    });
  }

  try {
    const admin = createAdminClient();

    // One batched query per table. measured_at DESC orders outcomes
    // newest-first so the in-memory window for recentTrend is correct.
    const [exposureRes, actionRes, outcomeRes] = await Promise.all([
      admin.from('golf_insight_exposure').select('insight_id').in('insight_id', ids),
      admin.from('golf_insight_action').select('insight_id').in('insight_id', ids),
      admin
        .from('golf_insight_outcome')
        .select('insight_id, improvement, measured_at')
        .in('insight_id', ids)
        .order('measured_at', { ascending: false }),
    ]);

    if (exposureRes.error) {
      await logServerError(`getInsightEffectivenessSignals exposure read failed: ${exposureRes.error.message}`, {
        action: 'getInsightEffectivenessSignals',
        featureArea: FEATURE_AREA,
        errorCode: exposureRes.error.code,
      });
    }
    if (actionRes.error) {
      await logServerError(`getInsightEffectivenessSignals action read failed: ${actionRes.error.message}`, {
        action: 'getInsightEffectivenessSignals',
        featureArea: FEATURE_AREA,
        errorCode: actionRes.error.code,
      });
    }
    if (outcomeRes.error) {
      await logServerError(`getInsightEffectivenessSignals outcome read failed: ${outcomeRes.error.message}`, {
        action: 'getInsightEffectivenessSignals',
        featureArea: FEATURE_AREA,
        errorCode: outcomeRes.error.code,
      });
    }

    // ── exposure: count of SHOWN rows per insight ──
    for (const r of exposureRes.data ?? []) {
      const sig = result.get(r.insight_id);
      if (sig) sig.shown += 1;
    }

    // ── action: count of ACTED rows per insight ──
    for (const r of actionRes.data ?? []) {
      const sig = result.get(r.insight_id);
      if (sig) sig.acted += 1;
    }

    // ── outcome: count MEASURED, count WORKED, collect newest-first
    //    improvements per insight for the recent-trend derivation ──
    const improvementsById = new Map<string, Array<number | null>>();
    for (const r of outcomeRes.data ?? []) {
      const sig = result.get(r.insight_id);
      if (!sig) continue;
      sig.measured += 1;
      const imp = typeof r.improvement === 'number' ? r.improvement : null;
      if (imp !== null && imp > OUTCOME_WORKED_THRESHOLD) sig.worked += 1;

      const arr = improvementsById.get(r.insight_id);
      if (arr) arr.push(imp);
      else improvementsById.set(r.insight_id, [imp]);
    }

    // ── derive status + recentTrend from the accumulated counts ──
    for (const id of ids) {
      const sig = result.get(id);
      if (!sig) continue;
      sig.status = deriveTrustStatus(sig.measured, sig.worked);
      sig.recentTrend = deriveTrend(improvementsById.get(id) ?? []);
    }

    return result;
  } catch (err) {
    await logServerError(
      `getInsightEffectivenessSignals threw: ${describeError(err)}`,
      { action: 'getInsightEffectivenessSignals', featureArea: FEATURE_AREA },
    );
    // Degrade to the zero-evidence seed map (already populated above) rather
    // than throwing into the analytics page.
    return result;
  }
}
