/**
 * Recompute `golf_coachhelm_coach_weights` from the stored outcome
 * attributions, using the CURRENT v3 attribution math (2026-09-24).
 *
 * The live weights were built incrementally by the causality cron. Part of
 * them came from v1 attribution rows (`method_version` NULL). Their `lift`
 * was `post − ambient`, which never used the baseline window (N10 in
 * `attribute.ts`). They also came from rows whose insight the product has
 * since hidden. This module replays the weights from scratch:
 *
 * - **Rows used.** Only round-level attribution rows: `method_version`
 *   NULL or `'v2_observed_delta'`. Comparable-opportunity rows never feed
 *   the learning loop (see `comparable-attribute.ts`).
 * - **Insight eligibility.** The insight must be eligible today under the
 *   same rules the cron applies to candidates: a v3 engine row, a visible
 *   lifecycle state, not dismissed, with a player and a coach.
 * - **Lift.** Recomputed with the current math from the row's stored
 *   `baseline_value` / `post_value`: the observed change, direction
 *   corrected by `improvementSign`, or null unless both windows have at
 *   least `MIN_WINDOW_ROUNDS` rounds. A v1 row's baseline and post values
 *   were real window averages; only its lift was wrong.
 * - **Weight.** Each (coach, insight_type, 'general') key is folded through
 *   the SAME `nextWeight` EMA the cron uses. The fold starts at
 *   {1.0, 0} and runs in `attributed_at` order, with a null lift skipped
 *   exactly as the cron skips it.
 *
 * Pure except `loadRecomputeInputs`, which only SELECTs.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { MIN_WINDOW_ROUNDS, nextWeight } from './attribute';
import { improvementSign } from '@/lib/coachhelm/v3/metrics/registry';
import { VISIBLE_LIFECYCLE_STATES } from '@/lib/coachhelm/v3/insight-visibility';

export const WEIGHT_INTENT = 'general';
export const ROUND_LEVEL_METHOD_VERSIONS: ReadonlySet<string | null> = new Set([null, 'v2_observed_delta']);

export interface AttributionFact {
  insight_id: string;
  target_metric_id: string;
  baseline_value: number;
  post_value: number;
  n_rounds_before: number;
  n_rounds_after: number;
  method_version: string | null;
  attributed_at: string;
}

export interface InsightFact {
  id: string;
  player_id: string | null;
  coach_id: string | null;
  insight_type: string;
  engine_version: string | null;
  signature: string | null;
  lifecycle_state: string | null;
  status: string | null;
}

export interface WeightRow {
  coach_id: string;
  insight_type: string;
  intent: string;
  weight: number;
  sample_n: number;
}

/** Current v3 lift for one stored attribution row (see `computeAttribution`). */
export function currentLift(row: AttributionFact): number | null {
  if (row.n_rounds_before < MIN_WINDOW_ROUNDS || row.n_rounds_after < MIN_WINDOW_ROUNDS) return null;
  const raw = Number(row.post_value) - Number(row.baseline_value);
  if (!Number.isFinite(raw)) return null;
  return improvementSign(row.target_metric_id) * raw;
}

/** The cron's candidate eligibility, evaluated against the insight's state today. */
export function isLearnableInsight(ins: InsightFact | undefined): ins is InsightFact & { coach_id: string } {
  if (!ins || !ins.coach_id || !ins.player_id) return false;
  const v3 = ins.engine_version === 'v3' || (ins.signature ?? '').startsWith('v3:');
  if (!v3) return false;
  if (!(VISIBLE_LIFECYCLE_STATES as readonly string[]).includes(ins.lifecycle_state ?? '')) return false;
  return ins.status !== 'dismissed';
}

export interface ReplaySummary {
  weights: WeightRow[];
  used: number;
  skipped: { method: number; ineligible: number; null_lift: number };
}

export function replayCoachWeights(attributions: AttributionFact[], insights: Map<string, InsightFact>): ReplaySummary {
  const skipped = { method: 0, ineligible: 0, null_lift: 0 };
  let used = 0;
  const acc = new Map<string, WeightRow>();
  const ordered = [...attributions].sort(
    (a, b) => a.attributed_at.localeCompare(b.attributed_at) || a.insight_id.localeCompare(b.insight_id),
  );
  for (const row of ordered) {
    if (!ROUND_LEVEL_METHOD_VERSIONS.has(row.method_version)) {
      skipped.method += 1;
      continue;
    }
    const ins = insights.get(row.insight_id);
    if (!isLearnableInsight(ins)) {
      skipped.ineligible += 1;
      continue;
    }
    const lift = currentLift(row);
    if (lift === null) {
      skipped.null_lift += 1;
      continue;
    }
    const key = `${ins.coach_id}|${ins.insight_type}`;
    const prev = acc.get(key) ?? {
      coach_id: ins.coach_id,
      insight_type: ins.insight_type,
      intent: WEIGHT_INTENT,
      weight: 1.0,
      sample_n: 0,
    };
    const next = nextWeight(prev, lift);
    acc.set(key, { ...prev, weight: next.weight, sample_n: next.sample_n });
    used += 1;
  }
  const weights = [...acc.values()].sort(
    (a, b) => a.coach_id.localeCompare(b.coach_id) || a.insight_type.localeCompare(b.insight_type),
  );
  return { weights, used, skipped };
}

