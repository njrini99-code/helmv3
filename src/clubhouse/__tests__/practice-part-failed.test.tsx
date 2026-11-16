import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * GAP-S-07 (CH-13286): one part of a Practice page that didn't load is said where the part goes, with Try again, and is
 * never drawn as the default it would otherwise fall back to. Here, Plan format: a format read that failed is never
 * "GolfHelm standard", and a published count that failed is never 0. The loaders' cases are in
 * data/__tests__/practice-plan-failed-reads.test.ts.
 */
vi.mock('../lib/use-phone', () => ({ useChPhone: () => false }));
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/practice/format', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/app/golf/actions/coachhelm-plan-format', () => ({ readPlanFormat: vi.fn(), setPlanFormat: vi.fn(), undoPlanFormat: vi.fn() }));
vi.mock('@/app/golf/actions/documents', () => ({ createGolfDocument: vi.fn(), deleteGolfDocument: vi.fn(), uploadGolfDocument: vi.fn() }));

import { PlanFormat } from '../screens/coachhelm/plan/format/PlanFormat';

afterEach(cleanup);

describe('CH-13286 a Practice part that didn’t load is said, never a default', () => {
  it('Plan format: an unread format says so with Try again, and never names GolfHelm standard', () => {
    const { container } = render(<PlanFormat teamId="t1" unread={['format']} />);
    const notice = container.querySelector('[data-ch-code="CH-13286"]');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toMatch(/Your format didn’t load.*Your current format is unknown, so a new one can’t be set yet\. Nothing you saved is lost\. Try again\./);
    expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy();
    expect(container.textContent).not.toMatch(/Current format GolfHelm standard/);
  });

  it('Plan format: a format that read draws the current format and no notice', () => {
    const { container } = render(<PlanFormat teamId="t1" current="Team format" />);
    expect(container.querySelector('[data-ch-code="CH-13286"]')).toBeNull();
    expect(container.querySelector('.fcur')?.textContent).toBe('Current format Team format');
  });
});
