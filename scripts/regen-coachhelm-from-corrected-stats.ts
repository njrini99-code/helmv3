/**
 * Regenerate ALL CoachHelm artifacts from the corrected stats (2026-06-06).
 *
 * Context: the SG recalibration + denominator/putt-band/scoring corrections
 * landed in the DB cache + shot pipeline, but the stored CoachHelm artifacts
 * (insights / patterns / predictions) were generated from the OLD stats.
 * This script re-runs the production engine so every artifact reflects the
 * corrected numbers.
 *
 * What analyzePlayer(...) self-persists (verified):
 *   - v3 tier-1 insights  → upsertInsightV3 (UPDATE-in-place by signature;
 *                            preserves coach status/acknowledged/dismissed,
 *                            refreshes evidence/content/priority)
 *   - v2.worstHoles        → upsertInsight (same in-place refresh)
 *   - composite synthesis  → self-persists v3 composite insights
 *   - round-level patterns → PatternMiner.savePatterns (upsert by deterministic id)
 *   - shot-level patterns  → ShotPatternMiner.savePatterns (insert)
 *   - current prediction   → PerformancePredictor upsert on (player,metric,due_date)
 *
 * NOTE: the legacy caller-persisted v2 insights (from analysis.insights) are
 * NOT written here — those are the dedup-skipped stale rows the SQL cleanup
 * deletes; their stat-carrying types are all covered by the v3 generators.
 *
 * IDEMPOTENT: each player's machine-generated patterns are deleted (clean slate)
 * by cleanMachinePatterns() BEFORE analyzePlayer re-mines, so re-running is safe.
 * This matters because:
 *   - shot-level patterns use crypto.randomUUID() ids → upsert is an APPEND every
 *     run (would double on re-run without the pre-delete)
 *   - round-level pattern ids embed the outcome → corrected outcome = new id,
 *     leaving the old-outcome row orphaned & active
 * Coach-validated/actioned patterns are preserved by the delete filter.
 * Zero patterns are coach-validated/actioned (verified), so a full delete is safe.
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.vercel/.env.production.local \
 *     npx tsx -r dotenv/config scripts/regen-coachhelm-from-corrected-stats.ts [--probe] [playerId]
 *
 *   --probe        import-only smoke test (no analysis), prints typeof singleton
 *   playerId       regenerate a single player instead of the whole roster
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { coachHelmIntelligence } from '../src/lib/coachhelm/v2/orchestrator';

const BATCH_SIZE = 3; // matches generateTeamInsights — avoids connection-pool exhaustion

function admin() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('Missing SUPABASE env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getActivePlayers(): Promise<Array<{ id: string; name: string }>> {
  const supabase = admin();
  // Players with at least one completed round are the only ones the engine
  // can produce meaningful artifacts for.
  const { data, error } = await supabase
    .from('golf_rounds')
    .select('player_id, golf_players!inner(first_name, last_name)')
    .eq('status', 'completed');
  if (error) throw error;
  type Joined = { first_name?: string; last_name?: string };
  const seen = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ player_id: string; golf_players: Joined | Joined[] | null }>) {
    if (!seen.has(row.player_id)) {
      // Supabase types a to-one embed as an array in some versions; normalize.
      const gp = Array.isArray(row.golf_players) ? row.golf_players[0] : row.golf_players;
      seen.set(row.player_id, `${gp?.first_name ?? ''} ${gp?.last_name ?? ''}`.trim());
    }
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}

/**
 * IDEMPOTENCY GUARD. analyzePlayer re-mines patterns; round-level patterns
 * upsert by a deterministic id (safe to re-run) but SHOT-level patterns
 * (shot-pattern-miner.ts) use crypto.randomUUID() ids → upsert(onConflict:'id')
 * is effectively an INSERT, so re-running APPENDS/doubles them. To keep this
 * script safely re-runnable we delete the player's machine-generated patterns
 * first (clean slate), preserving anything a coach has validated or actioned.
 * Zero patterns are coach-owned today, but the guard is defensive.
 */
async function cleanMachinePatterns(id: string): Promise<void> {
  const supabase = admin();
  const { error } = await supabase
    .from('golf_patterns_v2')
    .delete()
    .eq('player_id', id)
    .eq('validated_by_coach', false)
    .not('lifecycle_state', 'in', '("addressed","resolved","dismissed")');
  if (error) throw new Error(`cleanMachinePatterns failed for ${id}: ${error.message}`);
}

async function regenPlayer(id: string): Promise<{ ok: boolean; detail: string }> {
  try {
    await cleanMachinePatterns(id); // makes re-runs idempotent (see note above)
    const analysis = await coachHelmIntelligence.analyzePlayer(id, {
      includePatterns: true,
      includeCausal: true,
      includePredictions: true,
      includeShotPatterns: true,
      includeLieAnalysis: true,
      depth: 'deep',
    });
    if (!analysis) return { ok: false, detail: 'analyzePlayer returned null (no features)' };
    const gs = analysis.generatorSummary;
    const fails = gs?.failures?.length ?? 0;
    return {
      ok: true,
      detail: `insights=${analysis.insights.length} patterns=${analysis.patterns.length} preds=${analysis.predictions.length} gen_ok=${gs?.successes?.length ?? 0} gen_fail=${fails}` +
        (fails > 0 ? ` [${gs!.failures.map((f) => f.generator).join(',')}]` : ''),
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? `${err.message}` : String(err) };
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--probe')) {
    console.log('[probe] orchestrator imported OK. typeof coachHelmIntelligence =', typeof coachHelmIntelligence);
    console.log('[probe] analyzePlayer is function:', typeof coachHelmIntelligence.analyzePlayer === 'function');
    return;
  }

  const single = args.find((a) => !a.startsWith('--'));
  let players: Array<{ id: string; name: string }>;
  if (single) {
    players = [{ id: single, name: single }];
  } else {
    players = await getActivePlayers();
  }

  console.log(`[regen] ${players.length} player(s) to process, batch size ${BATCH_SIZE}`);
  const t0 = Date.now();
  let okCount = 0;
  const failures: string[] = [];

  for (let i = 0; i < players.length; i += BATCH_SIZE) {
    const batch = players.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (p) => {
        const r = await regenPlayer(p.id);
        const tag = r.ok ? 'OK ' : 'ERR';
        console.log(`  [${tag}] ${p.name} (${p.id})  ${r.detail}`);
        return { p, r };
      }),
    );
    for (const { p, r } of results) {
      if (r.ok) okCount++;
      else failures.push(`${p.name} (${p.id}): ${r.detail}`);
    }
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[regen] done in ${secs}s — ${okCount}/${players.length} succeeded`);
  if (failures.length) {
    console.log('[regen] failures:');
    for (const f of failures) console.log('   - ' + f);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[regen] fatal:', err);
  process.exit(1);
});
