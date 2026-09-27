/**
 * The golf number rule (design-direction §5.2): one registry, one formatter.
 *
 * Every golf number a screen prints should come from `formatMetric(id, value,
 * ctx)`. The registry holds one entry per metric: its label, kind (which sets
 * precision, sign and unit), polarity (which way is better), minimum sample
 * and default window. Surfaces then agree on decimals, signs, units, tone and
 * the missing-value glyph because none of them decides those locally.
 *
 * Conventions:
 *   - Missing (`null`, `undefined`, `NaN`, `±Infinity`) prints "—".
 *   - Signed quantities (to par, strokes gained, deltas) always carry a sign:
 *     "+" or the true minus "−" (U+2212), never the ASCII hyphen. A value
 *     that ROUNDS to zero has no sign (no "−0.00"); to par prints "E".
 *   - Tone comes from polarity × sign, and only signed or delta values are
 *     toned. Plain values ("72.8", "48%") are ink.
 *   - Strokes gained: positive = strokes gained on the baseline, so higher is
 *     better and "+1.98" is good.
 *   - Percentages are stored 0–100. A metric whose source stores a 0–1
 *     fraction says so with `percentScale: 'fraction'`; nothing guesses the
 *     scale from the value (a real 0.8% would read as 80%).
 *   - Read quality: sample < floor prints no number ("Needs N more"),
 *     floor ≤ sample < 2 × floor is an "Early read", otherwise solid.
 *     Confidence is never printed as a percentage.
 *   - Figures render in tabular numerals (`METRIC_NUMERAL_CLASS`).
 *
 * Relationship to the older helpers: `formatToPar` (format-to-par.ts) and
 * `formatScoringAverage` (format-scoring-average.ts) already follow this rule
 * for their kinds; display-registry.test.ts pins that `formatMetric` agrees
 * with both, so call sites can move over without a visible change.
 *
 * Metric ids reuse the v3 insight ids (`src/lib/coachhelm/v3/metrics/
 * registry.ts`) where one exists, so an insight and a stat tile name the same
 * metric the same way, and polarity for those ids is read from that registry.
 *
 * Pure: no React, no Supabase. Safe on server and client.
 */

import { METRIC_IDS, getMetricDirection, type MetricId as V3MetricId } from '@/lib/coachhelm/v3/metrics/registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How a metric prints: precision, sign and unit follow from the kind. */
export type MetricKind =
  /** One round's gross score: integer. "73" */
  | 'score'
  /** One round's score to par: signed integer, "E" at 0. "+1 · −2 · E" */
  | 'to_par'
  /** A mean gross score: 1 dp. "72.8" */
  | 'scoring_average'
  /** A mean score to par: signed 1 dp, "E" at 0. "+0.8" */
  | 'to_par_average'
  /** Average strokes on one hole type: 2 dp. "3.27" */
  | 'hole_average'
  /** Strokes gained per round or per shot: signed 2 dp. "+1.98" */
  | 'strokes_gained'
  /** A strokes delta (impact, gap): signed 1 dp. "−0.4" */
  | 'strokes_delta'
  /** Percentage 0–100: integer, no space. "48%" */
  | 'percent'
  /** A per-round rate: 1 dp. "32.9" */
  | 'per_round'
  /** Distance: integer, space, unit. "175 yd" */
  | 'distance'
  /** A count: integer with a noun. "21 rounds" */
  | 'count';

export type MetricPolarity = 'higher' | 'lower' | 'none';

export type MetricUnit = 'strokes' | 'percent' | 'yd' | 'ft' | 'count' | 'none';

export type MetricWindow =
  | 'all_time'
  | 'season'
  | 'last_5_rounds'
  | 'last_10_rounds'
  | 'last_30_days'
  | 'last_90_days';

export type MetricTone = 'good' | 'bad' | 'neutral';

/** `insufficient` prints no number; `early` prints it in secondary ink. */
export type ReadQuality = 'insufficient' | 'early' | 'solid';

