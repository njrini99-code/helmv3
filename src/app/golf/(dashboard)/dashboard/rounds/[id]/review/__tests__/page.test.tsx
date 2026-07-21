/**
 * Round Review page — integration tests (Task 10 filmstrip rebuild).
 *
 * Covers: auth-gated round fetch + course-name casing (#109, carried over
 * from the pre-filmstrip page), and that `FilmstripReview` actually mounts
 * with the hero (score/to-par/mix line), the strokes-lost section, the
 * Share-with-Coach CTA, and the always-visible round breakdown wired to a
 * complete `RoundReviewContent` fixture without a redundant nested view.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { RoundReviewContent } from '@/app/golf/actions/round-review-system';

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
//
// IMPORTANT: cache each tag's component by property name. A Proxy `get` trap
// that returns a FRESH `forwardRef(...)` on every access (the naive version)
// hands React a NEW component TYPE for `<m.div>` on every render of the
// consuming page — React reconciles by type, so it unmounts and remounts the
// entire subtree under `<m.div>` on every parent re-render, silently
// discarding any descendant's local state (e.g. FilmstripReview's
// `breakdownOpen` toggle). The cache makes `m.div`/`motion.div` behave like
// the real framer-motion export: a stable reference across renders.
vi.mock('framer-motion', async () => {
  const React = await import('react');
  function makeTagProxy(stripKeys: string[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cache = new Map<string | symbol, React.ComponentType<any>>();
    return new Proxy(
      {},
      {
        get: (_target, prop) => {
          const cached = cache.get(prop);
          if (cached) return cached;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Comp = React.forwardRef<HTMLElement, any>((props, ref) => {
            const rest = { ...props };
            for (const key of stripKeys) delete rest[key];
            const { children, ...domProps } = rest;
            return React.createElement(prop as string, { ...domProps, ref }, children);
          });
          cache.set(prop, Comp);
          return Comp;
        },
      },
    );
  }
  const STRIP = ['initial', 'animate', 'exit', 'transition', 'variants', 'whileHover', 'whileTap'];
  return {
    useReducedMotion: () => false,
    // Fairway ViewHeader (unconditional after the W1 legacy-tree deletion)
    // imports `motion` directly; LazyMotion surfaces use `m`. Same stub.
    motion: makeTagProxy(STRIP),
    m: makeTagProxy(STRIP),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

// `let` (not `const`) so the course-name-casing test can swap in a different
// row shape before rendering — the `golf_rounds` mock below reads this
// variable at call time, not a snapshot.
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
const DEFAULT_ROUND_ROW = { ...roundRow };

function createChainableMock(maybeSingleData: unknown) {
  const chain: Record<string, unknown> = { data: [], error: null };
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
      // golf_shots (FilmstripReview's own ledger fetch) and anything else
      // resolve to an empty array — no shot-level data in these fixtures.
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

/** A complete `RoundReviewContent` fixture — every field `buildReviewViewModel`
 *  reads must be present, or the real (unmocked) adapter throws. */
const FULL_REVIEW_CONTENT: RoundReviewContent = {
  summary: 'You shot 38 (+2) at Pinehurst No. 2. 3 pars, 6 bogeys.',
  sentiment: 'neutral',
  overallGrade: 'C',
  highlights: [],
  areasForImprovement: [{ area: 'Missed fairways', recommendation: 'Work on tee-shot alignment.' }],
  keyStats: [],
  recommendations: [],
  scoringDistribution: { eagles: [], birdies: [], pars: [3, 5, 7], bogeys: [1, 2, 4, 6, 8, 9], doublePlus: [], holesPlayed: 9 },
  frontBackSplit: {
    front: { score: 38, putts: 16, gir: 4, girTotal: 9, fairways: 3, fairwayTotal: 7 },
    back: { score: 0, putts: 0, gir: 0, girTotal: 0, fairways: 0, fairwayTotal: 0 },
  },
  momentumData: [
    { hole: 1, rollingScoreToPar: 1 },
    { hole: 2, rollingScoreToPar: 2 },
  ],
  puttingBreakdown: {
    ranges: [
      { label: '0-5 ft', attempts: 3, made: 3, pct: 100 },
      { label: '5-15 ft', attempts: 4, made: 1, pct: 25 },
      { label: '15-25 ft', attempts: 0, made: 0, pct: 0 },
      { label: '25+ ft', attempts: 0, made: 0, pct: 0 },
    ],
    avgFirstPuttDist: 10,
    threePuttHoles: [],
    onePuttCount: 3,
    totalPutts: 16,
  },
  drivingAnalysis: {
    avgDistance: 250,
    longestDrive: { distance: 270, hole: 5 },
    fairwayPct: 43,
    missPattern: { left: 2, right: 2, total: 4 },
  },
  shortGameAnalysis: {
    scramblePct: null,
    scrambleAttempts: 0,
    scrambleSuccesses: 0,
    sandSavePct: null,
    sandAttempts: 0,
    sandSuccesses: 0,
    upAndDownDetails: [],
  },
  penaltyAnalysis: { total: 0, holes: [], strokesLost: 0 },
  strokesToGain: [{ category: 'Putting', potentialStrokes: 1.2, description: '3 three-jacks cost ~1.2 strokes' }],
  holeByHole: Array.from({ length: 9 }, (_, i) => ({
    hole: i + 1,
    par: 4,
    score: 4,
    scoreToPar: 0,
    putts: 2,
    fairwayHit: true,
    gir: true,
    threePutt: false,
    onePutt: false,
    penalties: 0,
    scrambleAttempt: false,
    scrambleSuccess: false,
    sandSaveAttempt: false,
    sandSaveSuccess: false,
    driveClub: null,
    driveDist: null,
    driveMiss: null,
    firstPuttFeet: null,
    approachClub: null,
    approachDist: null,
    approachMiss: null,
  })),
};

