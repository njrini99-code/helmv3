'use client';

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Button } from '@/components/fairway/controls/button';
import { INTEGRITY_COPY } from '@/lib/golf/one-tap/hole-integrity';
import { greenCentreENU, holeKeyForRoundHole, type OneTapLiveRound } from '@/lib/golf/one-tap/live-round-placement';
import { toRoundShots, type RoundShotsResult } from '@/lib/golf/one-tap/to-round-shots';
import type { HoleStats, RoundHole, ShotRecord } from '@/lib/types/golf';
import { OneTapPlayerScreen } from './OneTapPlayerScreen';
import { useOneTapRound } from './use-one-tap-round';

/** Meridian Live inside the existing round flow (master plan §77). The
 * screen collects evidence on the course; this component is the seam to the
 * round ledger: a cup-marked hole with its count on record becomes the same
 * ShotRecords and HoleStats the standard tracker would have produced (via
 * `toRoundShots`) and is checkpointed through the host's `onHoleComplete`;
 * a hole whose count is not on record is handed back for manual completion
 * instead of being scored short. "Use standard tracking" hands the adapted
 * shots so far to the standard state machine. */
export interface OneTapLiveHoleProps {
  live: OneTapLiveRound;
  holes: readonly RoundHole[];
  holeIndex: number;
  onNavigateToHole?: (holeIndex: number) => void;
  onHoleComplete: (holeIndex: number, stats: HoleStats) => Promise<boolean>;
  onHoleStatsUpdate?: (holeIndex: number, stats: HoleStats | null) => void | Promise<void>;
  onSaveShot?: (shot: ShotRecord) => void;
  onUseStandardTracking: (shots: ShotRecord[]) => void;
  onExit?: () => void;
  statusSlot?: ReactNode;
  reducedMotion?: boolean;
}
export function OneTapLiveHole({ live, holes, holeIndex, onNavigateToHole, onHoleComplete, onHoleStatsUpdate, onSaveShot, onUseStandardTracking, onExit, statusSlot, reducedMotion }: OneTapLiveHoleProps) {
  const hole = holes[holeIndex];
  // The round hook plays the package's holes; the host's index is the round's.
  const keyByRoundIndex = useMemo(() => holes.map(h => holeKeyForRoundHole(live, h.number)), [holes, live]);
  const holeKey = keyByRoundIndex[holeIndex] ?? null;
  const keyIndex = holeKey ? Math.max(0, live.holeKeys.indexOf(holeKey)) : 0;
  const onNavigateRef = useRef(onNavigateToHole);
  onNavigateRef.current = onNavigateToHole;
  const controlled = useMemo(() => ({
    holeIndex: keyIndex,
    onHoleIndexChange: (index: number) => {
      const key = live.holeKeys[index];
      const roundIndex = key ? keyByRoundIndex.indexOf(key) : -1;
      if (roundIndex >= 0) onNavigateRef.current?.(roundIndex);
    },
  }), [keyIndex, live.holeKeys, keyByRoundIndex]);
  const round = useOneTapRound({ roundId: live.roundId, pkg: live.pkg, holeKeys: live.holeKeys, location: live.location, storage: live.storage, controlled, roundType: live.roundType });
  const greenCentre = useMemo(() => holeKey ? greenCentreENU(live.pkg, holeKey) : null, [live.pkg, holeKey]);
  const adapted = useMemo<RoundShotsResult | null>(() => hole ? toRoundShots({ anchors: round.anchors, penalties: round.penalties, hole: { number: hole.number, par: hole.par, yardage: hole.yardage }, greenCentreENU: greenCentre }) : null,
    [round.anchors, round.penalties, hole, greenCentre]);

  // Ledger seam: a clean cup-marked close is checkpointed once; reopening it
  // tells the host the hole is no longer holed out.
  const reported = useRef<string | null>(null);
  const hostRef = useRef({ onHoleComplete, onHoleStatsUpdate, onSaveShot });
  hostRef.current = { onHoleComplete, onHoleStatsUpdate, onSaveShot };
  useEffect(() => {
    if (!adapted || !holeKey) return;
    if (adapted.complete && adapted.stats) {
      const key = `${holeKey}:${round.terminalMethod}:${round.anchors.length}:${adapted.penaltyStrokes}`;
      if (reported.current === key) return;
      reported.current = key;
      for (const shot of adapted.shots) hostRef.current.onSaveShot?.(shot);
      void hostRef.current.onHoleComplete(holeIndex, adapted.stats);
    } else if (reported.current?.startsWith(`${holeKey}:`)) {
      reported.current = null;
      void hostRef.current.onHoleStatsUpdate?.(holeIndex, null);
    }
  }, [adapted, holeKey, holeIndex, round.terminalMethod, round.anchors.length]);

  if (!hole || !holeKey || !adapted) return null;
  const manual = adapted.complete && adapted.needsManualCompletion ? adapted.integrity.flags[0] ?? null : null;
  return <div className="flex h-[100dvh] min-h-0 flex-col bg-canvas" data-slot="one-tap-live-hole" data-hole-number={hole.number} data-ledger={adapted.stats ? 'checkpointed' : manual ? 'manual' : 'open'}>
    {statusSlot}
    {manual && <div className="flex items-center justify-between gap-3 border-b border-border-subtle bg-surface px-4 py-2" role="status" data-slot="one-tap-manual-completion" data-flag={manual}>
      <p className="text-caption text-text-primary"><span className="font-semibold">{INTEGRITY_COPY[manual].title}.</span> The count is not on record — finish this hole by hand.</p>
      <Button variant="secondary" size="sm" onClick={() => onUseStandardTracking(adapted.shots)} data-slot="one-tap-finish-by-hand">Finish by hand</Button>
    </div>}
    <OneTapPlayerScreen roundId={live.roundId} pkg={live.pkg} holeKey={holeKey} terrain={live.terrainByHole?.[holeKey] ?? null} contextLayer={live.contextLayer}
      location={live.location} storage={live.storage} transport={live.transport} reducedMotion={reducedMotion} round={round}
      onUseStandardTracking={() => onUseStandardTracking(adapted.shots)} onExitRound={onExit} />
  </div>;
}
