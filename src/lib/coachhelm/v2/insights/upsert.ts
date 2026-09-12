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
 *  - If an insight with same (signature, player_id, coach_id, team_id) exists
 *    (any age — the dedup lookup must match the scope of the global UNIQUE
 *    key, which has no time window; see DI-1, 2026-06-06):
 *      * |new.your_value - existing.evidence.your_value| / existing < 5% →
 *        refresh evidence + content; don't touch lifecycle_state.
 *      * >= 5% movement → update evidence + content; set metadata.movement;
 *        increment metadata.movement_count. When count reaches 3 and current
 *        state is 'detected', promote to 'matured'.
 *      * EITHER branch: a 'tentative' row whose freshly recomputed confidence
 *        clears TENTATIVE_CONFIDENCE_FLOOR is promoted to 'detected'
 *        (2026-09-12 RC0 — this edge was missing; see lifecycle-policy.ts).
 *        Gated per team by `preferences.tentative_promotion_enabled`.
 *  - Otherwise INSERT new row with lifecycle_state = 'tentative' (if
 *    confidence < 0.4) else 'detected'.
 *
 *  All lifecycle decisions are made by the pure evaluator in
 *  ./lifecycle-policy.ts; this file only persists them.
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
import { calcConfidence, CONFIDENCE_METHOD_VERSION } from './types';
import {
  resolveLifecycleOnInsert,
  resolveLifecycleOnWrite,
  TENTATIVE_CONFIDENCE_FLOOR,
  type LifecycleWriteDecision,
} from './lifecycle-policy';
import { getActiveGate, incrementGatedCount } from './gate-context';
import { notifyInsightLanded } from '@/lib/notifications/insight-notifier';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

/**
 * Sentinel returned by `upsertInsight` when an active philosophy gate
 * decided the insight should not be written. Callers that need to know
 * whether a write happened can check for this constant; existing callers
 * that ignore the return value continue to work.
 */
export const GATED_OUT = '__gated_out__';

/** Stable marker for `isEvidenceRefusal` — see below. Not exported; callers
 * should go through the predicate, not compare `code` themselves. */
const EVIDENCE_REFUSAL_CODE = 'INSIGHT_EVIDENCE_REFUSAL' as const;

/**
 * Thrown by `upsertInsight` when `evidence.sample_n` is below the Rule 1
 * floor. This is CONTROL FLOW BY DESIGN — insufficient evidence means "don't
 * publish yet", not an infra failure. Callers that don't need to distinguish
 * it can keep treating it as a generic thrown Error; callers that log
 * failures (e.g. the v3 synthesis sweep) should route it through
 * `isEvidenceRefusal()` and log at a non-paging severity instead of letting
 * it read as a prod incident.
 */
export class InsightEvidenceRefusal extends Error {
  readonly code = EVIDENCE_REFUSAL_CODE;

  constructor(message: string) {
    super(message);
    this.name = 'InsightEvidenceRefusal';
  }
}

/**
 * True when `err` is an `InsightEvidenceRefusal`. Checks the stable `code`
 * marker rather than `instanceof` (robust to module duplication across
 * bundler chunks) or message text (fragile against copy edits).
 */
export function isEvidenceRefusal(err: unknown): err is InsightEvidenceRefusal {
  return (
    err instanceof Error &&
    (err as { code?: unknown }).code === EVIDENCE_REFUSAL_CODE
  );
}

const MOVEMENT_THRESHOLD = 0.05; // 5%
/**
 * Platform evidence floor (see docs/architecture/coachhelm-evidence-contract.md).
 * Exported because it is a floor GENERATORS must respect, not just one this
 * module rejects against: a rule whose own detect() gate sits below it fires,
 * composes, and is refused on every run — it can never publish. Rules import
 * this rather than restating `5`, so moving the floor moves their gates too.
 */
