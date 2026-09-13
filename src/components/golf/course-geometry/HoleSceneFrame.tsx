'use client';

import { useEffect, useRef, useState, type ReactNode, type PointerEvent, type RefObject } from 'react';
import { Maximize2, RotateCcw, X, SlidersHorizontal, ChevronDown, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Button } from '@/components/fairway/controls/button';
import { recordedDistance } from '@/lib/golf/course-geometry/normalize';
import { describePosition } from '@/lib/golf/course-geometry/describe-position';
import { PuttingZoom } from '@/components/golf/coachhelm/v3/HoleShotPath/PuttingZoom';
import { UnavailableCourseContext } from '@/components/golf/coachhelm/v3/HoleShotPath/turf';
import type { HoleScene, ShotEvidence } from '@/lib/golf/course-geometry/types';
import type { SceneView } from '@/lib/golf/course-geometry/camera';
import { CourseHoleScene, sceneCamera } from './CourseHoleScene';
import { CourseTerrainProfile } from './CourseTerrainProfile';
import { TERRAIN_PRESETS, projectTerrainPoint, type TerrainFitProfile, type TerrainPose, type TerrainPreset } from '@/lib/golf/course-geometry/terrain';

import { fitTerrainViewportCamera } from '@/lib/golf/course-geometry/terrain-viewport';
import type { TerrainRuntimeController } from '@/lib/golf/course-geometry/runtime-controller';

interface CameraMemory { pose: TerrainPose; fitPreset: TerrainFitProfile }

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
  const [detailSelection, setDetailSelection] = useState<number | null>(null);
  const poseMemory = useRef<CameraMemory>({ pose: TERRAIN_PRESETS.top, fitPreset: 'top' });
  const view = choice ?? defaultView;
  const events = evidence ?? scene?.events.map(e => e.evidence) ?? [];
  const putting = currentPuttingDistanceM != null || events.some(e => e.shotType === 'putting');
  const unassignedStudy = !!scene?.hole.displayLabel && !scene.hole.routeFeatureId;
  const views: SceneView[] = unassignedStudy ? ['green'] : ['hole', 'green', ...(defaultView === 'approach' ? ['approach' as const] : []), ...(putting ? ['putting' as const] : [])];
  const expand = <ModalShell open={expanded} onOpenChange={open => {
    if (open) {
      setDetailSelection(selectedShotNumber ?? null);
      // The compact tracker remains a 2D course card. Opening detail with an
      // entered flight starts on the side-biased 3D pose instead, so the arc
      // has visible height instead of reading like a flat map line.
      if (scene?.illustrativePreviewTrajectories?.length) {
        poseMemory.current = { pose: TERRAIN_PRESETS.side, fitPreset: 'side' };
      }
    }
    setExpanded(open);
  }} presentation="workspace" title="Course detail" hideTitle hideClose
    description="Explore the course. Shot positions are estimates; the daily pin is unknown."
    trigger={<Button variant="ghost" aria-label="Expand course view" className="h-11 min-w-11 shrink-0 px-2"><Maximize2 size={17} aria-hidden /></Button>}>
    <Drawing key={view} scene={scene} view={view} context={context} events={events} selectedShotNumber={detailSelection ?? selectedShotNumber} onSelectEvent={setDetailSelection}
      currentPuttingDistanceM={currentPuttingDistanceM} expanded poseMemory={poseMemory} onClose={() => setExpanded(false)}
      heading={<><span className="font-fw-display text-body-lg font-semibold">{scene?.hole.displayLabel ? 'Green complex' : scene ? `Hole ${scene.hole.ordinal}` : 'Course view'}</span>
        <span className="text-caption text-text-secondary">{scene && !unassignedStudy ? `Par ${scene.hole.par} · ${scene.hole.scorecardYards ?? '—'} yd` : 'Source review'}</span></>}
      areaControls={closeArea => <div className="flex flex-wrap gap-1" role="group" aria-label="Expanded course views">
        {views.map(v => <Button variant={view === v ? 'secondary' : 'ghost'} size="sm" key={v} aria-pressed={view === v} onClick={() => { setChoice(v); closeArea(); }}>{LABELS[v]}</Button>)}
      </div>} />
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
      {view === 'putting' ? 'Illustrated putting view' : scene ? `${scene.hole.completeness === 'reviewed_surfaces' ? 'Reviewed' : 'Partial'}${(scene.sharedGreenHoleOrdinals?.length ?? 0) > 1 ? ' shared green' : ' outline'} · ${scene.attribution.split(' · ')[0]}` : 'Schematic context · no mapped position'}
    </p>
    {children}
  </div>;
}

