'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import { evictTerrain, rememberViewedHole, residentTerrainKeys } from '@/lib/golf/course-geometry/terrain-residency';
import type { TrackingGeometry } from '@/lib/golf/course-geometry/tracking-scene';
import { browserRoundLeaseStore, cacheStorageCourseAssetCache, loadCoursePackage, loadHoleTerrain, manifestUrl, pruneCourseAssets, type CourseAssetCache, type FetchLike, type LoadedCoursePackage } from '@/lib/golf/one-tap/course-assets';
import { explicitHoleBindings, holeKeyForRoundHole, type OneTapLiveRound } from '@/lib/golf/one-tap/live-round-placement';
import type { CourseGeometryPolicy } from '@/lib/golf/course-geometry/course-policy';
import { resolveCourseGeometryPolicy } from '@/lib/golf/course-geometry/course-registry';

/** Course-framed presentation (plan §unlock 3) for a round on a modelled
 * course — today Peek'n Peak Upper, the one course with an owner-approved
 * package. The gate is the course identity alone (`productCourseIdForRound`:
 * a bound `golf_courses` id or a name that reads as Peek'n Peak *Upper*);
 * every other round gets `undefined` and no request is made, so the tracker
 * and review render exactly as they do without this hook. For a matched
 * round the approved package streams in through the One-Tap asset cache
 * (network-first manifest, cache-first assets), then the hole on screen and
 * the next one get their terrain, at most three meshes resident (§69). A
 * package or terrain that cannot be had is not an error: the round simply
 * keeps its 2D course frame, or the plain layout, and shot entry never waits. */
export interface UseCourseGeometryOptions {
  roundId?: string | null;
  dbCourseId?: string | null;
  courseName?: string | null;
  /** Round hole numbers in the caller's order: `holeKeys[i]` is the package
   * hole for `holeNumbers[i]`, `''` when the package does not map it. */
  holeNumbers: readonly number[];
  /** The hole on screen: its terrain loads first, the next hole's behind it.
   * `null` (review with no hole open) loads no terrain at all. */
  focusHoleNumber?: number | null;
  /** Entry brings the next hole's terrain in behind the current one so the
   * walk to the next tee never waits; review (`false`) loads the open hole only. */
  prefetchNext?: boolean;
  /** `false` keeps the hook idle — Meridian Live owns the course assets while
   * it is loading or up, and the tracker takes its geometry from the live round. */
  enabled?: boolean;
  /** One policy to test against instead of the registry (tests, the lab). */
  policy?: CourseGeometryPolicy;
  /** Test seams; production uses the Cache API and `fetch`. */
  cache?: CourseAssetCache | null;
  fetchImpl?: FetchLike | null;
}
export type CourseGeometryStatus = 'inactive' | 'loading' | 'ready' | 'unavailable';
export interface CourseGeometryState { geometry: TrackingGeometry | undefined; status: CourseGeometryStatus }

