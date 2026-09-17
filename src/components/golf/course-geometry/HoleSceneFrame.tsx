'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent, type RefObject } from 'react';
import { Maximize2, RotateCcw, X, SlidersHorizontal, ChevronDown, ChevronLeft, ChevronRight, Info, MoreHorizontal } from 'lucide-react';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { Button } from '@/components/fairway/controls/button';
import { recordedDistance } from '@/lib/golf/course-geometry/normalize';
import { describePosition } from '@/lib/golf/course-geometry/describe-position';
import { PuttingZoom } from '@/components/golf/coachhelm/v3/HoleShotPath/PuttingZoom';
import { UnavailableCourseContext } from '@/components/golf/coachhelm/v3/HoleShotPath/turf';
import type { HoleScene, ShotEvidence } from '@/lib/golf/course-geometry/types';
import { puttingFocusCamera, puttingPlanCamera, type SceneView } from '@/lib/golf/course-geometry/camera';
import { CourseHoleScene, sceneCamera } from './CourseHoleScene';
import { CourseTerrainProfile } from './CourseTerrainProfile';
import { PERSPECTIVE_FOV, PRODUCTION_CAMERA_STATES, productionCameraState, TERRAIN_PRESETS, projectTerrainPoint, terrainHeight, type ProductionCameraState, type TerrainFitProfile, type TerrainPose, type TerrainPreset } from '@/lib/golf/course-geometry/terrain';

import { fitTerrainViewportCamera } from '@/lib/golf/course-geometry/terrain-viewport';
import type { TerrainRuntimeController } from '@/lib/golf/course-geometry/runtime-controller';
import { deriveShotCameraTarget, type CameraFitTarget } from '@/lib/golf/course-geometry/shot-camera-target';
import { interpolateCameraMotion } from '@/lib/golf/course-geometry/camera-motion';
import type { TerrainDebugView } from './terrain-debug';
import type { SceneMarkers } from '@/lib/golf/course-geometry/scene-markers';
import type { OverlayReservedRect } from '@/lib/golf/course-geometry/shot-overlay-controller';

interface CameraMemory { pose: TerrainPose; fitPreset: TerrainFitProfile }
/** A stage director's fit: the points the camera keeps on screen and the key
 * whose change asks for a fresh settle (a new mark, a recenter). */
export interface StageCameraFocus { key: string; target: CameraFitTarget }

const LABELS: Record<SceneView, string> = { hole: 'Whole hole', approach: 'Approach', green: 'Green', putting: 'Putting' };
function hasReviewedGreen(scene: HoleScene | null | undefined): boolean {
  return !!scene?.features.some(feature => feature.id === scene.hole.greenFeatureId && feature.kind === 'green' && feature.reviewed);
}
interface FrameProps {
  scene?: HoleScene | null;
  context: 'entry' | 'review';
  defaultView?: SceneView;
  selectedShotNumber?: number;
  /** The current unrecorded putt owns the compact ball emphasis. */
  activeDraftShotNumber?: number;
  evidence?: readonly ShotEvidence[];
  currentPuttingDistanceM?: number | null;
  header?: ReactNode;
  children?: ReactNode;
  /** Development-only faceting diagnostics (Meridian §14); player routes never set it. */
  debugView?: TerrainDebugView;
  /** Meridian V2 world (R7 runtime switch); absent = the shipped V1 world. */
  world?: 'v1' | 'v2';
  /** Player-marked positions (One-Tap) drawn on the course in every camera. */
  markers?: SceneMarkers | null;
  /** `card` (default): the compact card with an expand trigger into the
   * workspace modal. `stage`: the expanded course fills its container at once,
   * with no trigger and no Close — the course itself is the screen (One-Tap
   * master plan "Player-facing design"). */
  presentation?: 'card' | 'stage';
  /** Stage only: floating HUD rendered over the course, above the top chrome. */
  stageOverlay?: ReactNode;
  /** Stage only: the bar beneath the View control (the persistent primary action). */
  stageFooter?: ReactNode;
  /** Stage only: extra entries at the top of the ••• menu (One-Tap master plan §79). */
  stageMenuItems?: readonly StageMenuItem[];
  /** Stage only: receives a production camera-state setter so a director can
   * frame the course (area + preset) the way the View control does. */
  stageCameraRef?: RefObject<((state: ProductionCameraState) => void) | null>;
  /** Stage only: fires when the player takes the camera by gesture (MANUAL_CAMERA). */
  onStageGesture?: () => void;
  /** Stage only: the fit the director keeps on screen (the player's mark and
   * the green, Meridian §62 applied to a known position). The preset motion
   * settles on it and a changed key re-fits; null leaves the state's own fit. */
  stageFocus?: StageCameraFocus | null;
}

/** One reusable viewing container. Its caller keys by hole identity; a manual
 * view persists through typing and committed shots, until a different hole. */