vi.mock('@/app/golf/actions/round-review-system', () => ({
  getRoundReview: vi.fn(async () => ({
    success: true,
    review: {
      id: 'review-1',
      player_id: 'player-1',
      round_id: 'round-1',
      review_content: FULL_REVIEW_CONTENT,
      shared_with_coach: false,
      coach_notes: null,
    },
  })),
  generateAndStoreRoundReview: vi.fn(async () => ({ success: false })),
  getPlayerStandingForReview: vi.fn(async () => ({})),
  shareRoundReviewWithCoach: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/app/golf/actions/round-reviews', () => ({
  markReviewAsViewed: vi.fn(async () => undefined),
}));

vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getRoundTakeawayInsight: vi.fn(async () => null),
}));

vi.mock('@/components/golf/coachhelm/PromoteToFocusAreaButton', () => ({
  PromoteToFocusAreaButton: () => <div data-testid="promote-button" />,
}));

vi.mock('@/lib/redesign/flag', () => ({
  fairwayScope: (className: string) => className,
}));

vi.mock('@/lib/golf/resolve-team', () => ({
  resolveCoachTeamId: vi.fn(async () => null),
}));

import RoundReviewPage from '../page';
import { GolfUserProvider } from '@/contexts/golf-user-context';

function renderAsPlayer() {
  return render(
    <GolfUserProvider
      userData={{ role: 'player', userId: 'user-1', name: 'Player', playerId: 'player-1' }}
    >
      <RoundReviewPage />
    </GolfUserProvider>,
  );
}

describe('RoundReviewPage — course-name casing (#109)', () => {
  beforeEach(() => {
    roundRow = { ...DEFAULT_ROUND_ROW };
  });

  it('title-cases an all-lowercase course name like every sibling course row', async () => {
    roundRow = { ...DEFAULT_ROUND_ROW, course_name: 'pine lakes' };

    const { getByRole } = renderAsPlayer();

    // The ViewHeader title (an <h1>, present on both the loading and loaded
    // surfaces) renders the display-cased name, never the raw lowercase
    // value stored on the round.
    await waitFor(() => {
      expect(getByRole('heading', { level: 1 }).textContent).toBe('Pine Lakes');
    });
  });
});

describe('RoundReviewPage — FilmstripReview mount', () => {
  beforeEach(() => {
    roundRow = { ...DEFAULT_ROUND_ROW };
  });

  it('renders the hero score/to-par and the scoring-mix line', async () => {
    const { findByText, getByText } = renderAsPlayer();

    await findByText('38');
    expect(getByText('+2')).toBeInTheDocument();
    expect(getByText(/3 pars · 6 bogeys/)).toBeInTheDocument();
  });

  it('renders the strokes-lost section from strokesToGain', async () => {
    const { findByText, getByText } = renderAsPlayer();

    await findByText('Where strokes went');
    expect(getByText('Putting')).toBeInTheDocument();
  });

  it('renders a working Share-with-Coach CTA wired to shareRoundReviewWithCoach', async () => {
    const { findByRole } = renderAsPlayer();

    const shareButton = await findByRole('button', { name: 'Share with coach' });
    expect(shareButton).toBeEnabled();
  });

  it('shows one inline round breakdown without a nested review level', async () => {
    const { findByText, queryByRole } = renderAsPlayer();

    await findByText('Round breakdown');
    expect(queryByRole('button', { name: 'Full breakdown →' })).not.toBeInTheDocument();
    expect(queryByRole('button', { name: 'Back to summary' })).not.toBeInTheDocument();
  });
});
