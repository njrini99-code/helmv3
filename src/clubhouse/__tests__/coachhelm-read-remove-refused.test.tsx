import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm', useSearchParams: () => new URLSearchParams() }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' }));
vi.mock('../shell/nav', async (orig) => ({ ...(await orig<typeof import('../shell/nav')>()), rebuiltHref: (href: string) => href }));
vi.mock('@/app/golf/actions/development', () => ({ acceptFocusArea: vi.fn(), createFocusAreaFromInsightV2: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-corrections', () => ({ recordCoachHelmCorrection: vi.fn(async () => ({ status: 'recorded' })) }));
vi.mock('@/app/golf/actions/insights-coachhelm', () => ({ refreshTeamAnalysisAsCoach: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-course-plan', () => ({ getCoursePlan: vi.fn(), getMyCoursePlan: vi.fn(), listCoursePlanCourses: vi.fn(), listMyCoursePlanCourses: vi.fn() }));

import { ToastProvider } from '../ui/Toast';
import { previewReadHead, previewReadView } from '../preview/fixtures-coachhelm-read';
import type { ChReadWrites } from '../screens/coachhelm/read/actions';
import { ReadPage } from '../screens/coachhelm/read/ReadPage';
import './dialog-polyfill';

/**
 * CH-13008: Remove focus waits behind Undo, then deletes the focus area. When that delete is refused the coach is told the
 * focus is still in place, the read goes back to its assigned state, and the page is not read again.
 */

beforeAll(() => {
  Element.prototype.animate = vi.fn(() => ({ cancel: () => {}, finished: Promise.resolve() })) as unknown as Element['animate'];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Remove focus on a read, refused (CH-13008)', () => {
  it('says the focus is still in place, puts the read back to assigned and does not read the page again', async () => {
    const readWrites: ChReadWrites = { removeFocus: vi.fn(async () => ({ success: false, error: 'Not allowed' })), recheck: vi.fn(async () => ({ success: true, insightsCreated: 1 })) };
    const ok = vi.fn(async () => ({ success: true }));
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <ReadPage
            load={{ status: 'ready', data: previewReadView('penalties', 'coach', false, 'assigned') }}
            voice={{ role: 'coach', ...previewReadHead('penalties') }}
            writes={{ assign: ok, dismiss: ok, undo: ok }}
            playerWrites={{ accept: ok, decline: ok }}
            readWrites={readWrites}
            holdMs={40}
            hrefOf={(id: string) => `/read/${id}`}
          />
        </ToastProvider>
      </LazyMotion>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove focus' }));
    await waitFor(() => expect(readWrites.removeFocus).toHaveBeenCalledWith('fa-read'), { timeout: 4000 });
    await waitFor(() => expect(document.querySelector('[data-ch-code="CH-13008"]')?.textContent).toContain('It is still in place. Try again.'), { timeout: 4000 });
    expect(screen.getByRole('main').getAttribute('data-ch-read-state')).toBe('assigned');
    expect(screen.getByRole('button', { name: 'Remove focus' })).toBeTruthy();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
