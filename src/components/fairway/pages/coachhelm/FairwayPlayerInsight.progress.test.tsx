// @vitest-environment jsdom
/**
 * ============================================================================
 * FairwayPlayerInsight — focus-area progress bar uses the shared
 * baseline-aware derivation, not a naive current/target ratio
 * (Package 11 — #1933 bug confirmed present on main, fixed here)
 * ----------------------------------------------------------------------------
 * The bar computed `current / target * 100` directly, ignoring
 * `baseline_value` entirely. FocusAreaCard.tsx already has the correct
 * shared derivation (`getProgressPercent`, areaTypes.ts) for the identical
 * `golf_player_focus_areas` row; this call site was never wired to it. For a
 * lower-is-better metric (the common case in golf — e.g. strokes gained
 * deficit, putts/round) the naive ratio is not just imprecise, it can point
 * the wrong direction entirely.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FairwayPlayerInsight } from './FairwayPlayerInsight';
import { GolfUserProvider, type GolfUserData } from '@/contexts/golf-user-context';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getInsightsForCoach: vi.fn(async () => []),
}));
vi.mock('@/app/golf/actions/insights', () => ({
  acknowledgeInsight: vi.fn(async () => ({ success: true })),
  dismissInsight: vi.fn(async () => ({ success: true })),
  refreshPlayerAnalysisAsCoach: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/app/golf/actions/development', () => ({
  createFocusAreaFromInsight: vi.fn(async () => ({ success: true, data: { focusAreaId: 'fa-1' } })),
}));

const coachUser: GolfUserData = { role: 'coach', userId: 'u-coach', name: 'Coach X', coachId: 'c-1' };

const basePlayer = {
  id: 'p-1',
  first_name: 'Jake',
  last_name: 'Doe',
  avatar_url: null,
  graduation_year: 2027,
  handicap: 8.2,
};

const baseCategoryBreakdown = { teeGame: 60, approach: 55, shortGame: 50, putting: 45, scoring: 52 };

const baseTrendSummary = {
  trend: 'stable' as const,
  recentAvg: 78,
  previousAvg: 79,
  streakCount: 0,
  streakType: 'neutral' as const,
};

function renderInsight(focusAreas: Array<Record<string, unknown>>) {
  return render(
    <GolfUserProvider userData={coachUser}>
      <FairwayPlayerInsight
        player={basePlayer}
        compositeRating={70}
        categoryBreakdown={baseCategoryBreakdown}
        trendSummary={baseTrendSummary}
        playerStatus="Stable"
        rounds={[]}
        patterns={[]}
        insights={[]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        focusAreas={focusAreas as any}
        predictions={[]}
        themes={[]}
        embedded
      />
    </GolfUserProvider>,
  );
}

describe('FairwayPlayerInsight — focus-area progress bar', () => {
  it('renders a lower-is-better focus area correctly instead of the naive current/target ratio', () => {
    // Putts/round: baseline 32, target 28 (lower is better), current 30.
    // Naive ratio: current/target*100 = 30/28*100 = 107% → clamped to 100%
    // (reads as basically done). Correct: travelled=(30-32)=-2, span=(28-32)=-4
    // → 50% — the player is genuinely halfway there, not nearly finished.
    const { container } = renderInsight([
      {
        id: 'fa-1',
        title: 'Cut putts per round',
        area_type: 'putting',
        status: 'active',
        current_value: 30,
        target_value: 28,
        baseline_value: 32,
        target_metric: 'putts_per_round',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const bar = container.querySelector('.h-full.bg-accent-500') as HTMLElement | null;
    expect(bar).not.toBeNull();
    expect(bar!.style.width).toBe('50%');
    expect(bar!.style.width).not.toBe('100%');
  });

  it('hides the progress bar (never a fabricated one) when target_metric direction is unknown', () => {
    const { container } = renderInsight([
      {
        id: 'fa-2',
        title: 'Mystery metric',
        area_type: 'other',
        status: 'active',
        current_value: 10,
        target_value: 20,
        baseline_value: 5,
        target_metric: 'not_a_real_registered_metric',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    expect(screen.getByText('Mystery metric')).toBeInTheDocument();
    expect(container.querySelector('.h-full.bg-accent-500')).toBeNull();
  });
});
