/**
 * Game Fingerprint view model: pure presentation logic, no React, no I/O.
 *
 * Everything here reads the `PlayerFingerprint` payload exactly as the data
 * layer returns it (`getPlayerFingerprint`). The payload carries strokes
 * gained only as the formatted `SG: …` metric strings inside each section, so
 * this module parses them back into numbers in ONE place (`parseSigned`).
 * A missing value is always `null`, never 0.
 *
 * Honesty rules encoded here (see audit/spec-player-analysis.md §3, §5, §6):
 *   - The waterfall total is the SUM of the measured category values. The
 *     payload has no `sg_total`, so it is labelled "net across N areas" and
 *     never "SG: Total".
 *   - The stats-cache window is lifetime ("all tracked rounds"), not "season".
 *   - The Form number is one line. Under 5 rounds it is an "Early read"; a
 *     value at 0 or 100 sits on the clamp and is never shown as a confident
 *     headline.
 *   - Confidence is a word, derived from confidence AND sample size, never a
 *     percentage.
 */

import type {
  PlayerFingerprint,
  SectionData,
  FingerprintMetric,
  FingerprintSgScope,
  FingerprintSgScopeKey,
} from '@/app/golf/actions/player-fingerprint-types';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import {
  describeFormFormula,
  FORM_EARLY_READ_BELOW,
  FORM_EARLY_READ_LABEL,
  FORM_MAX,
} from '@/lib/golf/form-score';

/* ── Numbers ─────────────────────────────────────────────────────────────── */

export const MINUS = '−';

/**
 * Parse a signed display string ("+0.4", "-3.8", "−3.8", "62%", "274 yd")
 * into a number. Returns null for anything that is not a finite number,
 * including "--" and "".
 */
export function parseSigned(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/−/g, '-').replace(/[^0-9.+-]/g, '');
  if (!/[0-9]/.test(cleaned)) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** "+0.4" / "−3.8" / "0.0" with a true minus sign for tabular alignment. */
export function formatSignedValue(value: number, decimals = 1): string {
  const fixed = Math.abs(value).toFixed(decimals);
  if (Number(fixed) === 0) return (0).toFixed(decimals);
  return value > 0 ? `+${fixed}` : `${MINUS}${fixed}`;
}

export function findMetric(section: SectionData, label: string): FingerprintMetric | null {
  return section.metrics.find((m) => m.label === label) ?? null;
}

export function metricNumber(section: SectionData, label: string): number | null {
  return parseSigned(findMetric(section, label)?.value);
}

/* ── Strokes gained ──────────────────────────────────────────────────────── */

export type SgAreaKey = 'tee' | 'approach' | 'short_game' | 'putting';

export const SG_AREAS: ReadonlyArray<{ key: SgAreaKey; label: string; short: string; metricLabel: string }> = [
  { key: 'tee', label: 'Off the tee', short: 'Tee', metricLabel: 'SG: Tee' },
  { key: 'approach', label: 'Approach', short: 'Approach', metricLabel: 'SG: Approach' },
  { key: 'short_game', label: 'Around the green', short: 'Short game', metricLabel: 'SG: Around green' },
  { key: 'putting', label: 'Putting', short: 'Putting', metricLabel: 'SG: Putting' },
];

/** The SG metric label for a section, or null when the section has none. */
export function sgMetricLabel(key: string): string | null {
  return SG_AREAS.find((a) => a.key === key)?.metricLabel ?? null;
}

export interface WaterfallStep {
  key: SgAreaKey;
  label: string;
  /** Strokes gained per round; null = not measured (no bar, total unmoved). */
  value: number | null;
  /** Running total before and after this step (equal when value is null). */
  start: number;
  end: number;
}

export interface Waterfall {
  steps: WaterfallStep[];
  /** Sum of the measured steps; null when nothing is measured. */
  net: number | null;
  measuredCount: number;
  /** Axis domain, always including 0. */
  domain: [number, number];
}

