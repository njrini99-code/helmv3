import { useId, useMemo } from 'react';
import { prepareShotOverlay, layoutShotOverlay } from '@/lib/golf/course-geometry/shot-overlay-layout';
import type { HoleScene, LocalFeature, PointM } from '@/lib/golf/course-geometry/types';

interface OverlayProps {
  scene: HoleScene;
  width: number;
  height: number;
  selectedShotNumber?: number;
  /** The unrecorded current putt owns the ball marker, never a fake shot row. */
  activeDraftShotNumber?: number;
  project: (point: PointM) => PointM | null;
  pathForFeature: (feature: LocalFeature) => string | null;
  /** A quiet plan treatment for the compact, actual-green putting card. */
  appearance?: 'default' | 'putting-plan';
}

/** One annotation layer for both cameras. Source features and estimates share
 * the projector; readable badge positions stay in CSS pixels. Region samples
 * are conditional possibilities, never confidence contours or surveyed pins. */
export function CourseShotOverlay({ scene, width, height, selectedShotNumber, activeDraftShotNumber, project, pathForFeature, appearance = 'default' }: OverlayProps) {
  const id = useId();
  const prepared = useMemo(() => prepareShotOverlay(scene, selectedShotNumber), [scene, selectedShotNumber]);
  const { regions, segments, anchors, badges, pin, illustrativePreviewTrajectories, illustrativePuttingTracks } = layoutShotOverlay(prepared, { width, height, project, pathForFeature });
  // The interactive fixture supplies one intentional flight treatment per
  // recorded stroke. Its old generic inferred segments duplicate that path
  // and read as a heavy grey rail underneath it.
  const hasPreviewFlight = illustrativePreviewTrajectories.length > 0 || illustrativePuttingTracks.length > 0;
  const isInteractivePreview = scene.illustrativePreviewTrajectories != null || scene.illustrativePuttingTracks != null;
  // A recorded preview result already has one intentional display endpoint.
  // Keeping the uncertainty boundary around its entire fairway (or bunker)
  // competes with the flight line and makes the playing surface look traced.
  const puttingPlan = appearance === 'putting-plan';
  const showCandidateRegions = !puttingPlan && !isInteractivePreview;
  // The current draft has no saved shot row. Find the most recent display-only
  // track before it so its resting point can be styled as the current ball.
  // This changes presentation only; it never promotes a fixture estimate into
  // durable spatial evidence.
  const currentDraftTrackKey = puttingPlan && activeDraftShotNumber != null
    ? [...illustrativePuttingTracks].filter(track => track.shotNumber < activeDraftShotNumber).sort((a, b) => a.shotNumber - b.shotNumber).at(-1)?.key
    : undefined;
  const overlapsRollStart = (track: (typeof illustrativePuttingTracks)[number]) => track.kind === 'ball_position' &&
    illustrativePuttingTracks.some(candidate => candidate.kind === 'surface_roll' && Math.hypot(candidate.points[0]![0] - track.points.at(-1)![0], candidate.points[0]![1] - track.points.at(-1)![1]) < .01);
  return <g data-annotation="shot-evidence" data-appearance={appearance} data-active-draft-shot={activeDraftShotNumber}>
    <defs>
      <pattern id={`${id}-possible`} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(-35)">
        <path d="M0 0 V8" stroke="var(--fw-diagram-ground)" strokeWidth="1.1" opacity=".55" />
      </pattern>
      {showCandidateRegions && regions.map(region => <clipPath key={region.key} id={`${id}-${region.key}`}>
        <path d={region.clip} clipRule="evenodd" />
      </clipPath>)}
    </defs>
    {showCandidateRegions && regions.map(region => <g key={region.key} data-possible-area={region.shotNumber}
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
    {!puttingPlan && !hasPreviewFlight && segments.map(({ key, shotNumber, active, from, to }) => <g key={key} data-shot-segment={shotNumber} data-selected={active}
      data-distance-basis="inferred-endpoint-separation">
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="var(--fw-diagram-shadow)" strokeWidth={active ? 4.4 : 3.5} opacity=".4" />
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="var(--fw-diagram-event)"
        strokeWidth={active ? 2.4 : 1.6} strokeLinecap="round" strokeDasharray="5 6" opacity={active ? 1 : .65} />
    </g>)}
    {!puttingPlan && illustrativePreviewTrajectories.map(({ key, shotNumber, active, points }) => <g key={key}
      data-illustrative-preview-trajectory={shotNumber} data-selected={active} data-trajectory-source="interactive-preview-fixture">
      <title>Estimated flight preview from the recorded lie, result, and remaining distance. This path is not a GPS-recorded ball location or measured flight.</title>
      <polyline points={points.map(point => point.join(',')).join(' ')} fill="none" stroke="var(--fw-diagram-shadow)"
        strokeWidth={active ? 2.8 : 2.15} strokeLinecap="round" strokeLinejoin="round" opacity=".26" vectorEffect="non-scaling-stroke" />
      <polyline points={points.map(point => point.join(',')).join(' ')} fill="none" stroke="var(--fw-diagram-event)"
        strokeWidth={active ? 1.45 : 1.05} strokeLinecap="round" strokeLinejoin="round" opacity={active ? 1 : ".56"} vectorEffect="non-scaling-stroke" />
      <circle data-preview-flight-start={shotNumber} cx={points[0]![0]} cy={points[0]![1]} r={active ? 2.3 : 1.8}
        fill="var(--fw-diagram-event)" stroke="var(--fw-diagram-shadow)" strokeWidth=".7" />
      <circle data-preview-flight-end={shotNumber} cx={points.at(-1)![0]} cy={points.at(-1)![1]} r={active ? 3.3 : 2.5}
        fill="var(--fw-diagram-ground)" fillOpacity=".62" stroke="var(--fw-diagram-event)" strokeWidth={active ? "1.25" : ".9"} />
      {active && <circle data-preview-flight-estimate={shotNumber} cx={points.at(-1)![0]} cy={points.at(-1)![1]} r="1.1"
        fill="none" stroke="var(--fw-diagram-event)" strokeWidth=".8" opacity=".8" />}
    </g>)}
    {illustrativePuttingTracks.map(({ key, shotNumber, kind, active, points }) => {
      const first = points[0]!, last = points.at(-1)!;
      const isRoll = kind === 'surface_roll';
      const currentDraftBall = key === currentDraftTrackKey;
      // In draft view the most recent leave owns the current ball. A selected
      // recorded putt becomes prominent only after an explicit sequence tap.
      const selectedRecorded = active && !currentDraftBall && selectedShotNumber != null;
      const hideDuplicateBall = puttingPlan && overlapsRollStart({ key, shotNumber, kind, active, points });
      const markerRole = currentDraftBall ? 'current-draft' : isRoll ? 'estimated-leave' : 'estimated-current';
      const lineOpacity = selectedRecorded ? '.92' : currentDraftBall ? '.62' : '.45';
      return <g key={key} data-illustrative-putting-track={shotNumber} data-putting-track-kind={kind}
        data-selected={selectedRecorded} data-current-draft={currentDraftBall || undefined} data-trajectory-source="interactive-preview-fixture">
        <title>{isRoll
          ? `Estimated putting roll for shot ${shotNumber}, derived from entered start and leave distances against the nominal pin. This is not a marked ball location or measured roll.`
          : `Estimated ball position after shot ${shotNumber}, derived from the entered remaining distance against the nominal pin. This is not a marked or GPS position.`}</title>
        {isRoll && <>
          {puttingPlan ? <polyline points={points.map(point => point.join(',')).join(' ')} fill="none" stroke="#214738"
            strokeWidth={selectedRecorded ? 1.7 : 1.02} strokeLinecap="round" strokeLinejoin="round" opacity={lineOpacity} vectorEffect="non-scaling-stroke" /> : <>
            <polyline points={points.map(point => point.join(',')).join(' ')} fill="none" stroke="var(--fw-diagram-shadow)"
              strokeWidth={active ? 4.2 : 3.1} strokeLinecap="round" strokeLinejoin="round" opacity={active ? ".62" : ".4"} vectorEffect="non-scaling-stroke" />
            <polyline points={points.map(point => point.join(',')).join(' ')} fill="none" stroke="#FFFDF7"
              strokeWidth={active ? 2.1 : 1.35} strokeLinecap="round" strokeLinejoin="round" opacity={active ? "1" : ".7"} vectorEffect="non-scaling-stroke" />
          </>}
          <circle data-putting-ball="estimated-start" data-putting-ball-shot={shotNumber} cx={first[0]} cy={first[1]} r={puttingPlan ? (selectedRecorded ? 3.55 : 3.05) : (active ? 3.1 : 2.5)}
            fill="#FFFDF7" stroke={puttingPlan ? "#183B30" : "var(--fw-diagram-shadow)"} strokeWidth={puttingPlan ? (selectedRecorded ? "1.25" : "1") : (active ? "1.25" : "1")} />
        </>}
        {currentDraftBall && puttingPlan && <circle data-putting-selection-halo="current-draft" cx={last[0]} cy={last[1]} r="11.5" fill="#218348" fillOpacity=".14" stroke="#218348" strokeOpacity=".46" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />}
        {!hideDuplicateBall && <circle data-putting-ball={markerRole} data-putting-ball-shot={shotNumber}
          cx={last[0]} cy={last[1]} r={puttingPlan ? (currentDraftBall ? 5.25 : selectedRecorded ? 4.25 : 3.35) : (active ? 4.05 : 3.2)} fill="#FFFDF7" stroke={puttingPlan ? "#183B30" : "var(--fw-diagram-shadow)"} strokeWidth={puttingPlan ? (currentDraftBall ? "1.65" : selectedRecorded ? "1.35" : "1.05") : (active ? "1.5" : "1.2")} />}
      </g>;
    })}
    {!puttingPlan && anchors.map(({ key, point }) => <circle key={key} data-anchor="estimated"
      cx={point[0]} cy={point[1]} r="2.5" fill="var(--fw-diagram-ground)" stroke="var(--fw-diagram-event)" strokeWidth="1.5" />)}
    {pin && <g data-target="estimated-pin" data-target-basis={pin.basis}>
      <title>{pin.basis === 'green_reference' ? 'Green reference. No pin or cup position is known.' : 'Estimated pin. The actual daily cup location is unknown.'}</title>
      {puttingPlan ? <>
        <circle data-pin-anchor="estimated" cx={pin.position[0]} cy={pin.position[1]} r="3.25" fill="#FFFDF7" stroke="#183B30" strokeWidth="1.25" />
        <g transform={`translate(${pin.position[0]},${pin.position[1]}) scale(${Math.max(.72, pin.glyphScale * .7)})`} stroke="#183B30" strokeWidth=".7" strokeLinejoin="round">
          <path d="M0 -2 V-15" fill="none" stroke="#183B30" strokeWidth="1.45" />
          <path d="M0 -15 L8 -12 L0 -9 Z" fill="#FFFDF7" />
        </g>
      </> : <>
        <line x1={pin.position[0]} y1={pin.position[1]} x2={pin.label[0]} y2={pin.label[1]} stroke="var(--fw-diagram-event)"
          strokeWidth=".7" strokeDasharray="2 3" opacity=".65" />
        <circle data-pin-anchor="estimated" cx={pin.position[0]} cy={pin.position[1]} r="2.5" fill="var(--fw-diagram-green)"
          stroke="var(--fw-diagram-event)" strokeWidth="1.4" />
        <g transform={`translate(${pin.position[0]},${pin.position[1]}) scale(${pin.glyphScale})`} stroke="var(--fw-diagram-shadow)" strokeWidth=".6" strokeLinejoin="round">
          <path d="M0 -2 V-20" fill="none" stroke="var(--fw-diagram-event)" strokeWidth="1.5" />
          <path d="M0 -20 L11 -16 L0 -12 Z" fill="var(--fw-diagram-event)" />
        </g>
        <rect x={pin.label[0] - (pin.basis === 'green_reference' ? 24 : 44)} y={pin.label[1] - 10} width={pin.basis === 'green_reference' ? 48 : 88} height="20" rx="10"
          fill="var(--fw-diagram-event)" fillOpacity=".94" />
        <text x={pin.label[0]} y={pin.label[1]} dy=".35em" textAnchor="middle" fontFamily="inherit" fontSize="11"
          fontWeight="500" fill="var(--fw-diagram-ground)">{pin.basis === 'green_reference' ? 'Green' : 'Estimated pin'}</text>
      </>}
    </g>}
    {!puttingPlan && badges.map(badge => {
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
