/**
 * CoachInsightCard (Wave 1A) — consumer-level tests.
 *
 * Covers the coach-facing surface that was migrated to the unified
 * `InsightCard` primitive in Wave 1A and is still live post Wave-W1
 * legacy-tree deletion:
 *
 *   1. `InsightsFeed` — renders N cards in `default` density.
 *
 * (`CoachAlertCenter` and `PlayerInsightClient` were deleted in Wave W1 — see
 * the removed-test notes below.)
 *
 * The primitive itself is covered by `InsightCard.test.tsx`. These tests
 * assert the consumers call `getInsightsForCoach` correctly and wire actions
 * (acknowledge / dismiss / create_focus_area) to the right server actions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';

// ---------------------------------------------------------------------------
// framer-motion stub — DOM passthroughs so click targets render synchronously.
// Mirrors the pattern in InsightCard.test.tsx.
// ---------------------------------------------------------------------------
vi.mock('framer-motion', async () => {
  const React = await import('react');
  const passthrough = new Proxy(
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
            transition: _t2,
            variants: _v,
            layout: _l,
            drag: _d,
            dragConstraints: _dc,
            dragElastic: _de,
            onDragStart: _ods,
            onDrag: _od,
            onDragEnd: _ode,
            ...rest
          } = props;
          void _wt;
          void _wh;
          void _i;
          void _a;
          void _e;
          void _t2;
          void _v;
          void _l;
          void _d;
          void _dc;
          void _de;
          void _ods;
          void _od;
          void _ode;
          return React.createElement(prop as string, { ...rest, ref }, children);
        }),
    },
  );
  return {
    m: passthrough,
    motion: passthrough,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    LazyMotion: ({ children }: { children: React.ReactNode }) => children,
    MotionConfig: ({ children }: { children: React.ReactNode }) => children,
    domAnimation: {},
    domMax: {},
    useReducedMotion: () => false,
  };
});

// ---------------------------------------------------------------------------
// Mocks: server actions. We mock every touched module so the tests never
// actually hit Supabase or Next.js navigation machinery.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetInsightsForCoach = vi.fn() as any;

vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getInsightsForCoach: (...args: unknown[]) => mockGetInsightsForCoach(...args),
}));

const mockAcknowledge = vi.fn(async (..._args: unknown[]) => ({ success: true }));
const mockDismiss = vi.fn(async (..._args: unknown[]) => ({ success: true }));
const mockGenerate = vi.fn(async () => ({ success: true }));

vi.mock('@/app/golf/actions/insights', () => ({
  acknowledgeInsight: (...args: unknown[]) => mockAcknowledge(...args),
  dismissInsight: (...args: unknown[]) => mockDismiss(...args),
  generateTeamInsights: () => mockGenerate(),
}));

const mockCreateFocusArea = vi.fn(async (..._args: unknown[]) => ({
  success: true,
  data: { focusAreaId: 'fa-1' },
}));

vi.mock('@/app/golf/actions/development', () => ({
  createFocusAreaFromInsight: (...args: unknown[]) => mockCreateFocusArea(...args),
}));

vi.mock('@/app/golf/actions/drills', () => ({
  getDrillsForInsight: vi.fn(async () => []),
  recordDrillView: vi.fn(async () => undefined),
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/golf/dashboard/insights',
  useSearchParams: () => new URLSearchParams(),
}));

// Top-level mock for golf-user-context so PlayerInsightClient has a coachId.
vi.mock('@/contexts/golf-user-context', () => ({
  useGolfUser: () => ({ coachId: 'coach-1', teamId: 'team-1' }),
}));

// Override the default vi.fn() IntersectionObserver with a real class — next/link's
// prefetch calls `new IntersectionObserver(...)`, and arrow-function mocks aren't
// constructable. The default setup in setup.tsx works for most tests but breaks
// when next/link's prefetch fires in an effect.
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = '';
  thresholds = [];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IntersectionObserver = MockIntersectionObserver;

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
    priority: 'high',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-04-15T12:00:00.000Z',
    updated_at: '2026-04-22T12:00:00.000Z',
    drills: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockGetInsightsForCoach.mockReset();
  mockAcknowledge.mockClear();
  mockDismiss.mockClear();
  mockGenerate.mockClear();
  mockCreateFocusArea.mockClear();
  mockPush.mockClear();
});

// ===========================================================================
// InsightsFeed (coach)
// ===========================================================================

describe('InsightsFeed (coach)', () => {
  it('fetches via getInsightsForCoach and renders a default-density card per row', async () => {
    const rows = [
      makeInsight({ id: 'i-1', title: 'Row 1' }),
      makeInsight({ id: 'i-2', title: 'Row 2' }),
      makeInsight({ id: 'i-3', title: 'Row 3' }),
    ];
    mockGetInsightsForCoach.mockResolvedValue(rows);

    const { InsightsFeed } = await import('@/components/golf/coachhelm/insights/InsightsFeed');
    render(<InsightsFeed coachId="coach-1" limit={10} showGenerateButton={false} />);

    await waitFor(() => {
      expect(screen.getAllByTestId('insight-card-default')).toHaveLength(3);
    });
    expect(mockGetInsightsForCoach).toHaveBeenCalledWith('coach-1', { limit: 10 });
  });

  it('shows the empty state when no evidence-backed insights exist', async () => {
    mockGetInsightsForCoach.mockResolvedValue([]);
    const { InsightsFeed } = await import('@/components/golf/coachhelm/insights/InsightsFeed');
    render(<InsightsFeed coachId="coach-1" showGenerateButton={false} />);
    await waitFor(() => {
      expect(screen.getByText(/No Active Insights/i)).toBeInTheDocument();
    });
  });
});

// ===========================================================================
// CoachAlertCenter — DELETED in Wave W1 (golf legacy-tree deletion), along
// with its sibling `AlertCard`. The coach alerts route (/dashboard/alerts)
// renders `FairwayCoachHelmSignals` now, which reads evidence-backed insights
// directly rather than mounting this legacy consumer, so this describe
// block's scenarios no longer apply. Removed rather than left skipped since
// the module under test no longer exists.
// ===========================================================================

// ===========================================================================
// PlayerInsightClient — DELETED in Wave W1 (golf legacy-tree deletion). Its
// coach-facing per-player insights section is now FairwayPlayerInsight,
// which receives evidence-backed insights as an SSR-computed prop rather
// than client-fetching via getInsightsForCoach, so this describe block's
// scenarios no longer apply. Removed rather than skipped since the module
// under test no longer exists.
// ===========================================================================
