/**
 * InsightCard primitive tests — Foundation / Task F3.
 *
 * Covers:
 *  - Each density × audience combination renders
 *  - `deriveTone` / `isImprovement` pure helpers
 *  - Drill chips render inline in collapsed default + hero
 *  - Action handlers fire with the correct (action, insightId) signature
 *  - Movement pill + Why popover trigger render when metadata present
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { InsightCard } from '@/components/golf/coachhelm/insight-card/InsightCard';
import {
  deriveTone,
  isImprovement,
} from '@/components/golf/coachhelm/insight-card/tone-derivation';

// Framer-motion's full animation stack is unnecessary for these click tests.
// Re-export its primitives as plain DOM passthroughs so buttons / chips render
// synchronously. Mirrors the pattern used by AIInsightsPanel.test.tsx.
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
  };
});

// Stub `recordDrillView` so DrillChips doesn't touch supabase on click.
vi.mock('@/app/golf/actions/drills', () => ({
  getDrillsForInsight: vi.fn(async () => []),
  recordDrillView: vi.fn(async () => undefined),
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
    strokes_impact: 2.1,
    strokes_impact_method: 'peer_delta',
    confidence: 0.78,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
    ...overrides,
  };
}

function makeInsight(overrides: Partial<EvidenceInsight> = {}): EvidenceInsight {
  return {
    id: 'insight-1',
    player_id: 'player-1',
    category: 'putting',
    title: 'the player needs work on 6-10ft putts',
    content: 'the player is making 38% of putts from 6-10 ft, below the D2 average.',
    signature: 'putt_make_rate_6_10ft',
    evidence: makeEvidence(),
    metadata: null,
    lifecycle_state: 'matured',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-04-15T12:00:00.000Z',
    updated_at: '2026-04-22T12:00:00.000Z',
    drills: [
      { id: 'd1', slug: 'gate-drill', title: 'Gate drill', duration_min: 10, difficulty: 'beginner' },
      { id: 'd2', slug: 'ladder-drill', title: 'Ladder drill', duration_min: 15, difficulty: 'intermediate' },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// tone-derivation
// ---------------------------------------------------------------------------

describe('deriveTone', () => {
  it('returns "celebratory" when lifecycle_state is resolved', () => {
    expect(deriveTone(makeInsight({ lifecycle_state: 'resolved' }))).toBe('celebratory');
  });

  it('returns "urgent" when priority is urgent', () => {
    expect(deriveTone(makeInsight({ priority: 'urgent' }))).toBe('urgent');
  });

  it('returns "urgent" when category=pressure and |strokes_impact|>2', () => {
    const insight = makeInsight({
      category: 'pressure',
      evidence: makeEvidence({ strokes_impact: 2.5 }),
    });
    expect(deriveTone(insight)).toBe('urgent');
  });

  it('returns "cautionary" when priority=high', () => {
    expect(deriveTone(makeInsight({ priority: 'high' }))).toBe('cautionary');
  });

  it('returns "cautionary" when impact*confidence > 1.0', () => {
    const insight = makeInsight({
      evidence: makeEvidence({ strokes_impact: 1.8, confidence: 0.8 }),
    });
    expect(deriveTone(insight)).toBe('cautionary');
  });

  it('returns "encouraging" when your_value beats comparison on a positive metric', () => {
    const insight = makeInsight({
      priority: 'low',
      evidence: makeEvidence({
        your_value: 0.6,
        comparison_value: 0.45,
        strokes_impact: 0.3,
        confidence: 0.6,
      }),
    });
    expect(deriveTone(insight)).toBe('encouraging');
  });

  it('returns "neutral" as the default fallback', () => {
    const insight = makeInsight({
      priority: 'low',
      evidence: makeEvidence({
        your_value: 0.3,
        comparison_value: 0.5,
        strokes_impact: 0.2,
        confidence: 0.3,
      }),
    });
    expect(deriveTone(insight)).toBe('neutral');
  });
});

describe('isImprovement', () => {
  it('treats "up" as improvement on positive-polarity metrics', () => {
    expect(isImprovement('up', 'putt_make_rate_6_10ft')).toBe(true);
    expect(isImprovement('up', 'fairway_hit_pct')).toBe(true);
    expect(isImprovement('down', 'gir_pct')).toBe(false);
  });

  it('treats "down" as improvement on negative-polarity metrics', () => {
    expect(isImprovement('down', 'miss_severity')).toBe(true);
    expect(isImprovement('up', 'miss_severity')).toBe(false);
    expect(isImprovement('down', 'score_to_par')).toBe(true);
    expect(isImprovement('down', 'dispersion_stddev')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Render matrix — density × audience
// ---------------------------------------------------------------------------

describe('InsightCard render matrix', () => {
  it('renders the compact row', () => {
    render(<InsightCard insight={makeInsight()} density="compact" audience="player" />);
    expect(screen.getByTestId('insight-card-compact')).toBeInTheDocument();
  });

  it('renders the default card with drill chips inline (Rule 3)', () => {
    render(<InsightCard insight={makeInsight()} density="default" audience="player" />);
    expect(screen.getByTestId('insight-card-default')).toBeInTheDocument();
    // Drills visible on the collapsed state — no expand click needed.
    expect(screen.getByTestId('drill-chips')).toBeInTheDocument();
    // All drill chips rendered.
    expect(screen.getAllByTestId('drill-chip').length).toBe(2);
  });

  it('renders the hero card with Fraunces-stamped hero-title + metric slots', () => {
    render(<InsightCard insight={makeInsight()} density="hero" audience="player" onAction={vi.fn()} />);
    expect(screen.getByTestId('insight-card-hero')).toBeInTheDocument();
    expect(screen.getByTestId('hero-title')).toBeInTheDocument();
    expect(screen.getByTestId('hero-strokes-impact')).toBeInTheDocument();
    // Drill chips visible inline in hero (Rule 3).
    expect(screen.getByTestId('drill-chips')).toBeInTheDocument();
  });

  it('rewrites player-audience copy to 2nd person', () => {
    render(<InsightCard insight={makeInsight()} density="hero" audience="player" onAction={vi.fn()} />);
    const title = screen.getByTestId('hero-title');
    // "the player" → "you"
    expect(title.textContent?.toLowerCase()).toContain('you');
    expect(title.textContent?.toLowerCase()).not.toContain('the player');
  });

  it('preserves coach-audience copy verbatim', () => {
    render(<InsightCard insight={makeInsight()} density="hero" audience="coach" onAction={vi.fn()} />);
    const title = screen.getByTestId('hero-title');
    expect(title.textContent?.toLowerCase()).toContain('the player');
  });

  it('renders the "Why?" trigger on default density', () => {
    render(<InsightCard insight={makeInsight()} density="default" audience="player" />);
    expect(screen.getByTestId('why-popover-trigger')).toBeInTheDocument();
  });

  it('renders the movement pill when metadata.movement is present', () => {
    const insight = makeInsight({
      metadata: {
        movement: { from: 0.3, to: 0.38, direction: 'up', percent_change: 0.26 },
      },
    });
    render(<InsightCard insight={insight} density="default" audience="player" />);
    expect(screen.getByTestId('movement-pill')).toBeInTheDocument();
  });

  it('hides the movement pill when metadata.movement is missing', () => {
    render(<InsightCard insight={makeInsight()} density="default" audience="player" />);
    expect(screen.queryByTestId('movement-pill')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Action firing
// ---------------------------------------------------------------------------

describe('InsightCard actions', () => {
  it('fires player actions with (action, insightId) when expanded', async () => {
    const onAction = vi.fn(async () => undefined);
    render(
      <InsightCard
        insight={makeInsight()}
        density="default"
        audience="player"
        onAction={onAction}
      />,
    );
    // Expand the card so the actions row is visible.
    fireEvent.click(screen.getByRole('button', { name: /expand insight/i }));
    fireEvent.click(screen.getByTestId('action-rate-helpful'));

    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith('rate_helpful', 'insight-1'),
    );
  });

  // TODO(plan-03 + user-wip): see src/test/SKIPPED.md.
  it.skip('fires coach actions including create_focus_area', async () => {
    const onAction = vi.fn(async () => undefined);
    render(
      <InsightCard
        insight={makeInsight()}
        density="hero"
        audience="coach"
        onAction={onAction}
        showActions
      />,
    );
    fireEvent.click(screen.getByTestId('action-create-focus-area'));
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith('create_focus_area', 'insight-1'),
    );
  });

  it('does not render action row when onAction is omitted', () => {
    render(
      <InsightCard insight={makeInsight()} density="hero" audience="player" />,
    );
    expect(screen.queryByTestId('action-rate-helpful')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Audience parity — same insight row, different surface
// ---------------------------------------------------------------------------

describe('InsightCard audience switching', () => {
  // TODO(plan-03 + user-wip): see src/test/SKIPPED.md.
  it.skip('renders different action buttons for player vs coach', () => {
    const onAction = vi.fn();

    const { unmount } = render(
      <InsightCard
        insight={makeInsight()}
        density="hero"
        audience="player"
        onAction={onAction}
      />,
    );
    expect(screen.getByTestId('action-rate-helpful')).toBeInTheDocument();
    expect(screen.queryByTestId('action-create-focus-area')).toBeNull();
    unmount();

    render(
      <InsightCard
        insight={makeInsight()}
        density="hero"
        audience="coach"
        onAction={onAction}
        // Coach audience requires explicit showActions since the default
        // (player-only) would hide the action row.
        showActions
      />,
    );
    expect(screen.getByTestId('action-create-focus-area')).toBeInTheDocument();
    expect(screen.queryByTestId('action-rate-helpful')).toBeNull();
  });
});
