/**
 * Recompute golf_coachhelm_coach_weights from the stored outcome attributions,
 * using the CURRENT v3 attribution math. The logic lives in
 * src/lib/coachhelm/v3/causality/recompute-weights.ts.
 *
 *   DOTENV_CONFIG_PATH=.env.local node --import tsx/esm \
 *     --import ./scripts/coachhelm/server-only-hook.mjs -r dotenv/config \
 *     scripts/coachhelm/recompute-coach-weights.ts [--apply [--prune]]
 *
 * Default is a DRY RUN: it only SELECTs and prints old vs new weight per
 * (coach_id, insight_type). It prints ids only, never names or emails.
 *
 * --apply upserts the recomputed weights. --prune (only with --apply) also
 * deletes stored keys that no usable outcome supports. Both write to the
 * shared production database and are an owner decision.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { MIN_CALIBRATED_SAMPLES } from '../../src/lib/coachhelm/v3/ranking/score';
import { recomputeCoachWeights, type WeightDiff } from '../../src/lib/coachhelm/v3/causality/recompute-weights';
import { MIN_WINDOW_ROUNDS } from '../../src/lib/coachhelm/v3/causality/attribute';

function fmt(v: WeightDiff['old']): string {
  if (!v) return '—';
  const flag = v.sample_n >= MIN_CALIBRATED_SAMPLES ? '' : ' (uncalibrated → reads 1.0)';
  return `${v.weight.toFixed(4)} n=${v.sample_n}${flag}`;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const prune = process.argv.includes('--prune');
  if (prune && !apply) throw new Error('--prune requires --apply');
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const res = await recomputeCoachWeights(sb, { apply, prune });
  console.log(apply ? `MODE: APPLY${prune ? ' + PRUNE' : ''}` : 'MODE: DRY RUN (no writes)');
  console.log(
    `attributions used=${res.used} skipped: non-round-level=${res.skipped.method} ` +
      `missing-insight=${res.skipped.missing_insight} no-coach=${res.skipped.no_coach} ` +
      `no-player=${res.skipped.no_player} not-v3=${res.skipped.not_v3} ` +
      `null-lift(<${MIN_WINDOW_ROUNDS} rounds in a window)=${res.skipped.null_lift}`,
  );
  console.log(`MIN_CALIBRATED_SAMPLES=${MIN_CALIBRATED_SAMPLES}`);
  for (const d of res.diff) {
    const delta = d.old && d.next ? ` Δ${(d.next.weight - d.old.weight >= 0 ? '+' : '')}${(d.next.weight - d.old.weight).toFixed(4)}` : '';
    console.log(`${d.coach_id} ${d.insight_type}/${d.intent}: ${fmt(d.old)} → ${fmt(d.next)}${delta}`);
  }
  if (apply) console.log(`upserted=${res.weights.length} pruned=${res.pruned}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
