'use client';

import { fairwayScope } from '@/lib/redesign/flag';
import FairwayShotTracking from '@/components/fairway/pages/rounds-tracking/FairwayShotTracking';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import type { DataGapAsk } from '@/lib/coachhelm/data-gap/asks';
import { FairwayRoundSummarySheet } from '@/components/fairway/pages/rounds-new/FairwayRoundSummarySheet';
import { FairwayCourseNudge } from '@/components/fairway/pages/rounds-tracking/FairwayCourseNudge';
import { useCourseNudge } from '@/components/fairway/pages/rounds-tracking/useCourseNudge';
import type { HoleStats } from '@/lib/types/golf';

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
    untaggedSince: 0,
    bandLabel: '5–10 ft',
    windowEnd: '2026-10-01',
  },
];

// Slice 8b fixtures: a par 4 whose tee shot found the trees ('other').
const PAR4_HOLES = HOLES.map((h, i) => (i === 6 ? { ...h, par: 4, yardage: 395 } : h)) as RoundHole[];
const TEE_INTO_TREES: ShotRecord = {
  shotNumber: 1,
  shotType: 'tee',
  clubType: 'driver',
  lieBefore: 'tee',
  distanceToHoleBefore: 395,
  distanceUnitBefore: 'yards',
  result: 'other',
  distanceToHoleAfter: 160,
  distanceUnitAfter: 'yards',
  shotDistance: 235,
  isPenalty: false,
};
const FRESH_HOLES = HOLES.map((h) => ({ ...h, score: null })) as RoundHole[];
const FINAL_STATS = HOLES.map((h) => ({
  holeNumber: h.number, par: h.par, yardage: h.yardage, score: h.par + (h.number % 3 === 0 ? 1 : 0), putts: 2,
  fairwayHit: h.par === 3 ? null : h.number % 2 === 0, greenInRegulation: h.number % 3 !== 0,
})) as unknown as HoleStats[];

function DataPromptsPreview({ state }: { state: 'recovery' | 'course' | 'finish' }) {
  const nudge = useCourseNudge({ enabled: true, hasCourse: false, courseName: 'Oak Hollow', onLink: () => undefined });
  if (state === 'finish') {
    return (
      <FairwayRoundSummarySheet
        open
        onOpenChange={() => undefined}
        finalStats={FINAL_STATS}
        courseName="Oak Hollow"
        notice={<FairwayCourseNudge nudge={nudge} />}
        onGoBack={() => undefined}
        onSubmit={() => undefined}
      />
    );
  }
  const recovery = state === 'recovery';
  const shots = recovery ? [TEE_INTO_TREES] : [];
  return (
    <FairwayShotTracking
      holes={recovery ? PAR4_HOLES : FRESH_HOLES}
      currentHoleIndex={recovery ? 6 : 0}
      initialShots={shots}
      initialShotNumber={shots.length + 1}
      onHoleComplete={async () => true}
      onSaveShot={() => true}
      onAutoSave={async () => undefined}
      onNavigateToHole={() => undefined}
      recoveryPrompt
      courseNudge={nudge}
    />
  );
}

export function ShotEntryPreview({ state }: { state: 'entry' | 'complete' | 'off' | 'recovery' | 'course' | 'finish' }) {
  if (state === 'recovery' || state === 'course' || state === 'finish') {
    return (
      <div className={fairwayScope('min-h-dvh bg-canvas')}>
        <DataPromptsPreview state={state} />
      </div>
    );
  }
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
