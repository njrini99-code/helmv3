/**
 * READ-ONLY preview of the v3 root-cause diagnosis (`engine/root-cause.ts`)
 * against real insight rows — what `generator-base.ts` would stamp on the
 * next generator run, without running a generator or writing anything.
 *
 *   node --import tsx/esm --import ./scripts/coachhelm/server-only-hook.mjs -r dotenv/config \
 *     scripts/coachhelm/preview-root-cause.ts [--limit 12] [--ids a,b,c]
 *
 * Reads golf_coach_insights (active v3 rows) and, per row, the player's A1
 * shot context for the row's own evidence window. Prints ids only (insight
 * id, metric) — never names or emails. Makes no writes: the client is only
 * ever used for .select().
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { loadPlayerContext } from '../../src/lib/coachhelm/v3/context/load-player-context';
import {
  diagnoseRootCause,
  resolveInsightFraming,
  scopeForEvidence,
  sequenceTargetFor,
  type RootCauseContext,
} from '../../src/lib/coachhelm/v3/engine/root-cause';
import type { InsightEvidence } from '../../src/lib/coachhelm/v2/insights/types';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main(): Promise<void> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const limit = Number(arg('limit') ?? 12);
  const ids = arg('ids')?.split(',').filter(Boolean) ?? null;
  let q = supabase
    .from('golf_coach_insights')
    .select('id, player_id, evidence')
    .eq('engine_version', 'v3')
    .eq('status', 'active')
    .in('lifecycle_state', ['tentative', 'detected', 'matured'])
    .order('updated_at', { ascending: false });
  q = ids ? q.in('id', ids) : q.limit(limit);
  const { data, error } = await q;
  if (error) throw error;

  const ctxCache = new Map<string, Promise<RootCauseContext>>();
  for (const row of data ?? []) {
    const evidence = row.evidence as InsightEvidence;
    const metric = evidence.metric;
    const framing = resolveInsightFraming(undefined, evidence);
    let ctx: RootCauseContext | null = null;
    if (framing === 'leak' && (sequenceTargetFor(metric) || metric === 'scoring_par_5')) {
      const { scope, label } = scopeForEvidence(row.player_id as string, evidence);
      const k = `${row.player_id}|${scope.window_start}|${scope.window_end}`;
      if (!ctxCache.has(k)) {
        ctxCache.set(
          k,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          loadPlayerContext(scope, { supabase: supabase as any }).then(({ shots, holes }) => ({
            facts: shots,
            holes,
            scope: { ...scope, window_start: null, window_end: null },
            windowLabel: label,
          })),
        );
      }
      ctx = await ctxCache.get(k)!;
    }
    const out = diagnoseRootCause({ metricId: metric, framing, evidence, ctx, observedEnabled: true });
    console.log(`\n# insight ${row.id} · ${metric} · value-framing=${framing}`);
    if (out.kind === 'none') {
      console.log(`  (no diagnosis — ${out.reason})`);
      continue;
    }
    console.log(`  causality_level: ${out.diagnosis.causality_level}`);
    console.log(`  root_cause: ${out.diagnosis.root_cause}`);
    console.log(`  action: ${out.diagnosis.recommended_action}`);
    console.log(`  basis: ${JSON.stringify(out.diagnosis.basis)}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