export const MIN_SAMPLE_N = 5;

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
    throw new InsightEvidenceRefusal(
      `upsertInsight: evidence.sample_n=${input.evidence?.sample_n ?? 'null'} < ${MIN_SAMPLE_N}; refusing to emit`,
    );
  }

  // Recompute confidence so generators can't drift.
  const confidence = calcConfidence(input.evidence);
  const evidence: InsightEvidence = {
    ...input.evidence,
    confidence,
    confidence_factors: {
      ...input.evidence.confidence_factors,
      method_version: CONFIDENCE_METHOD_VERSION,
    },
  };

  // 2026-05-24 Wave 7B — philosophy gate (replaces Wave 6 post-filter).
  // If the caller wrapped this in `runWithGate(...)`, honor it BEFORE we
  // touch the DB so we don't create a row only to archive it later. The
  // gate uses `insight_type ?? category` to match the same value upsert
  // would otherwise persist (see `insertNew` below). Callers that don't
  // opt in (no active gate) get the old unconditional behavior.
  const gate = getActiveGate();
  if (gate) {
    const effectiveType = input.insight_type ?? input.category;
    if (
      confidence < gate.confidenceThreshold ||
      !gate.isInsightTypeEnabled(effectiveType)
    ) {
      incrementGatedCount();
      return GATED_OUT;
    }
  }

  // 2026-05-23: Resolve coach/team ownership BEFORE the dedup lookup so
  // Tier-1 generators (which call upsertInsight without coach_id/team_id)
  // can dedup against rows that resolvePlayerOwnership later attached
  // those IDs to. Without this, every Tier-1 generator multiplied insights
  // on every analyze run because the (..., null, null) lookup never
  // matched the (..., realCoach, realTeam) row that was inserted last time.
  // See audit P0-3 from the 2026-05-23 multi-agent review.
  const ownership = (input.coach_id === undefined || input.coach_id === null
                     || input.team_id === undefined || input.team_id === null)
    ? (input.player_id ? await resolvePlayerOwnership(supabase, input.player_id) : { coachId: null, teamId: null })
    : { coachId: input.coach_id, teamId: input.team_id };
  const resolvedCoachId = input.coach_id ?? ownership.coachId;
  const resolvedTeamId = input.team_id ?? ownership.teamId;

  // Look up the most recent row with same (signature, player_id, coach_id,
  // team_id).
  //
  // 2026-06-06 DI-1: the dedup lookup MUST match the scope of the global
  // UNIQUE NULLS NOT DISTINCT constraint (signature,player_id,coach_id,team_id)
  // that `insertNew` upserts against — that constraint has NO 30-day window.
  // The old `.gte(created_at, now()-30d)` filter narrowed the lookup so that
  // for an insight older than 30 days we'd MISS the existing row, fall into
  // `insertNew`, hit the conflict, and (with ignoreDuplicates:true) leave the
  // stale row untouched — recomputed evidence silently dropped and the
  // lifecycle frozen forever. Dropping the cutoff routes the refresh through
  // `updateExisting` (a true DO-UPDATE / upsert, no destructive write) so
  // fresh evidence always lands regardless of the row's age.

  // 2026-05-17: dedup is scoped to (signature, player_id, coach_id, team_id)
  // — closes audit S-HIGH-1 / Q-NEW-2 / Q-NEW-3. The previous dedup keyed
  // only on (signature, player_id), which allowed coach B at org Y to
  // silently overwrite an insight authored by coach A at org X when they
  // share a player (transferred athlete, multi-team setup).
  let lookup = supabase
    .from('golf_coach_insights')
    .select('id, evidence, metadata, lifecycle_state')
    .eq('signature', input.signature);
  lookup = input.player_id === null
    ? lookup.is('player_id', null)
    : lookup.eq('player_id', input.player_id);
  lookup = resolvedCoachId === null || resolvedCoachId === undefined
    ? lookup.is('coach_id', null)
    : lookup.eq('coach_id', resolvedCoachId);
  lookup = resolvedTeamId === null || resolvedTeamId === undefined
    ? lookup.is('team_id', null)
    : lookup.eq('team_id', resolvedTeamId);
  const { data: existingRows, error: lookupError } = await lookup
    .order('created_at', { ascending: false })
    .limit(1);

  if (lookupError) {
    throw new Error(`upsertInsight.lookup failed: ${lookupError.message}`);
  }

  const existing = (existingRows?.[0] ?? null) as ExistingInsightRow | null;

  if (existing) {
    return updateExisting(supabase, existing, input, evidence, resolvedTeamId);
  }

  return insertNew(supabase, input, evidence, confidence, resolvedCoachId, resolvedTeamId);
}

