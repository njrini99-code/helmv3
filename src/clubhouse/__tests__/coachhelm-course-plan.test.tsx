import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Course plan on the coach's board (Slice 7c, coachhelm_course_plan_v1): offered only when the loader says so, read on request. */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => '/golf/dashboard/coachhelm' }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusAreaFromInsightV2: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-course-plan', () => ({ listCoursePlanCourses: vi.fn(), getCoursePlan: vi.fn() }));

import { CoachBoard } from '../screens/coachhelm/CoachBoard';
import { CoursePlan } from '../screens/coachhelm/CoursePlan';
import { takePrefill } from '../screens/messages/prefill';
import type { ChCoachHelmWrites, ChCoursePlanReads } from '../screens/coachhelm/writes';
import { PREVIEW_HELM_COACH } from '../preview/fixtures-coachhelm';
import { PREVIEW_COURSES, PREVIEW_PLANS } from '../preview/fixtures-course-plan';
import { ToastProvider } from '../ui/Toast';

const writes: ChCoachHelmWrites = { assign: vi.fn(), dismiss: vi.fn(), undo: vi.fn() };
const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);

function reads(over: Partial<ChCoursePlanReads> = {}): ChCoursePlanReads {
  return {
    courses: vi.fn(async () => ({ status: 'ok' as const, courses: PREVIEW_COURSES })),
    plan: vi.fn(async (_p: string, id: string) => ({ status: 'ok' as const, plan: PREVIEW_PLANS[id as keyof typeof PREVIEW_PLANS] })),
    ...over,
  };
}

afterEach(cleanup);

describe('course plan on the coach board', () => {
  it('is not offered when the loader does not turn it on', () => {
    const r = reads();
    render(wrap(<CoachBoard data={PREVIEW_HELM_COACH} writes={writes} coursePlanReads={r} />));
    expect(screen.queryByRole('heading', { name: 'Course plan' })).toBeNull();
    expect(r.courses).not.toHaveBeenCalled();
  });

  it('reads nothing until the coach asks, then lists courses and draws the plan with the thin line', async () => {
    const r = reads();
    render(wrap(<CoachBoard data={{ ...PREVIEW_HELM_COACH, coursePlan: true }} writes={writes} coursePlanReads={r} />));
    expect(r.courses).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Course plan' }));
    await userEvent.click(await screen.findByRole('button', { name: /Pine Hollow/ }));
    expect(r.plan).toHaveBeenCalledWith(expect.any(String), 'c-pine');
    expect(await screen.findByRole('heading', { name: 'Course plan: Pine Hollow · from 3 rounds here' })).toBeTruthy();
    expect(screen.getByText('3 rounds is a thin history; treat this as a reminder, not a read.')).toBeTruthy();
    expect(screen.getByText(/^Holes 4 and 11: /)).toBeTruthy();
    expect(screen.getByText(/^4 and 11: aim at the left half off the tee\./)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\b(3-wood|wood|hybrid|one more club)\b/i);
  });

  it('draws no thin line from six rounds', async () => {
    render(wrap(<CoachBoard data={{ ...PREVIEW_HELM_COACH, coursePlan: true }} writes={writes} coursePlanReads={reads()} />));
    await userEvent.click(screen.getByRole('button', { name: 'Course plan' }));
    await userEvent.click(await screen.findByRole('button', { name: /Cedar Ridge/ }));
    await screen.findByRole('heading', { name: 'Course plan: Cedar Ridge · from 7 rounds here' });
    expect(screen.queryByText(/thin history/)).toBeNull();
  });

  it('says when the player has no course with three rounds', async () => {
    render(wrap(<CoachBoard data={{ ...PREVIEW_HELM_COACH, coursePlan: true }} writes={writes} coursePlanReads={reads({ courses: async () => ({ status: 'ok', courses: [] }) })} />));
    await userEvent.click(screen.getByRole('button', { name: 'Course plan' }));
    expect(await screen.findByText(/has no course with three rounds on it yet/)).toBeTruthy();
  });

  it('Send to hands the player’s version to their thread in Messages, written and not sent (row 77)', async () => {
    render(wrap(<CoursePlan playerId="p-ava" who="Ava" reads={reads()} />));
    await userEvent.click(screen.getByRole('button', { name: 'Course plan' }));
    await userEvent.click(await screen.findByRole('button', { name: /Pine Hollow/ }));
    const send = await screen.findByRole('link', { name: 'Send to Ava' });
    const href = send.getAttribute('href')!;
    expect(href).toMatch(/^\/golf\/dashboard\/messages\?prefill=[a-z0-9]+$/);
    // The address carries only the key; the draft waits in this tab, addressed to Ava alone.
    const prefill = takePrefill(new URL(href, 'https://x.test').searchParams);
    const plan = PREVIEW_PLANS['c-pine'];
    if (plan.status === 'too_few') throw new Error('fixture');
    expect(prefill).toEqual({ players: ['p-ava'], draft: [plan.player.title, ...plan.player.lines].join('\n') });
    // Copy stays beside it.
    expect(screen.getByRole('button', { name: 'Copy for Ava' })).toBeTruthy();
  });

  it('offers Try again when a read fails', async () => {
    const courses = vi.fn().mockResolvedValueOnce({ status: 'failed' }).mockResolvedValueOnce({ status: 'ok', courses: PREVIEW_COURSES });
    render(wrap(<CoachBoard data={{ ...PREVIEW_HELM_COACH, coursePlan: true }} writes={writes} coursePlanReads={reads({ courses })} />));
    await userEvent.click(screen.getByRole('button', { name: 'Course plan' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Pine Hollow/ })).toBeTruthy());
    expect(courses).toHaveBeenCalledTimes(2);
  });
});
