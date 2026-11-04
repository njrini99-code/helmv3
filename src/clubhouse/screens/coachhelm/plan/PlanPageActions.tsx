'use client';

import { useEffect } from 'react';
import { recordPracticePlanOpen } from '@/app/golf/actions/practice-plans';
import { printPlan } from './PrintPlan';
import type { PlanSheetModel } from './sheet/plan-sheet-model';

/** Print, and the one open a player's view records after paint. */
export function PlanPageActions({ plan, playerPlanId }: { plan: PlanSheetModel; playerPlanId: string | null }) {
  useEffect(() => {
    if (playerPlanId) void recordPracticePlanOpen({ planId: playerPlanId });
  }, [playerPlanId]);
  return (
    <button type="button" className="ch-btn ch-btn--secondary" onClick={() => void printPlan(plan)}>
      Print
    </button>
  );
}
