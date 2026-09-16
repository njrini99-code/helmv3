import { localFeature } from '../course-geometry/schema';
import { inFeature } from '../course-geometry/spatial';
import type { CourseGeometryPackage, LocalFeature, PointM } from '../course-geometry/types';
import { maxEigenvalue2, type Covariance2 } from './location-estimator';

/** Probabilistic lie classification (master plan "Lie probability"). The
 * partition is the canonical package geometry, never the render mesh. Fringe
 * and apron appear only when the package carries an explicit feature; the
 * two rough bands are derived by distance and say so. Anything else is
 * `UNKNOWN`, a real class. A position is never moved into a polygon. */
export type LieClass = 'tee' | 'fairway' | 'green' | 'fringe' | 'apron' | 'bunker' | 'water' | 'woods' | 'primary_rough' | 'secondary_rough' | 'UNKNOWN';
export type EdgeSigmaBasis = 'package_accuracy' | 'default_reviewed' | 'default_unreviewed' | 'derived_distance_band';
export interface PartitionSurface {
  featureId: string;
  lieClass: LieClass;
  feature: LocalFeature;
  edgeSigmaM: number;
  edgeSigmaBasis: EdgeSigmaBasis;
  priority: number;
  bounds: readonly [number, number, number, number];
}
export interface SurfacePartition {
  holeKey: string;
  geometryVersion: string;
  surfaces: PartitionSurface[];
  bands: { primaryM: number; secondaryM: number; edgeSigmaM: number; basis: 'derived_distance_band' };
  maxEdgeSigmaM: number;
}
export interface LiePosteriorEntry { featureId: string | null; lieClass: LieClass; p: number }
export interface LiePosterior {
  classes: LiePosteriorEntry[];
  primaryLie: LieClass;
  primaryFeatureId: string | null;
  pMax: number;
  method: 'exact' | 'monte_carlo';
  sampleCount: number;
  edgeSigmaM: number;
  queryRadiusM: number;
  basis: 'canonical_partition';
}
/** Working edge σ when the package records none (source candidate, OSM
 * traced on unknown imagery). Recorded on every posterior; a reviewer replaces
 * it through `accuracyMeters`. Zero is never assumed. */
export const EDGE_SIGMA_DEFAULTS = Object.freeze({ reviewed: 1, unreviewed: 2.5, derivedBand: 3 });
export const ROUGH_BANDS = Object.freeze({ primaryM: 10, secondaryM: 28 });
const PRIORITY: Partial<Record<LocalFeature['kind'], number>> = { green: 1, tee: 2, bunker: 3, water: 4, fairway: 5, rough: 6, woods: 7 };
const LIE_FOR_KIND: Partial<Record<LocalFeature['kind'], LieClass>> = { green: 'green', tee: 'tee', bunker: 'bunker', water: 'water', fairway: 'fairway', rough: 'primary_rough', woods: 'woods' };
const PLAYING: ReadonlySet<LieClass> = new Set(['tee', 'fairway', 'green']);

function bounds(feature: LocalFeature): readonly [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of feature.parts.flat(2)) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return [minX, minY, maxX, maxY];
}
export function buildSurfacePartition(pkg: CourseGeometryPackage, holeKey: string, options: { bands?: { primaryM: number; secondaryM: number } } = {}): SurfacePartition {
  const hole = pkg.holes.find(h => h.key === holeKey);
  if (!hole) throw new Error(`Unknown hole ${holeKey}`);
  const surfaces = pkg.features.filter(f => hole.featureIds.includes(f.id) && f.kind !== 'route').map(f => {
    const feature = localFeature(f, pkg);
    const edge = f.accuracyMeters != null ? { edgeSigmaM: f.accuracyMeters, edgeSigmaBasis: 'package_accuracy' as const }
      : f.reviewed ? { edgeSigmaM: EDGE_SIGMA_DEFAULTS.reviewed, edgeSigmaBasis: 'default_reviewed' as const }
        : { edgeSigmaM: EDGE_SIGMA_DEFAULTS.unreviewed, edgeSigmaBasis: 'default_unreviewed' as const };
    return { featureId: f.id, lieClass: LIE_FOR_KIND[f.kind] ?? 'UNKNOWN', feature, priority: PRIORITY[f.kind] ?? 9, bounds: bounds(feature), ...edge };
  }).sort((a, b) => a.priority - b.priority);
  const bands = { ...(options.bands ?? ROUGH_BANDS), edgeSigmaM: EDGE_SIGMA_DEFAULTS.derivedBand, basis: 'derived_distance_band' as const };
  return { holeKey, geometryVersion: pkg.contentHash, surfaces, bands, maxEdgeSigmaM: Math.max(bands.edgeSigmaM, ...surfaces.map(s => s.edgeSigmaM)) };
}
function segmentDistance([px, py]: PointM, [ax, ay]: PointM, [bx, by]: PointM): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
/** Shortest distance from a point to any boundary ring of the feature. */
export function distanceToBoundary(point: PointM, feature: LocalFeature): number {
  let best = Infinity;
  for (const ring of feature.parts.flat(1)) for (let i = 1; i < ring.length; i++) best = Math.min(best, segmentDistance(point, ring[i - 1]!, ring[i]!));
  return best;
}
function nearBounds([x, y]: PointM, [minX, minY, maxX, maxY]: readonly [number, number, number, number], margin: number) {
  return x >= minX - margin && x <= maxX + margin && y >= minY - margin && y <= maxY + margin;
}
export interface ExactLie { lieClass: LieClass; featureId: string | null; basis: 'explicit_feature' | 'derived_distance_band' | 'outside_modeled_area' }
export function exactPointInPartition(partition: SurfacePartition, point: PointM): ExactLie {
  for (const s of partition.surfaces) if (nearBounds(point, s.bounds, 0) && inFeature(point, s.feature)) return { lieClass: s.lieClass, featureId: s.featureId, basis: 'explicit_feature' };
  const d = playingDistance(partition, point);
  if (d <= partition.bands.primaryM) return { lieClass: 'primary_rough', featureId: null, basis: 'derived_distance_band' };
  if (d <= partition.bands.secondaryM) return { lieClass: 'secondary_rough', featureId: null, basis: 'derived_distance_band' };
  return { lieClass: 'UNKNOWN', featureId: null, basis: 'outside_modeled_area' };
}
function playingDistance(partition: SurfacePartition, point: PointM): number {
  let best = Infinity;
  for (const s of partition.surfaces) if (PLAYING.has(s.lieClass) && nearBounds(point, s.bounds, partition.bands.secondaryM + 1)) best = Math.min(best, distanceToBoundary(point, s.feature));
  return best;
}
function halton(index: number, base: number): number {
  let result = 0, f = 1 / base, i = index;
  while (i > 0) { result += f * (i % base); i = Math.floor(i / base); f /= base; }
  return result;
}
/** Low-discrepancy Gaussian samples (Halton 2/3 → Box–Muller → Cholesky):
 * the same mean and covariance always yield the same points. */
