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
  PatternSeverity,
} from '@/app/golf/actions/pattern-management';
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

const PATTERN_SEVERITY_MAP: Record<PatternSeverity, InsightPriority> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
};

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

/** Project a single evidence insight into the shared row shape. */
export function insightToSignalRow(insight: EvidenceInsight): SignalRow {
  const categoryLabel = titleCaseToken(insight.category) || 'Signal';
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
    confidenceWord: null,
    evidence: [],
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
  const impact = Math.abs(pattern.strokeImpact ?? 0);
  if (impact > 0) {
    return `Worth about ${impact.toFixed(1)} stroke${impact === 1 ? '' : 's'} per round — review the evidence and decide whether to address it.`;
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
    const impact = Math.abs(pattern.strokeImpact);
    evidence.push({
      label: 'Stroke impact',
      value: `${impact.toFixed(2)}/round`,
      gloss: impact >= 1.5 ? 'meaningful' : impact >= 0.8 ? 'moderate' : 'small',
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

  return {
    id: pattern.id,
    source: 'patterns',
    priority: PATTERN_SEVERITY_MAP[pattern.severity] ?? 'medium',
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
