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
 *   2. detected insights with `metadata.movement_count == 0`,
 *      staleness > 30d, and no `addressed_at` are archived. Sets `archived_at`.
 *
 *   3. Any insight stale for more than 90d that is neither matured nor
 *      addressed is archived. Sets `archived_at`.
 *
 *      STALENESS ANCHOR (Rules 2 & 3): a row the engine is still actively
 *      refreshing is ALIVE and must NOT be archived. The new generator regen
 *      refreshes rows nightly (bumping `metadata.last_refreshed_at`) and the
 *      upsert's resurrection brings archived rows back to `detected`
 *      (stamping `metadata.redetected_at`). Anchoring archive purely on
 *      `created_at` would archive a still-emitted insight, the next regen
 *      would resurrect it, and the cron would re-archive it — a permanent
 *      nightly flap. So Rules 2 & 3 anchor staleness on the most recent sign
 *      of life: `max(created_at, metadata.last_refreshed_at,
 *      metadata.redetected_at)`. Both metadata fields are parsed defensively
 *      (may be absent or malformed). Rule 4 below deliberately keeps using
 *      `created_at`-based age (it models DATA recency, not row liveness).
 *
 *   4. Recompute `evidence.confidence_factors.recency` using age vs.
 *      window_days: if (age - window_days) > 0, drop recency by 0.2 per
 *      30 days of overage. Re-derive confidence. If confidence falls below
 *      0.4 AND the insight is still in `detected`, demote to `tentative`.
 *      NB: `age` here is `created_at`-based on purpose (data recency), NOT
 *      the liveness anchor used by Rules 2 & 3.
 *
 * Schedule: `0 2 * * *` (see vercel.json).
 * Auth:     Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { calcConfidence, type InsightEvidence, type InsightLifecycleState } from '@/lib/coachhelm/v2/insights/types';
import { rollupInsightEffectivenessForYesterday } from '@/lib/coachhelm/v2/analytics/effectiveness-writer';
import { rollupPredictionPerformanceRolling30d } from '@/lib/coachhelm/v2/analytics/prediction-performance-writer';
import { requireCronAuth } from '@/lib/cron/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 2000;
const MAX_ROWS_PER_RUN = 10000;
const UPDATE_CONCURRENCY = 50;
// 2026-05-24: reduced 12h → 6h to cut addressed→resolved minimum lifecycle
// from 48h to 24h. With 2 healthy-cycles required for resolution, a 6h
// evaluation window means insights actively trending toward fix can resolve
// within a day instead of waiting two. Coaches retain manual resolve.
const STALE_EVALUATION_MS = 6 * 60 * 60 * 1000;
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
  updated_at: string | null;
}

interface UpdatePatch {
  lifecycle_state?: InsightLifecycleState;
  resolved_at?: string;
  archived_at?: string;
  metadata?: JsonRecord;
  evidence?: InsightEvidence;
  updated_at: string;
}

interface LifecycleCursor {
  updatedAt: string;
  id: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse and validate the pagination cursor from the query string.
 *
 * The cursor is interpolated into a PostgREST `.or(...)` filter further
 * down, so unvalidated input could break the query or (in theory) allow
 * filter injection. The cron is cron-auth protected, but we still validate
 * fail-closed so a malformed cursor returns null (start of scan) instead of
 * a 500.
 */
function parseCursor(raw: string | null): LifecycleCursor | null {
  if (!raw) return null;
  const [updatedAt, id] = raw.split('|');
  if (!updatedAt || !id) return null;

  // `id` must be a UUID — golf_coach_insights.id is uuid.
  if (!UUID_REGEX.test(id)) return null;

  // `updatedAt` must round-trip through Date.parse → ISO so we know it is
  // a well-formed timestamp PostgREST will accept.
  const parsedMs = Date.parse(updatedAt);
  if (Number.isNaN(parsedMs)) return null;
  const isoUpdatedAt = new Date(parsedMs).toISOString();

  return { updatedAt: isoUpdatedAt, id };
}

function formatCursor(cursor: LifecycleCursor): string {
  return `${cursor.updatedAt}|${cursor.id}`;
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();
  const now = Date.now();
  const staleBeforeIso = new Date(now - STALE_EVALUATION_MS).toISOString();
  let cursor = parseCursor(req.nextUrl.searchParams.get('cursor'));

  type EvaluatedRow = { id: string; patch: UpdatePatch };
  let scannedCount = 0;
  let nextCursor: string | null = null;
  let reachedRunLimit = false;
  let resolvedCount = 0;
  let archivedCount = 0;
  let recencyAdjustedCount = 0;
  let demotedCount = 0;
  let healthyCyclesUpdatedCount = 0;
  let failed = 0;

  while (scannedCount < MAX_ROWS_PER_RUN) {
    const remaining = MAX_ROWS_PER_RUN - scannedCount;
    const limit = Math.min(PAGE_SIZE, remaining);
    let query = supabase
      .from('golf_coach_insights')
      .select('id, lifecycle_state, evidence, metadata, created_at, addressed_at, archived_at, resolved_at, updated_at')
      .in('lifecycle_state', ['tentative', 'detected', 'matured', 'addressed'])
      .lt('updated_at', staleBeforeIso)
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true });

