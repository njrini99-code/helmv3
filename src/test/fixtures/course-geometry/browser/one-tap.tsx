'use client';

/** Local One-Tap round on a compiled course. A synthetic walker stands in for
 * the phone's GPS and follows the hole route (then on to the next tee, so the
 * next-tee fallback can be exercised); marks and the hole index persist in
 * this browser only (localStorage) and nothing reaches Supabase or a real
 * round. The walker is exposed on `window.__oneTapWalker` for the capture
 * script. */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/fairway/controls/button';
import { OneTapPlayerScreen } from '@/components/golf/one-tap/OneTapPlayerScreen';
import { useOneTapRound, ROUND_STORAGE_PREFIX } from '@/components/golf/one-tap/use-one-tap-round';
import type { TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { CourseGeometryPackage, PointM } from '@/lib/golf/course-geometry/types';
import { ANCHOR_STORAGE_PREFIX } from '@/lib/golf/one-tap/anchor-repository';
import { localOriginFor, wgs84ToEnu } from '@/lib/golf/one-tap/geodesy';
import { largestOuterRing, ringCentroid } from '@/lib/golf/one-tap/hole-distances';
import { buildSurfacePartition, type LieClass } from '@/lib/golf/one-tap/lie-classifier';
import { routeLength, syntheticWalker, type LocationSource, type SyntheticWalker } from '@/lib/golf/one-tap/location-source';
import type { LocationSample } from '@/lib/golf/one-tap/location-estimator';
import { compiledCourses, contextLayerFor, loadCompiledFixture, type CompiledCourse } from './fixture-assets';

declare global { interface Window { __oneTapWalker?: SyntheticWalker } }

function surfaceCentroid(pkg: CourseGeometryPackage, holeKey: string, lie: LieClass): PointM | null {
  const surface = buildSurfacePartition(pkg, holeKey).surfaces.find(s => s.lieClass === lie), ring = surface ? largestOuterRing(surface.feature) : null;
  return ring ? ringCentroid(ring) : null;
}
/** The hole route in local metres: the package route when it has one,
 * otherwise tee centroid → green centroid; the next hole's tee is appended so
 * the walker can reach it. */
export function walkerRoute(pkg: CourseGeometryPackage, holeKey: string, nextHoleKey: string | null = null): { routeM: PointM[]; greenAtM: number } {
  const origin = localOriginFor(pkg);
  const hole = pkg.holes.find(h => h.key === holeKey);
  const route = hole?.routeFeatureId ? pkg.features.find(f => f.id === hole.routeFeatureId) : null;
  let points: PointM[];
  if (route && route.geometryWgs84.type === 'LineString' && route.geometryWgs84.coordinates.length >= 2) {
    points = route.geometryWgs84.coordinates.map(position => { const [e, n] = wgs84ToEnu([position[0]!, position[1]!, null], origin); return [e, n] as const; });
  } else {
    const tee = surfaceCentroid(pkg, holeKey, 'tee'), green = surfaceCentroid(pkg, holeKey, 'green');
    points = tee && green ? [tee, green] : [[0, 0], [0, 1]];
  }
  const nextTee = nextHoleKey ? surfaceCentroid(pkg, nextHoleKey, 'tee') : null;
  return { routeM: nextTee ? [...points, nextTee] : points, greenAtM: routeLength(points) };
}

export function OneTapFixture({ course, holeNumber, showBar = false, playMode = 'practice' }: { course: CompiledCourse; holeNumber: number; showBar?: boolean; playMode?: 'practice' | 'competition' }) {
  const pkg = compiledCourses[course].pkg;
  const holeKeys = useMemo(() => pkg.holes.map(h => h.key), [pkg]);
  const roundId = `local-one-tap:${course}`;
  const startIndex = Math.max(0, pkg.holes.findIndex(h => h.ordinal === holeNumber));
  // The requested hole wins over a remembered index on first load.
  const [seeded] = useState(() => { try { localStorage.setItem(ROUND_STORAGE_PREFIX + roundId, JSON.stringify({ holeIndex: startIndex })); } catch { /* private mode */ } return true; });
  const [terrain, setTerrain] = useState<TerrainMesh | null>(null);
  const [terrainState, setTerrainState] = useState('loading');
  // One stable source for the screen and the round: the current hole's walker
  // feeds it, so a hole change swaps the walker without re-subscribing anyone.
  const hub = useState(() => { const listeners = new Set<(s: LocationSample) => void>(); const source: LocationSource = { kind: 'synthetic', subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; } }; return { listeners, source }; })[0];
  // `?mode=competition` plays the lab round as a tournament (task 16).
  const round = useOneTapRound({ roundId, pkg, holeKeys, location: hub.source, roundType: playMode === 'competition' ? 'tournament' : 'practice' });
  const hole = pkg.holes.find(h => h.key === round.holeKey) ?? pkg.holes[0]!;
  useEffect(() => {
    const controller = new AbortController();
    setTerrain(null); setTerrainState('loading');
    loadCompiledFixture(hole.key, controller.signal, course).then(mesh => { if (!controller.signal.aborted) { setTerrain(mesh); setTerrainState('ready'); } })
      .catch(() => { if (!controller.signal.aborted) setTerrainState('unavailable'); });
    return () => controller.abort();
  }, [course, hole.key]);
  const nextKey = holeKeys[round.holeIndex + 1] ?? null;
  const route = useMemo(() => walkerRoute(pkg, hole.key, nextKey), [pkg, hole.key, nextKey]);
  const walker = useMemo(() => syntheticWalker({ origin: localOriginFor(pkg), routeM: route.routeM, accuracyM: 3, intervalMs: 500, seed: 11 }), [pkg, route]);
  useEffect(() => {
    window.__oneTapWalker = walker;
    const off = walker.subscribe(sample => { for (const l of hub.listeners) l(sample); });
    return () => { off(); if (window.__oneTapWalker === walker) delete window.__oneTapWalker; };
  }, [walker, hub]);
  const reset = () => { try { localStorage.removeItem(ANCHOR_STORAGE_PREFIX + roundId); localStorage.removeItem(ROUND_STORAGE_PREFIX + roundId); } catch { /* private mode */ } location.reload(); };
  return <div className="flex h-dvh min-h-0 flex-col bg-surface font-fw-sans" data-seeded={seeded}>
    {showBar && <div className="flex flex-wrap items-center gap-1 border-b border-border-subtle px-3 py-1 text-caption text-text-secondary" data-slot="one-tap-lab-bar">
      <span className="mr-1">Walker · {course} · hole {hole.ordinal} · {round.strokes} strokes</span>
      <Button variant="ghost" size="sm" onClick={() => walker.walk(60)}>Walk 60 m</Button>
      <Button variant="ghost" size="sm" onClick={() => walker.walkTo(route.greenAtM - 8)}>To green</Button>
      <Button variant="ghost" size="sm" onClick={() => walker.walkTo(walker.routeLengthM)}>To next tee</Button>
      <Button variant="ghost" size="sm" onClick={() => walker.setAccuracy(12)}>Poor GPS</Button>
      <Button variant="ghost" size="sm" onClick={round.previousHole}>Prev hole</Button>
      <Button variant="ghost" size="sm" onClick={reset}>Reset round</Button>
    </div>}
    <OneTapPlayerScreen roundId={roundId} pkg={pkg} holeKey={hole.key} terrain={terrain} contextLayer={contextLayerFor(course) ?? undefined} location={hub.source} round={round}
      reducedMotion={typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches} />
    <output hidden data-terrain-fixture-state={terrainState} data-walker-route-m={Math.round(walker.routeLengthM)} data-walker-green-m={Math.round(route.greenAtM)} data-scorecard={JSON.stringify(round.scorecard.map(r => [r.ordinal, r.strokes, r.status]))} />
  </div>;
}
