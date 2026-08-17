/**
 * ============================================================================
 * buildRoundStatReport — the pure view model behind the single-round stat report
 * ----------------------------------------------------------------------------
 * Owner report (2026-08-15), verbatim: "If you filter to a round, it shouldn't
 * be that blob of stats it should just show you in a very formal professional
 * way good transition what each stat category was and the details or sample
 * size for each, this should be in the round review as well."
 *
 * So: five categories in the order a hole is actually played — Scoring, Off the
 * tee, Approach, Short game, Putting — each with a header, a category-level
 * denominator ("38 putts · 18 holes"), and a per-metric sample size wherever
 * the calculator exposes an exact one.
 *
 * THE SAMPLE-SIZE RULE. `n` is only ever set from a field that is literally the
 * denominator of the figure beside it. Where `GolfStats` exposes no such field,
 * `n` is null and the metric renders without one — the missing ones are named
 * in `unsampledNote` rather than estimated. Two specific temptations are
 * refused here:
 *
 *   - Putt make% at 20ft and beyond has no top-level count. `PuttingDrill`
 *     falls back to summing the four break-type cells; that undercounts every
 *     putt whose `putt_break` is null. In a report whose entire point is the
 *     sample size, a quietly-wrong n is worse than none.
 *   - `girPctFromSand` has no `girCountFromSand` sibling (fairway and rough
 *     both do). It renders unsampled rather than borrowing a neighbour's n.
 *
 * A per-metric n is also omitted where it would merely repeat the category
 * header — "n=18 holes" under all ten scoring figures is noise, and the
 * header already says 18 holes. It is kept wherever it differs (par-3 avg
 * over par-3 holes, putts/GIR over greens hit, every make band over its own
 * putt count).
 *
 * NOTHING IS RECOMPUTED HERE. Every number is a field `getDetailedStats(
 * playerId, roundId)` already returns; this file only formats and groups them.
 * Strokes gained is deliberately absent — SG is served from
 * `golf_player_stats_cache` (see .claude/rules/golf-review.md), and Round
 * Review already renders it from that cache via `RoundSGSummary`. Rendering
 * the calculator's recomputed SG here would put a second, potentially
 * disagreeing read path on the same screen.
 * ========================================================================== */

import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

/** One figure in a category grid. All copy is decided here, not in the view. */
export interface RoundReportMetric {
  label: string;
  /** Preformatted figure, or null when this round produced no sample for it. */
  display: string | null;
  /**
   * Exact number of observations behind `display`, or null when `GolfStats`
   * exposes no denominator for this figure. Never derived, never approximated.
   */
  n: number | null;
  /** Sample line under the figure ("n=20 putts"), or null when `n` is null. */
  note: string | null;
  /** Awaiting-state copy, shown in place of the figure when `display` is null. */
  awaitingLabel: string;
}

export interface RoundReportSection {
  id: string;
  title: string;
  /** Category-level denominator, e.g. "38 putts · 18 holes". */
  scope: string | null;
  /** One line on what the category measures. */
  blurb: string;
  metrics: RoundReportMetric[];
  /** True when at least one metric produced a real figure. */
  hasSignal: boolean;
  /** Shown instead of the grid when `hasSignal` is false. */
  emptyLine: string;
}

export interface RoundBreakCell {
  display: string;
  n: number;
}

export interface RoundBreakRow {
  label: string;
  /** One cell per column, null where that break/distance pair had no putts. */
  cells: Array<RoundBreakCell | null>;
}

/**
 * Make % by distance × break.
 *
 * The coach asked for this on 2026-08-13 and `RoundStatsPanel` shipped a footer
 * saying "there is no make-rate-by-break calculation to read from yet". That
 * was wrong: `GolfStats.puttingByBreak` carries `makePct0_3…makePct35Plus`,
 * `overallMakePct` and a `count*` for every cell, and `PuttingDrill` has been
 * rendering exactly this matrix on the stats page the whole time. It is also
 * the best-sampled thing in the report, because every single cell arrives with
 * its own exact n.
 */
export interface RoundBreakMatrix {
  cols: string[];
  rows: RoundBreakRow[];
  /** Per-break overall make rate, for the summary row under the matrix. */
  overall: Array<{ label: string; display: string | null; n: number }>;
}

