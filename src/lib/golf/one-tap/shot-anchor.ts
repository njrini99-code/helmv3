import { z } from 'zod';
import { maxEigenvalue2, minEigenvalue2, type AnchorConfidence, type Covariance2, type LocationEstimate, type LocationSample } from './location-estimator';
import type { CaptureMotion } from './location-quality';
import type { LiePosterior, LieClass } from './lie-classifier';
import type { TerrainSample } from './terrain-sampler';

/** Shot anchors (master plan "Shot anchor", schema V2 §72). One tap = one
 * anchor = "the ball is here now". Shots are derived between consecutive live
 * anchors; an Undo tombstones an anchor and the neighbours re-derive, so
 * synchronized history is never renumbered. Every anchor stores the course
 * it was marked on and the geometry and terrain versions it was classified
 * and sampled against. §71: the durable record keeps the resolved position,
 * covariance and a summary of the estimator's evidence; the raw sample
 * window is never part of it (see `calibration-trace.ts`). */
export const LIE_CLASSES = ['tee', 'fairway', 'green', 'fringe', 'apron', 'bunker', 'water', 'woods', 'primary_rough', 'secondary_rough', 'UNKNOWN'] as const satisfies readonly LieClass[];
export const ANCHOR_SCHEMA_VERSION = 2;
export const CAPTURE_MOTIONS = ['stationary', 'settling', 'moving', 'unknown'] as const satisfies readonly CaptureMotion[];
const covariance = z.tuple([z.tuple([z.number().finite(), z.number().finite()]), z.tuple([z.number().finite(), z.number().finite()])]);
/** The course a round's anchors belong to (§73 round-course binding). */
export interface AnchorCourseBinding { courseId: string; siteId: string }
export const shotAnchorSchema = z.object({
  schemaVersion: z.literal(ANCHOR_SCHEMA_VERSION),
  id: z.string().min(8).max(80),
  roundId: z.string().min(1).max(80),
  courseId: z.string().min(1).max(80),
  siteId: z.string().min(1).max(120),
  holeKey: z.string().min(1).max(100),
  holeId: z.number().int().min(1).max(36),
  sequence: z.number().int().min(0),
  tapTimestamp: z.string().datetime(),
  finalizedTimestamp: z.string().datetime().nullable(),
  provisional: z.boolean(),
  positionWgs84: z.tuple([z.number().finite(), z.number().finite(), z.number().finite().nullable()]),
  positionENU: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  covarianceENU2D: covariance,
  sigmaM: z.number().finite().nonnegative(),
  /** Median reported radius of the fixes used, uncalibrated (§72). */
  reportedAccuracyMedianM: z.number().finite().nonnegative(),
  /** `kAcc · reported radius`: the calibrated device term (§35). */
  calibratedUncertaintyM: z.number().finite().nonnegative(),
  captureMotion: z.enum(CAPTURE_MOTIONS),
  liePosterior: z.array(z.object({ featureId: z.string().nullable(), lieClass: z.enum(LIE_CLASSES), p: z.number().min(0).max(1) })).max(32),
  primaryLie: z.enum(LIE_CLASSES),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  terrainElevationMeters: z.number().finite().nullable(),
  terrainSlopeDegrees: z.number().finite().nullable(),
  terrainAspectDegrees: z.number().finite().nullable(),
  geometryVersion: z.string().min(1).max(120),
  terrainVersion: z.string().min(1).max(120).nullable(),
  terminal: z.boolean(),
  terminalMethod: z.enum(['CUP_MARK', 'PIN_KNOWN', 'NEXT_TEE_INFERRED']).nullable(),
  syncState: z.enum(['LOCAL', 'QUEUED', 'SYNCED', 'ERROR']),
  deletedAt: z.string().datetime().nullable(),
  /** §72 estimator summary: what the window looked like, without the window. */
  estimatorSummary: z.object({
    sampleCount: z.number().int().nonnegative(), rejectedResiduals: z.number().int().nonnegative(),
    scatterMajorM: z.number().finite().nonnegative(), scatterMinorM: z.number().finite().nonnegative(),
    kAcc: z.number().finite().positive(), kAccCalibration: z.enum(['provisional', 'field']), poorAccuracy: z.boolean(),
    reportedSpeedMps: z.number().finite().nullable(), displacementM: z.number().finite().nullable(),
    basis: z.literal('weighted_mean_of_window'),
  }).nullable(),
  classification: z.object({ method: z.enum(['exact', 'monte_carlo']), sampleCount: z.number().int(), edgeSigmaM: z.number().finite(), basis: z.literal('canonical_partition') }).nullable(),
}).strict();
export type ShotAnchor = z.infer<typeof shotAnchorSchema>;
export type TerminalMethod = NonNullable<ShotAnchor['terminalMethod']>;

