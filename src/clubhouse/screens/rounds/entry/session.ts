import type { HoleStats, RoundHole, ShotRecord } from '@/lib/types/golf';
import type { EmergencySaveData } from '@/lib/utils/emergency-save';
import { roundType, teeColorFor } from '../../../data/rounds-shape';
import type { ChCardHole, ChSummaryHole } from '../track/round-sheets';
import type { ChTrackingRound } from '../track/RoundTracking';
import type { RoundNotices } from './ports';

/*
 * What the round screen needs from an engine, in one shape. The new-round and continue engines return different
 * things under different names (`step` and `submitting`, `newRoundRecoveryData` and `recoveryData`, an error thrown
 * and an error toasted), so each screen maps its engine into a `ChRoundSession`, and `RoundRuntime` (tracking, the
 * exit and finish sheets, the banners, the submit) is written once over this. Every function is read at call time
 * from the latest session, never from the render that built a handler.
 */

/** A device copy of the round found on opening, the recovery dialog's subject. */
export interface ChRecovery {
  open: boolean;
  data: EmergencySaveData | null;
  /** The engine is writing the copy to the server (the new-round engine; the continue engine restores at once). */
  restoring: boolean;
}

export interface ChRoundSession {
  round: ChTrackingRound;
  /** "Finley GC · Blue · Oct 14": the finished round's heading. */
  heading: string;

  holes: RoundHole[];
  currentHoleIndex: number;
  setCurrentHoleIndex: (index: number) => void;
  completedHoleStats: ReadonlyArray<HoleStats | undefined | null>;
  activeHoleShots: ShotRecord[];
  activeShotNumber: number;
  onHoleComplete: (holeIndex: number, stats: HoleStats) => Promise<boolean>;
  onHoleStatsUpdate: (holeIndex: number, stats: HoleStats | null) => void;
  onSaveShot: (shot: ShotRecord) => boolean | void;
  onAutoSave: (shots: ShotRecord[], holeIndex: number) => Promise<void>;
  autoSaveDisabled: boolean;

  /** The engine's one error sentence (it is shared by every step; `setError('')` clears it). */
  error: string;
  setError: (message: string) => void;
  /** The round changed on another device, and every write from here is refused until a reload. */
  roundConflictBlocked: boolean;
  /** Offline by the engine's own reading (the connection probe as well as `navigator.onLine`). */
  offline: () => boolean;

  /** The engine's own Exit flag (the back button opens the sheet through it). */
  engineExitOpen: boolean;
  setEngineExitOpen: (open: boolean) => void;
  saveForLater: () => Promise<unknown>;
  deleteRound: () => Promise<unknown>;

  pendingFinalStats: HoleStats[] | null;
  showFinishConfirm: boolean;
  setShowFinishConfirm: (open: boolean) => void;
  submit: (stats: HoleStats[]) => Promise<unknown>;
  submitting: boolean;
  completedRoundId: string | null;
  qualifierClosed: boolean;
  submitRetry: () => void;
  submitGoBack: () => void;
  /** The submit overlay's Save & exit and Discard: each clears the submit flag first, then does what Exit's do. */
  submitSaveAndExit: () => Promise<unknown>;
  submitDiscard: () => Promise<unknown>;
  saveAsPractice: () => Promise<unknown>;

  recovery: ChRecovery;
  restoreRecovery: () => Promise<unknown> | void;
  /**
   * Bumped when a device copy is restored in place (the continue engine). The tracker re-reads its shots only when
   * the hole changes, so it is keyed by this to pick up restored shots on the same hole.
   */
  restoreEpoch?: number;
  discardRecovery: () => void;
  closeRecovery: () => void;
}

/** "Oct 14" for a date-only string, or null when it isn't one. */
export function monthDay(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The round the top bar names, from the engine's setup. */
export function trackingRound(setup: { courseName: string; teesPlayed: string; roundType: string }): ChTrackingRound {
  const tees = setup.teesPlayed.trim();
  return { course: setup.courseName.trim() || 'Your round', teeLabel: tees || null, teeColor: teeColorFor(tees || null), type: roundType(setup.roundType) };
}

/** "Finley GC · Blue · Oct 14". */
export function roundHeading(setup: { courseName: string; teesPlayed: string; roundDate: string }): string {
  return [setup.courseName.trim(), setup.teesPlayed.trim(), monthDay(setup.roundDate)].filter(Boolean).join(' · ');
}

/** The scorecard's holes: each hole's score once it is holed, and its putts from the saved stats. */
export function cardHoles(holes: RoundHole[], stats: ReadonlyArray<HoleStats | undefined | null>): ChCardHole[] {
  return holes.map((h, i) => ({ number: h.number, par: h.par, score: h.score, putts: stats[i]?.putts ?? null }));
}

/** The finished round's holes, for the Round complete sheet. */
export function summaryHoles(holes: RoundHole[], finalStats: ReadonlyArray<HoleStats | undefined | null>): ChSummaryHole[] {
  return holes.map((h, i) => {
    const s = finalStats[i];
    return { number: h.number, par: h.par, score: s?.score ?? h.score, putts: s?.putts ?? null, fairwayHit: s?.fairwayHit ?? null, gir: s?.greenInRegulation ?? false };
  });
}

/** What the recovery dialog says about a device copy. */
export function recoveryFacts(data: EmergencySaveData | null) {
  const holesTotal = data?.holes.length === 9 || data?.holes.length === 18 ? data.holes.length : null;
  return {
    course: data?.setupData.courseName?.trim() || null,
    tees: data?.setupData.teesPlayed?.trim() || null,
    type: data?.setupData.roundType ?? null,
    holesDone: data?.completedHoleStats.filter((h) => h != null).length ?? 0,
    holesTotal,
    savedAt: data?.timestamp ?? null,
  };
}

/**
 * The reason a thrown failure gives, or undefined when there is none worth saying. A dropped connection throws a
 * bare "Failed to fetch"; the toast says what to do next instead.
 */
export function thrownReason(thrown: unknown): string | undefined {
  if (!(thrown instanceof Error)) return undefined;
  const message = thrown.message.trim();
  if (!message || thrown instanceof TypeError || /failed to fetch|load failed|network ?error/i.test(message)) return undefined;
  return message;
}

/**
 * How an engine action ended, from what it returned, threw and told the player while it ran (`capture`). Failed is a
 * throw or an error the engine raised; `reason` is its sentence when it gave a readable one. `conflict` means the
 * round changed on another device, which the reload toast (CH-11902) already says.
 */
export function outcomeOf(run: { thrown?: unknown; notices: RoundNotices }): { failed: boolean; conflict: boolean; reason?: string } {
  const thrown = 'thrown' in run && run.thrown !== undefined;
  return { failed: thrown || run.notices.errors.length > 0, conflict: run.notices.conflict, reason: run.notices.errors[0] ?? (thrown ? thrownReason(run.thrown) : undefined) };
}
