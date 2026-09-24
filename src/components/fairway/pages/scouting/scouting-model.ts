/**
 * ============================================================================
 * Scouting Report · view model (pure)
 * ----------------------------------------------------------------------------
 * Every number the Scouting Report prints is shaped here, from typed fields
 * only (never parsed out of prose). No React, no Supabase, no Date.now(): the
 * same inputs always produce the same strings, so the page is hydration-safe
 * and unit-testable.
 *
 * Job of the screen (distinct from its siblings):
 *   - Scouting Report: the coach's story. Verdict, the three things that
 *     matter with evidence, and the plan.
 *   - Game Fingerprint: where the strokes go (SG by category). Not drawn here.
 *   - Genome: skill profile vs team / Tour. Not drawn here.
 * So this model deliberately ignores `compositeRating` and
 * `categoryBreakdown` (the 0–100 scores, with known synthetic defaults).
 * ========================================================================== */

import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightComparisonSource, InsightUnit } from '@/lib/coachhelm/v2/insights/types';
import type { ThemeNode } from '@/lib/coachhelm/v3/themes/types';
import { resolveMetricDirection } from '@/lib/coachhelm/focus-areas/direction';
import { DEFAULT_TIMEZONE } from '@/lib/calendar/timezone';

/* ---------------------------------------------------------------------------
 * Input shapes (structural; a superset of what the /game route already sends)
 * ------------------------------------------------------------------------- */

export interface ScoutingPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  graduation_year: number | null;
  handicap: number | null;
  avatar_url?: string | null;
}

export interface ScoutingRound {
  id: string;
  round_date: string | null;
  created_at: string;
  total_score: number | null;
  holes_played: number | null;
  score_to_par: number | null;
  total_putts?: number | null;
  total_gir?: number | null;
  total_gir_possible?: number | null;
  total_fairways_hit?: number | null;
  total_fairways?: number | null;
}

export interface ScoutingFocusArea {
  id: string;
  title: string | null;
  status: string | null;
  current_value: number | null;
  target_value: number | null;
  baseline_value: number | null;
  target_metric: string | null;
  created_at: string;
  /** Optional: exact link to the insight this area was approved from. */
  from_insight_id?: string | null;
  /** Optional: server-computed evidence-revision comparison (A8 slice 3). */
  evidence_revision_status?: 'match' | 'changed' | null;
}

/* ---------------------------------------------------------------------------
 * Formatting helpers
 * ------------------------------------------------------------------------- */

const MINUS = '−';

/** Signed number with a real minus sign; `digits` decimals; 0 → "0". */
export function signed(value: number, digits = 1): string {
  const r = Number(value.toFixed(digits));
  if (r === 0) return (0).toFixed(digits);
  return r > 0 ? `+${r.toFixed(digits)}` : `${MINUS}${Math.abs(r).toFixed(digits)}`;
}

/** Strokes to par: "+4.2", "E", "−1.3". */
export function formatAverageToPar(value: number, digits = 1): string {
  const r = Number(value.toFixed(digits));
  if (r === 0) return 'E';
  return signed(r, digits);
}

function trimNumber(value: number, maxDigits: number): string {
  const fixed = value.toFixed(maxDigits);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/** A value in its unit, the way a coach would write it. */
export function formatInUnit(value: number, unit: InsightUnit): string {
  switch (unit) {
    case 'percent':
      return `${trimNumber(value, Math.abs(value) < 10 ? 1 : 0)}%`;
    case 'feet':
      return `${trimNumber(value, 0)} ft`;
    case 'yards':
      return `${trimNumber(value, 0)} yd`;
    case 'strokes':
      return trimNumber(value, 2);
    case 'count':
    default:
      return trimNumber(value, 1);
  }
}

/** A gap in its unit. Percent gaps are percentage points ("pts"). */
export function formatGap(delta: number, unit: InsightUnit): string {
  const sign = delta > 0 ? '+' : delta < 0 ? MINUS : '';
  const abs = Math.abs(delta);
  switch (unit) {
    case 'percent':
      return `${sign}${trimNumber(abs, abs < 10 ? 1 : 0)} pts`;
    case 'feet':
      return `${sign}${trimNumber(abs, abs < 10 ? 1 : 0)} ft`;
    case 'yards':
      return `${sign}${trimNumber(abs, 0)} yd`;
    case 'strokes':
      return `${sign}${trimNumber(abs, 2)}`;
    case 'count':
    default:
      return `${sign}${trimNumber(abs, 1)}`;
  }
}

const MONTH_DAY = new Intl.DateTimeFormat('en-US', {
  timeZone: DEFAULT_TIMEZONE,
  month: 'short',
  day: 'numeric',
});

/** ISO timestamp → "Sep 13" in the fixed product timezone (hydration-safe). */
export function formatMonthDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return MONTH_DAY.format(new Date(t));
}

