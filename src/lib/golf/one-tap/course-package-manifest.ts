import type { CourseGeometryPackage } from '../course-geometry/types';
import type { TerrainMesh } from '../course-geometry/terrain';
import { MERIDIAN_STYLE_HASH, fnv1a } from '../course-geometry/visual-style';
import { MERIDIAN_VISUAL_COMPILER_VERSION } from '../course-geometry/visual-artifact';
import { COMPETITION_POLICY_VERSION } from './competition-policy';
import { UNSPECIFIED, type LocalOrigin, localOriginFor } from './geodesy';
import { courseIdForSite } from '../course-geometry/course-registry';

/** Course package manifest (master plan "Course package"). Versions are the
 * content hashes already gating the pipeline: geometry = package hash,
 * terrain = per-hole terrain hashes, render = compiler + style hash. */
export interface CoursePackageManifest {
  /** Product course id (the registry layout for the package's site); the site id for a course no policy names. */
  courseId: string;
  /** The package's OSM site id — the identity the eligibility gate matches on. */
  siteId: string;
  name: string;
  geometryVersion: string;
  terrainVersion: string | null;
  terrainByHole: Record<string, string>;
  renderVersion: string;
  sourceManifestHash: string;
  localOrigin: LocalOrigin;
  holes: number[];
  competitionPolicyVersion: string;
  builtAt: string;
  basis: 'content_hashes';
}
export function buildCoursePackageManifest(pkg: CourseGeometryPackage, terrainByHole: Readonly<Record<string, Pick<TerrainMesh, 'contentHash'>>>, builtAt: string): CoursePackageManifest {
  const terrain = Object.fromEntries(Object.entries(terrainByHole).sort(([a], [b]) => a.localeCompare(b)).map(([key, mesh]) => [key, mesh.contentHash]));
  const terrainHashes = Object.values(terrain);
  return { courseId: courseIdForSite(pkg.siteId), siteId: pkg.siteId, name: pkg.name, geometryVersion: pkg.contentHash, terrainVersion: terrainHashes.length ? fnv1a(terrainHashes.join('\n')) : null, terrainByHole: terrain,
    renderVersion: `${MERIDIAN_VISUAL_COMPILER_VERSION}:${MERIDIAN_STYLE_HASH}`, sourceManifestHash: fnv1a(JSON.stringify(pkg.sources.map(s => [s.id, s.url, s.retrievedAt, s.capturedAt]))),
    localOrigin: localOriginFor(pkg, UNSPECIFIED), holes: pkg.holes.map(h => h.ordinal).sort((a, b) => a - b), competitionPolicyVersion: COMPETITION_POLICY_VERSION, builtAt, basis: 'content_hashes' };
}
