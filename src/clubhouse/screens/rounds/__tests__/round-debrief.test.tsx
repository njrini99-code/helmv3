import { LazyMotion, domAnimation } from 'motion/react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CoachHelm chs-30 on the round review: with a debrief (`coachhelm_reads_v1_copy` on, the player's own round) it stands where
 * the recap stood, its lines in order, with Why? to the read on the player's Deep dive; without one the review is what it was.
 */

const mocks = vi.hoisted(() => ({ generateRoundRecap: vi.fn() }));
vi.mock('@/app/golf/actions/round-recap', () => ({ generateRoundRecap: (...args: unknown[]) => mocks.generateRoundRecap(...args) }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: true, updatePreferences: vi.fn() }) }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/rounds/x' }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px)' }));
vi.mock('../../../shell/phone-chrome', () => ({ PhoneTop: () => null, usePhoneTabsHidden: () => {}, usePhoneImmersive: () => {} }));

import type { ChRoundReview } from '../../../data/round-review-shape';
import { PREVIEW_REVIEW, PREVIEW_REVIEW_DEBRIEF, PREVIEW_REVIEW_DEBRIEF_THIN } from '../../../preview/fixtures-round-review';
import { RoundReview } from '../RoundReview';
import { ToastProvider } from '../../../ui/Toast';
import '../../../__tests__/dialog-polyfill';

const show = (r: ChRoundReview) =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <RoundReview review={r} />
      </ToastProvider>
    </LazyMotion>,
  );

beforeEach(() => mocks.generateRoundRecap.mockReset().mockResolvedValue({ recap: 'Written now.' }));

describe('CoachHelm 30-second debrief (chs-30)', () => {
  it('stands where the recap stood: moved, the read and what the round did to it, the facts, the next step, Why?', () => {
    show(PREVIEW_REVIEW_DEBRIEF);
    const box = screen.getByRole('region', { name: 'Round debrief' });
    const terms = within(box)
      .getAllByRole('term')
      .map((t) => t.textContent);
    expect(terms).toEqual(['Moved', 'Your read', 'The round', 'Next']);
    expect(box).toHaveTextContent('15 of 18 greens Your average over your last 12 rounds: 53% of greens (83% today).');
    expect(box).toHaveTextContent('Par 5 scoring Par 5s today: 6.0 a hole, against 5.6 in the read. This round moves it the wrong way; one round does not decide it.');
    expect(box).toHaveTextContent('No doubles or worse; a three-putt on hole 2.');
    expect(box).toHaveTextContent('Wedge ladder · 15 min');
    expect(within(box).getByRole('link', { name: 'Why?' })).toHaveAttribute('href', '/golf/dashboard/coachhelm?view=deep-dive&insight=preview-read-par5');
    expect(screen.queryByRole('region', { name: 'Round recap' })).toBeNull();
    // The player's notes stay beside it.
    expect(screen.getByText(PREVIEW_REVIEW.notes as string)).toBeInTheDocument();
  });

  it('drops every line it has no data for, and Why? with no read', () => {
    show(PREVIEW_REVIEW_DEBRIEF_THIN);
    const box = screen.getByRole('region', { name: 'Round debrief' });
    expect(within(box).getAllByRole('term').map((t) => t.textContent)).toEqual(['The round']);
    expect(within(box).queryByRole('link', { name: 'Why?' })).toBeNull();
  });

  it('asks for no recap while the debrief stands in its place', () => {
    show({ ...PREVIEW_REVIEW_DEBRIEF, recap: null, recapPending: true });
    expect(mocks.generateRoundRecap).not.toHaveBeenCalled();
  });

  it('without a debrief (flag off, a coach, nothing to say) the review keeps its recap as before', () => {
    show(PREVIEW_REVIEW);
    expect(screen.queryByRole('region', { name: 'Round debrief' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Round recap' })).toHaveTextContent('Written by CoachHelm');
  });
});
