/**
 * Round Review page — integration tests (round-review.v3.md field sheet).
 *
 * Covers: the auth-gated round fetch + course-name casing (#109, carried over
 * from the pre-facelift page), and that `RoundReviewFieldSheet` actually
 * mounts the four regions the v3 composition promises — a bare masthead whose
 * verdict is built from this round's own fields, the one stage holding
 * `HoleField` beside its readouts, the three-column ledger, and the
 * hole-by-hole table — wired to a complete `RoundReviewContent` fixture.
 *
 * The honesty rules get their own cases: a scorecard-only round degrades the
 * stage instead of drawing a fabricated hole series, and a round with no
 * comparison averages renders its readouts with no delta at all.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    // The strip filmstrip (Filmstrip.tsx) and several fairway modules now
    // wrap their `m.*` entrances in a real `<LazyMotion>` — a pass-through
    // stub keeps that subtree rendering under this mock.
    LazyMotion: ({ children }: { children: React.ReactNode }) => children,
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
  // Round-level Strokes Gained cache — omitted by default (undefined, same
  // as a round predating the SG cache) so `hasAnySG` in `FilmstripReview`
  // reads false and the "SG not computed" composition path exercises.
  strokes_gained_total?: number | null;
  strokes_gained_tee?: number | null;
  strokes_gained_approach?: number | null;
  strokes_gained_around_green?: number | null;
  strokes_gained_putting?: number | null;
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
  // R3, Season trajectory (round-review.v2.md) — below the 4-round floor by
  // default, so existing tests that don't care about the trend chart see it
  // stay omitted rather than needing to know about this fetch at all.
  getRoundReviewTrend: vi.fn(async () => []),
  // The stage readouts' only honest delta source. Absent by default, so the
  // readouts render their numbers with no comparison caption — the branch
  // that must never invent one.
  getStatAverages: vi.fn(async () => ({ success: true })),
  shareRoundReviewWithCoach: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/app/golf/actions/round-reviews', () => ({
  markReviewAsViewed: vi.fn(async () => undefined),
}));

vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getRoundTakeawayInsight: vi.fn(async () => null),
}));

// FilmstripReview's "What to do next" CTA now opens a shared FocusAreaModal
// (closed by default — ModalShell conditionally renders nothing while
// closed, see ModalShell.tsx) instead of the retired vaul-Drawer
// PromoteToFocusAreaButton; stub the one server action it would call on
// submit so the import graph stays inert (never invoked here — no click).
vi.mock('@/app/golf/actions/development', () => ({
  createFocusAreaFromReview: vi.fn(),
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

/** Opens the masthead's "More actions" overflow menu, where Full breakdown,
 *  Open scorecard and Recompute live in the v3 composition. */
async function openOverflowMenu() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /more actions/i }));
  await screen.findByRole('menu');
  return user;
}

