import 'server-only';
import { createHash } from 'node:crypto';
import type { Measurement, ToolEnvelope } from '../provenance';
import { VISUAL_SCHEMA_VERSION, type SgLeg, type ValidatedVisualArtifact, type VisualRefusal, type VisualSpec } from './schema';

export type CompileResult = { ok: true; artifact: ValidatedVisualArtifact } | { ok: false; reason: VisualRefusal; message: string };

const refuse = (reason: VisualRefusal, message: string): CompileResult => ({ ok: false, reason, message });

/** The four legs a round's strokes gained is split into; `sg_total` is the whole, not a leg. */
const SG_LEGS = ['sg_tee', 'sg_approach', 'sg_around_green', 'sg_putting'] as const;
/** A cached average is rounded to two places; four legs can drift from the total by more than one rounding step. */
const RECONCILE_TOLERANCE = 0.1;

/** A figure written into a label must come from the data, so a label with a digit in it is not accepted. */
const hasDigit = (s: string) => /\p{N}/u.test(s);

const canonical = (value: unknown): string => JSON.stringify(value, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));

/**
 * The strokes-gained anatomy for one player: the legs that were read this turn, on one window, with the sample
 * behind each. Refuses, rather than drawing, anything that would imply more than the reads say.
 */
export function compileSgAnatomy(spec: VisualSpec, evidence: ReadonlyMap<string, ToolEnvelope>, now: Date = new Date()): CompileResult {
  // The title is drawn as written, so it may not carry a figure: every number on screen comes from the reads.
  if (hasDigit(spec.title)) return refuse('figure_in_text', 'The title may not contain a number; every figure comes from the reads. Write the title in words.');
  const envelopes: ToolEnvelope[] = [];
  for (const ref of spec.evidenceRefs) {
    const e = evidence.get(ref);
    if (!e) return refuse('unknown_evidence', `No read named ${ref} was made in this answer.`);
    envelopes.push(e);
  }
  const ms: Measurement[] = envelopes.flatMap((e) => e.measurements).filter((m) => m.unit === 'strokes' && m.metric_id.startsWith('sg_') && m.value !== null);
  if (ms.some((m) => m.coverage === 'unavailable')) return refuse('unavailable', 'A read behind this visual did not come back.');
  const players = new Map(ms.map((m) => [m.entity.id, m.entity]));
  if (players.size > 1) return refuse('mixed_players', 'The strokes gained reads are about more than one player.');
  const entity = [...players.values()][0];
  if (!entity || entity.kind !== 'player') return refuse('not_enough_legs', 'There are no strokes gained figures for a player in these reads.');

  const byMetric = new Map<string, Measurement>();
  for (const m of ms) {
    const had = byMetric.get(m.metric_id);
    if (had && (had.value !== m.value || had.sample_size !== m.sample_size)) return refuse('conflicting_values', `Two reads disagree on ${m.metric_label}.`);
    byMetric.set(m.metric_id, m);
  }
  const legs = SG_LEGS.flatMap((id) => (byMetric.has(id) ? [byMetric.get(id) as Measurement] : []));
  if (legs.length < 2) return refuse('not_enough_legs', 'Strokes gained for at least two parts of the game are needed to show an anatomy.');
  const windows = new Set([...byMetric.values()].map((m) => `${m.window_start ?? ''}|${m.window_end ?? ''}`));
  if (windows.size > 1) return refuse('mixed_windows', 'The strokes gained reads cover different date windows.');

  const total = byMetric.get('sg_total') ?? null;
  const sum = legs.reduce((a, m) => a + (m.value as number), 0);
  const allFour = legs.length === SG_LEGS.length;
  const reads = [...byMetric.values()];
  const sourceAsOf = reads.map((m) => m.as_of).sort()[0] as string;
  const outLegs: SgLeg[] = legs.map((m) => ({
    metricId: m.metric_id,
    label: m.metric_label.replace(/^strokes gained[:\s-]*/i, '').trim() || m.metric_label,
    value: m.value as number,
    sampleSize: m.sample_size,
    sampleUnit: m.sample_unit,
    coverage: m.coverage,
    coverageNote: m.coverage_note,
    source: m.source,
    method: m.method,
    asOf: m.as_of,
  }));
  const legIds = new Set(outLegs.map((l) => l.metricId));
  // The thread folds a read's own evidence block into the artifact (coachhelm-chat-thread.ts), so name only the reads
  // the artifact draws in full: at least one figure, every figure in it plotted (a leg, or the total), and no series or
  // detail beside them. A read named alongside (a team rounds read, a metric it does not plot) keeps its block.
  const plotted = new Set<string>([...legIds, ...(total ? ['sg_total'] : [])]);
  const drawnIn = (e: ToolEnvelope) =>
    e.measurements.length > 0 &&
    e.series.length === 0 &&
    e.detail == null &&
    e.measurements.every((m) => plotted.has(m.metric_id) && m.unit === 'strokes' && m.value !== null && m.entity.id === entity.id);
  const evidenceRefs = [...new Set(spec.evidenceRefs)].filter((ref) => drawnIn(evidence.get(ref) as ToolEnvelope));
  const coverage = reads.some((m) => m.coverage === 'partial' || m.coverage === 'empty') ? 'partial' : 'complete';
  const body = {
    kind: spec.kind,
    entity: { id: entity.id, label: entity.label },
    window: { start: legs[0]?.window_start ?? null, end: legs[0]?.window_end ?? null },
    legs: outLegs,
    total: total ? { value: total.value as number, sampleSize: total.sample_size, reconciles: allFour ? Math.abs(sum - (total.value as number)) <= RECONCILE_TOLERANCE : null } : null,
  };
  const dataHash = createHash('sha256').update(canonical(body)).digest('hex');
  return {
    ok: true,
    artifact: {
      artifactId: `va-${dataHash.slice(0, 12)}`,
      schemaVersion: VISUAL_SCHEMA_VERSION,
      title: spec.title,
      intent: spec.intent,
      ...body,
      sourceAsOf,
      coverage,
      highlightedMetricId: spec.highlightedMetricId && legIds.has(spec.highlightedMetricId) ? spec.highlightedMetricId : null,
      annotations: (spec.annotations ?? []).filter((a) => legIds.has(a.metricId) && !hasDigit(a.label)),
      evidenceRefs,
      dataHash,
      createdAt: now.toISOString(),
    },
  };
}

/** Compile whatever scene the spec names. A kind with no compiler is a refusal, never a blank card. */
export function compileVisual(spec: VisualSpec, evidence: ReadonlyMap<string, ToolEnvelope>, now?: Date): CompileResult {
  switch (spec.kind) {
    case 'sg_anatomy':
      return compileSgAnatomy(spec, evidence, now);
    default:
      return refuse('not_enough_legs', 'That kind of visual is not available yet.');
  }
}
