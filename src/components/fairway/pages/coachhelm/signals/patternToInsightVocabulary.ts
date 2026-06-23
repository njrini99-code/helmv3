/**
 * ============================================================================
 * Fairway · CoachHelm · Signals · patternToInsightVocabulary (PURE ADAPTER)
 * ----------------------------------------------------------------------------
 * The cohesion seam that lets a mined PATTERN render under the SAME
 * InsightCard / InsightPanel vocabulary as an evidence INSIGHT — so a coach
 * sees ONE product, not "two unrelated CoachHelm systems" (cohesionResolution
 * "SIGNALS IS ONE COMPONENT").
 *
 * It does NOT fetch, NOT mutate, NOT touch a server action — it is a pure
 * projection of `ExtendedPattern` (from pattern-management.ts#getTeamPatterns,
 * consumed UNCHANGED) into a normalized `SignalRow` the surface renders. The
 * statistician fields (lift / conviction / stroke impact) are demoted into an
 * evidence block + translated into a plain-language "so what" headline and a
 * confidence word, per the Patterns mustFix:
 *   "add plain-language 'so what' + confidence translation … demote raw
 *    lift/conviction/stroke-impact into an evidence Inset."
 *
 * It also projects evidence INSIGHTS (`EvidenceInsight`, consumed UNCHANGED
 * from insight-delivery.ts#getInsightsForCoach) into the SAME `SignalRow`, so
 * the surface has exactly one row shape to render regardless of source.
 *
 * PURE — no React, no 'use client', no imports from the app's mutation layer.
 * Only the two server-action ROW TYPES are imported for their shapes.
 * ========================================================================== */

import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type {
  ExtendedPattern,
  PatternLifecycleState,
} from '@/app/golf/actions/pattern-management';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import type { InsightPriority } from '@/components/fairway/cards-insight/InsightCard';

/* ───────────────────────────────────────────────────────────────────────────
 * The normalized row both sources project into.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Which engine produced the signal — drives the per-source action set. */
export type SignalSource = 'insights' | 'patterns';

/** A single evidence line rendered inside the shared evidence Inset. */
export interface SignalEvidenceLine {
  label: string;
  value: string;
  /** Optional plain-language gloss shown muted beside the value. */
  gloss?: string;
}

/**
 * The ONE normalized shape the Signals surface renders under InsightCard /
 * InsightPanel — whether the underlying row is an insight or a pattern.
 */
