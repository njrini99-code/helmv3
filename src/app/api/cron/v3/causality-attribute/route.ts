/**
 * v3 outcome attribution cron — GET/POST /api/cron/v3/causality-attribute
 *
 * Picks up to LIMIT insights surfaced ≥21 days ago AND missing an
 * attribution row, computes baseline/post deltas, writes the row,
 * and updates the per-coach weight EMA. Idempotent — same insight
 * never gets attributed twice (PK on insight_id).
 *
 * Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { fromUntyped } from '@/lib/supabase/untyped';
import { computeAttribution, nextWeight } from '@/lib/coachhelm/v3/causality/attribute';
import { lookupMetricSource } from '@/lib/coachhelm/v3/causality/metric-sources';
import {
  V3_ENGINE_FILTER,
  VISIBLE_LIFECYCLE_STATES,
} from '@/lib/coachhelm/v3/insight-visibility';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const LIMIT = 50;
const MIN_AGE_DAYS = 21;
/**
 * Page size for the paginated candidate fetch. The eligible-candidate set is
 * dominated by rows that never produce an attribution row (intentional-null
 * metrics + already-attributed rows), so a fixed oldest-N window starves the
 * measurable backlog. We page through eligible candidates (created_at ASC)
 * until we've collected LIMIT attributable+unattributed rows or run out.
 */
const FETCH_PAGE_SIZE = 200;
/**
 * Hard cap on pages scanned per run so a pathological backlog (tens of
 * thousands of sticky never-attributable rows) can't run the cron past its
 * maxDuration. At 200/page this scans up to 10k candidates per run.
 */
const MAX_FETCH_PAGES = 50;

interface CronSummary {
  considered: number;
  attributed: number;
  /** Window had no rows pre/post — retry tomorrow once another round lands. */
  no_data: number;
  /**
   * Metric is intentionally not attributed (diagnostic-only, needs
   * shot-level data, or a between-cohort comparison). These will never
   * produce a lift; do NOT retry.
   */
  intentional_no_lift: number;
  /**
   * Insight surface tagged us with a metric we've never heard of. This
   * is a coverage gap — the metric should either be added to the
   * registry or aliased. Logged structured for observability.
   */
  unknown_metric: number;
  /**
   * Insight is missing `evidence.metric` / `player_id` / `created_at` —
   * insight surface bug.
   */
  malformed: number;
  errors: number;
  duration_ms: number;
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return handle();
}
export async function POST(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return handle();
}