/** Time-prefixed, lexically sortable, collision-safe. */
export function newAnchorId(nowMs = Date.now(), random: () => string = () => crypto.randomUUID()): string {
  return `${Math.floor(nowMs).toString(36).padStart(9, '0')}-${random()}`;
}
export interface AnchorIdentity extends AnchorCourseBinding { id: string; roundId: string; holeKey: string; holeId: number; sequence: number; tapMs: number }
/** A provisional anchor without a fix has σ 0: nothing to draw and nothing to
 * persist (the controller only stores a provisional that has a position). */
export function provisionalAnchor(identity: AnchorIdentity, sample: LocationSample | null, enu: readonly [number, number, number] | null, geometryVersion: string, terrainVersion: string | null): ShotAnchor {
  const sigma = sample ? Math.max(sample.horizontalAccuracyM, 1.5) : 0;
  return { schemaVersion: ANCHOR_SCHEMA_VERSION, id: identity.id, roundId: identity.roundId, courseId: identity.courseId, siteId: identity.siteId,
    holeKey: identity.holeKey, holeId: identity.holeId, sequence: identity.sequence,
    tapTimestamp: new Date(identity.tapMs).toISOString(), finalizedTimestamp: null, provisional: true,
    positionWgs84: sample ? [sample.longitude, sample.latitude, sample.altitudeM] : [0, 0, null], positionENU: enu ? [enu[0], enu[1], enu[2]] : [0, 0, 0],
    covarianceENU2D: [[sigma * sigma, 0], [0, sigma * sigma]], sigmaM: sigma, reportedAccuracyMedianM: sample ? Math.max(0, sample.horizontalAccuracyM) : 0, calibratedUncertaintyM: sigma,
    captureMotion: 'unknown', liePosterior: [], primaryLie: 'UNKNOWN', confidence: 'LOW', terrainElevationMeters: null, terrainSlopeDegrees: null, terrainAspectDegrees: null,
    geometryVersion, terrainVersion, terminal: false, terminalMethod: null, syncState: 'LOCAL', deletedAt: null, estimatorSummary: null, classification: null };
}
export function hasFix(anchor: Pick<ShotAnchor, 'sigmaM'>): boolean { return anchor.sigmaM > 0; }
export function finalAnchor(base: ShotAnchor, estimate: LocationEstimate, terrain: TerrainSample | null, posterior: LiePosterior, confidence: AnchorConfidence, finalizedMs: number): ShotAnchor {
  return { ...base, provisional: false, finalizedTimestamp: new Date(finalizedMs).toISOString(),
    positionWgs84: [estimate.positionWgs84[0], estimate.positionWgs84[1], estimate.positionWgs84[2]],
    positionENU: [estimate.positionENU[0], estimate.positionENU[1], terrain?.elevationM ?? 0],
    covarianceENU2D: [[estimate.covarianceENU2D[0][0], estimate.covarianceENU2D[0][1]], [estimate.covarianceENU2D[1][0], estimate.covarianceENU2D[1][1]]], sigmaM: estimate.sigmaM,
    reportedAccuracyMedianM: estimate.reportedRadiusM, calibratedUncertaintyM: estimate.sigmaDeviceM, captureMotion: estimate.captureMotion,
    liePosterior: posterior.classes.map(c => ({ featureId: c.featureId, lieClass: c.lieClass, p: c.p })),
    primaryLie: posterior.primaryLie, confidence, terrainElevationMeters: terrain?.elevationM ?? null, terrainSlopeDegrees: terrain?.slopeDegrees ?? null,
    terrainAspectDegrees: terrain?.aspectDegrees ?? null,
    estimatorSummary: { sampleCount: estimate.usedSamples, rejectedResiduals: estimate.rejectedResiduals,
      scatterMajorM: Math.sqrt(Math.max(0, maxEigenvalue2(estimate.covarianceScatterENU2D))), scatterMinorM: Math.sqrt(Math.max(0, minEigenvalue2(estimate.covarianceScatterENU2D))),
      kAcc: estimate.kAcc, kAccCalibration: estimate.kAccCalibration, poorAccuracy: estimate.poorAccuracy,
      reportedSpeedMps: estimate.motion.reportedSpeedMps, displacementM: estimate.motion.displacementM, basis: estimate.basis },
    classification: { method: posterior.method, sampleCount: posterior.sampleCount, edgeSigmaM: posterior.edgeSigmaM, basis: posterior.basis } };
}
/** Lab-storage migration (§71/§72). A V1 row (no `schemaVersion`, raw sample
 * window on the record) becomes a V2 row under the round's course binding
 * with the window dropped and the summary rebuilt from what V1 retained.
 * Any other shape, including a newer version, is invalid: dropped and
 * counted by the repository, never guessed at. */
