/** Local play-through of a compiled course. Shots persist in this browser only
 * (localStorage); nothing reaches Supabase, statistics or a real round. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evictTerrain, rememberViewedHole, residentTerrainKeys } from '@/lib/golf/course-geometry/terrain-residency';
import FairwayShotTracking from '@/components/fairway/pages/rounds-tracking/FairwayShotTracking';
import type { HoleStats, RoundHole, ShotRecord } from '@/lib/types/golf';
import type { TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import { Button } from '@/components/ui/button';
import { compiledCourses, contextLayerFor, loadCompiledFixture, type CompiledCourse } from './fixture-assets';

interface SavedRound {
  holeIndex: number;
  shotsByHole: Record<number, ShotRecord[]>;
  scores: Record<number, number>;
  updatedAt: string;
}
const EMPTY: SavedRound = { holeIndex: 0, shotsByHole: {}, scores: {}, updatedAt: '' };
const storageKey = (course: CompiledCourse) => `golfhelm-local-round:${course}`;

function readSaved(course: CompiledCourse, holeCount: number): SavedRound {
  try {
    const raw = localStorage.getItem(storageKey(course));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as SavedRound;
    if (typeof parsed.holeIndex !== 'number' || parsed.holeIndex < 0 || parsed.holeIndex >= holeCount) return EMPTY;
    return { ...EMPTY, ...parsed };
  } catch { return EMPTY; }
}

export function PlayRoundFixture({ course }: { course: CompiledCourse }) {
  const pkg = compiledCourses[course].pkg;
  const holeKeys = useMemo(() => pkg.holes.map(h => h.key), [pkg]);
  const [saved, setSaved] = useState<SavedRound>(() => readSaved(course, pkg.holes.length));
  const [terrainByHole, setTerrainByHole] = useState<Record<string, TerrainMesh>>({});
  const [terrainState, setTerrainState] = useState('loading');
  const [clearArmed, setClearArmed] = useState(false);
  const holeIndex = saved.holeIndex;
  const currentKey = holeKeys[holeIndex]!;

  const persist = useCallback((next: SavedRound) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    setSaved(stamped);
    try { localStorage.setItem(storageKey(course), JSON.stringify(stamped)); } catch { /* private mode: in-memory only */ }
  }, [course]);

  // §69 residency: current + next + most recently viewed, at most three
  // decoded meshes; the rest are evicted least-recently-used.
  const recentHoles = useRef<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    recentHoles.current = rememberViewedHole(recentHoles.current, currentKey);
    const resident = residentTerrainKeys({ current: currentKey, next: holeKeys[holeIndex + 1], recent: recentHoles.current });
    const wanted = resident.slice(0, 2);
    setTerrainState(terrainByHole[currentKey] ? 'ready' : 'loading');
    setTerrainByHole(current => evictTerrain(current, resident) as Record<string, TerrainMesh>);
    for (const key of wanted) {
      if (terrainByHole[key]) continue;
      loadCompiledFixture(key, controller.signal, course).then(mesh => {
        if (controller.signal.aborted) return;
        setTerrainByHole(current => ({ ...current, [key]: mesh }));
        if (key === currentKey) setTerrainState('ready');
      }).catch(() => { if (!controller.signal.aborted && key === currentKey) setTerrainState('unavailable'); });
    }
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- terrainByHole is the cache being maintained, not an input
  }, [currentKey, holeIndex, holeKeys, course]);

  const holes: RoundHole[] = useMemo(() => pkg.holes.map((h, index) => ({
    number: h.ordinal, par: h.par, yardage: h.scorecardYards ?? 0, score: saved.scores[index] ?? null,
  })), [pkg, saved.scores]);
  // The outside world (context layer) is part of the production player view:
  // the fixture binds it exactly as the app's geometry bundle would.
  const geometry = useMemo(() => ({ package: pkg, holeKeys, terrainByHole, contextLayer: contextLayerFor(course) ?? undefined }), [pkg, holeKeys, terrainByHole, course]);
  const initialShots = saved.shotsByHole[holeIndex] ?? [];

  const onHoleComplete = useCallback(async (index: number, stats: HoleStats) => {
    persist({ ...saved, scores: { ...saved.scores, [index]: stats.score }, shotsByHole: { ...saved.shotsByHole, [index]: stats.shots },
      holeIndex: Math.min(index + 1, holeKeys.length - 1) });
    return true;
  }, [persist, saved, holeKeys.length]);
  const onAutoSave = useCallback(async (shots: ShotRecord[], index: number) => {
    persist({ ...saved, shotsByHole: { ...saved.shotsByHole, [index]: shots } });
  }, [persist, saved]);
  const clearRound = () => {
    if (!clearArmed) { setClearArmed(true); return; }
    try { localStorage.removeItem(storageKey(course)); } catch { /* ignore */ }
    setSaved(EMPTY); setClearArmed(false);
  };

  return <>
    <p role="status" data-play-notice data-terrain-state={terrainState} className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-control border border-border-subtle bg-surface px-3 py-2 font-fw-sans text-caption text-text-secondary">
      <span>{pkg.name} · local play. Shots save on this device only; positions are estimates, not GPS.</span>
      <Button type="button" variant="ghost" size="sm" onClick={clearRound} className="shrink-0">{clearArmed ? 'Tap again to clear' : 'Clear round'}</Button>
    </p>
    <FairwayShotTracking key={`${course}:${holeIndex}:${saved.updatedAt === '' ? 'fresh' : 'saved'}`} holes={holes} currentHoleIndex={holeIndex}
      initialShots={initialShots} initialShotNumber={initialShots.length + 1} geometry={geometry}
      onHoleComplete={onHoleComplete} onNavigateToHole={index => persist({ ...saved, holeIndex: index })}
      onAutoSave={onAutoSave} autoSaveInterval={4000} onExit={() => {}} />
  </>;
}
