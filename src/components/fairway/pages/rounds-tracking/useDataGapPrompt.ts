'use client';

/**
 * The one-tap data-gap prompt's state (CoachHelm Slice 8a). Lives in the
 * shot screen's parent (FairwayShotTracking), not in the entry panel, so the
 * session's tap counts survive the switch between the live entry and the
 * completed-hole review and the move between holes.
 *
 * With no asks (the flag is off, or the player has no open gap) this returns
 * null on every render and holds no effects: the screen is what it was.
 */

import { useCallback, useState } from 'react';
import type { PuttMissTag, ShotRecord } from '@/lib/types/golf';
import {
  askForShot,
  counterText,
  feetOf,
  holeGapFacts,
  isAskOpen,
  type DataGapAsk,
} from '@/lib/coachhelm/data-gap/asks';

export interface DataGapPromptView {
  /** `${holeNumber}:${shotNumber}` of the putt being asked about. */
  key: string;
  shotNumber: number;
  /** Rounded first-putt length in feet, for the caption. */
  distanceFeet: number | null;
  ask: DataGapAsk;
  counter: string;
  /** The tag this session just wrote on this putt, if any. */
  saved: PuttMissTag | null;
  onPick: (tag: PuttMissTag) => void;
  onSkip: () => void;
}

function factsOf(history: readonly ShotRecord[]) {
  return holeGapFacts(history, (s) => ({
    shot_type: s.shotType,
    is_penalty: !!s.isPenalty,
    distance_feet: feetOf(s.distanceToHoleBefore, s.distanceUnitBefore),
    holed: s.result === 'hole',
    has_miss_direction: !!s.missDirection || (s.puttMissTags?.length ?? 0) > 0,
  }));
}

export function useDataGapPrompt({
  asks,
  holeNumber,
  shotHistory,
  onTag,
}: {
  asks: readonly DataGapAsk[] | undefined;
  holeNumber: number | undefined;
  shotHistory: readonly ShotRecord[];
  /** Writes the tag through the shot screen's save path; true when applied. */
  onTag: (shotNumber: number, tag: PuttMissTag) => boolean;
}): DataGapPromptView | null {
  // Putts tagged here this session (key → the read it counted for and the
  // tag) and the taps per read, kept in one state so they move together.
  const [session, setSession] = useState<{
    tapsByRead: Record<string, number>;
    tagged: Record<string, { readId: string; tag: PuttMissTag }>;
  }>({ tapsByRead: {}, tagged: {} });
  // Putts skipped this session (key → the read it was asked for). A skipped
  // miss stays untagged, so it joins that read's population and raises its
  // target exactly as an untagged stored miss does (`askTarget`).
  const [skipped, setSkipped] = useState<Record<string, string>>({});

  const record = useCallback((key: string, readId: string, tag: PuttMissTag) => {
    setSession((prev) => ({
      // A second tap on the same putt corrects it; it is not another tag.
      tapsByRead: prev.tagged[key]
        ? prev.tapsByRead
        : { ...prev.tapsByRead, [readId]: (prev.tapsByRead[readId] ?? 0) + 1 },
      tagged: { ...prev.tagged, [key]: { readId, tag } },
    }));
  }, []);

  if (!asks || asks.length === 0 || holeNumber === undefined) return null;

  const facts = factsOf(shotHistory);
  const idx = facts.findIndex((f) => f.first_putt);
  if (idx === -1) return null;
  const first = facts[idx]!;
  const shot = shotHistory[idx]!;
  const key = `${holeNumber}:${shot.shotNumber}`;
  if (skipped[key]) return null;

  const { tapsByRead, tagged } = session;
  const skipsByRead: Record<string, number> = {};
  for (const readId of Object.values(skipped)) skipsByRead[readId] = (skipsByRead[readId] ?? 0) + 1;
  // A receipt only while the putt still carries the tag (an undo and
  // re-record of the same putt asks again).
  const done = first.has_miss_direction ? tagged[key] : undefined;
  // Just tagged here: keep the row as the receipt (chip shown chosen, counter
  // moved) until the read's target is met, when it disappears.
  const ask = done
    ? asks.find((a) => a.readId === done.readId) ?? null
    : askForShot(asks, first, tapsByRead, skipsByRead);
  if (!ask) return null;
  const taps = tapsByRead[ask.readId] ?? 0;
  const skips = skipsByRead[ask.readId] ?? 0;
  if (done && !isAskOpen(ask, taps, skips)) return null;

  return {
    key,
    shotNumber: shot.shotNumber,
    distanceFeet: first.distance_feet === null ? null : Math.round(first.distance_feet),
    ask,
    counter: counterText(ask, taps, skips),
    saved: done?.tag ?? null,
    onPick: (tag) => {
      if (onTag(shot.shotNumber, tag)) record(key, ask.readId, tag);
    },
    onSkip: () => setSkipped((s) => ({ ...s, [key]: ask.readId })),
  };
}
