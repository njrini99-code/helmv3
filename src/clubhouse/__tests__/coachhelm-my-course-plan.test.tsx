import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The player's own Course plan on their Board (chs-21 / par-14, coachhelm_course_plan_v1): offered only when the loader says
 * so, read on request through reads that take no player id, drawn in the player's voice only. Synthetic fixtures only.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => '/golf/dashboard/coachhelm', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusAreaFromInsightV2: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-course-plan', () => ({ listCoursePlanCourses: vi.fn(), getCoursePlan: vi.fn(), listMyCoursePlanCourses: vi.fn(), getMyCoursePlan: vi.fn() }));

import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import type { ChMyCoursePlanReads, ChPlayerWrites } from '../screens/coachhelm/writes';
import { PREVIEW_HELM_PLAYER, PREVIEW_HELM_PLAYER_EMPTY } from '../preview/fixtures-coachhelm';
import { PREVIEW_COURSES, previewMyCoursePlanReads } from '../preview/fixtures-course-plan';
import { ToastProvider } from '../ui/Toast';

const writes: ChPlayerWrites = { accept: vi.fn(), decline: vi.fn() };
const wrap = (node: ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);

function reads(over: Partial<ChMyCoursePlanReads> = {}): ChMyCoursePlanReads {
  const base = previewMyCoursePlanReads('courseplan');
  return { courses: vi.fn(base.courses), plan: vi.fn(base.plan), ...over };
}
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);

afterEach(cleanup);

describe('the player’s course plan on their Board', () => {
  it('is not offered when the loader does not turn it on', () => {
    const r = reads();
    render(wrap(<PlayerBoard data={PREVIEW_HELM_PLAYER} writes={writes} coursePlanReads={r} />));
    expect(screen.queryByRole('heading', { name: 'Course plan' })).toBeNull();
    expect(r.courses).not.toHaveBeenCalled();
  });

  it('reads nothing until the player asks, then draws their own lines and the thin line, and none of the coach copy', async () => {
    const r = reads();
    render(wrap(<PlayerBoard data={{ ...PREVIEW_HELM_PLAYER, coursePlan: true }} writes={writes} coursePlanReads={r} />));
    expect(code('CH-13916')).not.toBeNull();
    expect(r.courses).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Pick a course' }));
    expect(r.courses).toHaveBeenCalledWith();
    await userEvent.click(await screen.findByRole('button', { name: /Pine Hollow/ }));
    expect(r.plan).toHaveBeenCalledWith('c-pine');
    expect(await screen.findByText('At Pine Hollow')).toBeTruthy();
    expect(screen.getByText(/^4 and 11: aim at the left half off the tee\./)).toBeTruthy();
    expect(screen.getByText('From your 3 rounds here, so take it as a reminder, not a read.')).toBeTruthy();
    const section = code('CH-13916')!;
    expect(section.textContent).not.toMatch(/Course plan: |Plan: |Copy for/);
    expect(section.textContent).not.toMatch(/\b(3-wood|wood|hybrid|iron|one more club)\b/i);
  });

  it('draws no thin line from six rounds', async () => {
    render(wrap(<PlayerBoard data={{ ...PREVIEW_HELM_PLAYER, coursePlan: true }} writes={writes} coursePlanReads={reads()} />));
    await userEvent.click(screen.getByRole('button', { name: 'Pick a course' }));
    await userEvent.click(await screen.findByRole('button', { name: /Cedar Ridge/ }));
    await screen.findByText('At Cedar Ridge');
    expect(screen.queryByText(/a reminder, not a read/)).toBeNull();
  });

  it('says so when no course has three rounds yet, and is offered on a board with no reads too', async () => {
    render(wrap(<PlayerBoard data={{ ...PREVIEW_HELM_PLAYER_EMPTY, coursePlan: true }} writes={writes} coursePlanReads={reads({ courses: async () => ({ status: 'ok', courses: [] }) })} />));
    await userEvent.click(screen.getByRole('button', { name: 'Pick a course' }));
    expect((await screen.findByText(/No course has three of your rounds on it yet/)).closest('[data-ch-code]')?.getAttribute('data-ch-code')).toBe('CH-13333');
  });

  it('offers Try again when a read fails, and recovers', async () => {
    const courses = vi.fn().mockResolvedValueOnce({ status: 'failed' }).mockResolvedValueOnce({ status: 'ok', courses: PREVIEW_COURSES });
    render(wrap(<PlayerBoard data={{ ...PREVIEW_HELM_PLAYER, coursePlan: true }} writes={writes} coursePlanReads={reads({ courses })} />));
    await userEvent.click(screen.getByRole('button', { name: 'Pick a course' }));
    expect(await screen.findByText('Your course plan didn’t load. Nothing was changed.')).toBeTruthy();
    expect(code('CH-13233')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: /Pine Hollow/ })).toBeTruthy();
  });
});
