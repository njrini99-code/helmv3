/**
 * Round Review page — stats-accuracy regression tests (audit 2026-06-09).
 *
 * Fix B: the page passed the round's RAW total_putts to RoundStatsComparison,
 * which compares it against the 18-hole-normalized avgPutts — a 9-hole round
 * read as "16 putts vs a 32-putt average". The round's putt count must be
 * normalized to an 18-hole equivalent (×18/holes_played) before comparing.
 *
 * Fix A consumer: null-honest averages (ComparisonAverages) must map null →
 * undefined so RoundStatsComparison SKIPS that comparison instead of
 * comparing against a fabricated number.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// --- Captured props from the stubbed RoundStatsComparison -----------------

interface CapturedStatsProps {
  roundStats: {
    girPct: number | null;
    firPct: number | null;
    putts: number | null;
    penalties: number | null;
    scramblePct: number | null;
  };
  playerAvg?: { avgGirPct?: number; avgFairwayPct?: number; avgPutts?: number } | null;
  teamAvg?: { avgGirPct?: number; avgFairwayPct?: number; avgPutts?: number } | null;
}

let capturedStatsProps: CapturedStatsProps | null = null;

// --- Mocks (must precede the page import) ---------------------------------

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'round-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Real next/link mounts an IntersectionObserver for prefetch; the jsdom
// global mock isn't constructible, so render plain anchors instead.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

// Stub framer-motion the same way the other coachhelm surface tests do — we
// only care that the DOM contents render, not that the animation runs.
vi.mock('framer-motion', async () => {
  const React = await import('react');
  const motionProxy = new Proxy(
    {},
    {
      get: (_target, prop) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        React.forwardRef<HTMLElement, any>((props, ref) => {
          const { children, initial: _i, animate: _a, exit: _e, transition: _t, variants: _v, whileHover: _wh, whileTap: _wt, ...rest } = props;
          void _i; void _a; void _e; void _t; void _v; void _wh; void _wt;
          return React.createElement(prop as string, { ...rest, ref }, children);
        }),
    },
  );
  return {
    useReducedMotion: () => false,
    // Fairway ViewHeader (unconditional after the W1 legacy-tree deletion)
    // imports `motion` directly; LazyMotion surfaces use `m`. Same stub.
    motion: motionProxy,
    m: new Proxy(
      {},
      {
        get: (_target, prop) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          React.forwardRef<HTMLElement, any>((props, ref) => {
            const { children, initial: _i, animate: _a, exit: _e, transition: _t, variants: _v, ...rest } = props;
            void _i; void _a; void _e; void _t; void _v;
            return React.createElement(prop as string, { ...rest, ref }, children);
          }),
      },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

// `let` (not `const`) so individual tests (#109 course-name casing, #34
// hole-jump nav) can swap in a different row shape before rendering — the
// `golf_rounds` mock below reads this variable at call time, not a snapshot.
let roundRow: {
  id: string;
  player_id: string;
  course_name: string | null;
  round_date: string;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  holes_played: number | null;
  holes: Array<{ hole_number: number; score: number | null; par: number | null; yardage: number | null }>;
} = {
  id: 'round-1',
  player_id: 'player-1',
  course_name: 'Pinehurst No. 2',
  round_date: '2026-06-01',
  total_score: 38,
  score_to_par: 2,
  total_putts: 16,
  total_fairways_hit: 3,
  total_fairways: 7,
  total_gir: 4,
  total_gir_possible: 9,
  holes_played: 9,
  holes: [],
};

function createChainableMock(maybeSingleData: unknown) {
  const chain: Record<string, unknown> = { data: null, error: null };
  for (const method of ['select', 'eq', 'limit', 'order']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => ({ data: maybeSingleData, error: null }));
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    from: vi.fn((table: string) => {
      if (table === 'golf_players') return createChainableMock({ id: 'player-1' });
      if (table === 'golf_coaches') return createChainableMock(null);
      if (table === 'golf_rounds') return createChainableMock(roundRow);
      return createChainableMock(null);
    }),
  })),
}));

vi.mock('@/hooks/coachhelm/useRoundReviewV2', () => ({
  useRoundReviewV2: () => ({ v2Review: null, isV2Enabled: false, generating: false }),
}));

vi.mock('@/components/ui/sonner', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/app/golf/actions/round-review-system', () => ({
  getRoundReview: vi.fn(async () => ({
    success: true,
    review: {
      id: 'review-1',
      player_id: 'player-1',
      round_id: 'round-1',
      review_content: { summary: '', highlights: [], areasForImprovement: [], keyStats: [], recommendations: [] },
      shared_with_coach: false,
    },
  })),
  generateAndStoreRoundReview: vi.fn(async () => ({ success: false })),
  // Null-honest averages: avgFairwayPct has no supporting data for this player.
  getStatAverages: vi.fn(async () => ({
    success: true,
    playerAvg: { avgScore: null, avgScoreToPar: null, avgPutts: 33, avgGirPct: 55, avgFairwayPct: null },
  })),
  getPlayerStandingForReview: vi.fn(async () => ({})),
  shareRoundReviewWithCoach: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/app/golf/actions/round-reviews', () => ({
  markReviewAsViewed: vi.fn(async () => undefined),
}));

vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getRoundTakeawayInsight: vi.fn(async () => null),
  getInsightsForPlayer: vi.fn(async () => []),
}));

vi.mock('@/components/golf/coachhelm/RoundStatsComparison', () => ({
  RoundStatsComparison: (props: CapturedStatsProps) => {
    capturedStatsProps = props;
    return <div data-testid="stats-comparison" />;
  },
}));

vi.mock('@/components/golf/coachhelm/RoundReviewDisplay', () => ({
  RoundReviewDisplay: () => <div data-testid="review-display" />,
}));

vi.mock('@/components/golf/coachhelm/v3/RoundReviewLlmCard', () => ({
  RoundReviewLlmCard: () => <div data-testid="llm-card" />,
}));

vi.mock('@/components/golf/coachhelm/round-review', () => ({
  RoundTakeaway: () => <div data-testid="round-takeaway" />,
  V2ReviewSummary: () => <div data-testid="v2-summary" />,
}));

vi.mock('@/components/golf/coachhelm/round-review/HoleByHoleShotPaths', () => ({
  HoleByHoleShotPaths: () => <div data-testid="shot-paths" />,
}));

vi.mock('@/components/golf/coachhelm/PromoteToFocusAreaButton', () => ({
  PromoteToFocusAreaButton: () => <div data-testid="promote-button" />,
}));

vi.mock('@/components/golf/coachhelm/v3/StandingBar', () => ({
  StandingBar: () => <div data-testid="standing-bar" />,
}));

vi.mock('@/lib/coachhelm/v3/standing/metric-config', () => ({
  getMetricRenderConfig: () => null,
}));

vi.mock('@/lib/redesign/flag', () => ({
  fairwayScope: (className: string) => className,
}));

vi.mock('@/lib/golf/resolve-team', () => ({
  resolveCoachTeamId: vi.fn(async () => null),
}));

import RoundReviewPage from '../page';
import { GolfUserProvider } from '@/contexts/golf-user-context';

describe('RoundReviewPage — stats comparison inputs', () => {
  beforeEach(() => {
    capturedStatsProps = null;
  });

  it('normalizes a 9-hole round’s putts to an 18-hole equivalent and skips null averages', async () => {
    // The page reads the layout-resolved user context (active team +
    // staffed teams) for the coach access check — provide it like the
    // dashboard layout does. This test exercises the PLAYER own-round path.
    render(
      <GolfUserProvider
        userData={{ role: 'player', userId: 'user-1', name: 'Player', playerId: 'player-1' }}
      >
        <RoundReviewPage />
      </GolfUserProvider>,
    );

    await waitFor(() => {
      expect(capturedStatsProps).not.toBeNull();
    });

    // 16 putts over 9 holes → 32 putts on an 18-hole basis. Passing the raw
    // 16 against the 18-normalized avgPutts (33) was the regression.
    expect(capturedStatsProps?.roundStats.putts).toBe(32);

    // Percentages are scale-invariant — passed through from the round's own
    // made/possible counts (4/9 GIR → 44%, 3/7 FW → 43%).
    expect(capturedStatsProps?.roundStats.girPct).toBe(44);
    expect(capturedStatsProps?.roundStats.firPct).toBe(43);

    // Null averages map to undefined so the comparison is SKIPPED — never a
    // fabricated 50% fairway baseline.
    expect(capturedStatsProps?.playerAvg).toEqual({
      avgGirPct: 55,
      avgFairwayPct: undefined,
      avgPutts: 33,
    });
    expect(capturedStatsProps?.teamAvg).toBeNull();
  });
});

const DEFAULT_ROUND_ROW = { ...roundRow };

describe('RoundReviewPage — course-name casing (#109) + hole-jump nav (#34)', () => {
  beforeEach(() => {
    capturedStatsProps = null;
    roundRow = { ...DEFAULT_ROUND_ROW };
  });

  it('title-cases an all-lowercase course name like every sibling course row', async () => {
    roundRow = { ...DEFAULT_ROUND_ROW, course_name: 'pine lakes' };

    const { getByRole } = render(
      <GolfUserProvider
        userData={{ role: 'player', userId: 'user-1', name: 'Player', playerId: 'player-1' }}
      >
        <RoundReviewPage />
      </GolfUserProvider>,
    );

    // The ViewHeader title (an <h1>, present on both the loading and loaded
    // surfaces) renders the display-cased name, never the raw lowercase
    // value stored on the round.
    await waitFor(() => {
      expect(getByRole('heading', { level: 1 }).textContent).toBe('Pine Lakes');
    });
  });

  it('renders a 1-18 hole-jump chip for every hole instead of only a scroll', async () => {
    roundRow = {
      ...DEFAULT_ROUND_ROW,
      holes: Array.from({ length: 18 }, (_, i) => ({
        hole_number: i + 1,
        score: 4,
        par: 4,
        yardage: 380,
      })),
    };

    const { findByRole, getByRole } = render(
      <GolfUserProvider
        userData={{ role: 'player', userId: 'user-1', name: 'Player', playerId: 'player-1' }}
      >
        <RoundReviewPage />
      </GolfUserProvider>,
    );

    await findByRole('button', { name: 'Jump to hole 1' });
    for (let hole = 1; hole <= 18; hole++) {
      expect(getByRole('button', { name: `Jump to hole ${hole}` })).toBeInTheDocument();
    }
  });
});