async function updateExisting(
  supabase: SupabaseClient,
  existing: ExistingInsightRow,
  input: InsightInput,
  evidence: InsightEvidence,
  teamId: string | null,
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
  const priorMovementCount = typeof priorMetadata.movement_count === 'number'
    ? (priorMetadata.movement_count as number)
    : 0;
  const movedThisWrite = relChange >= MOVEMENT_THRESHOLD;
  const nextMovementCount = movedThisWrite ? priorMovementCount + 1 : priorMovementCount;

  // The team gate is only consulted when a promotion is actually possible —
  // a tentative row clearing the floor — so the common refresh path costs no
  // extra round-trip. Fails OPEN (see isTentativePromotionEnabled).
  const promotionPossible =
    existing.lifecycle_state === 'tentative' &&
    evidence.confidence >= TENTATIVE_CONFIDENCE_FLOOR;
  const promotionEnabled = promotionPossible
    ? await isTentativePromotionEnabled(supabase, teamId)
    : true;

  const decision: LifecycleWriteDecision = resolveLifecycleOnWrite({
    existing: existing.lifecycle_state,
    confidence: evidence.confidence,
    nextMovementCount,
    movedThisWrite,
    promotionEnabled,
  });

  const mergedMetadata: JsonRecord = {
    ...priorMetadata,
    ...(input.metadata ?? {}),
    last_refreshed_at: nowIso,
  };
  if (movedThisWrite) {
    const percentChange = existingValue === 0
      ? (newValue === 0 ? 0 : 1)
      : (newValue - existingValue) / Math.abs(existingValue);
    const movement: InsightMovement = {
      from: existingValue,
      to: newValue,
      direction: newValue >= existingValue ? 'up' : 'down',
      percent_change: percentChange,
    };
    mergedMetadata.movement = movement;
    mergedMetadata.movement_count = nextMovementCount;
  }

  const updatePayload: Record<string, unknown> = {
    evidence,
    content: input.content,
    title: input.title,
    category: input.category,
    metadata: mergedMetadata,
    updated_at: nowIso,
  };
  // Re-persist the freshly-computed severity. Value-derived generators
  // recompute priority every run, and there is no coach manual-priority
  // edit path (coaches only dismiss/acknowledge/resolve), so an insight that
  // escalated/de-escalated would otherwise keep its stale INSERT-time
  // priority — wrong in the Alert Center's ['urgent','high'] filter + ordering.
  if (input.priority) updatePayload.priority = input.priority;

  // Lifecycle: only written when it actually changes. `status` is deliberately
  // NEVER touched — a coach dismissal keeps hiding the row regardless of
  // lifecycle. `created_at` is never rewritten either: a promoted row keeps its
  // original feed date instead of surfacing as "new today".
  switch (decision.transition) {
    case 'promoted':
      updatePayload.lifecycle_state = decision.next;
      mergedMetadata.promoted_at = nowIso;
      mergedMetadata.promotion_reason = 'confidence_floor';
      if (typeof mergedMetadata.first_visible_at !== 'string') {
        mergedMetadata.first_visible_at = nowIso;
      }
      break;
    case 'matured':
      updatePayload.lifecycle_state = decision.next;
      break;
    case 'resurrected':
      // RESURRECTION (to-95 audit P2): fresh evidence landing on an archived
      // row must bring it back, through the same confidence gate as an insert
      // (regrade NEW-P2). Otherwise delivery could never show it again.
      updatePayload.lifecycle_state = decision.next;
      updatePayload.archived_at = null;
      mergedMetadata.redetected_at = nowIso;
      break;
    case 'none':
      break;
  }

  const { error } = await supabase
    .from('golf_coach_insights')
    .update(updatePayload)
    .eq('id', existing.id);

  if (error) {
    const branch = movedThisWrite ? 'update' : 'refresh';
    throw new Error(`upsertInsight.${branch} failed: ${error.message}`);
  }

  // Wave 1B — post-write push hook. The notifier only pushes on matured /
  // resolved; a tentative → detected promotion is reported as a promotion
  // (so the hook can see it) but produces no push. Resolution transitions
  // happen via the lifecycle cron, not upsertInsight. Never let a push
  // failure break the upsert. Refresh writes with no transition stay silent,
  // exactly as before.
  const promotedOrMatured =
    decision.transition === 'promoted' || decision.transition === 'matured';
  if (movedThisWrite || promotedOrMatured) {
    try {
      if (input.player_id) {
        await notifyInsightLanded({
          player_id: input.player_id,
          insight_id: existing.id,
          category: input.category,
          title: input.title,
          evidence,
          lifecycle_state: decision.next,
          was_lifecycle_promotion: promotedOrMatured,
        });
      }
    } catch (error) {
      // notifyInsightLanded never throws, but belt-and-braces here.
      await logServerError(
        `notifyInsightLanded threw unexpectedly: ${describeError(error)}`,
        { action: 'coachhelm.upsert.updateExisting.notifyInsightLanded', featureArea: 'coachhelm', playerId: input.player_id ?? undefined },
        'warning'
      );
    }
  }

  return existing.id;
}