function Drawing({ scene, view, context, events, selectedShotNumber, currentPuttingDistanceM, expanded = false, heading, areaControls, onClose, poseMemory, onSelectEvent }: {
  scene?: HoleScene | null; view: SceneView; context: 'entry' | 'review'; events: readonly ShotEvidence[];
  selectedShotNumber?: number; currentPuttingDistanceM?: number | null; expanded?: boolean;
  heading?: ReactNode; areaControls?: (close: () => void) => ReactNode; onClose?: () => void; poseMemory?: RefObject<CameraMemory>;
  onSelectEvent?: (shotNumber: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: context === 'entry' ? 160 : 310 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [pose, setPose] = useState<TerrainPose>(poseMemory?.current.pose ?? TERRAIN_PRESETS.top);
  const [fitPreset, setFitPreset] = useState<TerrainFitProfile>(poseMemory?.current.fitPreset ?? 'top');
  const [dragging, setDragging] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [terrainFailed, setTerrainFailed] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const pendingFrame = useRef(0);
  const runtime = useRef<TerrainRuntimeController | null>(null);
  const scaleBar = useRef<HTMLDivElement>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [areasOpen, setAreasOpen] = useState(false);
  const currentSelection = selectedShotNumber;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const live = useRef({ zoom, pan, pose, fitPreset });
  const nextState = useRef<typeof live.current | null>(null);
  function commitCamera() {
    const next = live.current; if (poseMemory) poseMemory.current = { pose: next.pose, fitPreset: next.fitPreset }; setZoom(next.zoom); setPan(next.pan); setPose(next.pose); setFitPreset(next.fitPreset);
    if (scaleBar.current) scaleBar.current.style.visibility = Math.abs(next.pose.pitch - 90) < .01 ? 'visible' : 'hidden';
  }
  function update(next: typeof live.current, commit = false) {
    live.current = next;
    if (runtime.current && scene?.terrain && view !== 'putting') {
      const camera = fitTerrainViewportCamera(scene, scene.terrain, view, size.width, size.height, next.pose, next.zoom, [next.pan.x, next.pan.y], next.fitPreset);
      runtime.current.setCamera(camera, size.width, size.height);
      if (ref.current) { ref.current.dataset.cameraZoom = String(next.zoom); ref.current.dataset.worldScale = String(camera.scale); }
      // A tilted map is foreshortened. Hide the Top-only screen ruler during
      // mutable gestures rather than leaving a stale apparent measurement.
      if (scaleBar.current) scaleBar.current.style.visibility = 'hidden';
      if (commit) commitCamera();
    } else commitCamera();
  }
  const gesture = useRef({ x: 0, y: 0, distance: 0, zoom: 1, pan: { x: 0, y: 0 }, pose, fitPreset, origin: { x: size.width / 2, y: size.height / 2 } });
  // The tracker stays on its compact, familiar SVG course card. Expanding is
  // the explicit opt-in to the live Three.js terrain and elevated flight arc.
  const terrainRequested = expanded && view !== 'putting' && scene?.terrain != null && !terrainFailed && !showProfile;
  let terrainCamera;
  if (terrainRequested && scene?.terrain) {
    try { terrainCamera = fitTerrainViewportCamera(scene, scene.terrain, view, size.width, size.height, pose, zoom, [pan.x, pan.y], fitPreset); }
    catch { /* Missing source coverage retains the existing 2D view and pan. */ }
  }
  const terrainEnabled = terrainCamera != null;
  const interactive = expanded && view !== 'putting' && !!scene && !showProfile;
  const boundedPan = (x: number, y: number) => ({ x: Math.max(-size.width / 2, Math.min(size.width / 2, x)),
    y: Math.max(-size.height / 2, Math.min(size.height / 2, y)) });
  const isPreset = (preset: TerrainPreset) => Math.abs(pose.pitch - TERRAIN_PRESETS[preset].pitch) < .01 &&
    Math.abs(pose.yawOffset - TERRAIN_PRESETS[preset].yawOffset) < .01;
  useEffect(() => () => cancelAnimationFrame(pendingFrame.current), []);
  function cameraOrigin(current: typeof live.current) {
    if (scene?.terrain && view !== 'putting') {
      const camera = fitTerrainViewportCamera(scene, scene.terrain, view, size.width, size.height, current.pose, current.zoom,
        [current.pan.x, current.pan.y], current.fitPreset);
      const focus = projectTerrainPoint(camera.focusM, camera);
      return { x: focus[0] - current.pan.x, y: focus[1] - current.pan.y };
    }
    return { x: size.width / 2, y: size.height / 2 };
  }
  function rebase() {
    const p = [...pointers.current.values()];
    if (!p.length) return;
    gesture.current = { x: p.reduce((n, a) => n + a.x, 0) / p.length, y: p.reduce((n, a) => n + a.y, 0) / p.length,
      distance: p.length > 1 ? Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y) : 0, ...live.current, origin: cameraOrigin(live.current) };
  }
  function flush() {
    cancelAnimationFrame(pendingFrame.current);
    if (nextState.current) { update(nextState.current); nextState.current = null; }
  }
  function changeCamera(change: (current: typeof live.current) => typeof live.current) {
    flush(); update(change(live.current), true); rebase();
  }
  function startGesture(event: PointerEvent<HTMLDivElement>) {
    if (!interactive || event.button > 0 || pointers.current.size >= 2 || (event.target as Element).closest('button')) return;
    flush(); commitCamera();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setDragging(true); rebase();
  }
  function moveGesture(event: PointerEvent<HTMLDivElement>) {
    if (!interactive || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const p = [...pointers.current.values()], g = gesture.current;
    const dx = p.reduce((n, a) => n + a.x, 0) / p.length - g.x;
    const dy = p.reduce((n, a) => n + a.y, 0) / p.length - g.y;
    const next = { zoom: g.zoom, pan: g.pan, pose: g.pose, fitPreset: g.fitPreset };
    if (p.length === 1 && terrainEnabled) next.pose = { ...g.pose, pitch: Math.max(20, Math.min(90, g.pose.pitch - dy * .22)),
      yawOffset: Math.max(-45, Math.min(45, g.pose.yawOffset + dx * .22)) };
    else {
      if (p.length === 2) {
        next.zoom = Math.max(.5, Math.min(4, g.zoom * Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y) / Math.max(1, g.distance)));
        const rect = event.currentTarget.getBoundingClientRect(), factor = next.zoom / g.zoom;
        const x = g.x - rect.left - g.origin.x, y = g.y - rect.top - g.origin.y;
        next.pan = boundedPan(x + dx - (x - g.pan.x) * factor, y + dy - (y - g.pan.y) * factor);
      } else next.pan = boundedPan(g.pan.x + dx, g.pan.y + dy);
    }
    nextState.current = next;
    cancelAnimationFrame(pendingFrame.current);
    pendingFrame.current = requestAnimationFrame(flush);
  }
  function endGesture(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    if (event.type === 'pointercancel' || event.type === 'lostpointercapture') { cancelAnimationFrame(pendingFrame.current); nextState.current = null; }
    else flush();
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(pointers.current.size > 0); commitCamera(); rebase();
  }
  function presetView(preset: TerrainPreset) {
    setShowProfile(false);
    cancelAnimationFrame(pendingFrame.current);
    nextState.current = null;
    const target = TERRAIN_PRESETS[preset], start = live.current.pose, fromFit = live.current.fitPreset;
    const startZoom = live.current.zoom, startPan = live.current.pan;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { update({ ...live.current, pose: target, fitPreset: preset, zoom: 1, pan: { x: 0, y: 0 } }, true); rebase(); return; }
    const began = performance.now();
    const tick = (now: number) => {
      // A RAF timestamp may precede the event's performance.now() within the
      // same refresh interval. Never extrapolate past exact Top/height bounds.
      const t = Math.max(0, Math.min(1, (now - began) / 240)), eased = 1 - (1 - t) ** 3;
      update({ zoom: startZoom + (1 - startZoom) * eased, pan: { x: startPan.x * (1 - eased), y: startPan.y * (1 - eased) }, fitPreset: t < 1 ? { from: fromFit, to: preset, progress: eased } : preset, pose: { pitch: start.pitch + (target.pitch - start.pitch) * eased,
        yawOffset: start.yawOffset + (target.yawOffset - start.yawOffset) * eased,
        exaggeration: start.exaggeration + (target.exaggeration - start.exaggeration) * eased } });
      rebase();
      if (t < 1) pendingFrame.current = requestAnimationFrame(tick); else commitCamera();
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
  useEffect(() => {
    const cancel = () => {
      cancelAnimationFrame(pendingFrame.current);
      nextState.current = null;
      const activePointers = [...pointers.current.keys()];
      pointers.current.clear();
      for (const id of activePointers) {
        if (ref.current?.hasPointerCapture(id)) ref.current.releasePointerCapture(id);
      }
      setDragging(false); commitCamera();
    };
    const hidden = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', cancel);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('blur', cancel);
    };
    // Cancellation reads the current camera and pointers from their live refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!interactive || !el) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); flush();
      const current = live.current, rect = el.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      const nextZoom = Math.max(.5, Math.min(4, current.zoom * Math.exp(-Math.max(-300, Math.min(300, delta)) * .002)));
      const factor = nextZoom / current.zoom;
      const origin = cameraOrigin(current);
      const x = event.clientX - rect.left - origin.x, y = event.clientY - rect.top - origin.y;
      update({ ...current, zoom: nextZoom, pan: boundedPan(x - (x - current.pan.x) * factor, y - (y - current.pan.y) * factor) }, true);
      rebase();
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
    // Only the expanded drawing owns wheel input. Values come from live refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, size.width, size.height]);
  const camera = scene && view !== 'putting' ? sceneCamera(scene, size.width, size.height, context === 'entry' ? 'compact' : 'review', view) : null;
  const transformed = camera && expanded ? { ...camera, scale: camera.scale * zoom,
    translation: [size.width / 2 + (camera.translation[0] - size.width / 2) * zoom + pan.x,
      size.height / 2 + (camera.translation[1] - size.height / 2) * zoom + pan.y] as const } : camera;
  const putt = events.find(e => e.shotNumber === currentSelection && e.shotType === 'putting') ?? events.find(e => e.shotType === 'putting');
  const before = currentPuttingDistanceM ?? putt?.before.valueM ?? null;
  const after = currentPuttingDistanceM != null ? null : putt?.after.valueM ?? null;
  const reviewEvents = view === 'putting' ? events.filter(e => e.shotType === 'putting') : events;
  const active = view === 'putting' ? putt : events.find(e => e.shotNumber === currentSelection) ?? events.at(-1);
  const mapScale = terrainCamera?.scale ?? transformed?.scale ?? 0;
  const scaleYards = [5, 10, 20, 50, 100].filter(y => y * .9144 * mapScale <= 90).at(-1) ?? 5;
  const scaleWidth = scaleYards * .9144 * mapScale;
  return <div className={expanded ? 'flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row' : undefined} data-slot={expanded ? 'course-explorer' : undefined}>
    <div className={expanded ? 'relative min-h-[180px] min-w-0 flex-1' : undefined}>
    <div ref={ref} data-slot="course-drawing" className={`fw-course-motion w-full overflow-clip ${expanded ? 'absolute inset-0' : 'relative'}`}
      aria-label={expanded ? 'Interactive course landscape' : undefined}
      onPointerDown={startGesture} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture} onLostPointerCapture={endGesture}
      data-camera-zoom={zoom} data-world-scale={mapScale} data-dragging={dragging}
      style={{ height: expanded ? '100%' : context === 'entry' ? 160 : 310, touchAction: interactive ? 'none' : 'auto', cursor: interactive ? (dragging ? 'grabbing' : 'grab') : undefined }}>
      <div key={`${scene?.physicalHoleKey ?? 'missing'}-${view}`} className="fw-course-view-enter h-full w-full">
      {showProfile && scene ? <div className="h-full overflow-y-auto bg-surface pt-24"><CourseTerrainProfile scene={scene} selectedShotNumber={currentSelection} width={size.width} height={size.height - 96} /></div> : view === 'putting' ? <PuttingZoom width={size.width} height={size.height} distanceView={{
        beforeFeet: before == null ? null : before / .3048, afterFeet: after == null ? null : after / .3048,
        made: currentPuttingDistanceM == null && putt?.putt.made === true,
        rolledOff: putt != null && putt.result !== 'green' && putt.result !== 'hole',
      }} /> : scene && transformed ? <CourseHoleScene scene={scene} width={size.width} height={size.height}
        mode={context === 'entry' ? 'compact' : 'review'} view={view} selectedShotNumber={currentSelection} camera={transformed} terrainCamera={terrainCamera}
        runtimeRef={runtime} onTerrainUnavailable={() => setTerrainFailed(true)} /> : <UnavailableCourseContext />}
      </div>
      {expanded && view !== 'putting' && scene && !showProfile && <div className="absolute bottom-4 right-3 flex flex-col gap-1 rounded-fw-lg border border-white/30 bg-surface p-1 shadow-card" role="group" aria-label="Zoom and pan" onPointerDown={e => e.stopPropagation()}>
        <Button size="sm" variant="ghost" className="min-w-11 px-2" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => changeCamera(current => ({ ...current, zoom: Math.min(4, current.zoom * 1.4) }))}>+</Button>
        <Button size="sm" variant="ghost" className="min-w-11 px-2" aria-label="Zoom out" disabled={zoom <= .5} onClick={() => changeCamera(current => ({ ...current, zoom: Math.max(.5, current.zoom / 1.4) }))}>−</Button>
        <Button size="sm" variant="ghost" className="min-w-11 px-2" aria-label="Reset view" onClick={() => changeCamera(() => ({ zoom: 1, pan: { x: 0, y: 0 }, pose: TERRAIN_PRESETS.top, fitPreset: 'top' }))}><RotateCcw size={16} aria-hidden /></Button>
        {!terrainEnabled && <Button size="sm" variant="ghost" className="min-w-11 px-2" aria-label="Camera controls" aria-expanded={toolsOpen} onClick={() => setToolsOpen(v => !v)}><SlidersHorizontal size={17} aria-hidden /></Button>}
      </div>}
      {expanded && view !== 'putting' && scene && !showProfile && (!terrainEnabled || Math.abs(pose.pitch - 90) < .01) && scaleWidth > 0 && scaleWidth < size.width / 2 &&
        <div ref={scaleBar} aria-label={`Map scale ${scaleYards} yards`} className="pointer-events-none absolute bottom-3 left-4 text-eyebrow font-medium" style={{ color: 'var(--fw-diagram-event)', visibility: dragging ? 'hidden' : 'visible' }}>
          <span className="block border-b border-l border-r pb-1 text-center" style={{ width: scaleWidth }}>{scaleYards} yd</span>
        </div>}
    </div>
    {expanded && <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
      <div className="pointer-events-auto">
        <Button variant="secondary" aria-label="Choose course area" aria-expanded={areasOpen} rightIcon={<ChevronDown size={15} aria-hidden />} className="h-auto rounded-fw-lg px-3 py-2 shadow-card" onClick={() => setAreasOpen(v => !v)}><span className="flex flex-col items-start">{heading}</span></Button>
        {areasOpen && <div className="mt-2 rounded-fw-lg bg-surface p-2 shadow-card">{areaControls?.(() => setAreasOpen(false))}</div>}
      </div>
      <Button variant="secondary" className="pointer-events-auto h-11 min-w-11 rounded-full px-2 shadow-card" aria-label="Close" onClick={onClose}><X size={19} aria-hidden /></Button>
    </div>}
    </div>
    {expanded && <aside className="z-10 flex max-h-[48dvh] shrink-0 flex-col border-t border-border-subtle bg-surface font-fw-sans sm:max-h-none sm:w-[320px] sm:border-l sm:border-t-0" aria-label="Course inspector" data-slot="course-inspector" data-modal="false" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-between gap-1 px-3 pt-2">
        {(terrainEnabled || showProfile) ? <div className="flex items-center rounded-fw-md bg-surface-secondary p-0.5" role="group" aria-label="Terrain camera">
          {(['top', 'terrain', 'side'] as const).map(preset => <Button key={preset} size="sm" className="px-2.5"
            variant={!showProfile && isPreset(preset) ? 'secondary' : 'ghost'} aria-pressed={!showProfile && isPreset(preset)} onClick={() => presetView(preset)}>
            {{ top: 'Top', terrain: 'Terrain', side: 'Side' }[preset]}</Button>)}
          <Button size="sm" className="px-3" variant={showProfile ? 'secondary' : 'ghost'} aria-pressed={showProfile}
            onClick={() => { flush(); commitCamera(); setShowProfile(true); }}>Profile</Button>
        </div> : <span className="px-1 text-caption font-medium">{view === 'putting' ? 'Putting distances' : 'Course outline'}</span>}
        <Button size="sm" variant="ghost" className="ml-auto min-w-11 px-2" aria-label="Details and sources" aria-expanded={inspectorOpen} onClick={() => setInspectorOpen(v => !v)}><Info size={17} aria-hidden /></Button>
        <Button size="sm" variant="ghost" className="min-w-11 px-2" aria-label="Camera controls" aria-expanded={toolsOpen} onClick={() => setToolsOpen(v => !v)}><SlidersHorizontal size={17} aria-hidden /></Button>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        {active && <div className="px-4 pb-2 pt-2" data-slot="expanded-shot-evidence">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{active.penalty ? `P${active.shotNumber}` : active.shotNumber}</span>
            <div className="min-w-0 flex-1"><p className="text-body-sm font-semibold capitalize text-text-primary">{active.result ?? active.lieAfter ?? 'Recorded shot'}</p>
              <p className="text-caption text-text-secondary">{describePosition(scene, active).label}</p></div>
            {context === 'review' && events.length > 1 && <div className="flex shrink-0">
              <Button size="sm" variant="ghost" className="min-w-11 px-1" aria-label="Previous shot" disabled={reviewEvents.indexOf(active) <= 0} onClick={() => onSelectEvent?.(reviewEvents[reviewEvents.indexOf(active) - 1]!.shotNumber)}><ChevronLeft size={17} aria-hidden /></Button>
              <Button size="sm" variant="ghost" className="min-w-11 px-1" aria-label="Next shot" disabled={reviewEvents.indexOf(active) >= reviewEvents.length - 1} onClick={() => onSelectEvent?.(reviewEvents[reviewEvents.indexOf(active) + 1]!.shotNumber)}><ChevronRight size={17} aria-hidden /></Button>
            </div>}
            <div className="shrink-0 text-right"><p className="font-fw-display text-xl font-semibold tabular-nums text-text-primary">{recordedDistance(active.after)}</p><p className="text-eyebrow text-text-secondary">Remaining</p></div>
          </div>
        </div>}
        {terrainEnabled && pose.exaggeration !== 1 && <p className="h-6 truncate px-4 pb-2 text-caption text-text-secondary">Relief {pose.exaggeration.toFixed(1)}×</p>}
        {terrainFailed && <p role="status" className="px-4 pb-2 text-caption text-text-secondary">3D view unavailable. Showing the course outline.</p>}
    {expanded && toolsOpen && <div className="flex flex-wrap items-center gap-1 px-3 py-1" role="group" aria-label="Additional camera controls">
      {(['left', 'up', 'down', 'right'] as const).map(direction => <Button size="sm" variant="ghost" key={direction} aria-label={`Pan ${direction}`}
        onClick={() => changeCamera(current => ({ ...current, pan: boundedPan(current.pan.x + (direction === 'left' ? 40 : direction === 'right' ? -40 : 0), current.pan.y + (direction === 'up' ? 40 : direction === 'down' ? -40 : 0)) }))}>
        {{ left: '←', up: '↑', down: '↓', right: '→' }[direction]}
      </Button>)}
      {terrainEnabled && <>
        {(['Rotate left', 'Rotate right', 'Tilt up', 'Tilt down'] as const).map(action => <Button key={action} size="sm" variant="ghost"
          onClick={() => changeCamera(current => ({ ...current, pose: { ...current.pose,
            yawOffset: Math.max(-45, Math.min(45, current.pose.yawOffset + (action === 'Rotate left' ? -10 : action === 'Rotate right' ? 10 : 0))),
            pitch: Math.max(20, Math.min(90, current.pose.pitch + (action === 'Tilt up' ? 10 : action === 'Tilt down' ? -10 : 0))),
          } }))}>{action}</Button>)}
        <Button size="sm" variant="ghost" onClick={() => changeCamera(current => ({ ...current, pose: { ...current.pose, exaggeration: current.pose.exaggeration === 1 ? 1.5 : 1 } }))}>Height {pose.exaggeration.toFixed(1)}×</Button>
      </>}
    </div>}
        {inspectorOpen && <div className="space-y-2 px-4 pb-4 text-caption text-text-secondary">
          {terrainEnabled && <p>Drag to tilt; pinch to zoom. Outlined hazards are possible surfaces, not recorded ball positions.</p>}
        {context === 'review' && events.length > 1 && <div className="flex gap-1 overflow-x-auto px-3 pb-2" role="group" aria-label="Review shots">
          {reviewEvents.map(event => <Button key={event.shotNumber} size="sm" className="min-w-11 shrink-0 px-2" variant={active?.shotNumber === event.shotNumber ? 'secondary' : 'ghost'} aria-label={`Select shot ${event.shotNumber}`} aria-pressed={active?.shotNumber === event.shotNumber} onClick={() => onSelectEvent?.(event.shotNumber)}>{event.penalty ? `P${event.shotNumber}` : event.shotNumber}</Button>)}
        </div>}

          {active && <p>{recordedDistance(active.before)} before{active.rawMiss ? ` · ${active.rawMiss.replaceAll('_', ' ')}` : ''}. {describePosition(scene, active).detail}</p>}
          <p>{scene?.attribution ?? 'Course geometry unavailable.'}</p>
          <p>{scene?.terrain ? `${scene.terrain.source.acquisitionStart.slice(0, 4)} USGS terrain study. ` : ''}Estimated pin; the daily hole location is unverified. Trees and heights are illustrative.</p>
          {(scene?.sharedGreenHoleOrdinals?.length ?? 0) > 1 && <p>Shared green: holes {scene!.sharedGreenHoleOrdinals!.join(' and ')}.</p>}
        </div>}
      </div>
    </aside>}
  </div>;
}
