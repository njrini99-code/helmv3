'use client';

import { fairwayScope } from '@/lib/redesign/flag';
import FairwayShotTracking from '@/components/fairway/pages/rounds-tracking/FairwayShotTracking';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import type { DataGapAsk } from '@/lib/coachhelm/data-gap/asks';

const HOLES = Array.from({ length: 18 }, (_, i) => ({
  number: i + 1,
  par: i === 6 ? 3 : 4,
  yardage: i === 6 ? 165 : 385,
  score: i < 6 ? 4 : null,
})) as RoundHole[];

const MISSED: ShotRecord[] = [
  {
    shotNumber: 1,
    shotType: 'approach',
    clubType: 'non_driver',
    lieBefore: 'tee',
    distanceToHoleBefore: 165,
    distanceUnitBefore: 'yards',
    result: 'green',
    distanceToHoleAfter: 6,
    distanceUnitAfter: 'feet',
    shotDistance: 163,
    isPenalty: false,
  },
  {
    shotNumber: 2,
    shotType: 'putting',
    clubType: 'putter',
    lieBefore: 'green',
    distanceToHoleBefore: 6,
    distanceUnitBefore: 'feet',
    result: 'green',
    distanceToHoleAfter: 1,
    distanceUnitAfter: 'feet',
    shotDistance: 2,
    isPenalty: false,
    puttSlope: 'downhill',
    puttDistanceFeet: 6,
  },
];

const HOLED: ShotRecord = {
  ...MISSED[1]!,
  shotNumber: 3,
  distanceToHoleBefore: 1,
  result: 'hole',
  distanceToHoleAfter: 0,
  shotDistance: 0,
  puttDistanceFeet: 1,
  puttSlope: undefined,
};

const ASKS: DataGapAsk[] = [
  {
    readId: 'preview-read',
    readTitle: 'Putts from 5–10 ft',
    field: 'miss_direction',
    filter: { shot_type: 'putting', first_putt: true, distance_feet: [5, 10], holed: false },
    targetCount: 10,
    haveCount: 4,
    taggedSince: 4,
    bandLabel: '5–10 ft',
    windowEnd: '2026-10-01',
  },
];

export function ShotEntryPreview({ state }: { state: 'entry' | 'complete' | 'off' }) {
  const shots = state === 'complete' ? [...MISSED, HOLED] : MISSED;
  return (
    <div className={fairwayScope('min-h-dvh bg-canvas')}>
      <FairwayShotTracking
        holes={HOLES}
        currentHoleIndex={6}
        initialShots={shots}
        initialShotNumber={shots.length + 1}
        onHoleComplete={async () => true}
        onSaveShot={() => true}
        onAutoSave={async () => undefined}
        onNavigateToHole={() => undefined}
        dataGapAsks={state === 'off' ? undefined : ASKS}
      />
    </div>
  );
}
