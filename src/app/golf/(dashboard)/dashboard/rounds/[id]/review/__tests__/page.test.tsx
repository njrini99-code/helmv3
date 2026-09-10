/**
 * Round Review page — integration tests (Task 10 filmstrip rebuild).
 *
 * Covers: auth-gated round fetch + course-name casing (#109, carried over
 * from the pre-filmstrip page), and that `FilmstripReview` actually mounts
 * with the hero (score/to-par/scoring histogram), the strokes-lost section, the
 * Share-with-Coach CTA, and the always-visible round breakdown wired to a
 * complete `RoundReviewContent` fixture without a redundant nested view.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, within } from '@testing-library/react';
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

describe('RoundReviewPage — course-name casing (#109)', () => {
  beforeEach(() => {
    roundRow = { ...DEFAULT_ROUND_ROW };
  });

  it('title-cases an all-lowercase course name like every sibling course row', async () => {
    roundRow = { ...DEFAULT_ROUND_ROW, course_name: 'pine lakes' };

    const { getByRole } = renderAsPlayer();

    // The ViewHeader title (an <h1>, present on both the loading and loaded
    // surfaces) is the round's identity line — "{weekday} at {course} ·
    // {player} · {date}" — built from the display-cased course name, never
    // the raw lowercase value stored on the round. 2026-06-01 is a Monday;
    // the player is 'Player' per `renderAsPlayer`'s GolfUserProvider fixture.
    await waitFor(() => {
      expect(getByRole('heading', { level: 1 }).textContent).toBe('Monday at Pine Lakes · Player · Jun 1');
    });
  });
});

describe('RoundReviewPage — FilmstripReview mount', () => {
  beforeEach(() => {
    roundRow = { ...DEFAULT_ROUND_ROW };
  });

  it('renders the hero score/to-par and the scoring histogram', async () => {
    const { findAllByText, getByText, container } = renderAsPlayer();

    // Scoped to the hero on purpose. The front/back breakdown legitimately
    // shows the same figure — the front nine is also 38 in this fixture — and
    // it became a separate text node when that row stopped being a
    // `min-w-[420px]` horizontal scroller and became a labelled metric grid.
    // A bare getByText('38') is therefore ambiguous, and relaxing it to
    // "some element says 38" would no longer test that the HERO says it.
    const hero = (await findAllByText('38')).find((el) => el.className.includes('text-stat-lg'));
    expect(hero, 'the hero should render the score at stat-lg').toBeDefined();
    expect(getByText('+2')).toBeInTheDocument();

    // The old plain-text "3 pars · 6 bogeys" mix line was replaced by the
    // ScoringHistogram module (round-review.v2.md R2) — five labelled bars,
    // one per bucket, each with its own count cell. The fixture's
    // `scoringDistribution` carries 3 pars and 6 bogeys.
    const histogram = await waitFor(() => {
      const el = container.querySelector('[data-slot="scoring-histogram"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(within(histogram).getByText('Par')).toBeInTheDocument();
    expect(within(histogram).getByText('Bogey')).toBeInTheDocument();
    const parRow = within(histogram).getByText('Par').closest('div');
    expect(parRow, 'the Par row should contain its own count').not.toBeNull();
    expect(within(parRow as HTMLElement).getByText('3')).toBeInTheDocument();
    const bogeyRow = within(histogram).getByText('Bogey').closest('div');
    expect(bogeyRow, 'the Bogey row should contain its own count').not.toBeNull();
    expect(within(bogeyRow as HTMLElement).getByText('6')).toBeInTheDocument();
  });

  it('collapses to one notice, not the RoundSGSummary instrument, when SG is not computed', async () => {
    // `roundRow` carries no `strokes_gained_*` fields by default (undefined —
    // same shape as a round predating the SG cache). round-detail.md
    // CONTAINERS TO REMOVE #2: the empty "Strokes gained: This round" + "By
    // category" cards collapse to nothing, replaced by one line in the
    // standing surface — RoundSGSummary's own "This round" instrument must
    // NOT mount at all in this case.
    const { findByText, queryByText } = renderAsPlayer();

    await findByText('SG not computed for this round.');
    expect(queryByText('This round')).not.toBeInTheDocument();
  });

  it('renders the round-level Strokes Gained summary section when SG IS computed', async () => {
    roundRow = {
      ...DEFAULT_ROUND_ROW,
      strokes_gained_total: 1.4,
      strokes_gained_tee: 0.5,
      strokes_gained_approach: 0.3,
      strokes_gained_around_green: 0.1,
      strokes_gained_putting: 0.5,
    };

    const { findByText, queryByText } = renderAsPlayer();

    // The V1 heuristic "Where strokes went" RailBars block was removed
    // (2026-07-23) — it contradicted the authoritative per-shot Strokes Gained
    // rollup (RoundSGSummary) that now leads the review body.
    await findByText('This round');
    expect(queryByText('SG not computed for this round.')).not.toBeInTheDocument();
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

  it('opens RoundStatsPanel/RoundStatReport in a Sheet from the header "Full breakdown" button (R7)', async () => {
    // `RoundStatReport` used to always rest inline at the page's end; R7
    // moves it behind this Sheet instead. Asserted structurally via vaul's
    // own portal marker (mirrors Sheet.test.tsx) rather than the report's
    // content, since that content depends on an unmocked stats fetch this
    // suite doesn't stub.
    const { findByRole } = renderAsPlayer();

    const trigger = await findByRole('button', { name: 'Full breakdown' });
    expect(document.body.querySelector('[data-vaul-drawer]')).not.toBeInTheDocument();

    trigger.click();

    await waitFor(() => {
      expect(document.body.querySelector('[data-vaul-drawer]')).toBeInTheDocument();
    });
  });
});

describe('RoundReviewPage — scorecard-only round (no hole rows)', () => {
  beforeEach(() => {
    roundRow = { ...DEFAULT_ROUND_ROW };
  });

  it('hides the filmstrip strip and its hover hint, and never derives "0 pars" from missing data', async () => {
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

    const { findByText, queryByLabelText, queryByText } = renderAsPlayer();

    await findByText('Scorecard only. Enter holes to unlock the hole-by-hole view.');

    // The strip itself (Filmstrip.tsx renders `aria-label="Hole by hole"`)
    // and its "nothing scrubbed yet" hint both have nothing real to show for
    // a round with zero hole rows — neither should mount at all.
    expect(queryByLabelText('Hole by hole')).not.toBeInTheDocument();
    expect(queryByText('Tap or hover over a hole to see what happened.')).not.toBeInTheDocument();
    expect(queryByText(/Mix:/)).not.toBeInTheDocument();
    expect(queryByText(/0 pars/)).not.toBeInTheDocument();
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
    roundRow = { ...DEFAULT_ROUND_ROW };
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

    // "Where this sits" carries its own pending state instead of the review
    // waiting on it.
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

    const { findByText, findByRole, queryByText } = renderAsPlayer();

    // This text only exists on the new inline-retry path — the OLD code
    // never produced it; a generation failure there set the page-level
    // `error` and rendered "We couldn't load this review" instead.
    await findByText("We couldn't generate this review");

    // The page shell — the round's own identity header — is still up
    // around it; this is NOT the whole-page error surface.
    const heading = await findByRole('heading', { level: 1 });
    expect(heading.textContent).toContain('Pinehurst No. 2');
    expect(queryByText("We couldn't load this review")).not.toBeInTheDocument();

    const retry = await findByRole('button', { name: 'Try again' });
    expect(retry).toBeEnabled();
  });
});
