/**
 * upsertInsight — the single mandatory entry point for every Tier-1 insight
 * generator. Enforces Rule 1 (evidence shape + sample floor), Rule 2
 * (signature-based dedup), Rule 3 (lifecycle progression), and Rule 4
 * (category) from the design contract.
 *
 * Design contract: docs/superpowers/plans/2026-04-22-insight-quality/00-design-contract.md
 *
 * Rules enforced here:
 *  - evidence.sample_n < 5 → throw. Do not emit.
 *  - confidence is computed from evidence.confidence_factors.
 *  - If an insight with same (player_id, signature) exists with
 *    created_at > now() - 30 days:
 *      * |new.your_value - existing.evidence.your_value| / existing < 5% →
 *        refresh evidence + content; don't touch lifecycle_state.
 *      * >= 5% movement → update evidence + content; set metadata.movement;
 *        increment metadata.movement_count. When count reaches 3 and current
 *        state is 'detected', promote to 'matured'.
 *  - Otherwise INSERT new row with lifecycle_state = 'tentative' (if
 *    confidence < 0.4) else 'detected'.
 *
 * attachDrills() pulls up to 3 drills from golf_drills matching the insight's
 * category + tags, ranked by number of overlapping tags.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InsightInput,
  InsightEvidence,
  InsightLifecycleState,
  InsightMovement,
} from './types';
import { calcConfidence } from './types';

const DEDUP_WINDOW_DAYS = 30;
const MOVEMENT_THRESHOLD = 0.05; // 5%
const MATURATION_MOVEMENTS = 3;
const MIN_SAMPLE_N = 5;
const TENTATIVE_CONFIDENCE_FLOOR = 0.4;

type JsonRecord = Record<string, unknown>;

interface ExistingInsightRow {
  id: string;
  evidence: InsightEvidence | null;
  metadata: JsonRecord | null;
  lifecycle_state: InsightLifecycleState | null;
}

/**
 * Runs the full dedup + lifecycle logic and returns the row id (existing or
 * newly inserted). The caller owns the supabase client — pass an admin client
 * for server-side generators so RLS doesn't get in the way.
 */
export async function upsertInsight(
  supabase: SupabaseClient,
  input: InsightInput,
): Promise<string> {
  // Rule 1 — sample size floor.
  if (!input.evidence || input.evidence.sample_n < MIN_SAMPLE_N) {
    throw new Error(
      `upsertInsight: evidence.sample_n=${input.evidence?.sample_n ?? 'null'} < ${MIN_SAMPLE_N}; refusing to emit`,
    );
  }

  // Recompute confidence so generators can't drift.
  const confidence = calcConfidence(input.evidence);
  const evidence: InsightEvidence = {
    ...input.evidence,
    confidence,
  };

  // Look up the most recent row with same (player_id, signature). The partial
  // index predicate (30-day window) is enforced in code, not in SQL, because
  // now() isn't IMMUTABLE.
  const cutoff = new Date(
    Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: existingRows, error: lookupError } = await supabase
    .from('golf_coach_insights')
    .select('id, evidence, metadata, lifecycle_state')
    .eq('player_id', input.player_id)
    .eq('signature', input.signature)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1);

  if (lookupError) {
    throw new Error(`upsertInsight.lookup failed: ${lookupError.message}`);
  }

  const existing = (existingRows?.[0] ?? null) as ExistingInsightRow | null;

  if (existing) {
    return updateExisting(supabase, existing, input, evidence);
  }

  return insertNew(supabase, input, evidence, confidence);
}

