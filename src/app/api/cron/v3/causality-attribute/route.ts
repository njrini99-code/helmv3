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
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { fromUntyped } from '@/lib/supabase/untyped';
import { computeAttribution, nextWeight } from '@/lib/coachhelm/v3/causality/attribute';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const LIMIT = 50;
const MIN_AGE_DAYS = 21;

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
  const { data: candidates } = await sb
    .from('golf_coach_insights')
    .select('id, player_id, coach_id, insight_type, evidence, created_at')
    .lte('created_at', cutoffIso)
    .not('player_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(LIMIT * 3); // over-fetch — many will already be attributed

  if (!candidates || candidates.length === 0) {
    summary.duration_ms = Date.now() - startedAt;
    return NextResponse.json(summary);
  }

  // Filter out already-attributed ones in one batch query.
  const ids = candidates.map((c) => c.id);
  const { data: existing } = await sb
    .from('golf_insight_outcome_attribution')
    .select('insight_id')
    .in('insight_id', ids);
  const attributedSet = new Set((existing ?? []).map((r) => r.insight_id));

  const todo = candidates
    .filter((c) => !attributedSet.has(c.id))
    .slice(0, LIMIT);
  summary.considered = todo.length;

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
          // Structured log so we can spot insight surface ↔ metric registry drift.
          await logServerError(
            `causality unknown metric '${metric}' on insight ${c.id}`,
            { action: 'cron.v3.causality.unknown-metric' },
            'warning',
          );
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
        await logServerError(`causality insert ${c.id}: ${insErr.message}`, {
          action: 'cron.v3.causality.insert',
        });
        summary.errors += 1;
        continue;
      }
      // Update coach weight EMA for (coach, insight_type, intent='general')
      if (c.coach_id) {
        await updateCoachWeight(sb, {
          coach_id: c.coach_id,
          insight_type: c.insight_type,
          lift: row.lift,
        });
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

  summary.duration_ms = Date.now() - startedAt;
  return NextResponse.json(summary);
}

async function updateCoachWeight(
  sb: ReturnType<typeof createAdminClient>,
  args: { coach_id: string; insight_type: string; lift: number | null },
): Promise<void> {
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
  await fromUntyped(sb, 'golf_coachhelm_coach_weights').upsert(
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
}