export function migrateAnchorRow(row: unknown, binding: AnchorCourseBinding): { anchor: ShotAnchor; migrated: boolean } | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (r.schemaVersion === ANCHOR_SCHEMA_VERSION) { const parsed = shotAnchorSchema.safeParse(row); return parsed.success ? { anchor: parsed.data, migrated: false } : null; }
  if ('schemaVersion' in r || !Array.isArray(r.rawLocationSamples)) return null;
  const { rawLocationSamples: _window, estimator, ...rest } = r;
  const v1 = estimator && typeof estimator === 'object' ? estimator as Record<string, unknown> : null;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
  const sigma = num(rest.sigmaM) ?? 0, scatter = v1 ? num(v1.sigmaScatterM) : null;
  const candidate = { ...rest, schemaVersion: ANCHOR_SCHEMA_VERSION, courseId: binding.courseId, siteId: binding.siteId, captureMotion: 'unknown',
    reportedAccuracyMedianM: (v1 ? num(v1.medianAccuracyM) : null) ?? sigma, calibratedUncertaintyM: (v1 ? num(v1.sigmaDeviceM) : null) ?? sigma,
    estimatorSummary: v1 ? { sampleCount: num(v1.usedSamples) ?? 0, rejectedResiduals: num(v1.rejectedResiduals) ?? 0, scatterMajorM: scatter ?? 0, scatterMinorM: scatter ?? 0,
      kAcc: num(v1.kAcc) ?? 1, kAccCalibration: 'provisional', poorAccuracy: v1.poorAccuracy === true, reportedSpeedMps: null, displacementM: null, basis: 'weighted_mean_of_window' } : null };
  const parsed = shotAnchorSchema.safeParse(candidate);
  return parsed.success ? { anchor: parsed.data, migrated: true } : null;
}
/** §62 shot visualization. The only measured facts about a shot are its two
 * endpoints; the shape drawn between them is art. A full shot gets the
 * illustrative endpoint arc `p(t) = A + t(B−A) + ẑ·4H·t(1−t)`; a green-to-
 * green shot (a putt, §62.3) gets a surface connector that never leaves the
 * ground, and so does a chord too short for an arc to read as anything but a
 * spike. `trajectoryBasis` travels with every derived shot so nothing
 * downstream can mistake the drawing for measured ball flight, and §62.2 is
 * explicit that it is never used for analytics. */
export type TrajectoryBasis = 'illustrative_endpoint_arc' | 'surface_connector';
export const ILLUSTRATIVE_ARC = Object.freeze({
  /** §62.2, art-only: `H = clamp(0.08·d, 4, 24)` metres. */
  heightFactor: .08, minApexM: 4, maxApexM: 24,
  /** §62.2 scopes the arc to "full shots". Below this chord the floored apex
   * draws a vertical spike rather than a flight, so the connector stands in.
   * Provisional, like every constant here: calibrate it visually. */
  minChordM: 12,
});
/** §62.2 apex above the chord (metres). Art, not physics. */
export function illustrativeApexM(horizontalM: number): number {
  return Math.min(ILLUSTRATIVE_ARC.maxApexM, Math.max(ILLUSTRATIVE_ARC.minApexM, ILLUSTRATIVE_ARC.heightFactor * Math.max(0, horizontalM)));
}
export interface ShotTrajectory { basis: TrajectoryBasis; apexM: number }
/** Which shape the shot between two marks is drawn with. A putt is decided by
 * the two marks' own lie posteriors, never by how short the shot was. */
