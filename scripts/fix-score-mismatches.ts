/**
 * Fix score mismatches between round-level `total_score` and the per-hole sum.
 *
 * Why: `recompute-round-totals.ts` corrects drift in derived totals (putts,
 * GIR, fairways) but intentionally LEAVES `total_score` alone when it differs
 * from `SUM(golf_holes.score)` — picking which side to trust is a judgment
 * call and the recompute script logs them rather than overwriting.
 *
 * This script is the explicit follow-up that auto-corrects those mismatches.
 * Policy: trust the per-hole `score` column as ground truth (it's what the
 * user entered hole-by-hole; the round-level total is a derived rollup).
 *
 * Algorithm:
 *   - For each round, sum per-hole `score` and `par`.
 *   - If `total_score != SUM(score)`, update:
 *       total_score  = SUM(score)
 *       score_to_par = SUM(score) - SUM(par)
 *   - Per-hole rows are NEVER modified.
 *
 * Idempotent. Run as often as needed.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.vercel/.env.production.local \
 *     npx tsx -r dotenv/config scripts/fix-score-mismatches.ts
 *
 *   Pass --dry-run to log changes without writing.
 *   Pass --round=<uuid> to scope to a single round.
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface HoleRow {
  par: number | null;
  score: number | null;
}

interface RoundRow {
  id: string;
  total_score: number | null;
  score_to_par: number | null;
}

interface MismatchDiff {
  roundId: string;
  storedScore: number | null;
  computedScore: number;
  delta: number;
  storedScoreToPar: number | null;
  computedScoreToPar: number;
}

async function processRound(
  supabase: SupabaseClient,
  round: RoundRow,
  dryRun: boolean,
): Promise<MismatchDiff | null> {
  const { data: holesData, error: holesErr } = await supabase
    .from('golf_holes')
    .select('par, score')
    .eq('round_id', round.id);

  if (holesErr) {
    console.warn(`[skip] ${round.id}: failed to read holes — ${holesErr.message}`);
    return null;
  }
  const holes = (holesData ?? []) as HoleRow[];
  if (holes.length === 0) return null;

  let sumScore = 0;
  let sumPar = 0;
  for (const h of holes) {
    sumScore += h.score ?? 0;
    sumPar += h.par ?? 0;
  }

  // Only act when the round-level total exists AND disagrees with the sum.
  // (A null `total_score` is its own problem — out of scope for this script.)
  if (round.total_score == null || round.total_score === sumScore) {
    return null;
  }

  const computedScoreToPar = sumScore - sumPar;
  const diff: MismatchDiff = {
    roundId: round.id,
    storedScore: round.total_score,
    computedScore: sumScore,
    delta: sumScore - round.total_score,
    storedScoreToPar: round.score_to_par,
    computedScoreToPar,
  };

  if (!dryRun) {
    const { error: updErr } = await supabase
      .from('golf_rounds')
      .update({
        total_score: sumScore,
        score_to_par: computedScoreToPar,
      })
      .eq('id', round.id);
    if (updErr) {
      console.warn(`[warn] ${round.id}: failed to update round — ${updErr.message}`);
      return diff;
    }
  }

  return diff;
}

async function main() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceKey) throw new Error('Missing SUPABASE env vars');

  const dryRun = process.argv.includes('--dry-run');
  const roundArg = process.argv.find((a) => a.startsWith('--round='));
  const singleRoundId = roundArg ? roundArg.slice('--round='.length) : null;

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}Fixing score mismatches${
      singleRoundId ? ` for round ${singleRoundId}` : ' for ALL rounds'
    }...`,
  );

  let query = supabase
    .from('golf_rounds')
    .select('id, total_score, score_to_par')
    .order('round_date', { ascending: true });

  if (singleRoundId) query = query.eq('id', singleRoundId);

  const { data: roundsData, error: roundsErr } = await query;
  if (roundsErr) throw roundsErr;

  const rounds = (roundsData ?? []) as RoundRow[];
  console.log(`Inspecting ${rounds.length} rounds...`);

  let processed = 0;
  let fixed = 0;
  for (const round of rounds) {
    const diff = await processRound(supabase, round, dryRun);
    processed++;
    if (diff) {
      fixed++;
      const label = dryRun ? '[would fix]' : '[fixed]';
      console.log(
        `${label} ${diff.roundId}: total_score ${diff.storedScore}→${diff.computedScore} ` +
          `(delta ${diff.delta >= 0 ? '+' : ''}${diff.delta}), ` +
          `score_to_par ${diff.storedScoreToPar}→${diff.computedScoreToPar}`,
      );
    }
    if (processed % 25 === 0) {
      console.log(`...${processed}/${rounds.length} processed`);
    }
  }

  console.log(
    `Done. Processed ${processed}, fixed ${fixed}.${
      dryRun ? ' (dry run — no writes)' : ''
    }`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
