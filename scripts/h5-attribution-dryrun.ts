/**
 * H5 causality-gate MANUAL DRY RUN (2026-06-09).
 *
 * Runs the EXACT deployed attribution pipeline (computeAttribution + the
 * magnitude-aware nextWeight EMA) against production data with ONE change:
 * the cron's 21-day `created_at` age cutoff is removed, so the rows that
 * become organically eligible from ~2026-06-16 are attributed NOW.
 *
 * READ-ONLY by construction: computeAttribution only SELECTs; the INSERT
 * into golf_insight_outcome_attribution and the coach-weight upsert live in
 * the cron route and are NOT invoked here. The production zero baseline
 * stays intact for the organic run.
 *
 * Candidate eligibility is otherwise IDENTICAL to the deployed cron:
 * v3-visible (engine filter + lifecycle + status) with a player_id.
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/h5-attribution-dryrun.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { computeAttribution, nextWeight } from '../src/lib/coachhelm/v3/causality/attribute';
import {
  V3_ENGINE_FILTER,
  VISIBLE_LIFECYCLE_STATES,
} from '../src/lib/coachhelm/v3/insight-visibility';

function admin() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('Missing SUPABASE env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  const sb = admin();

  const { data: candidates, error } = await sb
    .from('golf_coach_insights')
    .select('id, player_id, coach_id, insight_type, evidence, created_at')
    .not('player_id', 'is', null)
    .or(V3_ENGINE_FILTER)
    .in('lifecycle_state', [...VISIBLE_LIFECYCLE_STATES])
    .neq('status', 'dismissed')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  console.log(`[h5-dryrun] ${candidates?.length ?? 0} visible v3 candidates (age gate REMOVED)`);

  const tally = { attributed: 0, no_data: 0, intentional_no_lift: 0, unknown_metric: 0, malformed: 0 };
  const lifts: Array<{ insight_id: string; coach_id: string | null; insight_type: string; metric: string; lift: number | null; before: number; after: number; created: string }> = [];
  const unknownMetrics = new Set<string>();
  const noDataReasons: Record<string, number> = {};

  for (const c of candidates ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metric = (c.evidence as any)?.metric as string | undefined;
    if (!metric || !c.player_id || !c.created_at) {
      tally.malformed += 1;
      continue;
    }
    const result = await computeAttribution(sb, {
      insight_id: c.id,
      player_id: c.player_id,
      surfaced_at: c.created_at,
      target_metric_id: metric,
    });
    if (!result.ok) {
      if (result.reason === 'intentional-null') tally.intentional_no_lift += 1;
      else if (result.reason === 'unknown-metric') {
        tally.unknown_metric += 1;
        unknownMetrics.add(metric);
      } else {
        tally.no_data += 1;
        noDataReasons[metric] = (noDataReasons[metric] ?? 0) + 1;
      }
      continue;
    }
    tally.attributed += 1;
    lifts.push({
      insight_id: c.id,
      coach_id: c.coach_id,
      insight_type: c.insight_type,
      metric,
      lift: result.row.lift,
      before: result.row.n_rounds_before,
      after: result.row.n_rounds_after,
      created: String(c.created_at).slice(0, 10),
    });
  }

  console.log('\n=== Summary (same buckets as the cron) ===');
  console.log(JSON.stringify(tally, null, 2));
  if (unknownMetrics.size) console.log('unknown metrics:', [...unknownMetrics].join(', '));
  console.log('no-data by metric:', JSON.stringify(noDataReasons));

  console.log('\n=== Attributions (would-be rows) ===');
  for (const l of lifts) {
    console.log(
      `  ${l.created} ${l.metric.padEnd(28)} lift=${l.lift === null ? 'null' : l.lift.toFixed(4).padStart(9)} rounds ${l.before}/${l.after} type=${l.insight_type}`,
    );
  }

  // Simulate the coach-weight EMA exactly as the cron would apply it,
  // in created_at order per (coach, insight_type, 'general').
  const weights = new Map<string, { weight: number; sample_n: number }>();
  for (const l of lifts) {
    if (!l.coach_id || l.lift === null) continue;
    const key = `${l.coach_id}|${l.insight_type}`;
    const prev = weights.get(key) ?? { weight: 1.0, sample_n: 0 };
    weights.set(key, nextWeight(prev, l.lift));
  }

  console.log('\n=== Simulated coach weights (magnitude-aware EMA) ===');
  let pinnedBinary = 0;
  let outOfClamp = 0;
  for (const [key, w] of weights) {
    const flagPinned = w.weight === 1.5 || w.weight === 0.5;
    const flagClamp = w.weight < 0.25 || w.weight > 2.0;
    if (flagPinned) pinnedBinary += 1;
    if (flagClamp) outOfClamp += 1;
    console.log(`  ${key.padEnd(60)} weight=${w.weight.toFixed(4)} n=${w.sample_n}${flagPinned ? '  [EXACT-BINARY!]' : ''}${flagClamp ? '  [OUT-OF-CLAMP!]' : ''}`);
  }

  console.log('\n=== H5 gate checks ===');
  console.log(`  (a) >=1 insight attributed:        ${tally.attributed >= 1 ? 'PASS' : 'FAIL'} (${tally.attributed})`);
  console.log(`  (b) attribution rows computable:   ${lifts.length >= 1 ? 'PASS' : 'FAIL'}`);
  console.log(`  (c) coach weights would populate:  ${weights.size >= 1 ? 'PASS' : 'FAIL'} (${weights.size} keys)`);
  console.log(`  (d) >=1 weight moves off 1.0:      ${[...weights.values()].some((w) => Math.abs(w.weight - 1.0) > 1e-9) ? 'PASS' : 'FAIL'}`);
  console.log(`  (e) no weight pinned at 1.5/0.5:   ${pinnedBinary === 0 ? 'PASS' : `FAIL (${pinnedBinary})`}`);
  console.log(`  (f) all weights within [0.25,2.0]: ${outOfClamp === 0 ? 'PASS' : `FAIL (${outOfClamp})`}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('[h5-dryrun] FAILED:', err);
  process.exit(1);
});
