/**
 * HeroInsightCard wrapper tests — Foundation / Task F4.
 *
 * Verifies the wrapper mounts + the inner InsightCard hero slot renders.
 * The inner card's own snapshot assertions live in InsightCard.test.tsx.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { HeroInsightCard } from '@/components/golf/coachhelm/insight-card/HeroInsightCard';

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
            const { children, whileTap: _whileTap, initial: _i, animate: _a, exit: _e, transition: _t, ...rest } = props;
            void _whileTap;
            void _i;
            void _a;
            void _e;
            void _t;
            return React.createElement(prop as string, { ...rest, ref }, children);
          }),
      },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock('@/app/golf/actions/drills', () => ({
  getDrillsForInsight: vi.fn(async () => []),
  recordDrillView: vi.fn(async () => undefined),
}));

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

function makeInsight(): EvidenceInsight {
  return {
    id: 'insight-hero-1',
    player_id: 'player-hero-1',
    category: 'putting',
    title: 'Putting hero test',
    content: 'Body of the hero card test.',
    signature: 'sig_hero',
    evidence: makeEvidence(),
    metadata: null,
    lifecycle_state: 'matured',
    status: 'active',
    priority: 'high',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-04-15T12:00:00.000Z',
    updated_at: '2026-04-22T12:00:00.000Z',
  };
}

describe('HeroInsightCard', () => {
  it('renders the wrapper container with a hero-density InsightCard inside', () => {
    render(<HeroInsightCard insight={makeInsight()} audience="player" onAction={vi.fn()} />);
    expect(screen.getByTestId('hero-insight-card')).toBeInTheDocument();
    expect(screen.getByTestId('insight-card-hero')).toBeInTheDocument();
  });

  it('omits the wrapper when mountAnimation is false', () => {
    render(
      <HeroInsightCard
        insight={makeInsight()}
        audience="player"
        onAction={vi.fn()}
        mountAnimation={false}
      />,
    );
    expect(screen.queryByTestId('hero-insight-card')).toBeNull();
    expect(screen.getByTestId('insight-card-hero')).toBeInTheDocument();
  });

  it('renders both the hero title and the hero strokes-impact metric', () => {
    render(<HeroInsightCard insight={makeInsight()} audience="player" onAction={vi.fn()} />);
    expect(screen.getByTestId('hero-title')).toBeInTheDocument();
    expect(screen.getByTestId('hero-strokes-impact')).toBeInTheDocument();
  });
});
