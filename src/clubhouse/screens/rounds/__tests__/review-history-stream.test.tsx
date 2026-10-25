// @vitest-environment jsdom
import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/rounds/x' }));

import type { ChReviewHistory } from '../../../data/round-history-shape';
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

  it('a stream that fails draws no history and says nothing about it', async () => {
    wrap(<RoundReview review={{ ...PREVIEW_REVIEW, history: undefined }} history={Promise.reject(new Error('cut off'))} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('list', { name: 'Records' })).toBeNull();
  });
});
