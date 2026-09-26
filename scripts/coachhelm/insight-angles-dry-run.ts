/**
 * insight-angles-dry-run.ts — READ-ONLY run of the four CoachHelm v3 insight
 * angles (flag `coachhelm_insight_angles_v1`) against production data.
 *
 * Uses the generators' OWN loader and pure compute/compose functions — the
 * same code `run()` would execute — but never calls `run()`, so nothing is
 * written. The flag is not consulted (the point is to preview it off).
 *
 * Output per angle: players evaluated, players qualifying, 3 example insight
 * sentences (player ids truncated to 8 chars, no names), and sizing totals
 * (sum and mean strokes/round of the counterfactual). `--calibrate` also
 * prints the population distributions the gates were set from, and the
 * measured first-putt 3-putt rates behind `PEER_THREE_PUTT`.
 *
 * Usage (the hook stubs `server-only` outside Next):
 *   node --import tsx/esm --import ./scripts/coachhelm/server-only-hook.mjs \
 *     scripts/coachhelm/insight-angles-dry-run.ts [--env .env.local] [--calibrate]
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

const envArg = process.argv.indexOf('--env');
loadEnv({ path: resolve(process.cwd(), envArg > -1 ? process.argv[envArg + 1]! : '.env.local') });
const CALIBRATE = process.argv.includes('--calibrate');

import { createAdminClient } from '@/lib/supabase/admin';
import { loadAngleData, loadTeamPeerRounds } from '@/lib/coachhelm/v3/generators/insight-angles/load-angle-data';
import { median, primaryTeamId, type AngleData } from '@/lib/coachhelm/v3/generators/insight-angles/angle-data';
import {
  composeLieApproach,
  computeLieApproach,
  toLieAggregate,
} from '@/lib/coachhelm/v3/generators/insight-angles/lie-approach';
import {
  composeBadDayFloor,
  computeBadDayFloor,
  toFloorAggregate,
} from '@/lib/coachhelm/v3/generators/insight-angles/bad-day-floor';
import {
  PUTT_BANDS,
  composeThreePuttChain,
  computeThreePuttChain,
  toThreePuttAggregate,
} from '@/lib/coachhelm/v3/generators/insight-angles/three-putt-chain';
import {
  composeApproachCompass,
  computeApproachCompass,
  toCompassAggregate,
} from '@/lib/coachhelm/v3/generators/insight-angles/approach-miss-compass';
import { hasGeneratorSequenceEvidence } from '@/lib/coachhelm/v3/engine/generator-base';
import type { Diagnosis } from '@/lib/coachhelm/v2/insights/types';
import {
  composeTeeMiss,
  computeTeeMiss,
  toTeeMissAggregate,
} from '@/lib/coachhelm/v3/generators/insight-angles/tee-miss-cost';

interface Example {
  player: string;
  category: string;
  title: string;
  sentence: string;
  strokes: number;
  suppressed: boolean;
}

interface AngleTally {
  observed: number;
  evaluated: number;
  qualifying: number;
  examples: Example[];
  strokes: number[];
  byCategory: Record<string, number>;
}

const angles: Record<string, AngleTally> = {};
function tally(name: string): AngleTally {
  return (angles[name] ??= { observed: 0, evaluated: 0, qualifying: 0, examples: [], strokes: [], byCategory: {} });
}

function record(
  name: string,
  playerId: string,
  category: string,
  composed: { title: string; content: string; evidence: unknown },
): void {
  const t = tally(name);
  const diag = (composed.evidence as { diagnosis?: Diagnosis }).diagnosis;
  // Same test mergeDiagnosis applies (with the capability flag on).
  if (diag && hasGeneratorSequenceEvidence(diag)) t.observed += 1;
  const receipts = (composed.evidence as { detail?: { receipts?: { examples?: unknown[]; definition?: string } } }).detail?.receipts;
  calib.receiptsChecked += 1;
  if (receipts?.definition && Array.isArray(receipts.examples) && receipts.examples.length > 0 && receipts.examples.length <= 5) calib.receiptsOk += 1;
  t.qualifying += 1;
  t.byCategory[category] = (t.byCategory[category] ?? 0) + 1;
  const cf = (composed.evidence as { counterfactual?: { strokes_saved_per_round: number; suppressed: boolean } })
    .counterfactual;
  const strokes = cf?.strokes_saved_per_round ?? 0;
  t.strokes.push(strokes);
  t.examples.push({
    player: playerId.slice(0, 8),
    category,
    title: composed.title,
    sentence: composed.content.split(/(?<=\.)\s/).slice(0, 2).join(' '),
    strokes,
    suppressed: cf?.suppressed ?? true,
  });
}

const calib = {
  roughExcess: [] as number[],
  roughZ: [] as number[],
  fairwayGap: [] as number[],
  floorGap: [] as number[],
  floorExtra: [] as number[],
  floorExcluded: 0,
  pathways: { long_approach_leave: 0, poor_first_putt_leave: 0, short_followup_miss: 0, suppressed: 0 } as Record<string, number>,
  receiptsOk: 0,
  receiptsChecked: 0,
  chainExcess: [] as number[],
  chainZ: [] as number[],
  teeGap: [] as number[],
  teeZ: [] as number[],
  teeCoverage: [] as number[],
  compassGap: [] as number[],
  compassCoverage: [] as number[],
  compassIncomplete: 0,
  compassCosted: 0,
  bandHoles: Object.fromEntries(PUTT_BANDS.map((b) => [b, 0])) as Record<string, number>,
  bandThree: Object.fromEntries(PUTT_BANDS.map((b) => [b, 0])) as Record<string, number>,
  slopeFill: [] as number[],
};

async function main(): Promise<void> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('golf_rounds').select('player_id').eq('status', 'completed');
  if (error) throw new Error(error.message);
  const players = [...new Set((data ?? []).map((r) => r.player_id as string))];
  console.log(`players with completed rounds: ${players.length}`);

  for (const playerId of players) {
    let d: AngleData;
    try {
      d = await loadAngleData(playerId);
    } catch (err) {
      console.log(`  ${playerId.slice(0, 8)}: load failed (${(err as Error).message})`);
      continue;
    }
    if (d.rounds.length === 0) continue;
    const team = primaryTeamId(d.rounds);
    const peers = team ? await loadTeamPeerRounds(team) : null;

    // 1. Lie-adjusted approach
    const lie = computeLieApproach(d, peers);
    tally('1 lie-adjusted approach').evaluated += 1;
    if (lie) {
      if (lie.rough_excess !== null && lie.rough_shots >= 20) {
        calib.roughExcess.push(lie.rough_excess);
        if (lie.rough_excess_z !== null) calib.roughZ.push(lie.rough_excess_z);
      }
      if (lie.fairway_pct !== null && lie.peer_fairway_pct !== null) calib.fairwayGap.push(lie.peer_fairway_pct - lie.fairway_pct);
    }
    const lieAgg = toLieAggregate(lie, d.scoringBaseline);
    if (lieAgg) {
      const c = composeLieApproach(lieAgg);
      record('1 lie-adjusted approach', playerId, `${c.category} (${lieAgg.result.cause})`, c);
    }

    // 2. Bad-Day Floor
    const floor = computeBadDayFloor(d, peers);
    tally('2 bad-day floor').evaluated += 1;
    if (floor) {
      calib.floorExcluded += floor.excluded.incomplete_hole_scores;
      if (floor.rounds.length >= 10) {
        calib.floorGap.push(floor.floor_gap);
        if (floor.peer_gap !== null) calib.floorExtra.push(floor.extra_gap);
      }
    }
    const floorAgg = toFloorAggregate(floor, d.scoringBaseline);
    if (floorAgg) {
      const c = composeBadDayFloor(floorAgg);
      record('2 bad-day floor', playerId, c.category, c);
    }

    // 3. 3-putt chain
    const chain = computeThreePuttChain(d);
    tally('3 three-putt chain').evaluated += 1;
    if (chain) {
      for (const b of chain.bands) {
        calib.bandHoles[b.band] += b.holes;
        calib.bandThree[b.band] += b.three_putts;
      }
      if (chain.holes_putted >= 90) {
        calib.chainExcess.push(chain.three_putts_per_18 - chain.expected_peer_per_18);
        if (chain.z !== null) calib.chainZ.push(chain.z);
      }
      if (chain.slope.lag_first_putts > 0) calib.slopeFill.push(chain.slope.fill_pct);
      for (const p of chain.pathways) calib.pathways[p.pathway]! += p.three_putts;
      calib.pathways.suppressed! += chain.pathway_suppressed;
    }
    const chainAgg = toThreePuttAggregate(chain, d.scoringBaseline);
    if (chainAgg) {
      const c = composeThreePuttChain(chainAgg);
      record('3 three-putt chain', playerId, `${c.category} (${chainAgg.result.cause})`, c);
    }

    // 4. Tee miss
    const tee = computeTeeMiss(d);
    tally('4 tee miss cost').evaluated += 1;
    if (tee) {
      if (tee.missed > 0) calib.teeCoverage.push(tee.coverage_pct);
      if (tee.gap_per_miss !== null && tee.sides.left.costed >= 12 && tee.sides.right.costed >= 12) {
        calib.teeGap.push(tee.gap_per_miss);
        if (tee.z !== null) calib.teeZ.push(tee.z);
      }
    }
    const teeAgg = toTeeMissAggregate(tee, d.scoringBaseline);
    if (teeAgg) {
      const c = composeTeeMiss(teeAgg);
      record('4 tee miss cost', playerId, 'tee', c);
    }

    // 5. Approach-miss compass
    const compass = computeApproachCompass(d);
    tally('5 approach-miss compass').evaluated += 1;
    if (compass) {
      if (compass.missed_greens > 0) calib.compassCoverage.push(compass.coverage_pct);
      calib.compassIncomplete += compass.excluded.recovery_incomplete;
      calib.compassCosted += (['short', 'long', 'left', 'right'] as const).reduce((a, k) => a + compass.sides[k].costed, 0);
      for (const ax of ['depth', 'line'] as const) {
        const [a, b] = ax === 'depth' ? (['short', 'long'] as const) : (['left', 'right'] as const);
        if (compass.axes[ax].gap_per_miss !== null && compass.sides[a].costed >= 12 && compass.sides[b].costed >= 12) {
          calib.compassGap.push(compass.axes[ax].gap_per_miss!);
        }
      }
    }
    const compassAgg = toCompassAggregate(compass, d.scoringBaseline);
    if (compassAgg) {
      const c = composeApproachCompass(compassAgg);
      record('5 approach-miss compass', playerId, `${c.category} (${compassAgg.result.lead})`, c);
    }
  }

  for (const [name, t] of Object.entries(angles)) {
    const sum = t.strokes.reduce((a, b) => a + b, 0);
    console.log(`\n=== ${name} ===`);
    console.log(`evaluated ${t.evaluated}, qualifying ${t.qualifying}; by category ${JSON.stringify(t.byCategory)}; observed_sequence-eligible ${t.observed} of ${t.qualifying}`);
    console.log(
      `sizing: total ${sum.toFixed(2)} strokes/round across qualifying players, mean ${(t.qualifying ? sum / t.qualifying : 0).toFixed(2)}, max ${(t.strokes.length ? Math.max(...t.strokes) : 0).toFixed(2)}`,
    );
    for (const e of t.examples.sort((a, b) => b.strokes - a.strokes).slice(0, 3)) {
      console.log(`  [${e.player}] (${e.category}, ${e.strokes.toFixed(2)}/rd${e.suppressed ? ', projection suppressed' : ''}) ${e.title} — ${e.sentence}`);
    }
  }

  if (CALIBRATE) {
    const q = (xs: number[]): string => {
      if (!xs.length) return 'n=0';
      const s = [...xs].sort((a, b) => a - b);
      const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!.toFixed(2);
      return `n=${s.length} p25=${at(0.25)} p50=${at(0.5)} p75=${at(0.75)} p90=${at(0.9)} max=${s[s.length - 1]!.toFixed(2)}`;
    };
    console.log('\n=== calibration ===');
    console.log(`rough excess (strokes/rough approach, ≥20 rough shots): ${q(calib.roughExcess)}`);
    console.log(`rough excess z: ${q(calib.roughZ)}`);
    console.log(`fairway gap vs team median (pp): ${q(calib.fairwayGap)}`);
    console.log(`bad-day floor gap P80−median (strokes/18, ≥10 rounds): ${q(calib.floorGap)}`);
    console.log(`bad-day extra gap vs teammates' median: ${q(calib.floorExtra)}`);
    console.log(`rounds excluded for incomplete hole scores: ${calib.floorExcluded}`);
    console.log(`3-putt pathways (all players, newest 40 countable rounds): ${JSON.stringify(calib.pathways)}`);
    console.log(`3-putt excess per 18 (≥90 holes): ${q(calib.chainExcess)}`);
    console.log(`3-putt z: ${q(calib.chainZ)}`);
    console.log(`lag first-putt slope fill %: ${q(calib.slopeFill)}`);
    console.log(`tee side gap (strokes/miss, ≥12 each side): ${q(calib.teeGap)}`);
    console.log(`tee side z: ${q(calib.teeZ)}`);
    console.log(`tee miss-side coverage %: ${q(calib.teeCoverage)}`);
    console.log(`compass side gap (strokes/miss, ≥12 costed each side): ${q(calib.compassGap)}`);
    console.log(`compass miss-direction coverage %: ${q(calib.compassCoverage)}`);
    console.log(`compass misses costed ${calib.compassCosted} (side-counted), recovery records incomplete ${calib.compassIncomplete}`);
    const holes = Object.values(calib.bandHoles).reduce((a, b) => a + b, 0);
    console.log(`first-putt bands over countable rounds (newest 40 per player), ${holes} holes:`);
    for (const b of PUTT_BANDS) {
      const n = calib.bandHoles[b]!;
      console.log(`  ${b}: holes ${n} share ${(n / (holes || 1)).toFixed(3)} three-putt rate ${(calib.bandThree[b]! / (n || 1)).toFixed(4)}`);
    }
    console.log(`median lag slope fill: ${median(calib.slopeFill) ?? 'n/a'}`);
  }
  console.log(`\nreceipts present (definition + 1–5 examples) on ${calib.receiptsOk} of ${calib.receiptsChecked} qualifying rows`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