export interface RoundStatReport {
  sections: RoundReportSection[];
  breakMatrix: RoundBreakMatrix | null;
  holesPlayed: number;
  /** True when the round produced no measurable stat at all (scorecard only). */
  isEmpty: boolean;
  /** Names the figures above that carry no sample size, and why. */
  unsampledNote: string;
}

/* -------------------------------------------------------------------------- */
/* formatting                                                                  */
/* -------------------------------------------------------------------------- */

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

const pct = (v: number) => `${Math.round(v)}%`;
const two = (v: number) => v.toFixed(2);
const whole = (v: number) => String(Math.round(v));
const feet = (v: number) => `${v.toFixed(1)} ft`;
const yards = (v: number) => `${Math.round(v)} y`;

/** Per-hole scoring average, which is a fraction. */
function toParFraction(v: number): string {
  if (Math.abs(v) < 0.005) return 'E';
  // U+2212 MINUS SIGN, not a hyphen — matches the other golf score surfaces.
  return v > 0 ? `+${v.toFixed(2)}` : `−${Math.abs(v).toFixed(2)}`;
}

/** Round-level to-par, which is a whole number in every real scorecard. */
function toParTotal(v: number): string {
  if (Math.abs(v) < 0.005) return 'E';
  if (Math.abs(v - Math.round(v)) >= 0.005) return toParFraction(v);
  const r = Math.round(v);
  return r > 0 ? `+${r}` : `−${Math.abs(r)}`;
}

/**
 * Singularise a plural noun for an n=1 sample line — "1 putts" reads as a bug.
 * Covers the shapes actually used below (`opportunities`, `tee misses`,
 * `attempts`, `holes`, …); anything unrecognised is left untouched, which is
 * the safe failure (a slightly-off word, never a wrong number).
 */
function singularise(noun: string): string {
  if (noun.endsWith('ies')) return `${noun.slice(0, -3)}y`;
  if (/(?:s|sh|ch|x)es$/.test(noun)) return noun.slice(0, -2);
  if (noun.endsWith('s')) return noun.slice(0, -1);
  return noun;
}

function plural(n: number, noun: string): string {
  return `${n} ${n === 1 ? singularise(noun) : noun}`;
}

interface Sample {
  n: number;
  noun: string;
}

/**
 * Gate a RAW COUNT on whether anything was observed at all.
 *
 * Rates arrive from the calculator already null when there is no sample
 * (`safePercent`/`safeAverage` return null on a zero denominator), but counts
 * do not: `totalBirdies`, `totalPutts`, `threePuttsTotal` and friends are
 * plain integers that sit at 0 both for "none happened" and for "nothing was
 * logged". Rendering the second as `0` is precisely the fabricated zero
 * .claude/rules/golf-review.md forbids — a scorecard-only round would have
 * claimed 0 birdies, 0 pars and 0 putts with equal confidence.
 */
function observed(condition: boolean, value: number): number | null {
  return condition ? value : null;
}

function metric(
  label: string,
  value: number | null | undefined,
  fmt: (v: number) => string,
  sample?: Sample,
): RoundReportMetric {
  const v = finite(value);
  const display = v === null ? null : fmt(v);
  if (!sample) {
    return { label, display, n: null, note: null, awaitingLabel: 'No sample' };
  }
  return {
    label,
    display,
    n: sample.n,
    note: `n=${plural(sample.n, sample.noun)}`,
    awaitingLabel: sample.n === 0 ? `No ${sample.noun}` : `${plural(sample.n, sample.noun)}, no reading`,
  };
}

/**
 * A conversion rate where the calculator exposes BOTH halves — the note can
 * then read "12 of 14 fairways", which is strictly more than an n= line.
 */
function ratioMetric(label: string, made: number, total: number, noun: string): RoundReportMetric {
  const display = total > 0 ? pct((made / total) * 100) : null;
  return {
    label,
    display,
    n: total,
    // "0 of 0 fairways" is not a sample line, it is a shrug — the awaiting
    // state says the same thing in words.
    note: total > 0 ? `${made} of ${plural(total, noun)}` : null,
    awaitingLabel: `No ${noun}`,
  };
}

