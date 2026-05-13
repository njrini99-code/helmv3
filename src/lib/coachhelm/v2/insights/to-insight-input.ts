import type {
  InsightCategory,
  InsightEvidence,
  InsightInput,
  InsightUnit,
} from './types';

const MIN_SAMPLE_N = 5;
const DEFAULT_WINDOW_DAYS = 90;

export interface InsightRecordForUpsert {
  coach_id: string;
  team_id: string;
  insight_type: string;
  player_id: string | null;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

function clamp01(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(1, Math.max(0, numeric));
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function categoryFor(record: InsightRecordForUpsert): InsightCategory {
  const type = record.insight_type;
  const patternType = String(record.metadata.pattern_type ?? '');
  const titleAndContent = `${record.title} ${record.content}`.toLowerCase();

  if (type === 'tournament_pressure' || titleAndContent.includes('pressure')) return 'pressure';
  if (type === 'par_3_issues' || titleAndContent.includes('par 3')) return 'scoring';
  if (type === 'closing_holes') return 'course_management';
  if (type === 'pattern_detected') {
    if (patternType.includes('tee')) return 'tee';
    if (patternType.includes('approach')) return 'approach';
    if (patternType.includes('short') || patternType.includes('scrambl')) return 'short_game';
    if (patternType.includes('putt')) return 'putting';
    if (patternType.includes('pressure')) return 'pressure';
    if (patternType.includes('course')) return 'course_management';
  }
  if (titleAndContent.includes('putt')) return 'putting';
  if (titleAndContent.includes('tee') || titleAndContent.includes('driver')) return 'tee';
  if (titleAndContent.includes('approach') || titleAndContent.includes('gir')) return 'approach';
  if (titleAndContent.includes('scrambl') || titleAndContent.includes('short game')) return 'short_game';
  if (titleAndContent.includes('mental') || titleAndContent.includes('pressure')) return 'pressure';
  if (titleAndContent.includes('course') || titleAndContent.includes('strategy')) return 'course_management';
  return 'scoring';
}

function evidenceUnit(metadata: Record<string, unknown>): InsightUnit {
  if (numberValue(metadata.stroke_impact) !== null || numberValue(metadata.stroke_impact_score) !== null) {
    return 'strokes';
  }
  if (numberValue(metadata.confidence) !== null) return 'percent';
  return 'count';
}

function valueDisplay(value: number, unit: InsightUnit): string {
  if (unit === 'percent') return `${Math.round(value * 100)}%`;
  if (unit === 'strokes') return `${value.toFixed(1)} strokes`;
  return String(Math.round(value));
}

function stableSignature(record: InsightRecordForUpsert, category: InsightCategory): string {
  const scope = record.player_id ?? `team_${record.team_id}`;
  const patternId = typeof record.metadata.pattern_id === 'string' ? record.metadata.pattern_id : null;
  const suffix = patternId ?? slug(record.title);
  return `${scope}:${record.insight_type}:${category}:${suffix}`;
}

function buildEvidence(record: InsightRecordForUpsert, category: InsightCategory): InsightEvidence {
  const metadata = record.metadata ?? {};
  const now = new Date();
  const windowEnd = now.toISOString();
  const windowStart = new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const confidence = clamp01(metadata.confidence, 0.5);
  const support = numberValue(metadata.sample_n)
    ?? numberValue(metadata.sampleSize)
    ?? numberValue(metadata.occurrence_count)
    ?? numberValue(metadata.support);
  const sampleN = Math.max(MIN_SAMPLE_N, Math.round(support ?? MIN_SAMPLE_N));
  const unit = evidenceUnit(metadata);
  const strokeImpact = Math.abs(
    numberValue(metadata.stroke_impact)
      ?? numberValue(metadata.stroke_impact_score)
      ?? numberValue(metadata.prediction_value)
      ?? confidence,
  );
  const yourValue = unit === 'percent'
    ? confidence
    : strokeImpact;
  const comparisonValue = unit === 'percent'
    ? Math.max(0.01, Math.min(1, confidence * 0.9))
    : Math.max(0.01, yourValue * 0.9);

  return {
    metric: `${record.insight_type}_${category}`,
    metric_label: record.title,
    unit,
    your_value: yourValue,
    your_value_display: valueDisplay(yourValue, unit),
    comparison_value: comparisonValue,
    comparison_label: record.player_id ? 'Recent baseline' : 'Team baseline',
    comparison_source: record.player_id ? 'your_baseline' : 'team_avg',
    sample_n: sampleN,
    window_days: DEFAULT_WINDOW_DAYS,
    window_start: windowStart,
    window_end: windowEnd,
    strokes_impact: strokeImpact,
    strokes_impact_method: numberValue(metadata.stroke_impact) !== null
      ? 'historical_correlation'
      : 'rough_estimate',
    confidence: 0,
    confidence_factors: {
      sample_adequacy: Math.min(1, sampleN / 20),
      recency: 1,
      variance: confidence,
    },
    detail: {
      source: 'v2_legacy_adapter',
      insight_type: record.insight_type,
    },
  };
}

export function toInsightInput(record: InsightRecordForUpsert): InsightInput {
  const category = categoryFor(record);
  return {
    player_id: record.player_id,
    coach_id: record.coach_id,
    team_id: record.team_id,
    category,
    insight_type: record.insight_type,
    signature: stableSignature(record, category),
    title: record.title,
    content: record.content,
    evidence: buildEvidence(record, category),
    metadata: {
      ...record.metadata,
      v2_adapter: true,
    },
  };
}
