/**
 * Nightly CoachHelm insight lifecycle progression cron (Foundation F3).
 *
 * Walks every non-terminal insight and applies the four rules from the
 * design contract at docs/superpowers/plans/2026-04-22-insight-quality/
 * 00-design-contract.md:
 *
 *   1. addressed → resolved when `evidence.your_value` is in the healthy band
 *      for 2 consecutive evaluation cycles. "Healthy" is DIRECTION-AWARE
 *      (2026-09-22): the player is at least as good as `comparison_value` per
 *      the metric's polarity (`isNegativePolarityMetric` — the same table
 *      `tone-derivation.ts` uses for insight-card tone, not a second one), OR
 *      within 20% of it. An absolute symmetric gap used to call a player who
 *      had overshot the target — e.g. a lower-is-better metric now BELOW the
 *      comparison by more than 20% — unhealthy for having improved too much;
 *      only the ADVERSE direction is gated by the 20% closeness check.
 *      Consecutive-cycle tracking lives on `metadata.healthy_cycles_count`:
 *      incremented when checked AND in the healthy band, reset to 0 when
 *      out of band. Upon resolution we set `resolved_at`.
 *      A cycle is counted once per DISTINCT evidence snapshot
 *      (`metadata.healthy_cycle_evidence_key`): the engine re-emits the same
 *      numbers nightly when a player hasn't played, and two scans over one
 *      observation are one observation, not two confirmations (2026-09-12).
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
 *      (may be absent or malformed).
 *
 *   4. Recompute `evidence.confidence_factors.recency` from how long ago the
 *      evidence was last computed vs. window_days: if (stale - window_days)
 *      > 0, drop recency by 0.2 per 30 days of overage. Re-derive confidence.
 *      If confidence falls below 0.4 AND the insight is still in `detected`,
 *      demote to `tentative`.
 *      ANCHOR (2026-09-12): the SAME liveness anchor as Rules 2 & 3. Until
 *      then Rule 4 used `created_at`, i.e. the row's birth date — but a row
 *      the engine refreshed last night carries last night's 90-day window, so
 *      its data is fresh however old the row is. Decaying it contradicted the
 *      engine (which re-stamps recency=1.0 on every refresh) and, under the
 *      pre-`honest_v2` formula, RAISED confidence. Data recency == time since
 *      the evidence was last recomputed. This cron never promotes: only a
 *      write carrying freshly recomputed evidence may (see
 *      v2/insights/lifecycle-policy.ts).
 *
 * Schedule: `0 4 * * *` (see vercel.json).
 * Auth:     Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { calcConfidence, CONFIDENCE_METHOD_VERSION, type InsightEvidence, type InsightLifecycleState } from '@/lib/coachhelm/v2/insights/types';
import { rollupInsightEffectivenessForYesterday } from '@/lib/coachhelm/v2/analytics/effectiveness-writer';
import { rollupPredictionPerformanceRolling30d } from '@/lib/coachhelm/v2/analytics/prediction-performance-writer';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';
import { describeError } from '@/lib/utils/describe-error';
import { isNegativePolarityMetric } from '@/components/golf/coachhelm/insight-card/tone-derivation';

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

  return recordJobRun('coachhelm-insight-lifecycle', () => handleLifecycle(req));
}

async function handleLifecycle(req: NextRequest): Promise<NextResponse> {
  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();
  const now = Date.now();
  const staleBeforeIso = new Date(now - STALE_EVALUATION_MS).toISOString();
  let cursor = parseCursor(req.nextUrl.searchParams.get('cursor'));

  type EvaluatedRow = { id: string; patch: UpdatePatch; observedLifecycleState: InsightLifecycleState | null };
  let scannedCount = 0;
  let nextCursor: string | null = null;
  let reachedRunLimit = false;
  let resolvedCount = 0;
  let archivedCount = 0;
  let recencyAdjustedCount = 0;
  let demotedCount = 0;
  let healthyCyclesUpdatedCount = 0;
  let failed = 0;
  let lostCasRaceCount = 0;

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
        evaluated.push({ id: row.id, patch, observedLifecycleState: row.lifecycle_state });
      } catch (err) {
        await logServerError(
          `cron.insight_lifecycle.evaluate failed: ${describeError(err)}`,
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
    //
    // Optimistic compare-and-set (2026-09-22 R1/R2 leftover): each patch was
    // decided from `lifecycle_state` as read by the SELECT above. Between
    // that read and this write, a coach action (dismiss/acknowledge/archive/
    // resolve) or a concurrent engine write (upsertInsight, a generator's
    // stale-scope sweep) can have moved the row. Guard every update on the
    // observed `lifecycle_state` — same pattern as `generator-base.ts`'s and
    // `synthesis.ts`'s archive sweeps — and only count success metrics
    // (resolved/archived/demoted/etc.) for rows the CAS actually matched.
    // Success is decided from the actual write outcome, not the intended
    // patch, so these counts reflect what happened, not what was attempted.
    for (let i = 0; i < evaluated.length; i += UPDATE_CONCURRENCY) {
      const chunk = evaluated.slice(i, i + UPDATE_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(({ id, patch, observedLifecycleState }) => {
          let q = supabase
            .from('golf_coach_insights')
            .update(patch as unknown as Record<string, never>)
            .eq('id', id);
          q = observedLifecycleState === null
            ? q.is('lifecycle_state', null)
            : q.eq('lifecycle_state', observedLifecycleState);
          return q.select('id');
        }),
      );
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const updateError = result?.error;
        const { patch, id } = chunk[j] ?? { patch: undefined, id: undefined };
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
          continue;
        }
        if (!result?.data || result.data.length === 0) {
          // Lost the CAS race: lifecycle_state no longer matched what we
          // read, so this write did NOT apply. Do not clobber whatever won —
          // log and move on; the row will be re-scanned on a future run once
          // it goes stale again.
          lostCasRaceCount++;
          await logServerError(
            `cron.insight_lifecycle.update: lost lifecycle CAS race for insight=${id} ` +
              `(observed lifecycle_state=${chunk[j]?.observedLifecycleState ?? 'null'}); skipping to avoid ` +
              `clobbering a concurrent lifecycle change`,
            {
              action: 'cron.coachhelm.insight_lifecycle.cas',
              featureArea: 'coachhelm',
              extra: { insightId: id },
            },
            'warning',
          );
          continue;
        }
        if (patch?.lifecycle_state === 'resolved') resolvedCount++;
        if (patch?.lifecycle_state === 'archived') archivedCount++;
        if (patch?.lifecycle_state === 'tentative') demotedCount++;
        if (patch?.evidence) recencyAdjustedCount++;
        if (patch?.metadata && !patch?.lifecycle_state && !patch?.evidence) {
          healthyCyclesUpdatedCount++;
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
      `cron.insight_lifecycle.effectiveness_rollup failed: ${describeError(err)}`,
      { action: 'cron.coachhelm.insight_lifecycle.effectiveness_rollup', featureArea: 'coachhelm' },
      'error',
    );
  }
  try {
    predictionResult = await rollupPredictionPerformanceRolling30d(supabase);
  } catch (err) {
    await logServerError(
      `cron.insight_lifecycle.prediction_rollup failed: ${describeError(err)}`,
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
    lost_cas_race: lostCasRaceCount,
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
 * Stable key for "the same evidence snapshot". Two nightly scans over
 * identical numbers share a key; a new round changes sample_n or the value.
 */
