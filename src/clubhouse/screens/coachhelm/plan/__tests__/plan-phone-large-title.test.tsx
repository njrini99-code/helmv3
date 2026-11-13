import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// G14 (preview grade): on a phone the plan page's bar held its name alone, cut ("Short game and pre…"). The page now
// opens on its large title, whole, as the page's one h1; the bar's title is plain text and waits under it.
vi.mock('@/app/golf/actions/practice-plans', () => ({ recordPracticePlanOpen: vi.fn() }));
vi.mock('../PrintPlan', () => ({ printPlan: vi.fn(), sharePlanPdf: vi.fn() }));
vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => true, CH_PHONE_QUERY: '(max-width: 820px)' }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/practice/plan/x' }));
const bar = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('../../../../shell/phone-chrome', () => ({ PhoneTop: (p: Record<string, unknown>) => ((bar.props = p), null) }));

import { ToastProvider } from '../../../../ui/Toast';
import { PlanPageActions } from '../PlanPageActions';
import { toSheetModel } from '../sheet/plan-sheet-model';
import { PP_COACHES, PP_NAMES, PP_PLAN_PART } from '../../../../preview/fixtures-practice-plan';

afterEach(cleanup);

// The plan as the preview builds it (preview/PreviewPracticePlan.tsx).
const plan = toSheetModel(
  { body: PP_PLAN_PART.draft.body, why: PP_PLAN_PART.draft.why, title: PP_PLAN_PART.title, team: 'Demo University Golf', start: new Date('2026-11-05T19:00:00Z'), end: new Date('2026-11-05T22:00:00Z'), zone: 'America/New_York', coaches: PP_COACHES, names: PP_NAMES, state: 'Draft · Only coaches' },
  'coach',
);

describe('G14 the plan page names itself whole on a phone', () => {
  it('draws the large title as the h1 with the plan page id, and the bar title as plain text', () => {
    const { container } = render(
      <ToastProvider>
        <PlanPageActions plan={plan} playerPlanId={null} coachBar={<div />} />
      </ToastProvider>,
    );
    const h1 = container.querySelector('h1.ch-large-title')!;
    expect(h1.textContent).toBe('Short game and pressure');
    expect(h1.id).toBe('ch-prc-plan-title');
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(bar.props?.heading).toBe(false);
    expect(bar.props?.title).toBe('Short game and pressure');
  });
});
