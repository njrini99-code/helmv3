import { z } from 'zod';
import type { CourseGeometryPackage } from '../course-geometry/types';

/** Source evidence, edge uncertainty and course feature records (master plan
 * "Core evidence schema" / "Edge uncertainty" / "Course feature"). Provider
 * statistics keep their original form; `null` means unspecified, never zero. */
export const EVIDENCE_PROVIDERS = ['NYS_ORTHO_2024', 'NYS_ORTHO_2021', 'NAIP', 'USGS_3DEP', 'VEXCEL', 'NEARMAP', 'EAGLEVIEW', 'COURSE_CAD', 'COURSE_SURVEY', 'RTK', 'DRONE', 'OSM'] as const;
export const sourceEvidenceSchema = z.object({
  id: z.string().min(1).max(120),
  provider: z.enum(EVIDENCE_PROVIDERS),
  product: z.string().min(1).max(200),
  captureDate: z.string().max(40).nullable(),
  gsdMeters: z.number().positive().nullable(),
  horizontalRMSEMeters: z.number().nonnegative().nullable(),
  verticalRMSEMeters: z.number().nonnegative().nullable(),
  bands: z.array(z.string().max(20)).max(12),
  pointDensityPerM2: z.number().nonnegative().nullable(),
  sourceCRS: z.string().min(1).max(60),
  verticalDatum: z.string().max(40).nullable(),
  epoch: z.string().max(40).nullable(),
  licenseRef: z.string().min(1).max(120),
  sourceUri: z.string().max(2000),
  checksum: z.string().max(128).nullable(),
  registrationModel: z.enum(['NONE', 'TRANSLATION', 'HELMERT_2D', 'AFFINE']),
  registrationRMSEMeters: z.number().nonnegative().nullable(),
  checkpointCount: z.number().int().nonnegative(),
  checkpointResidualsMeters: z.array(z.number().nonnegative()).max(500),
  /** Acquisition state for the catalog: retained sources are `RETAINED`. */
  status: z.enum(['RETAINED', 'UNSPECIFIED', 'EXCLUDED']),
  note: z.string().max(400).optional(),
}).strict();
export type SourceEvidence = z.infer<typeof sourceEvidenceSchema>;
export const edgeUncertaintySchema = z.object({
  edgeId: z.string().min(1).max(160), vertexStart: z.number().int().nonnegative(), vertexEnd: z.number().int().nonnegative(),
  sourceEvidenceIds: z.array(z.string()).max(16), sigmaEdgeMeters: z.number().positive(),
  visibility: z.enum(['CRISP', 'SOFT', 'OCCLUDED', 'INFERRED']), reviewStatus: z.enum(['DRAFT', 'REVIEWED', 'FIELD_VERIFIED']),
}).strict();
export type EdgeUncertainty = z.infer<typeof edgeUncertaintySchema>;
export const FEATURE_CLASSES = ['green', 'fringe', 'apron', 'fairway', 'primary_rough', 'secondary_rough', 'tee_surface', 'bunker_floor', 'bunker_lip', 'tree_edge', 'forest_mass', 'cart_path', 'structure', 'drainage', 'water', 'bridge', 'retaining_wall', 'unknown'] as const;
export const courseFeatureSchema = z.object({
  id: z.string().min(1).max(160), courseId: z.string().min(1).max(120), holeIds: z.array(z.number().int().min(1).max(36)).max(36),
  featureClass: z.enum(FEATURE_CLASSES), evidenceIds: z.array(z.string()).max(16),
  captureDateEffective: z.string().max(40).nullable(), gsdMeters: z.number().positive().nullable(), horizontalRMSEMeters: z.number().nonnegative().nullable(),
  uncertainty: z.object({ sourceSigmaMeters: z.number().nonnegative().nullable(), registrationSigmaMeters: z.number().nonnegative(), digitizationSigmaMeters: z.number().nonnegative(),
    temporalSigmaMeters: z.number().nonnegative(), edgeDefaultSigmaMeters: z.number().positive(), edgeDefaultBasis: z.enum(['recorded', 'composed', 'default_unreviewed']), edges: z.array(edgeUncertaintySchema).max(2000) }).strict(),
  semantic: z.object({ isLieSurface: z.boolean(), lieClass: z.string().nullable(), traversable: z.boolean(), terminalTarget: z.boolean() }).strict(),
  render: z.object({ materialPreset: z.string().max(60), mowingAxisDegrees: z.number().nullable(), mowingBandMeters: z.number().positive().nullable(), lodPriority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    elevationQuality: z.enum(['SURVEYED', 'LIDAR', 'INTERPOLATED', 'INFERRED']) }).strict(),
  version: z.number().int().nonnegative(), reviewedBy: z.string().max(120).nullable(), reviewedAt: z.string().max(40).nullable(),
}).strict();
export type CourseFeature = z.infer<typeof courseFeatureSchema>;
/** σ_edge = √(σ_source² + σ_registration² + σ_digitization² + σ_temporal²): an engineering approximation under independence. */
export function composeEdgeSigma(parts: { sourceSigmaMeters: number | null; registrationSigmaMeters: number; digitizationSigmaMeters: number; temporalSigmaMeters: number }): number | null {
  if (parts.sourceSigmaMeters == null) return null;
  return Math.sqrt(parts.sourceSigmaMeters ** 2 + parts.registrationSigmaMeters ** 2 + parts.digitizationSigmaMeters ** 2 + parts.temporalSigmaMeters ** 2);
}
/** Initial digitization heuristic: crisp edge max(0.5·GSD, 0.10 m); soft edge max(1.0·GSD, 0.25 m). */
export function digitizationSigma(gsdMeters: number, visibility: EdgeUncertainty['visibility']): number {
  return visibility === 'CRISP' ? Math.max(.5 * gsdMeters, .1) : Math.max(gsdMeters, .25);
}
export type AccuracyTier = 'hero' | 'playing' | 'context';
export type AccuracyClass = 'A' | 'B' | 'C';
const CLASS_LIMITS: Record<AccuracyTier, readonly [number, number]> = { hero: [.5, 1], playing: [.75, 1.5], context: [1.5, 3] };
export function accuracyClass(sigmaMeters: number, tier: AccuracyTier): AccuracyClass {
  const [a, b] = CLASS_LIMITS[tier];
  return sigmaMeters <= a ? 'A' : sigmaMeters <= b ? 'B' : 'C';
}
export function accuracyTierFor(featureClass: CourseFeature['featureClass']): AccuracyTier {
  if (featureClass === 'green' || featureClass === 'fringe' || featureClass === 'apron' || featureClass === 'bunker_floor' || featureClass === 'bunker_lip') return 'hero';
  if (featureClass === 'fairway' || featureClass === 'tee_surface' || featureClass === 'primary_rough') return 'playing';
  return 'context';
}
const PACKAGE_CLASS: Partial<Record<CourseGeometryPackage['features'][number]['kind'], CourseFeature['featureClass']>> = {
  green: 'green', fairway: 'fairway', tee: 'tee_surface', bunker: 'bunker_floor', water: 'water', woods: 'forest_mass', rough: 'primary_rough',
};
export const UNREVIEWED_EDGE_SIGMA_M = 2.5;
/** Adapter from the retained package to plan-shaped feature records. A
 * package bunker is one polygon: it becomes `bunker_floor` with the lip
 * recorded as absent (the plan's separate lip/floor gate stays open). */