/** An entry the host adds to the production ••• menu; the frame closes the menu before `onSelect`. */
export interface StageMenuItem { key: string; label: string; onSelect(): void; disabled?: boolean }
export function HoleSceneFrame({ scene, context, defaultView = 'hole', selectedShotNumber, activeDraftShotNumber, evidence, currentPuttingDistanceM, header, children, debugView, world, markers, presentation = 'card', stageOverlay, stageFooter, stageMenuItems, stageCameraRef, onStageGesture, stageFocus }: FrameProps) {
  const [choice, setChoice] = useState<SceneView | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [detailSelection, setDetailSelection] = useState<number | null>(null);
  const [puttingScope, setPuttingScope] = useState<'whole_green' | 'focus_putt'>('whole_green');
  const poseMemory = useRef<CameraMemory>(presentation === 'stage' && context === 'entry'
    ? { pose: TERRAIN_PRESETS[PRODUCTION_CAMERA_STATES[productionCameraState(defaultView)].preset], fitPreset: PRODUCTION_CAMERA_STATES[productionCameraState(defaultView)].preset }
    : { pose: TERRAIN_PRESETS.top, fitPreset: 'top' });
  const view = choice ?? defaultView;
  // Stage director: a different area remounts the drawing from the remembered
  // production pose (as the modal does); the same area animates the preset.
  const stagePreset = useRef<((preset: TerrainPreset) => void) | null>(null);
  useEffect(() => {
    if (!stageCameraRef) return;
    stageCameraRef.current = state => {
      const { preset, view: area } = PRODUCTION_CAMERA_STATES[state];
      if (area !== view) { poseMemory.current = { pose: TERRAIN_PRESETS[preset], fitPreset: preset }; setChoice(area); }
      else stagePreset.current?.(preset);
    };
    return () => { stageCameraRef.current = null; };
  });
  const events = evidence ?? scene?.events.map(e => e.evidence) ?? [];
  const putting = currentPuttingDistanceM != null || events.some(e => e.shotType === 'putting');
  const unassignedStudy = !!scene?.hole.displayLabel && !scene.hole.routeFeatureId;
  const focusShotNumber = selectedShotNumber ?? (activeDraftShotNumber == null ? undefined : activeDraftShotNumber - 1);
  const canFocusPutt = view === 'putting' && !!scene?.illustrativePuttingTracks?.some(track => track.kind === 'surface_roll' && track.shotNumber === focusShotNumber && track.pointsM.length >= 2);
  const views: SceneView[] = unassignedStudy ? ['green'] : ['hole', 'green', ...(defaultView === 'approach' ? ['approach' as const] : []), ...(putting ? ['putting' as const] : [])];
  useEffect(() => {
    if (view !== 'putting') setPuttingScope('whole_green');
  }, [view]);
  useEffect(() => {
    // Detail previously retained its opening shot number forever. A committed
    // next shot now becomes the active event, while a manual Previous/Next
    // selection remains in control until the outside selection actually changes.
    if (expanded) setDetailSelection(selectedShotNumber ?? null);
  }, [expanded, selectedShotNumber]);
  const heading = <><span className="font-fw-display text-body-lg font-semibold">{view === 'putting' || view === 'green' || scene?.hole.displayLabel ? 'Green complex' : scene ? `Hole ${scene.hole.ordinal}` : 'Course view'}</span>
    <span className="text-caption text-text-secondary">{scene && !unassignedStudy ? `Par ${scene.hole.par} · ${scene.hole.scorecardYards ?? '—'} yd` : 'Source review'}</span></>;
  const areaControls = (closeArea: () => void) => <div className="flex flex-wrap gap-1" role="group" aria-label="Expanded course views">
    {views.map(v => <Button variant={view === v ? 'secondary' : 'ghost'} size="sm" key={v} aria-pressed={view === v} onClick={() => { setChoice(v); closeArea(); }}>{LABELS[v]}</Button>)}
  </div>;
  const expand = <ModalShell open={expanded} onOpenChange={open => {
    if (open) {
      setDetailSelection(selectedShotNumber ?? null);
      // The card itself is the calm plan view. Opening it is an explicit
      // request to inspect the same canonical green in terrain, rather than
      // a second copy of a 2D putting diagram.
      if (context === 'entry') {
        // Player view (outside-world §22–23): the camera is a state chosen
        // by the shot context, never a debug preset the player must pick.
        const state = PRODUCTION_CAMERA_STATES[productionCameraState(view)];
        poseMemory.current = { pose: TERRAIN_PRESETS[state.preset], fitPreset: state.preset };
      } else if (view === 'putting') {
        poseMemory.current = { pose: TERRAIN_PRESETS.terrain, fitPreset: 'terrain' };
      } else if (scene?.illustrativePreviewTrajectories?.length) {
        poseMemory.current = { pose: TERRAIN_PRESETS.side, fitPreset: 'side' };
      }
    }
    setExpanded(open);
  }} presentation="workspace" title="Course detail" hideTitle hideClose
    description="Explore the course. Shot positions are estimates; the daily pin is unknown."
    trigger={<Button variant="ghost" aria-label={view === 'putting' ? 'Open green in 3D' : 'Expand course view'} className={view === 'putting' ? 'h-11 shrink-0 gap-1 px-2.5 text-caption font-semibold' : 'h-11 min-w-11 shrink-0 px-2'}>
      {view === 'putting' && <span>3D</span>}<Maximize2 size={17} aria-hidden />
    </Button>}>
    <Drawing key={view} scene={scene} view={view} context={context} events={events} selectedShotNumber={detailSelection ?? selectedShotNumber} activeDraftShotNumber={activeDraftShotNumber} puttingScope={puttingScope} onSelectEvent={setDetailSelection}
      currentPuttingDistanceM={currentPuttingDistanceM} expanded poseMemory={poseMemory} onClose={() => setExpanded(false)} debugView={debugView} world={world} onSelectView={setChoice} markers={markers}
      heading={heading} areaControls={areaControls} />
  </ModalShell>;
  if (presentation === 'stage') {
    // The course is the screen: no card, no trigger, no Close. The caller owns
    // the surrounding chrome and hands in its HUD and primary action.
    return <div className="relative flex h-full min-h-0 flex-1 flex-col" data-scene-context={context} data-current-view={view} data-presentation="stage">
      <Drawing key={view} scene={scene} view={view} context={context} events={events} selectedShotNumber={selectedShotNumber} activeDraftShotNumber={activeDraftShotNumber} puttingScope={puttingScope}
        currentPuttingDistanceM={currentPuttingDistanceM} expanded poseMemory={poseMemory} debugView={debugView} world={world} onSelectView={setChoice} markers={markers}
        heading={heading} areaControls={areaControls} stageOverlay={stageOverlay} stageFooter={stageFooter} stageMenuItems={stageMenuItems} presetRef={stagePreset} onStageGesture={onStageGesture} stageFocus={stageFocus} />
    </div>;
  }
  return <div className="min-w-0" data-scene-context={context} data-current-view={view}>
    <div className="flex min-h-14 items-center justify-between gap-1 px-3 py-1" data-slot="scene-header">
      {context === 'review' ? <div className="flex min-w-0 flex-wrap gap-1" role="group" aria-label="Course views">
        {views.map(v => <Button size="sm" className="h-11 px-3" variant={view === v ? 'secondary' : 'ghost'} key={v} aria-pressed={view === v} onClick={() => setChoice(v)}>{v === 'hole' ? 'Hole' : LABELS[v]}</Button>)}
      </div> : header}
      {context === 'entry' && !unassignedStudy ? <div className="flex shrink-0 items-center">
        {canFocusPutt && <Button variant="ghost" size="sm" className="h-11 px-2 text-caption" aria-pressed={puttingScope === 'focus_putt'} onClick={() => setPuttingScope(scope => scope === 'whole_green' ? 'focus_putt' : 'whole_green')}>
          {puttingScope === 'focus_putt' ? 'Whole green' : 'Focus putt'}
        </Button>}
        {view !== 'putting' && <Button variant="ghost" size="sm" className="h-11 px-2 text-caption" onClick={() => setChoice(view === 'hole' ? (defaultView === 'hole' ? 'green' : defaultView) : 'hole')}>
          {view === 'hole' ? (defaultView === 'hole' ? 'Green' : LABELS[defaultView]) : 'Whole hole'}
        </Button>}
        {expand}
      </div> : expand}
    </div>
    <Drawing scene={scene} view={view} context={context} events={events} selectedShotNumber={selectedShotNumber} activeDraftShotNumber={activeDraftShotNumber} puttingScope={puttingScope} currentPuttingDistanceM={currentPuttingDistanceM} />
    <p className={`px-3 font-fw-sans text-eyebrow leading-4 text-text-secondary ${view === 'putting' && context === 'entry' ? 'py-1.5' : 'py-[3px]'}`} data-putting-position-status={view === 'putting' ? 'source-summary' : undefined}>
      {view === 'putting' ? hasReviewedGreen(scene)
        ? scene?.illustrativePuttingTracks?.length ? 'Mapped green · estimated positions' : 'Mapped green · ball not marked'
        : 'Illustrated putting view' : scene ? `${scene.hole.completeness === 'reviewed_surfaces' ? 'Reviewed' : 'Partial'}${(scene.sharedGreenHoleOrdinals?.length ?? 0) > 1 ? ' shared green' : ' outline'} · ${scene.attribution.split(' · ')[0]}` : 'Schematic context · no mapped position'}
    </p>
    {children}
  </div>;
}