async function handle(): Promise<NextResponse> {
  const startedAt = Date.now();
  const sb = createAdminClient();
  const summary: CronSummary = {
    considered: 0,
    attributed: 0,
    no_data: 0,
    intentional_no_lift: 0,
    unknown_metric: 0,
    malformed: 0,
    errors: 0,
    duration_ms: 0,
  };

  const cutoffIso = new Date(Date.now() - MIN_AGE_DAYS * 86400_000).toISOString();

  // Insights surfaced ≥21d ago. We use created_at as surfaced_at
  // proxy (insight surfacing in v3 happens at write time).
  //
  // Eligibility mirrors the delivery read paths EXACTLY (to-95 audit P1):
  // the learning loop must never write attribution rows or move coach
  // weights from rows the product has decided not to surface — stale v2
  // rows, archived/tentative lifecycle states, or coach-dismissed insights.
  // The candidate set is dominated by never-attributable rows: intentional-null
  // metrics never get an attribution row written, and already-attributed rows
  // are deduped by absence-of-attribution-row. A fixed oldest-N window therefore
  // clogs with sticky rows and starves measurable insights forever (P1). We
  // PAGINATE through eligible candidates (created_at ASC), and on each page:
  //   1) anti-join the attribution table to drop already-attributed rows, and
  //   2) SYNCHRONOUSLY drop intentional-null metrics (lookupMetricSource is sync),
  //      counting them in summary.intentional_no_lift via a cheap pass,
  // accumulating only attributable+unattributed rows into `todo` until we have
  // LIMIT of them or candidates are exhausted.
  type Candidate = {
    id: string;
    player_id: string | null;
    coach_id: string | null;
    insight_type: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    evidence: any;
    created_at: string | null;
  };
  const todo: Candidate[] = [];
  let page = 0;
  for (; page < MAX_FETCH_PAGES && todo.length < LIMIT; page += 1) {
    const from = page * FETCH_PAGE_SIZE;
    const to = from + FETCH_PAGE_SIZE - 1;
    const { data: candidates, error: fetchErr } = await sb
      .from('golf_coach_insights')
      .select('id, player_id, coach_id, insight_type, evidence, created_at')
      .lte('created_at', cutoffIso)
      .not('player_id', 'is', null)
      .or(V3_ENGINE_FILTER)
      .in('lifecycle_state', [...VISIBLE_LIFECYCLE_STATES])
      .neq('status', 'dismissed')
      .order('created_at', { ascending: true })
      .range(from, to);

    // P3: surface the fetch error instead of returning a success-shaped empty
    // summary on infra failure — a persistent failure would silently stall the
    // whole learning loop with no Sentry signal, indistinguishable from a
    // legitimately empty backlog.
    if (fetchErr) {
      await logServerError(
        `causality candidate fetch (page ${page}): ${fetchErr.message}`,
        { action: 'cron.v3.causality.fetch' },
      );
      summary.errors += 1;
      summary.duration_ms = Date.now() - startedAt;
      return NextResponse.json(summary, { status: 500 });
    }

    const candidatePage = (candidates ?? []) as Candidate[];
    if (candidatePage.length === 0) break; // candidates exhausted

    // Anti-join the attribution table for THIS page to drop already-attributed
    // rows. Batched per page so we never load the whole table.
    const pageIds = candidatePage.map((c) => c.id);
    const { data: existing } = await sb
      .from('golf_insight_outcome_attribution')
      .select('insight_id')
      .in('insight_id', pageIds);
    const attributedSet = new Set((existing ?? []).map((r) => r.insight_id));

    for (const c of candidatePage) {
      if (todo.length >= LIMIT) break;
      if (attributedSet.has(c.id)) continue;
      // SYNCHRONOUS intentional-null pre-filter (cheap pass). These never get an
      // attribution row written, so leaving them in the work list would clog
      // every slot with permanently-skipped rows. Count them here exactly as the
      // loop would have, then drop them from the work list.
      const metric = (c.evidence as { metric?: string } | null)?.metric;
      if (metric) {
        const source = lookupMetricSource(metric);
        if (source && source.kind === 'intentional-null') {
          summary.intentional_no_lift += 1;
          continue;
        }
      }
      todo.push(c);
    }

    // Short page => candidates exhausted (last page).
    if (candidatePage.length < FETCH_PAGE_SIZE) break;
  }

  summary.considered = todo.length;

  if (todo.length === 0) {
    summary.duration_ms = Date.now() - startedAt;
    return NextResponse.json(summary);
  }

  // Per-run roll-up of unknown metrics. Per-insight Sentry events were
  // re-firing on the same registry gaps every cron run (one Sentry issue
  // with 50 events/24h). We now console.warn per insight for traceability
  // and emit a single end-of-run summary event at info severity.
  const unknownMetricSamples: Array<{ insight_id: string; metric: string }> = [];

  for (const c of todo) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const metric = (c.evidence as any)?.metric as string | undefined;
      if (!metric || !c.player_id || !c.created_at) {
        summary.malformed += 1;
        continue;
      }
      const result = await computeAttribution(sb, {
        insight_id: c.id,
        player_id: c.player_id,
        surfaced_at: c.created_at,
        target_metric_id: metric,
      });
      if (!result.ok) {
        if (result.reason === 'intentional-null') {
          summary.intentional_no_lift += 1;
        } else if (result.reason === 'unknown-metric') {
          summary.unknown_metric += 1;
          console.warn(
            `[cron.v3.causality] unknown metric '${metric}' on insight ${c.id}`,
          );
          if (unknownMetricSamples.length < 10) {
            unknownMetricSamples.push({ insight_id: c.id, metric });
          }
        } else {
          summary.no_data += 1;
        }
        continue;
      }
      const row = result.row;
      const { error: insErr } = await sb
        .from('golf_insight_outcome_attribution')
        .insert({
          insight_id: row.insight_id,
          surfaced_at: row.surfaced_at,
          target_metric_id: row.target_metric_id,
          baseline_value: row.baseline_value,
          post_value: row.post_value,
          delta: row.delta,
          n_rounds_before: row.n_rounds_before,
          n_rounds_after: row.n_rounds_after,
          lift: row.lift,
        });
      if (insErr) {
        // Postgres 23503 = foreign_key_violation. As of migration
        // 20260608150000 the target_metric_id -> golf_metrics FK is DROPPED, so
        // the only live FK on insert is insight_id -> golf_coach_insights (a
        // concurrently-deleted candidate). We KEEP the target_metric_id branch
        // below defensively — if a future migration re-adds the metric FK we
        // still degrade to the info-severity unknown-metric bucket rather than
        // erroring — but it should be unreachable on the current schema.
        const fkText = `${insErr.details ?? ''} ${insErr.message ?? ''}`;
        if (insErr.code === '23503' && fkText.includes('target_metric_id')) {
          summary.unknown_metric += 1;
          console.warn(
            `[cron.v3.causality] target_metric_id '${metric}' missing from golf_metrics registry (insight ${c.id})`,
          );
          if (unknownMetricSamples.length < 10) {
            unknownMetricSamples.push({ insight_id: c.id, metric });
          }
          continue;
        }
        await logServerError(`causality insert ${c.id}: ${insErr.message}`, {
          action: 'cron.v3.causality.insert',
        });
        summary.errors += 1;
        continue;
      }
      // Update coach weight EMA for (coach, insight_type, intent='general').
      // Skip entirely when lift is null: nextWeight no-ops on null (returns
      // prev unchanged), so the upsert would only re-write the unchanged base
      // {weight:1.0, sample_n:0} row — repopulating the freshly-wiped weights
      // table with zero-evidence baseline rows that LOOK like learned state,
      // and touching updated_at on real rows without any weight movement.
      if (c.coach_id && row.lift !== null) {
        const weightErr = await updateCoachWeight(sb, {
          coach_id: c.coach_id,
          insight_type: c.insight_type,
          lift: row.lift,
        });
        if (weightErr) {
          await logServerError(
            `causality coach-weight upsert ${c.coach_id}/${c.insight_type}: ${weightErr.message}`,
            { action: 'cron.v3.causality.coach-weight' },
          );
          summary.errors += 1;
        }
      }
      summary.attributed += 1;
    } catch (err) {
      await logServerError(
        `causality compute ${c.id}: ${err instanceof Error ? err.message : String(err)}`,
        { action: 'cron.v3.causality.compute' },
      );
      summary.errors += 1;
    }
  }

  // One end-of-run roll-up for registry drift, surfaced at info severity so
  // it stops drowning real bugs but stays visible in admin_events.
  if (summary.unknown_metric > 0) {
    const distinctMetrics = Array.from(
      new Set(unknownMetricSamples.map((s) => s.metric)),
    );
    await logServerEvent(
      `causality cron skipped ${summary.unknown_metric} insight(s) with unknown metric`,
      {
        action: 'cron.v3.causality.unknown-metric-summary',
        featureArea: 'coachhelm.causality',
        metadata: {
          unknown_metric_count: summary.unknown_metric,
          distinct_metrics: distinctMetrics,
          sample_insights: unknownMetricSamples,
        },
      },
      'info',
    );
  }

  summary.duration_ms = Date.now() - startedAt;
  return NextResponse.json(summary);
}

