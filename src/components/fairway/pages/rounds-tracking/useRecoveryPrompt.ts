'use client';

/**
 * The recovery tap's state (CoachHelm Slice 8b). Lives in the shot screen's
 * parent (FairwayShotTracking), beside the putt prompt's.
 *
 * Disabled (the flag is off) it returns null on every render and holds no
 * effects: the screen is what it was.
 */

import { useCallback, useState } from 'react';
import type { ShotRecord } from '@/lib/types/golf';
import { isRecoveryCandidate } from '@/lib/golf/data-prompts/recovery';

export interface RecoveryPromptView {
  /** `${holeNumber}:${shotNumber}` of the tee shot being asked about. */
  key: string;
  shotNumber: number;
  /** Where the tee shot finished, for the caption. */
  result: 'rough' | 'other';
  /** The answer on the shot, once given here. */
  saved: boolean | null;
  onPick: (recovery: boolean) => void;
  onSkip: () => void;
}

export function useRecoveryPrompt({
  enabled,
  holeNumber,
  shotHistory,
  onTag,
}: {
  enabled: boolean;
  holeNumber: number | undefined;
  shotHistory: readonly ShotRecord[];
  /** Writes the answer through the shot screen's save path; true when applied. */
  onTag: (shotNumber: number, recovery: boolean) => boolean;
}): RecoveryPromptView | null {
  // Tee shots answered or skipped here this session, by key.
  const [answered, setAnswered] = useState<Record<string, true>>({});
  const [skipped, setSkipped] = useState<Record<string, true>>({});
  const markAnswered = useCallback((key: string) => setAnswered((a) => (a[key] ? a : { ...a, [key]: true })), []);

  if (!enabled || holeNumber === undefined) return null;
  // Only while the tee shot is the last one recorded: the answer is the shot
  // the player is about to enter.
  const last = shotHistory[shotHistory.length - 1];
  if (!last || !isRecoveryCandidate(last)) return null;
  const key = `${holeNumber}:${last.shotNumber}`;
  if (skipped[key]) return null;
  const stored = typeof last.lieAfterRecovery === 'boolean' ? last.lieAfterRecovery : null;
  // An answer that came with the round (a resumed round) is not asked again;
  // one given here stays as the receipt until the next shot is recorded.
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
