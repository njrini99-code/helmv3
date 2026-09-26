/**
 * coachhelm-recheck-dry-run.ts — READ-ONLY report of what the recent-window
 * recheck (src/lib/coachhelm/v3/engine/recent-recheck.ts) would do to the
 * currently visible v3 insights, without writing anything.
 *
 * It uses the engine's OWN loaders and pure functions (loadRecentPutts,
 * loadCompletedHoles, puttBandRecheck, parScoringRecheck,
 * decideRecheckTransition, resolveInsightFraming) — not a SQL
 * reimplementation — so the numbers are what the next nightly generator run
 * would decide for the same data.
 *
 * Scope: the lifetime-window generators that opt in (putt_distance,
 * par_scoring). The 90-day generators recheck themselves on every re-run.
 * Visibility: the same predicates as applyInsightVisibility.
 *
 * Output: counts by category/insight_type and outcome, plus 3 examples per
 * outcome with ids truncated to 8 chars. No names, no player ids.
 *
 * Usage (the hook stubs `server-only` outside Next):
 *   node --import tsx/esm --import ./scripts/coachhelm/server-only-hook.mjs \
 *     scripts/coachhelm/recheck-dry-run.ts [--env .env.local]
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

const envArg = process.argv.indexOf('--env');
loadEnv({ path: resolve(process.cwd(), envArg > -1 ? process.argv[envArg + 1]! : '.env.local') });

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { resolveInsightFraming } from '@/lib/coachhelm/v3/engine/root-cause';
import {
  decideRecheckTransition,
  loadRecentHoles,
  loadRecentPutts,
  parScoringRecheck,
  puttBandRecheck,
  RECHECK_WINDOW_DAYS,
  type InsightRecheck,
  type PuttBand,
} from '@/lib/coachhelm/v3/engine/recent-recheck';
import type { InsightEvidence, InsightLifecycleState } from '@/lib/coachhelm/v2/insights/types';

// Mirrors the generators' own constants (putt-distance BUCKET_BAND_FEET +
// BUCKET_RECHECK_MIN_N, par-type minSampleN). Kept here so the script needs no
// generator instance.
const PUTT_BANDS: Record<string, PuttBand & { minN: number }> = {
  '3_5ft': { lo: 3, hi: 5, minN: 20 },
  '5_10ft': { lo: 5, hi: 10, minN: 20 },
  '10_15ft': { lo: 10, hi: 15, minN: 20 },
  '15_25ft': { lo: 15, hi: 25, minN: 20 },
  '25_plus_ft': { lo: 25, hi: null, minN: 40 },
};
const PAR_MIN_ROUNDS = 5;

interface Row {
  id: string;
  player_id: string;
  category: string | null;
  insight_type: string | null;
  signature: string;
  lifecycle_state: InsightLifecycleState | null;
  metadata: Record<string, unknown> | null;
  evidence: InsightEvidence | null;
}

async function main(): Promise<void> {
  const sb = createAdminClient();
  const { data, error } = await fetchAllRowsResult<Row>((from, to) =>
    applyInsightVisibility(
      sb
        .from('golf_coach_insights')
        .select('id, player_id, category, insight_type, signature, lifecycle_state, metadata, evidence'),
    )
      .in('insight_type', ['putt_distance', 'par_scoring'])
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
  );
  if (error) throw new Error(`insight select failed: ${error.message}`);
  const rows = data ?? [];

  const checkedAt = new Date().toISOString();

  type Outcome = 'retire' | 'restore' | 'holds' | 'inconclusive' | 'thin' | 'cleared_not_movable' | 'strength_skip' | 'unmapped';
  const counts = new Map<string, Map<Outcome, number>>();
  const examples = new Map<Outcome, string[]>();
  const bump = (key: string, o: Outcome, example: string) => {
    const m = counts.get(key) ?? new Map<Outcome, number>();
    m.set(o, (m.get(o) ?? 0) + 1);
    counts.set(key, m);
    const ex = examples.get(o) ?? [];
    if (ex.length < 3) ex.push(example);
    examples.set(o, ex);
  };

  for (const row of rows) {
    const ev = row.evidence;
    const key = `${row.category}/${row.insight_type}`;
    const id8 = row.id.slice(0, 8);
    if (!ev) continue;
    const isLeak = resolveInsightFraming(undefined, ev) === 'leak';
    if (!isLeak) {
      bump(key, 'strength_skip', `${id8} ${ev.metric} ${ev.your_value} vs ${ev.comparison_value}`);
      continue;
    }

    let recheck: InsightRecheck | null = null;
    if (row.insight_type === 'putt_distance') {
      const bucket = row.signature.replace(/^v3:putt_distance:/, '');
      const band = PUTT_BANDS[bucket];
      if (!band) { bump(key, 'unmapped', `${id8} ${row.signature}`); continue; }
      const putts = await loadRecentPutts(row.player_id);
      recheck = puttBandRecheck(putts, band, ev.comparison_value, band.minN, checkedAt);
    } else {
      const par = Number(row.signature.replace(/^v3:par_scoring:par/, ''));
      if (![3, 4, 5].includes(par)) { bump(key, 'unmapped', `${id8} ${row.signature}`); continue; }
      const holes = await loadRecentHoles(row.player_id);
      recheck = parScoringRecheck(holes, par, ev.comparison_value, PAR_MIN_ROUNDS, checkedAt);
    }

    const t = decideRecheckTransition({
      lifecycle: row.lifecycle_state,
      metadata: row.metadata,
      isLeak,
      recheck,
    });
    const outcome: Outcome =
      t !== 'none' ? t : recheck.status === 'cleared' ? 'cleared_not_movable' : recheck.status;
    bump(
      key,
      outcome,
      `${id8} ${ev.metric} lifetime=${ev.your_value} (n=${ev.sample_n}) recent=${recheck.recent_value} ` +
        `bound=${recheck.bound} (n=${recheck.sample_n}/${recheck.min_sample_n}) vs ${ev.comparison_value} [${row.lifecycle_state}]`,
    );
  }

  console.log(`Visible v3 lifetime-window insights scanned: ${rows.length} (window ${RECHECK_WINDOW_DAYS}d, read-only)`);
  for (const [key, m] of [...counts.entries()].sort()) {
    console.log(`  ${key}: ${[...m.entries()].map(([o, n]) => `${o}=${n}`).join(' ')}`);
  }
  for (const [o, ex] of examples) {
    console.log(`\nExamples — ${o}:`);
    for (const e of ex) console.log(`  ${e}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