async function updateCoachWeight(
  sb: ReturnType<typeof createAdminClient>,
  args: { coach_id: string; insight_type: string; lift: number | null },
): Promise<{ message: string } | null> {
  const intent = 'general';
  const { data: prev } = await sb
    .from('golf_coachhelm_coach_weights')
    .select('weight, sample_n')
    .eq('coach_id', args.coach_id)
    .eq('insight_type', args.insight_type)
    .eq('intent', intent)
    .maybeSingle();
  const base = prev
    ? { weight: Number(prev.weight), sample_n: prev.sample_n }
    : { weight: 1.0, sample_n: 0 };
  const next = nextWeight(base, args.lift);
  // fromUntyped to upsert composite-PK rows cleanly even when the
  // generated types haven't fully propagated the new table yet.
  //
  // The upsert error is returned (not swallowed): a grant/constraint failure
  // — the exact class behind the prior "upsert needs UPDATE grant" incident on
  // round_reviews/coach_insights — would otherwise leave attribution rows
  // written but weights frozen at 1.0 forever while summary.attributed keeps
  // climbing, i.e. the loop looks healthy while half of it is dead.
  const { error } = await fromUntyped(sb, 'golf_coachhelm_coach_weights').upsert(
    {
      coach_id: args.coach_id,
      insight_type: args.insight_type,
      intent,
      weight: next.weight,
      sample_n: next.sample_n,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'coach_id,insight_type,intent' },
  );
  return error ? { message: error.message } : null;
}
