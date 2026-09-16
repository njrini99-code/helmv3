'use client';

/** Local One-Tap play-through on a compiled course. A synthetic walker stands
 * in for the phone's GPS and follows the hole route; marks persist in this
 * browser only (localStorage) and nothing reaches Supabase or a real round.
 * The walker is exposed on `window.__oneTapWalker` for the capture script. */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/fairway/controls/button';
import { OneTapPlayerScreen } from '@/components/golf/one-tap/OneTapPlayerScreen';
import type { TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { CourseGeometryPackage, PointM } from '@/lib/golf/course-geometry/types';
import { ANCHOR_STORAGE_PREFIX } from '@/lib/golf/one-tap/anchor-repository';
import { localOriginFor, wgs84ToEnu } from '@/lib/golf/one-tap/geodesy';
import { largestOuterRing, ringCentroid } from '@/lib/golf/one-tap/hole-distances';
import { buildSurfacePartition, type LieClass } from '@/lib/golf/one-tap/lie-classifier';
import { syntheticWalker, type SyntheticWalker } from '@/lib/golf/one-tap/location-source';
import { compiledCourses, contextLayerFor, loadCompiledFixture, type CompiledCourse } from './fixture-assets';

declare global { interface Window { __oneTapWalker?: SyntheticWalker } }

/** The hole route in local metres: the package route when it has one,
 * otherwise tee centroid → green centroid from the surface partition. */
export function walkerRoute(pkg: CourseGeometryPackage, holeKey: string): PointM[] {
  const origin = localOriginFor(pkg);
  const hole = pkg.holes.find(h => h.key === holeKey);
  const route = hole?.routeFeatureId ? pkg.features.find(f => f.id === hole.routeFeatureId) : null;
  if (route && route.geometryWgs84.type === 'LineString' && route.geometryWgs84.coordinates.length >= 2) {
    return route.geometryWgs84.coordinates.map(position => { const [e, n] = wgs84ToEnu([position[0]!, position[1]!, null], origin); return [e, n] as const; });
  }
  const partition = buildSurfacePartition(pkg, holeKey);
  const centroid = (lie: LieClass): PointM | null => {
    const surface = partition.surfaces.find(s => s.lieClass === lie), ring = surface ? largestOuterRing(surface.feature) : null;
    return ring ? ringCentroid(ring) : null;
  };
  const tee = centroid('tee'), green = centroid('green');
  return tee && green ? [tee, green] : [[0, 0], [0, 1]];
}

export function OneTapFixture({ course, holeNumber, showBar = false }: { course: CompiledCourse; holeNumber: number; showBar?: boolean }) {
  const pkg = compiledCourses[course].pkg;
  const hole = pkg.holes.find(h => h.ordinal === holeNumber) ?? pkg.holes[0]!;
  const roundId = `local-one-tap:${course}`;
  const [terrain, setTerrain] = useState<TerrainMesh | null>(null);
  const [terrainState, setTerrainState] = useState('loading');
  useEffect(() => {
    const controller = new AbortController();
    setTerrain(null); setTerrainState('loading');
    loadCompiledFixture(hole.key, controller.signal, course).then(mesh => { if (!controller.signal.aborted) { setTerrain(mesh); setTerrainState('ready'); } })
      .catch(() => { if (!controller.signal.aborted) setTerrainState('unavailable'); });
    return () => controller.abort();
  }, [course, hole.key]);
  const walker = useMemo(() => syntheticWalker({ origin: localOriginFor(pkg), routeM: walkerRoute(pkg, hole.key), accuracyM: 3, intervalMs: 500, seed: 11 }), [pkg, hole.key]);
  useEffect(() => {
    window.__oneTapWalker = walker;
    return () => { if (window.__oneTapWalker === walker) delete window.__oneTapWalker; };
  }, [walker]);
  const reset = () => { try { localStorage.removeItem(ANCHOR_STORAGE_PREFIX + roundId); } catch { /* private mode */ } location.reload(); };
  return <div className="flex h-dvh min-h-0 flex-col bg-surface font-fw-sans">
    {showBar && <div className="flex flex-wrap items-center gap-1 border-b border-border-subtle px-3 py-1 text-caption text-text-secondary" data-slot="one-tap-lab-bar">
      <span className="mr-1">Walker · {course} · hole {hole.ordinal}</span>
      <Button variant="ghost" size="sm" onClick={() => walker.walk(60)}>Walk 60 m</Button>
      <Button variant="ghost" size="sm" onClick={() => walker.walkTo(walker.routeLengthM - 8)}>To green</Button>
      <Button variant="ghost" size="sm" onClick={() => walker.setAccuracy(12)}>Poor GPS</Button>
      <Button variant="ghost" size="sm" onClick={reset}>Reset marks</Button>
    </div>}
    <OneTapPlayerScreen roundId={roundId} pkg={pkg} holeKey={hole.key} terrain={terrain} contextLayer={contextLayerFor(course) ?? undefined} location={walker} />
    <output hidden data-terrain-fixture-state={terrainState} data-walker-route-m={Math.round(walker.routeLengthM)} />
  </div>;
}