async function updateExisting(
  supabase: SupabaseClient,
  existing: ExistingInsightRow,
  input: InsightInput,
  evidence: InsightEvidence,
): Promise<string> {
  const nowIso = new Date().toISOString();
  const existingValue = existing.evidence?.your_value ?? 0;
  const newValue = evidence.your_value;

  // Guard against divide-by-zero: if prior value was 0, any non-zero new
  // value is by definition >5% movement.
  const absChange = Math.abs(newValue - existingValue);
  const relChange = existingValue === 0
    ? (newValue === 0 ? 0 : Infinity)
    : absChange / Math.abs(existingValue);

  const priorMetadata: JsonRecord = existing.metadata ?? {};

  if (relChange < MOVEMENT_THRESHOLD) {
    // Small wiggle — refresh evidence + content, preserve lifecycle.
    const mergedMetadata: JsonRecord = {
      ...priorMetadata,
      ...(input.metadata ?? {}),
      last_refreshed_at: nowIso,
    };

    const { error } = await supabase
      .from('golf_coach_insights')
      .update({
        evidence,
        content: input.content,
        title: input.title,
        category: input.category,
        metadata: mergedMetadata,
        updated_at: nowIso,
      })
      .eq('id', existing.id);

    if (error) {
      throw new Error(`upsertInsight.refresh failed: ${error.message}`);
    }
    return existing.id;
  }

  // Movement > 5% — record the movement and possibly promote.
  const percentChange = existingValue === 0
    ? (newValue === 0 ? 0 : 1)
    : (newValue - existingValue) / Math.abs(existingValue);

  const movement: InsightMovement = {
    from: existingValue,
    to: newValue,
    direction: newValue >= existingValue ? 'up' : 'down',
    percent_change: percentChange,
  };

  const priorMovementCount = typeof priorMetadata.movement_count === 'number'
    ? (priorMetadata.movement_count as number)
    : 0;
  const nextMovementCount = priorMovementCount + 1;

  const shouldMature =
    existing.lifecycle_state === 'detected' &&
    nextMovementCount >= MATURATION_MOVEMENTS;

  const mergedMetadata: JsonRecord = {
    ...priorMetadata,
    ...(input.metadata ?? {}),
    movement,
    movement_count: nextMovementCount,
    last_refreshed_at: nowIso,
  };

  const updatePayload: Record<string, unknown> = {
    evidence,
    content: input.content,
    title: input.title,
    category: input.category,
    metadata: mergedMetadata,
    updated_at: nowIso,
  };
  if (shouldMature) {
    updatePayload.lifecycle_state = 'matured';
  }

  const { error } = await supabase
    .from('golf_coach_insights')
    .update(updatePayload)
    .eq('id', existing.id);

  if (error) {
    throw new Error(`upsertInsight.update failed: ${error.message}`);
  }
  return existing.id;
}

async function insertNew(
  supabase: SupabaseClient,
  input: InsightInput,
  evidence: InsightEvidence,
  confidence: number,
): Promise<string> {
  const lifecycleState: InsightLifecycleState =
    confidence < TENTATIVE_CONFIDENCE_FLOOR ? 'tentative' : 'detected';

  const metadata: JsonRecord = {
    ...(input.metadata ?? {}),
    movement_count: 0,
  };

  // `insight_type` is NOT NULL on the legacy table. Fall back to category as
  // the type so we don't violate the pre-existing constraint while we
  // migrate callers.
  const insertPayload = {
    player_id: input.player_id,
    category: input.category,
    signature: input.signature,
    title: input.title,
    content: input.content,
    evidence,
    metadata,
    lifecycle_state: lifecycleState,
    insight_type: input.category,
  };

  const { data, error } = await supabase
    .from('golf_coach_insights')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error) {
    throw new Error(`upsertInsight.insert failed: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error('upsertInsight.insert: no id returned');
  }
  return data.id as string;
}

interface DrillRow {
  id: string;
  tags: string[] | null;
}

/**
 * Attaches up to 3 drills to an insight based on category + tag overlap.
 * Idempotent: upserts on (insight_id, drill_id) and overwrites rank.
 */
export async function attachDrills(
  supabase: SupabaseClient,
  insightId: string,
  category: string,
  tags: string[],
): Promise<void> {
  if (tags.length === 0) return;

  const { data: drills, error } = await supabase
    .from('golf_drills')
    .select('id, tags')
    .eq('category', category)
    .overlaps('tags', tags);

  if (error) {
    throw new Error(`attachDrills.fetch failed: ${error.message}`);
  }
  if (!drills || drills.length === 0) return;

  const tagSet = new Set(tags);
  const scored = (drills as DrillRow[])
    .map((drill) => {
      const drillTags = drill.tags ?? [];
      const overlap = drillTags.filter((t) => tagSet.has(t)).length;
      return { id: drill.id, overlap };
    })
    .filter((d) => d.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 3);

  if (scored.length === 0) return;

  const rows = scored.map((drill, idx) => ({
    insight_id: insightId,
    drill_id: drill.id,
    rank: idx,
  }));

  const { error: upsertError } = await supabase
    .from('golf_insight_drill_attachments')
    .upsert(rows, { onConflict: 'insight_id,drill_id' });

  if (upsertError) {
    throw new Error(`attachDrills.upsert failed: ${upsertError.message}`);
  }
}
