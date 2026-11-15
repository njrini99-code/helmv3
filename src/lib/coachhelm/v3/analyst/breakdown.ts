/**
 * CoachHelm analyst: where inside an area the strokes go, counted from shots.
 *
 * "Approach" is the same word for most of a team. One level down the players differ: which distance, which miss.
 * For each of the four strokes-gained areas this splits a player's season of MEASURED rounds into bands and gives,
 * per band, the strokes gained per round with its range and the counted patterns behind it (miss sides, green hits,
 * make rate, three-putts), each with its count.
 *
 * Nothing here is inferred. Per-shot strokes gained is `shotSgForRound`
 * (src/lib/coachhelm/v3/generators/insight-angles/shot-sg.ts), the line-for-line port of the database function that
 * wrote the stored round figures, so a round's bands add up to its stored area figure. A pattern the shot rows cannot
 * support (too few shots, or the column is empty) is `not_traced` with the reason, never a guess.
 *
 *   approach          by start distance: inside 50 yards, 50 to 125, 125 to 175, 175 and longer (`approachBandOf`),
 *                     with par-5 lay-ups from 175 and longer apart (`classifyParFiveLongApproach`): a lay-up is not a miss
 *   putting           by start distance: the six make-rate bands (src/lib/golf/putt-make.ts)
 *   off the tee       by where the tee shot went: fairway, missed left, missed right, another miss, penalty strokes
 *   around the green  by the lie it was played from: fairway or fringe, rough, bunker
 *
 * Pure: rows in, facts out.
 */
import { approachBandOf } from '@/lib/coachhelm/v3/generators/insight-angles/counted-shots';
import { sgNormalizeLie, shotSgForRound, type RawShotRow } from '@/lib/coachhelm/v3/generators/insight-angles/shot-sg';
import { classifyParFiveLongApproach } from '@/lib/coachhelm/v3/metrics/layup-intent';
import { wilsonInterval } from '@/lib/coachhelm/v3/stats/intervals';
import { PUTT_REPORT_BAND_OF, isPuttMade, puttMakeBandFor, puttMakeStartFeet } from '@/lib/golf/putt-make';
import { STROKES_GAINED_AREA_IDS } from './measures';
import type { CountedRound } from './rounds';
import type { HoleRow, ShotRow } from './sources';
import { meanSummary, tRange95 } from './stats';
import type { AreaBreakdown, BandFact, PatternFact } from './types';

export type AreaId = (typeof STROKES_GAINED_AREA_IDS)[number];

/** A pattern is a rate over at least ten shots: the floor Stats uses for a putt band and an approach band. */
export const PATTERN_MIN_SHOTS = 10;

/**
 * A miss-side share is read only when the side was recorded on at least this share of the misses; under it, the
 * recorded ones are not a fair sample of the misses (the miss-compass angle's `COMPASS_MIN_COVERAGE`).
 */
export const MISS_SIDE_MIN_COVERAGE = 0.8;

const BANDS: Record<AreaId, ReadonlyArray<{ id: string; label: string }>> = {
  strokes_gained_off_the_tee: [
    { id: 'fairway', label: 'tee shots that found the fairway' },
    { id: 'left', label: 'tee shots missed left' },
    { id: 'right', label: 'tee shots missed right' },
    { id: 'other', label: 'tee shots missed with no side recorded' },
    { id: 'penalty', label: 'penalty strokes from the tee' },
  ],
  strokes_gained_approach: [
    { id: 'under_50', label: 'approach shots from inside 50 yards' },
    { id: '50_125', label: 'approach shots from 50 to 125 yards' },
    { id: '125_175', label: 'approach shots from 125 to 175 yards' },
    { id: '175_plus', label: 'approach shots from 175 yards and longer' },
    { id: 'layup', label: 'par 5 lay-ups from 175 yards and longer' },
  ],
  strokes_gained_around_the_green: [
    { id: 'fairway', label: 'shots around the green from the fairway or fringe' },
    { id: 'rough', label: 'shots around the green from the rough' },
    { id: 'sand', label: 'shots around the green from a bunker' },
  ],
  strokes_gained_putting: [
    { id: '0_3', label: 'putts from inside 3 feet' },
    { id: '3_5', label: 'putts from 3 to 5 feet' },
    { id: '5_10', label: 'putts from 5 to 10 feet' },
    { id: '10_15', label: 'putts from 10 to 15 feet' },
    { id: '15_25', label: 'putts from 15 to 25 feet' },
    { id: '25_plus', label: 'putts from 25 feet and longer' },
  ],
};

