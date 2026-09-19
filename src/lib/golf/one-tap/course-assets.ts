import { parseContextLayer, type ContextLayer } from '../course-geometry/context-layer';
import { parseTerrainMesh, type TerrainMesh } from '../course-geometry/terrain';
import type { CourseGeometryPackage } from '../course-geometry/types';
import { packageApproved, type CourseGeometryPolicy } from '../course-geometry/course-policy';
import { courseGeometryPolicyForLayout } from '../course-geometry/course-registry';

/** Master plan task 15 — offline course readiness. The essential manifest
 * names everything a round needs on the course with no signal: the approved
 * package and the terrain of every mapped hole. Context (trees, paths) is
 * optional — the course stays playable without it. Assets are cached under
 * the URL the manifest names, which carries the geometry version, so a
 * cached body is only ever served for the hash it was published under; the
 * manifest itself is read network-first so a newly approved version wins
 * when there is signal and the last one serves when there is none. */
export interface EssentialCourseManifest {
  courseId: string;
  geometryVersion: string;
  packageUrl: string;
  /** Terrain mesh URL per package hole key; a hole without one draws in 2D. */
  terrainByHole?: Record<string, string>;
  contextLayerUrl?: string;
}
export const COURSE_ASSET_CACHE_NAME = 'golfhelm-course-geometry-v1';
export function manifestUrl(courseId: string, baseUrl = '/course-geometry'): string { return `${baseUrl}/${courseId}/manifest.json`; }

export interface CourseAssetCache {
  get(url: string): Promise<string | null>;
  put(url: string, body: string): Promise<void>;
  delete(url: string): Promise<void>;
  keys(): Promise<string[]>;
}
export class MemoryCourseAssetCache implements CourseAssetCache {
  private readonly entries = new Map<string, string>();
  async get(url: string) { return this.entries.get(url) ?? null; }
  async put(url: string, body: string) { this.entries.set(url, body); }
  async delete(url: string) { this.entries.delete(url); }
  async keys() { return [...this.entries.keys()]; }
}
interface CacheLike { match(url: string): Promise<{ text(): Promise<string> } | undefined>; put(url: string, response: Response): Promise<void>; delete(url: string): Promise<boolean>; keys(): Promise<{ url: string }[]> }
interface CacheStorageLike { open(name: string): Promise<CacheLike> }
/** The Cache API inside the mobile shell WebView (and any browser); null
 * where it is missing, in which case the round works network-only. Every
 * operation swallows storage failures — a full or evicted cache must never
 * break a round that has signal. */