/**
 * Team gate for the tentative → detected promotion edge, read from
 * `golf_team_coachhelm_settings.preferences.tentative_promotion_enabled`
 * (same JSONB blob and same opt-OUT convention as the v3 generator toggles:
 * only an explicit `false` pauses promotion). Exists so the 2026-09 recovery
 * can be canaried one team at a time by SQL, without a deploy per step.
 * Fails OPEN on a missing settings row or a lookup error — a transient DB
 * fault must not silently freeze visibility — and logs the fault.
 */
async function isTentativePromotionEnabled(
  supabase: SupabaseClient,
  teamId: string | null,
): Promise<boolean> {
  if (!teamId) return true;
  try {
    const { data, error } = await supabase
      .from('golf_team_coachhelm_settings')
      .select('preferences')
      .eq('team_id', teamId)
      .maybeSingle();
    if (error) {
      await logServerError(
        `isTentativePromotionEnabled lookup failed for team=${teamId}: ${error.message}`,
        { action: 'coachhelm.upsert.isTentativePromotionEnabled', featureArea: 'coachhelm' },
        'warning'
      );
      return true;
    }
    const prefs = ((data as { preferences?: unknown } | null)?.preferences ?? {}) as JsonRecord;
    return prefs.tentative_promotion_enabled !== false;
  } catch (err) {
    await logServerError(
      `isTentativePromotionEnabled threw for team=${teamId}: ${describeError(err)}`,
      { action: 'coachhelm.upsert.isTentativePromotionEnabled', featureArea: 'coachhelm' },
      'warning'
    );
    return true;
  }
}

