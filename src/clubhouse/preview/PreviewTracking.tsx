'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import type { HoleStats, RoundHole, ShotRecord } from '@/lib/types/golf';
import { calculateHoleStats } from '@/lib/utils/shot-helpers';
import { RoundTracking } from '../screens/rounds/track/RoundTracking';
import { ExitSheet, RoundCompleteSheet, ScorecardSheet, SubmitOverlay, type ChSummaryHole } from '../screens/rounds/track/round-sheets';
import { PREVIEW_TRACK_ROUND, trackingFixture } from './fixtures-tracking';

const wait = <T,>(v: T, ms = 500) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const NONE: ShotRecord[] = [];

/**
 * The shot screen inside a stand-in round screen, for the dev preview. It
 * plays the round screen's part of the contract (ShotTrackingProps): it keeps
 * the holes, saves a holed-out hole (after a pause; `?state=checkpointfail`
 * makes that fail), moves to the next unplayed hole, opens the finished
 * round, and fakes submitting. Nothing reaches the server: the preview's
 * shots have no ids, so the engine's own edits and undos stay local too.
 */
export function PreviewTracking({ state }: { state?: string }) {
  const f = useMemo(() => trackingFixture(state), [state]);
  const { setDistancePref } = useDistanceUnits();
  useEffect(() => {
    setDistancePref(f.meters ? 'meters' : 'yards');
  }, [f.meters, setDistancePref]);

  const [holes, setHoles] = useState<RoundHole[]>(f.holes);
  const [index, setIndex] = useState(f.index);
  const [shotsByHole, setShotsByHole] = useState<Record<number, ShotRecord[]>>(f.shotsByHole);
  const [sheet, setSheet] = useState(f.sheet);
  const [submit, setSubmit] = useState(f.submit);
  const [discarding, setDiscarding] = useState(false);

  const stats = (i: number): HoleStats | null => {
    const shots = shotsByHole[i];
    return holes[i]!.score != null && shots?.length ? calculateHoleStats(shots, holes[i]!) : null;
  };
  const card = holes.map((h, i) => ({ number: h.number, par: h.par, score: h.score, putts: stats(i)?.putts ?? null }));
  const summary: ChSummaryHole[] = holes.map((h, i) => {
    const s = stats(i);
    return { number: h.number, par: h.par, score: h.score, putts: s?.putts ?? null, fairwayHit: s?.fairwayHit ?? null, gir: s?.greenInRegulation ?? false };
  });
  const shotCount = Object.values(shotsByHole).reduce((n, s) => n + s.length, 0);

  const onHoleComplete = async (i: number, s: HoleStats) => {
    await wait(null);
    if (f.checkpointFails) return false;
    const next = holes.map((h, k) => (k === i ? { ...h, score: s.score } : h));
    setHoles(next);
    setShotsByHole((m) => ({ ...m, [i]: s.shots }));
    const frontier = next.findIndex((h) => h.score === null);
    if (frontier < 0) setSheet('summary');
    else setIndex(frontier);
    return true;
  };
  const submitRound = async () => {
    setSheet(null);
    setSubmit('saving');
    setSubmit(await wait(state === 'submitfail' ? 'failed' : 'done', 1400));
  };

  return (
    <>
      <RoundTracking
        round={PREVIEW_TRACK_ROUND}
        holes={holes}
        currentHoleIndex={index}
        initialShots={shotsByHole[index] ?? NONE}
        initialShotNumber={(shotsByHole[index]?.length ?? 0) + 1}
        onHoleComplete={onHoleComplete}
        onHoleStatsUpdate={(i, s) => {
          setHoles((hs) => hs.map((h, k) => (k === i ? { ...h, score: s ? s.score : null } : h)));
          if (s) setShotsByHole((m) => ({ ...m, [i]: s.shots }));
        }}
        onNavigateToHole={setIndex}
        onExit={() => setSheet('exit')}
        onOpenScorecard={() => setSheet('card')}
      />
      <ExitSheet
        open={sheet === 'exit'}
        course={PREVIEW_TRACK_ROUND.course}
        holes={card}
        currentNumber={holes[index]!.number}
        discarding={discarding}
        discardError={null}
        onSave={() => setSheet(null)}
        onKeep={() => setSheet(null)}
        onDiscard={async () => {
          setDiscarding(true);
          await wait(null);
          setDiscarding(false);
          setSheet(null);
        }}
      />
      <ScorecardSheet open={sheet === 'card'} onClose={() => setSheet(null)} course={PREVIEW_TRACK_ROUND.course} tee="Blue" holes={card} current={holes[index]!.number} />
      <RoundCompleteSheet open={sheet === 'summary'} heading="Finley GC · Blue · Oct 14" holes={summary} onBack={() => setSheet(null)} onSubmit={submitRound} />
      {submit && <SubmitOverlay state={submit} course={PREVIEW_TRACK_ROUND.course} shots={shotCount} coach="Coach Reyes" reviewHref={`/clubhouse-preview/round`} error={null} onRetry={submitRound} />}
    </>
  );
}