export function cacheStorageCourseAssetCache(caches: CacheStorageLike | null | undefined = typeof globalThis.caches === 'undefined' ? null : globalThis.caches as unknown as CacheStorageLike,
  name = COURSE_ASSET_CACHE_NAME): CourseAssetCache | null {
  if (!caches || typeof Response === 'undefined') return null;
  const open = () => caches.open(name);
  return {
    async get(url) { try { const hit = await (await open()).match(url); return hit ? await hit.text() : null; } catch { return null; } },
    async put(url, body) { try { await (await open()).put(url, new Response(body, { headers: { 'content-type': 'application/json' } })); } catch { /* storage full or unavailable */ } },
    async delete(url) { try { await (await open()).delete(url); } catch { /* ignore */ } },
    async keys() { try { return (await (await open()).keys()).map(r => r.url); } catch { return []; } },
  };
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>;
export type AssetSource = 'network' | 'cache';
export type AssetStrategy = 'network_first' | 'cache_first';
export interface AssetResult { url: string; body: string; source: AssetSource }
export const defaultFetch: FetchLike | null = typeof fetch === 'function' ? (url => fetch(url)) : null;
/** One asset by strategy. A network body is cached on the way through; a
 * network failure (offline, 5xx, a thrown fetch) falls back to the cache. */
export async function fetchAsset(url: string, { cache, fetchImpl = defaultFetch, strategy }: { cache: CourseAssetCache | null; fetchImpl?: FetchLike | null; strategy: AssetStrategy }): Promise<AssetResult | null> {
  const fromCache = async (): Promise<AssetResult | null> => { const body = cache ? await cache.get(url) : null; return body == null ? null : { url, body, source: 'cache' }; };
  const fromNetwork = async (): Promise<AssetResult | null> => {
    if (!fetchImpl) return null;
    try {
      const response = await fetchImpl(url);
      if (!response.ok) return null;
      const body = await response.text();
      await cache?.put(url, body);
      return { url, body, source: 'network' };
    } catch { return null; }
  };
  if (strategy === 'cache_first') return await fromCache() ?? await fromNetwork();
  return await fromNetwork() ?? await fromCache();
}

function parseManifest(body: string, courseId: string): EssentialCourseManifest | null {
  try {
    const value = JSON.parse(body) as Partial<EssentialCourseManifest> | null;
    if (!value || typeof value.geometryVersion !== 'string' || typeof value.packageUrl !== 'string') return null;
    const terrainByHole = value.terrainByHole && typeof value.terrainByHole === 'object'
      ? Object.fromEntries(Object.entries(value.terrainByHole).filter((e): e is [string, string] => typeof e[1] === 'string')) : undefined;
    return { courseId, geometryVersion: value.geometryVersion, packageUrl: value.packageUrl, terrainByHole, contextLayerUrl: typeof value.contextLayerUrl === 'string' ? value.contextLayerUrl : undefined };
  } catch { return null; }
}
/** A package is accepted only under the policy's approved hash and site, and
 * as a source candidate only under the policy's explicit pilot exception —
 * a cached body is held to the same bar. */
export function parseApprovedPackage(body: string, geometryVersion: string, policy: CourseGeometryPolicy): CourseGeometryPackage | null {
  try {
    const pkg = JSON.parse(body) as CourseGeometryPackage | null;
    if (!pkg || pkg.contentHash !== geometryVersion || !packageApproved(pkg, policy)) return null;
    return pkg;
  } catch { return null; }
}

/** `policy` defaults to the registry entry for `courseId`; an unlisted course approves nothing. */
export interface CourseAssetOptions { courseId: string; policy?: CourseGeometryPolicy | null; cache: CourseAssetCache | null; fetchImpl?: FetchLike | null; baseUrl?: string }
export type PreflightStatus = 'ready' | 'partial' | 'unavailable' | 'not_approved';
export interface PreflightAsset { kind: 'package' | 'terrain'; holeKey?: string; url: string; source: AssetSource | null }
export interface PreflightReport { status: PreflightStatus; geometryVersion: string | null; manifestSource: AssetSource | null; assets: PreflightAsset[]; missing: string[] }
/** Pre-cache before the round (§ task 15 "pre-cache geometry/terrain"):
 * network-first manifest, then every essential asset cache-first so a second
 * preflight with no signal is instant and a first one with signal fills the
 * cache. `ready` means the whole course is viewable offline; `partial` means
 * the package is here but some hole's terrain is not (that hole draws in 2D);
 * `unavailable` means no package — the round stays on standard tracking. */
export async function preflightCourseAssets({ courseId, policy = courseGeometryPolicyForLayout(courseId), cache, fetchImpl = defaultFetch, baseUrl = '/course-geometry' }: CourseAssetOptions): Promise<PreflightReport> {
  const empty = (status: PreflightStatus, geometryVersion: string | null = null, manifestSource: AssetSource | null = null): PreflightReport => ({ status, geometryVersion, manifestSource, assets: [], missing: [] });
  if (!policy || policy.approvedGeometryHashes.size === 0 || courseId !== policy.layoutId) return empty('not_approved');
  const manifestHit = await fetchAsset(manifestUrl(courseId, baseUrl), { cache, fetchImpl, strategy: 'network_first' });
  const manifest = manifestHit ? parseManifest(manifestHit.body, courseId) : null;
  if (!manifest) return empty('unavailable');
  if (!policy.approvedGeometryHashes.has(manifest.geometryVersion)) return empty('not_approved', manifest.geometryVersion, manifestHit!.source);
  const assets: PreflightAsset[] = [], missing: string[] = [];
  const packageHit = await fetchAsset(manifest.packageUrl, { cache, fetchImpl, strategy: 'cache_first' });
  const pkg = packageHit ? parseApprovedPackage(packageHit.body, manifest.geometryVersion, policy) : null;
  if (!pkg) { if (packageHit) await cache?.delete(manifest.packageUrl); return { status: 'unavailable', geometryVersion: manifest.geometryVersion, manifestSource: manifestHit!.source, assets: [{ kind: 'package', url: manifest.packageUrl, source: null }], missing: [manifest.packageUrl] }; }
  assets.push({ kind: 'package', url: manifest.packageUrl, source: packageHit!.source });
  for (const [holeKey, url] of Object.entries(manifest.terrainByHole ?? {})) {
    const hit = await fetchAsset(url, { cache, fetchImpl, strategy: 'cache_first' });
    let mesh: TerrainMesh | null = null;
    if (hit) { try { mesh = parseTerrainMesh(JSON.parse(hit.body), pkg); } catch { mesh = null; await cache?.delete(url); } }
    assets.push({ kind: 'terrain', holeKey, url, source: mesh ? hit!.source : null });
    if (!mesh) missing.push(url);
  }
  await pruneCourseAssets(cache, courseId, [manifestUrl(courseId, baseUrl), manifest.packageUrl, ...Object.values(manifest.terrainByHole ?? {}), ...(manifest.contextLayerUrl ? [manifest.contextLayerUrl] : [])], baseUrl);
  return { status: missing.length ? 'partial' : 'ready', geometryVersion: manifest.geometryVersion, manifestSource: manifestHit!.source, assets, missing };
}
/** Drop this course's cached assets from a version the manifest no longer
 * names, so the cache holds one course version at a time. */
export async function pruneCourseAssets(cache: CourseAssetCache | null, courseId: string, keep: readonly string[], baseUrl = '/course-geometry'): Promise<string[]> {
  if (!cache) return [];
  const prefix = `${baseUrl}/${courseId}/`, keepSet = new Set(keep), removed: string[] = [];
  for (const url of await cache.keys()) {
    const path = url.startsWith('http') ? url.replace(/^https?:\/\/[^/]+/, '') : url;
    if (path.startsWith(prefix) && !keepSet.has(path) && !keepSet.has(url)) { await cache.delete(url); removed.push(url); }
  }
  return removed;
}

export interface LoadedCourseAssets { geometryVersion: string; pkg: CourseGeometryPackage; terrainByHole: Record<string, TerrainMesh>; contextLayer?: ContextLayer; sources: Record<string, AssetSource> }
/** What the live round consumes: the approved package and whichever terrain
 * is present, from the cache when there is no signal. Null when no approved
 * package can be had either way. */
export interface LoadedCoursePackage { manifest: EssentialCourseManifest; pkg: CourseGeometryPackage; contextLayer?: ContextLayer; sources: Record<string, AssetSource> }
/** The approved package (and the optional context layer) alone — the part a
 * live round needs before it can start. Terrain follows per hole through
 * `loadHoleTerrain`, so the first hole is on screen after ~1.5 MB instead of
 * after the whole course. Null when no approved package can be had. */
export async function loadCoursePackage({ courseId, policy = courseGeometryPolicyForLayout(courseId), cache, fetchImpl = defaultFetch, baseUrl = '/course-geometry' }: CourseAssetOptions): Promise<LoadedCoursePackage | null> {
  if (!policy || policy.approvedGeometryHashes.size === 0 || courseId !== policy.layoutId) return null;
  const manifestHit = await fetchAsset(manifestUrl(courseId, baseUrl), { cache, fetchImpl, strategy: 'network_first' });
  const manifest = manifestHit ? parseManifest(manifestHit.body, courseId) : null;
  if (!manifest || !policy.approvedGeometryHashes.has(manifest.geometryVersion)) return null;
  const packageHit = await fetchAsset(manifest.packageUrl, { cache, fetchImpl, strategy: 'cache_first' });
  const pkg = packageHit ? parseApprovedPackage(packageHit.body, manifest.geometryVersion, policy) : null;
  if (!pkg) return null;
  const sources: Record<string, AssetSource> = { [manifestUrl(courseId, baseUrl)]: manifestHit!.source, [manifest.packageUrl]: packageHit!.source };
  // The outside-world layer (woods, paths, structures) is optional: the
  // course plays without it, so a missing or unparseable layer is dropped
  // rather than failing the round.
  let contextLayer: ContextLayer | undefined;
  if (manifest.contextLayerUrl) {
    const hit = await fetchAsset(manifest.contextLayerUrl, { cache, fetchImpl, strategy: 'cache_first' });
    if (hit) { try { contextLayer = parseContextLayer(JSON.parse(hit.body), pkg); sources[manifest.contextLayerUrl] = hit.source; } catch { await cache?.delete(manifest.contextLayerUrl); } }
  }
  return { manifest, pkg, contextLayer, sources };
}
/** One hole's terrain, cache-first; null (and the cached body dropped) when
 * it is missing or does not parse against the package. */
export async function loadHoleTerrain(url: string, pkg: CourseGeometryPackage, { cache, fetchImpl = defaultFetch }: Pick<CourseAssetOptions, 'cache' | 'fetchImpl'>): Promise<{ mesh: TerrainMesh; source: AssetSource } | null> {
  const hit = await fetchAsset(url, { cache, fetchImpl, strategy: 'cache_first' });
  if (!hit) return null;
  try { return { mesh: parseTerrainMesh(JSON.parse(hit.body), pkg), source: hit.source }; } catch { await cache?.delete(url); return null; }
}
export async function loadCourseAssets(options: CourseAssetOptions): Promise<LoadedCourseAssets | null> {
  const loaded = await loadCoursePackage(options);
  if (!loaded) return null;
  const { manifest, pkg, contextLayer, sources } = loaded;
  const terrainByHole: Record<string, TerrainMesh> = {};
  for (const [holeKey, url] of Object.entries(manifest.terrainByHole ?? {})) {
    const terrain = await loadHoleTerrain(url, pkg, options);
    if (terrain) { terrainByHole[holeKey] = terrain.mesh; sources[url] = terrain.source; }
  }
  return { geometryVersion: manifest.geometryVersion, pkg, terrainByHole, contextLayer, sources };
}
