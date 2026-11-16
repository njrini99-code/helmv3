// @vitest-environment jsdom
import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/rounds/x' }));

import { HISTORY_FAILED, type ChReviewHistory } from '../../../data/round-history-shape';
import { PREVIEW_REVIEW } from '../../../preview/fixtures-round-review';
import { ToastProvider } from '../../../ui/Toast';
import { RoundReview } from '../RoundReview';

afterEach(cleanup);

/** P-7 stage 3 streams in after the review (routes/round-review.tsx): the review draws at once, and the history fills in when it lands. */
const history: ChReviewHistory = {
  course: null,
  records: [{ id: 'season-low', label: 'Season low', tier: 'filled', tie: false }],
  usual: null,
  hereBefore: {},
  ghosts: { average: null, best: null },
};
const wrap = (node: React.ReactNode) =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </ToastProvider>
    </LazyMotion>,
  );

describe('the review history, streamed', () => {
  it('draws the review before the history lands, then its records', async () => {
    let land: (h: ChReviewHistory | null) => void = () => {};
    const streamed = new Promise<ChReviewHistory | null>((resolve) => {
      land = resolve;
    });
    wrap(<RoundReview review={{ ...PREVIEW_REVIEW, history: undefined }} history={streamed} />);
    expect(screen.queryByRole('list', { name: 'Records' })).toBeNull();
    land(history);
    await waitFor(() => expect(screen.getByRole('list', { name: 'Records' }).textContent).toContain('Season low'));
  });

  it('a stream that fails draws no history and says once that it didn’t load (CH-11290, GAP-S-27)', async () => {
    const { container } = wrap(<RoundReview review={{ ...PREVIEW_REVIEW, history: undefined }} history={Promise.reject(new Error('cut off'))} />);
    await waitFor(() => expect(container.querySelector('[data-ch-code="CH-11290"]')).not.toBeNull());
    expect(container.querySelector('[data-ch-code="CH-11290"]')!.textContent).toContain('History didn’t load');
    expect(container.querySelectorAll('[data-ch-code="CH-11290"]')).toHaveLength(1);
    expect(screen.queryByRole('list', { name: 'Records' })).toBeNull();
  });

  it('a read that failed on the server is said the same way (CH-11290)', async () => {
    const { container } = wrap(<RoundReview review={{ ...PREVIEW_REVIEW, history: undefined }} history={Promise.resolve(HISTORY_FAILED)} />);
    await waitFor(() => expect(container.querySelector('[data-ch-code="CH-11290"]')).not.toBeNull());
  });

  it('a player with no history yet is not told anything failed', async () => {
    const { container } = wrap(<RoundReview review={{ ...PREVIEW_REVIEW, history: undefined }} history={Promise.resolve(null)} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-ch-code="CH-11290"]')).toBeNull();
  });
});
