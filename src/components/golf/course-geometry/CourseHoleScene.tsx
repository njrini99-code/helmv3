import { Fragment, useId, useMemo, type RefObject } from 'react';
import type { HoleScene, LocalFeature, PointM } from '@/lib/golf/course-geometry/types';
import { fitCamera, toScreen, type SimilarityTransform } from '@/lib/golf/course-geometry/project';
import { contextCamera, puttingPlanCamera, type CourseView } from '@/lib/golf/course-geometry/camera';
import { canopySymbols, crownOutline, crownScale } from '@/lib/golf/course-geometry/canopy';
import { displayOutline } from '@/lib/golf/course-geometry/display-outline';
import { TERRAIN_LIGHT_DIRECTION, type TerrainCamera } from '@/lib/golf/course-geometry/terrain';
import { CourseTerrainCanvas } from './CourseTerrainCanvas';
import type { TerrainDebugView } from './terrain-debug';
import { CrownGlyph, CrownPaint } from './TerrainCanopyLayer';
import { CourseShotOverlay } from './CourseShotOverlay';

import type { TerrainRuntimeController } from '@/lib/golf/course-geometry/runtime-controller';
import { playerLabelPlacement, type SceneMarkers } from '@/lib/golf/course-geometry/scene-markers';
import type { OverlayReservedRect } from '@/lib/golf/course-geometry/shot-overlay-controller';

