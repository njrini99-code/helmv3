'use client';
import { Button } from '../../../ui/Button';

import { Printer } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { LargeTitle } from '../../../ui/LargeTitle';
import { PhoneIconAction } from '../../../ui/PhoneBar';
import { BackLink } from '../../../ui/Section';
import { recordPracticePlanOpen } from '@/app/golf/actions/practice-plans';
import { useToast } from '../../../ui/Toast';
import { printPlan, sharePlanPdf } from './PrintPlan';
import type { PlanSheetModel } from './sheet/plan-sheet-model';

const cap = (word: string) => (word ? word[0]! + word.slice(1).toLowerCase() : '');

/** "Thu, Nov 5 · 2:00 to 5:00 PM · Lakeside Golf Club", from what the sheet prints. A plan with no practice picked has no day, and says none. */
export function planWhenLine(plan: PlanSheetModel): string {
  const value = (label: string) => plan.meta.find((m) => m.label === label)?.value ?? '';
  const day = plan.dayWord ? `${cap(plan.dayWord)}, ${cap(plan.monthWord)} ${plan.dayNum}` : '';
  return [day, value('Time'), value('Place')].filter((part) => part && part !== '—').join(' · ');
}

/**
 * The plan page's head, as every pushed Practice page has one: back to Practice, the plan's name as the title with its day under it, and Print.
 * A coach's keys are their own bar under it (status, Seen by, Edit, Share); a player's are Print and Share PDF. A player's view records its one open after paint.
 * `inPage`: the sheet's keys inside another page (a player's Practice, "Your sheet"), which has its own title: the phone's bar and the two keys, no head.
 */
export function PlanPageActions({ plan, playerPlanId, editHref = null, coachBar = null, printHref = null, inPage = false }: { plan: PlanSheetModel; playerPlanId: string | null; editHref?: string | null; coachBar?: ReactNode; printHref?: string | null; inPage?: boolean }) {
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
  const back = () => (from === 'coachhelm' ? router.push('/golf/dashboard/coachhelm/chat') : router.back());
  // A coach prints from the studio, where the pieces are chosen; a player prints the sheet they are reading.
  const print = () => (printHref ? router.push(printHref) : void printPlan(plan));
  const when = planWhenLine(plan);
  if (inPage) {
    return (
      <div className="ch-prc-planacts">
        {phone && <PhoneTop title="Practice plan" back={{ label: 'Practice', onBack: back }} />}
        <Button onClick={print}>Print</Button>
        <Button busy={sharing} onClick={() => void sharePdf()}>
          Share PDF
        </Button>
      </div>
    );
  }
  return (
    <>
      {phone ? (
        <PhoneTop title={plan.title} back={{ label: 'Practice', onBack: back }} action={<PhoneIconAction icon={Printer} label="Print" onClick={print} />} />
      ) : (
        <>
          <BackLink onClick={back}>Practice</BackLink>
          <header className="ch-prc-h ch-prc-planhead">
            <div>
              <LargeTitle id="ch-prc-plan-title">{plan.title}</LargeTitle>
              {when && <p className="ch-prc-h__line ch-num">{when}</p>}
            </div>
            <div className="ch-prc-h__a">
              {editHref && <Button href={editHref}>Edit</Button>}
              {!coachBar && (
                <Button busy={sharing} onClick={() => void sharePdf()}>
                  Share PDF
                </Button>
              )}
              {!coachBar && (
                <Button leftIcon={Printer} onClick={print}>
                  Print
                </Button>
              )}
            </div>
          </header>
        </>
      )}
      {coachBar}
      {phone && !coachBar && (
        <div className="ch-prc-planacts">
          {editHref && (
            <Button className="is-fill" href={editHref}>
              Edit
            </Button>
          )}
          <Button className="is-fill" busy={sharing} onClick={() => void sharePdf()}>
            Share PDF
          </Button>
        </div>
      )}
    </>
  );
}
