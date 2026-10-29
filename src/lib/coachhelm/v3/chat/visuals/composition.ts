/**
 * ============================================================================
 * CoachHelm chat · visual compositions · the protocol
 * ----------------------------------------------------------------------------
 * The free-form sibling of the fixed `sg_anatomy` scene. The model DESIGNS the
 * visual: which building blocks, in what order, what is emphasised, the title,
 * the one-line takeaway and up to three short notes. It never supplies a value:
 * every number on screen is copied by trusted code (`compile-composition.ts`)
 * from a read this turn, so a composition can be as varied as the question and
 * still never draw a figure nobody measured.
 *
 * The playbook the model composes by lives in the `show_visual` tool
 * description (`agent-tools.ts`) and `docs/architecture/coachhelm-visual-playbook.md`.
 * ========================================================================== */

import { z } from 'zod';
import { Measurement, MeasurementSeries } from '../provenance';
import { VisualSpec } from './schema';

export const COMPOSITION_SCHEMA_VERSION = 1;

/** A label the model writes. Drawn as written, so it may not carry a figure. */
const Words = (max: number) => z.string().trim().min(1).max(max);
const Ref = z.string().trim().min(1).max(40);
const MetricId = z.string().trim().min(1).max(60);

/** What a note claims: a figure the visual shows, a pattern across them, or a guess. */
export const NoteKind = z.enum(['measured', 'association', 'hypothesis']);

/**
 * One building block, as the model asks for it. Each names the read(s) it
 * draws from by `evidence_ref`; the optional metric filters pick which of that
 * read's figures to show.
 */
export const CompositionBlockSpec = z.discriminatedUnion('type', [
  /** One figure, set large, with a few words saying what it means. */
  z.object({ type: z.literal('headline'), ref: Ref, metricId: MetricId, label: Words(80).optional() }),
  /** Up to six related figures in one row of cells. */
  z.object({ type: z.literal('kpis'), ref: Ref, metricIds: z.array(MetricId).max(6).optional() }),
  /** One metric over rounds, against the player's average or a real benchmark. */
  z.object({
    type: z.literal('trend'),
    ref: Ref,
    metricId: MetricId.optional(),
    reference: z.enum(['average', 'benchmark', 'none']).default('average'),
  }),
  /** Categories (distance bands) or players on one metric, as bars. */
  z.object({
    type: z.literal('bars'),
    ref: Ref,
    metricId: MetricId.optional(),
    order: z.enum(['best_first', 'as_read']).default('as_read'),
    /** A player id or a band label to emphasise. Ignored when it is not in the data. */
    highlight: z.string().trim().max(60).optional(),
  }),
  /** Signed figures either side of zero — strokes gained by part of the game. */
  z.object({ type: z.literal('split'), refs: z.array(Ref).min(1).max(4), metricIds: z.array(MetricId).max(6).optional() }),
  /** Two to twelve players across the same metrics — a team table. */
  z.object({ type: z.literal('compare'), refs: z.array(Ref).min(1).max(6), metricIds: z.array(MetricId).max(8).optional() }),
  /** A sentence about what the figures show, with no figure in it. */
  z.object({ type: z.literal('note'), kind: NoteKind, text: Words(160) }),
]);
export type CompositionBlockSpec = z.infer<typeof CompositionBlockSpec>;

/** The model's half: the design, and nothing measured. */
export const CompositionSpec = z.object({
  title: Words(90),
  /** The takeaway in one sentence, under the title. */
  lede: Words(160).optional(),
  /** `split` puts figure blocks two-up on a wide screen; a phone always stacks. */
  layout: z.enum(['stack', 'split']).default('stack'),
  blocks: z.array(CompositionBlockSpec).min(1).max(6),
});
export type CompositionSpec = z.infer<typeof CompositionSpec>;

/** A block as drawn: the design choices plus the figures, copied from the reads. */
export const ResolvedBlock = z.discriminatedUnion('type', [
  z.object({ type: z.literal('headline'), measurement: Measurement, label: z.string().nullable() }),
  z.object({ type: z.literal('kpis'), measurements: z.array(Measurement).min(1) }),
  z.object({ type: z.literal('trend'), series: MeasurementSeries, reference: z.enum(['average', 'benchmark', 'none']) }),
  z.object({ type: z.literal('bands'), series: MeasurementSeries, highlight: z.string().nullable() }),
  z.object({
    type: z.literal('ranking'),
    measurements: z.array(Measurement).min(2),
    order: z.enum(['best_first', 'as_read']),
    highlight: z.string().nullable(),
  }),
  z.object({ type: z.literal('split'), measurements: z.array(Measurement).min(2) }),
  z.object({ type: z.literal('compare'), measurements: z.array(Measurement).min(2) }),
  z.object({ type: z.literal('note'), kind: NoteKind, text: z.string() }),
]);
export type ResolvedBlock = z.infer<typeof ResolvedBlock>;

/** What is stored in the message and drawn: validated, immutable, hashed. */
export const ValidatedComposition = z.object({
  artifactId: z.string(),
  schemaVersion: z.literal(COMPOSITION_SCHEMA_VERSION),
  kind: z.literal('compose'),
  title: z.string(),
  lede: z.string().nullable(),
  layout: z.enum(['stack', 'split']),
  blocks: z.array(ResolvedBlock).min(1),
  /** The reads this composition draws in full. The thread hides their generic evidence blocks, and only theirs. */
  evidenceRefs: z.array(z.string()),
  /** Coverage notes of the reads it hides ("2 of 12 rounds have no putts recorded"), so hiding a block never hides a caveat. */
  coverageNotes: z.array(z.string()),
  dataHash: z.string(),
  createdAt: z.string(),
});
export type ValidatedComposition = z.infer<typeof ValidatedComposition>;

/**
 * `show_visual`'s input: one tool, two scenes. A provider tool schema must be a
 * plain object at its root, so the scenes share one object and `kind` says
 * which fields apply; each scene is re-parsed with its own strict schema.
 */
export const ShowVisualInput = VisualSpec.extend({
  kind: z.enum(['sg_anatomy', 'compose']),
  /** sg_anatomy: the reads behind the legs. compose: optional (each block names its own reads). */
  evidenceRefs: z.array(Ref).max(6).default([]),
  lede: CompositionSpec.shape.lede,
  layout: CompositionSpec.shape.layout,
  /** compose only: the building blocks, in order. */
  blocks: z.array(CompositionBlockSpec).max(6).optional(),
});
export type ShowVisualInput = z.infer<typeof ShowVisualInput>;