export const SCENE_STYLE_VERSION = 'fairway-vector-v10';
const ORDER: LocalFeature['kind'][] = ['woods', 'rough', 'water', 'fairway', 'tee', 'green', 'bunker', 'route'];
export function featurePath(feature: LocalFeature, camera: SimilarityTransform): string {
  return feature.parts.flatMap(rings => rings.map(ring => ring.map((p, i) => {
    const [x, y] = toScreen(p, camera);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(3)},${y.toFixed(3)}`;
  }).join(' ') + (feature.type === 'LineString' ? '' : ' Z'))).join(' ');
}
export function sceneCamera(scene: HoleScene, width: number, height: number, mode: 'review' | 'compact' | 'strip' | 'source', view: CourseView = 'hole', puttingPlan = false) {
  return mode === 'source'
    ? fitCamera(scene.features.flatMap(f => f.parts.flat(2)), width, height, 0, 12)
    : puttingPlan ? puttingPlanCamera(scene, width, height) : contextCamera(scene, width, height, view, mode === 'strip' ? 4 : 12);
}

/** Pure SVG: surfaces and anchors share one similarity transform; labels use
 * CSS-pixel dimensions supplied by the measured viewport. No gesture capture. */
export function CourseHoleScene({ scene, width = 320, height = 380, mode = 'review', view = 'hole', selectedShotNumber, activeDraftShotNumber, camera: override, terrainCamera, onTerrainUnavailable, runtimeRef, showIllustrativeFlightPreviews = true, puttingPlan = false, debugView, markers, reservedRects }: {
  scene: HoleScene; width?: number; height?: number; mode?: 'review' | 'compact' | 'strip' | 'source';
  view?: CourseView; selectedShotNumber?: number; activeDraftShotNumber?: number; camera?: SimilarityTransform; terrainCamera?: TerrainCamera;
  onTerrainUnavailable?: () => void; runtimeRef?: RefObject<TerrainRuntimeController | null>;
  /** Putting keeps full-swing fixture arcs out of its tactical surface view. */
  showIllustrativeFlightPreviews?: boolean;
  /** A top-down, quiet compact treatment for the reviewed green complex. */
  puttingPlan?: boolean;
  /** Development-only faceting diagnostics (Meridian §14); never set by player routes. */
  debugView?: TerrainDebugView;
  /** Player-marked positions (One-Tap): dots with true-scale σ rings, joined by derived shots. */
  markers?: SceneMarkers | null;
  /** Host chrome over the terrain canvas (canvas pixels) that evidence labels avoid. */
  reservedRects?: readonly OverlayReservedRect[];
}) {
  const sceneForDisplay = useMemo(() => showIllustrativeFlightPreviews ? scene : { ...scene, illustrativePreviewTrajectories: [] }, [scene, showIllustrativeFlightPreviews]);
  const id = useId();
  if (terrainCamera && scene.terrain) return <CourseTerrainCanvas scene={sceneForDisplay} mesh={scene.terrain} camera={terrainCamera} width={width} height={height}
    selectedShotNumber={selectedShotNumber} debugView={debugView} markers={markers} reservedRects={reservedRects}
    onUnavailable={onTerrainUnavailable} runtimeRef={runtimeRef}
    fallback={<CourseHoleScene scene={sceneForDisplay} width={width} height={height} mode={mode} view={view} selectedShotNumber={selectedShotNumber} activeDraftShotNumber={activeDraftShotNumber} camera={override} showIllustrativeFlightPreviews={showIllustrativeFlightPreviews} puttingPlan={puttingPlan} markers={markers} />} />;
  const camera = override ?? sceneCamera(scene, width, height, mode, view, puttingPlan);
  const features = [...scene.features].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.id.localeCompare(b.id)).filter(feature => {
    // A bunker that leaks only a few pixels into the plan reads as a seam, not
    // useful green-complex context. Keep hazards with a visible silhouette.
    if (!puttingPlan || feature.kind !== 'bunker') return true;
    const points = feature.parts.flat(2).map(point => toScreen(point, camera));
    const minX = Math.min(...points.map(point => point[0])), maxX = Math.max(...points.map(point => point[0]));
    const minY = Math.min(...points.map(point => point[1])), maxY = Math.max(...points.map(point => point[1]));
    const area = Math.max(1, (maxX - minX) * (maxY - minY));
    const visible = Math.max(0, Math.min(width, maxX) - Math.max(0, minX)) * Math.max(0, Math.min(height, maxY) - Math.max(0, minY));
    return visible / area >= .22;
  });
  const lightPoint = toScreen([TERRAIN_LIGHT_DIRECTION[0], TERRAIN_LIGHT_DIRECTION[1]], camera);
  const light: PointM = [lightPoint[0] - camera.translation[0], lightPoint[1] - camera.translation[1]];
  const lightLength = Math.hypot(...light) || 1;
  const lightUnit: PointM = [light[0] / lightLength, light[1] / lightLength];
  const hasEstimatedPutting = (scene.illustrativePuttingTracks?.length ?? 0) > 0;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height}
      style={{ width: '100%', height: '100%', display: 'block', background: 'var(--fw-diagram-ground)', fontFamily: 'var(--fw-font-sans)' }}
      shapeRendering="geometricPrecision" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby={`${id}-title ${id}-desc`}
      data-geometry-hash={scene.packageHash} data-physical-hole={scene.physicalHoleKey} data-render-version={SCENE_STYLE_VERSION}
      data-view={view} data-scale={camera.scale} data-angle={camera.angle} data-putting-plan={puttingPlan || undefined}>
      <title id={`${id}-title`}>{scene.hole.displayLabel ?? `Hole ${scene.hole.ordinal} ${view === 'green' ? 'green complex' : view === 'approach' ? 'approach context' : 'course outline'}`}</title>
      <desc id={`${id}-desc`}>{scene.hole.completeness === 'reviewed_surfaces' ? 'Reviewed surfaces.' : 'Partial source geometry; acceptance pending.'} Pin location unknown. {hasEstimatedPutting ? 'The ball and putt roll are estimated from entered distances and remain distinct from marked or GPS coordinates.' : 'Course context does not locate the ball. Shot positions are unresolved unless explicitly marked estimated.'} {scene.attribution}</desc>
      <defs>
        <radialGradient id={`${id}-ground`} cx="45%" cy="42%" r="76%">
          <stop stopColor="var(--fw-diagram-ground-light)" />
          <stop offset="1" stopColor="var(--fw-diagram-ground)" />
        </radialGradient>
        <radialGradient id={`${id}-green`} cx={`${50 + lightUnit[0] * 28}%`} cy={`${50 + lightUnit[1] * 28}%`} r="82%">
          <stop stopColor="var(--fw-diagram-green-light)" />
          <stop offset="1" stopColor="var(--fw-diagram-green)" />
        </radialGradient>
        <CrownPaint id={id} light={light} />
        {mode !== 'source' && mode !== 'strip' && features.filter(f => f.kind === 'bunker' || f.kind === 'green').map(f =>
          <clipPath key={f.id} id={`${id}-interior-${f.id}`}><path d={featurePath(displayOutline(f), camera)} clipRule="evenodd" /></clipPath>)}
        <mask id={`${id}-clear-playing-surfaces`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
          <rect width={width} height={height} fill="white" />
          {features.filter(f => !['woods', 'route', 'rough'].includes(f.kind)).map(f =>
            <path key={f.id} d={featurePath(displayOutline(f), camera)} fill="black" fillRule="evenodd" />)}
        </mask>
        <clipPath id={`${id}-clip`}><rect width={width} height={height} /></clipPath>
        <linearGradient id={`${id}-fairway`} x1={`${50 + lightUnit[0] * 50}%`} y1={`${50 + lightUnit[1] * 50}%`}
          x2={`${50 - lightUnit[0] * 50}%`} y2={`${50 - lightUnit[1] * 50}%`}>
          <stop stopColor="var(--fw-diagram-fairway-light)" />
          <stop offset="1" stopColor="var(--fw-diagram-fairway)" />
        </linearGradient>
        <linearGradient id={`${id}-sand`} x1={`${50 + lightUnit[0] * 50}%`} y1={`${50 + lightUnit[1] * 50}%`}
          x2={`${50 - lightUnit[0] * 50}%`} y2={`${50 - lightUnit[1] * 50}%`}>
          <stop stopColor="var(--fw-diagram-sand-highlight)" />
          <stop offset=".4" stopColor="var(--fw-diagram-bunker)" />
          <stop offset="1" stopColor="var(--fw-diagram-bunker)" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width={width} height={height} fill={mode === 'source' || puttingPlan ? 'var(--fw-diagram-ground)' : `url(#${id}-ground)`} />
        {mode !== 'source' && !puttingPlan && <g data-annotation="illustrative-mowing-surrounds" aria-hidden="true">
          {features.filter(f => f.kind === 'fairway').map(f => <path key={`surround-${f.id}`}
            d={featurePath(displayOutline(f), camera)} fill="none" stroke="var(--fw-diagram-surround)"
            strokeWidth={camera.scale * 13} strokeLinejoin="round" />)}
        </g>}
        {features.map(f => f.kind === 'route' && scene.hole.completeness !== 'route_only' ? null : <Fragment key={f.id}>
          {f.kind === 'green' && mode !== 'source' && <path data-annotation="illustrative-green-collar"
            d={featurePath(displayOutline(f), camera)} fill="none" stroke="var(--fw-diagram-fringe)"
            strokeWidth={puttingPlan ? 1.2 : camera.scale * 2.8} strokeLinejoin="round" aria-hidden="true" />}
          <path
          data-feature-id={f.id} data-surface={f.kind} d={featurePath(mode === 'source' ? f : displayOutline(f), camera)}
          fill={f.kind === 'route' ? 'none' : f.kind === 'bunker' ? `url(#${id}-sand)` : f.kind === 'fairway' ? (puttingPlan ? 'var(--fw-diagram-fringe)' : `url(#${id}-fairway)`) : f.kind === 'green' ? (puttingPlan ? 'var(--fw-diagram-green)' : `url(#${id}-green)`) : `var(--fw-diagram-${f.kind})`}
          fillRule="evenodd" fillOpacity={f.kind === 'woods' && mode !== 'source' ? .35 : puttingPlan && f.kind === 'fairway' ? 1 : puttingPlan && f.kind === 'rough' ? .82 : 1} stroke={puttingPlan && f.kind === 'fairway' ? 'none' : f.kind === 'woods' ? 'none' : f.kind === 'route' ? 'var(--fw-diagram-route)' : f.kind === 'bunker' ? 'var(--fw-diagram-sand-edge)' : f.kind === 'green' ? (puttingPlan ? 'var(--fw-diagram-fringe)' : 'var(--fw-diagram-green-edge)') : 'var(--fw-diagram-edge)'}
          strokeWidth={mode === 'strip' ? .55 : f.kind === 'route' ? .7 : f.kind === 'bunker' ? (puttingPlan ? .62 : .85) : f.kind === 'green' && puttingPlan ? .66 : .9}
          strokeLinejoin="round" strokeDasharray={f.kind === 'route' ? '2 7' : undefined} />
          {mode !== 'source' && mode !== 'strip' && !puttingPlan && (f.kind === 'bunker' || f.kind === 'green') && <g clipPath={`url(#${id}-interior-${f.id})`} aria-hidden="true" data-annotation="surface-rim-light">
            <path d={featurePath(displayOutline(f), camera)} transform={`translate(${lightUnit[0] * .7},${lightUnit[1] * .7})`} fill="none"
              stroke={f.kind === 'bunker' ? 'var(--fw-diagram-sand-edge)' : 'var(--fw-diagram-fringe)'}
              strokeWidth={1.8} opacity={.3} strokeLinejoin="round" />
            <path d={featurePath(displayOutline(f), camera)} transform={`translate(${-lightUnit[0] * .8},${-lightUnit[1] * .8})`} fill="none"
              stroke={f.kind === 'bunker' ? 'var(--fw-diagram-sand-highlight)' : 'var(--fw-diagram-green-edge)'}
              strokeWidth={1.5} opacity={f.kind === 'bunker' ? .9 : .48} strokeLinejoin="round" />
          </g>}
        </Fragment>)}
        {mode !== 'strip' && mode !== 'source' && !puttingPlan && features.filter(f => f.kind === 'woods').map(f => <g key={`canopies-${f.id}`}
          data-annotation="illustrative-tree-crowns" data-canopy-source={f.id} mask={`url(#${id}-clear-playing-surfaces)`} aria-hidden="true">
          {canopySymbols(f, scene).map((point, i) => {
            const p = toScreen(point, camera), radius = 3.6 * camera.scale * crownScale(i);
            if (p[0] < -radius || p[0] > width + radius || p[1] < -radius || p[1] > height + radius) return null;
            return <g key={i} transform={`translate(${p[0]},${p[1]}) scale(${radius})`}>
              <path d={crownOutline(i)} transform={`translate(${-lightUnit[0] * .35},${-lightUnit[1] * .35}) scale(1.1,.9)`}
                fill="var(--fw-diagram-tree-shadow)" opacity={.4} />
              <CrownGlyph id={id} seed={i} light={light} detail={radius >= 4} />
            </g>;
          })}
        </g>)}
        {mode !== 'strip' && <CourseShotOverlay scene={sceneForDisplay} width={width} height={height} selectedShotNumber={selectedShotNumber} activeDraftShotNumber={activeDraftShotNumber}
          project={point => toScreen(point, camera)} pathForFeature={feature => featurePath(feature, camera)} appearance={puttingPlan ? 'putting-plan' : 'default'} />}
        {markers && (markers.markers.length > 0 || markers.links.length > 0) && <g data-annotation="marked-positions" aria-hidden="true">
          {markers.links.map(link => { const a = toScreen(link.fromM, camera), b = toScreen(link.toM, camera); return <g key={link.key} data-marked-link={link.key}>
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--fw-diagram-shadow)" strokeWidth="4" strokeLinecap="round" opacity=".35" />
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--fw-diagram-event)" strokeWidth="1.8" strokeLinecap="round" />
          </g>; })}
          {markers.markers.map(marker => {
            // Static twin of the runtime overlay: ◎ YOU with its accuracy halo, ● BALL / marks with the σ ring, ○ provisional.
            const [x, y] = toScreen(marker.pointM, camera), player = marker.kind === 'player', hollow = player || marker.kind === 'provisional';
            const r = player ? 5.5 : marker.kind === 'ball' ? 4.2 : marker.kind === 'provisional' ? 4 : 3.2, sigma = marker.sigmaM * camera.scale, opacity = marker.dimmed ? .45 : 1;
            const placement = player ? playerLabelPlacement([x, y], markers.markers.filter(m => m.kind !== 'player').map(m => toScreen(m.pointM, camera))) : 'above';
            return <g key={marker.key}>
              {sigma > r && (player
                ? <circle cx={x} cy={y} r={sigma} fill="var(--fw-diagram-event)" fillOpacity=".1" stroke="var(--fw-diagram-event)" strokeOpacity=".3" strokeWidth="1" data-marked-sigma={marker.key} data-marker-halo="accuracy" />
                : <circle cx={x} cy={y} r={sigma} fill="var(--fw-diagram-event)" fillOpacity=".08" stroke="var(--fw-diagram-event)" strokeWidth="1" strokeDasharray="3 3" opacity=".85" data-marked-sigma={marker.key} />)}
              <circle cx={x} cy={y + 1.2} r={r + 1.5} fill="var(--fw-diagram-shadow)" opacity={.35 * opacity} />
              <circle cx={x} cy={y} r={r} fill={hollow ? 'var(--fw-diagram-ground-light)' : 'var(--fw-diagram-event)'} stroke={hollow ? 'var(--fw-diagram-event)' : 'var(--fw-diagram-ground-light)'}
                strokeWidth={player ? 2 : marker.kind === 'ball' ? 1.6 : 1.4} opacity={opacity} data-marked-position={marker.key} data-marker-kind={marker.kind} />
              {player && <circle cx={x} cy={y} r={r * .4} fill="var(--fw-diagram-event)" opacity={opacity} data-marker-core={marker.key} />}
              {marker.label && placement !== 'hidden' && <text x={x} y={placement === 'below' ? y + r + 13 : y - r - 5} fill="var(--fw-diagram-event)" fontSize="10" fontWeight="600" textAnchor="middle" letterSpacing=".6" paintOrder="stroke" stroke="var(--fw-diagram-ground-light)" strokeWidth="3" opacity={opacity} data-marker-label={marker.key} data-label-placement={placement}>{marker.label}</text>}
            </g>; })}
        </g>}
      </g>
    </svg>
  );
}