export function courseFeaturesFromPackage(pkg: CourseGeometryPackage): CourseFeature[] {
  return pkg.features.filter(f => f.kind !== 'route').map(f => {
    const featureClass = PACKAGE_CLASS[f.kind] ?? 'unknown';
    const recorded = f.accuracyMeters;
    const capture = pkg.sources.find(s => f.sourceIds.includes(s.id))?.capturedAt ?? null;
    return {
      id: f.id, courseId: pkg.siteId, holeIds: f.holeKeys.map(k => pkg.holes.find(h => h.key === k)?.ordinal).filter((n): n is number => n != null),
      featureClass, evidenceIds: f.sourceIds, captureDateEffective: capture, gsdMeters: null, horizontalRMSEMeters: null,
      uncertainty: { sourceSigmaMeters: null, registrationSigmaMeters: 0, digitizationSigmaMeters: 0, temporalSigmaMeters: 0,
        edgeDefaultSigmaMeters: recorded ?? (f.reviewed ? 1 : UNREVIEWED_EDGE_SIGMA_M), edgeDefaultBasis: recorded != null ? 'recorded' : 'default_unreviewed', edges: [] },
      semantic: { isLieSurface: featureClass !== 'forest_mass' && featureClass !== 'unknown', lieClass: featureClass === 'forest_mass' ? 'woods' : featureClass === 'tee_surface' ? 'tee' : featureClass === 'bunker_floor' ? 'bunker' : featureClass,
        traversable: featureClass !== 'water', terminalTarget: featureClass === 'green' },
      render: { materialPreset: featureClass, mowingAxisDegrees: null, mowingBandMeters: null, lodPriority: featureClass === 'green' || featureClass === 'bunker_floor' ? 0 : featureClass === 'forest_mass' ? 2 : 1, elevationQuality: 'LIDAR' },
      version: 1, reviewedBy: null, reviewedAt: f.reviewed ? pkg.sources.find(s => f.sourceIds.includes(s.id))?.retrievedAt ?? null : null,
    };
  });
}
export const evidenceCatalogSchema = z.object({ courseId: z.string(), builtAt: z.string(), googleApis: z.literal('EXCLUDED'), sources: z.array(sourceEvidenceSchema).min(1).max(64) }).strict();
export type EvidenceCatalog = z.infer<typeof evidenceCatalogSchema>;
