// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/use-phone', () => ({ useChPhone: () => false }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/practice/format', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/app/golf/actions/coachhelm-plan-format', () => ({ readPlanFormat: vi.fn(), setPlanFormat: vi.fn(), undoPlanFormat: vi.fn() }));
vi.mock('@/app/golf/actions/documents', () => ({ createGolfDocument: vi.fn(), deleteGolfDocument: vi.fn(), uploadGolfDocument: vi.fn() }));

import { PreviewPracticeFormat } from '../PreviewPracticeOther';

afterEach(cleanup);

/**
 * G15 (12 Nov): practice-format?state=empty matched the default. The real page always opens on the upload card (the
 * route passes no view), so that much is by design; what the empty state got wrong was the figure: "From the 6 plans
 * you've published" for a team that has published none. Empty is now a team with no plans published.
 */
describe('Plan format preview, empty', () => {
  it('says the plans you publish, with no count, for a team with none', () => {
    const c = render(<PreviewPracticeFormat state="empty" />).container;
    expect(c.textContent).toContain('From the plans you publish.');
    expect(c.textContent).not.toMatch(/\d+ plans you’ve published/);
  });

  it('the default keeps the six published plans', () => {
    const c = render(<PreviewPracticeFormat />).container;
    expect(c.textContent).toContain('From the 6 plans you’ve published.');
  });
});
