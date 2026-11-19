'use client';

import { acceptFocusArea, createFocusAreaFromInsightV2, declineFocusArea } from '@/app/golf/actions/development';
import { dismissInsight, reactivateInsight } from '@/app/golf/actions/insights-feed';
import { recordCoachHelmCorrection } from '@/app/golf/actions/coachhelm-corrections';
import { refreshTeamAnalysisAsCoach } from '@/app/golf/actions/insights-coachhelm';
import { markCoachHelmRead, setFocusFromCoachHelmRead } from '@/app/golf/actions/coachhelm-reads';
import type { CorrectionInput, CorrectionResult } from '@/lib/coachhelm/v3/corrections/input';
import type { ChHelmLifecycle } from '../../data/coachhelm-shape';
import type { ServerResult } from '../../lib/use-action';

interface ChAssignArgs {
  playerId: string;
  insightId: string;
  title: string;
  description: string;
  areaType: string;
  /** The insight's own metric, so the duplicate-active-focus guard can see it. */
  targetMetric: string;
  /** The player's value now: the focus's starting point (CH13-22, owner: starting value only). */
  currentValue?: number | null;
}

/**
 * Every CoachHelm write, as the coach's pages call it. The live set is the
 * actions the Fairway Brief uses, unchanged (one write path per behaviour):
 * a focus area from an insight (a proposal the player accepts), and the
 * dismiss with its true reverse. Preview and tests pass their own set.
 */
export interface ChCoachHelmWrites {
  assign(a: ChAssignArgs): Promise<ServerResult>;
  dismiss(insightId: string): Promise<ServerResult>;
  undo(insightId: string, lifecycle: ChHelmLifecycle): Promise<ServerResult>;
}

export const LIVE_COACHHELM_WRITES: ChCoachHelmWrites = {
  assign: (a) => createFocusAreaFromInsightV2(a),
  dismiss: (insightId) => dismissInsight(insightId),
  // Back to the state it had, so it returns to the feed where it was.
  undo: (insightId, lifecycle) => reactivateInsight(insightId, lifecycle, 'dismiss'),
};

/**
 * The player's answer to a focus area a coach proposed (Q-77), the same two actions Stats Development's Accept and Decline
 * call. Each acts only on the player's own `proposed` row (RLS and a status guard), so a stale answer is refused, not applied twice.
 */
export interface ChPlayerWrites {
  accept(focusAreaId: string): Promise<ServerResult>;
  decline(focusAreaId: string): Promise<ServerResult>;
}

export const LIVE_PLAYER_WRITES: ChPlayerWrites = {
  accept: (id) => acceptFocusArea(id),
  decline: (id) => declineFocusArea(id),
};

/**
 * A correction on a read (03 §7.2, flag `coachhelm_corrections_v1`): the one action that records it. Append-only, so there is no
 * reverse write; the newest answer by one author on one read is the one that counts. Preview and tests pass their own.
 */
export interface ChCorrectionWrites {
  record(input: CorrectionInput): Promise<CorrectionResult>;
}

export const LIVE_CORRECTION_WRITES: ChCorrectionWrites = {
  record: (input) => recordCoachHelmCorrection(input),
};

/** What a team re-check answers: how many players it read, the reads it wrote, and who it skipped or could not finish. */
export type ChRecheckResult = Awaited<ReturnType<typeof refreshTeamAnalysisAsCoach>>;

/**
 * Re-check reads on the coach's Team page: the action Fairway's Triage desk "Scan team" calls, unchanged. It takes no team or
 * player id: the action resolves the coach and their team from the session itself, checks the coach, and spends the
 * engine's rate limit once for the batch. Preview and tests pass their own.
 */
export interface ChRecheckWrites {
  recheck(): Promise<ChRecheckResult>;
}

export const LIVE_RECHECK_WRITES: ChRecheckWrites = {
  recheck: () => refreshTeamAnalysisAsCoach(),
};

/**
 * A coach's three actions on CoachHelm's read of one player (flag `coachhelm_reads_v1`): Set focus from this card, Not useful,
 * Wrong with a reason. Each sends the player, the card the coach saw and an id the page made once per tap (a Retry sends the same
 * id, so nothing is written twice); the server takes the team, the coach and every number from the session and the saved read.
 */
export interface ChAnalystReadWrites {
  focus(a: { id: string; playerId: string; cardKey: string }): Promise<ServerResult<{ setOn: string; since: string; word: string }>>;
  mark(a: { id: string; playerId: string; cardKey: string; verdict: 'not_useful' | 'wrong'; reason?: string | null }): Promise<ServerResult<{ verdict: 'not_useful' | 'wrong'; reason: string }>>;
}

export const LIVE_ANALYST_READ_WRITES: ChAnalystReadWrites = {
  focus: (a) => setFocusFromCoachHelmRead(a),
  mark: (a) => markCoachHelmRead(a),
};
