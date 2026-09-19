import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import { MemoryCourseAssetCache, cacheStorageCourseAssetCache, fetchAsset, loadCourseAssets, loadCoursePackage, loadHoleTerrain, manifestUrl, preflightCourseAssets, pruneCourseAssets } from '../course-assets';
import { isCourseGeometryEligible, type CourseGeometryPolicy } from '../../course-geometry/course-policy';
import { PEEK_N_PEAK_UPPER_POLICY } from '../../course-geometry/course-registry';

// SYNTHETIC POLICY: the pilot fixture stands in for an approved Upper package.
const policy: CourseGeometryPolicy = { ...PEEK_N_PEAK_UPPER_POLICY, siteIds: new Set([pilotPackage.siteId]), approvedGeometryHashes: new Set([pilotPackage.contentHash]), pilotAcceptsSourceCandidate: false };
/** The gate outside the pilot: nothing approved, no source-candidate exception. */
const dark: CourseGeometryPolicy = { ...policy, approvedGeometryHashes: new Set() };
const COURSE = policy.layoutId, HASH = pilotPackage.contentHash;
const PKG_URL = `/course-geometry/${COURSE}/${HASH}/package.json`, TERRAIN_URL = `/course-geometry/${COURSE}/${HASH}/terrain/cacapon-07.json`;
const terrainBody = readFileSync(join(process.cwd(), 'src/test/fixtures/course-geometry/cacapon-07-terrain.json'), 'utf8');
const manifestBody = JSON.stringify({ geometryVersion: HASH, packageUrl: PKG_URL, terrainByHole: { 'cacapon-07': TERRAIN_URL } });
/** A server that can be switched off mid-round. */
function server(bodies: Record<string, string> = { [manifestUrl(COURSE)]: manifestBody, [PKG_URL]: JSON.stringify(pilotPackage), [TERRAIN_URL]: terrainBody }) {
  const state = { online: true, calls: [] as string[] };
  const fetchImpl = vi.fn(async (url: string) => {
    state.calls.push(url);
    if (!state.online) throw new TypeError('Failed to fetch');
    const body = bodies[url];
    return { ok: body != null, text: async () => body ?? '' };
  });
  return { state, fetchImpl };
}

