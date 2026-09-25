// @vitest-environment jsdom
/**
 * ============================================================================
 * PlayerHubFeed — the CoachHelm overview (2026-09-24 rebuild)
 * ----------------------------------------------------------------------------
 * Carries forward what the old bento suite pinned (the top insight's rating
 * round-trip, its first drill, the themes flag gate, honest empty states,
 * every destination reachable) and pins what the rebuild adds: one primary
 * action, insight units with a cause chain and an evidence rail, trends with
 * a word and a delta that agree, situations named as situations, and no
 * em-dash placeholders.
 *
 * Mounts the real `StageRouter` so `useStage()` resolves for real.
 * ========================================================================== */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StageRouter } from '@/components/fairway/modules';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { ThemeNode, CauseNode } from '@/lib/coachhelm/v3/themes/types';
import { PlayerHubFeed, type PlayerHubFeedProps } from '../PlayerHubFeed';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function insight(id: string, overrides: Partial<EvidenceInsight> = {}): EvidenceInsight {
  return {
    id,
    player_id: 'p-1',
    category: 'putting',
    title: `Insight ${id}`,
    content: 'Prose.',
    signature: null,
    evidence: {
      metric: 'putts_made_3_5ft_pct',
      metric_label: '3-5 ft makes',
      unit: 'percent',
      your_value: 0.48,
      your_value_display: '48%',
      comparison_value: 0.71,
      comparison_label: 'Team',
      comparison_source: 'team_avg',
      secondary_value: 0.91,
      secondary_label: 'PGA Tour',
      sample_n: 44,
      window_days: 30,
      window_start: '2026-08-01',
      window_end: '2026-08-31',
      strokes_impact: 1.1,
      strokes_impact_method: 'counterfactual',
      confidence: 0.8,
      confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
      diagnosis: {
        symptom: 'You make 48% from 3 to 5 ft',
        root_cause: 'Misses finish high side',
        causality_level: 'inferred_hypothesis',
        drivers: [],
        recommended_action: 'Gate drill',
        confidence_reason: '',
      },
    },
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority: 'high',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-08-31T00:00:00Z',
    updated_at: '2026-08-31T00:00:00Z',
    ...overrides,
  } as EvidenceInsight;
}

function theme(overrides: Partial<ThemeNode>): ThemeNode {
  return {
    category: 'putting',
    sgMetricId: 'sg_putting',
    displayLabel: 'Putting',
    isOutcomeTheme: false,
    themeStrokesPerRound: 0,
    tourGapPerRound: 0,
    sgPerRound: null,
    causes: [],
    state: 'thin',
    ...overrides,
  } as ThemeNode;
}

const cause = { insight_id: 'c-1', title: 'Lag speed', strokesSavedPerRound: 0.4, tourGapPerRound: 0.9, counterfactualSuppressed: false } as unknown as CauseNode;

function props(overrides: Partial<PlayerHubFeedProps> = {}): PlayerHubFeedProps {
  return {
    topInsight: insight('top', { drills: [{ id: 'd1', slug: 'gate', title: 'Gate drill', duration_min: 15, difficulty: 'easy' }] }),
    secondaryInsights: [insight('two'), insight('three'), insight('four')],
    themes: [
      theme({
        state: 'leak',
        causes: [cause],
        trend: { direction: 'improving', recentAvg: 0.1, priorAvg: -0.2, delta: 0.3, recentN: 5, priorN: 5 },
      }),
    ],
    themesEnabled: true,
    trendData: {
      trends: {
        windows: [
          { name: 'fast', size: 5, slope: -0.4, direction: 'improving' },
          { name: 'medium', size: 12, slope: -0.1, direction: 'improving' },
        ],
      },
    },
    patterns: [{ area: 'In tournament', strokesGained: -6.42, unit: 'strokes/round' }],
    prediction: { predictedValue: 2.3, predictedRangeLow: -1.2, predictedRangeHigh: 5.1, metric: 'score_to_par' } as never,
    recentRounds: [{ id: 'r1', courseName: 'Pebble', date: '2026-09-20', score: 76, scoreToPar: 4, hasReview: true }],
    roundsBasis: 12,
    lastUpdated: '2026-09-24T10:00:00Z',
    planAreas: [{ id: 'fa-1', area_type: 'putting', title: 'Lag putting', baseline_value: 61, current_value: 63, target_value: 66 } as never],
    onRate: vi.fn(),
    ...overrides,
  };
}

function renderFeed(overrides: Partial<PlayerHubFeedProps> = {}) {
  window.history.replaceState(null, '', '/golf/dashboard/coachhelm');
  const p = props(overrides);
  const utils = render(
    <StageRouter
      param="view"
      homeKey="home"
      views={[
        { key: 'home', node: <PlayerHubFeed {...p} /> },
        { key: 'insights', node: <p>Insights view</p> },
        { key: 'development', node: <p>Development view</p> },
      ]}
    />,
  );
  return { ...utils, props: p };
}

