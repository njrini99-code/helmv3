/**
 * Manual pattern-miner trigger for diagnostics.
 *
 * Why this exists: when `golf_patterns_v2` shows zero rows for an entire
 * team despite players having rounds and shots in the database, we need a
 * way to invoke the V2 engine outside the cron path and observe what each
 * mining stage produces. The roster-sweep cron only logs aggregate counts,
 * not per-stage output.
 *
 * Usage:
 *   - Default (Larsen + one teammate from Guilford College Men's Golf):
 *       npx tsx scripts/run-pattern-miner-for-team.ts
 *   - Specific player(s):
 *       npx tsx scripts/run-pattern-miner-for-team.ts <playerId> [<playerId> ...]
 *
 * Loads env from `.vercel/.env.production.local` (matches what the live cron
 * sees), so DB writes go to production. Uses the admin client throughout.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

// Load production env BEFORE importing any module that reads process.env at
// module init time (the admin client reads SUPABASE_SERVICE_ROLE_KEY on
// `createAdminClient()` call, so this ordering is mostly defensive).
loadEnv({ path: resolve(process.cwd(), '.vercel/.env.production.local') });

import { createAdminClient } from '@/lib/supabase/admin';
import { PatternMiner } from '@/lib/coachhelm/v2/mining/pattern-miner';
import { ShotPatternMiner } from '@/lib/coachhelm/v2/mining/shot-pattern-miner';

// Default cohort: Larsen Gallimore (12 rounds, 33 insights — most active
// Guilford player) plus one teammate to show the fix isn't player-specific.
const DEFAULT_PLAYER_IDS = [
  'cd822fe9-cce3-45fc-b5d3-96bd1f3c933b', // Larsen Gallimore
];

async function runForPlayer(playerId: string): Promise<void> {
  const sb = createAdminClient();

  const { data: profile } = await sb
    .from('golf_players')
    .select('first_name, last_name')
    .eq('id', playerId)
    .maybeSingle();

  const label = profile
    ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
    : '(unknown)';

  console.log(`\n=== ${label} (${playerId}) ===`);

  // Snapshot pre-run pattern count so we can confirm new rows landed.
  const { count: preCount } = await sb
    .from('golf_patterns_v2')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', playerId);
  console.log(`pre-run patterns in DB: ${preCount ?? 0}`);

  // Stage 1: rule-based PatternMiner.
  console.log('-> running PatternMiner.minePatterns()');
  const t0 = Date.now();
  const minedPatterns = await new PatternMiner(playerId).minePatterns();
  console.log(
    `   PatternMiner returned ${minedPatterns.length} patterns in ${Date.now() - t0}ms`,
  );
  for (const p of minedPatterns) {
    const cond = p.conditions
      .map((c) => c.label ?? `${c.field} ${c.operator} ${c.value}`)
      .join(' AND ');
    console.log(
      `     [${p.patternType}] ${cond} | impact=${p.strokeImpact.toFixed(2)} sup=${p.support.toFixed(2)} conf=${p.confidence.toFixed(2)} lift=${p.lift.toFixed(2)} n=${p.sampleSize}`,
    );
  }

  // Stage 2: shot-level ShotPatternMiner.
  console.log('-> running ShotPatternMiner.analyzeShotPatterns()');
  const t1 = Date.now();
  const shotAnalysis = await new ShotPatternMiner(playerId).analyzeShotPatterns();
  if (!shotAnalysis) {
    console.log(`   ShotPatternMiner returned null (insufficient shots) in ${Date.now() - t1}ms`);
  } else {
    console.log(
      `   ShotPatternMiner returned ${shotAnalysis.patterns.length} patterns in ${Date.now() - t1}ms`,
    );
    for (const p of shotAnalysis.patterns) {
      console.log(
        `     ${p.situation.distanceRange.label} lie=${p.situation.lie} primaryMiss=${p.primaryMiss} freq=${(p.tendencies[0]?.frequency ?? 0).toFixed(2)} dcs=${p.distanceControlScore.toFixed(2)} n=${p.sampleSize} conf=${p.confidence.toFixed(2)}`,
      );
    }
  }

  // Snapshot post-run pattern count.
  const { count: postCount } = await sb
    .from('golf_patterns_v2')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', playerId);
  console.log(`post-run patterns in DB: ${postCount ?? 0} (delta ${(postCount ?? 0) - (preCount ?? 0)})`);
}

async function main(): Promise<void> {
  const ids = process.argv.slice(2);
  const playerIds = ids.length > 0 ? ids : DEFAULT_PLAYER_IDS;

  for (const id of playerIds) {
    try {
      await runForPlayer(id);
    } catch (err) {
      console.error(`Failed for ${id}:`, err);
    }
  }
}

main().then(() => process.exit(0));