    if (cursor) {
      query = query.or(`updated_at.gt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id})`);
    }

    const { data, error } = await query.limit(limit);

    if (error) {
      await logServerError(
        `cron.insight_lifecycle.fetch failed: ${error.message}`,
        {
          action: 'cron.coachhelm.insight_lifecycle.fetch',
          featureArea: 'coachhelm',
          extra: { code: error.code, cursor },
        },
        'error',
      );
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Generated Database types lag the live schema. Cast through unknown.
    const page = ((data ?? []) as unknown) as InsightRow[];
    if (page.length === 0) break;

    scannedCount += page.length;
    const last = page[page.length - 1];
    if (last?.updated_at) {
      cursor = { updatedAt: last.updated_at, id: last.id };
      nextCursor = formatCursor(cursor);
    } else {
      // Defensive: a row in the page has null updated_at. Without advancing
      // the cursor, the next query would re-scan the same page indefinitely
      // until MAX_ROWS_PER_RUN. Log and break out cleanly so the run still
      // completes with accurate metrics.
      await logServerError(
        `[lifecycle cron] page tail has null updated_at (id=${last?.id ?? 'unknown'}); aborting pagination to avoid infinite re-scan`,
        {
          action: 'cron.coachhelm.insightLifecycle.cursor',
          featureArea: 'coachhelm',
          extra: { lastId: last?.id ?? null, scannedCount },
        },
        'warning',
      );
      break;
    }

    const evaluated: EvaluatedRow[] = [];
    for (const row of page) {
      try {
        const patch = evaluateRow(row, now, nowIso);
        if (!patch) continue;
        if (patch.lifecycle_state === 'resolved') resolvedCount++;
        if (patch.lifecycle_state === 'archived') archivedCount++;
        if (patch.lifecycle_state === 'tentative') demotedCount++;
        if (patch.evidence) recencyAdjustedCount++;
        if (patch.metadata && !patch.lifecycle_state && !patch.evidence) {
          healthyCyclesUpdatedCount++;
        }
        evaluated.push({ id: row.id, patch });
      } catch (err) {
        await logServerError(
          `cron.insight_lifecycle.evaluate failed: ${err instanceof Error ? err.message : String(err)}`,
          {
            action: 'cron.coachhelm.insight_lifecycle.evaluate',
            featureArea: 'coachhelm',
            extra: { insightId: row.id, stack: err instanceof Error ? err.stack : undefined },
          },
          'error',
        );
      }
    }

    // Issue updates in concurrent chunks (50 in flight at once) instead of
    // serial round-trips. Per-row updates remain because evidence + metadata
    // patches are row-specific (recency decay, healthy_cycles_count).
    for (let i = 0; i < evaluated.length; i += UPDATE_CONCURRENCY) {
      const chunk = evaluated.slice(i, i + UPDATE_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(({ id, patch }) =>
          supabase
            .from('golf_coach_insights')
            .update(patch as unknown as Record<string, never>)
            .eq('id', id),
        ),
      );
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const updateError = result?.error;
        if (updateError) {
          failed++;
          await logServerError(
            `cron.insight_lifecycle.update failed: ${updateError.message}`,
            {
              action: 'cron.coachhelm.insight_lifecycle.update',
              featureArea: 'coachhelm',
              extra: { insightId: chunk[j]?.id, code: updateError.code },
            },
            'error',
          );
        }
      }
    }

