import { useId } from 'react';
import type { HoleScene, LocalFeature, PointM } from '@/lib/golf/course-geometry/types';
import { fitCamera, toScreen, type SimilarityTransform } from '@/lib/golf/course-geometry/project';
import { contextCamera, type CourseView } from '@/lib/golf/course-geometry/camera';
import { canopySymbols } from '@/lib/golf/course-geometry/canopy';
import { displayOutline } from '@/lib/golf/course-geometry/display-outline';
import { checkedAnchor } from '@/lib/golf/course-geometry/quality';

export const SCENE_STYLE_VERSION = 'fairway-vector-v6';
const ORDER: LocalFeature['kind'][] = ['woods', 'rough', 'water', 'fairway', 'tee', 'green', 'bunker', 'route'];
export function featurePath(feature: LocalFeature, camera: SimilarityTransform): string {
  return feature.parts.flatMap(rings => rings.map(ring => ring.map((p, i) => {
    const [x, y] = toScreen(p, camera);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(3)},${y.toFixed(3)}`;
  }).join(' ') + (feature.type === 'LineString' ? '' : ' Z'))).join(' ');
}
export function sceneCamera(scene: HoleScene, width: number, height: number, mode: 'review' | 'compact' | 'strip' | 'source', view: CourseView = 'hole') {
  return mode === 'source'
    ? fitCamera(scene.features.flatMap(f => f.parts.flat(2)), width, height, 0, 12)
    : contextCamera(scene, width, height, view, mode === 'strip' ? 4 : 12);
}

/** Pure SVG: surfaces and anchors share one similarity transform; labels use
 * CSS-pixel dimensions supplied by the measured viewport. No gesture capture. */
export function CourseHoleScene({ scene, width = 320, height = 380, mode = 'review', view = 'hole', selectedShotNumber, camera: override }: {
  scene: HoleScene; width?: number; height?: number; mode?: 'review' | 'compact' | 'strip' | 'source';
  view?: CourseView; selectedShotNumber?: number; camera?: SimilarityTransform;
}) {
  const id = useId();
  const camera = override ?? sceneCamera(scene, width, height, mode, view);
  const features = [...scene.features].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.id.localeCompare(b.id));
  const anchors = scene.events.map(event => {
    const point = checkedAnchor(event, scene.features);
    return point ? toScreen(point, camera) : null;
  });
  const labels: PointM[] = [];
  const entries = scene.events.map((event, index) => ({ event, index })).sort((a, b) =>
    Number(b.event.evidence.shotNumber === selectedShotNumber) - Number(a.event.evidence.shotNumber === selectedShotNumber));
  const badges = entries.map(({ event, index }) => {
    const screen = anchors[index];
    // Offscreen anchors are retained in the scene and ledger, never clamped.
    if (!screen || screen[0] < 0 || screen[0] > width || screen[1] < 0 || screen[1] > height) return null;
    const candidates: PointM[] = [];
    for (const radius of [24, 48, 72]) for (const angle of [-Math.PI / 4, -3 * Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4, 0, Math.PI]) {
      const p: PointM = [screen[0] + radius * Math.cos(angle), screen[1] + radius * Math.sin(angle)];
      if (p[0] >= 14 && p[0] <= width - 14 && p[1] >= 14 && p[1] <= height - 14) candidates.push(p);
    }
    const label = candidates.find(p => labels.every(other => Math.hypot(p[0] - other[0], p[1] - other[1]) >= 28));
    if (!label) return null;
    labels.push(label);
    return { event, screen, label };
  });
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height}
      style={{ width: '100%', height: '100%', display: 'block', background: 'var(--fw-diagram-ground)' }}
      shapeRendering="geometricPrecision" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby={`${id}-title ${id}-desc`}
      data-geometry-hash={scene.packageHash} data-physical-hole={scene.physicalHoleKey} data-render-version={SCENE_STYLE_VERSION}
      data-view={view} data-scale={camera.scale} data-angle={camera.angle}>
      <title id={`${id}-title`}>{`Hole ${scene.hole.ordinal} ${view === 'green' ? 'green complex' : view === 'approach' ? 'approach context' : 'course outline'}`}</title>
      <desc id={`${id}-desc`}>Source-reviewed draft. Pin location unknown. Course context does not locate the ball. Shot positions are unresolved unless explicitly marked estimated. {scene.attribution}</desc>
      <defs>
        <clipPath id={`${id}-clip`}><rect width={width} height={height} /></clipPath>
        <linearGradient id={`${id}-fairway`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--fw-diagram-fairway-light)" />
          <stop offset="1" stopColor="var(--fw-diagram-fairway)" />
        </linearGradient>
        <linearGradient id={`${id}-sand`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="var(--fw-diagram-sand-highlight)" />
          <stop offset=".28" stopColor="var(--fw-diagram-bunker)" />
          <stop offset="1" stopColor="var(--fw-diagram-bunker)" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width={width} height={height} fill="var(--fw-diagram-ground)" />
        {mode !== 'source' && <g data-annotation="illustrative-mowing-surrounds" aria-hidden="true">
          {features.filter(f => f.kind === 'fairway' || f.kind === 'green').map(f => <path key={`surround-${f.id}`}
            d={featurePath(displayOutline(f), camera)} fill="none" stroke={f.kind === 'green' ? 'var(--fw-diagram-fringe)' : 'var(--fw-diagram-surround)'}
            strokeWidth={camera.scale * (f.kind === 'green' ? 2.8 : 13)} strokeLinejoin="round" />)}
        </g>}
        {features.map(f => f.kind === 'route' && scene.hole.completeness !== 'route_only' ? null : <path key={f.id}
          data-feature-id={f.id} data-surface={f.kind} d={featurePath(mode === 'source' ? f : displayOutline(f), camera)}
          fill={f.kind === 'route' ? 'none' : f.kind === 'bunker' ? `url(#${id}-sand)` : f.kind === 'fairway' ? `url(#${id}-fairway)` : `var(--fw-diagram-${f.kind})`}
          fillRule="evenodd" stroke={f.kind === 'woods' ? 'none' : f.kind === 'route' ? 'var(--fw-diagram-route)' : f.kind === 'bunker' ? 'var(--fw-diagram-sand-edge)' : f.kind === 'green' ? 'var(--fw-diagram-green-edge)' : 'var(--fw-diagram-edge)'}
          strokeWidth={f.kind === 'route' ? 0.7 : f.kind === 'bunker' ? 0.9 : 1.1}
          strokeLinejoin="round" strokeDasharray={f.kind === 'route' ? '2 7' : undefined} />)}
        {mode !== 'strip' && mode !== 'source' && features.filter(f => f.kind === 'woods').map(f => <g key={`canopies-${f.id}`}
          data-annotation="illustrative-tree-crowns" data-canopy-source={f.id} aria-hidden="true">
          {canopySymbols(f, scene).map((point, i) => {
            const p = toScreen(point, camera), radius = 2.8 * camera.scale;
            if (p[0] < -radius || p[0] > width + radius || p[1] < -radius || p[1] > height + radius) return null;
            return <g key={i} transform={`translate(${p[0]},${p[1]})`}>
              <circle cy={radius * .13} r={radius} fill="var(--fw-diagram-tree-shadow)" opacity={.5} />
              {Array.from({ length: 6 }, (_, n) => {
                const a = (n + i % 3 * .3) * Math.PI / 3;
                return <circle key={n} cx={Math.cos(a) * radius * .5} cy={Math.sin(a) * radius * .5} r={radius * .53} fill="var(--fw-diagram-tree)" />;
              })}
              <circle cx={-radius * .12} cy={-radius * .15} r={radius * .56} fill="var(--fw-diagram-tree-light)" opacity={.7} />
            </g>;
          })}
        </g>)}
        {mode !== 'strip' && anchors.map((point, index) => {
          const previous = anchors[index - 1];
          if (!point || !previous) return null; // Never bridge an unresolved/penalty/putting gap.
          const selected = scene.events[index]!.evidence.shotNumber === selectedShotNumber;
          return <line key={`segment-${index}`} data-shot-segment={scene.events[index]!.evidence.shotNumber}
            x1={previous[0]} y1={previous[1]} x2={point[0]} y2={point[1]}
            stroke="var(--fw-diagram-event)" strokeWidth={selected ? 2.4 : 1.4} strokeDasharray="5 6" opacity={selected ? 1 : .65} />;
        })}
        {mode !== 'strip' && badges.map(entry => {
          if (!entry) return null;
          const { event, screen, label } = entry;
          const selected = event.evidence.shotNumber === selectedShotNumber;
          return <g key={event.evidence.eventKey} data-event={event.evidence.shotNumber}>
            <line x1={screen[0]} y1={screen[1]} x2={label[0]} y2={label[1]} stroke="var(--fw-diagram-event)" strokeWidth={.8} opacity={.7} />
            <circle data-anchor="estimated" cx={screen[0]} cy={screen[1]} r={2.5} fill="none" stroke="var(--fw-diagram-event)" strokeWidth={1.5} />
            <circle cx={label[0]} cy={label[1]} r={selected ? 12 : 11} fill="var(--fw-diagram-event)" stroke="var(--fw-diagram-shadow)" strokeWidth={selected ? 2 : 1} />
            <text x={label[0]} y={label[1]} dy=".35em" textAnchor="middle" fontSize={13} fontWeight={600} fontFamily="inherit" fill="var(--fw-diagram-ground)">{event.evidence.shotNumber}</text>
          </g>;
        })}
      </g>
    </svg>
  );
}
