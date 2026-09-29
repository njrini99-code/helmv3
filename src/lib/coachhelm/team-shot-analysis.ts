/**
 * Team shot analysis: yardage curve, dead zones and weakest shot contexts for
 * `getTeamOverview` (the Home's retired "Team shot weaknesses" payload).
 *
 * Rebuilt after the 2026-09 accuracy audit (row 3), which found every team
 * shown a permanent "275-300y dead zone":
 *  - The old curve clamped every shot >= 300 yd into its 275-300 bucket,
 *    so that bucket was really "all tee shots on long holes".
 *  - Its tee baseline was flat at 3.60 for >= 250 yd while the canonical curve
 *    (public.sg_expected_strokes) rises to 4.23 at 450, charging each long
 *    drive ~0.6 strokes of false loss.
 *  - Lie `other` and penalty rows fell back to the fairway table.
 *  - Dead zones compared against a synthetic 0, so a college roster was
 *    "behind" everywhere by construction.
 *
 * Now:
 *  - Each shot's SG uses the canonical rising Tour curve
 *    (`calculateStrokesGainedForShot`, kept in lockstep with the DB).
 *  - The top bucket is open-ended (250+, `rangeEnd: null`), shown but never
 *    flagged.
 *  - `other` is labelled `recovery` and charged on the rough curve (809 of
 *    ~31k 90-day shots; most follow a rough lie or a drop).
 *  - Penalty rows are left out of every shot context and counted in
 *    `penaltyStrokes`.
 *  - A dead zone or weakness is judged against the TEAM's own mean SG per
 *    shot (owner decision: anchor to the cohort). `avgSG` still reports the
 *    Tour-relative value beside it.
 *
 * Pure.
 */
import { calculateStrokesGainedForShot, type RawShot } from '@/lib/utils/golf-stats-calculator-shots';

export interface TeamShotRow {
  id: string;
  round_id: string;
  hole_number: number;
  shot_number: number;
  shot_type: string | null;
  club_type: string | null;
  lie_before: string | null;
  lie_after: string | null;
  distance_to_hole_before: number | null;
  distance_unit_before: string | null;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  result: string | null;
  is_penalty: boolean | null;
}

export interface TeamYardageBucket {
  rangeStart: number;
  /** null on the open-ended top bucket. */
  rangeEnd: number | null;
  /** Mean SG per shot vs the Tour curve. */
  avgSG: number;
  /** avgSG minus the team's mean SG per non-green shot. */
  vsTeam: number;
  shotCount: number;
}

export interface TeamDeadZone {
  rangeStart: number;
  rangeEnd: number;
  /** How far below the team's own mean SG per shot (positive = worse). */
  deficit: number;
  /** The bucket's SG per shot vs Tour. */
  avgSG: number;
  shotCount: number;
}

export interface TeamWeakness {
  context: string;
  lie: string;
  distanceRange: string;
  avgSG: number;
  vsTeam: number;
  shotCount: number;
}

export interface TeamShotAnalysisResult {
  yardageCurve: TeamYardageBucket[];
  deadZones: TeamDeadZone[];
  topWeaknesses: TeamWeakness[];
  /** Team mean SG per non-green shot vs Tour: the cohort anchor. */
  teamAvgSG: number | null;
  /** Penalty rows, left out of every shot context. */
  penaltyStrokes: number;
}

const BUCKET_YD = 25;
const TOP_BUCKET_START = 250;
const DEAD_ZONE_THRESHOLD = 0.2;
const MIN_SHOTS = 15;

const KNOWN_LIES = new Set(['tee', 'fairway', 'rough', 'sand', 'green']);
/** Explicit lie mapping: `other` is a recovery lie on the rough curve. */
function mapLie(lie: string | null): { label: string; table: string } | null {
  if (!lie) return null;
  if (KNOWN_LIES.has(lie)) return { label: lie, table: lie };
  if (lie === 'other') return { label: 'recovery', table: 'rough' };
  return null;
}