/** The one rate that says how a band went: carried per band into the area's overall patterns. */
const HEADLINE: Record<AreaId, string> = {
  strokes_gained_off_the_tee: 'share_of_tee_shots',
  strokes_gained_approach: 'green_hit',
  strokes_gained_around_the_green: 'on_green',
  strokes_gained_putting: 'made',
};

const AREA_OF: Record<'off_tee' | 'approach' | 'around_green' | 'putting', AreaId> = {
  off_tee: 'strokes_gained_off_the_tee',
  approach: 'strokes_gained_approach',
  around_green: 'strokes_gained_around_the_green',
  putting: 'strokes_gained_putting',
};

const r4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const lower = (s: string | null): string => (s ?? '').toLowerCase();
const yardsOf = (s: ShotRow): number | null => (s.distance_to_hole_before == null ? null : lower(s.distance_unit_before) === 'feet' ? s.distance_to_hole_before / 3 : s.distance_to_hole_before);
/** The finish in feet, with the leak map's unit rule: feet unless the row says yards. */
const leaveFeet = (s: ShotRow): number | null => (s.distance_to_hole_after == null ? null : lower(s.distance_unit_after) === 'yards' ? s.distance_to_hole_after * 3 : s.distance_to_hole_after);
/** The leak map's "found the green" (src/lib/golf/leak-map-buckets.ts `isOnGreen`). */
const onGreen = (s: ShotRow): boolean => ['green', 'hole', 'gir'].includes(lower(s.result)) || lower(s.lie_after) === 'green';
const isPenalty = (s: ShotRow): boolean => s.is_penalty === true || s.shot_type === 'penalty';

/** The band a shot belongs to inside its area; null when it has none. */
function bandOf(area: AreaId, s: ShotRow, par: number | null): string | null {
  switch (area) {
    case 'strokes_gained_approach': {
      const yards = yardsOf(s);
      if (yards == null) return null;
      const band = approachBandOf(yards) ?? 'under_50';
      // The leak map's rule: a par-5 shot from 175 and longer left 50 yards or more out was a lay-up, not a miss.
      if (band === '175_plus' && !isPenalty(s) && classifyParFiveLongApproach({ par, onGreen: onGreen(s), leaveFeet: leaveFeet(s) }) === 'layup') return 'layup';
      return band;
    }
    case 'strokes_gained_putting': {
      const feet = puttMakeStartFeet(s);
      return feet == null ? null : PUTT_REPORT_BAND_OF[puttMakeBandFor(feet)];
    }
    case 'strokes_gained_off_the_tee': {
      if (isPenalty(s)) return 'penalty';
      if (lower(s.result) === 'fairway' || lower(s.lie_after) === 'fairway') return 'fairway';
      const side = lower(s.miss_direction);
      return side.includes('left') ? 'left' : side.includes('right') ? 'right' : 'other';
    }
    case 'strokes_gained_around_the_green': {
      const lie = sgNormalizeLie(s.lie_before);
      return lie === 'sand' ? 'sand' : lie === 'rough' ? 'rough' : 'fairway';
    }
  }
}

const rawShot = (s: ShotRow): RawShotRow => ({ ...s, shot_number: s.shot_number ?? 0, created_at: null });

// ── Patterns ────────────────────────────────────────────────────────────────────────────────────────────────────────