async function insertNew(
  supabase: SupabaseClient,
  input: InsightInput,
  evidence: InsightEvidence,
  confidence: number,
  coachId: string | null,
  teamId: string | null,
): Promise<string> {
  const lifecycleState: InsightLifecycleState = resolveLifecycleOnInsert(confidence);

  const metadata: JsonRecord = {
    ...(input.metadata ?? {}),
    movement_count: 0,
  };
  // Rows born visible record it; rows born tentative get the stamp on promotion.
  if (lifecycleState === 'detected') {
    metadata.first_visible_at = new Date().toISOString();
  }

  // coachId / teamId resolved by upsertInsight() before the dedup lookup;
  // see 2026-05-23 P0-3 fix. `insight_type` is NOT NULL on the legacy
  // table; fall back to category to satisfy the pre-existing constraint.
  const insertPayload = {
    player_id: input.player_id,
    coach_id: coachId,
    team_id: teamId,
    category: input.category,
    signature: input.signature,
    title: input.title,
    content: input.content,
    evidence,
    metadata,
    lifecycle_state: lifecycleState,
    insight_type: input.insight_type ?? input.category,
    priority: input.priority ?? 'medium',
  };

  // Use ON CONFLICT against the (signature, player_id, coach_id, team_id)
  // UNIQUE NULLS NOT DISTINCT constraint added in migration
  // 20260523200000_coachhelm_p0_sweep.sql. This closes the TOCTOU race
  // where two concurrent runs (e.g. post-round-trigger + safety-net cron)
  // both passed the dedup lookup and both inserted. ignoreDuplicates means
  // a concurrent insert leaves the existing row untouched; we then re-read
  // the id below if data came back empty.
  const { data, error } = await supabase
    .from('golf_coach_insights')
    .upsert(insertPayload, {
      onConflict: 'signature,player_id,coach_id,team_id',
      ignoreDuplicates: true,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`upsertInsight.insert failed: ${error.message}`);
  }

  // ignoreDuplicates returns null when the conflicting row already exists;
  // re-read by the dedup key to recover the id.
  if (!data?.id) {
    let recover = supabase
      .from('golf_coach_insights')
      .select('id')
      .eq('signature', input.signature);
    recover = input.player_id === null ? recover.is('player_id', null) : recover.eq('player_id', input.player_id);
    recover = coachId === null ? recover.is('coach_id', null) : recover.eq('coach_id', coachId);
    recover = teamId === null ? recover.is('team_id', null) : recover.eq('team_id', teamId);
    const { data: existing } = await recover.limit(1).maybeSingle();
    if (existing?.id) return existing.id as string;
    throw new Error('upsertInsight.insert: no id returned and recovery lookup failed');
  }
  return data.id as string;
}

interface DrillRow {
  id: string;
  tags: string[] | null;
}

/**
 * Resolve the team + staffing coach for a player so newly-created insights
 * carry the FK ownership the existing coach RLS policy expects.
 *
 * Ownership is resolved through `golf_team_coach_staff` (the canonical
 * coach↔team relationship). When a team has multiple staff, we prefer the
 * `is_primary` coach, then fall back to the earliest-created staff row.
 * Falls back to nulls if a player has no active team membership or no
 * staffed coach — better to land an orphaned row than throw.
 */
async function resolvePlayerOwnership(
  supabase: SupabaseClient,
  playerId: string,
): Promise<{ coachId: string | null; teamId: string | null }> {
  try {
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', playerId)
      .eq('status', 'active')
      .order('created_at', { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    const teamId = membership?.team_id ?? null;
    if (!teamId) {
      return { coachId: null, teamId: null };
    }

    const { data: staff } = await supabase
      .from('golf_team_coach_staff')
      .select('coach_id, is_primary, created_at')
      .eq('team_id', teamId)
      .order('is_primary', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    return { coachId: staff?.coach_id ?? null, teamId };
  } catch (error) {
    await logServerError(
      `resolvePlayerOwnership failed: ${describeError(error)}`,
      { action: 'coachhelm.upsert.resolvePlayerOwnership', featureArea: 'coachhelm' },
      'warning'
    );
    return { coachId: null, teamId: null };
  }
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
  // Six v2 mining call sites (approach-analytics x3, course-management
  // x2, tee-strategy x1) pass the result of `upsertInsight()` directly
  // into this function. When the philosophy gate suppresses a write,
  // upsertInsight returns the GATED_OUT sentinel string ('__gated_out__'),
  // not a UUID. Without this guard, the next .upsert() raises
  // 'invalid input syntax for type uuid' and the entire generator chain
  // throws (observed in Sentry as JAVASCRIPT-NEXTJS-21/22).
  if (insightId === GATED_OUT) return;
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
