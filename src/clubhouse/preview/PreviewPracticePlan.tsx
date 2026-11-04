'use client';

import { PracticePlanSheet } from '../screens/coachhelm/plan/sheet/PracticePlanSheet';
import { PlanCard } from '../screens/coachhelm/plan/PlanCard';
import { toSheetModel } from '../screens/coachhelm/plan/sheet/plan-sheet-model';
import { PP_NAMES, PP_PLAN_PART, PP_COACHES } from './fixtures-practice-plan';

/** `?state=card` draws the card in Ask; anything else the printed sheet at `?copy=coach|player`. */
export function PreviewPracticePlan({ state, copy }: { state?: string; copy: 'coach' | 'player' }) {
  if (state === 'card') return <PlanCard plan={PP_PLAN_PART} onSend={() => {}} />;
  const start = new Date('2026-11-05T19:00:00Z');
  const end = new Date('2026-11-05T22:00:00Z');
  return <PracticePlanSheet plan={toSheetModel({ body: PP_PLAN_PART.draft.body, why: PP_PLAN_PART.draft.why, title: PP_PLAN_PART.title, team: 'Demo University Golf', start, end, zone: 'America/New_York', coaches: PP_COACHES, names: PP_NAMES, state: 'Draft · Only coaches' }, copy)} />;
}
