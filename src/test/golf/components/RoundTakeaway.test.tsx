/**
 * RoundTakeaway tests — Round Review team.
 *
 * Verifies the hero takeaway wrapper:
 *  - Renders <HeroInsightCard> + the framing line when insight is provided
 *  - Renders the fallback card when insight === null
 *  - Pre-header flips between "biggest leak" and "bright spot" based on tone
 *  - Framing line strokes-impact math rounds correctly against round score
 *  - Action row exposes "Add focus area" + "Open in CoachHelm" deep links
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { RoundTakeaway } from '@/components/golf/coachhelm/round-review/RoundTakeaway';

// Framer motion → plain DOM for deterministic rendering.
vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    useReducedMotion: () => false,
    m: new Proxy(
      {},
      {
        get: (_t, prop) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          React.forwardRef<HTMLElement, any>((props, ref) => {
            const {
              children,
              whileTap: _wt,
              whileHover: _wh,
              initial: _i,
              animate: _a,
              exit: _e,
              transition: _tr,
              ...rest
            } = props;
            void _wt;
            void _wh;
            void _i;
            void _a;
            void _e;
            void _tr;
            return React.createElement(prop as string, { ...rest, ref }, children);
          }),
      },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

// Avoid touching supabase inside drill chip click handlers.
vi.mock('@/app/golf/actions/drills', () => ({
  getDrillsForInsight: vi.fn(async () => []),
  recordDrillView: vi.fn(async () => undefined),
}));

// Avoid the `next/navigation` router for these pure presentation tests.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

// Stub the rating server action so the hero's InsightCard click-handlers
// never hit the network path in tests.
vi.mock('@/app/golf/actions/player-feedback', () => ({
  rateInsightAsPlayer: vi.fn(async () => ({ success: true })),
}));

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
    strokes_impact: 2.7,
    strokes_impact_method: 'peer_delta',
    confidence: 0.78,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
    ...overrides,
  };
}

function makeInsight(overrides: Partial<EvidenceInsight> = {}): EvidenceInsight {
  return {
    id: 'insight-takeaway-1',
    player_id: 'player-1',
    category: 'putting',
    title: '6-10 ft putting gap',
    content: 'You are making 38% from 6-10 ft while your peers make 52%.',
    signature: 'sig_putting_6_10ft',
    evidence: makeEvidence(),
    metadata: null,
    lifecycle_state: 'matured',
    status: 'active',
    priority: 'high',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-04-15T12:00:00.000Z',
    updated_at: '2026-04-22T12:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RoundTakeaway', () => {
  it('renders the hero insight card when an insight is provided', () => {
    render(
      <RoundTakeaway insight={makeInsight()} roundScore={4} roundId="round-abc" />,
    );

    // Wrapper section tagged with the test id.
    expect(screen.getByTestId('round-takeaway')).toBeInTheDocument();
    // Hero card mounted (HeroInsightCard emits this id).
    expect(screen.getByTestId('hero-insight-card')).toBeInTheDocument();
    // Inner primitive rendered at hero density.
    expect(screen.getByTestId('insight-card-hero')).toBeInTheDocument();
  });

  it('shows the "biggest leak" pre-header for a cautionary/urgent tone', () => {
    render(
      <RoundTakeaway
        insight={makeInsight({ priority: 'high' })}
        roundScore={4}
        roundId="round-abc"
      />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: /biggest leak/i }),
    ).toBeInTheDocument();
  });

  // TODO(plan-03 + user-wip): see src/test/SKIPPED.md.
  it.skip('shows the "bright spot" pre-header when the tone is celebratory', () => {
    render(
      <RoundTakeaway
        insight={makeInsight({ lifecycle_state: 'resolved' })}
        roundScore={-2}
        roundId="round-abc"
      />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: /bright spot/i }),
    ).toBeInTheDocument();
  });

  it('renders the strokes-impact framing line referencing the round score', () => {
    render(
      <RoundTakeaway
        insight={makeInsight({ evidence: makeEvidence({ strokes_impact: 2.7 }) })}
        roundScore={5}
        roundId="round-abc"
      />,
    );
    const framing = screen.getByTestId('round-takeaway-framing');
    // strokes_impact=2.7 → rounds to 3. Round score +5 shown in the line.
    expect(framing.textContent).toMatch(/~3 strokes/);
    expect(framing.textContent).toMatch(/\+5/);
  });

  it('pivots to "locking in" copy when the round was under par', () => {
    render(
      <RoundTakeaway
        insight={makeInsight({ evidence: makeEvidence({ strokes_impact: 1.4 }) })}
        roundScore={-3}
        roundId="round-abc"
      />,
    );
    const framing = screen.getByTestId('round-takeaway-framing');
    expect(framing.textContent).toMatch(/lock/i);
    // 1.4 → rounds to 1. Ensures we still surface the magnitude.
    expect(framing.textContent).toMatch(/~1 strokes/);
  });

  it('falls back to generic copy when round score is null', () => {
    render(
      <RoundTakeaway
        insight={makeInsight({ evidence: makeEvidence({ strokes_impact: 2.1 }) })}
        roundScore={null}
        roundId="round-abc"
      />,
    );
    const framing = screen.getByTestId('round-takeaway-framing');
    expect(framing.textContent).toMatch(/worth ~2 strokes per round/i);
  });

  it('exposes "Add focus area" and "Open in CoachHelm" links pre-filled with the insight id', () => {
    render(
      <RoundTakeaway insight={makeInsight()} roundScore={4} roundId="round-abc" />,
    );
    const focusLink = screen.getByTestId('round-takeaway-add-focus');
    // RoundTakeaway component was reworked to land on the player's
    // "My Development" surface with a suggestion query-param, replacing
    // the older /development/new?insight= flow.
    expect(focusLink).toHaveAttribute(
      'href',
      '/golf/dashboard/my-development?suggested-insight=insight-takeaway-1',
    );

    const coachLink = screen.getByTestId('round-takeaway-open-coachhelm');
    expect(coachLink).toHaveAttribute(
      'href',
      '/golf/dashboard/coachhelm?focus=insight-takeaway-1',
    );
  });

  it('renders the empty-state fallback when insight is null', () => {
    render(<RoundTakeaway insight={null} roundScore={4} roundId="round-abc" />);
    expect(screen.getByTestId('round-takeaway-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('round-takeaway')).toBeNull();
    expect(screen.queryByTestId('hero-insight-card')).toBeNull();
    expect(screen.getByText(/No standout takeaway/i)).toBeInTheDocument();
    expect(screen.getByText(/keep logging/i)).toBeInTheDocument();
  });
});