export function buildWaterfall(sections: PlayerFingerprint['sections']): Waterfall {
  return waterfallFromValues((key) => {
    const section = sections[key];
    const label = SG_AREAS.find((a) => a.key === key)!.metricLabel;
    return section ? metricNumber(section, label) : null;
  });
}

/* ── Scope switch (FP-09) ─────────────────────────────────────────────────── */

export interface SgScopeOption {
  key: FingerprintSgScopeKey;
  label: string;
  /** "the last 5 rounds" / "all 18 rounds", for the caption. */
  phrase: string;
}

const SCOPE_SIZE: Record<Exclude<FingerprintSgScopeKey, 'all'>, number> = { last5: 5, last10: 10 };

/**
 * The windows worth offering: a "last N" scope only when the player has more
 * than N countable rounds (otherwise it equals "all"), and only when at least
 * two scopes remain. An empty list means no switch.
 */
export function sgScopeOptions(scopes: readonly FingerprintSgScope[] | undefined): SgScopeOption[] {
  if (!scopes?.length) return [];
  const all = scopes.find((s) => s.key === 'all');
  if (!all || all.sgRounds === 0) return [];
  const options: SgScopeOption[] = [];
  for (const key of ['last5', 'last10'] as const) {
    const scope = scopes.find((s) => s.key === key);
    if (scope && all.rounds > SCOPE_SIZE[key] && scope.sgRounds > 0) {
      options.push({ key, label: `Last ${SCOPE_SIZE[key]}`, phrase: `the last ${SCOPE_SIZE[key]} rounds` });
    }
  }
  if (options.length === 0) return [];
  options.push({ key: 'all', label: 'All', phrase: `all ${all.rounds} ${all.rounds === 1 ? 'round' : 'rounds'}` });
  return options;
}

/** The waterfall for one scope's per-round strokes gained. */
export function buildScopeWaterfall(scope: FingerprintSgScope): Waterfall {
  return waterfallFromValues((key) => {
    const v = scope[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  });
}

function waterfallFromValues(valueFor: (key: SgAreaKey) => number | null): Waterfall {
  let running = 0;
  let measuredCount = 0;
  const steps: WaterfallStep[] = SG_AREAS.map((area) => {
    const value = valueFor(area.key);
    const start = running;
    if (value != null) {
      running += value;
      measuredCount += 1;
    }
    return { key: area.key, label: area.label, value, start, end: running };
  });
  const net = measuredCount > 0 ? running : null;
  const points = [0, ...steps.flatMap((s) => [s.start, s.end]), net ?? 0];
  return { steps, net, measuredCount, domain: niceDomain(Math.min(...points), Math.max(...points)) };
}

/** Round a [lo, hi] range outward to half-stroke steps, always spanning 0. */
export function niceDomain(lo: number, hi: number): [number, number] {
  const min = Math.min(0, lo);
  const max = Math.max(0, hi);
  if (min === 0 && max === 0) return [-1, 1];
  const step = max - min > 4 ? 1 : 0.5;
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step];
}

/** Map a value into 0..100 (%) across a domain. */
export function toPercentX(value: number, domain: [number, number]): number {
  const [lo, hi] = domain;
  if (hi === lo) return 50;
  return ((value - lo) / (hi - lo)) * 100;
}

/* ── Verdict ─────────────────────────────────────────────────────────────── */

const AREA_PHRASE: Record<SgAreaKey, string> = {
  tee: 'off the tee',
  approach: 'on approach',
  short_game: 'around the green',
  putting: 'on the greens',
};

const AREA_NOUN: Record<SgAreaKey, string> = {
  tee: 'Driving',
  approach: 'Approach play',
  short_game: 'The short game',
  putting: 'Putting',
};

function strokes(n: number): string {
  const v = Math.abs(n).toFixed(1);
  return `${v} ${v === '1.0' ? 'stroke' : 'strokes'}`;
}

