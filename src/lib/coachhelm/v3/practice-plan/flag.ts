import { isFlagEnabled } from '@/lib/flags/is-enabled';

export const PRACTICE_PLANS_FLAG = 'coachhelm_practice_plans_v1';
export const PRACTICE_TAB_FLAG = 'golf_practice_plans';

/** CoachHelm drafts, saves and publishes plans. Off: Ask has no plan tools. */
export function isPracticePlansEnabled(): boolean {
  return isFlagEnabled(PRACTICE_PLANS_FLAG);
}

/** The plan pages and the save and publish RPC callers. Settled: two flags with two jobs (DECISIONS "Practice Builder"). */
export function isPracticeTabEnabled(): boolean {
  return isFlagEnabled(PRACTICE_TAB_FLAG);
}
