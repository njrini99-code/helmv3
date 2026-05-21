/**
 * PlayerCoachHelmDashboard — Insight Delivery refactor tests.
 *
 * Covers the hero-card layout that replaced `AIInsightsPanel`:
 *   - Top insight renders as a HeroInsightCard when provided
 *   - Secondary insights render as InsightCards below (and the top insight
 *     id is deduped from the list)
 *   - Empty insight state renders a friendly in-column CTA
 *   - `handleInsightAction` wires each action to `rateInsightAsPlayer`
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { PlayerCoachHelmDashboardData } from '@/app/golf/actions/insights';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Framer-motion — same passthrough strategy as the InsightCard tests.
vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    useReducedMotion: () => false,
    m: new Proxy(
      {},
      {
        get: (_target, prop) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          React.forwardRef<HTMLElement, any>((props, ref) => {
            const {
              children,
              whileTap: _whileTap,
              whileHover: _whileHover,
              initial: _initial,
              animate: _animate,
              exit: _exit,
              transition: _transition,
              ...rest
            } = props;
            void _whileTap;
            void _whileHover;
            void _initial;
            void _animate;
            void _exit;
            void _transition;
            return React.createElement(prop as string, { ...rest, ref }, children);
          }),
      },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    LazyMotion: ({ children }: { children: React.ReactNode }) => children,
    domAnimation: {},
  };
});

// Drill fetch stub — DrillChips calls this on mount.
vi.mock('@/app/golf/actions/drills', () => ({
  getDrillsForInsight: vi.fn(async () => []),
  recordDrillView: vi.fn(async () => undefined),
}));

// `next/link` uses IntersectionObserver for prefetch. The global setup mock
// isn't a constructor, so we swap Link for a plain anchor tag — this keeps
// the dashboard render synchronous and avoids the observer plumbing entirely.
vi.mock('next/link', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Link = ({ href, children, ...rest }: any) =>
    <a href={typeof href === 'string' ? href : '#'} {...rest}>{children}</a>;
  return { default: Link };
});

// The player-feedback server action is the single thing we assert gets called
// by the unified `handleInsightAction` handler.
const rateInsightAsPlayer = vi.fn(async (_input: unknown) => ({ success: true as const }));
vi.mock('@/app/golf/actions/player-feedback', () => ({
  rateInsightAsPlayer: (input: unknown) => rateInsightAsPlayer(input),
}));

// Avoid rendering the full toast stack — we just care that the handler dispatches.
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

// Keep the heavy CoachHelm sub-components out of the render tree. They have
// their own tests and bring in a lot of nested dependencies. Replace each
// with a marker div so we can still assert the dashboard scaffolding renders.
vi.mock('@/components/golf/coachhelm/player', () => ({
  PerformancePrediction: () => <div data-testid="mock-performance-prediction" />,
  FocusAreasGrid: () => <div data-testid="mock-focus-areas-grid" />,
}));
vi.mock('@/components/golf/coachhelm/player/CompositeRatingCard', () => ({
  CompositeRatingCard: () => <div data-testid="mock-composite-rating-card" />,
}));
vi.mock('@/components/golf/coachhelm/player/TrendDashboard', () => ({
  TrendDashboard: () => <div data-testid="mock-trend-dashboard" />,
}));
vi.mock('@/components/golf/coachhelm/player/ShotAnalysisCard', () => ({
  ShotAnalysisCard: () => <div data-testid="mock-shot-analysis" />,
}));
vi.mock('@/components/golf/coachhelm/player/WhatIfPanel', () => ({
  WhatIfPanel: () => <div data-testid="mock-what-if-panel" />,
}));
vi.mock('@/components/golf/coachhelm/analytics', () => ({
  ShotAnalyticsPanel: () => <div data-testid="mock-shot-analytics-panel" />,
}));
vi.mock('@/components/golf/layout/LargeTitleHeader', () => ({
  LargeTitleHeader: ({
    title,
    children,
  }: {
    title: string;
    children?: React.ReactNode;
  }) => (
    <header data-testid="large-title-header">
      <h1>{title}</h1>
      {children}
    </header>
  ),
}));
vi.mock('@/components/golf/GolfTabBar', () => ({
  GolfTabBar: () => <div data-testid="mock-tab-bar" />,
}));

// Import the component AFTER all vi.mock() calls so the mocks are applied.
import { PlayerCoachHelmDashboard } from '@/app/golf/(dashboard)/dashboard/coachhelm/components/PlayerCoachHelmDashboard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEvidence(overrides: Partial<InsightEvidence> = {}): InsightEvidence {
  return {
    metric: 'putt_make_rate_6_10ft',
    metric_label: '6-10 ft make rate',
    unit: 'percent',
    your_value: 0.38,
    your_value_display: '38%',
    comparison_value: 0.52,
    comparison_label: 'D2 average',
    comparison_source: 'd2_avg',
    sample_n: 47,
    window_days: 30,
    window_start: '2026-03-23T00:00:00.000Z',
    window_end: '2026-04-22T00:00:00.000Z',
    strokes_impact: 2.1,
    strokes_impact_method: 'peer_delta',
    confidence: 0.78,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
    ...overrides,
  };
}

function makeInsight(overrides: Partial<EvidenceInsight> = {}): EvidenceInsight {
  return {
    id: 'insight-top',
    player_id: 'player-1',
    category: 'putting',
    title: 'Your 6-10ft putts are below D2 average',
    content: 'You are making 38% of putts from 6-10 ft, vs D2 average 52%.',
    signature: 'putt_make_rate_6_10ft',
    evidence: makeEvidence(),
    metadata: null,
    lifecycle_state: 'matured',
    status: 'active',
    priority: 'high',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-04-15T12:00:00.000Z',
    updated_at: '2026-04-22T12:00:00.000Z',
    drills: [],
    ...overrides,
  };
}

function makeDashboardData(
  overrides: Partial<PlayerCoachHelmDashboardData> = {},
): PlayerCoachHelmDashboardData {
  return {
    playerId: 'player-1',
    playerName: 'Test Player',
    lastUpdated: '2026-04-22T12:00:00.000Z',
    prediction: null,
    insights: [],
    focusAreas: [
      { area: 'Putting', strokesGained: -0.5, trend: 'stable', recommendation: 'Focus on 6-10ft' },
    ],
    recentRounds: [],
    playerState: 'stable',
    alertLevel: 'none',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlayerCoachHelmDashboard — Insight Delivery refactor', () => {
  it('renders the HeroInsightCard when a topInsight is provided', () => {
    render(
      <PlayerCoachHelmDashboard
        data={makeDashboardData()}
        playerId="player-1"
        topInsight={makeInsight()}
        secondaryInsights={[]}
      />,
    );

    // The hero primitive exposes these testids.
    expect(screen.getByTestId('insight-card-hero')).toBeInTheDocument();
    expect(screen.getByTestId('hero-title')).toBeInTheDocument();
  });

  it('renders one InsightCard per secondary insight and dedupes the hero id', () => {
    const top = makeInsight({ id: 'insight-top' });
    const secondary: EvidenceInsight[] = [
      // Deliberately re-include the top insight — the component must dedupe it.
      makeInsight({ id: 'insight-top', title: 'dup of hero' }),
      makeInsight({ id: 'insight-s1', title: 'secondary one' }),
      makeInsight({ id: 'insight-s2', title: 'secondary two' }),
    ];

    render(
      <PlayerCoachHelmDashboard
        data={makeDashboardData()}
        playerId="player-1"
        topInsight={top}
        secondaryInsights={secondary}
      />,
    );

    // Exactly 2 default-density cards — the hero-id row was deduped.
    expect(screen.getAllByTestId('insight-card-default')).toHaveLength(2);
    // "More for you" header when a hero is present.
    expect(screen.getByText(/more for you/i)).toBeInTheDocument();
  });

  it('shows the empty insights state when neither topInsight nor secondary insights are provided', () => {
    render(
      <PlayerCoachHelmDashboard
        data={makeDashboardData()}
        playerId="player-1"
        topInsight={null}
        secondaryInsights={[]}
      />,
    );

    // No hero, no default cards.
    expect(screen.queryByTestId('insight-card-hero')).toBeNull();
    expect(screen.queryByTestId('insight-card-default')).toBeNull();

    // Friendly empty state copy.
    expect(screen.getByText(/no insights yet/i)).toBeInTheDocument();
  });

  it('uses the "Your insights" header when there is no hero but a secondary feed exists', () => {
    render(
      <PlayerCoachHelmDashboard
        data={makeDashboardData()}
        playerId="player-1"
        topInsight={null}
        secondaryInsights={[
          makeInsight({ id: 'insight-a' }),
          makeInsight({ id: 'insight-b' }),
        ]}
      />,
    );

    expect(screen.getByText(/your insights/i)).toBeInTheDocument();
    expect(screen.getAllByTestId('insight-card-default')).toHaveLength(2);
    // "More for you" only appears with a hero present.
    expect(screen.queryByText(/more for you/i)).toBeNull();
  });

  it('wires handleInsightAction → rateInsightAsPlayer for player ratings', async () => {
    const top = makeInsight({ id: 'insight-action-test' });
    render(
      <PlayerCoachHelmDashboard
        data={makeDashboardData()}
        playerId="player-1"
        topInsight={top}
        secondaryInsights={[]}
      />,
    );

    // Hero action buttons carry the primitive's testids. `action-rate-helpful`
    // fires `rate_helpful`, which the handler maps onto rating='helpful'.
    const helpful = screen.getByTestId('action-rate-helpful');
    fireEvent.click(helpful);

    await waitFor(() => {
      expect(rateInsightAsPlayer).toHaveBeenCalledWith({
        insightId: 'insight-action-test',
        rating: 'helpful',
      });
    });
  });

  it('maps dismissed action onto rating="dismissed"', async () => {
    rateInsightAsPlayer.mockClear();
    render(
      <PlayerCoachHelmDashboard
        data={makeDashboardData()}
        playerId="player-1"
        topInsight={makeInsight({ id: 'insight-dismiss' })}
        secondaryInsights={[]}
      />,
    );

    const dismiss = screen.getByTestId('action-dismissed');
    fireEvent.click(dismiss);

    await waitFor(() => {
      expect(rateInsightAsPlayer).toHaveBeenCalledWith({
        insightId: 'insight-dismiss',
        rating: 'dismissed',
      });
    });
  });

  it('maps acknowledged action onto rating="acknowledged"', async () => {
    rateInsightAsPlayer.mockClear();
    render(
      <PlayerCoachHelmDashboard
        data={makeDashboardData()}
        playerId="player-1"
        topInsight={makeInsight({ id: 'insight-ack' })}
        secondaryInsights={[]}
      />,
    );

    const ack = screen.getByTestId('action-acknowledged');
    fireEvent.click(ack);

    await waitFor(() => {
      expect(rateInsightAsPlayer).toHaveBeenCalledWith({
        insightId: 'insight-ack',
        rating: 'acknowledged',
      });
    });
  });
});