const YARD_BANDS: readonly [number, number | null][] = [
  [0, 50], [50, 100], [100, 150], [150, 200], [200, 250], [250, null],
];
const FEET_BANDS: readonly [number, number | null][] = [
  [0, 5], [5, 10], [10, 20], [20, 40], [40, null],
];
function band(bands: readonly [number, number | null][], d: number): string {
  const hit = bands.find(([lo, hi]) => d >= lo && (hi === null || d < hi)) ?? bands[bands.length - 1]!;
  return hit[1] === null ? `${hit[0]}+` : `${hit[0]}-${hit[1]}`;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const meanOf = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function isPenaltyRow(s: TeamShotRow): boolean {
  return s.is_penalty === true || s.shot_type === 'penalty' || s.lie_after === 'penalty';
}

export function analyzeTeamShots(rows: readonly TeamShotRow[]): TeamShotAnalysisResult {
  let penaltyStrokes = 0;
  const offGreen: { yards: number; lie: string; sg: number }[] = [];
  const onGreen: { feet: number; sg: number }[] = [];

  for (const s of rows) {
    if (isPenaltyRow(s)) {
      penaltyStrokes += 1;
      continue;
    }
    const before = mapLie(s.lie_before);
    if (!before || s.distance_to_hole_before == null) continue;
    const after = s.lie_after == null ? null : mapLie(s.lie_after);
    const sg = calculateStrokesGainedForShot({
      id: s.id,
      round_id: s.round_id,
      hole_number: s.hole_number,
      shot_number: s.shot_number,
      shot_type: s.shot_type,
      club_type: s.club_type,
      lie_before: before.table,
      lie_after: after ? after.table : s.lie_after,
      distance_to_hole_before: s.distance_to_hole_before,
      distance_unit_before: s.distance_unit_before,
      distance_to_hole_after: s.distance_to_hole_after,
      distance_unit_after: s.distance_unit_after,
      result: s.result,
      miss_direction: null,
      putt_break: null,
    } as RawShot);
    if (sg == null || !Number.isFinite(sg)) continue;
    if (before.table === 'green') {
      onGreen.push({ feet: s.distance_to_hole_before, sg });
    } else {
      const yards = s.distance_unit_before === 'feet' ? s.distance_to_hole_before / 3 : s.distance_to_hole_before;
      offGreen.push({ yards, lie: before.label, sg });
    }
  }

  const teamAvg = meanOf(offGreen.map((s) => s.sg));
  const puttAvg = meanOf(onGreen.map((s) => s.sg));

  // Yardage curve: 25-yd buckets to 250, then one open-ended 250+ bucket.
  const buckets = new Map<number, number[]>();
  for (const s of offGreen) {
    const start = s.yards >= TOP_BUCKET_START ? TOP_BUCKET_START : Math.floor(s.yards / BUCKET_YD) * BUCKET_YD;
    const arr = buckets.get(start) ?? [];
    arr.push(s.sg);
    buckets.set(start, arr);
  }
  const yardageCurve: TeamYardageBucket[] = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([start, sgs]) => {
      const avg = meanOf(sgs)!;
      return {
        rangeStart: start,
        rangeEnd: start === TOP_BUCKET_START ? null : start + BUCKET_YD,
        avgSG: round3(avg),
        vsTeam: round3(avg - (teamAvg ?? 0)),
        shotCount: sgs.length,
      };
    });

  const deadZones: TeamDeadZone[] = yardageCurve
    .filter((b): b is TeamYardageBucket & { rangeEnd: number } => b.rangeEnd !== null)
    .filter((b) => b.shotCount >= MIN_SHOTS && -b.vsTeam > DEAD_ZONE_THRESHOLD)
    .map((b) => ({ rangeStart: b.rangeStart, rangeEnd: b.rangeEnd, deficit: round3(-b.vsTeam), avgSG: b.avgSG, shotCount: b.shotCount }))
    .sort((a, b) => b.deficit - a.deficit);

  // Contexts: lie x distance band, each against its own class mean
  // (off-green shots vs the team's off-green mean, putts vs its putt mean).
  const contexts = new Map<string, { lie: string; range: string; unit: 'yd' | 'ft'; sgs: number[] }>();
  const add = (lie: string, range: string, unit: 'yd' | 'ft', sg: number) => {
    const key = `${lie}|${range}`;
    const c = contexts.get(key) ?? { lie, range, unit, sgs: [] };
    c.sgs.push(sg);
    contexts.set(key, c);
  };
  for (const s of offGreen) add(s.lie, band(YARD_BANDS, s.yards), 'yd', s.sg);
  for (const s of onGreen) add('green', band(FEET_BANDS, s.feet), 'ft', s.sg);

  const topWeaknesses: TeamWeakness[] = [...contexts.values()]
    .filter((c) => c.sgs.length >= MIN_SHOTS)
    .map((c) => {
      const avg = meanOf(c.sgs)!;
      const anchor = (c.lie === 'green' ? puttAvg : teamAvg) ?? 0;
      return {
        context: `${c.lie} ${c.range}${c.unit}`,
        lie: c.lie,
        distanceRange: `${c.range}${c.unit}`,
        avgSG: round3(avg),
        vsTeam: round3(avg - anchor),
        shotCount: c.sgs.length,
      };
    })
    .sort((a, b) => a.vsTeam - b.vsTeam)
    .slice(0, 5);

  return {
    yardageCurve,
    deadZones,
    topWeaknesses,
    teamAvgSG: teamAvg == null ? null : round3(teamAvg),
    penaltyStrokes,
  };
}
