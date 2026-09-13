import { useId, useMemo } from 'react';
import { prepareShotOverlay, layoutShotOverlay } from '@/lib/golf/course-geometry/shot-overlay-layout';
import type { HoleScene, LocalFeature, PointM } from '@/lib/golf/course-geometry/types';

interface OverlayProps {
  scene: HoleScene;
  width: number;
  height: number;
  selectedShotNumber?: number;
  project: (point: PointM) => PointM | null;
  pathForFeature: (feature: LocalFeature) => string | null;
}

/** One annotation layer for both cameras. Source features and estimates share
 * the projector; readable badge positions stay in CSS pixels. Region samples
 * are conditional possibilities, never confidence contours or surveyed pins. */
export function CourseShotOverlay({ scene, width, height, selectedShotNumber, project, pathForFeature }: OverlayProps) {
  const id = useId();
  const prepared = useMemo(() => prepareShotOverlay(scene, selectedShotNumber), [scene, selectedShotNumber]);
  const { regions, segments, anchors, badges, pin } = layoutShotOverlay(prepared, { width, height, project, pathForFeature });
  return <g data-annotation="shot-evidence">
    <defs>
      <pattern id={`${id}-possible`} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(-35)">
        <path d="M0 0 V8" stroke="var(--fw-diagram-ground)" strokeWidth="1.1" opacity=".55" />
      </pattern>
      {regions.map(region => <clipPath key={region.key} id={`${id}-${region.key}`}>
        <path d={region.clip} clipRule="evenodd" />
      </clipPath>)}
    </defs>
    {regions.map(region => <g key={region.key} data-possible-area={region.shotNumber}
      data-candidate-feature={region.featureId} data-position-basis="compatible-surface">
      <title>Candidate surface for shot {region.shotNumber}. The outline identifies a possible surface; hatching shows sampled possible finishes. Pin unknown; alternatives remain.</title>
      <path d={region.clip} data-candidate-outline="halo" fill="none" stroke="var(--fw-diagram-shadow)" strokeWidth="3.2" opacity=".32" />
      <path d={region.clip} data-candidate-outline="boundary" fill="none" stroke="var(--fw-diagram-event)"
        strokeWidth="1.4" strokeDasharray="4 4" strokeLinejoin="round" opacity=".9" />
      <g data-feasible-region={Boolean(region.d)} data-position-basis="sampled-feasible-region" clipPath={`url(#${id}-${region.key})`}>
        <path d={region.d} fill="var(--fw-diagram-event)" opacity=".24" />
        <path d={region.d} fill={`url(#${id}-possible)`} />
      </g>
    </g>)}
    {segments.map(({ key, shotNumber, active, from, to }) => <g key={key} data-shot-segment={shotNumber} data-selected={active}
      data-distance-basis="inferred-endpoint-separation">
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="var(--fw-diagram-shadow)" strokeWidth={active ? 4.4 : 3.5} opacity=".4" />
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="var(--fw-diagram-event)"
        strokeWidth={active ? 2.4 : 1.6} strokeLinecap="round" strokeDasharray="5 6" opacity={active ? 1 : .65} />
    </g>)}
    {anchors.map(({ key, point }) => <circle key={key} data-anchor="estimated"
      cx={point[0]} cy={point[1]} r="2.5" fill="var(--fw-diagram-ground)" stroke="var(--fw-diagram-event)" strokeWidth="1.5" />)}
    {pin && <g data-target="estimated-pin" data-target-basis={pin.basis}>
      <title>Estimated pin. The actual daily cup location is unknown.</title>
      <line x1={pin.position[0]} y1={pin.position[1]} x2={pin.label[0]} y2={pin.label[1]} stroke="var(--fw-diagram-event)"
        strokeWidth=".7" strokeDasharray="2 3" opacity=".65" />
      <circle data-pin-anchor="estimated" cx={pin.position[0]} cy={pin.position[1]} r="2.5" fill="var(--fw-diagram-green)"
        stroke="var(--fw-diagram-event)" strokeWidth="1.4" />
      <g transform={`translate(${pin.position[0]},${pin.position[1]}) scale(${pin.glyphScale})`} stroke="var(--fw-diagram-shadow)" strokeWidth=".6" strokeLinejoin="round">
        <path d="M0 -2 V-20" fill="none" stroke="var(--fw-diagram-event)" strokeWidth="1.5" />
        <path d="M0 -20 L11 -16 L0 -12 Z" fill="var(--fw-diagram-event)" />
      </g>
      <rect x={pin.label[0] - 44} y={pin.label[1] - 10} width="88" height="20" rx="10"
        fill="var(--fw-diagram-event)" fillOpacity=".94" />
      <text x={pin.label[0]} y={pin.label[1]} dy=".35em" textAnchor="middle" fontFamily="inherit" fontSize="11"
        fontWeight="500" fill="var(--fw-diagram-ground)">Estimated pin</text>
    </g>}
    {badges.map(badge => {
      const { key, shotNumber, active, anchor, label } = badge;
      return <g key={key} data-event={shotNumber} data-selected={active}>
        <line x1={anchor[0]} y1={anchor[1]} x2={label[0]} y2={label[1]} stroke="var(--fw-diagram-event)" strokeWidth=".8" opacity=".7" />
        <circle cx={label[0]} cy={label[1]} r={active ? 12 : 11} fill="var(--fw-diagram-event)"
          stroke="var(--fw-diagram-shadow)" strokeWidth={active ? 2 : 1} />
        <text x={label[0]} y={label[1]} dy=".35em" textAnchor="middle" fontSize="13" fontWeight="600"
          fontFamily="inherit" fill="var(--fw-diagram-ground)">{shotNumber}</text>
      </g>;
    })}
  </g>;
}
