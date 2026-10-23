'use client';

/**
 * The shot screen's one-tap data prompts (CoachHelm supercharge Slice 8a and 8b), Clubhouse's state for them. The rules are
 * the shared, pure modules: which putt a read is waiting on and its counter (`lib/coachhelm/data-gap/asks.ts`), which tee
 * shot may be followed by a recovery (`lib/golf/data-prompts/recovery.ts`). The writes are the shared engine's
 * (`useShotTracking.handleTagPuttMiss` and `handleTagRecovery`): the tag goes on the recorded shot through the hole's own
 * save, like an edit. This file only keeps what the session did (taps, skips) so the counter and the receipts are right.
 *
 * Both live in RoundTracking, not in ShotEntry: the entry is re-keyed on every shot, and the session's taps must survive it
 * and the move between holes. With nothing to ask (the flags are off, no open read) each returns null on every render, holds
 * no effects, and the screen is what it was.
 */

import { useCallback, useState } from 'react';
import type { PuttMissTag, ShotRecord } from '@/lib/types/golf';
import { askForShot, counterText, feetOf, holeGapFacts, isAskOpen, type DataGapAsk } from '@/lib/coachhelm/data-gap/asks';
import { isRecoveryCandidate } from '@/lib/golf/data-prompts/recovery';

/** CH-11960: the putt-miss ask after a missed first putt from a band a read is waiting on. */
export interface ChPuttPromptView {
  /** `${holeNumber}:${shotNumber}` of the putt being asked about. */
  key: string;
  shotNumber: number;
  /** The first putt's length in feet, for the caption; null when it wasn't recorded. */
  distanceFeet: number | null;
  ask: DataGapAsk;
  /** "4 of 10 for your 5–10 ft putt read". */
  counter: string;
  /** The tag this session just put on this putt (the receipt), or null while it asks. */
  saved: PuttMissTag | null;
  onPick: (tag: PuttMissTag) => void;
  onSkip: () => void;
}

/** CH-11961: the recovery tap after a tee shot into the rough or an 'other' lie. */
export interface ChRecoveryPromptView {
  /** `${holeNumber}:${shotNumber}` of the tee shot being asked about. */
  key: string;
  shotNumber: number;
  /** Where the tee shot finished, for the caption. */
  result: 'rough' | 'other';
  /** The answer given here (the receipt), or null while it asks. */
  saved: boolean | null;
  onPick: (recovery: boolean) => void;
  onSkip: () => void;
}

function gapFacts(history: readonly ShotRecord[]) {
  return holeGapFacts(history, (s) => ({
    shot_type: s.shotType,
    is_penalty: !!s.isPenalty,
    distance_feet: feetOf(s.distanceToHoleBefore, s.distanceUnitBefore),
    holed: s.result === 'hole',
    has_miss_direction: !!s.missDirection || (s.puttMissTags?.length ?? 0) > 0,
  }));
}

export function useChPuttPrompt({
  asks,
  holeNumber,
  shotHistory,
  onTag,
}: {
  asks: readonly DataGapAsk[] | undefined;
  holeNumber: number | undefined;
  shotHistory: readonly ShotRecord[];
  /** Puts the tag on the recorded putt through the shot screen's save path; true when it was applied. */
  onTag: (shotNumber: number, tag: PuttMissTag) => boolean;
}): ChPuttPromptView | null {
  // Putts tagged here (key → the read it counted for and the tag) and the taps per read, kept together so they move together.
  const [session, setSession] = useState<{ tapsByRead: Record<string, number>; tagged: Record<string, { readId: string; tag: PuttMissTag }> }>({ tapsByRead: {}, tagged: {} });
  // Putts skipped here (key → the read it was asked for). A skipped miss stays untagged, so it joins that read's population
  // and raises its target, exactly as an untagged stored miss does (`askTarget`).
  const [skipped, setSkipped] = useState<Record<string, string>>({});
  const record = useCallback((key: string, readId: string, tag: PuttMissTag) => {
    setSession((prev) => ({
      // A second tap on the same putt corrects it; it is not another tag.
      tapsByRead: prev.tagged[key] ? prev.tapsByRead : { ...prev.tapsByRead, [readId]: (prev.tapsByRead[readId] ?? 0) + 1 },
      tagged: { ...prev.tagged, [key]: { readId, tag } },
    }));
  }, []);

  if (!asks || asks.length === 0 || holeNumber === undefined) return null;
  const facts = gapFacts(shotHistory);
  const idx = facts.findIndex((f) => f.first_putt);
  if (idx === -1) return null;
  const first = facts[idx]!;
  const shot = shotHistory[idx]!;
  const key = `${holeNumber}:${shot.shotNumber}`;
  if (skipped[key]) return null;

  const skipsByRead: Record<string, number> = {};
  for (const readId of Object.values(skipped)) skipsByRead[readId] = (skipsByRead[readId] ?? 0) + 1;
  // A receipt only while the putt still carries the tag (an undo and a re-recorded putt asks again).
  const done = first.has_miss_direction ? session.tagged[key] : undefined;
  const ask = done ? (asks.find((a) => a.readId === done.readId) ?? null) : askForShot(asks, first, session.tapsByRead, skipsByRead);
  if (!ask) return null;
  const taps = session.tapsByRead[ask.readId] ?? 0;
  const skips = skipsByRead[ask.readId] ?? 0;
  // The receipt stays until the read has its tags; then the row goes.
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

export function useChRecoveryPrompt({
  enabled,
  holeNumber,
  shotHistory,
  onTag,
}: {
  enabled: boolean;
  holeNumber: number | undefined;
  shotHistory: readonly ShotRecord[];
  /** Puts the answer on the tee shot through the shot screen's save path; true when it was applied. */
  onTag: (shotNumber: number, recovery: boolean) => boolean;
}): ChRecoveryPromptView | null {
  // Tee shots answered or skipped here, by key.
  const [answered, setAnswered] = useState<Record<string, true>>({});
  const [skipped, setSkipped] = useState<Record<string, true>>({});
  const markAnswered = useCallback((key: string) => setAnswered((a) => (a[key] ? a : { ...a, [key]: true })), []);

  if (!enabled || holeNumber === undefined) return null;
  // Only while the tee shot is the last one recorded: the answer is about the shot the player is about to enter.
  const last = shotHistory[shotHistory.length - 1];
  if (!last || !isRecoveryCandidate(last)) return null;
  const key = `${holeNumber}:${last.shotNumber}`;
  if (skipped[key]) return null;
  const stored = typeof last.lieAfterRecovery === 'boolean' ? last.lieAfterRecovery : null;
  // An answer that came with the round (a resumed round) is not asked again; one given here stays as the receipt until the
  // next shot is recorded.
  if (stored !== null && !answered[key]) return null;

  return {
    key,
    shotNumber: last.shotNumber,
    result: last.result === 'other' ? 'other' : 'rough',
    saved: stored,
    onPick: (recovery) => {
      if (onTag(last.shotNumber, recovery)) markAnswered(key);
    },
    onSkip: () => setSkipped((s) => ({ ...s, [key]: true })),
  };
}