/**
 * One sentence from real data only. Worst loss first, then the best gain.
 * Returns null when no category carries strokes gained.
 */
export function buildVerdict(waterfall: Waterfall): string | null {
  const measured = waterfall.steps.filter((s): s is WaterfallStep & { value: number } => s.value != null);
  if (measured.length === 0) return null;
  const byValue = [...measured].sort((a, b) => a.value - b.value);
  const worst = byValue[0]!;
  const best = byValue[byValue.length - 1]!;

  if (worst.value < 0 && best.value > 0) {
    return `Losing ${strokes(worst.value)} a round ${AREA_PHRASE[worst.key]}; ${AREA_NOUN[best.key].toLowerCase()} is a strength (${formatSignedValue(best.value)}).`;
  }
  if (worst.value < 0) {
    return measured.length > 1
      ? `Losing strokes in every measured area, most ${AREA_PHRASE[worst.key]} (${strokes(worst.value)} a round).`
      : `Losing ${strokes(worst.value)} a round ${AREA_PHRASE[worst.key]}.`;
  }
  if (best.value > 0) {
    return measured.length > 1
      ? `Gaining strokes in every measured area, most ${AREA_PHRASE[best.key]} (${formatSignedValue(best.value)} a round).`
      : `Gaining ${strokes(best.value)} a round ${AREA_PHRASE[best.key]}.`;
  }
  return 'Level with the baseline in every measured area.';
}

/* ── Form ────────────────────────────────────────────────────────────────── */

/**
 * Form is the ONE 0–100 score (OD-02), computed in src/lib/golf/form-score.ts.
 * This file only presents it: the early-read threshold, the label and the
 * formula text all come from that module, so the words cannot drift from the
 * number again (the old "80 − 3 ×" text outlived the formula it described).
 */
export const FORM_EARLY_ROUNDS = FORM_EARLY_READ_BELOW;

export type FormPresentation =
  | { kind: 'none'; rounds: number }
  | {
      kind: 'value';
      value: number;
      /** Rounds that fed the number (at most FORM_WINDOW). */
      rounds: number;
      /** Fewer than FORM_EARLY_READ_BELOW countable rounds behind the number. */
      early: boolean;
      /** "Early read" or null. */
      qualityLabel: string | null;
      /**
       * Form's curve never reaches 100, so the only reachable floor is 0
       * (a very high average plus the full pattern penalty). A 0 on the floor
       * is not a precise reading.
       */
      capped: 'bottom' | null;
      trendWord: 'improving' | 'slipping' | 'steady';
      /** The tap-to-explain lines, with this player's numbers. */
      formula: string[];
    };

export function presentForm(composite: PlayerFingerprint['composite']): FormPresentation {
  const form = composite.form;
  if (form.score == null || !Number.isFinite(form.score)) {
    return { kind: 'none', rounds: form.roundsCounted };
  }
  const value = Math.min(FORM_MAX, Math.max(0, Math.round(form.score)));
  const early = form.quality === 'early';
  return {
    kind: 'value',
    value,
    rounds: form.roundsInWindow,
    early,
    qualityLabel: early ? FORM_EARLY_READ_LABEL : null,
    capped: value <= 0 ? 'bottom' : null,
    trendWord: composite.trend === 'up' ? 'improving' : composite.trend === 'down' ? 'slipping' : 'steady',
    formula: describeFormFormula(form),
  };
}

/* ── Player voice (FP-03) ────────────────────────────────────────────────── */

/**
 * Engine copy is written for the coach ("Recommended: have the player call the
 * carry number…", src/lib/coachhelm/v3/engine/diagnosis.ts) and is stored in
 * the insight row, so the player's own Fingerprint printed instructions about
 * "the player". The player view reads it in the second person. Only the
 * phrasings the engine emits are rewritten; anything else passes through.
 */