function share(id: string, label: string, count: number, of: number, needs: string): PatternFact {
  const base = { id, label, unit: 'percent' as const, count, of, basis: 'counted_from_shots' as const };
  if (of < PATTERN_MIN_SHOTS) return { ...base, value: null, not_traced: `needs ${PATTERN_MIN_SHOTS} ${needs}; ${of} so far` };
  const ci = wilsonInterval(count, of);
  return { ...base, value: r4((count / of) * 100), ...(ci ? { range95: { low: r4(ci.low), high: r4(ci.high) } } : {}) };
}

function meanFeet(id: string, label: string, values: readonly number[], needs: string): PatternFact {
  const base = { id, label, unit: 'feet' as const, count: values.length, of: values.length, basis: 'counted_from_shots' as const };
  if (values.length < PATTERN_MIN_SHOTS) return { ...base, value: null, not_traced: `needs ${PATTERN_MIN_SHOTS} ${needs}; ${values.length} so far` };
  return { ...base, value: r4(values.reduce((a, b) => a + b, 0) / values.length) };
}

/**
 * The share of misses to each side, over the misses that have a side recorded. Not traced when there are too few
 * misses or the side is recorded on too few of them.
 */
function missSides(misses: readonly ShotRow[], sides: readonly string[], what: string): PatternFact[] {
  const recorded = misses.filter((s) => sides.some((side) => lower(s.miss_direction).includes(side)));
  const coverage = misses.length ? recorded.length / misses.length : 0;
  return sides.map((side): PatternFact => {
    const count = recorded.filter((s) => lower(s.miss_direction).includes(side)).length;
    const base = { id: `missed_${side}`, label: `${what} missed ${side}, of the misses with a side recorded`, unit: 'percent' as const, count, of: recorded.length, basis: 'counted_from_shots' as const };
    if (misses.length < PATTERN_MIN_SHOTS) return { ...base, value: null, not_traced: `needs ${PATTERN_MIN_SHOTS} misses; ${misses.length} so far` };
    if (coverage < MISS_SIDE_MIN_COVERAGE) return { ...base, value: null, not_traced: `the miss side is recorded on ${recorded.length} of ${misses.length} misses` };
    return share(base.id, base.label, count, recorded.length, 'misses with a side recorded');
  });
}

interface BandShots {
  shots: ShotRow[];
  /** Putting only: for each hole whose FIRST putt started in this band, how many putts the hole took. */
  firstPuttHoles: number[];
}

function patternsFor(area: AreaId, b: BandShots, areaShots: number): PatternFact[] {
  const shots = b.shots.filter((s) => !isPenalty(s));
  switch (area) {
    case 'strokes_gained_approach': {
      const leaves = shots.flatMap((s) => (leaveFeet(s) == null ? [] : [leaveFeet(s) as number]));
      return [
        share('green_hit', 'approaches that finished on the green', shots.filter(onGreen).length, shots.length, 'approaches'),
        meanFeet('proximity', 'average distance from the hole after the approach', leaves, 'approaches with a finish recorded'),
        ...missSides(shots.filter((s) => !onGreen(s)), ['short', 'long', 'left', 'right'], 'approaches'),
        share('from_rough', 'approaches played from the rough', shots.filter((s) => sgNormalizeLie(s.lie_before) === 'rough').length, shots.length, 'approaches'),
      ];
    }
    case 'strokes_gained_putting': {
      const missed = shots.filter((s) => !isPuttMade(s));
      const leaves = missed.flatMap((s) => (leaveFeet(s) == null ? [] : [leaveFeet(s) as number]));
      return [
        share('made', 'putts made', shots.length - missed.length, shots.length, 'putts'),
        share('three_putt', 'holes with three or more putts, of the holes whose first putt started here', b.firstPuttHoles.filter((n) => n >= 3).length, b.firstPuttHoles.length, 'first putts'),
        meanFeet('leave_after_miss', 'average distance left after a missed putt', leaves, 'missed putts with the leave recorded'),
        ...missSides(missed, ['short', 'long', 'low', 'high'], 'putts'),
      ];
    }
    case 'strokes_gained_off_the_tee':
      return [
        share('share_of_tee_shots', 'share of all tee shots', shots.length, areaShots, 'tee shots'),
        share('with_driver', 'of these, hit with the driver', shots.filter((s) => lower(s.club_type) === 'driver').length, shots.filter((s) => s.club_type != null).length, 'tee shots with the club recorded'),
      ];
    case 'strokes_gained_around_the_green': {
      const leaves = shots.flatMap((s) => (leaveFeet(s) == null ? [] : [leaveFeet(s) as number]));
      return [
        share('on_green', 'shots that finished on the green', shots.filter(onGreen).length, shots.length, 'shots'),
        meanFeet('proximity', 'average distance from the hole after the shot', leaves, 'shots with a finish recorded'),
        share('inside_6_feet', 'shots that finished inside 6 feet', leaves.filter((ft) => ft <= 6).length, leaves.length, 'shots with a finish recorded'),
      ];
    }
  }
}

