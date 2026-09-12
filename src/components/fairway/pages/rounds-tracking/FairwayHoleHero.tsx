'use client';

import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import type { HoleScene } from '@/lib/golf/course-geometry/types';
import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import { formatFeet, formatYards, feetToDisplay, yardsToDisplay } from '@/lib/golf/distance-units';
import { entryView } from '@/lib/golf/course-geometry/camera';
import { HoleSceneFrame } from '@/components/golf/course-geometry/HoleSceneFrame';

/** Read-only course context. Pending input never supplies a camera or anchor. */
export function FairwayHoleHero({ currentHole, scene, shotType = 'tee', currentShot, shotTypeLabel, currentLie,
  distanceToHole, distanceUnit, isHoleComplete, holeScore }: FairwayHoleHeroProps) {
  const { distancePref } = useDistanceUnits();
  const remaining = distanceUnit === 'feet' ? formatFeet(distanceToHole, distancePref) : formatYards(distanceToHole, distancePref);
  const puttingM = distanceUnit === 'feet' ? feetToDisplay(distanceToHole, 'meters', false) : yardsToDisplay(distanceToHole, 'meters', false);
  return <section aria-label="Current shot context" className="overflow-clip rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]">
    <HoleSceneFrame key={`${currentHole.number}-${scene?.packageHash ?? 'unavailable'}`} scene={scene} context="entry"
      defaultView={entryView(shotType)} currentPuttingDistanceM={shotType === 'putting' ? puttingM : null}
      header={<div className="min-w-0 py-1 font-fw-sans">
        <h2 className="text-body-sm font-semibold leading-5 text-text-primary">{isHoleComplete ? `Hole complete · ${holeScore}` : `Shot ${currentShot} · ${shotTypeLabel}`}</h2>
        {!isHoleComplete && <p className="text-caption leading-5 text-text-secondary"><span className="capitalize">{currentLie}</span> · {remaining} remaining</p>}
      </div>} />
  </section>;
}

interface FairwayHoleHeroProps {
  currentHole: RoundHole;
  scene?: HoleScene | null;
  shotType?: string;
  isHoleComplete: boolean;
  shotHistory: ShotRecord[];
  shotHistoryLength: number;
  puttCount: number;
  holeScore: number;
  currentShot: number;
  shotTypeLabel: string;
  currentLie: string;
  missDirection: string | null;
  distanceToHole: number;
  distanceUnit: 'yards' | 'feet';
  progressPercent: number;
  displayDistance: number;
  displayUnit: 'yards' | 'feet';
}