    if (page.length < limit) break;
    reachedRunLimit = scannedCount >= MAX_ROWS_PER_RUN;
  }

  // After lifecycle progression, run the analytics rollups so
  // golf_insight_effectiveness and golf_prediction_model_performance fill.
  // Failures here MUST NOT mask lifecycle progression success.
  let effectivenessResult: Awaited<ReturnType<typeof rollupInsightEffectivenessForYesterday>> | null = null;
  let predictionResult: Awaited<ReturnType<typeof rollupPredictionPerformanceRolling30d>> | null = null;
  try {
    effectivenessResult = await rollupInsightEffectivenessForYesterday(supabase);
  } catch (err) {
    await logServerError(
      `cron.insight_lifecycle.effectiveness_rollup failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'cron.coachhelm.insight_lifecycle.effectiveness_rollup', featureArea: 'coachhelm' },
      'error',
    );
  }
  try {
    predictionResult = await rollupPredictionPerformanceRolling30d(supabase);
  } catch (err) {
    await logServerError(
      `cron.insight_lifecycle.prediction_rollup failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'cron.coachhelm.insight_lifecycle.prediction_rollup', featureArea: 'coachhelm' },
      'error',
    );
  }

  return NextResponse.json({
    success: true,
    total: scannedCount,
    stale_before: staleBeforeIso,
    max_rows_per_run: MAX_ROWS_PER_RUN,
    next_cursor: reachedRunLimit ? nextCursor : null,
    resolved: resolvedCount,
    archived: archivedCount,
    recency_adjusted: recencyAdjustedCount,
    demoted_to_tentative: demotedCount,
    healthy_cycles_updated: healthyCyclesUpdatedCount,
    failed,
    effectiveness_rollup: effectivenessResult,
    prediction_rollup: predictionResult,
  });
}

/**
 * Defensively parse a metadata timestamp into epoch-ms. Returns
 * Number.NEGATIVE_INFINITY for absent / non-string / unparseable values so it
 * never wins a `Math.max(...)` against a real `created_at`. Used by the Rule
 * 2/3 liveness anchor where `metadata.last_refreshed_at` and
 * `metadata.redetected_at` may be missing or malformed.
 */
function parseMetadataMs(value: unknown): number {
  if (typeof value !== 'string') return Number.NEGATIVE_INFINITY;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
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

  // Staleness anchor for the archive rules (2 & 3): the most recent sign of
  // life. A row the engine is still refreshing nightly (last_refreshed_at) or
  // that resurrection just brought back (redetected_at) is ALIVE and must not
  // be archived just because it was first CREATED long ago — otherwise the
  // nightly regen/resurrection vs. cron-archive flap is permanent. Both
  // metadata timestamps are parsed defensively: absent or malformed values
  // contribute nothing (they fall back to createdMs via the max()).
  const lastAliveMs = Math.max(
    createdMs,
    parseMetadataMs(metadata.last_refreshed_at),
    parseMetadataMs(metadata.redetected_at),
  );
  const staleDays = Math.max(0, (nowMs - lastAliveMs) / MS_PER_DAY);

  // --- Rule 3: hard archive at >90d stale if not matured and not addressed ---
  const isHardArchivable =
    staleDays > ARCHIVE_HARD_AGE_DAYS &&
    lifecycle !== 'matured' &&
    lifecycle !== 'addressed';
  if (isHardArchivable) {
    patch.lifecycle_state = 'archived';
    patch.archived_at = nowIso;
    patch.metadata = metadata;
    return patch;
  }

  // --- Rule 2: detected + 0 movements + stale>30d + no addressed_at -> archive
  const movementCount = typeof metadata.movement_count === 'number'
    ? (metadata.movement_count as number)
    : 0;
  const isSoftArchivable =
    lifecycle === 'detected' &&
    staleDays > ARCHIVE_DETECTED_AGE_DAYS &&
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
  // Recency is derived FROM age, not subtracted FROM the prior recency value.
  // Subtracting the age-based decay from the already-decayed prior value on
  // every cron run compounds decay daily and zeros out confidence within a
  // few extra days. Compute decay against a fixed baseline of 1.0 so the
  // value at a given age is stable regardless of how many times the cron ran.
  if (row.evidence && typeof row.evidence.window_days === 'number') {
    const overageDays = ageDays - row.evidence.window_days;
    if (overageDays > 0) {
      const priorRecency = row.evidence.confidence_factors?.recency ?? 1;
      const decay = (overageDays / 30) * RECENCY_DECAY_PER_30D;
      const newRecency = Math.max(0, 1 - decay);
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
