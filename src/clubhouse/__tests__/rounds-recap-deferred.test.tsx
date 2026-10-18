import { LazyMotion, domAnimation } from 'motion/react';
import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The round recap is written when a completed round's review first opens without one (P011 111504, 2026-10-17), as the
 * Fairway round page does (`recapPending` -> `useDeferredRoundRecap` -> `generateRoundRecap`). Before this, Clubhouse
 * only read `golf_rounds.ai_recap`, so a round posted and reviewed in Clubhouse never got a recap.
 */

const mocks = vi.hoisted(() => ({ generateRoundRecap: vi.fn() }));
vi.mock('@/app/golf/actions/round-recap', () => ({ generateRoundRecap: (...args: unknown[]) => mocks.generateRoundRecap(...args) }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: true, updatePreferences: vi.fn() }) }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/rounds/x' }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px)' }));
vi.mock('../shell/phone-chrome', () => ({ PhoneTop: () => null, usePhoneTabsHidden: () => {}, usePhoneImmersive: () => {} }));

import { toReview, type ChReviewRoundRow, type ChRoundReview } from '../data/round-review-shape';
import { PREVIEW_REVIEW } from '../preview/fixtures-round-review';
import { RoundReview } from '../screens/rounds/RoundReview';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

const RECAP = 'You kept the card clean on the back nine with three pars in a row.';

const show = (r: ChRoundReview, strict = false) => {
  const tree = (
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <RoundReview review={r} />
      </ToastProvider>
    </LazyMotion>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};

const row = (over: Partial<ChReviewRoundRow> = {}): ChReviewRoundRow => ({
  id: 'r1',
  player_id: 'p1',
  course_name: 'Finley GC',
  tees_played: 'Blue',
  round_date: '2026-10-12',
  round_type: 'practice',
  total_score: 74,
  score_to_par: 2,
  front_nine: 37,
  back_nine: 37,
  holes_played: 18,
  total_putts: 31,
  total_fairways_hit: 8,
  total_fairways: 14,
  total_gir: 10,
  total_gir_possible: 18,
  course_rating: 73.1,
  course_slope: 133,
  ai_recap: null,
  notes: null,
  strokes_gained_total: null,
  strokes_gained_tee: null,
  strokes_gained_approach: null,
  strokes_gained_around_green: null,
  strokes_gained_putting: null,
  status: 'completed',
  ...over,
});
const shape = (r: ChReviewRoundRow) => toReview(r, { holes: [], holesError: false, shotsError: false, playerName: null, teeYards: null });

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  mocks.generateRoundRecap.mockResolvedValue({ recap: RECAP, cached: false });
});

describe('111504 A completed round without a recap gets one when its review opens (as Fairway)', () => {
  it('the loader marks a completed round with no stored recap as pending, and nothing else', () => {
    expect(shape(row()).recapPending).toBe(true);
    expect(shape(row({ ai_recap: '  ' })).recapPending).toBe(true);
    expect(shape(row({ ai_recap: RECAP })).recapPending).toBeUndefined();
    expect(shape(row({ status: 'abandoned' })).recapPending).toBeUndefined();
    // An older row with no status read says nothing is pending.
    expect(shape(row({ status: undefined })).recapPending).toBeUndefined();
  });

  it('a pending round asks once, and the written recap is drawn under its rule', async () => {
    show({ ...PREVIEW_REVIEW, id: 'r-pending', recap: null, recapPending: true, strokesGained: null });
    await waitFor(() => expect(screen.getByText(RECAP)).toBeInTheDocument());
    expect(mocks.generateRoundRecap).toHaveBeenCalledTimes(1);
    expect(mocks.generateRoundRecap).toHaveBeenCalledWith('r-pending');
    expect(screen.getByText('Round recap')).toBeInTheDocument();
  });

  it('StrictMode’s second effect neither asks again nor loses the answer', async () => {
    show({ ...PREVIEW_REVIEW, id: 'r-strict', recap: null, recapPending: true, strokesGained: null }, true);
    await waitFor(() => expect(screen.getByText(RECAP)).toBeInTheDocument());
    expect(mocks.generateRoundRecap).toHaveBeenCalledTimes(1);
  });

  it('a stored recap, or a review not marked pending (a fixture), asks for nothing', async () => {
    show({ ...PREVIEW_REVIEW, id: 'r-stored', recap: 'Stored recap text.', recapPending: undefined, strokesGained: null });
    show({ ...PREVIEW_REVIEW, id: 'r-fixture', recap: null, strokesGained: null });
    await Promise.resolve();
    expect(mocks.generateRoundRecap).not.toHaveBeenCalled();
  });

  it('a recap that fails to write leaves the review as it was, with no recap and no error', async () => {
    mocks.generateRoundRecap.mockRejectedValueOnce(new Error('gate denied'));
    show({ ...PREVIEW_REVIEW, id: 'r-fail', recap: null, recapPending: true, strokesGained: null });
    await waitFor(() => expect(mocks.generateRoundRecap).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Round recap')).toBeNull();
    expect(document.querySelector('.ch-toast')).toBeNull();
  });
});
