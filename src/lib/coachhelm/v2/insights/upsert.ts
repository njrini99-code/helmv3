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
 *        increment metadata.movement_count (a raw "did this ever move" tally,
 *        read only by the cron's Rule 2 archive check — see lifecycle-policy.ts
 *        for the SEPARATE maturation-confirmation count, which requires
 *        MATURATION_CONFIRMATIONS distinct evidence revisions recorded while
 *        the row is 'detected' before promoting to 'matured').
 *      * EITHER branch: a 'tentative' row whose freshly recomputed confidence
 *        clears TENTATIVE_CONFIDENCE_FLOOR is promoted to 'detected'
 *        (2026-09-12 RC0 — this edge was missing; see lifecycle-policy.ts).
 *        Gated per team by `preferences.tentative_promotion_enabled`.
 *  - Otherwise INSERT new row with lifecycle_state = 'tentative' (if
 *    confidence < 0.4) else 'detected'.
 *
 *  All lifecycle decisions are made by the pure evaluator in
 *  ./lifecycle-policy.ts; this file only persists them, guarded by an
 *  optimistic compare-and-set on `lifecycle_state` (2026-09-22) so a
 *  concurrent coach dismissal/acknowledge/archive/resolve — or another
 *  concurrent engine write — is never silently overwritten by a decision
 *  computed from a stale read. See `updateExisting`'s CAS block.
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
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
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
  updated_at: string | null;
}

/**
 * True when `a` is a strictly newer evidence revision than `b` — later
 * `window_end`, or the same `window_end` with a larger `sample_n`. Used only
 * to decide whether a write that lost the CAS race below should retry once
 * against the row's current state, or drop itself as the stale one. `b: null`
 * (no revision to compare against) is treated as "newer" so a bad re-read
 * doesn't wedge a genuinely fresh write.
 *
 * `window_end` is NOT a consistent format across callers (checked 2026-09-23,
 * `rg -n "window_end:" src/lib/coachhelm`): v2 mining (approach-analytics.ts,
 * course-management.ts, tee-strategy.ts) writes a date-only `YYYY-MM-DD`
 * (`.toISOString().slice(0, 10)` / `todayIsoDate()`), while
 * to-insight-input.ts and several v3 evidence builders write a full
 * `now.toISOString()` timestamp. A raw string compare treats the shorter
 * date-only form as "less than" a full timestamp for the SAME calendar day
 * (a same-length-prefix loses to anything longer), which would misjudge a
 * genuinely-not-older write as stale. Comparing as parsed instants avoids
 * that; the raw string compare is kept only as a fallback for an unparseable
 * value; sample_n still breaks a same-instant tie either way.
 */