export function deterministicGaussianSamples(mean: PointM, cov: Covariance2, count: number): PointM[] {
  const l11 = Math.sqrt(Math.max(cov[0][0], 0)), l21 = l11 > 0 ? cov[1][0] / l11 : 0, l22 = Math.sqrt(Math.max(cov[1][1] - l21 * l21, 0));
  const out: PointM[] = [];
  for (let i = 1; i <= count; i++) {
    const u1 = Math.max(halton(i, 2), 1e-12), u2 = halton(i, 3), r = Math.sqrt(-2 * Math.log(u1));
    const z0 = r * Math.cos(2 * Math.PI * u2), z1 = r * Math.sin(2 * Math.PI * u2);
    out.push([mean[0] + l11 * z0, mean[1] + l21 * z0 + l22 * z1]);
  }
  return out;
}
export const RUNTIME_SAMPLES = 128, QA_SAMPLES = 4096;
export function classifyLie(partition: SurfacePartition, point: PointM, cov: Covariance2, sampleCount = RUNTIME_SAMPLES): LiePosterior {
  const radius = 3 * Math.sqrt(Math.max(maxEigenvalue2(cov), 0)) + partition.maxEdgeSigmaM;
  let nearestBoundary = Infinity, edgeSigma = 0;
  for (const s of partition.surfaces) {
    if (!nearBounds(point, s.bounds, radius)) continue;
    const d = distanceToBoundary(point, s.feature);
    if (d <= radius) edgeSigma = Math.max(edgeSigma, s.edgeSigmaM);
    nearestBoundary = Math.min(nearestBoundary, d);
  }
  const exact = exactPointInPartition(partition, point);
  if (exact.basis !== 'explicit_feature') {
    const d = playingDistance(partition, point);
    const bandBoundary = Math.min(Math.abs(d - partition.bands.primaryM), Math.abs(d - partition.bands.secondaryM));
    nearestBoundary = Math.min(nearestBoundary, bandBoundary);
    if (bandBoundary <= radius) edgeSigma = Math.max(edgeSigma, partition.bands.edgeSigmaM);
  }
  if (nearestBoundary > radius) {
    return { classes: [{ featureId: exact.featureId, lieClass: exact.lieClass, p: 1 }], primaryLie: exact.lieClass, primaryFeatureId: exact.featureId,
      pMax: 1, method: 'exact', sampleCount: 0, edgeSigmaM: 0, queryRadiusM: radius, basis: 'canonical_partition' };
  }
  const total: Covariance2 = [[cov[0][0] + edgeSigma * edgeSigma, cov[0][1]], [cov[1][0], cov[1][1] + edgeSigma * edgeSigma]];
  const counts = new Map<string, LiePosteriorEntry>();
  for (const q of deterministicGaussianSamples(point, total, sampleCount)) {
    const lie = exactPointInPartition(partition, q), key = `${lie.featureId ?? ''}|${lie.lieClass}`;
    const entry = counts.get(key) ?? { featureId: lie.featureId, lieClass: lie.lieClass, p: 0 };
    entry.p += 1 / sampleCount;
    counts.set(key, entry);
  }
  const classes = [...counts.values()].sort((a, b) => b.p - a.p || a.lieClass.localeCompare(b.lieClass));
  const top = classes[0]!;
  return { classes, primaryLie: top.lieClass, primaryFeatureId: top.featureId, pMax: top.p, method: 'monte_carlo', sampleCount, edgeSigmaM: edgeSigma, queryRadiusM: radius, basis: 'canonical_partition' };
}
export type LieDisplay = 'clean' | 'cue' | 'boundary';
export function lieDisplayPolicy(pMax: number): LieDisplay { return pMax >= .9 ? 'clean' : pMax >= .7 ? 'cue' : 'boundary'; }
export function greenComplexProbability(posterior: LiePosterior): number {
  return posterior.classes.filter(c => c.lieClass === 'green' || c.lieClass === 'fringe' || c.lieClass === 'apron').reduce((s, c) => s + c.p, 0);
}
export const LIE_LABELS: Readonly<Record<LieClass, string>> = Object.freeze({ tee: 'Tee', fairway: 'Fairway', green: 'Green', fringe: 'Fringe', apron: 'Apron', bunker: 'Bunker', water: 'Water',
  woods: 'Trees', primary_rough: 'Rough', secondary_rough: 'Deep rough', UNKNOWN: 'Unmapped' });