export function shotTrajectory(startLie: LieClass, endLie: LieClass, horizontalM: number): ShotTrajectory {
  const putt = startLie === 'green' && endLie === 'green';
  return putt || !(horizontalM >= ILLUSTRATIVE_ARC.minChordM)
    ? { basis: 'surface_connector', apexM: 0 }
    : { basis: 'illustrative_endpoint_arc', apexM: illustrativeApexM(horizontalM) };
}
/** Shot math (master plan "Shot distance" / "Shot distance uncertainty"). */
export interface DerivedShot {
  sequence: number;
  fromAnchorId: string;
  toAnchorId: string;
  horizontalM: number;
  /** Null when either anchor has no terrain elevation. */
  threeDM: number | null;
  bearingDegrees: number;
  elevationDeltaM: number | null;
  gradePercent: number | null;
  verticalAngleDegrees: number | null;
  sigmaDistanceM: number;
  startLie: LieClass;
  endLie: LieClass;
  terminal: boolean;
  terminalMethod: TerminalMethod | null;
  basis: 'enu_between_anchors';
  /** §62: what the shape drawn between the two marks is. Art, never measured. */
  trajectoryBasis: TrajectoryBasis;
  /** §62.2 apex of the illustrative arc above the chord (metres); 0 on a connector. */
  illustrativeApexM: number;
}
export function distanceSigma(c1: Covariance2, c2: Covariance2, r: readonly [number, number]): number {
  const length = Math.hypot(r[0], r[1]);
  if (length === 0) return Math.sqrt(Math.max(0, (c1[0][0] + c2[0][0] + c1[1][1] + c2[1][1]) / 2));
  const u = [r[0] / length, r[1] / length] as const, s = [[c1[0][0] + c2[0][0], c1[0][1] + c2[0][1]], [c1[1][0] + c2[1][0], c1[1][1] + c2[1][1]]] as const;
  return Math.sqrt(Math.max(0, u[0] * (s[0][0] * u[0] + s[0][1] * u[1]) + u[1] * (s[1][0] * u[0] + s[1][1] * u[1])));
}
export function liveAnchors(anchors: readonly ShotAnchor[]): ShotAnchor[] {
  return anchors.filter(a => !a.deletedAt).sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
}
export function deriveShots(anchors: readonly ShotAnchor[]): DerivedShot[] {
  const live = liveAnchors(anchors), shots: DerivedShot[] = [];
  for (let i = 1; i < live.length; i++) {
    const a = live[i - 1]!, b = live[i]!;
    const dE = b.positionENU[0] - a.positionENU[0], dN = b.positionENU[1] - a.positionENU[1];
    const dU = a.terrainElevationMeters != null && b.terrainElevationMeters != null ? b.terrainElevationMeters - a.terrainElevationMeters : null;
    const dh = Math.hypot(dE, dN);
    const trajectory = shotTrajectory(a.primaryLie, b.primaryLie, dh);
    shots.push({ sequence: i, fromAnchorId: a.id, toAnchorId: b.id, horizontalM: dh, threeDM: dU == null ? null : Math.hypot(dE, dN, dU),
      bearingDegrees: (Math.atan2(dE, dN) * 180 / Math.PI + 360) % 360, elevationDeltaM: dU, gradePercent: dU == null || dh === 0 ? null : 100 * dU / dh,
      verticalAngleDegrees: dU == null ? null : Math.atan2(dU, dh) * 180 / Math.PI, sigmaDistanceM: distanceSigma(a.covarianceENU2D, b.covarianceENU2D, [dE, dN]),
      startLie: a.primaryLie, endLie: b.primaryLie, terminal: b.terminal, terminalMethod: b.terminalMethod, basis: 'enu_between_anchors',
      trajectoryBasis: trajectory.basis, illustrativeApexM: trajectory.apexM });
  }
  return shots;
}
export const UNDO_WINDOW_MS = 5000;
/** Undo tombstones; nothing is renumbered and the record is retained. */
export function tombstoneAnchor(anchors: readonly ShotAnchor[], id: string, nowMs: number): ShotAnchor[] {
  return anchors.map(a => a.id === id && !a.deletedAt ? { ...a, deletedAt: new Date(nowMs).toISOString(), terminal: false, terminalMethod: null, syncState: a.syncState === 'SYNCED' ? 'QUEUED' : a.syncState } : a);
}
export function undoable(anchor: ShotAnchor, nowMs: number): boolean {
  return !anchor.deletedAt && nowMs - Date.parse(anchor.finalizedTimestamp ?? anchor.tapTimestamp) <= UNDO_WINDOW_MS;
}