/** A calendar date ("2026-09-17") → "Sep 17" with no timezone shift. */
export function formatCalendarDate(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return formatMonthDay(ymd);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}` : null;
}

export function formatHandicap(handicap: number | null): string | null {
  if (handicap === null || !Number.isFinite(handicap)) return null;
  return handicap < 0 ? `+${Math.abs(handicap).toFixed(1)}` : handicap.toFixed(1);
}

/* ---------------------------------------------------------------------------
 * Round eligibility (local guard; the data worker owns the shared predicate)
 * ------------------------------------------------------------------------- */

/**
 * A round counts toward the verdict only if it is a full 18 with a plausible
 * score. The known "18 holes · 37 · −35" partial round is excluded by the
 * total-score floor, so one bad row can never swing the headline.
 */
export function isFullRound(r: ScoutingRound): boolean {
  if (r.score_to_par === null || !Number.isFinite(r.score_to_par)) return false;
  if (r.holes_played !== null && r.holes_played < 18) return false;
  if (r.total_score !== null && r.total_score < 55) return false;
  return r.score_to_par > -20 && r.score_to_par < 60;
}

/* ---------------------------------------------------------------------------
 * Verdict (server props only, so the headline never rewrites after mount)
 * ------------------------------------------------------------------------- */

export interface ScoutingVerdict {
  sentence: string;
  tone: 'good' | 'warn' | 'neutral';
  /** Full rounds the sentence rests on. */
  fullRounds: number;
}

/** Minimum full rounds before the report states an average or a trend. */
export const VERDICT_MIN_ROUNDS = 3;
/** Strokes per round the halves must differ by before calling a trend. */
const TREND_THRESHOLD = 1.5;

function leverTheme(themes: ThemeNode[]): ThemeNode | null {
  let best: ThemeNode | null = null;
  for (const t of themes) {
    if (t.state !== 'leak' || !(t.themeStrokesPerRound > 0)) continue;
    if (!best || t.themeStrokesPerRound > best.themeStrokesPerRound) best = t;
  }
  return best;
}

export function buildVerdict(rounds: ScoutingRound[], themes: ThemeNode[]): ScoutingVerdict {
  const full = rounds.filter(isFullRound);
  const n = full.length;

  if (rounds.length === 0) {
    return { sentence: 'No rounds on file yet, so there is nothing to scout.', tone: 'neutral', fullRounds: 0 };
  }
  if (n < VERDICT_MIN_ROUNDS) {
    const noun = n === 1 ? 'full round' : 'full rounds';
    return {
      sentence: `Only ${n === 0 ? 'no' : n} ${noun} on file, too few to call a form or a trend yet.`,
      tone: 'neutral',
      fullRounds: n,
    };
  }

  const toPar = full.map((r) => r.score_to_par as number);
  const avg = toPar.reduce((a, b) => a + b, 0) / n;
  const mid = Math.floor(n / 2);
  const recent = toPar.slice(0, mid);
  const prior = toPar.slice(mid);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
  const better = priorAvg - recentAvg; // lower to-par is better

  let trendClause = ', holding steady';
  let tone: ScoutingVerdict['tone'] = 'neutral';
  if (better >= TREND_THRESHOLD) {
    trendClause = `, ${better.toFixed(1)} a round better over the last ${recent.length} than the ${prior.length} before`;
    tone = 'good';
  } else if (better <= -TREND_THRESHOLD) {
    trendClause = `, ${Math.abs(better).toFixed(1)} a round worse over the last ${recent.length} than the ${prior.length} before`;
    tone = 'warn';
  }

  const lever = leverTheme(themes);
  const leverClause = lever ? `. ${lever.displayLabel} is the biggest lever` : '';

  return {
    sentence: `Averaging ${formatAverageToPar(avg)} across ${n} full rounds${trendClause}${leverClause}.`,
    tone,
    fullRounds: n,
  };
}

/* ---------------------------------------------------------------------------
 * Claims ("What matters" and the Watch list)
 * ------------------------------------------------------------------------- */

export type ReadQuality = 'solid' | 'fair' | 'thin';
export type BetterDirection = 'higher' | 'lower' | 'unknown';

/** Below this n, a claim is an early read and goes to the Watch list. */
export const THIN_N = 12;
/** At or above this n (and calibrated confidence), a read is solid. */
export const SOLID_N = 30;

export function readQuality(insight: EvidenceInsight): ReadQuality {
  const e = insight.evidence;
  const n = Number.isFinite(e.sample_n) ? e.sample_n : 0;
  const conf = Number.isFinite(e.confidence) ? e.confidence : 0;
  if (insight.lifecycle_state === 'tentative' || n < THIN_N || conf < 0.4) return 'thin';
  if (n >= SOLID_N && conf >= 0.7) return 'solid';
  return 'fair';
}

/** Words only. Never a percentage. */
export function readLabel(quality: ReadQuality, n: number): string {
  if (quality === 'solid') return 'Solid read';
  if (quality === 'fair') return `Fair read · n=${n}`;
  return `Early read · n=${n}`;
}

function directionFor(insight: EvidenceInsight): BetterDirection {
  const p = insight.evidence.polarity;
  if (p === 'higher_better') return 'higher';
  if (p === 'lower_better') return 'lower';
  return resolveMetricDirection(insight.evidence.metric);
}

/** Short, honest name for what a claim is compared against. */
export function comparisonName(source: InsightComparisonSource | undefined, label: string | undefined): string {
  switch (source) {
    case 'team_avg':
      return 'team';
    case 'pga_baseline':
      return 'Tour';
    case 'your_baseline':
      return 'own baseline';
    case 'd1_avg':
      return 'D1';
    case 'd2_avg':
      return 'D2';
    case 'd3_avg':
      return 'D3';
    case 'naia_avg':
      return 'NAIA';
    case 'juco_avg':
      return 'JUCO';
    case 'absolute_target':
    case 'estimated_target':
      return 'target';
    default:
      return label?.trim() || 'baseline';
  }
}

function sampleNoun(metric: string, n: number): string {
  if (metric.startsWith('putts_made') || metric.startsWith('putt_')) return `${n} putts`;
  if (metric.startsWith('approach_')) return `${n} approaches`;
  if (metric.startsWith('scrambling') || metric.startsWith('short_side')) return `${n} chances`;
  return `n=${n}`;
}

export interface ClaimComparison {
  name: string;
  valueText: string;
}

export type ClaimVisual =
  | {
      kind: 'bar';
      /** Gap oriented so positive = better for the player. */
      goodDelta: number;
      /** Signed gap in the metric's natural sign (you − comparison). */
      gapText: string;
      /** 0..1 share of the half-width the bar fills. */
      magnitude: number;
      tone: 'good' | 'warn' | 'neutral';
      baselineLabel: string;
    }
  | {
      kind: 'pair';
      from: number;
      to: number;
      fromText: string;
      toText: string;
      comparison: number | null;
      comparisonLabel: string | null;
      tone: 'good' | 'warn' | 'neutral';
      /** true → axis runs high-to-low so "right" always means better. */
      reversed: boolean;
    }
  | {
      kind: 'spark';
      points: number[];
      baseline: number | null;
      baselineLabel: string | null;
      tone: 'good' | 'warn' | 'neutral';
      reversed: boolean;
      caption: string;
    };

export interface ScoutingClaim {
  id: string;
  title: string;
  valueText: string | null;
  comparison: ClaimComparison | null;
  secondary: ClaimComparison | null;
  windowText: string;
  sampleText: string;
  weightText: string | null;
  movementText: string | null;
  quality: ReadQuality;
  qualityLabel: string;
  inferred: boolean;
  visual: ClaimVisual | null;
  /** Focus area this claim already backs, when one exists. */
  planAreaId: string | null;
  /** Server evidence-revision says the evidence changed since approval. */
  evidenceChangedInPlan: boolean;
  /** Plain-language accessible summary of the micro-visual. */
  summary: string;
  insight: EvidenceInsight;
}

function isHonestValue(insight: EvidenceInsight): boolean {
  const e = insight.evidence;
  if (!Number.isFinite(e.your_value)) return false;
  const display = (e.your_value_display ?? '').trim();
  return display !== '' && display !== '—' && display !== '-';
}

function toneFor(goodDelta: number, dir: BetterDirection): 'good' | 'warn' | 'neutral' {
  if (dir === 'unknown' || goodDelta === 0) return 'neutral';
  return goodDelta > 0 ? 'good' : 'warn';
}

/** Round metric ids that map exactly onto a per-round column. */
function roundSeriesFor(metric: string, rounds: ScoutingRound[]): number[] | null {
  const full = rounds.filter(isFullRound);
  const pick = (r: ScoutingRound): number | null => {
    switch (metric) {
      case 'putts_per_round':
        return r.total_putts ?? null;
      case 'gir_pct':
        return r.total_gir != null && r.total_gir_possible ? (r.total_gir / r.total_gir_possible) * 100 : null;
      case 'fairways_hit_pct':
      case 'fir_pct':
        return r.total_fairways_hit != null && r.total_fairways
          ? (r.total_fairways_hit / r.total_fairways) * 100
          : null;
      default:
        return null;
    }
  };
  const vals: number[] = [];
  for (const r of full) {
    const v = pick(r);
    if (v !== null && Number.isFinite(v)) vals.push(v);
  }
  if (vals.length < 5) return null;
  return vals.slice(0, 10).reverse(); // oldest → newest
}

function matchPlanArea(insight: EvidenceInsight, areas: ScoutingFocusArea[]): ScoutingFocusArea | null {
  const title = insight.title.trim().toLowerCase();
  return (
    areas.find((a) => a.from_insight_id && a.from_insight_id === insight.id) ??
    areas.find((a) => (a.title ?? '').trim().toLowerCase() === title) ??
    areas.find((a) => a.target_metric && a.target_metric === insight.evidence.metric) ??
    null
  );
}

export function buildClaim(
  insight: EvidenceInsight,
  rounds: ScoutingRound[],
  activeAreas: ScoutingFocusArea[],
): ScoutingClaim {
  const e = insight.evidence;
  const unit = e.unit;
  const n = Number.isFinite(e.sample_n) ? e.sample_n : 0;
  const quality = readQuality(insight);
  const dir = directionFor(insight);
  const honest = isHonestValue(insight);
  const compName = comparisonName(e.comparison_source, e.comparison_label);

  const comparison: ClaimComparison | null = Number.isFinite(e.comparison_value)
    ? { name: compName, valueText: formatInUnit(e.comparison_value, unit) }
    : null;
  const secondary: ClaimComparison | null =
    e.secondary_value !== undefined && Number.isFinite(e.secondary_value)
      ? { name: comparisonName(e.secondary_source, e.secondary_label), valueText: formatInUnit(e.secondary_value, unit) }
      : null;

  const start = formatMonthDay(e.window_start);
  const end = formatMonthDay(e.window_end);
  const windowText = start && end ? (start === end ? start : `${start}–${end}`) : `last ${e.window_days} days`;

  const weightText =
    Number.isFinite(e.strokes_impact) && e.strokes_impact >= 0.05
      ? `~${e.strokes_impact.toFixed(1)} strokes/rd vs ${compName}`
      : null;

  const mv = insight.metadata?.movement;
  const hasMovement =
    !!mv && Number.isFinite(mv.from) && Number.isFinite(mv.to) && mv.from !== mv.to;
  const movementText = hasMovement ? `was ${formatInUnit(mv!.from, unit)}` : null;

  let visual: ClaimVisual | null = null;
  let summary = '';
  if (honest && hasMovement) {
    const goodDelta = dir === 'lower' ? mv!.from - mv!.to : mv!.to - mv!.from;
    visual = {
      kind: 'pair',
      from: mv!.from,
      to: mv!.to,
      fromText: formatInUnit(mv!.from, unit),
      toText: formatInUnit(mv!.to, unit),
      comparison: Number.isFinite(e.comparison_value) ? e.comparison_value : null,
      comparisonLabel: comparison ? `${comparison.name} ${comparison.valueText}` : null,
      tone: toneFor(goodDelta, dir),
      reversed: dir === 'lower',
    };
    summary = `Moved from ${formatInUnit(mv!.from, unit)} to ${formatInUnit(mv!.to, unit)}${
      comparison ? `; ${comparison.name} is ${comparison.valueText}` : ''
    }.`;
  } else if (honest) {
    const series = roundSeriesFor(e.metric, rounds);
    if (series) {
      const last = series[series.length - 1]!;
      const base = Number.isFinite(e.comparison_value) ? e.comparison_value : null;
      const goodDelta = base === null ? 0 : dir === 'lower' ? base - last : last - base;
      visual = {
        kind: 'spark',
        points: series,
        baseline: base,
        baselineLabel: comparison ? `${comparison.name} ${comparison.valueText}` : null,
        tone: toneFor(goodDelta, dir),
        reversed: dir === 'lower',
        caption: `Last ${series.length} full rounds`,
      };
      summary = `Last ${series.length} full rounds, latest ${formatInUnit(last, unit)}${
        comparison ? ` against ${comparison.name} ${comparison.valueText}` : ''
      }.`;
    } else if (comparison) {
      const gap = e.your_value - e.comparison_value;
      const goodDelta = dir === 'lower' ? -gap : gap;
      const denom = Math.max(Math.abs(e.comparison_value), Math.abs(e.your_value), 1e-6);
      visual = {
        kind: 'bar',
        goodDelta,
        gapText: formatGap(gap, unit),
        magnitude: Math.min(1, Math.abs(gap) / denom),
        tone: toneFor(goodDelta, dir),
        baselineLabel: `${comparison.name} ${comparison.valueText}`,
      };
      const verb = dir === 'unknown' ? 'from' : goodDelta >= 0 ? 'ahead of' : 'behind';
      summary = `${formatGap(gap, unit)} ${verb} ${comparison.name} (${comparison.valueText}).`;
    }
  }

  const area = matchPlanArea(insight, activeAreas);

  return {
    id: insight.id,
    title: insight.title,
    valueText: honest ? e.your_value_display.trim() : null,
    comparison,
    secondary,
    windowText,
    sampleText: sampleNoun(e.metric, n),
    weightText,
    movementText,
    quality,
    qualityLabel: readLabel(quality, n),
    inferred: e.causality_level === 'inferred_hypothesis' || e.estimated === true,
    visual,
    planAreaId: area?.id ?? null,
    evidenceChangedInPlan: area?.evidence_revision_status === 'changed',
    summary,
    insight,
  };
}

export interface ClaimSplit {
  /** Up to three, in the engine's rank order (the rank IS the weight). */
  matters: ScoutingClaim[];
  /** Thin or value-less signals, drawn ghosted. */
  watch: ScoutingClaim[];
  /** Solid claims past the top three (rendered, never silently dropped). */
  alsoNoted: ScoutingClaim[];
}

export const MATTERS_COUNT = 3;

export function splitClaims(
  insights: EvidenceInsight[],
  rounds: ScoutingRound[],
  focusAreas: ScoutingFocusArea[],
): ClaimSplit {
  const active = activePlanAreas(focusAreas);
  const out: ClaimSplit = { matters: [], watch: [], alsoNoted: [] };
  for (const insight of insights) {
    const claim = buildClaim(insight, rounds, active);
    if (claim.quality === 'thin' || claim.valueText === null) out.watch.push(claim);
    else if (out.matters.length < MATTERS_COUNT) out.matters.push(claim);
    else out.alsoNoted.push(claim);
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * Plan ledger
 * ------------------------------------------------------------------------- */

const CLOSED_STATUSES = new Set(['completed', 'archived', 'cancelled', 'dismissed', 'declined', 'abandoned']);

export function activePlanAreas(areas: ScoutingFocusArea[]): ScoutingFocusArea[] {
  return areas.filter((a) => !CLOSED_STATUSES.has((a.status ?? 'active').toLowerCase()));
}

/** Formats a focus-area value; percent-like metrics get a % sign. */
export function formatPlanValue(value: number, metric: string | null): string {
  const pct = !!metric && /(_pct|percent|percentage|_rate)$/.test(metric);
  const text = trimNumber(value, Math.abs(value) < 10 ? 1 : 0);
  if (pct) return `${text}%`;
  if (metric && /proximity|_ft$|_feet/.test(metric)) return `${text} ft`;
  return text;
}

/* ---------------------------------------------------------------------------
 * "Evidence changed since you last looked" (client, per device)
 * ------------------------------------------------------------------------- */

export const SEEN_STORAGE_KEY = 'helm.scouting.evidence-seen.v1';

/** The evidence fields a coach reads; any change flips the badge once. */
export function evidenceSignature(insight: EvidenceInsight): string {
  const e = insight.evidence;
  return [e.your_value, e.comparison_value, e.secondary_value ?? '', e.sample_n, e.window_end].join('|');
}

/** Ids whose stored signature exists and differs from the live one. */
export function changedSinceSeen(
  insights: EvidenceInsight[],
  seen: Record<string, string>,
): Set<string> {
  const changed = new Set<string>();
  for (const i of insights) {
    const prev = seen[i.id];
    if (prev !== undefined && prev !== evidenceSignature(i)) changed.add(i.id);
  }
  return changed;
}
