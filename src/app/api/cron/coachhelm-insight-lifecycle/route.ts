/**
 * Nightly CoachHelm insight lifecycle progression cron (Foundation F3).
 *
 * Walks every non-terminal insight and applies the four rules from the
 * design contract at docs/superpowers/plans/2026-04-22-insight-quality/
 * 00-design-contract.md:
 *
 *   1. addressed → resolved when `evidence.your_value` has been within 20%
 *      of `evidence.comparison_value` for 2 consecutive evaluation cycles.
 *      Consecutive-cycle tracking lives on `metadata.healthy_cycles_count`:
 *      incremented when checked AND in the healthy band, reset to 0 when
 *      out of band. Upon resolution we set `resolved_at`.
 *
 *   2. detected insights with `metadata.movement_count == 0`, age > 30d,
 *      and no `addressed_at` are archived. Sets `archived_at`.
 *
 *   3. Any insight older than 90d that is neither matured nor addressed
 *      is archived. Sets `archived_at`.
 *
 *   4. Recompute `evidence.confidence_factors.recency` using age vs.
 *      window_days: if (age - window_days) > 0, drop recency by 0.2 per
 *      30 days of overage. Re-derive confidence. If confidence falls below
 *      0.4 AND the insight is still in `detected`, demote to `tentative`.
 *
 * Schedule: `0 2 * * *` (see vercel.json).
 * Auth:     Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { calcConfidence, type InsightEvidence, type InsightLifecycleState } from '@/lib/coachhelm/v2/insights/types';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const BATCH_LIMIT = 2000;
const HEALTHY_GAP_THRESHOLD = 0.20; // within 20% of comparison = healthy
const HEALTHY_CYCLES_TO_RESOLVE = 2;
const ARCHIVE_DETECTED_AGE_DAYS = 30;
const ARCHIVE_HARD_AGE_DAYS = 90;
const RECENCY_DECAY_PER_30D = 0.2;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

interface InsightRow {
  id: string;
  lifecycle_state: InsightLifecycleState | null;
  evidence: InsightEvidence | null;
  metadata: JsonRecord | null;
  created_at: string | null;
  addressed_at: string | null;
  archived_at: string | null;
  resolved_at: string | null;
}

interface UpdatePatch {
  lifecycle_state?: InsightLifecycleState;
  resolved_at?: string;
  archived_at?: string;
  metadata?: JsonRecord;
  evidence?: InsightEvidence;
  updated_at: string;
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();
  const now = Date.now();

  // Pull every non-terminal insight. Resolved/archived rows are frozen.
  const { data, error } = await supabase
    .from('golf_coach_insights')
    .select('id, lifecycle_state, evidence, metadata, created_at, addressed_at, archived_at, resolved_at')
    .in('lifecycle_state', ['tentative', 'detected', 'matured', 'addressed'])
    .limit(BATCH_LIMIT);

  if (error) {
    await logServerError(
      `cron.insight_lifecycle.fetch failed: ${error.message}`,
      {
        action: 'cron.coachhelm.insight_lifecycle.fetch',
        featureArea: 'coachhelm',
        extra: { code: error.code },
      },
      'error',
    );
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // The generated Database types lag the live schema until the next
  // `npm run db:types`. `lifecycle_state`, `evidence`, `metadata` are live
  // columns (applied via migration 20260422100000) — cast through unknown
  // rather than disabling type safety on the client.
  const rows = ((data ?? []) as unknown) as InsightRow[];

  let resolvedCount = 0;
  let archivedCount = 0;
  let recencyAdjustedCount = 0;
  let demotedCount = 0;
  let healthyCyclesUpdatedCount = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const patch = evaluateRow(row, now, nowIso);
      if (!patch) continue;

      if (patch.lifecycle_state === 'resolved') resolvedCount++;
      if (patch.lifecycle_state === 'archived') archivedCount++;
      if (patch.lifecycle_state === 'tentative') demotedCount++;
      if (patch.evidence) recencyAdjustedCount++;
      // Any metadata write that isn't already accounted for above counts as
      // a healthy-cycle bookkeeping update.
      if (
        patch.metadata &&
        !patch.lifecycle_state &&
        !patch.evidence
      ) {
        healthyCyclesUpdatedCount++;
      }

      // Same generated-types-lag reason as the SELECT above: the update
      // payload is a superset of the typed row. Use `unknown` to narrow-escape
      // without disabling typing on the client itself.
      const { error: updateError } = await supabase
        .from('golf_coach_insights')
        .update(patch as unknown as Record<string, never>)
        .eq('id', row.id);

      if (updateError) {
        failed++;
        await logServerError(
          `cron.insight_lifecycle.update failed: ${updateError.message}`,
          {
            action: 'cron.coachhelm.insight_lifecycle.update',
            featureArea: 'coachhelm',
            extra: { insightId: row.id, code: updateError.code },
          },
          'error',
        );
      }
    } catch (err) {
      failed++;
      await logServerError(
        `cron.insight_lifecycle.evaluate failed: ${err instanceof Error ? err.message : String(err)}`,
        {
          action: 'cron.coachhelm.insight_lifecycle.evaluate',
          featureArea: 'coachhelm',
          extra: {
            insightId: row.id,
            stack: err instanceof Error ? err.stack : undefined,
          },
        },
        'error',
      );
    }
  }

  return NextResponse.json({
    success: true,
    total: rows.length,
    resolved: resolvedCount,
    archived: archivedCount,
    recency_adjusted: recencyAdjustedCount,
    demoted_to_tentative: demotedCount,
    healthy_cycles_updated: healthyCyclesUpdatedCount,
    failed,
  });
}

/**
 * Pure function: given a row, decide what to write. Returns null when no
 * change is needed. Exported-for-test would be nice but keeping private
 * since the cron is exercised end-to-end.
 */
