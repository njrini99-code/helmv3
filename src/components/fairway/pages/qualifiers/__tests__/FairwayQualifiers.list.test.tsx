/**
 * The qualifiers list against the Demo University team's production rows
 * (golf_qualifiers, not test, start_date desc): the Fall Invitational
 * (86dad12b) is live with 7 players through 2 of 3 rounds, and two concluded
 * qualifiers sit below it. The feed rows are golf_qualifier_entries with their
 * completed golf_rounds summed, as useQualifierRealtime builds them.
 *
 *   · the hero reads the live feed: "Round 3 of 3 up next", 14 of 21
 *     scorecards in, the bars full, full and empty, and the top three with
 *     golf positions and to-par (Cole −3, Mason E, Owen +1), then "+4 more";
 *   · every card has exactly one link, its title;
 *   · a coach's hero action is secondary, because Create qualifier is the
 *     page's one primary; a player's hero action is the primary;
 *   · before anyone scores the hero names the field instead of a board;
 *   · a search that changes the hero reads the new qualifier's feed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

import type { GolfQualifier } from '@/lib/types/golf';

const mockUseQualifierRealtime = vi.fn();

vi.mock('@/hooks/golf/use-qualifier-realtime', () => ({
  useQualifierRealtime: (...args: unknown[]) => mockUseQualifierRealtime(...args),
}));

import { FairwayQualifiers, formatDateRange } from '../FairwayQualifiers';

function qualifier(
  row: Partial<GolfQualifier> & Pick<GolfQualifier, 'id' | 'name' | 'status' | 'start_date'>,
): GolfQualifier {
  return {
    course_id: null,
    course_name: 'Demo University Home Course',
    created_at: null,
    created_by: null,
    description: null,
    end_date: null,
    entry_deadline: null,
    is_test: false,
    num_rounds: 1,
    rules: null,
    selection_slots_coach_pick: 1,
    selection_slots_total: 5,
    selection_state: 'open',
    spots_available: 5,
    target_tournament_id: null,
    team_id: '6ecdd1a6-63fe-4beb-b094-00118f334163',
    updated_at: null,
    ...row,
  };
}

const FALL_INVITATIONAL = qualifier({
  id: '86dad12b-d9e4-4d24-9d0b-8ca455634c64',
  name: 'Fall Invitational Qualifier',
  description:
    "3-round stroke play to set the 5-player travel squad for the Fall Invitational. Top 4 auto-qualify; 1 coach's pick.",
  status: 'in_progress',
  start_date: '2026-09-25',
  end_date: '2026-09-29',
  num_rounds: 3,
  course_name: 'Home course',
  selection_state: 'scoring',
});
const PRE_SEASON = qualifier({
  id: 'f4c6ee5a-1ede-4b17-9c29-1a4c4b0b437c',
  name: 'Pre-Season Qualifier — Spring Invitational',
  description:
    'Determines the 5-player travel roster for the Tri-State Invitational. Top 5 scorers earn automatic selection; coach holds one discretionary pick.',
  status: 'completed',
  start_date: '2026-08-07',
  end_date: '2026-08-07',
});
const FALL_QUALIFIER = qualifier({
  id: '487f30a2-7794-4ae7-a81f-752c90daab2f',
  name: 'Fall Qualifier — Travel Team Selection',
  description:
    'Single 18-hole stroke-play qualifier to determine the 5-player travel roster for fall invitational tournaments.',
  status: 'completed',
  start_date: '2026-06-16',
  end_date: '2026-06-16',
  selection_state: 'selected',
});
const QUALIFIERS = [FALL_INVITATIONAL, PRE_SEASON, FALL_QUALIFIER];

const slug = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

function feedEntry(
  player_name: string,
  rounds_completed: number,
  total_score: number | null,
  total_to_par: number | null,
) {
  return {
    id: `e-${slug(player_name)}`,
    qualifier_id: FALL_INVITATIONAL.id,
    player_id: slug(player_name),
    player_name,
    position: null,
    score: total_score,
    total_score,
    total_to_par,
    rounds_completed,
    is_tied: false,
    status: 'registered',
    notes: null,
    round_id: null,
    created_at: null,
    updated_at: null,
  };
}

// Production, 86dad12b: rounds 1 and 2 in for all seven.
const FEED = [
  feedEntry('Cole Bennett', 2, 141, -3),
  feedEntry('Mason Rivers', 2, 144, 0),
  feedEntry('Owen Carter', 2, 145, 1),
  feedEntry('Ethan Park', 2, 146, 2),
  feedEntry('Jackson Hale', 2, 147, 3),
  feedEntry('Dylan Brooks', 2, 150, 6),
  feedEntry('Tyler Hayes', 2, 155, 11),
];
const ENTERED_ONLY = FEED.map((e) => ({ ...e, rounds_completed: 0, total_score: null, total_to_par: null }));

const feed = (leaderboard: unknown[], extra: { loading?: boolean; error?: string | null } = {}) => ({
  qualifier: null,
  leaderboard,
  coursePar: 72,
  loading: false,
  error: null,
  refetch: vi.fn(),
  ...extra,
});

const SPRING = qualifier({
  id: '5a1e0000-0000-4000-8000-000000000001',
  name: 'Spring Qualifier',
  status: 'upcoming',
  start_date: '2026-10-05',
  end_date: '2026-10-07',
  num_rounds: 3,
});

beforeEach(() => {
  mockUseQualifierRealtime.mockReset();
});

describe('FairwayQualifiers hero', () => {
  it('puts the live Fall Invitational in the hero, read from the feed', () => {
    mockUseQualifierRealtime.mockReturnValue(feed(FEED));
    render(<FairwayQualifiers isCoach qualifiers={QUALIFIERS} />);

    expect(mockUseQualifierRealtime).toHaveBeenCalledWith(FALL_INVITATIONAL.id);
    const hero = screen.getByTestId('qualifier-hero');
    const title = within(hero).getByRole('heading', { level: 2, name: 'Fall Invitational Qualifier' });
    expect(within(title).getByRole('link')).toHaveAttribute(
      'href',
      `/golf/dashboard/qualifiers/${FALL_INVITATIONAL.id}`,
    );
    // One link for the whole card: the title, stretched over it.
    expect(hero.querySelectorAll('a[href]')).toHaveLength(1);

    expect(hero).toHaveTextContent('DatesSep 25–29, 2026');
    expect(hero).toHaveTextContent('Rounds3');
    expect(hero).toHaveTextContent('Spots5');
    expect(hero).toHaveTextContent('CourseHome course');

    expect(within(hero).getByText('Round 3 of 3 up next')).toBeInTheDocument();
    expect(within(hero).getByTestId('hero-cards-in')).toHaveTextContent('14 of 21 scorecards in');
    const bars = [...hero.querySelectorAll<HTMLElement>('[style*="width"]')].map((el) => el.style.width);
    expect(bars).toEqual(['100%', '100%', '0%']);

    expect(within(hero).getByText('7 players')).toBeInTheDocument();
    const rows = within(within(hero).getByRole('list')).getAllByRole('listitem');
    expect(rows.map((li) => li.children[0]?.textContent)).toEqual(['1', '2', '3']);
    expect(rows.map((li) => li.children[2]?.textContent)).toEqual(['Cole Bennett', 'Mason Rivers', 'Owen Carter']);
    expect(rows.map((li) => li.children[3]?.textContent)).toEqual(['−3', 'E', '+1']);
    // Under par is the green ink; even par quiet; over par plain ink.
    expect(rows[0]?.children[3]).toHaveClass('text-accent-ink');
    expect(rows[1]?.children[3]).toHaveClass('text-text-secondary');
    expect(rows[2]?.children[3]).toHaveClass('text-text-primary');
    expect(within(hero).getByText('+4 more on the board')).toBeInTheDocument();
  });

  it("gives a coach a secondary hero action, so Create qualifier stays the page's one primary", () => {
    mockUseQualifierRealtime.mockReturnValue(feed(FEED));
    render(<FairwayQualifiers isCoach qualifiers={QUALIFIERS} />);

    const cta = screen.getByTestId('qualifier-hero-cta');
    expect(cta).toHaveTextContent('View leaderboard');
    expect(cta).toHaveAttribute('aria-hidden', 'true');
    expect(cta).toHaveAttribute('data-variant', 'secondary');
    expect(screen.getByRole('link', { name: 'Create qualifier' })).toHaveAttribute('data-variant', 'primary');
    expect(document.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
  });

  it("makes the hero action a player's primary, with no Create qualifier", () => {
    mockUseQualifierRealtime.mockReturnValue(feed(FEED));
    render(<FairwayQualifiers isCoach={false} qualifiers={QUALIFIERS} />);

    expect(screen.queryByRole('link', { name: 'Create qualifier' })).toBeNull();
    expect(screen.getByTestId('qualifier-hero-cta')).toHaveAttribute('data-variant', 'primary');
  });

  it('names the field before anyone has scored, and says when no one has entered', () => {
    mockUseQualifierRealtime.mockReturnValue(feed(ENTERED_ONLY));
    const { unmount } = render(<FairwayQualifiers isCoach qualifiers={[SPRING]} />);

    let hero = screen.getByTestId('qualifier-hero');
    expect(within(hero).getByText('Upcoming')).toBeInTheDocument();
    expect(hero).toHaveTextContent('DatesOct 5–7, 2026');
    expect(within(hero).getByText('Round 1 of 3 up next')).toBeInTheDocument();
    expect(within(hero).getByTestId('hero-cards-in')).toHaveTextContent('0 of 21 scorecards in');
    expect(within(hero).getByText('7 players entered')).toBeInTheDocument();
    expect(within(hero).getByText('Scores post here once round 1 is in.')).toBeInTheDocument();
    expect(within(hero).queryByText('Top of the board')).toBeNull();
    expect(within(hero).getByTestId('qualifier-hero-cta')).toHaveTextContent('View details');
    unmount();

    mockUseQualifierRealtime.mockReturnValue(feed([]));
    render(<FairwayQualifiers isCoach qualifiers={[SPRING]} />);
    hero = screen.getByTestId('qualifier-hero');
    expect(within(hero).getByText('No players entered yet.')).toBeInTheDocument();
    expect(within(hero).queryByTestId('hero-cards-in')).toBeNull();
  });

  it('holds the well on a skeleton until the feed answers, and says so when it fails', () => {
    mockUseQualifierRealtime.mockReturnValue(feed([], { loading: true }));
    const { unmount } = render(<FairwayQualifiers isCoach qualifiers={QUALIFIERS} />);
    let hero = screen.getByTestId('qualifier-hero');
    expect(within(hero).queryByText('Top of the board')).toBeNull();
    expect(within(hero).queryByText(/players entered/)).toBeNull();
    expect(within(hero).queryByTestId('hero-cards-in')).toBeNull();
    expect(within(hero).queryByText(/up next/)).toBeNull();
    unmount();

    mockUseQualifierRealtime.mockReturnValue(feed([], { error: 'Failed to load qualifier' }));
    render(<FairwayQualifiers isCoach qualifiers={QUALIFIERS} />);
    hero = screen.getByTestId('qualifier-hero');
    expect(
      within(hero).getByText('Live standings could not load. The leaderboard has the latest.'),
    ).toBeInTheDocument();
    // The card itself still stands, with its link and facts.
    expect(within(hero).getByRole('link')).toHaveAttribute('href', `/golf/dashboard/qualifiers/${FALL_INVITATIONAL.id}`);
  });

  it("follows a search to a different hero and reads that qualifier's feed", () => {
    mockUseQualifierRealtime.mockImplementation((id: string) =>
      feed(id === FALL_INVITATIONAL.id ? FEED : []),
    );
    render(<FairwayQualifiers isCoach qualifiers={[SPRING, ...QUALIFIERS]} />);

    let hero = screen.getByTestId('qualifier-hero');
    expect(within(hero).getByRole('heading', { level: 2 })).toHaveTextContent('Fall Invitational Qualifier');

    fireEvent.change(screen.getByLabelText('Search qualifiers'), { target: { value: 'Spring Qualifier' } });

    hero = screen.getByTestId('qualifier-hero');
    expect(within(hero).getByRole('heading', { level: 2 })).toHaveTextContent('Spring Qualifier');
    expect(mockUseQualifierRealtime).toHaveBeenLastCalledWith(SPRING.id);
    expect(within(hero).queryByText('Cole Bennett')).toBeNull();
    expect(within(hero).getByText('No players entered yet.')).toBeInTheDocument();
  });
});

describe('FairwayQualifiers cards', () => {
  it('gives every card one link, its title, with the facts and the action below', () => {
    mockUseQualifierRealtime.mockReturnValue(feed(FEED));
    render(<FairwayQualifiers isCoach qualifiers={QUALIFIERS} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Concluded' })).toBeInTheDocument();
    const cards = screen.getAllByTestId('qualifier-card');
    expect(cards).toHaveLength(2);
    for (const card of cards) expect(card.querySelectorAll('a[href]')).toHaveLength(1);

    const [preSeason, fall] = cards as [HTMLElement, HTMLElement];
    const title = within(preSeason).getByRole('heading', { level: 3 });
    expect(title).toHaveTextContent('Pre-Season Qualifier');
    expect(within(title).getByRole('link')).toHaveAttribute('href', `/golf/dashboard/qualifiers/${PRE_SEASON.id}`);
    expect(within(preSeason).getByText('Completed')).toBeInTheDocument();
    expect(preSeason).toHaveTextContent('DateAug 7, 2026');
    expect(preSeason).toHaveTextContent('Rounds1');
    expect(preSeason).toHaveTextContent('Spots5');
    expect(preSeason).toHaveTextContent('CourseDemo University Home Course');
    expect(preSeason).toHaveTextContent('View results');
    expect(fall).toHaveTextContent('Fall Qualifier');
    expect(fall).toHaveTextContent('DateJun 16, 2026');
  });
});

describe('formatDateRange', () => {
  it('prints a range as short as it stays unambiguous', () => {
    expect(formatDateRange('2026-08-07', '2026-08-07')).toBe('Aug 7, 2026');
    expect(formatDateRange('2026-08-07', null)).toBe('Aug 7, 2026');
    expect(formatDateRange('2026-09-25', '2026-09-29')).toBe('Sep 25–29, 2026');
    expect(formatDateRange('2026-09-29', '2026-10-02')).toBe('Sep 29 – Oct 2, 2026');
    expect(formatDateRange('2026-12-30', '2027-01-02')).toBe('Dec 30, 2026 – Jan 2, 2027');
    expect(formatDateRange('2026-09-29', '2026-09-25')).toBe('Sep 29, 2026 – Sep 25, 2026');
  });
});