describe('RoundReviewPage — masthead identity and course-name casing (#109)', () => {
  beforeEach(() => {
    roundRow = { ...DEFAULT_ROUND_ROW };
  });

  it('titles the masthead with the reviewed player and puts the course on the eyebrow', async () => {
    roundRow = { ...DEFAULT_ROUND_ROW, course_name: 'pine lakes' };

    const { container, getByRole } = renderAsPlayer();

    // v3 masthead: the <h1> is the PLAYER (round-review.v3.md), and the
    // course/date ride the eyebrow row above it. The player is 'Player' per
    // `renderAsPlayer`'s GolfUserProvider fixture.
    await waitFor(() => {
      expect(getByRole('heading', { level: 1 }).textContent).toBe('Player');
    });

    // The course is still display-cased, never the raw lowercase value stored
    // on the round. 2026-06-01 is a Monday.
    const eyebrow = await waitFor(() => {
      const el = container.querySelector('[data-slot="masthead-eyebrow"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(eyebrow.textContent).toContain('Round review');
    expect(eyebrow.textContent).toContain('Pine Lakes · Mon, Jun 1');
    expect(eyebrow.textContent).not.toContain('pine lakes');
  });
});

describe('RoundReviewPage — the field sheet mounts its four regions', () => {
  beforeEach(() => {
    roundRow = { ...DEFAULT_ROUND_ROW };
  });

  it('builds the masthead verdict and facts line from this round’s own fields', async () => {
    const { container } = renderAsPlayer();

    const verdict = await waitFor(() => {
      const el = container.querySelector('[data-slot="verdict"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    // Score, to-par and course, then the biggest computed opportunity. Every
    // clause comes from a field on the fixture; nothing is guessed.
    expect(verdict.textContent).toContain('38 (+2) at Pinehurst No. 2.');
    expect(verdict.textContent).toContain('Putting cost 1.2 strokes.');
  });

  it('draws one stage column per hole, each an openable press target', async () => {
    const { container } = renderAsPlayer();

    const shape = await waitFor(() => {
      const el = container.querySelector('[data-slot="hole-field"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    // The fixture's `holeByHole` carries nine holes.
    expect(within(shape).getAllByRole('button')).toHaveLength(9);
    expect(within(shape).getByRole('button', { name: /^Hole 1, par 4, scored 4/ })).toBeInTheDocument();
  });

  it('renders the stage readouts with NO delta when no comparison averages came back', async () => {
    const { container } = renderAsPlayer();

    const readouts = await waitFor(() => {
      const el = container.querySelector('[data-slot="stage-readouts"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(within(readouts).getByText('Greens in regulation')).toBeInTheDocument();
    // 4 of 9 greens and 3 of 7 fairways, straight off the round row.
    expect(within(readouts).getByText('4/9')).toBeInTheDocument();
    expect(within(readouts).getByText('3/7')).toBeInTheDocument();
    // `getStatAverages` resolved with no `playerAvg`, so there is nothing
    // honest to compare against and no caption is invented.
    expect(within(readouts).queryByText(/better than recent/)).not.toBeInTheDocument();
    expect(within(readouts).queryByText(/worse than recent/)).not.toBeInTheDocument();
  });

  it('captions each readout once real comparison averages arrive', async () => {
    const { getStatAverages } = await import('@/app/golf/actions/round-review-system');
    vi.mocked(getStatAverages).mockResolvedValueOnce({
      success: true,
      playerAvg: { avgScore: 42, avgScoreToPar: 6, avgPutts: 18, avgGirPct: 30, avgFairwayPct: 60 },
    });

    const { container } = renderAsPlayer();

    const readouts = await waitFor(() => {
      const el = container.querySelector('[data-slot="stage-readouts"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    // +2 against a 6-over average is four shots better; 16 putts against 18
    // is two better; 4 of 9 greens (44.4%) against 30% is 14.4 points
    // better; 3 of 7 fairways (42.9%) against 60% is 17.1 points worse.
    await waitFor(() => {
      expect(within(readouts).getByText('4.0 better than recent')).toBeInTheDocument();
    });
    expect(within(readouts).getByText('2.0 better than recent')).toBeInTheDocument();
    expect(within(readouts).getByText('14.4 pts better than recent')).toBeInTheDocument();
    expect(within(readouts).getByText('17.1 pts worse than recent')).toBeInTheDocument();
  });

  it('puts the strokes-to-gain numbers in the ledger and only there', async () => {
    const { container, findByText } = renderAsPlayer();

    await findByText('Where it went');
    const leaks = container.querySelector('[data-slot="leak-ledger"]') as HTMLElement;
    expect(leaks).toBeTruthy();
    expect(within(leaks).getByText('Putting')).toBeInTheDocument();
    expect(within(leaks).getByText('1.2')).toBeInTheDocument();
    expect(within(leaks).getByText('3 three-jacks cost ~1.2 strokes')).toBeInTheDocument();
  });

  it('lists every hole in the hole-by-hole table', async () => {
    const { container, findByText } = renderAsPlayer();

    await findByText('Hole by hole');
    const table = container.querySelector('[data-slot="hole-ledger"]') as HTMLElement;
    expect(table).toBeTruthy();
    // Nine holes plus the header row.
    expect(within(table).getAllByRole('row')).toHaveLength(10);
  });

  it('says strokes gained was not computed rather than showing standing rows', async () => {
    // `roundRow` carries no `strokes_gained_*` fields by default (undefined —
    // same shape as a round predating the SG cache). The "Against the field"
    // ledger column then carries one honest line and nothing else, and the
    // round-level SG instrument must not mount anywhere on the page.
    const { findByText, queryByText } = renderAsPlayer();

    await findByText('Strokes gained was not computed for this round.');
    expect(queryByText('This round')).not.toBeInTheDocument();
  });

  it('renders a working Share-with-Coach CTA wired to shareRoundReviewWithCoach', async () => {
    const { findByRole } = renderAsPlayer();

    const shareButton = await findByRole('button', { name: 'Share with coach' });
    expect(shareButton).toBeEnabled();
  });

  it('moves the round breakdown and the SG rollup behind the masthead’s Full breakdown action', async () => {
    roundRow = {
      ...DEFAULT_ROUND_ROW,
      strokes_gained_total: 1.4,
      strokes_gained_tee: 0.5,
      strokes_gained_approach: 0.3,
      strokes_gained_around_green: 0.1,
      strokes_gained_putting: 0.5,
    };

    const { findByText, queryByText } = renderAsPlayer();

    // The v3 page is four regions; the breakdown instruments are real data
    // with no slot among them, so they live behind the overflow action
    // rather than as another inline card.
    await findByText('The story');
    expect(queryByText('Round breakdown')).not.toBeInTheDocument();
    expect(document.body.querySelector('[data-vaul-drawer]')).not.toBeInTheDocument();

    const user = await openOverflowMenu();
    await user.click(await screen.findByRole('menuitem', { name: 'Full breakdown' }));

    await waitFor(() => {
      expect(document.body.querySelector('[data-vaul-drawer]')).toBeInTheDocument();
    });
    // The round-level Strokes Gained rollup rides in with it.
    expect(await findByText('This round')).toBeInTheDocument();
  });
});

describe('RoundReviewPage — scorecard-only round (no hole rows)', () => {
  beforeEach(() => {
    roundRow = { ...DEFAULT_ROUND_ROW };
  });

  it('degrades the stage honestly and never derives "0 pars" from missing data', async () => {
    // Mirrors the real round this bug was reported against: golf_holes and
    // golf_shots both have 0 rows (a scorecard-only entry), so the generated
    // review's holeByHole/scoringDistribution come back empty even though the
    // round itself has a real total_score/holes_played.
    const { getRoundReview } = await import('@/app/golf/actions/round-review-system');
    vi.mocked(getRoundReview).mockResolvedValueOnce({
      success: true,
      review: {
        id: 'review-1',
        player_id: 'player-1',
        round_id: 'round-1',
        review_content: {
          ...FULL_REVIEW_CONTENT,
          holeByHole: [],
          scoringDistribution: { eagles: [], birdies: [], pars: [], bogeys: [], doublePlus: [], holesPlayed: 0 },
        },
        generated_at: '2026-06-01T00:00:00Z',
        ai_model_version: 'test',
        shared_with_coach: false,
        shared_at: null,
        coach_notes: null,
        coach_viewed_at: null,
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
        round: {
          id: 'round-1',
          player_id: 'player-1',
          course_name: 'Pinehurst No. 2',
          round_date: '2026-06-01',
          total_score: 75,
          score_to_par: 3,
          total_putts: null,
          total_fairways_hit: null,
          total_fairways: null,
          total_gir: null,
          total_gir_possible: null,
        },
      },
    });

    const { container, findByText, queryByText } = renderAsPlayer();

    // `getRoundReviewTrend` resolves `[]` by default — a SUCCESSFUL read of
    // nothing, not a failure — so there is no
    // trajectory to draw either — the stage says so in one line instead of
    // rendering an empty instrument or a blank state.
    await findByText(/not enough other rounds yet to draw a trajectory/);

    // The verdict collapses to the scorecard-only sentence and stops there.
    const verdict = container.querySelector('[data-slot="verdict"]') as HTMLElement;
    expect(verdict.textContent).toBe(
      '38 (+2) at Pinehurst No. 2. Scorecard only, so there is no hole-by-hole read yet.',
    );

    // No fabricated hole series anywhere: no stage columns, no hole table.
    expect(container.querySelector('[data-slot="hole-field"]')).toBeNull();
    expect(container.querySelector('[data-slot="hole-ledger"]')).toBeNull();
    expect(queryByText('Hole by hole')).not.toBeInTheDocument();
    expect(queryByText(/Mix:/)).not.toBeInTheDocument();
    expect(queryByText(/0 pars/)).not.toBeInTheDocument();
  });

  it('believes the hole rows, not holes_played, when the two disagree', async () => {
    // The trap this pins: a round can carry `holes_played: 18` and have ZERO
    // `golf_holes` rows, which is exactly the state of the round the facelift
    // captures run against. Every hole-level branch reads `holeByHole`, so
    // the count on the card can never talk the page into drawing 18 holes it
    // does not have.
    roundRow = { ...DEFAULT_ROUND_ROW, holes_played: 18, holes: [] };

    const { getRoundReview } = await import('@/app/golf/actions/round-review-system');
    vi.mocked(getRoundReview).mockResolvedValueOnce({
      success: true,
      review: {
        id: 'review-1',
        player_id: 'player-1',
        round_id: 'round-1',
        review_content: {
          ...FULL_REVIEW_CONTENT,
          holeByHole: [],
          scoringDistribution: { eagles: [], birdies: [], pars: [], bogeys: [], doublePlus: [], holesPlayed: 18 },
        },
        generated_at: '2026-06-01T00:00:00Z',
        ai_model_version: 'test',
        shared_with_coach: false,
        shared_at: null,
        coach_notes: null,
        coach_viewed_at: null,
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
        round: {
          id: 'round-1',
          player_id: 'player-1',
          course_name: 'Pinehurst No. 2',
          round_date: '2026-06-01',
          total_score: 75,
          score_to_par: 3,
          total_putts: null,
          total_fairways_hit: null,
          total_fairways: null,
          total_gir: null,
          total_gir_possible: null,
        },
      },
    });

    const { container, findByText, queryByText } = renderAsPlayer();
    await findByText(/not enough other rounds yet to draw a trajectory/);

    const verdict = container.querySelector('[data-slot="verdict"]') as HTMLElement;
    expect(verdict.textContent).toBe(
      '38 (+2) at Pinehurst No. 2. Scorecard only, so there is no hole-by-hole read yet.',
    );
    expect(container.querySelector('[data-slot="hole-field"]')).toBeNull();
    expect(container.querySelector('[data-slot="hole-ledger"]')).toBeNull();
    // And no "18 holes" anywhere, which would read as a flat contradiction of
    // the sentence directly above it.
    expect(queryByText(/18 holes/i)).not.toBeInTheDocument();
  });

  it('says a failed trend read failed, instead of drawing an empty season', async () => {
    // `getRoundReviewTrend` returns `null` ONLY when the read itself failed.
    // `[]` still means "read fine, nothing to plot". A coach shown a blank
    // trend concludes the player has no history, so the two absences cannot
    // render the same way.
    const { getRoundReview, getRoundReviewTrend } = await import('@/app/golf/actions/round-review-system');
    vi.mocked(getRoundReview).mockResolvedValueOnce({
      success: true,
      review: {
        id: 'review-1',
        player_id: 'player-1',
        round_id: 'round-1',
        review_content: {
          ...FULL_REVIEW_CONTENT,
          holeByHole: [],
          momentumData: [],
          scoringDistribution: { eagles: [], birdies: [], pars: [], bogeys: [], doublePlus: [], holesPlayed: 0 },
        },
      },
    } as unknown as Awaited<ReturnType<typeof getRoundReview>>);
    vi.mocked(getRoundReviewTrend).mockResolvedValueOnce(null);

    const { container, findByText, queryByText } = renderAsPlayer();

    await findByText(/Season trend unavailable/);
    expect(queryByText(/not a claim that there are none/)).toBeInTheDocument();
    // No instrument, because we have nothing honest to draw in it.
    expect(container.querySelector('[data-slot="hole-field"]')).toBeNull();
    // And not the "not enough other rounds yet" line, which is the OTHER
    // absence: that one asserts we looked and there were too few.
    expect(queryByText(/not enough other rounds yet/)).not.toBeInTheDocument();
    // It stays a quiet line on the stage, never an error banner.
    expect(queryByText(/We couldn’t load this review/)).not.toBeInTheDocument();
  });

  it('plots the player’s recent rounds, with this one marked, when there are enough of them', async () => {
    const { getRoundReview, getRoundReviewTrend } = await import('@/app/golf/actions/round-review-system');
    vi.mocked(getRoundReview).mockResolvedValueOnce({
      success: true,
      review: {
        id: 'review-1',
        player_id: 'player-1',
        round_id: 'round-1',
        review_content: {
          ...FULL_REVIEW_CONTENT,
          holeByHole: [],
          momentumData: [],
          scoringDistribution: { eagles: [], birdies: [], pars: [], bogeys: [], doublePlus: [], holesPlayed: 0 },
        },
      },
    } as unknown as Awaited<ReturnType<typeof getRoundReview>>);
    vi.mocked(getRoundReviewTrend).mockResolvedValueOnce([
      { id: 'round-1', round_date: '2026-06-01', score_to_par: 2 },
      { id: 'round-0', round_date: '2026-05-20', score_to_par: 7 },
    ]);

    const { container, findByText } = renderAsPlayer();

    await findByText('Season trajectory');
    const shape = await waitFor(() => {
      const el = container.querySelector('[data-slot="hole-field"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    // Oldest first, and the reviewed round is the one labelled as such.
    expect(within(shape).getByText('May 20')).toBeInTheDocument();
    expect(within(shape).getByText('Jun 1')).toBeInTheDocument();
    expect(within(shape).getByText(/this round/)).toBeInTheDocument();
  });
});

describe('RoundReviewPage — focus-area prescription (FocusAreaModal migration)', () => {
  beforeEach(() => {
    roundRow = { ...DEFAULT_ROUND_ROW };
  });

  it('opens a pre-filled FocusAreaModal instead of a silent Drawer create', async () => {
    const { findByRole } = renderAsPlayer();

    // Player viewing their own round → FocusAreaModal mode='player' CTA copy.
    const trigger = await findByRole('button', { name: 'Add focus area' });
    trigger.click();

    const dialog = await findByRole('dialog');
    // Pre-filled from `derivePromoteSuggestion`'s areasForImprovement[0]
    // fallback (this fixture has no takeaway insight) — the coach/player sees
    // and can edit this before anything is written, not a bare direct create.
    expect(within(dialog).getByDisplayValue('Missed fairways')).toBeInTheDocument();
  });

  it('submits through createFocusAreaFromReview with the round linkage preserved', async () => {
    const { createFocusAreaFromReview } = await import('@/app/golf/actions/development');
    vi.mocked(createFocusAreaFromReview).mockResolvedValue({ success: true, focusAreaId: 'fa-1' });

    const { findByRole } = renderAsPlayer();

    const trigger = await findByRole('button', { name: 'Add focus area' });
    trigger.click();

    const dialog = await findByRole('dialog');
    // Both the trigger (still mounted behind the modal) and the modal's own
    // save CTA read "Add focus area" in player mode — scope to the dialog.
    const saveButton = within(dialog).getByRole('button', { name: 'Add focus area' });
    saveButton.click();

    await waitFor(() => {
      expect(createFocusAreaFromReview).toHaveBeenCalledWith(
        expect.objectContaining({
          playerId: 'player-1',
          reviewId: 'review-1',
          title: 'Missed fairways',
        }),
      );
    });
  });
});

describe('RoundReviewPage — perf fix (AUDIT row 15): review no longer waits on standing', () => {
  beforeEach(() => {
    // Strokes Gained IS computed here, so the "Against the field" ledger
    // column reaches its standing states rather than the one-line
    // not-computed branch — that column is the thing under test.
    roundRow = {
      ...DEFAULT_ROUND_ROW,
      strokes_gained_total: 1.4,
      strokes_gained_tee: 0.5,
      strokes_gained_approach: 0.3,
      strokes_gained_around_green: 0.1,
      strokes_gained_putting: 0.5,
    };
  });

  it('shows review content while the season-standing fetch is still pending', async () => {
    const { getPlayerStandingForReview } = await import('@/app/golf/actions/round-review-system');
    type StandingMap = Awaited<ReturnType<typeof getPlayerStandingForReview>>;
    let resolveStanding: (value: StandingMap) => void = () => {};
    const standingPromise = new Promise<StandingMap>((resolve) => {
      resolveStanding = resolve;
    });
    vi.mocked(getPlayerStandingForReview).mockReturnValueOnce(standingPromise);

    const { findByText } = renderAsPlayer();

    // The review narrative is already mounted — `getRoundReview` resolved and
    // `loadingStoredReview` cleared — even though `getPlayerStandingForReview`
    // has not resolved yet. Before the fix these were awaited sequentially in
    // one effect, so the review sat behind whatever the standing fetch was
    // doing.
    await findByText('The story');

    // "Against the field" carries its own pending state instead of the
    // review waiting on it.
    expect(await findByText('Loading season standing…')).toBeInTheDocument();

    resolveStanding({});
  });
});

describe('RoundReviewPage — review-generation failure surfaces inline, not page-wide', () => {
  beforeEach(() => {
    roundRow = { ...DEFAULT_ROUND_ROW };
  });

  it('shows an inline retry in the review body, not the whole-page error', async () => {
    const { getRoundReview } = await import('@/app/golf/actions/round-review-system');
    // No stored review → the auto-generate effect fires and fails against
    // the module-level default mock (`generateAndStoreRoundReview` resolves
    // `{ success: false }`, no `error` message).
    vi.mocked(getRoundReview).mockResolvedValueOnce({ success: false });

    const { container, findByText, findByRole, queryByText } = renderAsPlayer();

    // This text only exists on the new inline-retry path — the OLD code
    // never produced it; a generation failure there set the page-level
    // `error` and rendered "We couldn't load this review" instead.
    await findByText("We couldn't generate this review");

    // The page shell — the masthead with the reviewed player and the round's
    // course on the eyebrow — is still up around it; this is NOT the
    // whole-page error surface.
    const heading = await findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Player');
    expect(container.querySelector('[data-slot="masthead-eyebrow"]')?.textContent).toContain('Pinehurst No. 2');
    expect(queryByText("We couldn't load this review")).not.toBeInTheDocument();

    const retry = await findByRole('button', { name: 'Try again' });
    expect(retry).toBeEnabled();
  });
});