describe('PlayerHubFeed', () => {
  it('leads with CoachHelm read: trend headline, next-round window, last round, and exactly one primary action', () => {
    const { container } = renderFeed();
    expect(screen.getByText('Your scores are coming down')).toBeInTheDocument();
    expect(screen.getByText(/12 rounds · Updated Sep 24/)).toBeInTheDocument();
    expect(container.querySelector('[data-slot="next-round-window"]')).toHaveTextContent('+2.3');
    expect(container.querySelector('[data-slot="next-round-window"]')).toHaveTextContent('−1.2 to +5.1 to par');
    expect(container.querySelector('[data-slot="last-round"]')).toHaveTextContent('76+4Sep 20 · Pebble');
    const primaries = container.querySelectorAll('[data-variant="primary"]');
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent('Log a round');
    expect(primaries[0]).toHaveAttribute('href', '/golf/dashboard/rounds/new');
  });

  it('shows what is changing with a word and a delta that agree (one sign convention)', () => {
    const { container } = renderFeed();
    const windows = container.querySelector('[data-slot="scoring-windows"]') as HTMLElement;
    expect(within(windows).getByText('1.6 strokes lower')).toHaveClass('text-accent-ink');
    const slopes = container.querySelector('[data-slot="driver-slopes"]') as HTMLElement;
    expect(within(slopes).getByText('+0.30 a round')).toHaveClass('text-accent-ink');
    expect(within(slopes).getByText('Improving').closest('[data-slot="sense-word"]')).toHaveAttribute('data-sense', 'better');
  });

  it('renders each insight as a unit: claim, cause chain with a Likely marker, evidence rail, sample, read band', () => {
    const { container } = renderFeed();
    const units = container.querySelectorAll('[data-slot="hub-insight"]');
    // Top + the first two secondary insights; the rest sit behind "All 4 insights".
    expect(units).toHaveLength(3);
    const lead = units[0] as HTMLElement;
    expect(lead).toHaveAttribute('data-lead', 'true');
    expect(within(lead).getByRole('heading', { name: 'Insight top' })).toBeInTheDocument();
    const chain = lead.querySelector('[data-slot="cause-chain"]') as HTMLElement;
    expect(chain).toHaveTextContent('What we seeYou make 48% from 3 to 5 ft');
    expect(chain).toHaveTextContent('What it is worthAbout 1.1 strokes a round');
    expect(within(chain).getByText('Likely')).toBeInTheDocument();
    const rail = lead.querySelector('[data-slot="evidence-rail"]') as HTMLElement;
    expect(rail).toHaveTextContent('You48%');
    expect(rail).toHaveTextContent('Team71%');
    expect(rail).toHaveTextContent('PGA Tour91%');
    expect(lead).toHaveTextContent('44 putts over 30 days · Data through Aug 31 · Built before your last round');
    expect(within(lead).getByText('Strong read')).toBeInTheDocument();
    expect(within(lead).getByText('Gate drill')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /all 4 insights/i })).toBeInTheDocument();
  });

  it('rates the lead insight only, from a More menu (HUB-04: one visible action)', async () => {
    const { props: p } = renderFeed();
    // Not visible buttons any more; one "More" trigger on the lead insight.
    expect(screen.queryByRole('button', { name: 'Helpful' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /more insight actions/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /more insight actions/i }));
    fireEvent.click(await screen.findByText('Helpful'));
    fireEvent.click(screen.getByRole('button', { name: /more insight actions/i }));
    fireEvent.click(await screen.findByText('Dismiss'));
    expect(p.onRate).toHaveBeenNthCalledWith(1, 'top', 'helpful');
    expect(p.onRate).toHaveBeenNthCalledWith(2, 'top', 'dismissed');
  });

  it('opens the insight deep link and the plan in place', () => {
    const first = renderFeed();
    fireEvent.click(screen.getAllByRole('button', { name: 'See the evidence' })[1]!);
    expect(screen.getByText('Insights view')).toBeInTheDocument();
    const params = new URLSearchParams(window.location.search);
    expect(params.get('view')).toBe('insights');
    expect(params.get('insight')).toBe('two');
    first.unmount();

    renderFeed();
    fireEvent.click(screen.getByRole('button', { name: /open your plan/i }));
    expect(screen.getByText('Development view')).toBeInTheDocument();
  });

  it('names mined patterns as situations with an unsigned score gap, and ranks causes by strokes to win back', () => {
    const { container } = renderFeed();
    const situations = container.querySelector('[data-slot="situations"]') as HTMLElement;
    expect(situations).toHaveTextContent('Tournament rounds');
    expect(within(situations).getByText('6.4 strokes higher')).toHaveClass('text-fw-danger-ink');
    expect(situations).not.toHaveTextContent('In tournament');
    const leaks = container.querySelector('[data-slot="leak-bars"]') as HTMLElement;
    expect(leaks).toHaveTextContent('Lag speed');
    expect(leaks).toHaveTextContent('0.40 a round');
    expect(leaks).toHaveTextContent('0.90 to Tour level');
  });

  it('gates the theme-derived sections on the themes flag', () => {
    const { container } = renderFeed({ themesEnabled: false });
    expect(container.querySelector('[data-slot="driver-slopes"]')).toBeNull();
    expect(container.querySelector('[data-slot="leak-bars"]')).toBeNull();
    // Situations are not theme-derived, so the patterns section stays.
    expect(container.querySelector('[data-slot="situations"]')).not.toBeNull();
  });

  it('degrades honestly with no data: no fabricated trend, no prediction placeholder, no em dash', () => {
    const { container } = renderFeed({
      topInsight: null,
      secondaryInsights: [],
      themes: [],
      trendData: null,
      patterns: [],
      prediction: null,
      recentRounds: [],
      roundsBasis: null,
      planAreas: [],
    });
    expect(screen.getByText('Here is what CoachHelm sees in your game')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "What's changing" })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Patterns behind your scores' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Your plan' })).toBeNull();
    expect(screen.getByText('No root cause stands out yet')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="next-round-window"]')).toBeNull();
    expect(container.textContent).not.toContain('—');
  });

  it('never nests a control inside another control', () => {
    const { container } = renderFeed();
    for (const el of Array.from(container.querySelectorAll('button, a'))) {
      expect(el.querySelector('button, a')).toBeNull();
    }
  });
});
