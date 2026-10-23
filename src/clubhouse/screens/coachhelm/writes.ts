'use client';

import { acceptFocusArea, createFocusAreaFromInsightV2, declineFocusArea } from '@/app/golf/actions/development';
import { dismissInsight, reactivateInsight } from '@/app/golf/actions/insights-feed';
import { recordCoachHelmCorrection } from '@/app/golf/actions/coachhelm-corrections';
import { refreshTeamAnalysisAsCoach } from '@/app/golf/actions/insights-coachhelm';
import type { CorrectionInput, CorrectionResult } from '@/lib/coachhelm/v3/corrections/input';
import { getCoursePlan, getMyCoursePlan, listCoursePlanCourses, listMyCoursePlanCourses, type CoursePlanCoursesResult, type CoursePlanResult, type MyCoursePlanResult } from '@/app/golf/actions/coachhelm-course-plan';
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
  /** The player's value now: the focus's starting point (CH13-22, owner: starting value only). */
  currentValue?: number | null;
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
 * The course plan's two reads (Slice 7c, `coachhelm_course_plan_v1`): the player's courses with three or more rounds, and
 * the plan for one of them. Read only. Preview and tests pass their own.
 */
export interface ChCoursePlanReads {
  courses(playerId: string): Promise<CoursePlanCoursesResult>;
  plan(playerId: string, courseId: string): Promise<CoursePlanResult>;
}

export const LIVE_COURSE_PLAN_READS: ChCoursePlanReads = {
  courses: (playerId) => listCoursePlanCourses(playerId),
  plan: (playerId, courseId) => getCoursePlan(playerId, courseId),
};

/**
 * The player's own course plan (chs-21): the same two reads for the signed-in player. They take no player id: the server
 * reads the session's own player, so the page can never ask for someone else's. Preview and tests pass their own.
 */
export interface ChMyCoursePlanReads {
  courses(): Promise<CoursePlanCoursesResult>;
  plan(courseId: string): Promise<MyCoursePlanResult>;
}

export const LIVE_MY_COURSE_PLAN_READS: ChMyCoursePlanReads = {
  courses: () => listMyCoursePlanCourses(),
  plan: (courseId) => getMyCoursePlan(courseId),
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
 * Re-check reads on the coach's board: the action Fairway's Triage desk "Scan team" calls, unchanged. It takes no team or
 * player id: the action resolves the coach and their team from the session itself, checks the coach, and spends the
 * engine's rate limit once for the batch. Preview and tests pass their own.
 */
export interface ChRecheckWrites {
  recheck(): Promise<ChRecheckResult>;
}

export const LIVE_RECHECK_WRITES: ChRecheckWrites = {
  recheck: () => refreshTeamAnalysisAsCoach(),
};