export interface MetricDefinition {
  id: string;
  /** Canonical label, sentence case as printed ("Scoring average"). */
  label: string;
  /** Short label for tight rows ("Scoring avg"). Falls back to `label`. */
  shortLabel?: string;
  kind: MetricKind;
  unit: MetricUnit;
  polarity: MetricPolarity;
  /** Minimum sample (rounds, attempts) before a number is printed. */
  floor: number;
  /** The noun the sample counts, singular and plural. */
  sampleNoun: readonly [string, string];
  /** Window the value is computed over when the loader does not say. */
  defaultWindow: MetricWindow;
  /** Storage scale for percentages. Default 'percent' (0–100). */
  percentScale?: 'percent' | 'fraction';
  /** For `count`: the noun printed after the number. */
  countNoun?: readonly [string, string];
  /** Fixed suffix after the number (" a round" for strokes impact). */
  suffix?: string;
  /** Where the canonical value comes from (loader or pure helper). */
  source: string;
}

export interface FormatMetricContext {
  /** Sample behind the value (rounds, attempts). Drives read quality. */
  sample?: number | null;
  /** The window the value was computed over. */
  window?: MetricWindow;
  /** The screen's stated default window; a chip shows only when they differ. */
  screenWindow?: MetricWindow;
  /** The value is a change (current − previous): always signed and toned. */
  delta?: boolean;
  /** Override the registry floor (a surface with a stricter read rule). */
  floor?: number;
}

