import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm', useSearchParams: () => new URLSearchParams() }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' }));
vi.mock('../shell/nav', async (orig) => ({ ...(await orig<typeof import('../shell/nav')>()), rebuiltHref: (href: string) => href }));
vi.mock('@/app/golf/actions/development', () => ({ acceptFocusArea: vi.fn(), createFocusAreaFromInsightV2: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-corrections', () => ({ recordCoachHelmCorrection: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/app/golf/actions/insights-coachhelm', () => ({ refreshTeamAnalysisAsCoach: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-course-plan', () => ({ getCoursePlan: vi.fn(), getMyCoursePlan: vi.fn(), listCoursePlanCourses: vi.fn(), listMyCoursePlanCourses: vi.fn() }));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: vi.fn() }));

import './dialog-polyfill';
import { previewPlayerFile, previewPlayerWeek } from '../preview/fixtures-coachhelm-player-file';
import { PlayerFile } from '../screens/coachhelm/file/PlayerFile';
import { YourWeek } from '../screens/coachhelm/file/YourWeek';
import { ToastProvider } from '../ui/Toast';

const Wrap = ({ children }: { children: ReactNode }) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>{children}</ToastProvider>
  </LazyMotion>
);

beforeAll(() => {
  Element.prototype.animate = vi.fn(() => ({ cancel: () => {}, finished: Promise.resolve() })) as unknown as Element['animate'];
});
afterEach(cleanup);

/**
 * GAP-S-23: a player with no rounds gets the shared EmptyState (CH-13386), never a hand-rolled "No rounds yet" block. The
 * coach's player file offers to message the player; the player's own week goes to Rounds.
 */
describe('CH-13386 CoachHelm with no rounds yet', () => {
  it('a coach’s player file: the shared empty state with Message {first}', () => {
    const data = previewPlayerFile('empty');
    render(<PlayerFile load={{ status: 'ready', data }} roster={null} />, { wrapper: Wrap });
    const empty = document.querySelector('[data-ch-code="CH-13386"]') as HTMLElement;
    expect(empty).not.toBeNull();
    expect(empty.textContent).toMatch(/No rounds yet.*Reads start after 4 full rounds in the last 90 days\./);
    expect(screen.getByRole('link', { name: `Message ${data.head.first}` })).toBeTruthy();
  });

  it('the player’s Your week: the same words, with Go to Rounds', () => {
    render(<YourWeek load={{ status: 'ready', data: previewPlayerWeek('empty') }} />, { wrapper: Wrap });
    const empty = document.querySelector('[data-ch-code="CH-13386"]') as HTMLElement;
    expect(empty).not.toBeNull();
    expect(empty.textContent).toMatch(/No rounds yet.*Reads start after 4 full rounds in the last 90 days\./);
    expect(screen.getByRole('link', { name: 'Go to Rounds' }).getAttribute('href')).toBe('/golf/dashboard/rounds');
  });
});
