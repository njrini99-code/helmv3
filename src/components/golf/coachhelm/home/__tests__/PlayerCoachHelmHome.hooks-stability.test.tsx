// @vitest-environment jsdom
/* eslint-disable helm/no-raw-button -- deliberately minimal stub trigger, same pattern as stage.test.tsx */
/**
 * ============================================================================
 * PlayerCoachHelmHome — hooks-order stability across `?view=` drill switches
 * ----------------------------------------------------------------------------
 * Regression coverage for the prod React #310 "Rendered more hooks than
 * during the previous render" crash reported on (among other routes)
 * /golf/dashboard/coachhelm, /golf/dashboard/my-development, and
 * /golf/dashboard/my-standing — the latter two permanently redirect onto
 * this SAME component with `?view=development` / `?view=standing`
 * pre-selected (see the redirect shims under
 * src/app/golf/(dashboard)/dashboard/my-development|my-standing/page.tsx).
 *
 * This test uses the REAL `StageRouter` + REAL `PlayerSpine`/`PlayerHomeBento`
 * /`ProfileDrill`/`StandingDrill`/`InsightsDrill` and cycles through every one
 * of those views (plus round-trips back `home`) on ONE mounted instance —
 * exactly the update-render sequence a hooks-order mismatch needs to throw
 * (a fresh mount never has a "previous render" to disagree with).
 * `DevelopmentDrill` and `DeepDiveDrill` are stubbed here only to keep this
 * file's dependency surface (FocusAreaModal/GoalsSection's own overlays,
 * WhatIfPanel's simulate flow) out of scope — StageRouter's mounting
 * mechanics don't care which component sits behind a given view key, and
 * both drills get their own real-render coverage implicitly via every other
 * PlayerCoachHelmHome test in this suite.
 * ========================================================================== */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlayerCoachHelmHome } from '../PlayerCoachHelmHome';
import { useStage } from '@/components/fairway/modules';
import type { PlayerCoachHelmDashboardData } from '@/app/golf/actions/insights';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/ui/sonner', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/app/golf/actions/player-feedback', () => ({
  rateInsightAsPlayer: vi.fn(),
}));

vi.mock('@/app/golf/actions/v3/goals', () => ({
  createGoal: vi.fn(),
}));

// Kept as lightweight stand-ins (see file header) — everything else in this
// tree (StageRouter, useStage, PlayerSpine, PlayerHomeBento, ProfileDrill,
// StandingDrill, InsightsDrill) renders for real. Each stub still wires a
// real `useStage().home()` back-button (matching every real Drill's
// `DrillPanel backLabel="Home"` contract) so the round-trip-home step in the
// test below works uniformly across real AND stubbed views.
vi.mock('../DevelopmentDrill', () => ({
  DevelopmentDrill: () => {
    const { home } = useStage();
    return (
      <div>
        <button onClick={home}>Home</button>
        <p>Development view content</p>
      </div>
    );
  },
}));
vi.mock('../DeepDiveDrill', () => ({
  DeepDiveDrill: () => {
    const { home } = useStage();
    return (
      <div>
        <button onClick={home}>Home</button>
        <p>Deep dive view content</p>
      </div>
    );
  },
}));

function baseData(): PlayerCoachHelmDashboardData {
  return {
    playerId: 'p-1',
    playerName: 'Test Player',
    lastUpdated: '2026-07-19T00:00:00Z',
    prediction: { predictedValue: 71.5, metric: 'scoring_average', confidence: 0.6, calibratedConfidence: 0.6 } as never,
    insights: [],
    focusAreas: [{ area: 'putting', strokesGained: -0.3, value: 30, unit: 'putts/rd' } as never],
    recentRounds: [],
    playerState: 'stable',
    alertLevel: 'none',
  };
}

const requiredGenomeProps = {
  genomeAxes: [{ label: 'Putting', value: 60 }],
  genomeDimensions: [],
  genomeStrengths: [],
  genomeWatchouts: [],
  genomeCourseProfile: null,
  genomeRoundsBasis: 12,
  playerBaseline: 0.2,
};

function renderHome() {
  return render(
    <PlayerCoachHelmHome
      data={baseData()}
      playerId="p-1"
      developmentActiveAreas={[{ id: 'fa-1' } as never]}
      developmentCompletedAreas={[]}
      developmentProposedAreas={[]}
      goals={[]}
      achievedGoals={[]}
      standingByMetric={{
        sg_total: { metric_id: 'sg_total', player_value: -0.4, team_avg: -0.2, pga_value: 0 } as never,
      }}
      {...requiredGenomeProps}
    />,
  );
}

describe('PlayerCoachHelmHome — hooks-order stability across ?view= switches', () => {
  it('mounts past the hasData gate into the real StageRouter + PlayerHomeBento home view', () => {
    renderHome();
    expect(screen.getByText('Focus areas')).toBeInTheDocument();
  });

  it('cycles through every real drill view (profile, standing, insights) and the stubbed ones, round-tripping home, without a hooks-order crash', () => {
    const { container } = renderHome();
    const stage = container.querySelector('[data-slot="stage"]') as HTMLElement;
    expect(stage).not.toBeNull();

    const openByLabel = (label: string) => {
      const cell = screen.getAllByRole('button').find((btn) => btn.textContent?.includes(label));
      expect(cell, `expected a control labeled "${label}" to open its drill`).toBeTruthy();
      fireEvent.click(cell!);
    };
    const goHome = () => {
      // Real DrillPanel back-chips render an aria-hidden "←" glyph ahead of
      // the `backLabel` text node, so match on trailing "Home", not equality.
      const backChip = screen.getAllByRole('button').find((btn) => /home$/i.test(btn.textContent?.trim() ?? ''));
      expect(backChip, 'expected a "Home" back-chip on the active drill').toBeTruthy();
      fireEvent.click(backChip!);
    };

    // home -> profile (real ProfileDrill) -> home
    openByLabel('Game profile');
    expect(within(stage).getAllByText(/game profile|genome/i).length).toBeGreaterThan(0);
    goHome();
    expect(within(stage).getByText('Focus areas')).toBeInTheDocument();

    // home -> standing (real StandingDrill) -> home
    openByLabel('Standing');
    expect(within(stage).getAllByText(/standing/i).length).toBeGreaterThan(0);
    goHome();
    expect(within(stage).getByText('Focus areas')).toBeInTheDocument();

    // home -> insights (real InsightsDrill) -> home
    openByLabel('Insight library');
    expect(within(stage).getAllByText(/insight/i).length).toBeGreaterThan(0);
    goHome();
    expect(within(stage).getByText('Focus areas')).toBeInTheDocument();

    // home -> development (stubbed) -> home
    openByLabel('Focus areas');
    expect(within(stage).getByText('Development view content')).toBeInTheDocument();
    goHome();
    expect(within(stage).getByText('Focus areas')).toBeInTheDocument();

    // home -> deep-dive (stubbed) -> home
    openByLabel('Shot analysis');
    expect(within(stage).getByText('Deep dive view content')).toBeInTheDocument();
    goHome();
    expect(within(stage).getByText('Focus areas')).toBeInTheDocument();

    // A second full lap — every view re-opened as a REPEAT update on the
    // same fiber, not just a first visit.
    openByLabel('Game profile');
    expect(within(stage).getAllByText(/game profile|genome/i).length).toBeGreaterThan(0);
    goHome();
    openByLabel('Standing');
    expect(within(stage).getAllByText(/standing/i).length).toBeGreaterThan(0);
  });
});