export interface SignalRow {
  /** Stable id (the underlying insight.id or pattern.id). */
  id: string;
  source: SignalSource;
  /** Mapped to InsightCard/InsightPanel `priority` (shared tone vocabulary). */
  priority: InsightPriority;
  /** Plain-language "so what" headline (Fraunces title on hero/panel). */
  title: string;
  /** The narrative body (a coach-readable sentence). */
  body: string;
  /** Small uppercase eyebrow ("Putting · Pattern", "Tee · Signal"). */
  overline: string;
  /** Player this signal is about (for grouping + focus-area conversion). */
  playerId: string;
  /** Resolved player name when the source carries it (patterns do; insights
   *  don't — the surface falls back to the id when absent). */
  playerName?: string;
  /** Category/type token used for the category filter + grouping. */
  category: string | null;
  /** Lifecycle/status token used for the status filter + status chip. */
  status: string;
  /** ISO created-at, used for "new this week" smart default + sort. */
  createdAt: string;
  /** Translated confidence word (never a raw 0–1 number to a coach). */
  confidenceWord: 'High confidence' | 'Moderate confidence' | 'Early signal' | null;
  /** The demoted statistician fields, already humanized. */
  evidence: SignalEvidenceLine[];
  /**
   * Pattern-type sort rank — compound=3, conditional=2, temporal=1, contextual=0
   * (unknown/other → 0). Set ONLY by `patternToSignalRow`; insights leave it
   * undefined. ADDITIVE/OPTIONAL so the patterns-only sort can read it without
   * affecting the insights/alerts surfaces (which never set it). Read-time only —
   * derived from genuine `pattern_type`, never persisted.
   */
  patternTypeRank?: number;
  /**
   * The signed stroke_impact carried through for the patterns-only sort
   * tiebreak (magnitude-desc). Undefined for insights. Additive/optional.
   */
  strokeImpact?: number | null;
  /** The original row, kept so action handlers can read whatever they need. */
  raw: EvidenceInsight | ExtendedPattern;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Priority / severity → shared InsightCard tone
 * ─────────────────────────────────────────────────────────────────────────── */

const INSIGHT_PRIORITY_MAP: Record<EvidenceInsight['priority'], InsightPriority> = {
  urgent: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
};

/**
 * NOTE (pattern-noise fix): the `golf_patterns_v2.severity` column defaults to
 * 'medium' and is effectively 'medium' for ~all rows, so mapping it 1:1 (the
 * removed `PATTERN_SEVERITY_MAP[pattern.severity]` path) collapsed every pattern
 * into the SAME priority bucket and buried the few real-signal
 * conditional/compound patterns under the contextual flood. We now DERIVE a
 * pattern's priority from `pattern_type` + |stroke_impact| (see
 * `derivePatternPriority`) at read/adapter time — NO DB write, no severity
 * fabrication.
 *
 * Local replica of the `calculateSeverity` thresholds in
 * pattern-management.ts (which is a server-only 'use server' module — must NOT
 * be imported into this client adapter). Read-time only; fabricates nothing —
 * it maps a GENUINE |stroke_impact| onto the shared InsightPriority tiers.
 *   |impact| >= 2.5 → critical, >= 1.5 → high, >= 0.8 → medium, else low.
 */
function impactToPriority(strokeImpact: number): InsightPriority {
  const absImpact = Math.abs(strokeImpact);
  if (absImpact >= 2.5) return 'critical';
  if (absImpact >= 1.5) return 'high';
  if (absImpact >= 0.8) return 'medium';
  return 'low';
}

/**
 * The pattern-type sort rank — drives the patterns-only [type rank desc] sort
 * so compound/conditional real-signal patterns float above the contextual
 * noise. compound=3, conditional=2, temporal=1, contextual & everything else=0.
 */
function patternTypeRank(patternType: string | null | undefined): number {
  switch (patternType) {
    case 'compound':
      return 3;
    case 'conditional':
      return 2;
    case 'temporal':
      return 1;
    default:
      // contextual + anomaly/regression/sequence/cluster + unknown → lowest.
      return 0;
  }
}

/**
 * Derive a pattern's SignalRow priority from its TYPE + genuine stroke_impact,
 * NOT from the all-'medium' severity column.
 *  • contextual → capped at 'low' regardless of impact (it is the low-value
 *    noise tier — −0.33 avg — that must not crowd the priority lanes).
 *  • conditional / compound / temporal (and any other non-contextual type) →
 *    the calculateSeverity tiers applied to |stroke_impact|.
 *  • no usable stroke_impact → 'low' (never fabricate a higher tier).
 */
function derivePatternPriority(
  patternType: string | null | undefined,
  strokeImpact: number | null | undefined,
): InsightPriority {
  if (patternType === 'contextual') return 'low';
  if (typeof strokeImpact !== 'number' || Number.isNaN(strokeImpact)) return 'low';
  return impactToPriority(strokeImpact);
}

/* ───────────────────────────────────────────────────────────────────────────
 * Confidence translation — the Patterns mustFix "confidence translation".
 * A coach should read a WORD, never a bare 0.83.
 * ─────────────────────────────────────────────────────────────────────────── */

function translateConfidence(
  confidence: number | null | undefined,
  sampleSize: number | null | undefined,
): SignalRow['confidenceWord'] {
  if (confidence == null) return null;
  // Low-N honesty: a high confidence on a tiny sample is an "early signal",
  // never authoritative — never fabricate certainty (residual low-N rule).
  if (sampleSize != null && sampleSize < 5) return 'Early signal';
  if (confidence >= 0.75) return 'High confidence';
  if (confidence >= 0.5) return 'Moderate confidence';
  return 'Early signal';
}

/* ───────────────────────────────────────────────────────────────────────────
 * Small humanizers (no fabrication — only formatting of present values)
 * ─────────────────────────────────────────────────────────────────────────── */

function titleCaseToken(token: string | null | undefined): string {
  if (!token) return '';
  return token
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const PATTERN_STATUS_LABEL: Record<PatternLifecycleState, string> = {
  detected: 'Detected',
  confirmed: 'Confirmed',
  addressed: 'Addressed',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

/* ───────────────────────────────────────────────────────────────────────────
 * INSIGHT → SignalRow
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Project the insight's structured `evidence` JSON into the SAME humanized
 * evidence lines a pattern produces, so an insight card on /alerts carries the
 * same evidence depth as a pattern card (the surface is literally named for it).
 * Nothing is fabricated — every line is gated on a value being present on the
 * row. Mirrors the pattern adapter's "demote the statistician fields into an
 * evidence Inset" contract.
 */
function insightEvidenceLines(ev: InsightEvidence | null | undefined): SignalEvidenceLine[] {
  if (!ev || typeof ev !== 'object') return [];
  const lines: SignalEvidenceLine[] = [];

  // The measured metric: prefer the human display string, gloss with the label.
  if (typeof ev.your_value_display === 'string' && ev.your_value_display.length > 0) {
    lines.push({
      label: ev.metric_label || 'Your value',
      value: ev.your_value_display,
    });
  }

  // The comparison tick (typically team avg / Tour benchmark) — only when both
  // a label and a usable value are present.
  if (
    typeof ev.comparison_label === 'string' &&
    ev.comparison_label.length > 0 &&
    typeof ev.comparison_value === 'number' &&
    Number.isFinite(ev.comparison_value)
  ) {
    lines.push({
      label: ev.comparison_label,
      value: formatComparisonValue(ev.comparison_value),
    });
  }

  // Stroke impact — preserve the sign (gained vs lost), same convention as the
  // pattern adapter, so the two sources read identically.
  if (typeof ev.strokes_impact === 'number' && Number.isFinite(ev.strokes_impact)) {
    const impact = ev.strokes_impact;
    const magnitude = Math.abs(impact);
    const signed = `${impact > 0 ? '+' : ''}${impact.toFixed(2)}`;
    const tier = magnitude >= 1.5 ? 'meaningful' : magnitude >= 0.8 ? 'moderate' : 'small';
    lines.push({
      label: 'Stroke impact',
      value: `${signed}/round`,
      gloss: `${tier} · ${impact > 0 ? 'gained' : impact < 0 ? 'lost' : 'neutral'}`,
    });
  }

  // Sample size — the honesty anchor behind the confidence word.
  if (typeof ev.sample_n === 'number' && Number.isFinite(ev.sample_n) && ev.sample_n > 0) {
    lines.push({
      label: 'Sample',
      value: `${ev.sample_n} round${ev.sample_n === 1 ? '' : 's'}`,
    });
  }

  return lines;
}

/** Format a numeric comparison value without over-claiming precision. */
function formatComparisonValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Project a single evidence insight into the shared row shape. */
export function insightToSignalRow(insight: EvidenceInsight): SignalRow {
  const categoryLabel = titleCaseToken(insight.category) || 'Signal';
  const ev = insight.evidence;
  return {
    id: insight.id,
    source: 'insights',
    priority: INSIGHT_PRIORITY_MAP[insight.priority] ?? 'medium',
    title: insight.title,
    body: insight.content ?? '',
    overline: `${categoryLabel} · Signal`,
    playerId: insight.player_id,
    playerName: undefined,
    category: insight.category,
    status: insight.status,
    createdAt: insight.created_at,
    // Translate the insight's confidence (0..1) into a coach-readable word using
    // the SAME translator + low-N rule the pattern adapter uses, so a coach never
    // sees a bare 0.83 and a high confidence on a tiny sample reads "Early signal".
    confidenceWord: ev
      ? translateConfidence(ev.confidence, ev.sample_n)
      : null,
    evidence: insightEvidenceLines(ev),
    raw: insight,
  };
}

/* ───────────────────────────────────────────────────────────────────────────
 * PATTERN → SignalRow (the headline rewrite + statistician demotion)
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Build the plain-language "so what" headline for a pattern. Prefers the
 * engine's own description; otherwise composes a coach-readable sentence from
 * the (present) condition labels + outcome — never invents numbers.
 */
function patternHeadline(pattern: ExtendedPattern): string {
  if (pattern.description && pattern.description.trim().length > 0) {
    return pattern.description.trim();
  }
  const player = pattern.playerName ? `${pattern.playerName}: ` : '';
  const conditionLabel =
    pattern.conditions?.[0]?.label ??
    titleCaseToken(pattern.conditions?.[0]?.field) ??
    '';
  const outcomeMetric = titleCaseToken(pattern.outcome?.metric);
  const dir =
    pattern.outcome?.direction === 'increase'
      ? 'rises'
      : pattern.outcome?.direction === 'decrease'
        ? 'drops'
        : 'shifts';
  if (conditionLabel && outcomeMetric) {
    return `${player}When ${conditionLabel.toLowerCase()}, ${outcomeMetric.toLowerCase()} ${dir}`;
  }
  return `${player}${titleCaseToken(pattern.patternType)} pattern detected`;
}

/** The body sentence — the recommendation if present, else a quiet fallback. */
function patternBody(pattern: ExtendedPattern): string {
  if (pattern.recommendation && pattern.recommendation.trim().length > 0) {
    return pattern.recommendation.trim();
  }
  // Preserve the SIGN of stroke_impact: a negative value is strokes LOST
  // (harmful), a positive value is strokes GAINED (helpful). Math.abs would
  // erase that distinction and read a −0.33 contextual identically to a
  // helpful +0.33. We keep magnitude in the copy but make the direction explicit.
  const impact = pattern.strokeImpact ?? 0;
  const magnitude = Math.abs(impact);
  if (magnitude > 0) {
    const direction = impact > 0 ? 'gained' : 'lost';
    return `Worth about ${magnitude.toFixed(1)} stroke${magnitude === 1 ? '' : 's'} ${direction} per round — review the evidence and decide whether to address it.`;
  }
  return 'Review the supporting evidence and decide whether this is worth a focus area.';
}

/**
 * Project a single mined pattern into the shared row shape — the statistician
 * fields are demoted into the `evidence` lines + a confidence WORD.
 */
export function patternToSignalRow(pattern: ExtendedPattern): SignalRow {
  const categoryLabel = titleCaseToken(pattern.patternType) || 'Pattern';
  const lifecycle = (pattern.lifecycleState ?? 'detected') as PatternLifecycleState;

  const evidence: SignalEvidenceLine[] = [];
  if (typeof pattern.strokeImpact === 'number') {
    // Preserve the SIGN: a positive value is strokes GAINED (helpful), a
    // negative value is strokes LOST (harmful). Dropping Math.abs here is what
    // lets a coach distinguish a +1.46 conditional signal from a −0.33
    // contextual one — they previously read identically.
    const impact = pattern.strokeImpact;
    const magnitude = Math.abs(impact);
    const signed = `${impact > 0 ? '+' : ''}${impact.toFixed(2)}`;
    const tier = magnitude >= 1.5 ? 'meaningful' : magnitude >= 0.8 ? 'moderate' : 'small';
    evidence.push({
      label: 'Stroke impact',
      value: `${signed}/round`,
      gloss: `${tier} · ${impact > 0 ? 'gained' : impact < 0 ? 'lost' : 'neutral'}`,
    });
  }
  if (typeof pattern.confidence === 'number') {
    evidence.push({
      label: 'Confidence',
      value: `${Math.round(pattern.confidence * 100)}%`,
    });
  }
  if (typeof pattern.lift === 'number') {
    evidence.push({
      label: 'Lift',
      value: `${pattern.lift.toFixed(1)}×`,
      gloss: 'vs. random',
    });
  }
  if (typeof pattern.sampleSize === 'number') {
    evidence.push({
      label: 'Sample',
      value: `${pattern.sampleSize} round${pattern.sampleSize === 1 ? '' : 's'}`,
    });
  }
  if (typeof pattern.occurrenceCount === 'number') {
    evidence.push({
      label: 'Occurrences',
      value: String(pattern.occurrenceCount),
    });
  }
  // Actionability (0-1) — the de65bcf3 signal for "is this worth a focus area?".
  // Persisted on golf_patterns_v2 but previously only shown in the dead v2
  // PatternCard; surface it here so it reaches the live Signals path.
  if (typeof pattern.actionability === 'number') {
    const pct = Math.round(pattern.actionability * 100);
    const tier =
      pattern.actionability >= 0.7
        ? 'highly actionable'
        : pattern.actionability >= 0.4
          ? 'moderately actionable'
          : 'situational';
    evidence.push({ label: 'Actionability', value: `${pct}%`, gloss: tier });
  }

  return {
    id: pattern.id,
    source: 'patterns',
    // Priority is DERIVED from pattern_type + genuine stroke_impact — NOT the
    // all-'medium' severity column (which would bucket every pattern the same
    // and bury the real signal). contextual is capped at 'low'.
    priority: derivePatternPriority(pattern.patternType, pattern.strokeImpact),
    title: patternHeadline(pattern),
    body: patternBody(pattern),
    overline: `${categoryLabel} · Pattern`,
    playerId: pattern.playerId,
    playerName: pattern.playerName,
    category: pattern.patternType,
    status: PATTERN_STATUS_LABEL[lifecycle] ?? titleCaseToken(lifecycle),
    createdAt: pattern.firstDetected ?? pattern.lastOccurrence ?? new Date().toISOString(),
    confidenceWord: translateConfidence(pattern.confidence, pattern.sampleSize),
    evidence,
    // Additive sort keys for the patterns-only ordering (compound > conditional
    // > temporal > contextual, then magnitude). Insights never set these.
    patternTypeRank: patternTypeRank(pattern.patternType),
    strokeImpact: typeof pattern.strokeImpact === 'number' ? pattern.strokeImpact : null,
    raw: pattern,
  };
}

/** Batch helper: project an array of patterns. */
export function patternsToSignalRows(patterns: ExtendedPattern[]): SignalRow[] {
  return patterns.map(patternToSignalRow);
}

/** Batch helper: project an array of insights. */
export function insightsToSignalRows(insights: EvidenceInsight[]): SignalRow[] {
  return insights.map(insightToSignalRow);
}
