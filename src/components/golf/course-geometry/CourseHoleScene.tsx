import { useId } from 'react';
import type { HoleScene, LocalFeature, PointM } from '@/lib/golf/course-geometry/types';
import { fitCamera, toScreen, type SimilarityTransform } from '@/lib/golf/course-geometry/project';
import { checkedAnchor } from '@/lib/golf/course-geometry/quality';

export const SCENE_STYLE_VERSION = 'fairway-vector-v3';
const ORDER: LocalFeature['kind'][] = ['woods', 'rough', 'water', 'fairway', 'tee', 'green', 'bunker', 'route'];

export function featurePath(feature: LocalFeature, camera: SimilarityTransform): string {
  return feature.parts.flatMap(rings => rings.map(ring => ring.map((p, i) => {
    const [x, y] = toScreen(p, camera);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(3)},${y.toFixed(3)}`;
  }).join(' ') + (feature.type === 'LineString' ? '' : ' Z'))).join(' ');
}
export function sceneCamera(scene: HoleScene, width: number, height: number, mode: 'review' | 'compact' | 'strip' | 'source') {
  // Use the shared geometry-only orientation. Fit once with uniform scale.
  const angle = mode === 'source' ? 0 : scene.orientationRadians;
  return fitCamera(scene.features.flatMap(f => f.parts.flat(2)), width, height, angle, mode === 'strip' ? 4 : 12);
}

/** One SVG implementation for both surfaces and the deterministic report.
 * No map controls, inferred cup, fake turf, arbitrary SVG, or provider requests. */
export function CourseHoleScene({ scene, width = 320, height = 380, mode = 'review' }: {
  scene: HoleScene; width?: number; height?: number; mode?: 'review' | 'compact' | 'strip' | 'source';
}) {
  const id = useId();
  const camera = sceneCamera(scene, width, height, mode);
  const features = [...scene.features].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.id.localeCompare(b.id));
  const labels: PointM[] = [];
  const anchors = scene.events.map(event => {
    const anchor = checkedAnchor(event, scene.features);
    if (!anchor) return null;
    const screen = toScreen(anchor, camera);
    // Physical point never moves. Offset labels only, with a leader.
    const candidates: PointM[] = [];
    for (const radius of [24, 48, 72]) for (const angle of [-Math.PI / 4, -3 * Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4, 0, Math.PI]) {
      const point: PointM = [screen[0] + radius * Math.cos(angle), screen[1] + radius * Math.sin(angle)];
      if (point[0] >= 12 && point[0] <= width - 12 && point[1] >= 12 && point[1] <= height - 12) candidates.push(point);
    }
    const label = candidates.find(p => labels.every(other => Math.hypot(p[0] - other[0], p[1] - other[1]) >= 26)) ?? candidates[0];
    // If there is no readable label space, the accessible evidence list owns it.
    if (!label) return null;
    labels.push(label);
    return { event, screen, label };
  });
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height}
      style={{ width: '100%', height: '100%', display: 'block', background: 'var(--fw-diagram-ground)' }}
      preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby={`${id}-title ${id}-desc`}
      data-geometry-hash={scene.packageHash} data-physical-hole={scene.physicalHoleKey} data-render-version={SCENE_STYLE_VERSION}
      data-scale={camera.scale} data-angle={camera.angle}>
      <title id={`${id}-title`}>{`Hole ${scene.hole.ordinal} course outline`}</title>
      <desc id={`${id}-desc`}>Partial source-reviewed geometry. Pin location unknown. Shot positions are unresolved unless explicitly marked estimated. {scene.attribution}</desc>
      <defs>
        <clipPath id={`${id}-clip`}><rect width={width} height={height} /></clipPath>
        <radialGradient id={`${id}-ground`} cx="48%" cy="45%" r="70%">
          <stop stopColor="var(--fw-diagram-ground-light)" />
          <stop offset="1" stopColor="var(--fw-diagram-ground)" />
        </radialGradient>
        <linearGradient id={`${id}-fairway`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--fw-diagram-fairway-light)" />
          <stop offset="1" stopColor="var(--fw-diagram-fairway)" />
        </linearGradient>
        <linearGradient id={`${id}-green`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--fw-diagram-green-light)" />
          <stop offset="1" stopColor="var(--fw-diagram-green)" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width={width} height={height} fill={`url(#${id}-ground)`} />
        {features.map(f => f.kind === 'route' && scene.overlayKind === 'analytic_fixture' ? null : <path key={f.id}
          data-feature-id={f.id} data-surface={f.kind} d={featurePath(f, camera)}
          fill={f.kind === 'route' ? 'none' : ['fairway', 'green'].includes(f.kind) ? `url(#${id}-${f.kind})` : `var(--fw-diagram-${f.kind})`}
          fillRule="evenodd" stroke={f.kind === 'route' ? 'var(--fw-diagram-route)' : f.kind === 'bunker' ? 'var(--fw-diagram-shadow)' : 'var(--fw-diagram-edge)'}
          strokeWidth={f.kind === 'route' ? 0.65 : f.kind === 'bunker' ? 1 : 1.2}
          strokeLinejoin="round" strokeDasharray={f.kind === 'route' ? '2 7' : undefined} opacity={f.kind === 'route' ? 0.35 : 1} />)}
        {scene.overlayKind === 'analytic_fixture' && anchors[0] && (() => {
          const start = scene.features.find(f => f.id === scene.hole.routeFeatureId)?.parts[0]?.[0]?.[0];
          if (!start) return null;
          const point = toScreen(start, camera);
          return <g data-illustrative-origin="true">
            <line x1={point[0]} y1={point[1]} x2={anchors[0].screen[0]} y2={anchors[0].screen[1]}
              stroke="var(--fw-diagram-event)" strokeWidth={1.5} strokeDasharray="5 6" opacity={0.85} />
            <circle cx={point[0]} cy={point[1]} r={4} fill="var(--fw-diagram-event)" />
            <circle cx={point[0]} cy={point[1]} r={7} fill="none" stroke="var(--fw-diagram-event)" strokeOpacity={0.35} />
          </g>;
        })()}
        {mode !== 'strip' && anchors.map((entry, i) => {
          if (!entry) return null;
          const { event, screen, label } = entry;
          const previous = anchors[i - 1];
          return <g key={event.evidence.eventKey} data-event={event.evidence.shotNumber}>
            {previous && <line x1={previous.screen[0]} y1={previous.screen[1]} x2={screen[0]} y2={screen[1]}
              stroke="var(--fw-diagram-event)" strokeWidth={1.5} strokeDasharray="5 6" />}
            <line x1={screen[0]} y1={screen[1]} x2={label[0]} y2={label[1]} stroke="var(--fw-diagram-event)" strokeWidth={0.8} />
            <circle data-anchor="estimated" cx={screen[0]} cy={screen[1]} r={2.5} fill="none" stroke="var(--fw-diagram-event)" strokeWidth={1.5} />
            <circle cx={label[0]} cy={label[1]} r={11} fill="var(--fw-diagram-event)" stroke="var(--fw-diagram-shadow)" strokeWidth={1.5} />
            <text x={label[0]} y={label[1]} dy=".35em" textAnchor="middle" fontSize={12} fontWeight={600} fontFamily="system-ui" fill="var(--fw-diagram-ground)">{event.evidence.shotNumber}</text>
          </g>;
        })}
      </g>
    </svg>
  );
}