export interface FormattedMetric {
  id: string;
  label: string;
  /** Full display string: sign + number + unit, or "—". */
  text: string;
  /** "+", "−" or "" (no sign). */
  sign: '+' | '−' | '';
  /** The digits alone, no sign or unit ("0.83", "48", "E", "—"). */
  number: string;
  /** Unit suffix as printed after the number ("%", " yd", " rounds", ""). */
  unitSuffix: string;
  tone: MetricTone;
  /** True when there is no number to print (missing or below the floor). */
  missing: boolean;
  /** `null` when the caller passed no sample. */
  readQuality: ReadQuality | null;
  /** How many more samples until a number prints; `null` when not short. */
  needsMore: number | null;
  /** "Needs 3 more rounds" / "Early read" / null. */
  qualityNote: string | null;
  /** Window chip text ("Last 90 days") when it differs from the screen's. */
  windowChip: string | null;
  /** Screen-reader text: "Strokes gained: putting, minus 0.83". */
  ariaLabel: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The true minus sign. Never the ASCII hyphen-minus in a golf number. */
export const MINUS = '−';
/** The missing-value glyph (em dash). */
export const MISSING = '—';
/** Class every printed metric figure carries (SF tabular numerals). */
export const METRIC_NUMERAL_CLASS = 'tabular-nums';

export const WINDOW_LABELS: Record<MetricWindow, string> = {
  all_time: 'All time',
  season: 'Season to date',
  last_5_rounds: 'Last 5 rounds',
  last_10_rounds: 'Last 10 rounds',
  last_30_days: 'Last 30 days',
  last_90_days: 'Last 90 days',
};

const KIND_PRECISION: Record<MetricKind, number> = {
  score: 0,
  to_par: 0,
  scoring_average: 1,
  to_par_average: 1,
  hole_average: 2,
  strokes_gained: 2,
  strokes_delta: 1,
  percent: 0,
  per_round: 1,
  distance: 0,
  count: 0,
};

/** Kinds that always print a sign and carry a tone. */
const SIGNED_KINDS: ReadonlySet<MetricKind> = new Set<MetricKind>([
  'to_par',
  'to_par_average',
  'strokes_gained',
  'strokes_delta',
]);

/** Kinds whose zero prints "E" (level par). */
const EVEN_PAR_KINDS: ReadonlySet<MetricKind> = new Set<MetricKind>(['to_par', 'to_par_average']);

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const ROUNDS: readonly [string, string] = ['round', 'rounds'];
const PUTTS: readonly [string, string] = ['putt', 'putts'];
const ATTEMPTS: readonly [string, string] = ['attempt', 'attempts'];
const SHOTS: readonly [string, string] = ['shot', 'shots'];
const HOLES: readonly [string, string] = ['hole', 'holes'];

const CACHE = 'golf_player_stats_cache';
const COUNTABLE = 'aggregateCountableRounds (src/lib/golf/countable-round-stats.ts)';

function def(d: Omit<MetricDefinition, 'sampleNoun'> & { sampleNoun?: readonly [string, string] }): MetricDefinition {
  return { sampleNoun: ROUNDS, ...d };
}

/** Headline and stat-page metrics that are not v3 insight ids. */
const CORE_METRICS: MetricDefinition[] = [
  def({ id: 'round_score', label: 'Score', kind: 'score', unit: 'strokes', polarity: 'lower', floor: 1, defaultWindow: 'all_time', source: 'deriveRoundTotal (round-total.ts)' }),
  def({ id: 'round_to_par', label: 'To par', kind: 'to_par', unit: 'strokes', polarity: 'lower', floor: 1, defaultWindow: 'all_time', source: 'golf_rounds.score_to_par' }),
  def({ id: 'scoring_average', label: 'Scoring average', shortLabel: 'Scoring avg', kind: 'scoring_average', unit: 'strokes', polarity: 'lower', floor: 3, defaultWindow: 'all_time', source: `${COUNTABLE}.scoringAverage` }),
  def({ id: 'scoring_average_vs_par', label: 'Scoring average to par', shortLabel: 'Avg to par', kind: 'to_par_average', unit: 'strokes', polarity: 'lower', floor: 3, defaultWindow: 'all_time', source: `${CACHE}.scoring_average_vs_par` }),
  def({ id: 'last_5_average', label: 'Last 5 average', shortLabel: 'Last 5', kind: 'scoring_average', unit: 'strokes', polarity: 'lower', floor: 5, defaultWindow: 'last_5_rounds', source: `${COUNTABLE}.last5Average` }),
  def({ id: 'best_round', label: 'Best round', kind: 'score', unit: 'strokes', polarity: 'lower', floor: 1, defaultWindow: 'all_time', source: `${COUNTABLE}.bestRound` }),
  def({ id: 'putts_per_round', label: 'Putts per round', shortLabel: 'Putts/rd', kind: 'per_round', unit: 'count', polarity: 'lower', floor: 3, defaultWindow: 'all_time', source: `${COUNTABLE}.puttsPer18` }),
  def({ id: 'birdies_per_18', label: 'Birdies per 18', kind: 'per_round', unit: 'count', polarity: 'higher', floor: 3, defaultWindow: 'all_time', source: `${COUNTABLE}.birdiesPer18` }),
  def({ id: 'three_putts_per_18', label: '3-putts per 18', kind: 'per_round', unit: 'count', polarity: 'lower', floor: 3, defaultWindow: 'all_time', source: `${COUNTABLE}.threePuttsPer18` }),
  def({ id: 'three_putt_rate', label: '3-putt rate', kind: 'percent', unit: 'percent', polarity: 'lower', floor: 3, defaultWindow: 'all_time', source: `${COUNTABLE}.threePuttRate` }),
  def({ id: 'fairway_pct', label: 'Fairways hit', kind: 'percent', unit: 'percent', polarity: 'higher', floor: 3, defaultWindow: 'all_time', source: `${COUNTABLE}.fairwayPct` }),
  def({ id: 'scrambling_pct', label: 'Scrambling', kind: 'percent', unit: 'percent', polarity: 'higher', floor: 10, sampleNoun: ATTEMPTS, defaultWindow: 'all_time', source: `${CACHE}.scrambling_percentage` }),
  def({ id: 'sand_save_pct', label: 'Sand saves', kind: 'percent', unit: 'percent', polarity: 'higher', floor: 5, sampleNoun: ATTEMPTS, defaultWindow: 'all_time', source: `${CACHE}.sand_save_percentage` }),
  def({ id: 'up_and_down_pct', label: 'Up and down', kind: 'percent', unit: 'percent', polarity: 'higher', floor: 10, sampleNoun: ATTEMPTS, defaultWindow: 'all_time', source: `${CACHE}.up_and_down_percentage` }),
  def({ id: 'one_putt_pct', label: '1-putt rate', kind: 'percent', unit: 'percent', polarity: 'higher', floor: 3, defaultWindow: 'all_time', source: `${CACHE}.one_putt_percentage` }),
  def({ id: 'putts_made_0_3ft_pct', label: 'Putts made 0–3 ft', kind: 'percent', unit: 'percent', polarity: 'higher', floor: 10, sampleNoun: PUTTS, defaultWindow: 'all_time', source: `${CACHE}.putt_make_pct_0_3ft` }),
  def({ id: 'driving_distance', label: 'Driving distance', kind: 'distance', unit: 'yd', polarity: 'higher', floor: 5, sampleNoun: SHOTS, defaultWindow: 'all_time', source: `${CACHE}.driving_distance_average` }),
  def({ id: 'approach_proximity', label: 'Approach proximity', kind: 'distance', unit: 'ft', polarity: 'lower', floor: 10, sampleNoun: SHOTS, defaultWindow: 'all_time', source: `${CACHE}.approach_proximity_average` }),
  def({ id: 'strokes_impact', label: 'Strokes a round', kind: 'strokes_delta', unit: 'strokes', suffix: ' a round', polarity: 'lower', floor: 3, defaultWindow: 'all_time', source: 'counterfactual / insight impact (strokes added per round; negative = strokes saved)' }),
  def({ id: 'rounds_counted', label: 'Rounds', kind: 'count', unit: 'count', polarity: 'none', floor: 0, countNoun: ['full round', 'full rounds'], defaultWindow: 'all_time', source: `${COUNTABLE}.roundsCounted` }),
  def({ id: 'holes_played', label: 'Holes', kind: 'count', unit: 'count', polarity: 'none', floor: 0, countNoun: HOLES, sampleNoun: HOLES, defaultWindow: 'all_time', source: 'golf_holes' }),
];

/**
 * v3 insight metric ids. Labels, kinds and units are set here; polarity is
 * read from the v3 registry so the two cannot disagree.
 */
const V3_DISPLAY: Record<V3MetricId, Omit<MetricDefinition, 'id' | 'polarity' | 'defaultWindow' | 'source'> & { defaultWindow?: MetricWindow }> = {
  sg_total: { label: 'Strokes gained: total', shortLabel: 'SG: Total', kind: 'strokes_gained', unit: 'strokes', floor: 3, sampleNoun: ROUNDS },
  sg_ott: { label: 'Strokes gained: off the tee', shortLabel: 'SG: Off the tee', kind: 'strokes_gained', unit: 'strokes', floor: 3, sampleNoun: ROUNDS },
  sg_approach: { label: 'Strokes gained: approach', shortLabel: 'SG: Approach', kind: 'strokes_gained', unit: 'strokes', floor: 3, sampleNoun: ROUNDS },
  sg_around_green: { label: 'Strokes gained: around the green', shortLabel: 'SG: Around green', kind: 'strokes_gained', unit: 'strokes', floor: 3, sampleNoun: ROUNDS },
  sg_putting: { label: 'Strokes gained: putting', shortLabel: 'SG: Putting', kind: 'strokes_gained', unit: 'strokes', floor: 3, sampleNoun: ROUNDS },
  putts_made_3_5ft_pct: { label: 'Putts made 3–5 ft', kind: 'percent', unit: 'percent', floor: 10, sampleNoun: PUTTS },
  putts_made_5_10ft_pct: { label: 'Putts made 5–10 ft', kind: 'percent', unit: 'percent', floor: 10, sampleNoun: PUTTS },
  putts_made_10_15ft_pct: { label: 'Putts made 10–15 ft', kind: 'percent', unit: 'percent', floor: 10, sampleNoun: PUTTS },
  putts_made_15_25ft_pct: { label: 'Putts made 15–25 ft', kind: 'percent', unit: 'percent', floor: 10, sampleNoun: PUTTS },
  putts_made_25_plus_ft_pct: { label: 'Putts made 25+ ft', kind: 'percent', unit: 'percent', floor: 10, sampleNoun: PUTTS },
  putt_miss_bias_high_pct: { label: 'Putts missed high', kind: 'percent', unit: 'percent', floor: 10, sampleNoun: PUTTS },
  putt_miss_bias_low_pct: { label: 'Putts missed low', kind: 'percent', unit: 'percent', floor: 10, sampleNoun: PUTTS },
  putt_miss_bias_left_pct: { label: 'Make rate, left break', kind: 'percent', unit: 'percent', floor: 10, sampleNoun: PUTTS },
  putt_miss_bias_right_pct: { label: 'Make rate, right break', kind: 'percent', unit: 'percent', floor: 10, sampleNoun: PUTTS },
  approach_proximity_50_125ft: { label: 'Proximity 50–125 yd', kind: 'distance', unit: 'ft', floor: 10, sampleNoun: SHOTS },
  approach_proximity_125_175ft: { label: 'Proximity 125–175 yd', kind: 'distance', unit: 'ft', floor: 10, sampleNoun: SHOTS },
  approach_proximity_175_plus_ft: { label: 'Proximity 175+ yd', kind: 'distance', unit: 'ft', floor: 10, sampleNoun: SHOTS },
  scrambling_pct_rough: { label: 'Scrambling from rough', kind: 'percent', unit: 'percent', floor: 10, sampleNoun: ATTEMPTS },
  scrambling_pct_sand: { label: 'Scrambling from sand', kind: 'percent', unit: 'percent', floor: 10, sampleNoun: ATTEMPTS },
  scrambling_pct_fairway: { label: 'Scrambling from fairway', kind: 'percent', unit: 'percent', floor: 10, sampleNoun: ATTEMPTS },
  penalty_rate_per_round: { label: 'Penalties per round', kind: 'per_round', unit: 'count', floor: 3, sampleNoun: ROUNDS },
  big_number_rate: { label: 'Double bogey or worse', kind: 'percent', unit: 'percent', floor: 3, sampleNoun: HOLES },
  scoring_par_3: { label: 'Par 3 average', kind: 'hole_average', unit: 'strokes', floor: 3, sampleNoun: HOLES },
  scoring_par_4: { label: 'Par 4 average', kind: 'hole_average', unit: 'strokes', floor: 3, sampleNoun: HOLES },
  scoring_par_5: { label: 'Par 5 average', kind: 'hole_average', unit: 'strokes', floor: 3, sampleNoun: HOLES },
  gir_pct: { label: 'Greens in regulation', shortLabel: 'GIR', kind: 'percent', unit: 'percent', floor: 3, sampleNoun: ROUNDS },
  practice_tournament_delta: { label: 'Pressure gap', kind: 'strokes_delta', unit: 'strokes', floor: 2, sampleNoun: ROUNDS, defaultWindow: 'last_90_days' },
  opening_hole_delta: { label: 'Opening-hole gap', kind: 'strokes_delta', unit: 'strokes', floor: 3, sampleNoun: ROUNDS },
};

function toPolarity(id: V3MetricId): MetricPolarity {
  return getMetricDirection(id) === 'higher_better' ? 'higher' : 'lower';
}

const V3_METRICS: MetricDefinition[] = METRIC_IDS.map((id) => {
  const d = V3_DISPLAY[id];
  return {
    ...d,
    id,
    polarity: toPolarity(id),
    defaultWindow: d.defaultWindow ?? 'all_time',
    source: id.startsWith('sg_') ? `${COUNTABLE}.sg / ${CACHE}.${id}_per_round` : `v3 golf_metrics (${id})`,
  };
});

export const METRIC_REGISTRY: Readonly<Record<string, MetricDefinition>> = Object.freeze(
  Object.fromEntries([...CORE_METRICS, ...V3_METRICS].map((m) => [m.id, m])),
);

export function getMetricDefinition(id: string): MetricDefinition {
  const d = METRIC_REGISTRY[id];
  if (!d) throw new Error(`Unknown golf metric id "${id}". Add it to src/lib/golf/metrics/display-registry.ts.`);
  return d;
}

export function isGolfMetricId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(METRIC_REGISTRY, id);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function plural(n: number, noun: readonly [string, string]): string {
  return n === 1 ? noun[0] : noun[1];
}

function groupDigits(fixed: string): string {
  const [int = '', frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac != null ? `${grouped}.${frac}` : grouped;
}

/** Rounds half away from zero at `dp`, so −0.005 → −0.01 like 0.005 → 0.01. */
function roundTo(value: number, dp: number): number {
  const f = 10 ** dp;
  const r = Math.sign(value) * Math.round(Math.abs(value) * f + Number.EPSILON) / f;
  return Object.is(r, -0) ? 0 : r;
}

function unitSuffixFor(def: MetricDefinition, rounded: number): string {
  if (def.suffix) return def.suffix;
  switch (def.kind) {
    case 'percent':
      return '%';
    case 'distance':
      return def.unit === 'yd' ? ' yd' : def.unit === 'ft' ? ' ft' : '';
    case 'count':
      return def.countNoun ? ` ${plural(rounded, def.countNoun)}` : '';
    default:
      return '';
  }
}

function toneFor(polarity: MetricPolarity, rounded: number, toned: boolean): MetricTone {
  if (!toned || polarity === 'none' || rounded === 0) return 'neutral';
  const better = polarity === 'higher' ? rounded > 0 : rounded < 0;
  return better ? 'good' : 'bad';
}

function spokenSign(sign: '+' | '−' | ''): string {
  return sign === '+' ? 'plus ' : sign === '−' ? 'minus ' : '';
}

/**
 * Format one golf metric value by the §5.2 number rule.
 *
 * Throws on an unknown id: a typo must fail in a test, not print silently.
 */
export function formatMetric(
  id: string,
  value: number | null | undefined,
  ctx: FormatMetricContext = {},
): FormattedMetric {
  const def = getMetricDefinition(id);
  const floor = ctx.floor ?? def.floor;

  const windowChip =
    ctx.window && ctx.window !== (ctx.screenWindow ?? def.defaultWindow) ? WINDOW_LABELS[ctx.window] : null;

  let readQuality: ReadQuality | null = null;
  let needsMore: number | null = null;
  let qualityNote: string | null = null;
  if (ctx.sample != null && Number.isFinite(ctx.sample)) {
    const sample = Math.max(0, Math.floor(ctx.sample));
    if (sample < floor) {
      readQuality = 'insufficient';
      needsMore = floor - sample;
      qualityNote = `Needs ${needsMore} more ${plural(needsMore, def.sampleNoun)}`;
    } else if (sample < 2 * floor) {
      readQuality = 'early';
      qualityNote = 'Early read';
    } else {
      readQuality = 'solid';
    }
  }

  const base = { id, label: def.label, windowChip, readQuality, needsMore, qualityNote };

  if (!isFiniteNumber(value) || readQuality === 'insufficient') {
    return {
      ...base,
      text: MISSING,
      sign: '',
      number: MISSING,
      unitSuffix: '',
      tone: 'neutral',
      missing: true,
      ariaLabel: `${def.label}, ${readQuality === 'insufficient' ? qualityNote : 'no data'}`,
    };
  }

  const scaled = def.kind === 'percent' && def.percentScale === 'fraction' ? value * 100 : value;
  const dp = KIND_PRECISION[def.kind];
  const rounded = roundTo(scaled, dp);
  const signed = SIGNED_KINDS.has(def.kind) || ctx.delta === true;

  // Negative values always carry the true minus; "+" only on signed kinds.
  const sign: '+' | '−' | '' = rounded < 0 ? '−' : rounded > 0 && signed ? '+' : '';

  let number: string;
  if (rounded === 0 && signed && EVEN_PAR_KINDS.has(def.kind)) {
    number = 'E';
  } else {
    number = groupDigits(Math.abs(rounded).toFixed(dp));
  }

  const unitSuffix = number === 'E' ? '' : unitSuffixFor(def, rounded);
  const text = `${sign}${number}${unitSuffix}`;
  const tone = toneFor(def.polarity, rounded, signed);

  const spokenNumber = number === 'E' ? 'even par' : `${spokenSign(sign)}${number}${unitSuffix === '%' ? ' percent' : unitSuffix}`;
  const extras = [windowChip, qualityNote].filter(Boolean).join(', ');

  return {
    ...base,
    text,
    sign,
    number,
    unitSuffix,
    tone,
    missing: false,
    ariaLabel: `${def.label}, ${spokenNumber}${extras ? `, ${extras}` : ''}`,
  };
}

/** Just the display string. */
export function formatMetricText(id: string, value: number | null | undefined, ctx?: FormatMetricContext): string {
  return formatMetric(id, value, ctx).text;
}

/** "5–10 ft", "175–200 yd", or "25+ ft" when `hi` is null. En dash, one unit. */
export function formatDistanceRange(lo: number, hi: number | null, unit: 'yd' | 'ft'): string {
  if (hi == null) return `${lo}+ ${unit}`;
  return `${lo}–${hi} ${unit}`;
}

/** "44 putts", "1 round". Counts are integers with a noun; never "n=". */
export function formatSample(n: number, noun: readonly [string, string] = ROUNDS): string {
  const k = Math.max(0, Math.round(n));
  return `${groupDigits(String(k))} ${plural(k, noun)}`;
}

/**
 * Stated exclusions (§5.2): "21 full rounds · 2 not counted (partial or test)".
 * Omits the second clause when nothing was left out.
 */
export function formatExclusions(counted: number, excluded: number): string {
  const head = formatSample(counted, ['full round', 'full rounds']);
  return excluded > 0 ? `${head} · ${excluded} not counted (partial or test)` : head;
}

/** Tone → Fairway text class (green = good, amber = worse, ink otherwise). */
export const METRIC_TONE_CLASS: Record<MetricTone, string> = {
  good: 'text-fw-success-ink',
  bad: 'text-fw-warning-ink',
  neutral: '',
};
