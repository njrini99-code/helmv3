import { z } from 'zod';
import type { AnchorConfidence, Covariance2, LocationEstimate, LocationSample } from './location-estimator';
import type { LiePosterior, LieClass } from './lie-classifier';
import type { TerrainSample } from './terrain-sampler';

/** Shot anchors (master plan "Shot anchor"). One tap = one anchor = "the
 * ball is here now". Shots are derived between consecutive live anchors; an
 * Undo tombstones an anchor and the neighbours re-derive, so synchronized
 * history is never renumbered. Every anchor stores the geometry and terrain
 * versions it was classified and sampled against. */
export const LIE_CLASSES = ['tee', 'fairway', 'green', 'fringe', 'apron', 'bunker', 'water', 'woods', 'primary_rough', 'secondary_rough', 'UNKNOWN'] as const satisfies readonly LieClass[];
const locationSampleSchema = z.object({
  timestampMs: z.number().finite(), longitude: z.number().finite().min(-180).max(180), latitude: z.number().finite().min(-90).max(90),
  altitudeM: z.number().finite().nullable(), horizontalAccuracyM: z.number().finite(), verticalAccuracyM: z.number().finite().nullable(),
  speedMps: z.number().finite().nullable(), headingDegrees: z.number().finite().nullable(), source: z.enum(['device', 'synthetic']),
}).strict();
const covariance = z.tuple([z.tuple([z.number().finite(), z.number().finite()]), z.tuple([z.number().finite(), z.number().finite()])]);
export const shotAnchorSchema = z.object({
  id: z.string().min(8).max(80),
  roundId: z.string().min(1).max(80),
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
  rawLocationSamples: z.array(locationSampleSchema).max(400),
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
  estimator: z.object({ sigmaDeviceM: z.number().finite(), sigmaScatterM: z.number().finite(), medianAccuracyM: z.number().finite(), usedSamples: z.number().int(),
    rejectedResiduals: z.number().int(), poorAccuracy: z.boolean(), kAcc: z.number().finite(), basis: z.literal('weighted_mean_of_window') }).nullable(),
  classification: z.object({ method: z.enum(['exact', 'monte_carlo']), sampleCount: z.number().int(), edgeSigmaM: z.number().finite(), basis: z.literal('canonical_partition') }).nullable(),
}).strict();
export type ShotAnchor = z.infer<typeof shotAnchorSchema>;
export type TerminalMethod = NonNullable<ShotAnchor['terminalMethod']>;

/** Time-prefixed, lexically sortable, collision-safe. */
export function newAnchorId(nowMs = Date.now(), random: () => string = () => crypto.randomUUID()): string {
  return `${Math.floor(nowMs).toString(36).padStart(9, '0')}-${random()}`;
}
export interface AnchorIdentity { id: string; roundId: string; holeKey: string; holeId: number; sequence: number; tapMs: number }
export function provisionalAnchor(identity: AnchorIdentity, sample: LocationSample | null, enu: readonly [number, number, number] | null, geometryVersion: string, terrainVersion: string | null): ShotAnchor {
  const sigma = sample ? Math.max(sample.horizontalAccuracyM, 1.5) : 0;
  return { id: identity.id, roundId: identity.roundId, holeKey: identity.holeKey, holeId: identity.holeId, sequence: identity.sequence,
    tapTimestamp: new Date(identity.tapMs).toISOString(), finalizedTimestamp: null, provisional: true,
    positionWgs84: sample ? [sample.longitude, sample.latitude, sample.altitudeM] : [0, 0, null], positionENU: enu ? [enu[0], enu[1], enu[2]] : [0, 0, 0],
    covarianceENU2D: [[sigma * sigma, 0], [0, sigma * sigma]], sigmaM: sigma, rawLocationSamples: sample ? [sample] : [],
    liePosterior: [], primaryLie: 'UNKNOWN', confidence: 'LOW', terrainElevationMeters: null, terrainSlopeDegrees: null, terrainAspectDegrees: null,
    geometryVersion, terrainVersion, terminal: false, terminalMethod: null, syncState: 'LOCAL', deletedAt: null, estimator: null, classification: null };
}
export function finalAnchor(base: ShotAnchor, estimate: LocationEstimate, terrain: TerrainSample | null, posterior: LiePosterior, confidence: AnchorConfidence, kAcc: number, finalizedMs: number): ShotAnchor {
  return { ...base, provisional: false, finalizedTimestamp: new Date(finalizedMs).toISOString(),
    positionWgs84: [estimate.positionWgs84[0], estimate.positionWgs84[1], estimate.positionWgs84[2]],
    positionENU: [estimate.positionENU[0], estimate.positionENU[1], terrain?.elevationM ?? 0],
    covarianceENU2D: [[estimate.covarianceENU2D[0][0], estimate.covarianceENU2D[0][1]], [estimate.covarianceENU2D[1][0], estimate.covarianceENU2D[1][1]]], sigmaM: estimate.sigmaM,
    rawLocationSamples: estimate.windowSamples.slice(0, 400), liePosterior: posterior.classes.map(c => ({ featureId: c.featureId, lieClass: c.lieClass, p: c.p })),
    primaryLie: posterior.primaryLie, confidence, terrainElevationMeters: terrain?.elevationM ?? null, terrainSlopeDegrees: terrain?.slopeDegrees ?? null,
    terrainAspectDegrees: terrain?.aspectDegrees ?? null,
    estimator: { sigmaDeviceM: estimate.sigmaDeviceM, sigmaScatterM: estimate.sigmaScatterM, medianAccuracyM: estimate.medianAccuracyM, usedSamples: estimate.usedSamples,
      rejectedResiduals: estimate.rejectedResiduals, poorAccuracy: estimate.poorAccuracy, kAcc, basis: estimate.basis },
    classification: { method: posterior.method, sampleCount: posterior.sampleCount, edgeSigmaM: posterior.edgeSigmaM, basis: posterior.basis } };
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
    shots.push({ sequence: i, fromAnchorId: a.id, toAnchorId: b.id, horizontalM: dh, threeDM: dU == null ? null : Math.hypot(dE, dN, dU),
      bearingDegrees: (Math.atan2(dE, dN) * 180 / Math.PI + 360) % 360, elevationDeltaM: dU, gradePercent: dU == null || dh === 0 ? null : 100 * dU / dh,
      verticalAngleDegrees: dU == null ? null : Math.atan2(dU, dh) * 180 / Math.PI, sigmaDistanceM: distanceSigma(a.covarianceENU2D, b.covarianceENU2D, [dE, dN]),
      startLie: a.primaryLie, endLie: b.primaryLie, terminal: b.terminal, terminalMethod: b.terminalMethod, basis: 'enu_between_anchors' });
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