function Drawing({ scene, view, context, events, selectedShotNumber, activeDraftShotNumber, puttingScope = 'whole_green', currentPuttingDistanceM, expanded = false, heading, areaControls, onClose, poseMemory, onSelectEvent, debugView, world, onSelectView, markers, stageOverlay, stageFooter, stageMenuItems, presetRef, onStageGesture, stageFocus }: {
  scene?: HoleScene | null; view: SceneView; context: 'entry' | 'review'; events: readonly ShotEvidence[];
  selectedShotNumber?: number; activeDraftShotNumber?: number; puttingScope?: 'whole_green' | 'focus_putt'; currentPuttingDistanceM?: number | null; expanded?: boolean;
  heading?: ReactNode; areaControls?: (close: () => void) => ReactNode; onClose?: () => void; poseMemory?: RefObject<CameraMemory>;
  onSelectEvent?: (shotNumber: number) => void; debugView?: TerrainDebugView; world?: 'v1' | 'v2'; onSelectView?: (view: SceneView) => void;
  markers?: SceneMarkers | null; stageOverlay?: ReactNode; stageFooter?: ReactNode; stageMenuItems?: readonly StageMenuItem[]; presetRef?: RefObject<((preset: TerrainPreset) => void) | null>; onStageGesture?: () => void;
  stageFocus?: StageCameraFocus | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: context === 'entry' ? (view === 'putting' && hasReviewedGreen(scene) ? 272 : 160) : 310 });
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
  const focusShotNumber = currentSelection ?? (activeDraftShotNumber == null ? undefined : activeDraftShotNumber - 1);
  const courseBackedPutting = view === 'putting' && hasReviewedGreen(scene);
  const courseView = view === 'putting' ? (courseBackedPutting ? 'green' : null) : view;
  const compactPuttingPlan = !expanded && context === 'entry' && courseBackedPutting;
  const compactHeight = compactPuttingPlan ? 272 : context === 'entry' ? 160 : 310;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const live = useRef({ zoom, pan, pose, fitPreset });
  const nextState = useRef<typeof live.current | null>(null);
  const autoFocusKey = useRef<string | null>(null);
  // Stage chrome over the course (`data-hud-reserve` inside the overlay) is
  // measured after every commit so the evidence labels (Green, pin, badges)
  // re-place around the chips instead of under them. Zero-size boxes (jsdom,
  // hidden chrome) reserve nothing.
  const [reservedRects, setReservedRects] = useState<OverlayReservedRect[]>([]);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host || !expanded || !stageOverlay) return;
    const origin = host.getBoundingClientRect(), margin = 6;
    // The overlay is the drawing's sibling inside the same positioned wrapper.
    const next = [...(host.parentElement ?? host).querySelectorAll('[data-hud-reserve]')].flatMap(node => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0 ? [{ x: box.left - origin.left - margin, y: box.top - origin.top - margin, width: box.width + margin * 2, height: box.height + margin * 2 }] : [];
    });
    setReservedRects(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    // A fresh overlay element arrives with every host render, so chip text
    // changes re-measure; the equality guard keeps the state stable.
  }, [expanded, stageOverlay, size.width, size.height]);
  function commitCamera() {
    const next = live.current; if (poseMemory) poseMemory.current = { pose: next.pose, fitPreset: next.fitPreset }; setZoom(next.zoom); setPan(next.pan); setPose(next.pose); setFitPreset(next.fitPreset);
    if (scaleBar.current) scaleBar.current.style.visibility = Math.abs(next.pose.pitch - 90) < .01 ? 'visible' : 'hidden';
  }
  function update(next: typeof live.current, commit = false) {
    live.current = next;
    if (runtime.current && scene?.terrain && courseView) {
      const camera = fitTerrainViewportCamera(scene, scene.terrain, courseView, size.width, size.height, next.pose, next.zoom, [next.pan.x, next.pan.y], next.fitPreset);
      runtime.current.setCamera(camera, size.width, size.height);
      if (ref.current) { ref.current.dataset.cameraZoom = String(next.zoom); ref.current.dataset.worldScale = String(camera.scale); }
      // A tilted map is foreshortened. Hide the Top-only screen ruler during
      // mutable gestures rather than leaving a stale apparent measurement.
      if (scaleBar.current) scaleBar.current.style.visibility = 'hidden';
      if (commit) commitCamera();
    } else commitCamera();
  }
  function animateCamera(target: typeof live.current) {
    cancelAnimationFrame(pendingFrame.current);
    nextState.current = null;
    const start = live.current;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      update(target, true);
      return;
    }
    const began = performance.now();
    const tick = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - began) / 320));
      update(interpolateCameraMotion(start, target, progress));
      if (progress < 1) pendingFrame.current = requestAnimationFrame(tick);
      else commitCamera();
    };
    pendingFrame.current = requestAnimationFrame(tick);
  }
  const gesture = useRef({ x: 0, y: 0, distance: 0, zoom: 1, pan: { x: 0, y: 0 }, pose, fitPreset, origin: { x: size.width / 2, y: size.height / 2 } });
  // The tracker stays on its compact, familiar SVG course card. Expanding is
  // the explicit opt-in to the live Three.js terrain and elevated flight arc.
  const terrainRequested = expanded && courseView != null && scene?.terrain != null && !terrainFailed && !showProfile;
  let terrainCamera;
  if (terrainRequested && scene?.terrain && courseView) {
    try { terrainCamera = fitTerrainViewportCamera(scene, scene.terrain, courseView, size.width, size.height, pose, zoom, [pan.x, pan.y], fitPreset); }
    catch { /* Missing source coverage retains the existing 2D view and pan. */ }
  }
  const terrainEnabled = terrainCamera != null;
  // Player view (§36): hole pill + View (Terrain / Top / Green) + overflow.
  // Side, Profile, the zoom rail and the camera tools stay in review and lab.
  const production = context === 'entry';
  const statePreset = PRODUCTION_CAMERA_STATES[productionCameraState(view)].preset;
  const [overflowOpen, setOverflowOpen] = useState(false);
  // Outside-world §3.4 gestures: a clean double tap resets the view, so the
  // production view needs no zoom rail or reset button on the canvas.
  const tapStart = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const homePreset: TerrainPreset = production ? statePreset : 'top';
  const interactive = expanded && courseView != null && !!scene && !showProfile;
  const boundedPan = (x: number, y: number) => ({ x: Math.max(-size.width / 2, Math.min(size.width / 2, x)),
    y: Math.max(-size.height / 2, Math.min(size.height / 2, y)) });
  const isPreset = (preset: TerrainPreset) => Math.abs(pose.pitch - TERRAIN_PRESETS[preset].pitch) < .01 &&
    Math.abs(pose.yawOffset - TERRAIN_PRESETS[preset].yawOffset) < .01 &&
    (pose.projection ?? 'orthographic') === (TERRAIN_PRESETS[preset].projection ?? 'orthographic');
  useEffect(() => () => cancelAnimationFrame(pendingFrame.current), []);
  useEffect(() => {
    // A stage director frames the course through the same preset motion the
    // View control uses; it never gets the raw pose.
    if (!presetRef) return;
    presetRef.current = presetView;
    return () => { presetRef.current = null; };
  });
  function cameraOrigin(current: typeof live.current) {
    if (scene?.terrain && courseView) {
      const camera = fitTerrainViewportCamera(scene, scene.terrain, courseView, size.width, size.height, current.pose, current.zoom,
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
  /** §62 fit: the zoom and pan that keep `target.fitPointsM` inside the safe
   * area for a pose, or null when the terrain has no height there (a camera
   * move must never replace a spatial estimate with a flat or guessed height). */
  function fitTo(target: CameraFitTarget, at: { pose: TerrainPose; fitPreset: TerrainFitProfile }): { zoom: number; pan: { x: number; y: number } } | null {
    if (!scene?.terrain || !courseView) return null;
    try {
      const mesh = scene.terrain;
      const left = 12, right = 64, top = Math.min(88, size.height * .24), bottom = 24;
      const safeWidth = size.width - left - right, safeHeight = size.height - top - bottom;
      const targetX = (left + size.width - right) / 2, targetY = (top + size.height - bottom) / 2;
      // Fit the framing region (tee→landing, ball→green complex, ball + green +
      // hazards) inside the safe area; fall back to the single target.
      const unit = fitTerrainViewportCamera(scene, mesh, courseView, size.width, size.height, at.pose, 1, [0, 0], at.fitPreset);
      const projected = target.fitPointsM.flatMap(point => { const z = terrainHeight(mesh, point); return z == null ? [] : [projectTerrainPoint([point[0], point[1], z], unit)]; });
      let zoom = target.zoom, centre: [number, number] | null = null;
      if (projected.length >= 2) {
        const xs = projected.map(point => point[0]), ys = projected.map(point => point[1]);
        const spanX = Math.max(1, Math.max(...xs) - Math.min(...xs)), spanY = Math.max(1, Math.max(...ys) - Math.min(...ys));
        zoom = Math.max(.9, Math.min(2.4, Math.min(safeWidth / spanX, safeHeight / spanY) * .82));
        centre = [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2];
      }
      const base = fitTerrainViewportCamera(scene, mesh, courseView, size.width, size.height, at.pose, zoom, [0, 0], at.fitPreset);
      const z = terrainHeight(mesh, target.targetM);
      if (z == null) return null;
      const focusPoint = projectTerrainPoint([target.targetM[0], target.targetM[1], z], base);
      // Re-project the fit at the chosen zoom and centre its extent.
      const fitted = centre ? target.fitPointsM.flatMap(p => { const h = terrainHeight(mesh, p); return h == null ? [] : [projectTerrainPoint([p[0], p[1], h], base)]; }) : [];
      const point = fitted.length >= 2
        ? [(Math.max(...fitted.map(p => p[0])) + Math.min(...fitted.map(p => p[0]))) / 2, (Math.max(...fitted.map(p => p[1])) + Math.min(...fitted.map(p => p[1]))) / 2]
        : focusPoint;
      return { zoom, pan: boundedPan(targetX - point[0], targetY - point[1]) };
    } catch {
      // Missing terrain coverage retains the existing hole fit.
      return null;
    }
  }
  useEffect(() => {
    // Putting keeps its whole-green overview after selection. Its ball/roll
    // geometry needs its own recorded coordinates; an earlier approach arc
    // must not pull the camera away from the actual green by default.
    // A stage director's focus (the player's own mark) takes the same path.
    if (!expanded || view === 'putting' || showProfile || !scene?.terrain || !courseView || (currentSelection == null && !stageFocus) || size.width <= 48 || size.height <= 48) return;
    const target = stageFocus?.target ?? deriveShotCameraTarget(scene, currentSelection);
    if (!target) return;
    const key = `${scene.packageHash}:${courseView}:${stageFocus ? `stage:${stageFocus.key}` : currentSelection}:${size.width}:${size.height}`;
    if (autoFocusKey.current === key) return;
    const current = live.current;
    const fit = fitTo(target, current);
    if (!fit) return;
    autoFocusKey.current = key;
    animateCamera({ ...current, ...fit });
    // The event key, not transient render state, owns this one camera settle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseView, currentSelection, expanded, scene, showProfile, size.height, size.width, view, stageFocus]);
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
    tapStart.current = pointers.current.size ? null : { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setDragging(true); rebase();
    onStageGesture?.();
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
    if (event.type !== 'pointerup' || pointers.current.size) return;
    const start = tapStart.current; tapStart.current = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) { lastTap.current = null; return; }
    const previous = lastTap.current, now = performance.now();
    if (previous && now - previous.time < 350 && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 24) {
      lastTap.current = null;
      changeCamera(() => ({ zoom: 1, pan: { x: 0, y: 0 }, pose: TERRAIN_PRESETS[homePreset], fitPreset: homePreset }));
    } else lastTap.current = { time: now, x: event.clientX, y: event.clientY };
  }
  function presetView(preset: TerrainPreset) {
    setShowProfile(false);
    cancelAnimationFrame(pendingFrame.current);
    nextState.current = null;
    const target = TERRAIN_PRESETS[preset], start = live.current.pose, fromFit = live.current.fitPreset;
    const startZoom = live.current.zoom, startPan = live.current.pan;
    // A stage focus settles on its fit at the new pose instead of the bare preset.
    const settled = stageFocus ? fitTo(stageFocus.target, { pose: target, fitPreset: preset }) : null;
    const endZoom = settled?.zoom ?? 1, endPan = settled?.pan ?? { x: 0, y: 0 };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { update({ ...live.current, pose: target, fitPreset: preset, zoom: endZoom, pan: endPan }, true); rebase(); return; }
    // An orthographic endpoint is approached through a near-zero field of
    // view: the lens narrows while the eye retreats, keeping the focus size
    // constant, so Top ↔ Terrain never pops between projections (Meridian §12).
    const anyPerspective = start.projection === 'perspective' || target.projection === 'perspective';
    const fovOf = (candidate: TerrainPose) => candidate.projection === 'perspective' ? candidate.fovDegrees ?? 32 : PERSPECTIVE_FOV.transitionStart;
    const startFov = fovOf(start), targetFov = fovOf(target);
    const began = performance.now();
    const tick = (now: number) => {
      // A RAF timestamp may precede the event's performance.now() within the
      // same refresh interval. Never extrapolate past exact Top/height bounds.
      const t = Math.max(0, Math.min(1, (now - began) / 260)), eased = 1 - (1 - t) ** 3;
      update({ zoom: startZoom + (endZoom - startZoom) * eased, pan: { x: startPan.x + (endPan.x - startPan.x) * eased, y: startPan.y + (endPan.y - startPan.y) * eased }, fitPreset: t < 1 ? { from: fromFit, to: preset, progress: eased } : preset, pose: t < 1 ? { pitch: start.pitch + (target.pitch - start.pitch) * eased,
        yawOffset: start.yawOffset + (target.yawOffset - start.yawOffset) * eased,
        exaggeration: start.exaggeration + (target.exaggeration - start.exaggeration) * eased,
        ...(anyPerspective ? { projection: 'perspective' as const, fovDegrees: startFov + (targetFov - startFov) * eased } : { projection: 'orthographic' as const }) } : target });
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
  const camera = scene && courseView ? compactPuttingPlan
    ? puttingScope === 'focus_putt' ? puttingFocusCamera(scene, size.width, size.height, focusShotNumber) : puttingPlanCamera(scene, size.width, size.height)
    : sceneCamera(scene, size.width, size.height, context === 'entry' ? 'compact' : 'review', courseView) : null;
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
  // Details and sources: review and lab keep them inline in the inspector;
  // the production view shows them in a bottom sheet (outside-world §3.6) so
  // its default state stays course-first.
  const detailHint = terrainEnabled && <p>{production ? 'Drag to tilt, pinch to zoom, double-tap to reset the view.' : 'Drag to tilt; pinch to zoom.'} Outlined hazards are possible surfaces, not recorded ball positions.</p>;
  const detailFacts = <>
    {active && <p>{recordedDistance(active.before)} before{active.rawMiss ? ` · ${active.rawMiss.replaceAll('_', ' ')}` : ''}. {describePosition(scene, active).detail}</p>}
    <p>{scene?.attribution ?? 'Course geometry unavailable.'}</p>
    <p>{scene?.terrain ? `${scene.terrain.source.acquisitionStart.slice(0, 4)} USGS terrain study. ` : ''}Estimated pin; the daily hole location is unverified. Trees and heights are illustrative.</p>
    {(scene?.sharedGreenHoleOrdinals?.length ?? 0) > 1 && <p>Shared green: holes {scene!.sharedGreenHoleOrdinals!.join(' and ')}.</p>}
  </>;
  return <div className={expanded ? 'flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row' : undefined} data-slot={expanded ? 'course-explorer' : undefined} data-putting-overview={compactPuttingPlan || undefined} data-putting-scope={compactPuttingPlan ? puttingScope : undefined}>
    <div className={expanded ? 'relative min-h-[180px] min-w-0 flex-1' : undefined}>
    <div ref={ref} data-slot="course-drawing" data-putting-mode={view === 'putting' ? courseBackedPutting ? 'course-green' : 'abstract' : undefined} className={`fw-course-motion w-full overflow-clip ${expanded ? 'absolute inset-0' : 'relative'}`}
      aria-label={expanded ? 'Interactive course landscape' : undefined}
      onPointerDown={startGesture} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture} onLostPointerCapture={endGesture}
      data-camera-zoom={zoom} data-world-scale={mapScale} data-dragging={dragging}
      style={{ height: expanded ? '100%' : compactHeight, touchAction: interactive ? 'none' : 'auto', cursor: interactive ? (dragging ? 'grabbing' : 'grab') : undefined }}>
      <div key={`${scene?.physicalHoleKey ?? 'missing'}-${view}`} className="fw-course-view-enter h-full w-full">
      {showProfile && scene ? <div className="h-full overflow-y-auto bg-surface pt-24"><CourseTerrainProfile scene={scene} selectedShotNumber={currentSelection} width={size.width} height={size.height - 96} /></div> : scene && transformed && courseView ? <CourseHoleScene scene={scene} width={size.width} height={size.height}
        mode={context === 'entry' ? 'compact' : 'review'} view={courseView} selectedShotNumber={currentSelection} activeDraftShotNumber={activeDraftShotNumber} camera={transformed} terrainCamera={terrainCamera}
        runtimeRef={runtime} onTerrainUnavailable={() => setTerrainFailed(true)} showIllustrativeFlightPreviews={view !== 'putting'} puttingPlan={compactPuttingPlan} debugView={debugView} world={world} markers={markers} reservedRects={reservedRects} /> : view === 'putting' ? <PuttingZoom width={size.width} height={size.height} distanceView={{
        beforeFeet: before == null ? null : before / .3048, afterFeet: after == null ? null : after / .3048,
        made: currentPuttingDistanceM == null && putt?.putt.made === true,
        rolledOff: putt != null && putt.result !== 'green' && putt.result !== 'hole',
      }} /> : <UnavailableCourseContext />}
      </div>
      {expanded && !production && courseView && scene && !showProfile && <div className="absolute bottom-4 right-3 flex flex-col gap-1 rounded-fw-lg border border-white/30 bg-surface p-1 shadow-card" role="group" aria-label="Zoom and pan" onPointerDown={e => e.stopPropagation()}>
        <Button size="sm" variant="ghost" className="min-w-11 px-2" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => changeCamera(current => ({ ...current, zoom: Math.min(4, current.zoom * 1.4) }))}>+</Button>
        <Button size="sm" variant="ghost" className="min-w-11 px-2" aria-label="Zoom out" disabled={zoom <= .5} onClick={() => changeCamera(current => ({ ...current, zoom: Math.max(.5, current.zoom / 1.4) }))}>−</Button>
        <Button size="sm" variant="ghost" className="min-w-11 px-2" aria-label="Reset view" onClick={() => changeCamera(() => ({ zoom: 1, pan: { x: 0, y: 0 }, pose: TERRAIN_PRESETS[homePreset], fitPreset: homePreset }))}><RotateCcw size={16} aria-hidden /></Button>
        {!terrainEnabled && <Button size="sm" variant="ghost" className="min-w-11 px-2" aria-label="Camera controls" aria-expanded={toolsOpen} onClick={() => setToolsOpen(v => !v)}><SlidersHorizontal size={17} aria-hidden /></Button>}
      </div>}
      {expanded && courseView && scene && !showProfile && (!terrainEnabled || Math.abs(pose.pitch - 90) < .01) && scaleWidth > 0 && scaleWidth < size.width / 2 &&
        <div ref={scaleBar} aria-label={`Map scale ${scaleYards} yards`} className="pointer-events-none absolute bottom-3 left-4 text-eyebrow font-medium" style={{ color: 'var(--fw-diagram-event)', visibility: dragging ? 'hidden' : 'visible' }}>
          <span className="block border-b border-l border-r pb-1 text-center" style={{ width: scaleWidth }}>{scaleYards} yd</span>
        </div>}
    </div>
    {expanded && <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
      <div className="pointer-events-auto">
        <Button variant="secondary" aria-label="Choose course area" aria-expanded={areasOpen} rightIcon={<ChevronDown size={15} aria-hidden />} className="h-auto rounded-fw-lg px-3 py-2 shadow-card" onClick={() => setAreasOpen(v => !v)}><span className="flex flex-col items-start">{heading}</span></Button>
        {areasOpen && <div className="mt-2 rounded-fw-lg bg-surface p-2 shadow-card">{areaControls?.(() => setAreasOpen(false))}</div>}
      </div>
      {onClose && <Button variant="secondary" className="pointer-events-auto h-11 min-w-11 rounded-full px-2 shadow-card" aria-label="Close" onClick={onClose}><X size={19} aria-hidden /></Button>}
    </div>}
    {expanded && stageOverlay}
    </div>
    {expanded && <aside className="z-10 flex max-h-[48dvh] shrink-0 flex-col border-t border-border-subtle bg-surface font-fw-sans sm:max-h-none sm:w-[320px] sm:border-l sm:border-t-0" aria-label="Course inspector" data-slot="course-inspector" data-modal="false" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-between gap-1 px-3 pt-2">
        {production && terrainEnabled ? <div className="flex items-center rounded-fw-md bg-surface-secondary p-0.5" role="group" aria-label="View">
          <Button size="sm" className="px-3" variant={isPreset(statePreset) && view !== 'green' ? 'secondary' : 'ghost'} aria-pressed={isPreset(statePreset) && view !== 'green'} onClick={() => presetView(statePreset)}>Terrain</Button>
          <Button size="sm" className="px-3" variant={isPreset('top') ? 'secondary' : 'ghost'} aria-pressed={isPreset('top')} onClick={() => presetView('top')}>Top</Button>
          <Button size="sm" className="px-3" variant={view === 'green' ? 'secondary' : 'ghost'} aria-pressed={view === 'green'} onClick={() => {
            if (view === 'green') { presetView('green'); return; }
            // Green is an area and a camera state at once: the frame remounts on the new area with the green pose.
            if (poseMemory) poseMemory.current = { pose: TERRAIN_PRESETS.green, fitPreset: 'green' };
            onSelectView?.('green');
          }}>Green</Button>
        </div> : (terrainEnabled || showProfile) && !production ? <div className="flex items-center rounded-fw-md bg-surface-secondary p-0.5" role="group" aria-label="Terrain camera">
          {(['top', 'terrain', 'side'] as const).map(preset => <Button key={preset} size="sm" className="px-2.5"
            variant={!showProfile && isPreset(preset) ? 'secondary' : 'ghost'} aria-pressed={!showProfile && isPreset(preset)} onClick={() => presetView(preset)}>
            {{ top: 'Top', terrain: 'Terrain', side: 'Side' }[preset]}</Button>)}
          <Button size="sm" className="px-3" variant={showProfile ? 'secondary' : 'ghost'} aria-pressed={showProfile}
            onClick={() => { flush(); commitCamera(); setShowProfile(true); }}>Profile</Button>
        </div> : <span className="px-1 text-caption font-medium">{view === 'putting' ? 'Putting distances' : 'Course outline'}</span>}
        {production ? <div className="relative ml-auto">
          <Button size="sm" variant="ghost" className="min-w-11 px-2" aria-label="More" aria-expanded={overflowOpen} aria-haspopup="menu" onClick={() => setOverflowOpen(v => !v)}><MoreHorizontal size={17} aria-hidden /></Button>
          {overflowOpen && <div role="menu" aria-label="More options" className={`absolute right-0 z-20 flex min-w-[180px] flex-col rounded-fw-lg border border-border-subtle bg-surface p-1 shadow-card ${stageFooter ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
            {stageMenuItems?.map(item => <Button key={item.key} role="menuitem" size="sm" variant="ghost" className="justify-start px-3" disabled={item.disabled} data-menu-item={item.key}
              onClick={() => { setOverflowOpen(false); item.onSelect(); }}>{item.label}</Button>)}
            {stageMenuItems?.length ? <div role="separator" className="my-1 border-t border-border-subtle" /> : null}
            <Button role="menuitem" size="sm" variant="ghost" className="justify-start px-3" leftIcon={<RotateCcw size={15} aria-hidden />} onClick={() => { setOverflowOpen(false); changeCamera(() => ({ zoom: 1, pan: { x: 0, y: 0 }, pose: TERRAIN_PRESETS[homePreset], fitPreset: homePreset })); }}>Reset view</Button>
            <Button role="menuitem" size="sm" variant="ghost" className="justify-start px-3" leftIcon={<Info size={15} aria-hidden />} aria-expanded={inspectorOpen} onClick={() => { setOverflowOpen(false); setInspectorOpen(v => !v); }}>Details and sources</Button>
          </div>}
        </div> : <>
          <Button size="sm" variant="ghost" className="ml-auto min-w-11 px-2" aria-label="Details and sources" aria-expanded={inspectorOpen} onClick={() => setInspectorOpen(v => !v)}><Info size={17} aria-hidden /></Button>
          <Button size="sm" variant="ghost" className="min-w-11 px-2" aria-label="Camera controls" aria-expanded={toolsOpen} onClick={() => setToolsOpen(v => !v)}><SlidersHorizontal size={17} aria-hidden /></Button>
        </>}
      </div>
      {stageFooter && <div data-slot="stage-footer" className="px-3 pb-2 pt-2">{stageFooter}</div>}
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
        {view === 'putting' && courseBackedPutting && <p className="px-4 pb-2 text-caption text-text-secondary" data-putting-position-status="evidence-only">{scene?.illustrativePuttingTracks?.length
          ? 'Whole green uses the canonical course shape. Ball and roll estimates come from entered distances; a marked ball can replace them.'
          : 'Whole green uses the canonical course shape. Mark a ball to add an exact ball position.'}</p>}
        {terrainEnabled && pose.exaggeration !== 1 && <p className="h-6 truncate px-4 pb-2 text-caption text-text-secondary">Relief {pose.exaggeration.toFixed(1)}×</p>}
        {terrainFailed && <p role="status" className="px-4 pb-2 text-caption text-text-secondary">3D view unavailable. Showing the course outline.</p>}
    {expanded && !production && toolsOpen && <div className="flex flex-wrap items-center gap-1 px-3 py-1" role="group" aria-label="Additional camera controls">
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
        {inspectorOpen && !production && <div className="space-y-2 px-4 pb-4 text-caption text-text-secondary">
          {detailHint}
        {context === 'review' && events.length > 1 && <div className="flex gap-1 overflow-x-auto px-3 pb-2" role="group" aria-label="Review shots">
          {reviewEvents.map(event => <Button key={event.shotNumber} size="sm" className="min-w-11 shrink-0 px-2" variant={active?.shotNumber === event.shotNumber ? 'secondary' : 'ghost'} aria-label={`Select shot ${event.shotNumber}`} aria-pressed={active?.shotNumber === event.shotNumber} onClick={() => onSelectEvent?.(event.shotNumber)}>{event.penalty ? `P${event.shotNumber}` : event.shotNumber}</Button>)}
        </div>}
          {detailFacts}
        </div>}
      </div>
    </aside>}
    {expanded && production && <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen} side="bottom" title="Details and sources" showHandle>
      <Sheet.Body><div className="space-y-2 text-caption text-text-secondary" data-slot="player-details-sheet">{detailHint}{detailFacts}</div></Sheet.Body>
    </Sheet>}
  </div>;
}