function isEvidenceNewer(a: InsightEvidence, b: InsightEvidence | null): boolean {
  if (!b) return true;
  const aTime = Date.parse(a.window_end);
  const bTime = Date.parse(b.window_end);
  if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
    if (aTime !== bTime) return aTime > bTime;
  } else if (a.window_end !== b.window_end) {
    return a.window_end > b.window_end;
  }
  return a.sample_n > b.sample_n;
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
    .select('id, evidence, metadata, lifecycle_state, updated_at')
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
  attempt = 0,
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

  // Maturation confirmations are tracked separately from `movement_count`
  // (the raw >=5% swing counter, used only by the cron's "never moved"
  // archive check). A confirmation is keyed to the evidence revision driving
  // THIS write so two writes over the identical source rounds — a re-emit,
  // or the same round re-evaluated by a different generator run — never
  // count twice, and only movements recorded while the row is already
  // `detected` count at all (see lifecycle-policy.ts header, 2026-09-22).
  const priorMaturationKeys: readonly string[] = Array.isArray(priorMetadata.maturation_keys)
    ? (priorMetadata.maturation_keys as unknown[]).filter((k): k is string => typeof k === 'string')
    : [];
  const evidenceRevisionKey = `${evidence.sample_n}|${evidence.window_end}`;

  const decision: LifecycleWriteDecision = resolveLifecycleOnWrite({
    existing: existing.lifecycle_state,
    confidence: evidence.confidence,
    movedThisWrite,
    evidenceRevisionKey,
    priorMaturationKeys,
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
  // Persist the maturation confirmation list whenever the evaluator changed
  // it — a fresh confirmation, or an explicit reset on promotion/resurrection.
  // `undefined` means "leave metadata.maturation_keys alone".
  if (decision.maturationKeys !== undefined) {
    mergedMetadata.maturation_keys = decision.maturationKeys;
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

  // Optimistic compare-and-set (2026-09-22 R1/R2; extended 2026-09-23 to
  // also guard the observed REVISION, not just lifecycle_state — plan §5.1
  // acceptance "a concurrent run cannot revert a later state", §15.2 "old
  // worker finishes after a new revision"). This whole write was decided
  // from `existing.lifecycle_state` AND `existing.updated_at` read at the
  // top of this call (or by our own caller, on the retry below). Between
  // that read and this write:
  //  - a coach action (dismiss/acknowledge/archive/resolve —
  //    `src/app/golf/actions/insights.ts`, `intelligence-dashboard.ts`) can
  //    move `lifecycle_state`, or
  //  - another concurrent engine write (a duplicate analysis run, the
  //    lifecycle cron, a generator's stale-scope sweep) can refresh
  //    evidence WITHOUT touching `lifecycle_state` at all.
  // Either one bumps `updated_at`, which the old lifecycle-only guard could
  // not see — a same-lifecycle refresh race would silently let an older,
  // stale write land over a newer one. Guarding on both together, matching
  // the pattern already used by `generator-base.ts`'s and `synthesis.ts`'s
  // archive sweeps, never lands a decision computed from a stale snapshot
  // on top of whatever the row is NOW.
  let casUpdate = supabase
    .from('golf_coach_insights')
    .update(updatePayload)
    .eq('id', existing.id);
  casUpdate = existing.lifecycle_state === null
    ? casUpdate.is('lifecycle_state', null)
    : casUpdate.eq('lifecycle_state', existing.lifecycle_state);
  casUpdate = existing.updated_at === null
    ? casUpdate.is('updated_at', null)
    : casUpdate.eq('updated_at', existing.updated_at);
  const { data: casRows, error } = await casUpdate.select('id');

  if (error) {
    const branch = movedThisWrite ? 'update' : 'refresh';
    throw new Error(`upsertInsight.${branch} failed: ${error.message}`);
  }

  if (!casRows || casRows.length === 0) {
    // Lost the race: lifecycle_state or updated_at no longer matches what
    // we read, so NONE of this write applied. Re-read to tell the two
    // causes apart instead of always backing off — a lifecycle action must
    // still win unconditionally, but a same-lifecycle evidence race should
    // let the genuinely newer write through.
    const { data: fresh, error: reReadError } = await supabase
      .from('golf_coach_insights')
      .select('id, evidence, metadata, lifecycle_state, updated_at')
      .eq('id', existing.id)
      .maybeSingle();

    if (reReadError) {
      // The re-read itself failed (transient DB error) — distinct from a
      // genuine lifecycle race below, which needs its own message so an
      // operator isn't told "lost lifecycle CAS race" for a plain read
      // failure that says nothing about what actually happened to the row.
      await logServerError(
        `upsertInsight.updateExisting: re-read after a CAS miss failed for insight=${existing.id}: ` +
          `${reReadError.message}; skipping write rather than retry blind`,
        { action: 'coachhelm.upsert.updateExisting.cas', featureArea: 'coachhelm', extra: { insightId: existing.id } },
        'warning',
      );
      return existing.id;
    }

    if (fresh && (fresh as ExistingInsightRow).lifecycle_state === existing.lifecycle_state) {
      // lifecycle_state is unchanged — the race was a concurrent
      // EVIDENCE-only refresh. Retry (once) only if OUR incoming evidence
      // is actually newer than what is now persisted; otherwise we are the
      // stale worker and must not clobber a concurrent newer revision.
      const freshRow = fresh as ExistingInsightRow;
      const evidenceIsNewer = isEvidenceNewer(evidence, freshRow.evidence);
      if (attempt < 1 && evidenceIsNewer) {
        return updateExisting(supabase, freshRow, input, evidence, teamId, attempt + 1);
      }
      if (evidenceIsNewer) {
        // The retry budget is exhausted but our evidence IS still newer —
        // this is exactly the silent-loss failure mode the CAS exists to
        // prevent, not a benign backoff. Page loudly; do not skipSentry.
        await logServerError(
          `upsertInsight.updateExisting: dropped a NEWER evidence write for insight=${existing.id} ` +
            `after exhausting the retry budget (attempt=${attempt}); incoming sample_n=${evidence.sample_n}/` +
            `window_end=${evidence.window_end} is still newer than the persisted ` +
            `sample_n=${freshRow.evidence?.sample_n ?? 'null'}/window_end=${freshRow.evidence?.window_end ?? 'null'}. ` +
            `This is a real evidence loss, not an expected race outcome — investigate repeated CAS contention on this row.`,
          { action: 'coachhelm.upsert.updateExisting.cas', featureArea: 'coachhelm', extra: { insightId: existing.id } },
          'error',
        );
        return existing.id;
      }
      // Expected, benign outcome of the CAS design itself (a losing
      // concurrent writer backing off) — telemetry, not an incident. It was
      // logged at 'warning', which put it on the Bridge triage queue: 166
      // unresolved rows under /admin/errors/57d84dd1 in 48 minutes on
      // 2026-09-24, every one with EQUAL evidence on both sides. 'info' keeps
      // it discoverable in the admin feed without asking anyone to triage it,
      // and durableCollapse folds a burst into one row with a count.
      await logServerEvent(
        `upsertInsight.updateExisting: dropped a stale evidence write for insight=${existing.id} ` +
          `(incoming sample_n=${evidence.sample_n}/window_end=${evidence.window_end} is not newer than the ` +
          `already-persisted sample_n=${freshRow.evidence?.sample_n ?? 'null'}/window_end=${freshRow.evidence?.window_end ?? 'null'}; ` +
          `skipping write to avoid regressing a concurrent newer revision)`,
        {
          action: 'coachhelm.upsert.updateExisting.cas',
          featureArea: 'coachhelm',
          extra: { insightId: existing.id },
          skipSentry: true,
          durableCollapse: true,
        },
        'info',
      );
      return existing.id;
    }

    // lifecycle_state genuinely moved — a real lifecycle action won. Do not
    // retry and clobber it — log and hand back the row's identity
    // unchanged. The next analysis run re-reads the current state and
    // decides fresh; a lost evidence refresh this run is not a lost insight.
    await logServerError(
      `upsertInsight.updateExisting: lost lifecycle CAS race for insight=${existing.id} ` +
        `(observed lifecycle_state=${existing.lifecycle_state ?? 'null'}, attempted transition=${decision.transition}); ` +
        `skipping write to avoid clobbering a concurrent lifecycle change`,
      { action: 'coachhelm.upsert.updateExisting.cas', featureArea: 'coachhelm', extra: { insightId: existing.id } },
      'warning',
    );
    return existing.id;
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
 * Team membership states that still count as "on the team" for ownership
 * purposes. 'pending' (invited, not yet approved) and 'removed' (explicitly
 * taken off the roster — `removePlayerFromTeamImpl` hard-deletes the row on
 * a normal removal, so a surviving 'removed' row is a soft-delete path some
 * other caller uses) are excluded. 'inactive' is a normal still-rostered
 * state (the roster UI's active/inactive toggle — injured/redshirt players
 * are NOT off the team) and was wrongly excluded before this fix, which
 * orphaned every insight generated for a benched-but-rostered player.
 */
const OWNED_TEAM_MEMBER_STATUSES = ['active', 'inactive'] as const;

/**
 * Resolve the team + staffing coach for a player so newly-created insights
 * carry the FK ownership the existing coach RLS policy expects.
 *
 * Ownership is resolved through `golf_team_coach_staff` (the canonical
 * coach↔team relationship). When a team has multiple staff, we prefer the
 * `is_primary` coach, then fall back to the earliest-created staff row.
 * Falls back to nulls if a player genuinely has no team membership row or no
 * staffed coach — better to land an orphaned row than throw, since refusing
 * to write loses the insight entirely rather than just its ownership.
 *
 * 2026-09-22 (orphan-insight investigation): both lookups here used to
 * destructure only `{ data }`, discarding `error` — so a real, retryable
 * Postgres/network failure on either query was silently indistinguishable
 * from "this player genuinely has no team," and produced the exact same
 * permanent orphan (coach_id AND team_id both NULL) as the legitimate case.
 * A prod read of the 18 existing orphan rows found none currently
 * attributable to this (all had a real, current absence of team membership
 * data — either zero `golf_team_members` rows ever, or a historical
 * removal), so this fix does not retroactively explain or repair those —
 * see the PR description for the read-only repair proposal. It closes the
 * silent-failure class going forward: an actual query error is now logged
 * distinctly (matching the pattern already used for
 * `isTentativePromotionEnabled` below and `approveJoinRequestImpl` in
 * `teams.ts`) instead of being indistinguishable from "no team," and a
 * one-shot retry absorbs a single transient blip before falling back to
 * nulls.
 */
async function resolvePlayerOwnership(
  supabase: SupabaseClient,
  playerId: string,
): Promise<{ coachId: string | null; teamId: string | null }> {
  try {
    const teamId = await resolveActiveTeamId(supabase, playerId);
    if (!teamId) {
      return { coachId: null, teamId: null };
    }

    const coachId = await resolveTeamPrimaryCoachId(supabase, teamId);
    return { coachId, teamId };
  } catch (error) {
    await logServerError(
      `resolvePlayerOwnership failed: ${describeError(error)}`,
      { action: 'coachhelm.upsert.resolvePlayerOwnership', featureArea: 'coachhelm' },
      'warning'
    );
    return { coachId: null, teamId: null };
  }
}

async function resolveActiveTeamId(
  supabase: SupabaseClient,
  playerId: string,
  attempt = 0,
): Promise<string | null> {
  const { data: membership, error } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .in('status', OWNED_TEAM_MEMBER_STATUSES)
    .order('created_at', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (attempt === 0) {
      return resolveActiveTeamId(supabase, playerId, attempt + 1);
    }
    await logServerError(
      `resolvePlayerOwnership: golf_team_members lookup failed for player=${playerId}, falling back to unowned: ${describeError(error)}`,
      { action: 'coachhelm.upsert.resolvePlayerOwnership', featureArea: 'coachhelm', playerId },
      'warning'
    );
    return null;
  }

  return membership?.team_id ?? null;
}

async function resolveTeamPrimaryCoachId(
  supabase: SupabaseClient,
  teamId: string,
  attempt = 0,
): Promise<string | null> {
  const { data: staff, error } = await supabase
    .from('golf_team_coach_staff')
    .select('coach_id, is_primary, created_at')
    .eq('team_id', teamId)
    .order('is_primary', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (attempt === 0) {
      return resolveTeamPrimaryCoachId(supabase, teamId, attempt + 1);
    }
    await logServerError(
      `resolvePlayerOwnership: golf_team_coach_staff lookup failed for team=${teamId}, falling back to unowned coach: ${describeError(error)}`,
      { action: 'coachhelm.upsert.resolvePlayerOwnership', featureArea: 'coachhelm' },
      'warning'
    );
    return null;
  }

  return staff?.coach_id ?? null;
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