function evaluateRow(row: InsightRow, nowMs: number, nowIso: string): UpdatePatch | null {
  const patch: UpdatePatch = { updated_at: nowIso };
  let changed = false;

  const createdMs = row.created_at ? Date.parse(row.created_at) : nowMs;
  const ageDays = Math.max(0, (nowMs - createdMs) / MS_PER_DAY);
  const lifecycle = row.lifecycle_state;
  const metadata: JsonRecord = { ...(row.metadata ?? {}) };

  // --- Rule 3: hard archive at >90d if not matured and not addressed ---------
  const isHardArchivable =
    ageDays > ARCHIVE_HARD_AGE_DAYS &&
    lifecycle !== 'matured' &&
    lifecycle !== 'addressed';
  if (isHardArchivable) {
    patch.lifecycle_state = 'archived';
    patch.archived_at = nowIso;
    patch.metadata = metadata;
    return patch;
  }

  // --- Rule 2: detected + 0 movements + age>30d + no addressed_at -> archive --
  const movementCount = typeof metadata.movement_count === 'number'
    ? (metadata.movement_count as number)
    : 0;
  const isSoftArchivable =
    lifecycle === 'detected' &&
    ageDays > ARCHIVE_DETECTED_AGE_DAYS &&
    movementCount === 0 &&
    !row.addressed_at;
  if (isSoftArchivable) {
    patch.lifecycle_state = 'archived';
    patch.archived_at = nowIso;
    patch.metadata = metadata;
    return patch;
  }

  // --- Rule 1: addressed -> resolved when in healthy band for 2 cycles -------
  if (lifecycle === 'addressed' && row.evidence) {
    const { your_value, comparison_value } = row.evidence;
    const gap = comparison_value === 0
      ? (your_value === 0 ? 0 : Infinity)
      : Math.abs(your_value - comparison_value) / Math.abs(comparison_value);

    const priorCycles = typeof metadata.healthy_cycles_count === 'number'
      ? (metadata.healthy_cycles_count as number)
      : 0;

    if (gap <= HEALTHY_GAP_THRESHOLD) {
      const nextCycles = priorCycles + 1;
      metadata.healthy_cycles_count = nextCycles;
      changed = true;
      if (nextCycles >= HEALTHY_CYCLES_TO_RESOLVE) {
        patch.lifecycle_state = 'resolved';
        patch.resolved_at = nowIso;
        patch.metadata = metadata;
        return patch;
      }
    } else if (priorCycles > 0) {
      metadata.healthy_cycles_count = 0;
      changed = true;
    }
  }

  // --- Rule 4: recency decay + possible tentative demotion -------------------
  if (row.evidence && typeof row.evidence.window_days === 'number') {
    const overageDays = ageDays - row.evidence.window_days;
    if (overageDays > 0) {
      const priorRecency = row.evidence.confidence_factors?.recency ?? 1;
      const decay = (overageDays / 30) * RECENCY_DECAY_PER_30D;
      const newRecency = Math.max(0, priorRecency - decay);
      if (newRecency !== priorRecency) {
        const updatedEvidence: InsightEvidence = {
          ...row.evidence,
          confidence_factors: {
            ...row.evidence.confidence_factors,
            recency: newRecency,
          },
        };
        updatedEvidence.confidence = calcConfidence(updatedEvidence);
        patch.evidence = updatedEvidence;
        changed = true;
        // Re-evaluate lifecycle per Rule 1: demote detected -> tentative if
        // confidence fell below 0.4. Do not touch 'matured' / 'addressed'.
        if (lifecycle === 'detected' && updatedEvidence.confidence < 0.4) {
          patch.lifecycle_state = 'tentative';
        }
      }
    }
  }

  if (changed) {
    patch.metadata = metadata;
    return patch;
  }
  return null;
}
