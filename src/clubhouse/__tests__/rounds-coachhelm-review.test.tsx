import { LazyMotion, domAnimation } from 'motion/react';
import { render, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A completed round's CoachHelm review (golf_round_reviews) is written when its review opens without one, as the
 * Fairway review page did (`useRoundReviewV2`'s auto-generate). Fairway was retired on Nov 15 and nothing in Clubhouse
 * asked since: the Bridge's "Reviews this week" went from 5 (Nov 1 to 14) to none.
 */

const mocks = vi.hoisted(() => ({ generate: vi.fn(), chReport: vi.fn() }));
vi.mock('@/app/golf/actions/round-review-system', () => ({ generateAndStoreRoundReview: (...args: unknown[]) => mocks.generate(...args) }));
vi.mock('@/app/golf/actions/round-recap', () => ({ generateRoundRecap: vi.fn(async () => ({ recap: null })) }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: true, updatePreferences: vi.fn() }) }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: (...args: unknown[]) => mocks.chReport(...args), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/rounds/x' }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' }));
vi.mock('../shell/phone-chrome', () => ({ PhoneTop: () => null, usePhoneTabsHidden: () => {}, usePhoneImmersive: () => {} }));

import { toReview, type ChReviewRoundRow, type ChRoundReview } from '../data/round-review-shape';
import { PREVIEW_REVIEW } from '../preview/fixtures-round-review';
import { RoundReview } from '../screens/rounds/RoundReview';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

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
  round_date: '2026-11-20',
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
  ai_recap: 'Stored.',
  notes: null,
  strokes_gained_total: null,
  strokes_gained_tee: null,
  strokes_gained_approach: null,
  strokes_gained_around_green: null,
  strokes_gained_putting: null,
  status: 'completed',
  ...over,
});
const shape = (r: ChReviewRoundRow, reviewRowMissing?: boolean) =>
  toReview(r, { holes: [], holesError: false, shotsError: false, playerName: null, teeYards: null, ...(reviewRowMissing === undefined ? {} : { reviewRowMissing }) });

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  mocks.generate.mockResolvedValue({ success: true });
});

describe('A completed round with no CoachHelm review gets one when its review opens (as Fairway)', () => {
  it('the loader marks only a completed round whose review row was read and is missing', () => {
    expect(shape(row(), true).coachHelmPending).toBe(true);
    expect(shape(row(), false).coachHelmPending).toBeUndefined();
    // A failed read of the row is not "no row" (the loader passes nothing then), and a fixture passes nothing.
    expect(shape(row()).coachHelmPending).toBeUndefined();
    expect(shape(row({ status: 'abandoned' }), true).coachHelmPending).toBeUndefined();
    expect(shape(row({ status: undefined }), true).coachHelmPending).toBeUndefined();
  });

  it('a pending round asks once, only if missing, for the round and its player', async () => {
    show({ ...PREVIEW_REVIEW, id: 'r-pending', playerId: 'p-9', coachHelmPending: true, strokesGained: null });
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    expect(mocks.generate).toHaveBeenCalledWith('r-pending', 'p-9', { ifMissing: true });
  });

  it('StrictMode’s second effect does not ask again', async () => {
    show({ ...PREVIEW_REVIEW, id: 'r-strict', coachHelmPending: true, strokesGained: null }, true);
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it('a round with a review, or a fixture, asks for nothing', async () => {
    show({ ...PREVIEW_REVIEW, id: 'r-has', strokesGained: null });
    await Promise.resolve();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('a refusal stays quiet, and a dropped request is reported at low without a toast', async () => {
    mocks.generate.mockResolvedValueOnce({ success: false, code: 'unauthorized' });
    show({ ...PREVIEW_REVIEW, id: 'r-refused', coachHelmPending: true, strokesGained: null });
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    expect(mocks.chReport).not.toHaveBeenCalled();

    mocks.generate.mockRejectedValueOnce(new Error('Failed to fetch'));
    show({ ...PREVIEW_REVIEW, id: 'r-dropped', coachHelmPending: true, strokesGained: null });
    await waitFor(() => expect(mocks.chReport).toHaveBeenCalledTimes(1));
    expect(mocks.chReport).toHaveBeenCalledWith(expect.any(Error), { surface: 'rounds.review', action: 'rounds.coachhelm-review', severity: 'low' });
    expect(document.querySelector('.ch-toast')).toBeNull();
  });
});
