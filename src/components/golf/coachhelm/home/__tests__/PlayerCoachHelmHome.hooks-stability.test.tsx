// @vitest-environment jsdom
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
 * This test uses the REAL `StageRouter` + REAL `PlayerCoachHelmNav` /
 * `PlayerHubFeed` / `ProfileDrill` / `StandingDrill` / `InsightsDrill` and
 * cycles through every one of those views via the section tabs (plus
 * round-trips back to Overview) on ONE mounted instance —
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
// tree (StageRouter, PlayerCoachHelmNav, PlayerHubFeed, ProfileDrill,
// StandingDrill, InsightsDrill) renders for real. Drills have no "Home" chip
// any more (audit HUB-01): the Overview tab is the way back, for real and
// stubbed views alike.
vi.mock('../DevelopmentDrill', () => ({
  DevelopmentDrill: () => <p>Development view content</p>,
}));
vi.mock('../DeepDiveDrill', () => ({
  DeepDiveDrill: () => <p>Deep dive view content</p>,
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

function renderHome(extra: Partial<React.ComponentProps<typeof PlayerCoachHelmHome>> = {}) {
  window.history.replaceState(null, '', '/golf/dashboard/coachhelm');
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
      {...extra}
    />,
  );
}

describe('PlayerCoachHelmHome — hooks-order stability across ?view= switches', () => {
  it('mounts past the hasData gate into the real StageRouter + PlayerHubFeed overview', () => {
    renderHome();
    expect(screen.getByRole('heading', { name: 'Why' })).toBeInTheDocument();
    // No spine and no hub cards: the tabs are the only navigation.
    expect(document.querySelector('[data-slot="spine"]')).toBeNull();
    expect(document.querySelector('[data-slot="bento"]')).toBeNull();
  });

  it('cycles through every real drill view (profile, standing, insights) and the stubbed ones via the tabs, round-tripping to Overview, without a hooks-order crash', () => {
    const { container } = renderHome();
    const stage = container.querySelector('[data-slot="stage"]') as HTMLElement;
    expect(stage).not.toBeNull();
    const nav = screen.getByRole('navigation', { name: 'CoachHelm sections' });

    const openTab = (label: string) => fireEvent.click(within(nav).getByRole('link', { name: label }));
    const goHome = () => {
      openTab('Overview');
      expect(within(stage).getByRole('heading', { name: 'Why' })).toBeInTheDocument();
    };

    // Drills carry no "Home" back chip; the Overview tab is the way back.
    openTab('Game Profile');
    expect(within(stage).getAllByText(/game profile|genome/i).length).toBeGreaterThan(0);
    expect(within(stage).queryByRole('button', { name: /home$/i })).toBeNull();
    goHome();

    openTab('Standing');
    expect(within(stage).getAllByText(/standing/i).length).toBeGreaterThan(0);
    goHome();

    openTab('Insights');
    expect(within(stage).getAllByText(/insight/i).length).toBeGreaterThan(0);
    goHome();

    openTab('Development');
    expect(within(stage).getByText('Development view content')).toBeInTheDocument();
    goHome();

    openTab('Deep dive');
    expect(within(stage).getByText('Deep dive view content')).toBeInTheDocument();
    goHome();

    // A second full lap — every view re-opened as a REPEAT update on the
    // same fiber, not just a first visit.
    openTab('Game Profile');
    expect(within(stage).getAllByText(/game profile|genome/i).length).toBeGreaterThan(0);
    goHome();
    openTab('Standing');
    expect(within(stage).getAllByText(/standing/i).length).toBeGreaterThan(0);
  });

  it('opens Development from the overview plan and Insights from "See the evidence"', () => {
    const { container } = renderHome({
      topInsight: {
        id: 'ins-1',
        player_id: 'p-1',
        category: 'putting',
        title: 'Short putts are leaking strokes',
        content: 'You make 48% from 3 to 5 feet.',
        signature: null,
        evidence: { metric: 'putts_made_3_5ft_pct', metric_label: '3-5 ft makes', unit: 'percent', your_value: 0.48, your_value_display: '48%', comparison_value: 0.71, comparison_label: 'Team', comparison_source: 'team_avg', sample_n: 44, window_days: 30, window_start: '2026-06-01', window_end: '2026-06-30', strokes_impact: 1.1, strokes_impact_method: 'x', confidence: 0.8, confidence_factors: {} },
        metadata: null,
        lifecycle_state: 'detected',
        status: 'active',
        priority: 'high',
        acknowledged_at: null,
        resolved_at: null,
        created_at: '2026-06-30T00:00:00Z',
        updated_at: '2026-06-30T00:00:00Z',
      } as never,
    });
    const stage = container.querySelector('[data-slot="stage"]') as HTMLElement;

    fireEvent.click(within(stage).getByRole('button', { name: /open your plan/i }));
    expect(within(stage).getByText('Development view content')).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('navigation', { name: 'CoachHelm sections' })).getByRole('link', { name: 'Overview' }));
    fireEvent.click(within(stage).getByRole('button', { name: 'See the evidence' }));
    expect(window.location.search).toContain('insight=ins-1');
    expect(window.location.search).toContain('view=insights');
  });
});
