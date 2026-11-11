/**
 * CoachHelm analyst: where the app's two make-rate definitions disagree, counted.
 *
 *   the one definition (owner decision Q-93)   src/lib/golf/putt-make.ts: a shot typed 'putting', start distance from
 *                                              `distance_to_hole_before`, made when `result = 'hole'` OR `putt_made`.
 *                                              The fact sheet, the leak map and the Fairway stats use it.
 *   the Clubhouse Stats loader                 src/clubhouse/data/stats-common.ts `loadPutts`: any shot with BOTH
 *                                              `putt_distance_feet` and `putt_made` set, distance from
 *                                              `putt_distance_feet` (0 to 120), made when `putt_made`.
 *
 * A diagnostic for the dry run. No figure reads it. Pure.
 */
import { PUTT_REPORT_BAND_OF, bandedPutt, puttMakeBandFor, type PuttReportBandId } from '@/lib/golf/putt-make';
import type { ShotRow } from './sources';

const BANDS: readonly PuttReportBandId[] = ['0_3', '3_5', '5_10', '10_15', '15_25', '25_plus'];

export interface PuttDefinitionCount {
  /** Putts either definition counts. */
  putts: number;
  /** Counted by both, in the same band with the same result. */
  agree: number;
  /** Counted by both, but in different distance bands. */
  different_band: number;
  /** Counted by both, but made under one and missed under the other. */
  different_result: number;
  /** Counted only by the one definition (no `putt_distance_feet` or no `putt_made`). */
  only_the_one_definition: number;
  /** Counted only by the Clubhouse loader (not typed 'putting', or no `distance_to_hole_before`). */
  only_clubhouse: number;
  bands: Array<{ band: PuttReportBandId; one_definition: { made: number; attempts: number }; clubhouse: { made: number; attempts: number } }>;
}

type Banded = { band: PuttReportBandId; made: boolean } | null;

/** The putt as the Clubhouse Stats loader counts it, or null when it does not. */
function clubhousePutt(s: ShotRow): Banded {
  if (s.putt_distance_feet == null || s.putt_made == null) return null;
  const feet = Number(s.putt_distance_feet);
  if (!Number.isFinite(feet) || feet < 0 || feet > 120) return null;
  return { band: PUTT_REPORT_BAND_OF[puttMakeBandFor(feet)], made: !!s.putt_made };
}

/** The putt on the one make-rate definition, or null when it is not one. */
function onePutt(s: ShotRow): Banded {
  if (s.shot_type !== 'putting') return null;
  const p = bandedPutt(s);
  return p ? { band: PUTT_REPORT_BAND_OF[p.band], made: p.made } : null;
}

export function comparePuttDefinitions(shots: readonly ShotRow[]): PuttDefinitionCount {
  const out: PuttDefinitionCount = {
    putts: 0,
    agree: 0,
    different_band: 0,
    different_result: 0,
    only_the_one_definition: 0,
    only_clubhouse: 0,
    bands: BANDS.map((band) => ({ band, one_definition: { made: 0, attempts: 0 }, clubhouse: { made: 0, attempts: 0 } })),
  };
  const cell = (band: PuttReportBandId) => out.bands.find((b) => b.band === band)!;
  for (const s of shots) {
    const a = onePutt(s);
    const b = clubhousePutt(s);
    if (!a && !b) continue;
    out.putts += 1;
    if (a) {
      cell(a.band).one_definition.attempts += 1;
      if (a.made) cell(a.band).one_definition.made += 1;
    }
    if (b) {
      cell(b.band).clubhouse.attempts += 1;
      if (b.made) cell(b.band).clubhouse.made += 1;
    }
    if (a && b) {
      if (a.band !== b.band) out.different_band += 1;
      if (a.made !== b.made) out.different_result += 1;
      if (a.band === b.band && a.made === b.made) out.agree += 1;
    } else if (a) out.only_the_one_definition += 1;
    else out.only_clubhouse += 1;
  }
  return out;
}