export function useCourseGeometry({ roundId, dbCourseId, courseName, holeNumbers, focusHoleNumber = null, prefetchNext = true, enabled = true, policy: onlyPolicy, cache, fetchImpl }: UseCourseGeometryOptions): CourseGeometryState {
  const policy = useMemo(() => resolveCourseGeometryPolicy({ dbCourseId, courseName }, onlyPolicy ? [onlyPolicy] : undefined), [dbCourseId, courseName, onlyPolicy]);
  const productCourseId = policy?.layoutId ?? null;
  const active = enabled && productCourseId !== null;
  const [loaded, setLoaded] = useState<LoadedCoursePackage | null>(null);
  const [status, setStatus] = useState<CourseGeometryStatus>('inactive');
  const [terrainByHole, setTerrainByHole] = useState<Readonly<Record<string, TerrainMesh>>>({});
  const assetCache = useMemo(() => cache === undefined ? cacheStorageCourseAssetCache() : cache, [cache]);

  // The package, once per course. Nothing runs for any other course. A course
  // change drops what was loaded; a pause (`enabled: false`, Meridian Live
  // taking the assets over) keeps it, so the hero never falls back to the
  // plain card for the seconds Live takes to come up or go away.
  const matched = productCourseId !== null;
  useEffect(() => {
    if (!matched) { setLoaded(null); setTerrainByHole({}); setStatus('inactive'); return; }
    if (!active) return;
    let cancelled = false;
    setStatus(current => current === 'ready' ? current : 'loading');
    void (async () => {
      try {
        const result = await loadCoursePackage({ roundId: roundId ?? undefined, leaseStore: browserRoundLeaseStore(), courseId: productCourseId!, policy: policy!, cache: assetCache, fetchImpl });
        if (cancelled) return;
        setLoaded(current => current && result && current.manifest.geometryVersion === result.manifest.geometryVersion ? current : result);
        setStatus(result ? 'ready' : 'unavailable');
        // Old versions stay available while a suspended round leases them.
        if (result) await pruneCourseAssets(assetCache, productCourseId!, [manifestUrl(productCourseId!), result.manifest.packageUrl, ...Object.values(result.manifest.terrainByHole ?? {}), ...(result.manifest.contextLayerUrl ? [result.manifest.contextLayerUrl] : [])]);
      } catch {
        if (!cancelled) { setLoaded(null); setStatus('unavailable'); }
      }
    })();
    return () => { cancelled = true; };
  }, [matched, active, roundId, productCourseId, policy, assetCache, cache, fetchImpl]);

  // Hole numbers are compared by value so a caller may rebuild the array per render.
  const holeNumbersKey = holeNumbers.join(',');
  const holeKeys = useMemo(() => {
    const pkg = loaded?.pkg;
    return holeNumbersKey === '' || !pkg ? [] : holeNumbersKey.split(',').map(n => holeKeyForRoundHole({ pkg, roundHoleKeys: explicitHoleBindings(pkg, policy) }, Number(n)) ?? '');
  }, [holeNumbersKey, loaded, policy]);

  // Terrain residency (§69): the hole on screen, the next hole, then the most
  // recently viewed, at most three decoded meshes; the rest are evicted. The
  // loaded map is mirrored in a ref so a hole change never restarts a load
  // that is already in.
  const terrainRef = useRef(terrainByHole);
  terrainRef.current = terrainByHole;
  const recent = useRef<string[]>([]);
  useEffect(() => {
    if (!active || !loaded || focusHoleNumber == null) return;
    const { manifest, pkg } = loaded;
    const index = holeKeys.findIndex((key, i) => key !== '' && Number(holeNumbersKey.split(',')[i]) === focusHoleNumber);
    const current = index >= 0 ? holeKeys[index]! : '';
    if (!current) return;
    recent.current = rememberViewedHole(recent.current, current);
    const resident = residentTerrainKeys({ current, next: holeKeys[index + 1] || null, recent: recent.current });
    setTerrainByHole(prev => evictTerrain(prev, resident));
    const wanted = resident.slice(0, prefetchNext ? 2 : 1).filter(key => manifest.terrainByHole?.[key] && !terrainRef.current[key]);
    let cancelled = false;
    void (async () => {
      for (const key of wanted) {
        const terrain = await loadHoleTerrain(manifest.terrainByHole![key]!, pkg, { cache: assetCache, fetchImpl });
        if (cancelled) return;
        if (terrain) setTerrainByHole(prev => prev[key] ? prev : { ...prev, [key]: terrain.mesh });
      }
    })();
    return () => { cancelled = true; };
  }, [active, loaded, holeKeys, holeNumbersKey, focusHoleNumber, prefetchNext, assetCache, fetchImpl]);

  const geometry = useMemo<TrackingGeometry | undefined>(() => loaded
    ? { package: loaded.pkg, holeKeys, terrainByHole, contextLayer: loaded.contextLayer }
    : undefined, [loaded, holeKeys, terrainByHole]);
  return { geometry, status };
}

/** The same read-only geometry from a resolved Meridian Live round, so a
 * round whose Live is up (or that stepped back to standard tracking for a
 * hole) draws from the assets Live already holds instead of loading twice. */
export function trackingGeometryFromLiveRound(live: Pick<OneTapLiveRound, 'pkg' | 'roundHoleKeys' | 'terrainByHole' | 'contextLayer'>, holeNumbers: readonly number[]): TrackingGeometry {
  return { package: live.pkg, holeKeys: holeNumbers.map(n => holeKeyForRoundHole(live, n) ?? ''), terrainByHole: live.terrainByHole, contextLayer: live.contextLayer };
}
