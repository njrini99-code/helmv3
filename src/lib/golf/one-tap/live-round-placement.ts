import type { ContextLayer } from '../course-geometry/context-layer';
import type { TerrainMesh } from '../course-geometry/terrain';
import type { CourseGeometryPackage, PointM } from '../course-geometry/types';
import type { StorageLike, SyncTransport } from './anchor-repository';
import { largestOuterRing, ringCentroid } from './hole-distances';
import { buildSurfacePartition } from './lie-classifier';
import type { LocationSource } from './location-source';
import { PEEK_N_PEAK_ONE_TAP_V1, isPeekNPeakOneTapEligible, type OneTapEligibility, type PeekNPeakOneTapPolicy } from './peek-n-peak-policy';

/** Master design §77 placement: Meridian Live replaces the shot-entry screen
 * of the existing round flow only for an eligible round — Peek'n Peak Upper,
 * an approved package, the release flag on, a device location — and only for
 * holes the package maps. Every other round, and Peek Upper in standard
 * mode, renders the existing tracker unchanged. */
export interface OneTapLiveRound {
  roundId: string;
  courseId: string;
  geometryVersion: string;
  pkg: CourseGeometryPackage;
  /** Package hole keys in ordinal order. */
  holeKeys: readonly string[];
  terrainByHole?: Readonly<Record<string, TerrainMesh>>;
  contextLayer?: ContextLayer;
  location: LocationSource | null;
  /** Omitted → localStorage; null → memory only. */
  storage?: StorageLike | null;
  transport?: SyncTransport | null;
}
export interface ResolveLiveRoundInput {
  roundId: string;
  /** Product course id of the round's course (`productCourseIdForRound`), null for any other course. */
  roundCourseId: string | null;
  featureFlagEnabled: boolean;
  pkg: CourseGeometryPackage | null;
  terrainByHole?: Readonly<Record<string, TerrainMesh>>;
  contextLayer?: ContextLayer;
  location: LocationSource | null;
  storage?: StorageLike | null;
  transport?: SyncTransport | null;
  policy?: PeekNPeakOneTapPolicy;
}
export function resolveOneTapLiveRound(input: ResolveLiveRoundInput): { live: OneTapLiveRound | null; eligibility: OneTapEligibility } {
  const policy = input.policy ?? PEEK_N_PEAK_ONE_TAP_V1;
  if (!input.roundCourseId) return { live: null, eligibility: { eligible: false, reason: 'wrong_course' } };
  if (!input.pkg) return { live: null, eligibility: { eligible: false, reason: 'geometry_hash_not_approved' } };
  const eligibility = isPeekNPeakOneTapEligible({ roundCourseId: input.roundCourseId, pkg: input.pkg, featureFlagEnabled: input.featureFlagEnabled, preciseLocationAvailable: !!input.location }, policy);
  if (!eligibility.eligible) return { live: null, eligibility };
  const holeKeys = [...input.pkg.holes].sort((a, b) => a.ordinal - b.ordinal).map(h => h.key);
  return { eligibility, live: { roundId: input.roundId, courseId: eligibility.courseId, geometryVersion: eligibility.geometryVersion, pkg: input.pkg, holeKeys,
    terrainByHole: input.terrainByHole, contextLayer: input.contextLayer, location: input.location, storage: input.storage, transport: input.transport } };
}
/** The package hole for a round hole number, or null when the package does not map it (that hole stays on standard tracking). */
export function holeKeyForRoundHole(live: Pick<OneTapLiveRound, 'pkg'>, holeNumber: number): string | null {
  return live.pkg.holes.find(h => h.ordinal === holeNumber)?.key ?? null;
}
export function greenCentreENU(pkg: CourseGeometryPackage, holeKey: string): PointM | null {
  try {
    const green = buildSurfacePartition(pkg, holeKey).surfaces.find(s => s.lieClass === 'green');
    const ring = green ? largestOuterRing(green.feature) : null;
    return ring ? ringCentroid(ring) : null;
  } catch { return null; }
}

/** The published, owner-approved package for a course: `<base>/<courseId>/manifest.json`
 * names the geometry version and the package file. Nothing is fetched while
 * no hash is approved, and a package whose hash or site disagrees with the
 * policy is refused — a source-candidate package never reaches a player. */
export interface ApprovedPackageManifestFile { geometryVersion: string; packageUrl: string }
export interface CoursePackageAssets { pkg: CourseGeometryPackage; terrainByHole?: Readonly<Record<string, TerrainMesh>>; contextLayer?: ContextLayer }
type FetchLike = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
export async function loadApprovedCoursePackage(courseId: string, policy: PeekNPeakOneTapPolicy = PEEK_N_PEAK_ONE_TAP_V1,
  fetchImpl: FetchLike | null = typeof fetch === 'function' ? (url => fetch(url)) : null, baseUrl = '/course-geometry'): Promise<CoursePackageAssets | null> {
  if (!fetchImpl || policy.approvedGeometryHashes.size === 0 || courseId !== policy.courseId) return null;
  try {
    const manifestResponse = await fetchImpl(`${baseUrl}/${courseId}/manifest.json`);
    if (!manifestResponse.ok) return null;
    const manifest = await manifestResponse.json() as Partial<ApprovedPackageManifestFile> | null;
    if (!manifest || typeof manifest.geometryVersion !== 'string' || typeof manifest.packageUrl !== 'string' || !policy.approvedGeometryHashes.has(manifest.geometryVersion)) return null;
    const packageResponse = await fetchImpl(manifest.packageUrl);
    if (!packageResponse.ok) return null;
    const pkg = await packageResponse.json() as CourseGeometryPackage | null;
    if (!pkg || pkg.contentHash !== manifest.geometryVersion || pkg.siteId !== policy.siteId || pkg.status === 'source_candidate') return null;
    return { pkg };
  } catch { return null; }
}
