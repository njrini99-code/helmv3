/**
 * The nightly lifecycle plan for one player (CoachHelm Slice 3). Pure: the
 * job (`job.ts`) loads the inputs and writes the patches; every decision is
 * made here so it can be tested without a database.
 *
 * Order (07 §2 G step 4): checkpoint → recheck → pairing → Under review →
 * archive. Numbers refresh every night; rungs (Cleared, Contradicted, the
 * archive) move only at a checkpoint that covers the read.
 */
import type { RecheckRecord } from '@/lib/coachhelm/v3/engine/recent-recheck';
import { decideArchive, archiveMetadata, isLifecycleRetired, RETIREMENT_KEYS, type ArchiveReason } from './archive-rules';
import { anyCheckpoint, checkpointCovers, familyForMetric, type CheckpointDecision } from './checkpoint';
import { pairReads, type StrategyLink } from './contradiction';
import {
  CONTRADICTION_RESOLVED_BY,
  LIFECYCLE_META_KEY,
  LIVE_STATES,
  readLifecycleMeta,
  type CorrectionRow,
  type LifecycleReadRow,
  type ReadLifecycleMeta,
} from './types';
import { RECHECK_RESOLVED_BY } from '@/lib/coachhelm/v3/engine/recent-recheck';
import { decideUnderReview } from './under-review';

export interface PlayerPlanInput {
  /** The player's live v3 reads plus the ones this step retired. */
  reads: readonly LifecycleReadRow[];
  decision: CheckpointDecision;
  /** Recheck results for covered reads whose family is rechecked. */
  rechecks: ReadonlyMap<string, RecheckRecord>;
  /** Newest countable round date (YYYY-MM-DD), for Out of date. */
  newestCountableRoundDate: string | null;
  corrections: readonly CorrectionRow[];
  /** Rounds failing the hole-sum check (any window). */
  flaggedRoundIds: ReadonlySet<string>;
  link: StrategyLink | null;
  nowIso: string;
}

export interface ReadPatch {
  id: string;
  action: 'update' | 'archive' | 'restore';
  observedLifecycle: string | null;
  observedUpdatedAt: string | null;
  lifecycle_state?: 'archived' | 'detected';
  archived_at?: string | null;
  metadata: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  archiveReason?: ArchiveReason;
}

export interface PlayerPlanCounts {
  covered: number;
  rechecked: number;
  cleared: number;
  holds: number;
  conflicts: number;
  under_review: number;
  archived: Partial<Record<ArchiveReason, number>>;
  restored: number;
}

export interface PlayerPlan {
  patches: ReadPatch[];
  counts: PlayerPlanCounts;
}

