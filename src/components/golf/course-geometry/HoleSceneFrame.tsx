'use client';

import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { Maximize2, RotateCcw } from 'lucide-react';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Button } from '@/components/fairway/controls/button';
import { PuttingZoom } from '@/components/golf/coachhelm/v3/HoleShotPath/PuttingZoom';
import { UnavailableCourseContext } from '@/components/golf/coachhelm/v3/HoleShotPath/turf';
import type { HoleScene, ShotEvidence } from '@/lib/golf/course-geometry/types';
import type { SceneView } from '@/lib/golf/course-geometry/camera';
import { CourseHoleScene, sceneCamera } from './CourseHoleScene';
import { fitTerrainCamera, TERRAIN_PRESETS, type TerrainPose, type TerrainPreset } from '@/lib/golf/course-geometry/terrain';

const LABELS: Record<SceneView, string> = { hole: 'Whole hole', approach: 'Approach', green: 'Green', putting: 'Putting' };
interface FrameProps {
  scene?: HoleScene | null;
  context: 'entry' | 'review';
  defaultView?: SceneView;
  selectedShotNumber?: number;
  evidence?: readonly ShotEvidence[];
  currentPuttingDistanceM?: number | null;
  header?: ReactNode;
  children?: ReactNode;
}

/** One reusable viewing container. Its caller keys by hole identity; a manual
 * view persists through typing and committed shots, until a different hole. */
export function HoleSceneFrame({ scene, context, defaultView = 'hole', selectedShotNumber, evidence, currentPuttingDistanceM, header, children }: FrameProps) {
  const [choice, setChoice] = useState<SceneView | null>(null);
  const [expanded, setExpanded] = useState(false);
  const view = choice ?? defaultView;
  const events = evidence ?? scene?.events.map(e => e.evidence) ?? [];
  const putting = currentPuttingDistanceM != null || events.some(e => e.shotType === 'putting');
  const unassignedStudy = !!scene?.hole.displayLabel && !scene.hole.routeFeatureId;
  const views: SceneView[] = unassignedStudy ? ['green'] : ['hole', 'green', ...(defaultView === 'approach' ? ['approach' as const] : []), ...(putting ? ['putting' as const] : [])];
  const expand = <ModalShell open={expanded} onOpenChange={setExpanded} presentation="workspace" title="Course detail"
    description="Course context · ball and pin positions unknown"
    trigger={<Button variant="ghost" aria-label="Expand course view" className="h-11 min-w-11 shrink-0 px-2"><Maximize2 size={17} aria-hidden /></Button>}>
    <ModalShell.Body>
      <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Expanded course views">
        {views.map(v => <Button variant={view === v ? 'secondary' : 'ghost'} size="sm" key={v} aria-pressed={view === v} onClick={() => setChoice(v)}>{LABELS[v]}</Button>)}
      </div>
      <Drawing key={view} scene={scene} view={view} context={context} events={events} selectedShotNumber={selectedShotNumber}
        currentPuttingDistanceM={currentPuttingDistanceM} expanded />
      {(scene?.sharedGreenHoleOrdinals?.length ?? 0) > 1 && <p className="mt-2 text-caption text-text-secondary">Shared green: holes {scene!.sharedGreenHoleOrdinals!.join(' and ')}. The outline shows the whole shared surface.</p>}
      <p className="mt-2 text-caption text-text-secondary">{scene?.attribution ?? 'Course geometry unavailable.'}</p>
    </ModalShell.Body>
  </ModalShell>;
  return <div className="min-w-0" data-scene-context={context} data-current-view={view}>
    <div className="flex min-h-14 items-center justify-between gap-1 px-3 py-1" data-slot="scene-header">
      {context === 'review' ? <div className="flex min-w-0 flex-wrap gap-1" role="group" aria-label="Course views">
        {views.map(v => <Button size="sm" className="h-11 px-3" variant={view === v ? 'secondary' : 'ghost'} key={v} aria-pressed={view === v} onClick={() => setChoice(v)}>{v === 'hole' ? 'Hole' : LABELS[v]}</Button>)}
      </div> : header}
      {context === 'entry' && !unassignedStudy ? <div className="flex shrink-0 items-center">
        <Button variant="ghost" size="sm" className="h-11 px-2 text-caption" onClick={() => setChoice(view === 'hole' ? (defaultView === 'hole' ? 'green' : defaultView) : 'hole')}>
          {view === 'hole' ? (defaultView === 'hole' ? 'Green' : LABELS[defaultView]) : 'Whole hole'}
        </Button>{expand}
      </div> : expand}
    </div>
    <Drawing scene={scene} view={view} context={context} events={events} selectedShotNumber={selectedShotNumber} currentPuttingDistanceM={currentPuttingDistanceM} />
    <p className="px-3 py-[3px] font-fw-sans text-eyebrow leading-4 text-text-secondary">
      {view === 'putting' ? 'Abstract cup · distances only' : scene ? `${scene.hole.completeness === 'reviewed_surfaces' ? 'Reviewed' : 'Partial'}${(scene.sharedGreenHoleOrdinals?.length ?? 0) > 1 ? ' shared green' : ' outline'} · ${scene.attribution.split(' · ')[0]}` : 'Schematic context · no mapped position'}
    </p>
    {children}
  </div>;
}