const PLAYER_VOICE_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bthe player's\b/g, 'your'],
  [/\bThe player's\b/g, 'Your'],
  [/\bthe player\b/g, 'you'],
  [/\bThe player\b/g, 'You'],
  [/\bthis player's\b/g, 'your'],
  [/\bThis player's\b/g, 'Your'],
  [/\bthis player\b/g, 'you'],
  [/\bThis player\b/g, 'You'],
  [/\btogether\./g, 'with your coach.'],
];

export function toPlayerVoice(text: string): string;
export function toPlayerVoice(text: string | null): string | null;
export function toPlayerVoice(text: string | null): string | null {
  if (!text) return text;
  // "Recommended: have the player call…" → "Recommended: Call…"; a sentence
  // that starts "Have the player…" keeps its capital the same way.
  let out = text.replace(
    /(^|[.:!?]\s+)[Hh]ave the player\s+([a-z])/g,
    (_m, lead: string, ch: string) => lead + ch.toUpperCase(),
  );
  out = out.replace(/\bhave the player\s+/g, '');
  for (const [re, to] of PLAYER_VOICE_RULES) out = out.replace(re, to);
  return out;
}

/* ── Claims (insights) ───────────────────────────────────────────────────── */

export type ConfidenceWord = 'Solid read' | 'Fair read' | 'Early read';

/**
 * Engine confidence is roughly min(n/30, 1), so it can read "100%" on a thin
 * sample (reconcile #8). The word uses both inputs and takes the weaker.
 */
export function confidenceWord(confidence: number | null | undefined, sampleN: number | null | undefined): ConfidenceWord {
  const c = typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0;
  const n = typeof sampleN === 'number' && Number.isFinite(sampleN) ? sampleN : 0;
  if (n < 10 || c < 0.5) return 'Early read';
  if (n >= 30 && c >= 0.8) return 'Solid read';
  return 'Fair read';
}

const UNIT_SUFFIX: Record<string, string> = {
  percent: '%',
  feet: ' ft',
  yards: ' yd',
  strokes: '',
  count: '',
};

function hasUnitAlready(display: string): boolean {
  return /[%a-z]/i.test(display);
}

function formatWithUnit(value: number, unit: string): string {
  const decimals = unit === 'percent' || unit === 'yards' ? 0 : 1;
  return `${value.toFixed(decimals)}${UNIT_SUFFIX[unit] ?? ''}`;
}

export function describeWindow(days: number | null | undefined): string | null {
  if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) return null;
  if (days >= 360) return `last ${Math.round(days / 30)} months`;
  return `last ${Math.round(days)} days`;
}

export interface ClaimView {
  id: string;
  title: string;
  body: string | null;
  /** "47%" — the unit is read from `evidence.unit`, never inferred twice. */
  value: string | null;
  /** "team avg 58%" */
  comparison: string | null;
  /** better / worse than the comparison, only when polarity is declared. */
  tone: 'good' | 'bad' | 'neutral';
  window: string | null;
  sample: string | null;
  confidence: ConfidenceWord;
  /** "Worth about 0.6 strokes a round" */
  impact: string | null;
  tags: string[];
  movement: string | null;
  acknowledged: boolean;
  drills: Array<{ id: string; title: string; minutes: number | null }>;
}

export function buildClaim(insight: EvidenceInsight): ClaimView {
  const ev = insight.evidence ?? ({} as EvidenceInsight['evidence']);
  const unit = (ev.unit as string | undefined) ?? '';
  const display = typeof ev.your_value_display === 'string' ? ev.your_value_display.trim() : '';
  let value: string | null = null;
  if (display) value = hasUnitAlready(display) ? display : `${display}${UNIT_SUFFIX[unit] ?? ''}`;
  else if (typeof ev.your_value === 'number' && Number.isFinite(ev.your_value)) value = formatWithUnit(ev.your_value, unit);

  let comparison: string | null = null;
  if (typeof ev.comparison_value === 'number' && Number.isFinite(ev.comparison_value) && ev.comparison_label) {
    comparison = `${ev.comparison_label} ${formatWithUnit(ev.comparison_value, unit)}`;
  }

  let tone: ClaimView['tone'] = 'neutral';
  if (
    ev.polarity &&
    typeof ev.your_value === 'number' &&
    typeof ev.comparison_value === 'number' &&
    ev.your_value !== ev.comparison_value
  ) {
    const better = ev.polarity === 'higher_better' ? ev.your_value > ev.comparison_value : ev.your_value < ev.comparison_value;
    tone = better ? 'good' : 'bad';
  }

  const n = typeof ev.sample_n === 'number' && Number.isFinite(ev.sample_n) ? ev.sample_n : null;
  const impactRaw = Number(ev.strokes_impact ?? 0);
  const impact =
    Number.isFinite(impactRaw) && Math.abs(impactRaw) >= 0.05
      ? `Worth about ${Math.abs(impactRaw).toFixed(1)} ${Math.abs(impactRaw).toFixed(1) === '1.0' ? 'stroke' : 'strokes'} a round`
      : null;

  const tags: string[] = [];
  if (ev.estimated) tags.push('estimated');
  if (ev.causality_level === 'inferred_hypothesis') tags.push('inferred');
  else if (ev.causality_level === 'observed_sequence') tags.push('measured');

  const mv = insight.metadata?.movement;
  let movement: string | null = null;
  if (mv && typeof mv.from === 'number' && typeof mv.to === 'number') {
    movement = `was ${formatWithUnit(mv.from, unit)}`;
  }

  return {
    id: insight.id,
    title: insight.title,
    body: insight.content ? insight.content : null,
    value,
    comparison,
    tone,
    window: describeWindow(ev.window_days),
    sample: n != null ? `${n} ${n === 1 ? 'sample' : 'samples'}` : null,
    confidence: insight.lifecycle_state === 'tentative' ? 'Early read' : confidenceWord(ev.confidence, n),
    impact,
    tags,
    movement,
    acknowledged: insight.status === 'acknowledged',
    drills: (insight.drills ?? []).map((d) => ({ id: d.id, title: d.title, minutes: d.duration_min ?? null })),
  };
}

/* ── Areas ───────────────────────────────────────────────────────────────── */

export interface AreaView {
  key: SectionData['key'];
  title: string;
  /** SG per round for the four SG areas; null otherwise or when unmeasured. */
  sg: number | null;
  /** Nothing to draw and nothing to say: collapsed into the one summary line. */
  empty: boolean;
  section: SectionData;
}

export function buildAreas(
  ordered: SectionData[],
  waterfall: Waterfall,
  hasAddendum: (key: SectionData['key']) => boolean,
): AreaView[] {
  return ordered.map((section) => {
    const step = waterfall.steps.find((s) => s.key === section.key);
    const empty = section.sparse && section.insights.length === 0 && !hasAddendum(section.key);
    return {
      key: section.key,
      title: SG_AREAS.find((a) => a.key === section.key)?.label ?? section.category,
      sg: step?.value ?? null,
      empty,
      section,
    };
  });
}

/** "Pressure and Scoring" / "Pressure, Scoring and Putting". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/* ── Putting bands ───────────────────────────────────────────────────────── */

export interface PuttBand {
  label: string;
  /** null = gap (no data for the band). A real 0% is 0 and is drawn (FP-05:
   *  the data layer passes null through instead of coercing it to 0). */
  pct: number | null;
}

export function puttingBands(section: SectionData): PuttBand[] {
  const chart = section.chart_data;
  if (!chart || chart.kind !== 'bars') return [];
  return chart.bars.map((b) => ({
    label: b.label.replace(/-/g, '–'),
    pct: typeof b.value === 'number' && Number.isFinite(b.value) ? Math.round(b.value) : null,
  }));
}
