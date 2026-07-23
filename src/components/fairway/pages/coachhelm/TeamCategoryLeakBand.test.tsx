// @vitest-environment jsdom
/**
 * ============================================================================
 * TeamCategoryLeakBand — "where the team is bleeding strokes" band
 * ----------------------------------------------------------------------------
 * Pins the wiring this component exists to fix: `getTeamCategoryInsights`'s
 * `categories[]` + `teamHealth` were fetched every page load and thrown away
 * (CoachIntelligenceHome.tsx never read past `playerCount`). This locks the
 * honest per-category rendering — team avg, trend, worst offenders,
 * strokesSavedPerRound chips, the "Awaiting rounds" degrade for an unscored
 * category, and the null-render for a genuinely empty categories[].
 * ========================================================================== */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TeamCategory } from '@/app/golf/actions/team-category-insights';
import { TeamCategoryLeakBand } from './TeamCategoryLeakBand';

// Framer-motion passthrough (same pattern as HubInsightSignalCard.test.tsx /
// InsightCard.test.tsx / ChatMessageList.test.tsx) — `m.div` renders as a
// plain DOM element so `useReducedMotionGuard`'s underlying
// `useReducedMotion()` resolves deterministically in jsdom.
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
            const { children, initial: _initial, animate: _animate, transition: _transition, ...rest } = props;
            void _initial;
            void _animate;
            void _transition;
            return React.createElement(prop as string, { ...rest, ref }, children);
          }),
      },
    ),
  };
});

function makeCategory(overrides: Partial<TeamCategory> = {}): TeamCategory {
  return {
    id: 'putting',
    label: 'Putting',
    teamAvg: 31.2,
    teamAvgLabel: '31.2 PPR',
    trend: 'declining',
    insights: [],
    players: [
      {
        playerId: 'p-1',
        playerName: 'Alex Rivera',
        avatarUrl: null,
        value: 33.4,
        trend: 'declining',
        trendDelta: 1.2,
        needsAttention: true,
      },
      {
        playerId: 'p-2',
        playerName: 'Jordan Lee',
        avatarUrl: null,
        value: 30.1,
        trend: 'stable',
        trendDelta: 0,
        needsAttention: false,
      },
    ],
    primaryMetric: 'Putts/Round',
    attentionCount: 1,
    ...overrides,
  };
}

describe('TeamCategoryLeakBand', () => {
  it('renders nothing when there are no categories', () => {
    const { container } = render(<TeamCategoryLeakBand categories={[]} teamHealth={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the header, team health dial, and each category label + team avg', () => {
    render(
      <TeamCategoryLeakBand
        categories={[makeCategory(), makeCategory({ id: 'approach', label: 'Approach', teamAvgLabel: '62% GIR' })]}
        teamHealth={74}
      />,
    );
    expect(screen.getByText('Where the team is bleeding strokes')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Composite 74 of 100' })).toBeInTheDocument();
    expect(screen.getByText('Putting')).toBeInTheDocument();
    expect(screen.getByText('31.2 PPR')).toBeInTheDocument();
    expect(screen.getByText('Approach')).toBeInTheDocument();
    expect(screen.getByText('62% GIR')).toBeInTheDocument();
  });

  it('surfaces the worst-offender player(s) flagged needsAttention', () => {
    render(<TeamCategoryLeakBand categories={[makeCategory()]} teamHealth={70} />);
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
    // Jordan Lee isn't flagged needsAttention — not promoted to the offenders list.
    expect(screen.queryByText('Jordan Lee')).not.toBeInTheDocument();
  });

  it('renders an honest "Awaiting rounds" degrade for a category with zero scored players', () => {
    render(
      <TeamCategoryLeakBand
        categories={[makeCategory({ id: 'short_game', label: 'Short Game', teamAvgLabel: 'No data', players: [], attentionCount: 0 })]}
        teamHealth={50}
      />,
    );
    expect(screen.getByText('Awaiting rounds')).toBeInTheDocument();
    // Never a fabricated "0 of 0 need work" / "0 of 0 on track" claim.
    expect(screen.queryByText(/of 0/)).not.toBeInTheDocument();
  });

  it('renders strokesSavedPerRound chips only from insights that carry a positive figure', () => {
    render(
      <TeamCategoryLeakBand
        categories={[
          makeCategory({
            insights: [
              { id: 'i1', message: 'Three-putts climbing', tone: 'negative', strokesSavedPerRound: 0.8 },
              { id: 'i2', message: 'No live counterfactual', tone: 'neutral', strokesSavedPerRound: null },
            ],
          }),
        ]}
        teamHealth={70}
      />,
    );
    expect(screen.getByText('+0.8 str/rd available')).toBeInTheDocument();
  });

  it('shows an "on track" badge when nobody needs attention', () => {
    render(
      <TeamCategoryLeakBand
        categories={[
          makeCategory({
            attentionCount: 0,
            players: [
              { playerId: 'p-1', playerName: 'Alex Rivera', avatarUrl: null, value: 30, trend: 'stable', trendDelta: 0, needsAttention: false },
            ],
          }),
        ]}
        teamHealth={90}
      />,
    );
    expect(screen.getByText('1 of 1 on track')).toBeInTheDocument();
  });
});
