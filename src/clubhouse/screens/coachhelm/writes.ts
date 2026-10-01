'use client';

import { acceptFocusArea, createFocusAreaFromInsightV2, declineFocusArea } from '@/app/golf/actions/development';
import { dismissInsight, reactivateInsight } from '@/app/golf/actions/insights';
import type { ChHelmLifecycle } from '../../data/coachhelm-shape';
import type { ServerResult } from '../../lib/use-action';

export interface ChAssignArgs {
  playerId: string;
  insightId: string;
  title: string;
  description: string;
  areaType: string;
  /** The insight's own metric, so the duplicate-active-focus guard can see it. */
  targetMetric: string;
}

/**
 * Every CoachHelm write, as the coach's board calls it. The live set is the
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
  undo: (insightId, lifecycle) => reactivateInsight(insightId, lifecycle),
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