function Drawing({ scene, view, context, events, selectedShotNumber, currentPuttingDistanceM, expanded = false }: {
  scene?: HoleScene | null; view: SceneView; context: 'entry' | 'review'; events: readonly ShotEvidence[];
  selectedShotNumber?: number; currentPuttingDistanceM?: number | null; expanded?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: context === 'entry' ? 160 : 310 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [pose, setPose] = useState<TerrainPose>(TERRAIN_PRESETS.top);
  const [terrainFailed, setTerrainFailed] = useState(false);
  const pendingFrame = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ x: 0, y: 0, distance: 0, zoom: 1, pan: { x: 0, y: 0 }, pose });
  const terrainEnabled = expanded && view !== 'putting' && scene?.terrain != null && !terrainFailed;
  const boundedPan = (x: number, y: number) => ({ x: Math.max(-size.width / 2, Math.min(size.width / 2, x)),
    y: Math.max(-size.height / 2, Math.min(size.height / 2, y)) });
  const isPreset = (preset: TerrainPreset) => Math.abs(pose.pitch - TERRAIN_PRESETS[preset].pitch) < .01 &&
    Math.abs(pose.yawOffset - TERRAIN_PRESETS[preset].yawOffset) < .01;
  useEffect(() => () => cancelAnimationFrame(pendingFrame.current), []);
  function startGesture(event: PointerEvent<HTMLDivElement>) {
    if (!terrainEnabled) return;
    cancelAnimationFrame(pendingFrame.current);
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const p = [...pointers.current.values()];
    gesture.current = { x: p.reduce((n, a) => n + a.x, 0) / p.length, y: p.reduce((n, a) => n + a.y, 0) / p.length,
      distance: p.length > 1 ? Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y) : 0, zoom, pan, pose };
  }
  function moveGesture(event: PointerEvent<HTMLDivElement>) {
    if (!terrainEnabled || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const p = [...pointers.current.values()], g = gesture.current;
    const dx = p.reduce((n, a) => n + a.x, 0) / p.length - g.x;
    const dy = p.reduce((n, a) => n + a.y, 0) / p.length - g.y;
    cancelAnimationFrame(pendingFrame.current);
    pendingFrame.current = requestAnimationFrame(() => {
      if (p.length === 1) setPose({ ...g.pose, pitch: Math.max(20, Math.min(90, g.pose.pitch - dy * .22)),
        yawOffset: Math.max(-45, Math.min(45, g.pose.yawOffset + dx * .22)) });
      else {
        const distance = Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y);
        setZoom(Math.max(1, Math.min(4, g.zoom * distance / Math.max(1, g.distance))));
        setPan(boundedPan(g.pan.x + dx, g.pan.y + dy));
      }
    });
  }
  function endGesture(event: PointerEvent<HTMLDivElement>) {
    if (event.type === 'pointercancel') cancelAnimationFrame(pendingFrame.current);
    pointers.current.delete(event.pointerId);
    // Start a fresh gesture after fingers change; never apply a stale pinch origin.
    pointers.current.clear();
  }
  function presetView(preset: TerrainPreset) {
    cancelAnimationFrame(pendingFrame.current);
    const target = TERRAIN_PRESETS[preset], start = pose;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setPose(target); return; }
    const began = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / 240), eased = 1 - (1 - t) ** 3;
      setPose({ pitch: start.pitch + (target.pitch - start.pitch) * eased,
        yawOffset: start.yawOffset + (target.yawOffset - start.yawOffset) * eased,
        exaggeration: start.exaggeration + (target.exaggeration - start.exaggeration) * eased });
      if (t < 1) pendingFrame.current = requestAnimationFrame(tick);
    };
    pendingFrame.current = requestAnimationFrame(tick);
  }
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 32 && r.height > 32) setSize({ width: r.width, height: r.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const camera = scene && view !== 'putting' ? sceneCamera(scene, size.width, size.height, context === 'entry' ? 'compact' : 'review', view) : null;
  const transformed = camera && expanded ? { ...camera, scale: camera.scale * zoom,
    translation: [size.width / 2 + (camera.translation[0] - size.width / 2) * zoom + pan.x,
      size.height / 2 + (camera.translation[1] - size.height / 2) * zoom + pan.y] as const } : camera;
  let terrainCamera;
  if (terrainEnabled && scene?.terrain) {
    try { terrainCamera = fitTerrainCamera(scene, scene.terrain, view, size.width, size.height, pose, zoom, [pan.x, pan.y]); }
    catch { /* Missing source coverage retains the existing 2D view. */ }
  }
  const putt = events.find(e => e.shotNumber === selectedShotNumber && e.shotType === 'putting') ?? events.find(e => e.shotType === 'putting');
  const before = currentPuttingDistanceM ?? putt?.before.valueM ?? null;
  const after = currentPuttingDistanceM != null ? null : putt?.after.valueM ?? null;
  return <>
    {terrainEnabled && <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Terrain camera">
      {(['top', 'terrain', 'side'] as const).map(preset => <Button key={preset} size="sm"
        variant={isPreset(preset) ? 'secondary' : 'ghost'}
        aria-pressed={isPreset(preset)} onClick={() => presetView(preset)}>
        {{ top: 'Top', terrain: 'Terrain', side: 'Side' }[preset]}</Button>)}
      <Button size="sm" variant="ghost" onClick={() => { cancelAnimationFrame(pendingFrame.current); setPose(p => ({ ...p, exaggeration: p.exaggeration === 1 ? 1.5 : 1 })); }}>
        Height {pose.exaggeration.toFixed(1)}×</Button>
    </div>}
    <div ref={ref} data-slot="course-drawing" className="fw-course-motion relative w-full overflow-clip"
      onPointerDown={startGesture} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture}
      style={{ height: expanded ? 'clamp(160px, calc(100dvh - 340px), 480px)' : context === 'entry' ? 160 : 310, touchAction: terrainEnabled ? 'none' : 'auto' }}>
      <div key={`${scene?.physicalHoleKey ?? 'missing'}-${view}`} className="fw-course-view-enter h-full w-full">
      {view === 'putting' ? <PuttingZoom width={size.width} height={size.height} distanceView={{
        beforeFeet: before == null ? null : before / .3048, afterFeet: after == null ? null : after / .3048,
        made: currentPuttingDistanceM == null && putt?.putt.made === true,
        rolledOff: putt != null && putt.result !== 'green' && putt.result !== 'hole',
      }} /> : scene && transformed ? <CourseHoleScene scene={scene} width={size.width} height={size.height}
        mode={context === 'entry' ? 'compact' : 'review'} view={view} selectedShotNumber={selectedShotNumber} camera={transformed} terrainCamera={terrainCamera}
        onTerrainUnavailable={() => setTerrainFailed(true)} /> : <UnavailableCourseContext />}
      </div>
    </div>
    {terrainEnabled && <p className="mt-2 text-caption text-text-secondary">{scene!.terrain!.source.acquisitionStart.slice(0, 4)} USGS terrain study · height {pose.exaggeration.toFixed(1)}×.
      {' '}{terrainCamera ? 'Illustrative trees. Drag to tilt · pinch to zoom' : 'Elevation unavailable here; showing course outline.'}</p>}
    {expanded && terrainFailed && <p role="status" className="mt-2 text-caption text-text-secondary">3D view unavailable on this device. Showing the course outline.</p>}
    {expanded && view !== 'putting' && scene && <div className="mt-2 flex flex-wrap items-center gap-1" role="group" aria-label="Zoom and pan">
      <Button size="sm" variant="secondary" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom(z => Math.min(4, z * 1.4))}>+</Button>
      <Button size="sm" variant="secondary" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, z / 1.4))}>−</Button>
      {(['left', 'up', 'down', 'right'] as const).map(direction => <Button size="sm" variant="ghost" key={direction} aria-label={`Pan ${direction}`}
        onClick={() => setPan(p => boundedPan(p.x + (direction === 'left' ? 40 : direction === 'right' ? -40 : 0), p.y + (direction === 'up' ? 40 : direction === 'down' ? -40 : 0)))}>
        {{ left: '←', up: '↑', down: '↓', right: '→' }[direction]}
      </Button>)}
      <Button size="sm" variant="ghost" className="px-2" aria-label="Reset view" onClick={() => { cancelAnimationFrame(pendingFrame.current); setZoom(1); setPan({ x: 0, y: 0 }); setPose(TERRAIN_PRESETS.top); }}><RotateCcw size={16} aria-hidden /></Button>
    </div>}
  </>;
}