// ── The breakdown ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface BreakdownInput {
  /** The season's rounds measured from logged shots, newest first. */
  rounds: readonly CountedRound[];
  shotsByRound: ReadonlyMap<string, readonly ShotRow[]>;
  holesByRound: ReadonlyMap<string, readonly HoleRow[]>;
  /** The strokes-gained baseline's scale: 1 for the Tour curve, 1.083 for a women's team. */
  scale: number;
}

/** The four areas, each split into its bands over the season's measured rounds. */
export function areaBreakdowns(input: BreakdownInput): AreaBreakdown[] {
  const perArea = new Map<AreaId, { rounds: AreaBreakdown['rounds']; bands: Map<string, BandShots>; shots: number }>(
    STROKES_GAINED_AREA_IDS.map((id) => [id, { rounds: [], bands: new Map(BANDS[id].map((b) => [b.id, { shots: [], firstPuttHoles: [] }])), shots: 0 }]),
  );

  for (const round of input.rounds) {
    const shots = input.shotsByRound.get(round.id) ?? [];
    const par = new Map((input.holesByRound.get(round.id) ?? []).flatMap((h) => (typeof h.par === 'number' ? [[h.id, h.par] as const] : [])));
    const byId = new Map(shots.map((s) => [s.id, s]));
    const sums = new Map<AreaId, { sg: Record<string, number>; n: Record<string, number> }>(
      STROKES_GAINED_AREA_IDS.map((id) => [id, { sg: Object.fromEntries(BANDS[id].map((b) => [b.id, 0])), n: Object.fromEntries(BANDS[id].map((b) => [b.id, 0])) }]),
    );
    for (const v of shotSgForRound(shots.map(rawShot), par, input.scale)) {
      const shot = byId.get(v.shotId)!;
      const area = AREA_OF[v.category];
      const band = bandOf(area, shot, shot.hole_id ? (par.get(shot.hole_id) ?? null) : null);
      if (!band) continue;
      const cell = sums.get(area)!;
      cell.sg[band] = (cell.sg[band] ?? 0) + v.sg;
      cell.n[band] = (cell.n[band] ?? 0) + 1;
      const acc = perArea.get(area)!;
      acc.bands.get(band)?.shots.push(shot);
      if (!isPenalty(shot)) acc.shots += 1;
    }
    // The first putt of each hole, and how many putts the hole took.
    const putts = new Map<string, ShotRow[]>();
    for (const s of shots) if (s.shot_type === 'putting' && s.hole_id) putts.set(s.hole_id, [...(putts.get(s.hole_id) ?? []), s]);
    for (const list of putts.values()) {
      const first = [...list].sort((a, b) => (a.shot_number ?? 0) - (b.shot_number ?? 0))[0]!;
      const band = bandOf('strokes_gained_putting', first, null);
      if (band) perArea.get('strokes_gained_putting')!.bands.get(band)?.firstPuttHoles.push(list.length);
    }
    for (const id of STROKES_GAINED_AREA_IDS) {
      const cell = sums.get(id)!;
      perArea.get(id)!.rounds.push({
        round_id: round.id,
        date: round.round_date.slice(0, 10),
        strokes_gained: Object.fromEntries(Object.entries(cell.sg).map(([k, v]) => [k, r4(v)])),
        shots: cell.n,
      });
    }
  }

  return STROKES_GAINED_AREA_IDS.map((id): AreaBreakdown => {
    const acc = perArea.get(id)!;
    const bands = BANDS[id].map((def): BandFact => {
      const b = acc.bands.get(def.id)!;
      const perRound = acc.rounds.map((r) => r.strokes_gained[def.id] ?? 0);
      const s = meanSummary(perRound);
      const range = s && s.se != null && s.df != null ? tRange95(s.mean, s.se, s.df) : null;
      return {
        band: def.id,
        label: def.label,
        shots: b.shots.length,
        rounds: acc.rounds.filter((r) => (r.shots[def.id] ?? 0) > 0).length,
        strokes_gained_per_round: s && b.shots.length > 0 ? { value: r4(s.mean), low: range ? r4(range.low) : null, high: range ? r4(range.high) : null } : null,
        strokes_gained_per_shot: b.shots.length ? r4(perRound.reduce((a, v) => a + v, 0) / b.shots.length) : null,
        patterns: patternsFor(id, b, acc.shots),
      };
    });
    // The whole area's patterns, for when no one band stands out. A lay-up is left out: it is neither a hit nor a miss.
    const pooled: BandShots = {
      shots: BANDS[id].filter((d) => d.id !== 'layup').flatMap((d) => acc.bands.get(d.id)!.shots),
      firstPuttHoles: BANDS[id].flatMap((d) => acc.bands.get(d.id)!.firstPuttHoles),
    };
    // Each band's headline rate rides along under the band's name, so "which distance" can be said even when the
    // strokes are not concentrated in one band.
    const headline = HEADLINE[id];
    const perBand = bands.flatMap((b) => {
      const p = b.band === 'layup' ? undefined : b.patterns.find((x) => x.id === headline);
      return p ? [{ ...p, id: `${headline}_${b.band}`, label: `${p.label}: ${b.label}` }] : [];
    });
    return { area_measure_id: id, window: 'season', measured_rounds: acc.rounds.length, rounds: acc.rounds, bands, overall: [...patternsFor(id, pooled, acc.shots), ...perBand] };
  });
}

/** Each pattern's median over the teammates who have it traced, attached to the player's own patterns (leave-one-out). */
export function withTeamMedians(mine: readonly AreaBreakdown[], teammates: readonly (readonly AreaBreakdown[])[]): AreaBreakdown[] {
  const median = (values: number[]): number | null => {
    if (!values.length) return null;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  };
  const withTeam = (p: PatternFact, theirs: (area: AreaBreakdown) => readonly PatternFact[] | undefined, areaId: string): PatternFact => {
    const values = teammates.flatMap((t) => {
      const area = t.find((a) => a.area_measure_id === areaId);
      const v = area ? theirs(area)?.find((x) => x.id === p.id)?.value : null;
      return v == null ? [] : [v];
    });
    const med = median(values);
    return { ...p, team: { audience: 'coach_only' as const, median: med == null ? null : r4(med), teammates: values.length } };
  };
  return mine.map((area) => ({
    ...area,
    overall: area.overall.map((p) => withTeam(p, (a) => a.overall, area.area_measure_id)),
    bands: area.bands.map((band) => ({
      ...band,
      patterns: band.patterns.map((p) => withTeam(p, (a) => a.bands.find((b) => b.band === band.band)?.patterns, area.area_measure_id)),
    })),
  }));
}