export interface WeightDiff {
  coach_id: string;
  insight_type: string;
  intent: string;
  old: { weight: number; sample_n: number } | null;
  next: { weight: number; sample_n: number } | null;
}

/** Old vs new per key. `next: null` = a stored key no eligible evidence supports. */
export function diffWeights(current: WeightRow[], recomputed: WeightRow[]): WeightDiff[] {
  const k = (r: WeightRow) => `${r.coach_id}|${r.insight_type}|${r.intent}`;
  const out = new Map<string, WeightDiff>();
  for (const r of current) {
    out.set(k(r), { coach_id: r.coach_id, insight_type: r.insight_type, intent: r.intent, old: { weight: Number(r.weight), sample_n: r.sample_n }, next: null });
  }
  for (const r of recomputed) {
    const existing = out.get(k(r));
    const next = { weight: r.weight, sample_n: r.sample_n };
    if (existing) existing.next = next;
    else out.set(k(r), { coach_id: r.coach_id, insight_type: r.insight_type, intent: r.intent, old: null, next });
  }
  return [...out.values()].sort(
    (a, b) => a.coach_id.localeCompare(b.coach_id) || a.insight_type.localeCompare(b.insight_type),
  );
}

const PAGE = 1000;
const IN_CHUNK = 200;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

async function selectAll<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** Read-only: attributions, their insights, and the stored weights. */
export async function loadRecomputeInputs(sb: AnyClient): Promise<{
  attributions: AttributionFact[];
  insights: Map<string, InsightFact>;
  current: WeightRow[];
}> {
  const attributions = await selectAll<AttributionFact>((from, to) =>
    sb
      .from('golf_insight_outcome_attribution')
      .select('insight_id, target_metric_id, baseline_value, post_value, n_rounds_before, n_rounds_after, method_version, attributed_at')
      .order('insight_id', { ascending: true })
      .range(from, to),
  );
  const ids = [...new Set(attributions.map((a) => a.insight_id))];
  const insights = new Map<string, InsightFact>();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const rows = await selectAll<InsightFact>((from, to) =>
      sb
        .from('golf_coach_insights')
        .select('id, player_id, coach_id, insight_type, engine_version, signature, lifecycle_state, status')
        .in('id', chunk)
        .order('id', { ascending: true })
        .range(from, to),
    );
    for (const r of rows) insights.set(r.id, r);
  }
  const current = await selectAll<WeightRow>((from, to) =>
    sb
      .from('golf_coachhelm_coach_weights')
      .select('coach_id, insight_type, intent, weight, sample_n')
      .order('coach_id', { ascending: true })
      .order('insight_type', { ascending: true })
      .order('intent', { ascending: true })
      .range(from, to),
  );
  return { attributions, insights, current };
}

export interface RecomputeResult extends ReplaySummary {
  diff: WeightDiff[];
  applied: boolean;
  pruned: number;
}

/**
 * Loads, replays and diffs. Writes ONLY when `apply` is true: it upserts
 * each recomputed key. It deletes a stored key with no supporting evidence
 * only when `prune` is also true.
 */
export async function recomputeCoachWeights(
  sb: AnyClient,
  opts: { apply?: boolean; prune?: boolean } = {},
): Promise<RecomputeResult> {
  const { attributions, insights, current } = await loadRecomputeInputs(sb);
  const replay = replayCoachWeights(attributions, insights);
  const diff = diffWeights(current, replay.weights);
  let pruned = 0;
  if (opts.apply) {
    const now = new Date().toISOString();
    if (replay.weights.length > 0) {
      const { error } = await sb
        .from('golf_coachhelm_coach_weights')
        .upsert(
          replay.weights.map((w) => ({ ...w, updated_at: now })),
          { onConflict: 'coach_id,insight_type,intent' },
        );
      if (error) throw new Error(`upsert: ${error.message}`);
    }
    if (opts.prune) {
      for (const d of diff.filter((x) => x.next === null)) {
        const { error } = await sb
          .from('golf_coachhelm_coach_weights')
          .delete()
          .eq('coach_id', d.coach_id)
          .eq('insight_type', d.insight_type)
          .eq('intent', d.intent);
        if (error) throw new Error(`prune: ${error.message}`);
        pruned += 1;
      }
    }
  }
  return { ...replay, diff, applied: Boolean(opts.apply), pruned };
}