function section(
  id: string,
  title: string,
  scope: string | null,
  blurb: string,
  emptyLine: string,
  metrics: RoundReportMetric[],
): RoundReportSection {
  return {
    id,
    title,
    scope,
    blurb,
    metrics,
    hasSignal: metrics.some((m) => m.display !== null),
    emptyLine,
  };
}

/* -------------------------------------------------------------------------- */
/* break matrix                                                                */
/* -------------------------------------------------------------------------- */

const BREAK_COLS: ReadonlyArray<{ label: string; key: keyof GolfStats['puttingByBreak'] }> = [
  { label: 'L → R', key: 'left_to_right' },
  { label: 'Straight', key: 'straight' },
  { label: 'R → L', key: 'right_to_left' },
  { label: 'Multiple', key: 'multiple' },
];

type BreakStats = GolfStats['puttingByBreak']['straight'];

const BREAK_BANDS: ReadonlyArray<{
  label: string;
  pctField: keyof BreakStats;
  countField: keyof BreakStats;
}> = [
  { label: '0-3ft', pctField: 'makePct0_3', countField: 'count0_3' },
  { label: '3-5ft', pctField: 'makePct3_5', countField: 'count3_5' },
  { label: '5-10ft', pctField: 'makePct5_10', countField: 'count5_10' },
  { label: '10-15ft', pctField: 'makePct10_15', countField: 'count10_15' },
  { label: '15-20ft', pctField: 'makePct15_20', countField: 'count15_20' },
  { label: '20-25ft', pctField: 'makePct20_25', countField: 'count20_25' },
  { label: '25-30ft', pctField: 'makePct25_30', countField: 'count25_30' },
  { label: '30-35ft', pctField: 'makePct30_35', countField: 'count30_35' },
  { label: '35+ft', pctField: 'makePct35Plus', countField: 'count35Plus' },
];

