/**
 * Recompute round-level totals + per-hole GIR flags from per-hole rows.
 *
 * Why: round-level `total_putts`, `total_gir`, `total_fairways_hit` can drift
 * from `golf_holes` when per-hole rows are edited after the round was saved
 * (or when seed/demo data is inserted in pieces). This script makes them
 * internally consistent across the entire `golf_rounds` table.
 *
 * Algorithm:
 *   - For each hole: derive `gir` logically from `score - putts ≤ par - 2`.
 *     (Pure shot-based GIR fails when shot data is incomplete; this rule
 *     follows the strict scoring definition and only depends on `par`,
 *     `score`, `putts` — which are the most reliably-entered fields.)
 *   - Sum per-hole `putts` → `total_putts`
 *   - Sum derived `gir` flags → `total_gir`
 *   - Sum per-hole `fairway_hit=true` (par ≥ 4) → `total_fairways_hit`
 *   - Sum per-hole `score` → `total_score` (sanity check; not overwritten
 *     unless mismatched, in which case we log).
 *
 * Idempotent. Run as often as needed.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.vercel/.env.production.local \
 *     npx tsx -r dotenv/config scripts/recompute-round-totals.ts
 *
 *   Pass --dry-run to log changes without writing.
 *   Pass --round=<uuid> to scope to a single round.
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface HoleRow {
  hole_number: number;
  par: number | null;
  score: number | null;
  putts: number | null;
  gir: boolean | null;
  fairway_hit: boolean | null;
}

interface RoundRow {
  id: string;
  total_score: number | null;
  total_putts: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  score_to_par: number | null;
}

interface ComputedTotals {
  totalScore: number;
  totalPutts: number;
  totalGir: number;
  totalGirPossible: number;
  totalFairwaysHit: number;
  totalFairways: number;
  perHoleGir: Map<number, boolean>;
}

function computeTotals(holes: HoleRow[]): ComputedTotals {
  let totalScore = 0;
  let totalPutts = 0;
  let totalGir = 0;
  let totalFairwaysHit = 0;
  let totalFairways = 0;
  const perHoleGir = new Map<number, boolean>();

  for (const h of holes) {
    const par = h.par ?? 0;
    const score = h.score ?? 0;
    const putts = h.putts ?? 0;

    totalScore += score;
    totalPutts += putts;

    // GIR: strokes_to_green = score - putts; in regulation if ≤ par - 2.
    let gir = false;
    if (par >= 3 && score > 0 && putts >= 0) {
      const strokesToGreen = score - putts;
      gir = strokesToGreen > 0 && strokesToGreen <= par - 2;
    }
    if (gir) totalGir++;
    perHoleGir.set(h.hole_number, gir);

    if (par >= 4) {
      totalFairways++;
      if (h.fairway_hit === true) totalFairwaysHit++;
    }
  }

  return {
    totalScore,
    totalPutts,
    totalGir,
    totalGirPossible: holes.length,
    totalFairwaysHit,
    totalFairways,
    perHoleGir,
  };
}

interface DiffSummary {
  roundId: string;
  putts: { stored: number | null; computed: number };
  gir: { stored: number | null; computed: number };
  fairways: { stored: number | null; computed: number };
  scoreMismatch: { stored: number | null; computed: number } | null;
  perHoleGirChanges: Array<{ hole: number; stored: boolean | null; computed: boolean }>;
}

async function processRound(
  supabase: SupabaseClient,
  round: RoundRow,
  dryRun: boolean,
): Promise<DiffSummary | null> {
  const { data: holesData, error: holesErr } = await supabase
    .from('golf_holes')
    .select('hole_number, par, score, putts, gir, fairway_hit')
    .eq('round_id', round.id)
    .order('hole_number', { ascending: true });

  if (holesErr) {
    console.warn(`[skip] ${round.id}: failed to read holes — ${holesErr.message}`);
    return null;
  }
  const holes = (holesData ?? []) as HoleRow[];
  if (holes.length === 0) {
    return null;
  }

  const computed = computeTotals(holes);
  const perHoleGirChanges: DiffSummary['perHoleGirChanges'] = [];
  for (const h of holes) {
    const c = computed.perHoleGir.get(h.hole_number);
    if (c !== undefined && c !== !!h.gir) {
      perHoleGirChanges.push({
        hole: h.hole_number,
        stored: h.gir,
        computed: c,
      });
    }
  }

  const puttsDrifted = round.total_putts !== computed.totalPutts;
  const girDrifted = round.total_gir !== computed.totalGir;
  const fairwaysDrifted = round.total_fairways_hit !== computed.totalFairwaysHit;
  const scoreMismatch =
    round.total_score != null && round.total_score !== computed.totalScore
      ? { stored: round.total_score, computed: computed.totalScore }
      : null;

  const anyDrift =
    puttsDrifted || girDrifted || fairwaysDrifted || perHoleGirChanges.length > 0;

  if (!anyDrift) return null;

  if (!dryRun) {
    // Update per-hole gir flags that drifted
    if (perHoleGirChanges.length > 0) {
      for (const change of perHoleGirChanges) {
        const { error: updHoleErr } = await supabase
          .from('golf_holes')
          .update({ gir: change.computed })
          .eq('round_id', round.id)
          .eq('hole_number', change.hole);
        if (updHoleErr) {
          console.warn(
            `[warn] ${round.id} hole ${change.hole}: failed to update gir — ${updHoleErr.message}`,
          );
        }
      }
    }

    // Update round-level totals
    const updatePayload: Partial<RoundRow> = {};
    if (puttsDrifted) updatePayload.total_putts = computed.totalPutts;
    if (girDrifted) {
      updatePayload.total_gir = computed.totalGir;
      updatePayload.total_gir_possible = computed.totalGirPossible;
    }
    if (fairwaysDrifted) {
      updatePayload.total_fairways_hit = computed.totalFairwaysHit;
      updatePayload.total_fairways = computed.totalFairways;
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: updRoundErr } = await supabase
        .from('golf_rounds')
        .update(updatePayload)
        .eq('id', round.id);
      if (updRoundErr) {
        console.warn(
          `[warn] ${round.id}: failed to update round totals — ${updRoundErr.message}`,
        );
      }
    }
  }

  return {
    roundId: round.id,
    putts: { stored: round.total_putts, computed: computed.totalPutts },
    gir: { stored: round.total_gir, computed: computed.totalGir },
    fairways: {
      stored: round.total_fairways_hit,
      computed: computed.totalFairwaysHit,
    },
    scoreMismatch,
    perHoleGirChanges,
  };
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
    `${dryRun ? '[DRY RUN] ' : ''}Recomputing round totals${
      singleRoundId ? ` for round ${singleRoundId}` : ' for ALL rounds'
    }...`,
  );

  let query = supabase
    .from('golf_rounds')
    .select(
      'id, total_score, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways, score_to_par',
    )
    .order('round_date', { ascending: true });

  if (singleRoundId) query = query.eq('id', singleRoundId);

  const { data: roundsData, error: roundsErr } = await query;
  if (roundsErr) throw roundsErr;

  const rounds = (roundsData ?? []) as RoundRow[];
  console.log(`Inspecting ${rounds.length} rounds...`);

  let processed = 0;
  let drifted = 0;
  let scoreMismatches = 0;
  for (const round of rounds) {
    const diff = await processRound(supabase, round, dryRun);
    processed++;
    if (diff) {
      drifted++;
      if (diff.scoreMismatch) scoreMismatches++;
      const label = dryRun ? '[would update]' : '[updated]';
      console.log(
        `${label} ${diff.roundId}: putts ${diff.putts.stored}→${diff.putts.computed}, ` +
          `gir ${diff.gir.stored}→${diff.gir.computed}, ` +
          `fwy ${diff.fairways.stored}→${diff.fairways.computed}, ` +
          `gir_flag_changes=${diff.perHoleGirChanges.length}` +
          (diff.scoreMismatch
            ? ` (score MISMATCH stored=${diff.scoreMismatch.stored} sum=${diff.scoreMismatch.computed} — left untouched)`
            : ''),
      );
    }
    if (processed % 25 === 0) {
      console.log(`...${processed}/${rounds.length} processed`);
    }
  }

  console.log(
    `Done. Processed ${processed}, drifted ${drifted}, score-sum mismatches ${scoreMismatches}.${
      dryRun ? ' (dry run — no writes)' : ''
    }`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