function healthyCycleEvidenceKey(evidence: InsightEvidence): string {
  return `${evidence.sample_n}|${evidence.your_value}|${evidence.comparison_value}`;
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
    // STAMP THE PROVENANCE. Both sibling sweeps already do — synthesis.ts
    // writes 'composite-scope-sweep' and generator-base.ts writes
    // 'generator-scope-sweep' — so an archived row that carries NEITHER was
    // unattributable, and this cron is the only writer that produced them.
    // That gap cost a real investigation: bulk events of 38 rows (2026-07-23)
    // and 33 rows (2026-08-10) had no recorded cause, and ruling out "insights
    // are silently vanishing" required reading three other writers first.
    // A coach asking "where did that insight go?" now has an answer.
    patch.metadata = {
      ...metadata,
      archived_by: 'insight-lifecycle-cron',
      archive_reason: `rule3:hard-stale>${ARCHIVE_HARD_AGE_DAYS}d`,
      archived_stale_days: Math.round(staleDays),
    };
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
    // Distinct reason from Rule 3 so the two are separable in one query. They
    // mean different things: rule3 retires anything long-dead, rule2 retires an
    // insight the engine stopped re-emitting and no coach ever engaged with.
    //
    // Rule 2 is only SAFE because a re-emit of an unchanged insight still bumps
    // `updated_at` — v2/insights/upsert.ts:240 and :311 write it
    // unconditionally, with no change-detection guard. If a no-op re-emit were
    // ever skipped, this branch would silently retire still-true insights after
    // 30 quiet days. Anyone adding write-skipping to that upsert must revisit
    // this rule first.
    patch.metadata = {
      ...metadata,
      archived_by: 'insight-lifecycle-cron',
      archive_reason: `rule2:detected-no-movement>${ARCHIVE_DETECTED_AGE_DAYS}d`,
      archived_stale_days: Math.round(staleDays),
    };
    return patch;
  }

  // --- Rule 1: addressed -> resolved when in healthy band for 2 cycles -------
  if (lifecycle === 'addressed' && row.evidence) {
    const { your_value, comparison_value } = row.evidence;
    const gap = comparison_value === 0
      ? (your_value === 0 ? 0 : Infinity)
      : Math.abs(your_value - comparison_value) / Math.abs(comparison_value);

    // Direction-aware (2026-09-22): "more than the comparison" is good for a
    // higher-is-better metric and bad for a lower-is-better one — a symmetric
    // |gap| <= 20% treated a player who had overshot the target as
    // unresolved just as readily as one who was still falling short. Once
    // the player is AT LEAST as good as the comparison, resolution is never
    // blocked by how large the gap is; the 20% closeness bar only gates the
    // adverse direction (still behind, but close enough to call it healthy).
    const lowerIsBetter = isNegativePolarityMetric(row.evidence.metric, row.evidence);
    const meetsOrBeatsComparison = lowerIsBetter
      ? your_value <= comparison_value
      : your_value >= comparison_value;
    const isHealthy = meetsOrBeatsComparison || gap <= HEALTHY_GAP_THRESHOLD;

    const priorCycles = typeof metadata.healthy_cycles_count === 'number'
      ? (metadata.healthy_cycles_count as number)
      : 0;
    // One cycle per distinct evidence snapshot. The nightly regen re-emits
    // identical numbers when no new round arrived; counting each scan as a
    // fresh confirmation resolved insights on zero new evidence.
    const evidenceKey = healthyCycleEvidenceKey(row.evidence);
    const alreadyCounted = metadata.healthy_cycle_evidence_key === evidenceKey;

    if (isHealthy) {
      if (!alreadyCounted) {
        const nextCycles = priorCycles + 1;
        metadata.healthy_cycles_count = nextCycles;
        metadata.healthy_cycle_evidence_key = evidenceKey;
        changed = true;
        if (nextCycles >= HEALTHY_CYCLES_TO_RESOLVE) {
          patch.lifecycle_state = 'resolved';
          patch.resolved_at = nowIso;
          patch.metadata = metadata;
          return patch;
        }
      }
    } else if (priorCycles > 0) {
      metadata.healthy_cycles_count = 0;
      delete metadata.healthy_cycle_evidence_key;
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
    // Anchor on the last recompute (liveness), not created_at — see header.
    const overageDays = staleDays - row.evidence.window_days;
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
            method_version: CONFIDENCE_METHOD_VERSION,
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