describe('course assets (task 15 — offline readiness)', () => {
  it('fetches nothing while no package hash is approved', async () => {
    const { state, fetchImpl } = server();
    expect(await preflightCourseAssets({ courseId: COURSE, policy: dark, cache: new MemoryCourseAssetCache(), fetchImpl })).toMatchObject({ status: 'not_approved' });
    expect(await loadCourseAssets({ courseId: COURSE, policy: dark, cache: new MemoryCourseAssetCache(), fetchImpl })).toBeNull();
    expect(state.calls).toEqual([]);
  });

  it('pre-caches the package and every mapped hole\'s terrain, then survives a network loss mid-round', async () => {
    const cache = new MemoryCourseAssetCache();
    const { state, fetchImpl } = server();
    const first = await preflightCourseAssets({ courseId: COURSE, policy, cache, fetchImpl });
    expect(first).toMatchObject({ status: 'ready', geometryVersion: HASH, manifestSource: 'network', missing: [] });
    expect(first.assets.map(a => a.source)).toEqual(['network', 'network']);
    expect((await cache.keys()).sort()).toEqual([manifestUrl(COURSE), PKG_URL, TERRAIN_URL].sort());
    // Signal lost: the manifest falls back to its cached copy and everything else is cache-first.
    state.online = false;
    const offline = await preflightCourseAssets({ courseId: COURSE, policy, cache, fetchImpl });
    expect(offline).toMatchObject({ status: 'ready', manifestSource: 'cache' });
    expect(offline.assets.map(a => a.source)).toEqual(['cache', 'cache']);
    const loaded = await loadCourseAssets({ courseId: COURSE, policy, cache, fetchImpl });
    expect(loaded?.pkg.contentHash).toBe(HASH);
    expect(Object.keys(loaded!.terrainByHole)).toEqual(['cacapon-07']);
    expect(loaded!.sources[PKG_URL]).toBe('cache');
    // Signal back: hashed assets are still served from the cache, only the manifest is re-read.
    state.online = true; state.calls.length = 0;
    await loadCourseAssets({ courseId: COURSE, policy, cache, fetchImpl });
    expect(state.calls).toEqual([manifestUrl(COURSE)]);
  });

  it('is unavailable with no signal and an empty cache, and partial when a hole\'s terrain is missing', async () => {
    const { state, fetchImpl } = server();
    state.online = false;
    expect(await preflightCourseAssets({ courseId: COURSE, policy, cache: new MemoryCourseAssetCache(), fetchImpl })).toMatchObject({ status: 'unavailable', geometryVersion: null });
    expect(await loadCourseAssets({ courseId: COURSE, policy, cache: new MemoryCourseAssetCache(), fetchImpl })).toBeNull();
    const noTerrain = server({ [manifestUrl(COURSE)]: manifestBody, [PKG_URL]: JSON.stringify(pilotPackage) });
    const report = await preflightCourseAssets({ courseId: COURSE, policy, cache: new MemoryCourseAssetCache(), fetchImpl: noTerrain.fetchImpl });
    expect(report).toMatchObject({ status: 'partial', missing: [TERRAIN_URL] });
    expect(report.assets).toEqual([{ kind: 'package', url: PKG_URL, source: 'network' }, { kind: 'terrain', holeKey: 'cacapon-07', url: TERRAIN_URL, source: null }]);
    const loaded = await loadCourseAssets({ courseId: COURSE, policy, cache: new MemoryCourseAssetCache(), fetchImpl: noTerrain.fetchImpl });
    expect(loaded?.terrainByHole).toEqual({});
  });

  it('refuses a package under an unapproved hash, a foreign site or the wrong version, even from the cache', async () => {
    const cache = new MemoryCourseAssetCache();
    const stale = { ...policy, approvedGeometryHashes: new Set(['approved-elsewhere']) };
    expect(await preflightCourseAssets({ courseId: COURSE, policy: stale, cache, fetchImpl: server().fetchImpl })).toMatchObject({ status: 'not_approved', geometryVersion: HASH });
    const foreign = { ...policy, siteIds: new Set(['osm-way-000']) };
    expect(await preflightCourseAssets({ courseId: COURSE, policy: foreign, cache, fetchImpl: server().fetchImpl })).toMatchObject({ status: 'unavailable', missing: [PKG_URL] });
    // A poisoned cache entry is dropped rather than served.
    await cache.put(PKG_URL, JSON.stringify({ ...pilotPackage, status: 'source_candidate' }));
    const { state, fetchImpl } = server();
    state.online = false;
    await cache.put(manifestUrl(COURSE), manifestBody);
    expect(await loadCourseAssets({ courseId: COURSE, policy, cache, fetchImpl })).toBeNull();
    expect(await preflightCourseAssets({ courseId: COURSE, policy, cache, fetchImpl })).toMatchObject({ status: 'unavailable' });
    expect(await cache.get(PKG_URL)).toBeNull();
  });

  it('prunes this course\'s assets from a superseded version and leaves other courses alone', async () => {
    const cache = new MemoryCourseAssetCache();
    await cache.put(`/course-geometry/${COURSE}/old-hash/package.json`, '{}');
    await cache.put(`https://app.example/course-geometry/${COURSE}/old-hash/terrain/h1.json`, '{}');
    await cache.put('/course-geometry/other-course/hash/package.json', '{}');
    const { fetchImpl } = server();
    await preflightCourseAssets({ courseId: COURSE, policy, cache, fetchImpl });
    expect((await cache.keys()).sort()).toEqual(['/course-geometry/other-course/hash/package.json', manifestUrl(COURSE), PKG_URL, TERRAIN_URL].sort());
    expect(await pruneCourseAssets(cache, COURSE, [])).toEqual(expect.arrayContaining([manifestUrl(COURSE), PKG_URL, TERRAIN_URL]));
  });

  it('wraps the Cache API and falls back to network-only where it is missing', async () => {
    expect(cacheStorageCourseAssetCache(null)).toBeNull();
    const store = new Map<string, string>();
    const fake = { open: async () => ({
      match: async (url: string) => store.has(url) ? { text: async () => store.get(url)! } : undefined,
      put: async (url: string, response: Response) => { store.set(url, await response.text()); },
      delete: async (url: string) => store.delete(url),
      keys: async () => [...store.keys()].map(url => ({ url })),
    }) };
    const cache = cacheStorageCourseAssetCache(fake)!;
    const hit = await fetchAsset(PKG_URL, { cache, fetchImpl: server().fetchImpl, strategy: 'cache_first' });
    expect(hit?.source).toBe('network');
    expect(await cache.keys()).toEqual([PKG_URL]);
    expect((await fetchAsset(PKG_URL, { cache, fetchImpl: null, strategy: 'network_first' }))?.source).toBe('cache');
    await cache.delete(PKG_URL);
    expect(await fetchAsset(PKG_URL, { cache, fetchImpl: null, strategy: 'network_first' })).toBeNull();
  });

  it('loads the optional context layer the manifest names and plays on without one', async () => {
    // The Upper package with its own context layer (woods, paths, structures);
    // SYNTHETIC POLICY again — the hash is approved for this test only.
    const upper = JSON.parse(readFileSync(join(process.cwd(), 'src/test/fixtures/course-geometry/peek-n-peak-upper.json'), 'utf8')) as { contentHash: string; siteId: string; status: string };
    const upperPolicy: CourseGeometryPolicy = { ...PEEK_N_PEAK_UPPER_POLICY, siteIds: new Set([upper.siteId]), approvedGeometryHashes: new Set([upper.contentHash]) };
    const contextBody = readFileSync(join(process.cwd(), 'src/test/fixtures/course-geometry/peek-n-peak-upper-context.json'), 'utf8');
    const UPPER_PKG = `/course-geometry/${COURSE}/${upper.contentHash}/package.json`, CONTEXT_URL = `/course-geometry/${COURSE}/${upper.contentHash}/context.json`;
    const withContext = JSON.stringify({ geometryVersion: upper.contentHash, packageUrl: UPPER_PKG, terrainByHole: {}, contextLayerUrl: CONTEXT_URL });
    const packageBody = JSON.stringify({ ...upper, status: 'reviewed_draft' }); // the gate refuses a source candidate; the layer is what this test is about
    const { fetchImpl } = server({ [manifestUrl(COURSE)]: withContext, [UPPER_PKG]: packageBody, [CONTEXT_URL]: contextBody });
    const cache = new MemoryCourseAssetCache();
    const loaded = await loadCourseAssets({ courseId: COURSE, policy: upperPolicy, cache, fetchImpl });
    expect(loaded?.contextLayer?.zones.length).toBeGreaterThan(0);
    expect(loaded!.sources[CONTEXT_URL]).toBe('network');
    expect((await cache.keys())).toContain(CONTEXT_URL);
    // The preflight verdict does not depend on the layer: a course without one is still ready.
    expect(await preflightCourseAssets({ courseId: COURSE, policy: upperPolicy, cache: new MemoryCourseAssetCache(), fetchImpl })).toMatchObject({ status: 'ready', missing: [] });
    // A layer that fails to parse (here, one for another package) is dropped, not fatal.
    const foreignLayer = server({ [manifestUrl(COURSE)]: withContext, [UPPER_PKG]: packageBody, [CONTEXT_URL]: JSON.stringify({ ...JSON.parse(contextBody), packageHash: 'not-this-package' }) });
    const dropped = await loadCourseAssets({ courseId: COURSE, policy: upperPolicy, cache: new MemoryCourseAssetCache(), fetchImpl: foreignLayer.fetchImpl });
    expect(dropped?.pkg.contentHash).toBe(upper.contentHash);
    expect(dropped?.contextLayer).toBeUndefined();
  });

  it('accepts the SHIPPED Upper manifest and package under the SHIPPED policy — no override', async () => {
    // What the phone runs: public/course-geometry/<course>/manifest.json and
    // the package it names, gated by the registry's Upper policy as committed.
    // Terrain is answered 404 to keep the test off the 52 MB of meshes.
    const root = join(process.cwd(), 'public');
    const fetchImpl = vi.fn(async (url: string) => { const ok = !url.includes('/terrain/') && existsSync(join(root, url)); return { ok, text: async () => ok ? readFileSync(join(root, url), 'utf8') : '' }; });
    const courseId = PEEK_N_PEAK_UPPER_POLICY.layoutId;
    const loaded = await loadCoursePackage({ courseId, cache: new MemoryCourseAssetCache(), fetchImpl });
    expect(PEEK_N_PEAK_UPPER_POLICY.siteIds.has(loaded!.pkg.siteId)).toBe(true);
    expect(loaded?.manifest.geometryVersion).toBe(loaded?.pkg.contentHash);
    expect(Object.keys(loaded!.manifest.terrainByHole ?? {})).toHaveLength(18);
    expect(loaded?.contextLayer?.zones.length).toBeGreaterThan(0);
    expect(isCourseGeometryEligible({ roundCourseId: courseId, pkg: loaded!.pkg, featureFlagEnabled: true, preciseLocationAvailable: true }, PEEK_N_PEAK_UPPER_POLICY)).toMatchObject({ eligible: true, geometryVersion: loaded!.pkg.contentHash });
    // A terrain that is not there is null, never a throw.
    expect(await loadHoleTerrain(Object.values(loaded!.manifest.terrainByHole!)[0] ?? '', loaded!.pkg, { cache: null, fetchImpl })).toBeNull();
  });
});