/** Reads a numeric field off a break cell without an unsafe cast. */
function numberAt(breakStats: BreakStats | undefined, field: keyof BreakStats): number | null {
  const v = breakStats?.[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function buildBreakMatrix(byBreak: GolfStats['puttingByBreak'] | undefined): RoundBreakMatrix | null {
  if (!byBreak) return null;

  const rows: RoundBreakRow[] = [];
  for (const band of BREAK_BANDS) {
    const cells = BREAK_COLS.map((col): RoundBreakCell | null => {
      const n = numberAt(byBreak[col.key], band.countField) ?? 0;
      if (n <= 0) return null;
      const p = numberAt(byBreak[col.key], band.pctField);
      return { display: p === null ? '—' : pct(p), n };
    });
    // A distance band nobody putted from is dropped rather than rendered as a
    // row of blanks — one round rarely fills all nine.
    if (cells.some((c) => c !== null)) rows.push({ label: band.label, cells });
  }

  if (rows.length === 0) return null;

  return {
    cols: BREAK_COLS.map((c) => c.label),
    rows,
    overall: BREAK_COLS.map((col) => {
      const p = numberAt(byBreak[col.key], 'overallMakePct');
      return {
        label: col.label,
        display: p === null ? null : pct(p),
        n: numberAt(byBreak[col.key], 'totalPutts') ?? 0,
      };
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* the report                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Named in the footer so a coach can tell "we don't track how many" apart from
 * "this round had none". Every entry was checked against the `GolfStats`
 * interface — none of these has a count field anywhere on the type.
 */
const UNSAMPLED_NOTE =
  'Proximity, driving distance, per-distance GIR and around-the-green figures carry no sample ' +
  'size — the calculator exposes no count for them, and one has not been estimated here. The ' +
  'same applies to GIR from sand (fairway and rough each report a count; sand does not) and to ' +
  'putt make rate from 20ft and beyond.';

export function buildRoundStatReport(stats: GolfStats | null | undefined): RoundStatReport | null {
  if (!stats) return null;

  const s = stats;
  const holes = s.holesPlayed;
  const holeScope = holes > 0 ? plural(holes, 'holes') : null;

  /* --- Scoring — the outcome the other four categories explain ------------ */
  const scoring = section(
    'scoring',
    'Scoring',
    holeScope,
    'What the round cost, and which hole types it cost it on.',
    'No holes with a recorded score.',
    [
      metric('Score', s.scoringAverage, whole),
      metric('To par', s.avgScoreToPar, toParTotal),
      metric('Birdies', observed(holes > 0, s.totalBirdies), whole),
      metric('Pars', observed(holes > 0, s.totalPars), whole),
      metric('Bogeys', observed(holes > 0, s.totalBogeys), whole),
      metric('Double+', observed(holes > 0, s.totalDoublePlus), whole),
      metric('Penalties', observed(holes > 0, s.totalPenalties), whole),
      metric('Par 3 avg', s.scoringByPar.par3.avgToPar, toParFraction, {
        n: s.scoringByPar.par3.total,
        noun: 'holes',
      }),
      metric('Par 4 avg', s.scoringByPar.par4.avgToPar, toParFraction, {
        n: s.scoringByPar.par4.total,
        noun: 'holes',
      }),
      metric('Par 5 avg', s.scoringByPar.par5.avgToPar, toParFraction, {
        n: s.scoringByPar.par5.total,
        noun: 'holes',
      }),
    ],
  );

  /* --- Off the tee -------------------------------------------------------- */
  const teeMisses = s.missLeftCount + s.missRightCount;
  const tee = section(
    'tee',
    'Off the tee',
    s.fairwayOpportunities > 0 ? plural(s.fairwayOpportunities, 'fairway opportunities') : null,
    'Fairways found on par 4s and 5s, how far the tee ball went, and which way it missed.',
    'No par 4 or par 5 tee shots were logged for this round.',
    [
      ratioMetric('Fairways hit', s.fairwaysHit, s.fairwayOpportunities, 'fairways'),
      metric('FW % par 4', s.fairwayPctPar4, pct),
      metric('FW % par 5', s.fairwayPctPar5, pct),
      metric('Driving distance', s.drivingDistanceAvg, yards),
      metric('Driver only', s.drivingDistanceDriverOnly, yards),
      metric('Non-driver', s.drivingDistanceNonDriverOnly, yards),
      metric('Miss left', s.missLeftPct, pct, { n: teeMisses, noun: 'tee misses' }),
      metric('Miss right', s.missRightPct, pct, { n: teeMisses, noun: 'tee misses' }),
    ],
  );

  /* --- Approach ----------------------------------------------------------- */
  const approach = section(
    'approach',
    'Approach',
    s.girOpportunities > 0 ? plural(s.girOpportunities, 'approach shots') : null,
    'Greens hit in regulation, how close the ball finished, and where the misses went.',
    'No approach shots were logged for this round.',
    [
      ratioMetric('GIR', s.girTotal, s.girOpportunities, 'greens'),
      metric('GIR par 3', s.girPctPar3, pct, { n: s.scoringByPar.par3.total, noun: 'holes' }),
      metric('GIR par 4', s.girPctPar4, pct, { n: s.scoringByPar.par4.total, noun: 'holes' }),
      metric('GIR par 5', s.girPctPar5, pct, { n: s.scoringByPar.par5.total, noun: 'holes' }),
      metric('From fairway', s.girPctFromFairway, pct, { n: s.girCountFromFairway, noun: 'approach shots' }),
      metric('From rough', s.girPctFromRough, pct, { n: s.girCountFromRough, noun: 'approach shots' }),
      // No `girCountFromSand` exists — deliberately unsampled, see UNSAMPLED_NOTE.
      metric('From sand', s.girPctFromSand, pct),
      metric('Proximity (all)', s.approachProximityAvg, feet),
      metric('Proximity — hit', s.approachProximityWhenHitGreen, feet),
      metric('Proximity — missed', s.approachProximityWhenMissedGreen, feet),
      metric('Prox. from fairway', s.approachProximityFairway, feet),
      metric('Prox. from rough', s.approachProximityRough, feet),
      metric('Miss short', s.approachMissShortPct, pct, { n: s.approachMissTotal, noun: 'missed greens' }),
      metric('Miss long', s.approachMissLongPct, pct, { n: s.approachMissTotal, noun: 'missed greens' }),
      metric('Miss left', s.approachMissLeftPct, pct, { n: s.approachMissTotal, noun: 'missed greens' }),
      metric('Miss right', s.approachMissRightPct, pct, { n: s.approachMissTotal, noun: 'missed greens' }),
    ],
  );

  /* --- Short game --------------------------------------------------------- */
  const shortGame = section(
    'short-game',
    'Short game',
    s.scrambleAttempts > 0 ? plural(s.scrambleAttempts, 'up-and-down attempts') : null,
    'Getting up and down after missing the green, split by the lie it was played from.',
    'No up-and-down attempts were logged for this round.',
    [
      ratioMetric('Scrambling', s.scramblesMade, s.scrambleAttempts, 'attempts'),
      metric('From fairway', s.scramblingPctFairway, pct, { n: s.scrambleFairwayAttempts, noun: 'attempts' }),
      metric('From rough', s.scramblingPctRough, pct, { n: s.scrambleRoughAttempts, noun: 'attempts' }),
      metric('From fringe', s.scramblingPctFringe, pct, { n: s.scrambleFringeAttempts, noun: 'attempts' }),
      metric('From sand', s.scramblingPctSand, pct, { n: s.scrambleSandAttempts, noun: 'attempts' }),
      ratioMetric('Sand saves', s.sandSavesMade, s.sandSaveAttempts, 'bunker shots'),
      metric('Chip proximity', s.atgProximityAvg, feet),
      metric('Chip efficiency', s.atgEfficiencyAvg, two),
    ],
  );

  /* --- Putting ------------------------------------------------------------ */
  const hasPutts = s.totalPutts > 0;
  const puttScope = [hasPutts ? plural(s.totalPutts, 'putts') : null, holeScope].filter(
    (part): part is string => part !== null,
  );
  const putting = section(
    'putting',
    'Putting',
    puttScope.length > 0 ? puttScope.join(' · ') : null,
    'Make rate by distance, how many strokes it took, and where the first putt was left.',
    'No putts were logged for this round.',
    [
      // Gated on a putt actually having been logged, not on holes played: a
      // scorecard-only round still reports 18 holes, and `puttsPerHole` would
      // hand back a confident 0.00 for a round nobody recorded a putt in.
      metric('Putts', observed(hasPutts, s.totalPutts), whole),
      metric('Putts / hole', hasPutts ? s.puttsPerHole : null, two),
      metric('Putts / GIR', hasPutts ? s.puttsPerGir : null, two, { n: s.girTotal, noun: 'greens hit' }),
      metric('3-putts', observed(hasPutts, s.threePuttsTotal), whole),
      metric('1-putts', observed(hasPutts, s.onePuttsTotal), whole),
      metric('Make 0-3ft', s.puttMakePct0_3, pct, { n: s.puttMakeCount0_3, noun: 'putts' }),
      metric('Make 3-5ft', s.puttMakePct3_5, pct, { n: s.puttMakeCount3_5, noun: 'putts' }),
      metric('Make 5-10ft', s.puttMakePct5_10, pct, { n: s.puttMakeCount5_10, noun: 'putts' }),
      metric('Make 10-15ft', s.puttMakePct10_15, pct, { n: s.puttMakeCount10_15, noun: 'putts' }),
      metric('Make 15-20ft', s.puttMakePct15_20, pct, { n: s.puttMakeCount15_20, noun: 'putts' }),
      // 20ft and beyond: no top-level count field, so no n — see the header
      // note on why the break-sum fallback is refused here.
      metric('Make 20-25ft', s.puttMakePct20_25, pct),
      metric('Make 25-30ft', s.puttMakePct25_30, pct),
      metric('Make 30-35ft', s.puttMakePct30_35, pct),
      metric('Make 35ft+', s.puttMakePct35Plus, pct),
      metric('First putt from', s.firstPuttDistanceAvg, feet),
      metric('Avg leave', s.approachPuttAvgLeave, feet),
      metric('Miss short', s.puttMissShortPct, pct),
      metric('Miss long', s.puttMissLongPct, pct),
    ],
  );

  const sections = [scoring, tee, approach, shortGame, putting];
  const breakMatrix = buildBreakMatrix(s.puttingByBreak);

  return {
    sections,
    breakMatrix,
    holesPlayed: holes,
    isEmpty: sections.every((sec) => !sec.hasSignal) && breakMatrix === null,
    unsampledNote: UNSAMPLED_NOTE,
  };
}
