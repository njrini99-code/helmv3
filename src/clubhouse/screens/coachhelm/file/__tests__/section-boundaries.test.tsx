import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * GAP-S-10 (15 Nov 2026): a crash while one card of Your week draws said nothing and took the whole page down. Each card now
 * has its own SectionBoundary (CH-13204): the broken card says it couldn’t be shown, and the cards beside it stay.
 */

vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' }));
vi.mock('../../../../shell/nav', async (orig) => ({ ...(await orig<typeof import('../../../../shell/nav')>()), rebuiltHref: (href: string) => href }));
vi.mock('@/app/golf/actions/development', () => ({ acceptFocusArea: vi.fn(), createFocusAreaFromInsightV2: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-corrections', () => ({ recordCoachHelmCorrection: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/app/golf/actions/insights-coachhelm', () => ({ refreshTeamAnalysisAsCoach: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-course-plan', () => ({ getCoursePlan: vi.fn(), getMyCoursePlan: vi.fn(), listCoursePlanCourses: vi.fn(), listMyCoursePlanCourses: vi.fn() }));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: vi.fn() }));
// The strokes card breaks while it draws; every other card is the real one.
vi.mock('../cards', async (orig) => ({
  ...(await orig<typeof import('../cards')>()),
  SgCard: () => {
    throw new Error('strokes card broke');
  },
}));

import { previewPlayerWeek } from '../../../../preview/fixtures-coachhelm-player-file';
import { ToastProvider } from '../../../../ui/Toast';
import { YourWeek } from '../YourWeek';

const Wrap = ({ children }: { children: ReactNode }) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>{children}</ToastProvider>
  </LazyMotion>
);

beforeAll(() => {
  Element.prototype.animate = vi.fn(() => ({ cancel: () => {}, finished: Promise.resolve() })) as unknown as Element['animate'];
});
afterEach(() => cleanup());

describe('GAP-S-10 Your week: one card that cannot draw is that card, not the page', () => {
  it('the broken card says so in its place (CH-13204) and the cards beside it stay', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = previewPlayerWeek('default');
    expect(data.cards.sg).toBeTruthy();
    render(<YourWeek load={{ status: 'ready', data }} />, { wrapper: Wrap });
    const notice = document.querySelector('[data-ch-code="CH-13204"]') as HTMLElement;
    expect(notice).not.toBeNull();
    expect(notice.textContent).toContain('Where the strokes go couldn’t be shown');
    expect(document.querySelectorAll('[data-ch-code="CH-13204"]')).toHaveLength(1);
    // The page is still the week: its title and the other cards drew.
    expect(screen.getAllByText('Your week').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.grid2 .col .card').length).toBeGreaterThan(1);
    errors.mockRestore();
  });
});
