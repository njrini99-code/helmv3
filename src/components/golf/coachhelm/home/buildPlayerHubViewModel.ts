/**
 * ============================================================================
 * buildPlayerHubViewModel — the pure adapter for the Player CoachHelm overview
 * ----------------------------------------------------------------------------
 * The overview is CoachHelm's own read of the player's game: what is changing,
 * why, and what to do about it. Stats owns "where you stand" (the SG hero, the
 * season snapshot, the percentile standing), so none of that is repeated here.
 *
 * Every number on the overview comes from ONE source (audit HUB-02):
 *
 *   scoring trend      getPlayerTrendAnalysis   (score to par, 5/12/25-round windows)
 *   driver trends      getThemesForPlayer       (per-category SG, recent vs prior)
 *   root causes        insight-delivery          (evidence + diagnosis per insight)
 *   leak map           getThemesForPlayer       (cause gain to team average)
 *   situations         getPlayerCoachHelmDashboard.focusAreas (mined patterns)
 *   next round         getPlayerCoachHelmDashboard.prediction
 *   last round         getPlayerCoachHelmDashboard.recentRounds[0]
 *   rounds basis       golf_player_stats_cache.rounds_played
 *
 * The old overview also printed a 30-day shot-analytics ledger (Fairways 7%,
 * Greens 100%, Putts 18.0) beside the stats-cache snapshot (62%, 72%, 29.7):
 * two windows, two pipelines, one screen (audit NUM-22). Neither is here now.
 *
 * ONE SIGN CONVENTION (audit HUB-12 / NUM-13). A signed number always reads in
 * the strokes-gained sense: + is better, − is worse. Colour and the judgement
 * word ("Improving", "Slipping") both come from the same `sense`, never from
 * the raw direction of the underlying stat, so a green word never sits next to
 * a red number. Quantities where "up" is bad (score to par, situational score
 * gaps) are written unsigned with a word ("1.6 strokes lower").
 *
 * No React, no Supabase: data in, view model out.
 * ========================================================================== */

import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { ThemeNode } from '@/lib/coachhelm/v3/themes/types';
import { formatValue } from '@/components/golf/coachhelm/insights/format-value';
import { isImprovement, isNegativePolarityMetric } from '@/components/golf/coachhelm/insight-card/tone-derivation';

/* ───────────────────────────────────────────────────────────────────────────
 * Number helpers
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * The predictor's band is a nominal 80% interval (mean ± 1.28·sd, t-inflated;
 * performance-predictor.ts `ciMultiplier`). Its `confidence` field (0.6–0.8)
 * is a volatility heuristic, NOT the interval's level, so the band is labelled
 * with 80% and never with that number.
 */
export const PREDICTION_INTERVAL_LEVEL_PCT = 80;
/** A band wider than this many strokes says nothing useful; hide it (owner decisions D4, OD-09). */
export const MAX_PREDICTION_BAND_STROKES = 8;

