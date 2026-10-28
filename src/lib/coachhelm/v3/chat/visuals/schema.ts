/**
 * ============================================================================
 * CoachHelm chat · visual artifacts · the protocol
 * ----------------------------------------------------------------------------
 * The model asks for a scene (`VisualSpec`): a name from a closed list and the ids of reads the server already made
 * this turn. It never supplies a value, a coordinate, a colour or code. Trusted code (`compile.ts`) resolves the evidence,
 * checks it can be drawn honestly, and returns a `ValidatedVisualArtifact`: the figures themselves, hashed, kept inside
 * the message so a reload draws the same chart. Only `zod` is imported here, so the browser can parse a stored artifact
 * with the same schema the server wrote it with.
 * ========================================================================== */

import { z } from 'zod';

export const VISUAL_SCHEMA_VERSION = 1;

/** The scenes the server can compile. A name here is a promise `compile.ts` keeps: grow it one scene at a time. */
export const VisualSceneKind = z.enum(['sg_anatomy']);
export type VisualSceneKind = z.infer<typeof VisualSceneKind>;

const Coverage = z.enum(['complete', 'partial', 'empty', 'unavailable']);

/** What an annotation claims. "measured" is a figure the chart shows; "hypothesis" is never drawn as a finding. */
export const AnnotationKind = z.enum(['measured', 'association', 'hypothesis']);

/** The tool's input: small and structured, nothing derived. */
export const VisualSpec = z.object({
  kind: VisualSceneKind,
  /** Drawn as written, so it may not contain a digit either: `compile.ts` refuses one that does (`figure_in_text`). */
  title: z.string().trim().min(1).max(90),
  intent: z.enum(['compare', 'trend', 'explain', 'locate', 'simulate', 'act']).default('explain'),
  /** Ids the read tools returned as `evidence_ref` this turn. Anything else is refused. */
  evidenceRefs: z.array(z.string().trim().min(1).max(40)).min(1).max(6),
  /** The leg to open first (a metric id such as `sg_approach`). */
  highlightedMetricId: z.string().trim().max(40).optional(),
  /** Words about a leg. They may not contain a digit: every figure on screen comes from the data. */
  annotations: z
    .array(z.object({ metricId: z.string().trim().max(40), kind: AnnotationKind, label: z.string().trim().min(1).max(140) }))
    .max(3)
    .optional(),
});
export type VisualSpec = z.infer<typeof VisualSpec>;

export const SgLeg = z.object({
  metricId: z.string(),
  label: z.string(),
  value: z.number(),
  sampleSize: z.number().int().nonnegative(),
  sampleUnit: z.string(),
  coverage: Coverage,
  coverageNote: z.string().nullable(),
  source: z.string(),
  method: z.string(),
  asOf: z.string(),
});
export type SgLeg = z.infer<typeof SgLeg>;

/** What is stored in the message and drawn: validated, immutable, with its own hash. */
export const ValidatedVisualArtifact = z.object({
  artifactId: z.string(),
  schemaVersion: z.literal(VISUAL_SCHEMA_VERSION),
  kind: VisualSceneKind,
  title: z.string(),
  intent: z.string(),
  entity: z.object({ id: z.string(), label: z.string() }),
  window: z.object({ start: z.string().nullable(), end: z.string().nullable() }),
  /** The oldest read behind any plotted value. */
  sourceAsOf: z.string(),
  coverage: Coverage,
  /** The legs, strokes gained per round, best first by value. */
  legs: z.array(SgLeg).min(2),
  /** The player's total, when it was read; `reconciles` says whether the legs add to it (within rounding). */
  total: z.object({ value: z.number(), sampleSize: z.number().int().nonnegative(), reconciles: z.boolean().nullable() }).nullable(),
  highlightedMetricId: z.string().nullable(),
  annotations: z.array(z.object({ metricId: z.string(), kind: AnnotationKind, label: z.string() })),
  /** The reads this artifact draws in full. The thread hides their generic evidence blocks, and only theirs. */
  evidenceRefs: z.array(z.string()),
  dataHash: z.string(),
  createdAt: z.string(),
});
export type ValidatedVisualArtifact = z.infer<typeof ValidatedVisualArtifact>;

/** Why a scene was refused. The model is told in words; the coach gets the generic evidence instead. */
export type VisualRefusal =
  | 'unknown_evidence'
  | 'not_enough_legs'
  | 'mixed_players'
  | 'mixed_windows'
  | 'conflicting_values'
  | 'figure_in_text'
  | 'unavailable';
