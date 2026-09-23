import type { ContextLayer } from '../course-geometry/context-layer';
import type { TerrainMesh } from '../course-geometry/terrain';
import type { CourseGeometryPackage, PointM } from '../course-geometry/types';
import type { StorageLike, SyncTransport } from './anchor-repository';
import type { RoundTypeLike } from './competition-policy';
import { defaultFetch, loadCourseAssets, type CourseAssetCache, type FetchLike, type PreflightStatus } from './course-assets';
import { largestOuterRing, ringCentroid } from './hole-distances';
import { buildSurfacePartition } from './lie-classifier';
import type { LocationSource } from './location-source';
import { isCourseGeometryEligible, type CourseGeometryEligibility as OneTapEligibility, type CourseGeometryPolicy } from '../course-geometry/course-policy';
import { courseGeometryPolicyForLayout } from '../course-geometry/course-registry';

/** Saved scoring setup is supplied by the host round, never by the geometry compiler. */
export interface RoundScoringSetup {
  dbCourseId: string | null;
  selectedTeeId: string | null;
  scorecardProfileId?: string | null;
  scorecardRevision?: string | null;
  holes: readonly { number: number; par: number; yardage: number }[];
}
export function explicitHoleBindings(pkg: CourseGeometryPackage, policy: CourseGeometryPolicy | null): Readonly<Record<number, string>> {
  const bindings = policy?.holeBindings?.[pkg.contentHash] ?? {};
  return Object.fromEntries(Object.entries(bindings).filter(([, key]) => pkg.holes.some(h => h.key === key)));
}

/** Master design §77 placement: Meridian Live replaces the shot-entry screen
 * only for an explicitly admitted physical package. Visual candidates can
 * remain available in the review renderer, but cannot supply a live round.
 * Every unavailable round keeps the existing tracker unchanged. */
export interface OneTapLiveRound {
  roundId: string;
  courseId: string;
  geometryVersion: string;
  pkg: CourseGeometryPackage;
  roundSetup?: RoundScoringSetup;
  roundHoleKeys?: Readonly<Record<number, string>>;
  /** Explicitly bound hole keys in played order. */
  holeKeys: readonly string[];
  terrainByHole?: Readonly<Record<string, TerrainMesh>>;
  contextLayer?: ContextLayer;
  location: LocationSource | null;
  /** Omitted → localStorage; null → memory only. */
  storage?: StorageLike | null;
  transport?: SyncTransport | null;
  /** Task 15 preflight verdict: `ready` plays fully offline, `partial` draws
   * un-cached holes in 2D; absent when no preflight ran (the lab). */
  readiness?: PreflightStatus;
  /** Task 16: tournament and qualifier rounds lock Competition Mode on. */
  roundType?: RoundTypeLike;
  /** Meridian world for the course drawing (policy `renderWorld`, R7). */
  world?: 'v1' | 'v2';
}
interface CoursePackageAssets { pkg: CourseGeometryPackage; terrainByHole?: Readonly<Record<string, TerrainMesh>>; contextLayer?: ContextLayer; geometryVersion?: string }
export interface ResolveLiveRoundInput {
  roundHoleKeys?: Readonly<Record<number, string>>;
  roundSetup?: RoundScoringSetup;
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
  /** Defaults to the registry entry for `roundCourseId`; an unlisted course is `wrong_course`. */
  policy?: CourseGeometryPolicy | null;
  readiness?: PreflightStatus;
  roundType?: RoundTypeLike;
}
export function resolveOneTapLiveRound(input: ResolveLiveRoundInput): { live: OneTapLiveRound | null; eligibility: OneTapEligibility } {
  if (!input.roundCourseId) return { live: null, eligibility: { eligible: false, reason: 'wrong_course' } };
  const policy = input.policy ?? courseGeometryPolicyForLayout(input.roundCourseId);
  if (!policy) return { live: null, eligibility: { eligible: false, reason: 'wrong_course' } };
  if (!input.pkg) return { live: null, eligibility: { eligible: false, reason: 'geometry_hash_not_approved' } };
  const eligibility = isCourseGeometryEligible({ roundCourseId: input.roundCourseId, pkg: input.pkg, featureFlagEnabled: input.featureFlagEnabled, preciseLocationAvailable: !!input.location,
    requiredTier: 'C3' }, policy);
  if (!eligibility.eligible) return { live: null, eligibility };
  const roundHoleKeys = input.roundHoleKeys ?? explicitHoleBindings(input.pkg, policy);
  const roundSetup = input.roundSetup ? structuredClone(input.roundSetup) : undefined;
  const order = roundSetup?.holes.map(h => h.number) ?? Object.keys(roundHoleKeys).map(Number).sort((a, b) => a - b);
  // A round's scorecard owns its played order. Do not remove an unmapped hole
  // and let the remaining package keys slide into a different position.
  const holeKeys: string[] = [];
  for (const number of order) {
    const key = roundHoleKeys[number];
    if (!key || !input.pkg.holes.some(hole => hole.key === key)) {
      return { live: null, eligibility: { eligible: false, reason: 'capability_not_available' } };
    }
    holeKeys.push(key);
  }
  if (!holeKeys.length || new Set(holeKeys).size !== holeKeys.length) {
    return { live: null, eligibility: { eligible: false, reason: 'capability_not_available' } };
  }
  return { eligibility, live: { roundId: input.roundId, courseId: eligibility.courseId, geometryVersion: eligibility.geometryVersion, pkg: input.pkg, holeKeys, roundSetup, roundHoleKeys,
    terrainByHole: input.terrainByHole, contextLayer: input.contextLayer, location: input.location, storage: input.storage, transport: input.transport, readiness: input.readiness, roundType: input.roundType, world: policy.renderWorld } };
}
/** The package hole for a round hole number, or null when the package does not map it (that hole stays on standard tracking). */
export function holeKeyForRoundHole(live: Pick<OneTapLiveRound, 'pkg' | 'roundHoleKeys'>, holeNumber: number): string | null {
  const key = live.roundHoleKeys?.[holeNumber];
  return key && live.pkg.holes.some(h => h.key === key) ? key : null;
}
export function greenCentreENU(pkg: CourseGeometryPackage, holeKey: string): PointM | null {
  try {
    const green = buildSurfacePartition(pkg, holeKey).surfaces.find(s => s.lieClass === 'green');
    const ring = green ? largestOuterRing(green.feature) : null;
    return ring ? ringCentroid(ring) : null;
  } catch { return null; }
}

/** The published, owner-approved package for a course, through the offline
 * asset cache (task 15): the manifest is read network-first, hashed assets
 * cache-first, so a round that was preflighted plays with no signal. Nothing
 * is fetched while no hash is approved, and a package whose hash or site
 * disagrees with the policy is refused — a source-candidate package never
 * reaches a player. */
export type { CoursePackageAssets };
export async function loadApprovedCoursePackage(courseId: string, policy: CourseGeometryPolicy | null = courseGeometryPolicyForLayout(courseId),
  fetchImpl: FetchLike | null = defaultFetch, baseUrl = '/course-geometry', cache: CourseAssetCache | null = null): Promise<CoursePackageAssets | null> {
  const loaded = await loadCourseAssets({ courseId, policy, cache, fetchImpl, baseUrl });
  return loaded ? { pkg: loaded.pkg, terrainByHole: loaded.terrainByHole, geometryVersion: loaded.geometryVersion } : null;
}
