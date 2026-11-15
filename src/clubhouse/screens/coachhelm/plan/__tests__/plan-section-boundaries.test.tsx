import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GAP-S-10, the plan folder: a part of a practice plan's page that crashes while drawing fails on its own (CH-13204),
 * with its notice and Try again, and the rest of the page stays. The coach's page: the bar (status, Seen by, the live
 * run) and the sheet. The player's page: Your stops and Your sheet, each under the head, the switch and Documents.
 */
const crash = vi.hoisted(() => ({ sheet: false, bar: false, view: null as string | null }));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(crash.view ? `view=${crash.view}` : ''),
}));
vi.mock('../../../../lib/track', async (importOriginal) => ({ ...(await importOriginal<object>()), chReport: vi.fn() }));
vi.mock('@/app/golf/actions/practice-plans', () => ({ recordPracticePlanOpen: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => ({ role: 'coach', player: null }) }));
vi.mock('../../../../routes/team', () => ({ resolveClubhouseTeam: async () => ({ teamId: 't-1', role: 'coach', playerId: null }) }));
vi.mock('../../../../data/practice-plan', () => ({
  loadCoachPlan: async () => ({ status: 'ready', plan: { title: 'Thursday practice' }, formatFailed: false, coach: { status: { status: 'draft' }, start: null } }),
  loadPlayerPlan: vi.fn(),
  loadPlayerPractice: vi.fn(),
  loadPlanDrills: vi.fn(),
}));
vi.mock('../../../../data/practice-home', () => ({ loadCoachPracticeHome: vi.fn(), loadPlayerPracticeHome: vi.fn(), loadPlanForBuilder: vi.fn() }));
vi.mock('../../../../data/practice-library', () => ({ loadDrill: vi.fn(), loadDrills: vi.fn(), loadGroups: vi.fn(), loadTemplates: vi.fn() }));
// The page's head stands in for the real one: the title, and the coach's bar where the real head draws it.
vi.mock('../PlanPageActions', () => ({
  PlanPageActions: ({ coachBar }: { coachBar?: ReactNode }) => (
    <header>
      <h1 id="ch-prc-plan-title">Thursday practice</h1>
      {coachBar}
    </header>
  ),
}));
vi.mock('../sheet/PracticePlanSheet', () => ({
  PracticePlanSheet: () => {
    if (crash.sheet) throw new Error('sheet broke');
    return <article>Warm-up · Range</article>;
  },
}));
vi.mock('../../../practice/CoachPlanBar', () => ({
  CoachPlanBar: () => {
    if (crash.bar) throw new Error('bar broke');
    return <div>Draft · Edit · Share</div>;
  },
}));

const { PracticePlanRoute } = await import('../../../../routes/practice');
const { PlayerPractice } = await import('../player/PlayerPractice');

const PLAN = '00000000-0000-4000-8000-000000000001';
const quiet = vi.spyOn(console, 'error');
beforeEach(() => quiet.mockImplementation(() => {}));
afterEach(() => {
  crash.sheet = false;
  crash.bar = false;
  crash.view = null;
  quiet.mockReset();
});

const notice = (c: HTMLElement) => c.querySelector('[data-ch-code="CH-13204"]');

describe('the coach’s plan page fails a part at a time (GAP-S-10)', () => {
  it('draws the head, the bar and the sheet when nothing crashes', async () => {
    const { container } = render((await PracticePlanRoute({ planId: PLAN })) as ReactElement);
    expect(screen.getByText('Draft · Edit · Share')).toBeTruthy();
    expect(screen.getByText('Warm-up · Range')).toBeTruthy();
    expect(notice(container)).toBeNull();
  });

  it('keeps the head and the bar when the sheet crashes, and names it', async () => {
    crash.sheet = true;
    const { container } = render((await PracticePlanRoute({ planId: PLAN })) as ReactElement);
    expect(notice(container)!.textContent).toContain('The plan couldn’t be shown');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Thursday practice' })).toBeTruthy();
    expect(screen.getByText('Draft · Edit · Share')).toBeTruthy();
  });

  it('keeps the sheet when the bar crashes', async () => {
    crash.bar = true;
    const { container } = render((await PracticePlanRoute({ planId: PLAN })) as ReactElement);
    expect(notice(container)!.textContent).toContain('Status and sharing couldn’t be shown');
    expect(screen.getByText('Warm-up · Range')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Thursday practice' })).toBeTruthy();
  });
});

const DATA = {
  context: 'Thursday · Lakeside',
  title: 'Thursday practice',
  when: 'Thu 2:00 PM',
  focus: '',
  group: null,
  stops: [{ time: '2:00', place: 'Range', line: 'Warm-up', startsAt: null, endsAt: null, now: false, next: false }],
  documents: { label: 'Thursday practice.pdf', href: '/golf/dashboard/team?tab=documents' },
  planHref: null,
};
function Broken(): ReactElement {
  throw new Error('everyone broke');
}

describe('the player’s plan page fails a view at a time (GAP-S-10)', () => {
  it('keeps the head, the switch and Documents when Your sheet crashes', async () => {
    const { container } = render(<PlayerPractice data={DATA as never} everyone={<Broken />} />);
    expect(screen.getByText('Range')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Your sheet' }));
    expect(notice(container)!.textContent).toContain('Your sheet couldn’t be shown');
    expect(screen.getByText('Thursday practice')).toBeTruthy();
    expect(screen.getByText('In Documents')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Your practice' })).toBeTruthy();
  });
});
