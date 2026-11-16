import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' }));
vi.mock('../../../../shell/nav', async (orig) => ({ ...(await orig<typeof import('../../../../shell/nav')>()), rebuiltHref: (href: string) => href }));
vi.mock('@/app/golf/actions/development', () => ({ acceptFocusArea: vi.fn(), createFocusAreaFromInsightV2: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-corrections', () => ({ recordCoachHelmCorrection: vi.fn(async () => ({ ok: true })) }));

import { previewPlayerWeek } from '../../../../preview/fixtures-coachhelm-player-file';
import { ToastProvider } from '../../../../ui/Toast';
import { YourWeek } from '../YourWeek';
import '../../../../__tests__/dialog-polyfill';

const Wrap = ({ children }: { children: ReactNode }) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>{children}</ToastProvider>
  </LazyMotion>
);

beforeAll(() => {
  Element.prototype.animate = vi.fn(() => ({ cancel: () => {}, finished: Promise.resolve() })) as unknown as Element['animate'];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Prod audit 2026-11-15, PL-CH-01, PL-CH-02, PL-CH-04, PL-CH-05: Your week says which state it is in. Off is not a failure, and a part
// whose read failed says so in its own slot instead of vanishing or reading as "no focus".
describe('Your week’s states', () => {
  it('PL-CH-01 off for the player: the off state with the coach’s reason, and no Try again', () => {
    render(<YourWeek load={{ status: 'off', reason: 'Off during finals' }} />, { wrapper: Wrap });
    expect(screen.getByText('CoachHelm is off for your team')).toBeTruthy();
    expect(document.body.textContent).toContain('Off during finals');
    expect(document.body.textContent).not.toMatch(/Couldn’t load/);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('a failed load keeps the failure card and its Try again', () => {
    render(<YourWeek load={{ status: 'failed' }} />, { wrapper: Wrap });
    expect(screen.getByRole('alert').textContent).toMatch(/Couldn’t load your CoachHelm/);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('PL-CH-02, PL-CH-04 failed strokes gained, field and focus reads each say so in their card', () => {
    const data = previewPlayerWeek('default');
    render(<YourWeek load={{ status: 'ready', data: { ...data, failed: { sg: true, field: true, plan: true } } }} />, { wrapper: Wrap });
    const failed = [...document.querySelectorAll('[data-ch-code="CH-13761"]')].map((n) => n.closest('section')!.querySelector('h4')!.textContent);
    expect(failed.sort()).toEqual(['Last round in context', 'Where the strokes go', 'Your plan']);
    for (const n of document.querySelectorAll('[data-ch-code="CH-13761"]')) expect(within(n as HTMLElement).getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('PL-CH-05 one round reads "1 round"', () => {
    const data = previewPlayerWeek('default');
    render(<YourWeek load={{ status: 'ready', data: { ...data, rounds: 1, refreshed: null } }} />, { wrapper: Wrap });
    const head = screen.getByRole('main').querySelector('header.ch-hl-h') as HTMLElement;
    expect(head.textContent).toMatch(/1 round(?!s)/);
  });
});
