'use client';

import { PracticePlanSheet } from '../screens/coachhelm/plan/sheet/PracticePlanSheet';
import { PlanPageActions } from '../screens/coachhelm/plan/PlanPageActions';
import { CoachPlanBar } from '../screens/practice/CoachPlanBar';
import { PlanCard } from '../screens/coachhelm/plan/PlanCard';
import { toSheetModel } from '../screens/coachhelm/plan/sheet/plan-sheet-model';
import { longDrills, rewriteDeep } from './stress';
import { PP_NAMES, PP_PLAN_PART, PP_COACHES } from './fixtures-practice-plan';

/** `?state=card` draws the card in Ask; anything else the plan page at `?copy=coach|player`. */
export function PreviewPracticePlan({ state, copy }: { state?: string; copy: 'coach' | 'player' }) {
  if (state === 'stress') return <PlanCard plan={rewriteDeep(PP_PLAN_PART, longDrills)} onSend={() => {}} />;
  if (state === 'card') return <PlanCard plan={PP_PLAN_PART} onSend={() => {}} />;
  const start = new Date('2026-11-05T19:00:00Z');
  const end = new Date('2026-11-05T22:00:00Z');
  const plan = toSheetModel({ body: PP_PLAN_PART.draft.body, why: PP_PLAN_PART.draft.why, title: PP_PLAN_PART.title, team: 'Demo University Golf', start, end, zone: 'America/New_York', coaches: PP_COACHES, names: PP_NAMES, state: 'Draft · Only coaches' }, copy);
  // The plan page as its route draws it (routes/practice.tsx): the head, a coach's status line and keys, then the sheet.
  return (
    <main className="ch-page ch-prc-planpage" data-ch="practice-plan" aria-labelledby="ch-prc-plan-title">
      <PlanPageActions
        plan={plan}
        playerPlanId={null}
        printHref={copy === 'coach' ? '/clubhouse-preview/coachhelm-practice-print' : null}
        coachBar={copy === 'coach' ? <CoachPlanBar status={{ planId: 'preview', title: plan.title, version: 1, status: 'draft', edited: false, seen: null }} /> : null}
      />
      <PracticePlanSheet plan={plan} />
    </main>
  );
}
