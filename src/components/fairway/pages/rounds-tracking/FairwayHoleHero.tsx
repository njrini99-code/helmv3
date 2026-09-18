'use client';

import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import type { HoleScene } from '@/lib/golf/course-geometry/types';
import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import { formatFeet, formatYards, feetToDisplay, yardsToDisplay } from '@/lib/golf/distance-units';
import { entryView } from '@/lib/golf/course-geometry/camera';
import { HoleSceneFrame } from '@/components/golf/course-geometry/HoleSceneFrame';
import { Button } from '@/components/fairway/controls/button';
import { FairwayHoleHeroLegacy } from './FairwayHoleHeroLegacy';

function shotStart(shot: ShotRecord, preference: 'yards' | 'meters') {
  return shot.distanceUnitBefore === 'feet' ? formatFeet(shot.distanceToHoleBefore, preference) : formatYards(shot.distanceToHoleBefore, preference);
}

function shotLeave(shot: ShotRecord, preference: 'yards' | 'meters') {
  if (shot.result === 'hole') return 'Made';
  return shot.distanceUnitAfter === 'feet' ? `${formatFeet(shot.distanceToHoleAfter, preference)} left` : `${formatYards(shot.distanceToHoleAfter, preference)} left`;
}

/** Read-only course context. Pending input never supplies a camera or anchor.
 * A round with no resolved course package (every course but Peek'n Peak
 * Upper, whose round clients thread `geometry` through `useCourseGeometry`)
 * keeps the hero shipped on main; the course frame is only ever a
 * replacement for a round it can draw. */
export function FairwayHoleHero(props: FairwayHoleHeroProps) {
  if (!props.scene) return <FairwayHoleHeroLegacy {...props} />;
  return <CourseFramedHoleHero {...props} scene={props.scene} />;
}

function CourseFramedHoleHero({ currentHole, scene, shotType = 'tee', currentShot, shotTypeLabel, currentLie, distanceToHole, distanceUnit, isHoleComplete, holeScore, puttCount, shotHistory, selectedShotNumber, activeDraftShotNumber, puttingSelection, onSelectPuttingContext }: FairwayHoleHeroProps & { scene: HoleScene }) {
  const { distancePref } = useDistanceUnits();
  const remaining = distanceUnit === 'feet' ? formatFeet(distanceToHole, distancePref) : formatYards(distanceToHole, distancePref);
  const puttingM = distanceUnit === 'feet' ? feetToDisplay(distanceToHole, 'meters', false) : yardsToDisplay(distanceToHole, 'meters', false);
  const puttingShots = shotHistory.filter(shot => shot.shotType === 'putting' && !shot.isPenalty);
  const selectedPutt = typeof puttingSelection === 'number' ? (puttingShots.find(shot => shot.shotNumber === puttingSelection) ?? null) : null;
  const selectedOrdinal = selectedPutt ? puttingShots.indexOf(selectedPutt) + 1 : puttCount + 1;

  return (
    <section aria-label="Current shot context" className="overflow-clip rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]">
      <HoleSceneFrame
        key={`${currentHole.number}-${scene?.packageHash ?? 'unavailable'}`}
        scene={scene}
        context="entry"
        defaultView={entryView(shotType)}
        selectedShotNumber={selectedShotNumber ?? undefined}
        activeDraftShotNumber={activeDraftShotNumber}
        currentPuttingDistanceM={shotType === 'putting' ? puttingM : null}
        header={
          <div className="min-w-0 py-1 font-fw-sans">
            <h2 className="text-body-sm font-semibold leading-5 text-text-primary">{isHoleComplete ? `Hole complete · ${holeScore}` : shotType === 'putting' ? `Putt ${puttCount + 1} · Shot ${currentShot}` : `Shot ${currentShot} · ${shotTypeLabel}`}</h2>
            {!isHoleComplete && (
              <p className="text-caption leading-5 text-text-secondary">
                {shotType === 'putting' ? (
                  `${remaining} to cup`
                ) : (
                  <>
                    <span className="capitalize">{currentLie}</span> · {remaining} remaining
                  </>
                )}
              </p>
            )}
          </div>
        }
      >
        {shotType === 'putting' && !isHoleComplete && (
          <div className="border-t border-border-subtle" data-slot="putting-summary">
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto px-3 py-1.5" role="group" aria-label="Putting sequence">
              {puttingShots.map((shot, index) => {
                const selected = selectedPutt?.shotNumber === shot.shotNumber;
                return (
                  <Button key={shot.shotNumber} variant={selected ? 'secondary' : 'ghost'} size="sm" aria-pressed={selected} onClick={() => onSelectPuttingContext?.(shot.shotNumber)} className="h-8 shrink-0 px-2 text-caption tabular-nums">
                    {index + 1} · {shotStart(shot, distancePref)}
                  </Button>
                );
              })}
              <Button variant={puttingSelection === 'draft' || selectedPutt == null ? 'secondary' : 'ghost'} size="sm" aria-current={puttingSelection === 'draft' || selectedPutt == null ? 'step' : undefined} onClick={() => onSelectPuttingContext?.(null)} className="h-8 shrink-0 px-2 text-caption tabular-nums">
                {puttCount + 1} · Now
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-0.5">
              <div className="min-w-0">
                <p className="font-fw-sans text-body-sm font-semibold tabular-nums text-text-primary">
                  Putt {selectedOrdinal} · {selectedPutt ? shotStart(selectedPutt, distancePref) : remaining}
                </p>
                <p className="truncate font-fw-sans text-caption text-text-secondary">{selectedPutt ? shotLeave(selectedPutt, distancePref) : 'Select a putt result'}</p>
              </div>
              {selectedPutt && (
                <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-caption" onClick={() => onSelectPuttingContext?.(null)}>
                  Resume
                </Button>
              )}
            </div>
          </div>
        )}
      </HoleSceneFrame>
    </section>
  );
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
  selectedShotNumber?: number | null;
  /** Current unrecorded putt; a view-only identifier, never a shot row. */
  activeDraftShotNumber?: number;
  puttingSelection?: number | 'draft';
  onSelectPuttingContext?: (shotNumber: number | null) => void;
}
