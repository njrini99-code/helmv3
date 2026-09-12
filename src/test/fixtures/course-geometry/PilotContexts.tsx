import { useRef } from 'react';
import { FairwayShotEntry } from '@/components/fairway/pages/rounds-tracking/FairwayShotEntry';
import { HoleSceneFrame } from '@/components/golf/course-geometry/HoleSceneFrame';
import { illustrativeScene, pilotShots } from './pilot';

/** Local visual proof ONLY. Real entry controls; no save lifecycle or user data. */
export function PilotContexts() {
  const ref = useRef<HTMLInputElement>(null);
  const scene = illustrativeScene();
  return <main className="fairway-ds mx-auto max-w-5xl bg-canvas px-4 py-8 font-fw-sans text-text-primary">
    <header className="mb-8 text-center">
      <p className="mb-2 text-label-sm uppercase tracking-widest text-text-secondary">GolfHelm · Course geometry</p>
      <h1 className="text-h1 font-semibold">One hole. Both views.</h1>
      <p className="mt-2 text-body-sm text-text-secondary">Cacapon, hole 7 · Real course vectors, illustrative shot sequence</p>
    </header>
    <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-2">
      <section className="min-w-0"><h2 className="mb-4 text-h3 font-semibold">Round Review</h2>
        <HoleSceneFrame scene={scene} context="review" />
      </section>
      <section className="min-w-0"><h2 className="mb-4 text-h3 font-semibold">Continue round</h2>
        <div data-proof-scroll="entry" style={{ maxHeight: 1100, overflow: 'auto', position: 'relative' }}>
          <HoleSceneFrame scene={scene} context="entry">
            <FairwayShotEntry currentHole={{ number: 7, par: 4, yardage: 431, score: null }} currentShot={3}
              shotHistory={pilotShots} isTeeShot={false} isPutting={false} isApproachOrAroundGreen
              usedDriver={null} resultOfShot="green" missDirection={null} puttBreak={null} puttSlope={null}
              puttMissTags={[]} approachMissDirection={null} distanceToHole={17} distanceUnit="yards"
              distanceAfterShot="12" distanceAfterUnit="feet" isHoleComplete={false} undoSaving={false}
              showUndoConfirm={false} distanceInputRef={ref} dispatch={() => {}} onResultSelect={() => {}}
              isReadyForNextShot={() => true} onNextShot={() => {}} onAddPenalty={() => {}} onUndoLastShot={() => {}} />
          </HoleSceneFrame>
        </div>
      </section>
    </div>
    <p className="mt-8 text-center text-label-sm text-text-secondary">Local design proof · Source-reviewed draft · Independent course review pending</p>
  </main>;
}
