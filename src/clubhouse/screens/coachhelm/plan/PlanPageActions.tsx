'use client';
import { Button } from '../../../ui/Button';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { recordPracticePlanOpen } from '@/app/golf/actions/practice-plans';
import { printPlan } from './PrintPlan';
import type { PlanSheetModel } from './sheet/plan-sheet-model';

/** Edit (a coach's), Print, and the one open a player's view records after paint. */
export function PlanPageActions({ plan, playerPlanId, editHref = null }: { plan: PlanSheetModel; playerPlanId: string | null; editHref?: string | null }) {
  useEffect(() => {
    if (playerPlanId) void recordPracticePlanOpen({ planId: playerPlanId });
  }, [playerPlanId]);
  const phone = useChPhone();
  const router = useRouter();
  const from = useSearchParams().get('from');
  return (
    <div className="ch-prc-planacts">
      {phone && <PhoneTop title="Practice plan" back={{ label: 'Practice', onBack: () => (from === 'coachhelm' ? router.push('/golf/dashboard/coachhelm/chat') : router.back()) }} />}
      {editHref && (
        <Button variant="secondary" href={editHref}>
          Edit
        </Button>
      )}
      <Button variant="secondary" onClick={() => void printPlan(plan)}>
        Print
      </Button>
      <Button variant="secondary" onClick={() => void printPlan(plan)}>
        Share PDF
      </Button>
    </div>
  );
}
