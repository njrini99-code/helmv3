/**
 * Headline player numbers computed over COUNTABLE rounds only
 * (see ./round-countable.ts).
 *
 * `golf_player_stats_cache` is filled by a DB trigger that counts every
 * completed round, including partial, hole-less and implausible ones. Until
 * that trigger adopts the same rule (an owner-approved migration), the
 * player-facing loaders aggregate here from per-round rows instead:
 * `golf_rounds` + `golf_round_stats_cache` (one row per round, same trigger
 * family, so SG/birdies/greens per round are the values the player cache sums).
 *
 * Pure. Rounds must arrive NEWEST FIRST.
 */

import { deriveRoundTotal } from './round-total';
import { roundExclusionReason, type CountableRoundInput } from './round-countable';

export interface CountableRoundRow extends CountableRoundInput {
  id: string;
  round_date: string;
}

/** The per-round cache fields the aggregate reads (golf_round_stats_cache). */
export interface RoundStatsCacheRow {
  round_id: string;
  birdies: number | null;
  eagles: number | null;
  total_putts: number | null;
  three_putts: number | null;
  fairways_hit: number | null;
  fairways_total: number | null;
  greens_hit: number | null;
  greens_total: number | null;
  scramble_attempts: number | null;
  scrambles_converted: number | null;
  strokes_gained_total: number | null;
  strokes_gained_tee: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_around_green: number | null;
  strokes_gained_putting: number | null;
}

export interface SgPerRound {
  total: number | null;
  offTee: number | null;
  approach: number | null;
  aroundGreen: number | null;
  putting: number | null;
  /** Rounds that carried an SG: Total value. */
  rounds: number;
}

export interface CountableHeadline {
  /** Rounds that count. */
  roundsCounted: number;
  /** Completed rounds left out (partial, hole-less or implausible). */
  roundsExcluded: number;
  /** Mean 18-hole score over every countable 18-hole round. */
  scoringAverage: number | null;
  scoringAverageRounds: number;
  /** Mean of the latest 5 countable 18-hole rounds. */
  last5Average: number | null;
  /** Mean of the 5 countable 18-hole rounds before those. */
  prior5Average: number | null;
  /** Lowest countable 18-hole score. */
  bestRound: number | null;
  /** Hole-weighted putts per 18, over rounds that recorded putts. */
  puttsPer18: number | null;
  /** Birdies per 18 holes (eagles are not folded in; the label says birdies). */
  birdiesPer18: number | null;
  /** Three-putts per 18 holes. */
  threePuttsPer18: number | null;
  /** Measured share of holes with a three-putt, 0–100. */
  threePuttRate: number | null;
  girPct: number | null;
  fairwayPct: number | null;
  scramblingPct: number | null;
  sg: SgPerRound;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function ratioPct(made: number, total: number): number | null {
  return total > 0 ? (made / total) * 100 : null;
}

function finiteOrNull(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function aggregateCountableRounds(
  roundsNewestFirst: readonly CountableRoundRow[],
  statsByRoundId: ReadonlyMap<string, RoundStatsCacheRow> = new Map(),
): CountableHeadline {
  let excluded = 0;
  const counted: Array<{ row: CountableRoundRow; holes: number; total: number; stats: RoundStatsCacheRow | undefined }> = [];

  for (const row of roundsNewestFirst) {
    const stats = statsByRoundId.get(row.id);
    const reason = roundExclusionReason({
      ...row,
      strokes_gained_total: row.strokes_gained_total ?? stats?.strokes_gained_total ?? null,
    });
    if (reason !== null) {
      if (reason !== 'not_completed') excluded++;
      continue;
    }
    const total = deriveRoundTotal(row).total;
    if (total == null) continue;
    counted.push({ row, holes: row.holes_played ?? 18, total, stats });
  }

  const totals18 = counted.filter((c) => c.holes === 18).map((c) => c.total);

  let puttSum = 0;
  let puttHoles = 0;
  let birdieSum = 0;
  let threePuttSum = 0;
  let statHoles = 0;
  let fwHit = 0;
  let fwTotal = 0;
  let gHit = 0;
  let gTotal = 0;
  let scrMade = 0;
  let scrAtt = 0;
  const sgTotal: number[] = [];
  const sgTee: number[] = [];
  const sgApp: number[] = [];
  const sgArg: number[] = [];
  const sgPutt: number[] = [];

  for (const c of counted) {
    const putts = finiteOrNull(c.stats?.total_putts ?? c.row.total_putts);
    if (putts != null && putts > 0) {
      puttSum += putts;
      puttHoles += c.holes;
    }
    const s = c.stats;
    if (!s) continue;
    statHoles += c.holes;
    birdieSum += s.birdies ?? 0;
    threePuttSum += s.three_putts ?? 0;
    if (s.fairways_total != null && s.fairways_total > 0) {
      fwHit += s.fairways_hit ?? 0;
      fwTotal += s.fairways_total;
    }
    if (s.greens_total != null && s.greens_total > 0) {
      gHit += s.greens_hit ?? 0;
      gTotal += s.greens_total;
    }
    if (s.scramble_attempts != null && s.scramble_attempts > 0) {
      scrMade += s.scrambles_converted ?? 0;
      scrAtt += s.scramble_attempts;
    }
    const push = (arr: number[], v: number | null) => {
      const f = finiteOrNull(v);
      if (f != null) arr.push(f);
    };
    push(sgTotal, s.strokes_gained_total);
    push(sgTee, s.strokes_gained_tee);
    push(sgApp, s.strokes_gained_approach);
    push(sgArg, s.strokes_gained_around_green);
    push(sgPutt, s.strokes_gained_putting);
  }

  return {
    roundsCounted: counted.length,
    roundsExcluded: excluded,
    scoringAverage: mean(totals18),
    scoringAverageRounds: totals18.length,
    last5Average: mean(totals18.slice(0, 5)),
    prior5Average: totals18.length >= 10 ? mean(totals18.slice(5, 10)) : null,
    bestRound: totals18.length > 0 ? Math.min(...totals18) : null,
    puttsPer18: puttHoles > 0 ? (puttSum / puttHoles) * 18 : null,
    birdiesPer18: statHoles > 0 ? (birdieSum / statHoles) * 18 : null,
    threePuttsPer18: statHoles > 0 ? (threePuttSum / statHoles) * 18 : null,
    threePuttRate: ratioPct(threePuttSum, statHoles),
    girPct: ratioPct(gHit, gTotal),
    fairwayPct: ratioPct(fwHit, fwTotal),
    scramblingPct: ratioPct(scrMade, scrAtt),
    sg: {
      total: mean(sgTotal),
      offTee: mean(sgTee),
      approach: mean(sgApp),
      aroundGreen: mean(sgArg),
      putting: mean(sgPutt),
      rounds: sgTotal.length,
    },
  };
}

/** Columns a loader selects from golf_round_stats_cache for the aggregate. */
export const ROUND_STATS_CACHE_COLUMNS =
  'round_id, birdies, eagles, total_putts, three_putts, fairways_hit, fairways_total, greens_hit, greens_total, scramble_attempts, scrambles_converted, strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting';