function day(v: unknown): string | null {
  return typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Drop undefined / null keys so the stored block stays small and stable. */
function compactMeta(meta: ReadLifecycleMeta): ReadLifecycleMeta {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as unknown as ReadLifecycleMeta;
}

/** The evidence with the lifecycle fields mirrored from `meta`. */
export function mirrorEvidence(
  evidence: Record<string, unknown> | null,
  meta: ReadLifecycleMeta,
): Record<string, unknown> | null {
  if (!evidence) return null;
  const next: Record<string, unknown> = { ...evidence };
  const fields: Array<[string, unknown]> = [
    ['recheck', meta.recheck],
    ['conflict', meta.conflict],
    ['under_review', meta.under_review],
  ];
  for (const [key, value] of fields) {
    if (value) next[key] = value;
    else delete next[key];
  }
  return next;
}

function evidenceChanged(before: Record<string, unknown> | null, after: Record<string, unknown> | null): boolean {
  if (!before || !after) return false;
  return (['recheck', 'conflict', 'under_review'] as const).some((k) => !same(before[k], after[k]));
}

export function planPlayer(input: PlayerPlanInput): PlayerPlan {
  const { reads, decision, rechecks, nowIso } = input;
  const counts: PlayerPlanCounts = {
    covered: 0,
    rechecked: 0,
    cleared: 0,
    holds: 0,
    conflicts: 0,
    under_review: 0,
    archived: {},
    restored: 0,
  };
  const patches: ReadPatch[] = [];

  const live = reads.filter((r) => LIVE_STATES.includes(r.lifecycle_state ?? '') && !r.dismissed);
  const liveIds = new Set(live.map((r) => r.id));
  const retired = reads.filter((r) => isLifecycleRetired(r.lifecycle_state, r.metadata));
  const fired = anyCheckpoint(decision);
  const pairing = fired ? pairReads(live, input.link, nowIso) : null;
  const correctionsByRead = new Map<string, CorrectionRow[]>();
  for (const c of input.corrections) {
    const list = correctionsByRead.get(c.insight_id) ?? [];
    list.push(c);
    correctionsByRead.set(c.insight_id, list);
  }

  for (const read of live) {
    const before = readLifecycleMeta(read.metadata);
    const meta: ReadLifecycleMeta = { ...before };
    const covered = checkpointCovers(decision, familyForMetric(read.evidence?.metric));
    const previousCheckpointAt = before.last_checkpoint_at ?? null;
    if (covered) {
      counts.covered += 1;
      meta.checkpoints_seen = before.checkpoints_seen + 1;
      meta.last_checkpoint_at = nowIso;
    }

    // --- recheck ---------------------------------------------------------
    const rec = covered ? rechecks.get(read.id) : undefined;
    if (rec) {
      counts.rechecked += 1;
      meta.recheck = rec;
      if (rec.outcome === 'holds') {
        counts.holds += 1;
        meta.checkpoints_held = (before.checkpoints_held ?? 0) + 1;
        if (typeof before.cleared_at_checkpoint === 'number') {
          meta.cleared_at_checkpoint = null;
          meta.cleared_at = null;
          meta.reopened_at = nowIso;
        }
      } else if (rec.outcome === 'cleared' && typeof before.cleared_at_checkpoint !== 'number') {
        counts.cleared += 1;
        meta.cleared_at_checkpoint = meta.checkpoints_seen;
        meta.cleared_at = nowIso;
      }
    }

    // --- pairing ---------------------------------------------------------
    const conflict = pairing?.conflicts.get(read.id);
    if (conflict) {
      counts.conflicts += 1;
      const isNew =
        !before.conflict ||
        before.conflict.with_insight_id !== conflict.with_insight_id ||
        before.conflict.kind !== conflict.kind;
      meta.conflict = conflict;
      meta.conflict_at_checkpoint = isNew ? meta.checkpoints_seen : (before.conflict_at_checkpoint ?? meta.checkpoints_seen);
    } else if (before.conflict && covered) {
      // A winner keeps its line until its next covering checkpoint; a pair
      // that no longer holds clears at the first one.
      const keepWinner =
        before.conflict.role === 'winner' && meta.checkpoints_seen <= (before.conflict_at_checkpoint ?? 0);
      if (!keepWinner) {
        meta.conflict = null;
        meta.conflict_at_checkpoint = null;
      }
    }

    // --- Under review ----------------------------------------------------
    const windowRounds = new Set(read.evidence?.source_round_ids ?? []);
    const flagged = [...input.flaggedRoundIds].filter((id) => windowRounds.has(id));
    const review = decideUnderReview({
      meta,
      covered,
      previousCheckpointAt,
      corrections: correctionsByRead.get(read.id) ?? [],
      flaggedRoundIds: flagged,
      nowIso,
    });
    meta.under_review = review.under_review;
    meta.under_review_at_checkpoint = review.under_review_at_checkpoint;
    meta.integrity_reviewed_round_ids = review.integrity_reviewed_round_ids;
    if (review.under_review) counts.under_review += 1;

    // --- Out of date -----------------------------------------------------
    const windowEnd = day(read.evidence?.window_end);
    const outOfDate =
      !!windowEnd && !!input.newestCountableRoundDate && windowEnd < input.newestCountableRoundDate;
    if (!outOfDate) meta.out_of_date_since_checkpoint = null;
    else if (covered && typeof before.out_of_date_since_checkpoint !== 'number') {
      meta.out_of_date_since_checkpoint = meta.checkpoints_seen;
    }

    // --- archive ---------------------------------------------------------
    const reason = decideArchive({
      lifecycle: read.lifecycle_state,
      meta,
      contradictedRetired: pairing?.retire.has(read.id) ?? false,
      outOfDate,
    });

    const nextMeta = compactMeta(meta);
    const metaChanged = !same(compactMeta(before), nextMeta);
    const evidenceBefore = (read.evidence ?? null) as Record<string, unknown> | null;
    const evidenceAfter = mirrorEvidence(evidenceBefore, nextMeta);
    const evChanged = evidenceChanged(evidenceBefore, evidenceAfter);
    if (!reason && !metaChanged && !evChanged) continue;

    const metadata: Record<string, unknown> = { ...(read.metadata ?? {}), [LIFECYCLE_META_KEY]: nextMeta };
    const patch: ReadPatch = {
      id: read.id,
      action: reason ? 'archive' : 'update',
      observedLifecycle: read.lifecycle_state,
      observedUpdatedAt: read.updated_at,
      metadata: reason ? { ...metadata, ...archiveMetadata(reason, nowIso, read.lifecycle_state) } : metadata,
      ...(evChanged && evidenceAfter ? { evidence: evidenceAfter } : {}),
    };
    if (reason) {
      patch.lifecycle_state = 'archived';
      patch.archived_at = nowIso;
      patch.archiveReason = reason;
      counts.archived[reason] = (counts.archived[reason] ?? 0) + 1;
    }
    patches.push(patch);
  }

  // --- reads this step retired: restore when the reason went away ---------
  for (const read of retired) {
    const before = readLifecycleMeta(read.metadata);
    const covered = checkpointCovers(decision, familyForMetric(read.evidence?.metric));
    if (!covered) continue;
    const meta: ReadLifecycleMeta = {
      ...before,
      checkpoints_seen: before.checkpoints_seen + 1,
      last_checkpoint_at: nowIso,
    };
    let restore = false;
    if (read.metadata?.resolved_by === RECHECK_RESOLVED_BY) {
      const rec = rechecks.get(read.id);
      if (rec) {
        counts.rechecked += 1;
        meta.recheck = rec;
        restore = rec.outcome === 'holds';
      }
    } else if (read.metadata?.resolved_by === CONTRADICTION_RESOLVED_BY) {
      const winner = before.conflict?.with_insight_id;
      restore = !winner || !liveIds.has(winner);
    }
    if (restore) {
      meta.cleared_at_checkpoint = null;
      meta.cleared_at = null;
      meta.conflict = null;
      meta.conflict_at_checkpoint = null;
      meta.reopened_at = nowIso;
    }
    const nextMeta = compactMeta(meta);
    const base: Record<string, unknown> = { ...(read.metadata ?? {}) };
    if (restore) {
      for (const k of RETIREMENT_KEYS) delete base[k];
      base.restored_by = read.metadata?.resolved_by ?? null;
      base.restored_at = nowIso;
    }
    const evidenceBefore = (read.evidence ?? null) as Record<string, unknown> | null;
    const evidenceAfter = mirrorEvidence(evidenceBefore, nextMeta);
    patches.push({
      id: read.id,
      action: restore ? 'restore' : 'update',
      observedLifecycle: read.lifecycle_state,
      observedUpdatedAt: read.updated_at,
      metadata: { ...base, [LIFECYCLE_META_KEY]: nextMeta },
      ...(evidenceChanged(evidenceBefore, evidenceAfter) && evidenceAfter ? { evidence: evidenceAfter } : {}),
      ...(restore ? { lifecycle_state: 'detected' as const, archived_at: null } : {}),
    });
    if (restore) counts.restored += 1;
  }

  return { patches, counts };
}