/** Area strings arrive snake_case or varied case from the DB; normalize for display. */
export function formatAreaName(area: string): string {
  if (!area) return '';
  if (/[A-Z]/.test(area) && /\s/.test(area)) return area;
  return area
    .replace(/_+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function finite(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

const DP = {
  1: new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  2: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
} as const;

export const MINUS = '−';

/** "1.6" — magnitude only, fixed decimals. */
export function fmtUnsigned(n: number, dp: 1 | 2 = 1): string {
  return DP[dp].format(Math.abs(n));
}

/** "+0.34" / "−0.21" / "0.00" — a true minus, and no sign on a rounded zero. */
export function fmtSigned(n: number, dp: 1 | 2 = 2): string {
  const abs = DP[dp].format(Math.abs(n));
  if (Number(abs) === 0) return DP[dp].format(0);
  return n > 0 ? `+${abs}` : `${MINUS}${abs}`;
}

/** Better / worse / level — the only thing colour and words are derived from. */
export type Sense = 'better' | 'worse' | 'level';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 20" from an ISO date or timestamp; null when it does not parse. */
export function fmtShortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function datePart(iso: string | null | undefined): string | null {
  if (!iso || iso.length < 10) return null;
  const part = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(part) ? part : null;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Read quality — a word band, never a bare confidence percent (HUB-04)
 * Thresholds match EvidencePanel's confidenceColor (0.7 / 0.4).
 * ────────────────────────────────────────────────────────────────────────── */

export interface ReadQuality {
  level: 1 | 2 | 3;
  word: 'Strong read' | 'Fair read' | 'Early read';
}

export function readQuality(confidence: number | null | undefined): ReadQuality | null {
  const c = finite(confidence);
  if (c === null) return null;
  const n = c > 1 ? c / 100 : c;
  if (n >= 0.7) return { level: 3, word: 'Strong read' };
  if (n >= 0.4) return { level: 2, word: 'Fair read' };
  return { level: 1, word: 'Early read' };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Scoring trend — getPlayerTrendAnalysis().trends (score to par, lower better)
 * ────────────────────────────────────────────────────────────────────────── */

export interface ScoringTrendWindow {
  key: string;
  rounds: number;
  /** Change in score to par across the window (slope × (rounds − 1)); + means higher scores. */
  change: number;
  sense: Sense;
  /** "1.6 strokes lower" / "Holding steady" — no window suffix. */
  short: string;
  text: string;
}

export interface ScoringTrend {
  word: string;
  sense: Sense;
  headline: string;
  sentence: string;
  windows: ScoringTrendWindow[];
}

interface RawWindow {
  name?: unknown;
  size?: unknown;
  slope?: unknown;
  direction?: unknown;
}

const DIRECTION_SENSE: Record<string, Sense> = { improving: 'better', declining: 'worse', stable: 'level' };

function windowShort(change: number, sense: Sense): string {
  if (sense === 'level') return 'Holding steady';
  return `${fmtUnsigned(change)} strokes ${change < 0 ? 'lower' : 'higher'}`;
}

/**
 * A window whose fitted change exceeds this is not a scoring trend: it is a
 * partial or nine-hole round stored against an 18-hole par (a 37 saved as
 * −35) dragging the line. Such a window is left out rather than headlined.
 */
export const MAX_PLAUSIBLE_TREND_STROKES = 10;

const HEADLINES: Record<string, string> = {
  Improving: 'Your scores are coming down',
  Slipping: 'Your scores are creeping up',
  Steady: 'Your scores are holding steady',
  'Turning better': 'Your scores are turning a corner',
  'Turning worse': 'Your recent scores have turned up',
  'Leveling off': 'Your scores are leveling off',
};

export function buildScoringTrend(trendData: Record<string, unknown> | null | undefined): ScoringTrend | null {
  const raw = (trendData as { trends?: { windows?: unknown } } | null | undefined)?.trends?.windows;
  if (!Array.isArray(raw)) return null;

  const seen = new Set<number>();
  const windows: ScoringTrendWindow[] = [];
  for (const w of raw as RawWindow[]) {
    const rounds = finite(w?.size);
    const slope = finite(w?.slope);
    const sense = typeof w?.direction === 'string' ? DIRECTION_SENSE[w.direction] : undefined;
    if (rounds === null || slope === null || !sense || rounds < 3) continue;
    // With few rounds every window collapses to the same size; show it once.
    if (seen.has(rounds)) continue;
    seen.add(rounds);
    const change = slope * (rounds - 1);
    if (Math.abs(change) > MAX_PLAUSIBLE_TREND_STROKES) continue;
    windows.push({
      key: typeof w.name === 'string' ? w.name : String(rounds),
      rounds,
      change,
      sense,
      short: windowShort(change, sense),
      text: `${windowShort(change, sense)} across ${rounds} rounds`,
    });
  }
  if (windows.length === 0) return null;
  windows.sort((a, b) => a.rounds - b.rounds);

  const recent = windows[0]!;
  const longest = windows[windows.length - 1]!;
  let word: string;
  if (windows.every((w) => w.sense === recent.sense)) {
    word = recent.sense === 'better' ? 'Improving' : recent.sense === 'worse' ? 'Slipping' : 'Steady';
  } else {
    word = recent.sense === 'better' ? 'Turning better' : recent.sense === 'worse' ? 'Turning worse' : 'Leveling off';
  }

  const sentence =
    longest === recent || longest.sense === recent.sense
      ? `Last ${recent.rounds} rounds: ${lowerFirst(recent.text)}.`
      : `Last ${recent.rounds} rounds: ${lowerFirst(recent.text)}. Over ${longest.rounds} rounds: ${lowerFirst(longest.text)}.`;

  return { word, sense: recent.sense, headline: HEADLINES[word] ?? 'Your scoring trend', sentence, windows };
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/* ───────────────────────────────────────────────────────────────────────────
 * Driver trends — ThemeNode.trend (per-category SG, higher is better)
 * ────────────────────────────────────────────────────────────────────────── */

export interface DriverTrendRow {
  key: string;
  label: string;
  prior: number;
  recent: number;
  /** recent − prior, strokes-gained sense (+ is better). */
  delta: number;
  sense: Sense;
  word: 'Improving' | 'Slipping' | 'Steady';
  deltaText: string;
  sample: string;
}

export function buildDriverTrends(themes: ReadonlyArray<ThemeNode>): DriverTrendRow[] {
  const rows: DriverTrendRow[] = [];
  for (const t of themes) {
    const trend = t.trend;
    if (!trend || t.sgMetricId == null) continue;
    const prior = finite(trend.priorAvg);
    const recent = finite(trend.recentAvg);
    const delta = finite(trend.delta);
    if (prior === null || recent === null || delta === null) continue;
    const sense: Sense = trend.direction === 'improving' ? 'better' : trend.direction === 'declining' ? 'worse' : 'level';
    rows.push({
      key: t.category,
      label: t.displayLabel,
      prior,
      recent,
      delta,
      sense,
      word: sense === 'better' ? 'Improving' : sense === 'worse' ? 'Slipping' : 'Steady',
      deltaText: `${fmtSigned(delta)} a round`,
      sample: `Last ${trend.recentN} rounds vs the ${trend.priorN} before`,
    });
  }
  // Biggest movers first, whichever way they moved.
  return rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/* ───────────────────────────────────────────────────────────────────────────
 * Insight units — claim, cause chain, evidence rail, sample, trend, drill
 * ────────────────────────────────────────────────────────────────────────── */

const CATEGORY_LABELS: Record<string, string> = {
  putting: 'Putting',
  tee: 'Off the tee',
  approach: 'Approach',
  short_game: 'Around the green',
  scoring: 'Scoring',
  pressure: 'Pressure',
  course_management: 'Course management',
};

export interface EvidenceMark {
  key: 'you' | 'team' | 'tour';
  label: string;
  /** Position on the rail's own scale (percent already on 0–100). */
  value: number;
  display: string;
}

export interface EvidenceRail {
  marks: EvidenceMark[];
  min: number;
  max: number;
  lowerIsBetter: boolean;
  /** Where "you" sits against the first comparison mark. */
  youSense: Sense;
}

export interface ChainStep {
  key: 'see' | 'worth' | 'cause';
  label: string;
  text: string;
  /** "Measured" / "Likely" on the cause step. */
  marker?: string;
}

export interface InsightUnit {
  id: string;
  category: string;
  claim: string;
  chain: ChainStep[];
  /** Prose fallback, only when the insight carries no structured chain. */
  body: string | null;
  rail: EvidenceRail | null;
  sample: string | null;
  dataThrough: string | null;
  /** The player has logged a round after this insight's data window closed (NUM-12). */
  predatesLastRound: boolean;
  read: ReadQuality | null;
  movement: { word: 'Improving' | 'Slipping'; sense: Sense; text: string } | null;
  drill: { title: string; minutes: number | null } | null;
  action: string | null;
}

function sampleNoun(n: number, metric: string): string {
  const plural = n !== 1;
  if (/putt/i.test(metric)) return plural ? 'putts' : 'putt';
  if (/approach/i.test(metric)) return plural ? 'approaches' : 'approach';
  if (/tee|drive/i.test(metric)) return plural ? 'tee shots' : 'tee shot';
  if (/scramb/i.test(metric)) return plural ? 'attempts' : 'attempt';
  if (/round/i.test(metric)) return plural ? 'rounds' : 'round';
  return plural ? 'shots' : 'shot';
}

function buildRail(insight: EvidenceInsight): EvidenceRail | null {
  const ev = insight.evidence;
  if (!ev) return null;
  const you = finite(ev.your_value);
  if (you === null) return null;
  const team = finite(ev.comparison_value);
  const tour = finite(ev.secondary_value);

  const values = [you, team, tour].filter((v): v is number => v !== null);
  const isPercent = ev.unit === 'percent';
  // Percent evidence arrives either as a 0..1 fraction or 0..100; decide once
  // for the whole set so the three marks share one scale.
  const scale = isPercent && values.every((v) => Math.abs(v) <= 1) ? 100 : 1;
  const pos = (v: number) => v * scale;

  const marks: EvidenceMark[] = [
    { key: 'you', label: 'You', value: pos(you), display: formatValue(you, ev.unit, ev.your_value_display) },
  ];
  if (team !== null) {
    marks.push({ key: 'team', label: ev.comparison_label || 'Team', value: pos(team), display: formatValue(team, ev.unit) });
  }
  if (tour !== null && tour !== team) {
    marks.push({ key: 'tour', label: ev.secondary_label || 'Tour', value: pos(tour), display: formatValue(tour, ev.unit) });
  }
  if (marks.length < 2) return null;

  let min: number;
  let max: number;
  if (isPercent) {
    // A percent axis is 0–100, never "42% … 104%" (audit NUM-38).
    min = 0;
    max = 100;
  } else {
    const lo = Math.min(...marks.map((m) => m.value));
    const hi = Math.max(...marks.map((m) => m.value));
    const pad = hi === lo ? Math.max(1, Math.abs(hi) * 0.1) : (hi - lo) * 0.15;
    min = lo - pad;
    max = hi + pad;
    if (lo >= 0 && min < 0) min = 0;
  }

  const lowerIsBetter = isNegativePolarityMetric(ev.metric ?? '', ev);
  const ref = marks[1]!.value;
  const youPos = marks[0]!.value;
  const youSense: Sense =
    youPos === ref ? 'level' : (lowerIsBetter ? youPos < ref : youPos > ref) ? 'better' : 'worse';

  return { marks, min, max, lowerIsBetter, youSense };
}

export function buildInsightUnit(
  insight: EvidenceInsight,
  opts: { lastRoundDate?: string | null } = {},
): InsightUnit {
  const ev = insight.evidence;
  const diagnosis = ev?.diagnosis;
  const metric = ev?.metric ?? '';

  const chain: ChainStep[] = [];
  const yourDisplay = ev && finite(ev.your_value) !== null ? formatValue(ev.your_value, ev.unit, ev.your_value_display) : null;
  const see = diagnosis?.symptom?.trim() || (ev?.metric_label && yourDisplay ? `${ev.metric_label}: ${yourDisplay}` : '');
  if (see) chain.push({ key: 'see', label: 'What we see', text: see });

  const impact = finite(ev?.strokes_impact);
  if (impact !== null && Math.abs(impact) >= 0.05) {
    chain.push({ key: 'worth', label: 'What it is worth', text: `About ${fmtUnsigned(impact)} strokes a round` });
  }

  const cause = diagnosis?.root_cause?.trim();
  if (cause) {
    const measured = (diagnosis?.causality_level ?? ev?.causality_level) === 'observed_sequence';
    chain.push({ key: 'cause', label: 'Why', text: cause, marker: measured ? 'Measured' : 'Likely' });
  }

  const sampleN = finite(ev?.sample_n);
  const windowDays = finite(ev?.window_days);
  const sample =
    sampleN !== null && sampleN > 0
      ? `${sampleN} ${sampleNoun(sampleN, metric)}${windowDays !== null && windowDays > 0 ? ` over ${windowDays} days` : ''}`
      : null;

  const windowEnd = datePart(ev?.window_end);
  const lastRound = datePart(opts.lastRoundDate);
  const dataThroughDate = fmtShortDate(windowEnd);

  const mv = insight.metadata?.movement;
  let movement: InsightUnit['movement'] = null;
  if (mv && finite(mv.from) !== null && finite(mv.to) !== null && (mv.direction === 'up' || mv.direction === 'down') && ev) {
    const better = isImprovement(mv.direction, metric, ev);
    movement = {
      word: better ? 'Improving' : 'Slipping',
      sense: better ? 'better' : 'worse',
      text: `${formatValue(mv.from, ev.unit)} to ${formatValue(mv.to, ev.unit)}`,
    };
  }

  const firstDrill = insight.drills?.[0] ?? null;

  return {
    id: insight.id,
    category: (insight.category && CATEGORY_LABELS[insight.category]) || 'Insight',
    claim: insight.title,
    chain,
    body: chain.length === 0 ? insight.content || null : null,
    rail: buildRail(insight),
    sample,
    dataThrough: dataThroughDate ? `Data through ${dataThroughDate}` : null,
    predatesLastRound: Boolean(windowEnd && lastRound && lastRound > windowEnd),
    read: readQuality(ev?.confidence),
    movement,
    drill: firstDrill ? { title: firstDrill.title, minutes: finite(firstDrill.duration_min) } : null,
    action: diagnosis?.recommended_action?.trim() || null,
  };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Leak map — the causes behind the leak themes, by realistic gain
 * ────────────────────────────────────────────────────────────────────────── */

export interface LeakRow {
  key: string;
  theme: string;
  title: string;
  /** Strokes a round to reach the team average (unsigned, > 0). */
  gain: number;
  gainText: string;
  /** Raw gap to Tour level, when known. */
  tourText: string | null;
}

export function buildLeakMap(themes: ReadonlyArray<ThemeNode>, max = 5): LeakRow[] {
  const rows: LeakRow[] = [];
  for (const t of themes) {
    if (t.state !== 'leak') continue;
    for (const c of t.causes ?? []) {
      if (c.counterfactualSuppressed) continue;
      const gain = finite(c.strokesSavedPerRound);
      if (gain === null || gain <= 0) continue;
      const tour = finite(c.tourGapPerRound);
      rows.push({
        key: c.insight_id,
        theme: t.displayLabel,
        title: c.title,
        gain,
        gainText: `${fmtUnsigned(gain, 2)} a round`,
        tourText: tour !== null && tour > gain ? `${fmtUnsigned(tour, 2)} to Tour level` : null,
      });
    }
  }
  return rows.sort((a, b) => b.gain - a.gain).slice(0, max);
}

/* ───────────────────────────────────────────────────────────────────────────
 * Situations — mined scoring patterns (dashboard focusAreas)
 *
 * These rows were printed as "priorities" named "In tournament −6.42" and
 * "Back-to-back rounds −4.25", which read like skills with a strokes-gained
 * value. They are SITUATIONS: `strokeImpact` is the player's average score in
 * that situation minus their overall average (pattern-miner.ts), so the
 * honest reading is "6.4 strokes higher in tournament rounds". Descriptive,
 * never causal. Causal effect-size rows (`unit: 'opportunity'`) carry no
 * stroke value, so they get no number.
 * ────────────────────────────────────────────────────────────────────────── */

const SITUATION_LABELS: Record<string, string> = {
  'in tournament': 'Tournament rounds',
  'in qualifier': 'Qualifying rounds',
  'back-to-back rounds': 'Second day in a row',
  'after 5+ days off': 'After 5+ days off',
  'after 7+ days off': 'After a week or more off',
  'extended break (14+ days)': 'After two weeks or more off',
  'high putts (36+)': 'Rounds with 36+ putts',
};

export interface SituationInput {
  area: string;
  strokesGained: number | null | undefined;
  value?: number | null;
  unit?: string | null;
}

export interface SituationRow {
  key: string;
  label: string;
  kind: 'strokes' | 'yards' | 'linked';
  sense: Sense;
  /** Magnitude for the bar (strokes rows only). */
  magnitude: number | null;
  valueText: string | null;
  detail: string;
}

export function situationLabel(area: string): string {
  const mapped = SITUATION_LABELS[area.trim().toLowerCase()];
  if (mapped) return mapped;
  const human = formatAreaName(area);
  return human.replace(/\bShots\b/, 'shots').replace(/\bYds\b/i, 'yd');
}

export function buildSituations(areas: ReadonlyArray<SituationInput>, max = 4): SituationRow[] {
  const rows: SituationRow[] = [];
  for (const a of areas) {
    const sg = finite(a.strokesGained);
    if (!a.area || sg === null || sg === 0) continue;
    const label = situationLabel(a.area);
    if (a.unit === 'opportunity') {
      rows.push({ key: a.area, label, kind: 'linked', sense: 'level', magnitude: null, valueText: null, detail: 'Moves with your scores' });
    } else if (a.unit === 'yd from target') {
      const yd = finite(a.value);
      rows.push({
        key: a.area,
        label,
        kind: 'yards',
        sense: 'level',
        magnitude: null,
        valueText: yd !== null ? `${Math.round(yd)} yd` : null,
        detail: 'Average miss from the target',
      });
    } else {
      // strokes/round (or legacy unlabeled): the pattern's score gap.
      const higher = sg < 0;
      const mag = Math.abs(sg);
      rows.push({
        key: a.area,
        label,
        kind: 'strokes',
        sense: higher ? 'worse' : 'better',
        magnitude: mag,
        valueText: `${fmtUnsigned(mag)} strokes ${higher ? 'higher' : 'lower'}`,
        detail: 'Than your usual score',
      });
    }
  }
  const order = { strokes: 0, yards: 1, linked: 2 } as const;
  return rows
    .sort((a, b) => order[a.kind] - order[b.kind] || (b.magnitude ?? 0) - (a.magnitude ?? 0))
    .slice(0, max);
}

/* ───────────────────────────────────────────────────────────────────────────
 * NextRoundWindow — the prediction with a band guard (HUB-02 / HUB-03)
 * ────────────────────────────────────────────────────────────────────────── */

export interface NextRoundWindow {
  metricLabel: string;
  point: number;
  pointText: string;
  band: { low: number; high: number; lowText: string; highText: string } | null;
  caption: string;
  /** Lower is better for every score metric the predictor emits. */
  lowerIsBetter: true;
}

function formatPredicted(n: number, metric: string | null | undefined): string {
  if (metric === 'score_to_par') {
    const abs = fmtUnsigned(n);
    if (Number(abs) === 0) return 'E';
    return n > 0 ? `+${abs}` : `${MINUS}${abs}`;
  }
  return fmtUnsigned(n);
}

export function buildNextRoundWindow(
  prediction:
    | {
        predictedValue?: number | null;
        predictedRangeLow?: number | null;
        predictedRangeHigh?: number | null;
        metric?: string | null;
      }
    | null
    | undefined,
): NextRoundWindow | null {
  const point = finite(prediction?.predictedValue);
  if (point === null || !prediction) return null;
  const metric = prediction.metric ?? null;
  const low = finite(prediction.predictedRangeLow);
  const high = finite(prediction.predictedRangeHigh);
  const bandOk = low !== null && high !== null && high >= low && high - low <= MAX_PREDICTION_BAND_STROKES;
  return {
    metricLabel: metric === 'score_to_par' ? 'to par' : 'score',
    point,
    pointText: formatPredicted(point, metric),
    band: bandOk
      ? { low: low!, high: high!, lowText: formatPredicted(low!, metric), highText: formatPredicted(high!, metric) }
      : null,
    caption: bandOk
      ? `${PREDICTION_INTERVAL_LEVEL_PCT}% of rounds like this land in the band`
      : 'The range shows once more rounds narrow it',
    lowerIsBetter: true,
  };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Last round + plan progress
 * ────────────────────────────────────────────────────────────────────────── */

export interface LastRound {
  score: number;
  /** Null when the stored to-par cannot be a real round (a partial round against a full par). */
  toParText: string | null;
  date: string | null;
  course: string | null;
}

export function buildLastRound(
  rounds: ReadonlyArray<{ score: number; scoreToPar: number; date: string; courseName: string }>,
): LastRound | null {
  const r = rounds[0];
  if (!r || !finite(r.score) || r.score <= 0) return null;
  const tp = finite(r.scoreToPar);
  // Nobody shoots 16 under; a figure that low is a nine-hole score saved
  // against an 18-hole par, so the score shows without it.
  const plausible = tp !== null && tp >= -15;
  return {
    score: r.score,
    toParText: !plausible ? null : tp === 0 ? 'E' : tp > 0 ? `+${tp}` : `${MINUS}${Math.abs(tp)}`,
    date: fmtShortDate(r.date),
    course: r.courseName && r.courseName !== 'Unknown Course' ? r.courseName : null,
  };
}

export interface PlanRow {
  id: string;
  title: string;
  /** 0–100 travel from baseline to target; null when the start is unknown. */
  pct: number | null;
  status: string;
}

export function buildPlanRows(
  areas: ReadonlyArray<{
    id: string;
    title?: string | null;
    area_type?: string | null;
    status?: string | null;
    baseline_value?: number | null;
    current_value?: number | null;
    target_value?: number | null;
  }>,
  max = 3,
): PlanRow[] {
  return areas.slice(0, max).map((a) => {
    const base = finite(a.baseline_value);
    const cur = finite(a.current_value);
    const tgt = finite(a.target_value);
    let pct: number | null = null;
    if (base !== null && cur !== null && tgt !== null && tgt !== base) {
      pct = Math.round(Math.max(0, Math.min(1, (cur - base) / (tgt - base))) * 100);
    }
    const title = a.title?.trim() || (a.area_type ? formatAreaName(a.area_type) : 'Focus area');
    return {
      id: a.id,
      title,
      pct,
      status: a.status === 'paused' ? 'Paused' : pct === null ? 'Tracking' : `${pct}% of the way`,
    };
  });
}
