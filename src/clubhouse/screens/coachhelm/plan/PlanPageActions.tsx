'use client';
import { Button } from '../../../ui/Button';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { recordPracticePlanOpen } from '@/app/golf/actions/practice-plans';
import { useToast } from '../../../ui/Toast';
import { printPlan, sharePlanPdf } from './PrintPlan';
import type { PlanSheetModel } from './sheet/plan-sheet-model';

/** Edit (a coach's), Print, and the one open a player's view records after paint. */
export function PlanPageActions({ plan, playerPlanId, editHref = null, coachBar = null }: { plan: PlanSheetModel; playerPlanId: string | null; editHref?: string | null; coachBar?: ReactNode }) {
  useEffect(() => {
    if (playerPlanId) void recordPracticePlanOpen({ planId: playerPlanId });
  }, [playerPlanId]);
  const phone = useChPhone();
  const router = useRouter();
  const toast = useToast();
  const [sharing, setSharing] = useState(false);
  const sharePdf = async () => {
    setSharing(true);
    const ok = await sharePlanPdf(plan);
    setSharing(false);
    if (!ok) toast({ tone: 'error', title: 'Couldn’t make the PDF', body: 'Print can still save one.' });
  };
  const from = useSearchParams().get('from');
  const top = phone && <PhoneTop title="Practice plan" back={{ label: 'Practice', onBack: () => (from === 'coachhelm' ? router.push('/golf/dashboard/coachhelm/chat') : router.back()) }} />;
  // A coach's keys are their own bar (Share, Seen by, Take down); a player's are Print and Share PDF.
  if (coachBar) {
    return (
      <>
        {top}
        {coachBar}
      </>
    );
  }
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
      <Button variant="secondary" busy={sharing} onClick={() => void sharePdf()}>
        Share PDF
      </Button>
    </div>
  );
}
