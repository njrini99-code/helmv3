/**
 * ============================================================================
 * FairwayTravel
 * ----------------------------------------------------------------------------
 * #173 orphaned detail pane: CSS Grid's `stretch` matched the detail column to
 * the (taller) list column and centred its content far below the fold. The
 * grid disables stretch (`lg:items-start`) and the detail column opts out and
 * sticks (`lg:self-start lg:sticky lg:top-6`). jsdom can't measure layout, so
 * those tests lock the class contract.
 *
 * Owner 2026-09-28 rebuild: the list groups by local calendar day, the desktop
 * panel always shows a trip (the default: on the road, else the next to
 * leave, else the latest past trip; never an empty "Select a trip"), every
 * panel action works on the trip the panel shows, and expense reads are per
 * trip so a late answer never lands on another trip.
 * ========================================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';

import { FairwayTravel } from './FairwayTravel';
import type { TravelItinerary } from './travel-helpers';
import {
  createGolfTravelItinerary,
  getExpensesForItinerary,
  getExpenseSummary,
  type TravelExpense,
} from '@/app/golf/actions/travel';

// Module-scope spies (via vi.hoisted so the hoisted vi.mock factory below can
// close over the SAME objects the tests assert on).
const { mockRouter } = vi.hoisted(() => ({
  mockRouter: { refresh: vi.fn(), push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

vi.mock('@/app/golf/actions/player-notifications', () => ({
  markTravelSeen: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/app/golf/actions/travel', () => ({
  createGolfTravelItinerary: vi.fn(),
  updateGolfTravelItinerary: vi.fn(),
  deleteGolfTravelItinerary: vi.fn(),
  getExpensesForItinerary: vi.fn().mockResolvedValue({ success: true, data: [] }),
  getExpenseSummary: vi.fn().mockResolvedValue({ success: true, data: null }),
  getBudgetsForItinerary: vi.fn().mockResolvedValue({ success: true, data: [] }),
  exportExpensesToCSV: vi.fn(),
}));

// The expense editor is its own component with its own tests; here only which
// trip it opens for matters.
vi.mock('./FairwayExpenseForm', () => ({
  FairwayExpenseForm: ({ isOpen, itineraryId }: { isOpen: boolean; itineraryId?: string | null }) =>
    isOpen ? <div data-testid="expense-form" data-itinerary-id={itineraryId ?? ''} /> : null,
}));

// FairwayItineraryModal loads the optional "Link to event" picker via a
// direct browser Supabase client, which throws without env vars.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          neq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

function makeItinerary(id: string, overrides: Partial<TravelItinerary> = {}): TravelItinerary {
  return {
    id,
    event_id: null,
    event_title: null,
    event_name: `Trip ${id}`,
    destination: 'Pinehurst, NC',
    transportation_type: 'bus',
    departure_date: '2026-08-01',
    departure_time: null,
    departure_location: null,
    return_date: '2026-08-03',
    return_time: null,
    flight_info: null,
    hotel_name: null,
    hotel_address: null,
    hotel_phone: null,
    hotel_confirmation: null,
    check_in_date: null,
    check_out_date: null,
    room_assignments: null,
    uniform_requirements: null,
    gear_list: null,
    notes: null,
    created_at: null,
    ...overrides,
  };
}

/** The demo team's three production trips (the QA row is is_test and never reaches the page). */
const DEMO_TRIPS: TravelItinerary[] = [
  makeItinerary('3eced5b3-9bdd-4c46-8949-f8ac85602cca', {
    event_name: 'Palmetto Qualifier — Greenville',
    destination: 'Greenville, SC',
    transportation_type: 'van',
    departure_date: '2026-07-07',
    return_date: '2026-07-09',
  }),
  makeItinerary('b9bd52f3-7925-48c0-8e21-eccb0ee73fe3', {
    event_name: 'Spring Preview Tournament — Columbia',
    destination: 'Columbia, SC',
    transportation_type: 'van',
    departure_date: '2026-07-31',
    return_date: '2026-08-01',
  }),
  makeItinerary('d316e8be-dab3-443a-8472-64f612fd9fd3', {
    event_name: 'Furman Fall Invitational Retry',
    destination: 'Travelers Rest, SC (near Furman)',
    departure_date: '2026-10-20',
    return_date: null,
  }),
];
const FURMAN_ID = 'd316e8be-dab3-443a-8472-64f612fd9fd3';

/** matchMedia answering the desktop query (the panel is beside the list). */
function stubDesktopViewport() {
  const original = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 1024px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });
  afterEach(() => {
    window.matchMedia = original;
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function expense(id: string, itineraryId: string, amount: number): TravelExpense {
  return {
    id,
    itinerary_id: itineraryId,
    team_id: 'team-1',
    category: 'meals',
    description: `Expense ${id}`,
    amount,
    receipt_url: null,
    paid_by: 'team',
    vendor_name: null,
    expense_date: '2026-08-01',
    notes: null,
    created_by: 'coach-1',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  } as TravelExpense;
}

describe('FairwayTravel — #173 orphaned detail pane', () => {
  it('scrolls the selected detail into view after a normal mobile selection', async () => {
    const originalWidth = window.innerWidth;
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });

    try {
      render(
        <FairwayTravel
          itineraries={[makeItinerary('a'), makeItinerary('b'), makeItinerary('c')]}
          coachId="coach-1"
          teamId="team-1"
          isCoach={false}
          nowISO="2026-07-01"
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /Trip b/ }));

      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' }));
    } finally {
      raf.mockRestore();
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('never stretches the detail column to the (possibly long) list column height on desktop', () => {
    const itineraries = Array.from({ length: 8 }, (_, i) => makeItinerary(String(i)));

    render(
      <FairwayTravel itineraries={itineraries} coachId="coach-1" teamId="team-1" isCoach={false} nowISO="2026-07-01" />,
    );

    // Nothing picked: the panel shows the default trip, not an empty pane.
    expect(screen.queryByText('Select a trip')).toBeNull();
    const heading = screen.getByRole('heading', { level: 2, name: 'Trip 0' });
    const detailColumn = heading.closest('.lg\\:col-span-2');
    expect(detailColumn).not.toBeNull();
    expect(detailColumn).toHaveClass('lg:col-span-2', 'lg:sticky', 'lg:top-6', 'lg:self-start');

    const grid = detailColumn?.parentElement;
    expect(grid).toHaveClass('lg:items-start');
  });

  it('keeps the same sticky/self-start column once a trip IS selected', () => {
    render(
      <FairwayTravel
        itineraries={[makeItinerary('a'), makeItinerary('b')]}
        coachId="coach-1"
        teamId="team-1"
        isCoach={false}
        nowISO="2026-07-01"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Trip b/ }));

    const heading = screen.getByRole('heading', { level: 2, name: 'Trip b' });
    const detailColumn = heading.closest('.lg\\:col-span-2');
    expect(detailColumn).not.toBeNull();
    expect(detailColumn).toHaveClass('lg:sticky', 'lg:top-6', 'lg:self-start');
    expect(detailColumn).not.toHaveClass('hidden');
  });
});

describe('FairwayTravel — grouped list and the default trip (production rows, Sep 28 2026)', () => {
  it('groups by calendar day and counts the phases in the masthead', () => {
    render(<FairwayTravel itineraries={DEMO_TRIPS} coachId="coach-1" teamId="team-1" isCoach nowISO="2026-09-28" />);

    const list = screen.getByRole('region', { name: 'Trips' });
    const upcoming = within(list).getByRole('region', { name: 'Upcoming' });
    const past = within(list).getByRole('region', { name: 'Past trips' });
    expect(within(list).queryByRole('region', { name: 'On the road' })).toBeNull();

    expect(within(upcoming).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringContaining('Furman Fall Invitational Retry'),
    ]);
    expect(within(upcoming).getByText('In 22 days')).toBeInTheDocument();
    // Most recent first.
    expect(within(past).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringContaining('Spring Preview Tournament'),
      expect.stringContaining('Palmetto Qualifier'),
    ]);
    expect(within(past).getByText('Returned Aug 1')).toBeInTheDocument();

    expect(screen.getByText('1 upcoming')).toBeInTheDocument();
    expect(screen.getByText('2 past')).toBeInTheDocument();
  });

  it('opens the panel on the next trip to leave, with no empty "Select a trip"', () => {
    render(<FairwayTravel itineraries={DEMO_TRIPS} coachId="coach-1" teamId="team-1" isCoach nowISO="2026-09-28" />);

    expect(screen.queryByText('Select a trip')).toBeNull();
    const heading = screen.getByRole('heading', { level: 2, name: 'Furman Fall Invitational Retry' });
    // Shown, not picked: the panel stays desktop-only until a pick.
    expect(heading.closest('.lg\\:col-span-2')).toHaveClass('hidden', 'lg:block');
    expect(screen.getByTestId('trip-countdown')).toHaveTextContent('22days to go');

    const furmanCard = screen.getByRole('button', { name: /Furman Fall Invitational Retry/ });
    expect(furmanCard).toHaveAttribute('aria-pressed', 'false');
    expect(furmanCard).toHaveClass('lg:border-border-strong');
  });

  it('opens on the latest past trip when nothing is ahead', () => {
    render(
      <FairwayTravel
        itineraries={DEMO_TRIPS.slice(0, 2)}
        coachId="coach-1"
        teamId="team-1"
        isCoach={false}
        nowISO="2026-09-28"
      />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Spring Preview Tournament — Columbia' })).toBeInTheDocument();
  });

  it('shows the latest past trips first and the rest on request', () => {
    const past = Array.from({ length: 7 }, (_, i) =>
      makeItinerary(`p${i}`, { departure_date: `2026-0${i + 1}-10`, return_date: `2026-0${i + 1}-12` }),
    );
    render(<FairwayTravel itineraries={past} coachId="coach-1" teamId="team-1" isCoach={false} nowISO="2026-09-28" />);

    const group = screen.getByRole('region', { name: 'Past trips' });
    expect(within(group).getAllByRole('button', { name: /^Trip p/ })).toHaveLength(4);
    fireEvent.click(within(group).getByRole('button', { name: 'Show 3 earlier trips' }));
    expect(within(group).getAllByRole('button', { name: /^Trip p/ })).toHaveLength(7);
    expect(within(group).getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('FairwayTravel — the panel acts on the trip it shows', () => {
  stubDesktopViewport();

  beforeEach(() => {
    vi.mocked(getExpensesForItinerary).mockReset().mockResolvedValue({ success: true, data: [] });
    vi.mocked(getExpenseSummary).mockReset().mockResolvedValue({ success: true, data: undefined });
  });

  it('loads the default trip’s expenses on desktop and adds an expense to that trip', async () => {
    render(<FairwayTravel itineraries={DEMO_TRIPS} coachId="coach-1" teamId="team-1" isCoach nowISO="2026-09-28" />);

    await waitFor(() => expect(getExpensesForItinerary).toHaveBeenCalledWith(FURMAN_ID));
    expect(await screen.findByText('No expenses logged yet.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-itinerary-id', FURMAN_ID);
  });

  it('drops a late expense answer for a trip no longer shown', async () => {
    const [palmetto, spring] = DEMO_TRIPS as [TravelItinerary, TravelItinerary];
    const reads = new Map([
      [FURMAN_ID, deferred<{ success: boolean; data: TravelExpense[] }>()],
      [palmetto.id, deferred<{ success: boolean; data: TravelExpense[] }>()],
      [spring.id, deferred<{ success: boolean; data: TravelExpense[] }>()],
    ]);
    vi.mocked(getExpensesForItinerary).mockImplementation((id: string) => reads.get(id)!.promise);

    render(<FairwayTravel itineraries={DEMO_TRIPS} coachId="coach-1" teamId="team-1" isCoach nowISO="2026-09-28" />);

    fireEvent.click(screen.getByRole('button', { name: /Palmetto Qualifier/ }));
    fireEvent.click(screen.getByRole('button', { name: /Spring Preview Tournament/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'Spring Preview Tournament — Columbia' })).toBeInTheDocument();

    // Spring Preview answers first with nothing logged; Palmetto's answer
    // (three expenses) arrives late and must not paint onto Spring Preview.
    await act(async () => {
      reads.get(spring.id)!.resolve({ success: true, data: [] });
    });
    expect(await screen.findByText('No expenses logged yet.')).toBeInTheDocument();

    await act(async () => {
      reads.get(palmetto.id)!.resolve({
        success: true,
        data: [expense('x1', palmetto.id, 10), expense('x2', palmetto.id, 20), expense('x3', palmetto.id, 30)],
      });
      reads.get(FURMAN_ID)!.resolve({ success: true, data: [] });
    });
    expect(screen.getByText('No expenses logged yet.')).toBeInTheDocument();
    expect(screen.queryByText(/across 3 expenses/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete itinerary' }));
    expect(
      screen.getByText('This removes the entire itinerary. No expenses are logged on this trip yet.'),
    ).toBeInTheDocument();
  });

  it('shows a failed expense read as failed, with a retry', async () => {
    vi.mocked(getExpensesForItinerary).mockResolvedValueOnce({ success: false, error: 'boom' });

    render(<FairwayTravel itineraries={DEMO_TRIPS} coachId="coach-1" teamId="team-1" isCoach nowISO="2026-09-28" />);

    expect(await screen.findByText('Expenses could not load.')).toBeInTheDocument();
    expect(screen.queryByText('No expenses logged yet.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No expenses logged yet.')).toBeInTheDocument();
    expect(getExpensesForItinerary).toHaveBeenCalledTimes(2);
  });
});

describe('FairwayTravel — create-itinerary success stays on Travel', () => {
  // GAPS_AUDIT_INTERACTION_CRUD_2026-09-02: a coach who creates a trip was
  // reportedly bounced to /golf/dashboard/roster. Create and update run the
  // same `handleSave` branch, which only calls `router.refresh()`. This locks
  // that contract: a successful create refreshes in place, closes the modal,
  // and never calls push/back/replace.
  beforeEach(() => {
    mockRouter.refresh.mockClear();
    mockRouter.push.mockClear();
    mockRouter.back.mockClear();
    mockRouter.replace.mockClear();
    vi.mocked(createGolfTravelItinerary).mockReset();
  });

  it('stays on Travel, refreshes, and closes the modal — never navigates to roster', async () => {
    vi.mocked(createGolfTravelItinerary).mockResolvedValue({
      success: true,
      data: { id: 'new-trip' },
    });

    render(<FairwayTravel itineraries={[]} coachId="coach-1" teamId="team-1" isCoach nowISO="2026-07-01" />);

    fireEvent.click(screen.getByRole('button', { name: 'Create first itinerary' }));

    expect(screen.getByText('Create travel itinerary')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Event name'), {
      target: { value: 'State Championship' },
    });
    fireEvent.change(screen.getByLabelText('Destination'), {
      target: { value: 'Pinehurst, NC' },
    });
    fireEvent.change(screen.getByLabelText('Departure date'), {
      target: { value: '2026-09-10' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create itinerary' }));

    await waitFor(() => {
      expect(createGolfTravelItinerary).toHaveBeenCalledTimes(1);
    });
    expect(createGolfTravelItinerary).toHaveBeenCalledWith(
      expect.objectContaining({
        team_id: 'team-1',
        created_by: 'coach-1',
        event_name: 'State Championship',
        destination: 'Pinehurst, NC',
        departure_date: '2026-09-10',
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText('Create travel itinerary')).not.toBeInTheDocument();
    });
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);

    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('FairwayTravel — phone navigation stack (NAT-05) and mark-seen (DATA-03)', () => {
  it('keeps the panel desktop-only until a pick, then swaps the list for the detail', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    try {
      render(
        <FairwayTravel
          itineraries={[makeItinerary('a'), makeItinerary('b')]}
          coachId="coach-1"
          teamId="team-1"
          isCoach
          nowISO="2026-07-01"
        />,
      );

      // Nothing picked: the panel (showing the default) is desktop-only.
      const detailColumn = screen.getByRole('heading', { level: 2, name: 'Trip a' }).closest('.lg\\:col-span-2');
      expect(detailColumn).toHaveClass('hidden', 'lg:block');
      expect(screen.queryByRole('button', { name: 'All trips' })).toBeNull();

      const card = screen.getByRole('button', { name: /Trip b/ });
      fireEvent.click(card);

      // Picked: the list hides below lg, the detail shows with a Back control.
      expect(screen.getByRole('region', { name: 'Trips' })).toHaveClass('hidden', 'lg:flex');
      expect(detailColumn).not.toHaveClass('hidden');
      const back = screen.getByRole('button', { name: 'All trips' });
      expect(back.closest('.lg\\:hidden')).not.toBeNull();

      fireEvent.click(back);
      expect(screen.getByRole('region', { name: 'Trips' })).not.toHaveClass('hidden');
    } finally {
      raf.mockRestore();
    }
  });

  it('returns focus to the card a phone pick came from', () => {
    const originalWidth = window.innerWidth;
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    try {
      render(
        <FairwayTravel
          itineraries={[makeItinerary('a'), makeItinerary('b')]}
          coachId="coach-1"
          teamId="team-1"
          isCoach={false}
          nowISO="2026-07-01"
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /Trip b/ }));
      expect(screen.getByRole('heading', { level: 2, name: 'Trip b' })).toHaveFocus();

      fireEvent.click(screen.getByRole('button', { name: 'All trips' }));
      expect(screen.getByRole('button', { name: /Trip b/ })).toHaveFocus();
    } finally {
      raf.mockRestore();
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    }
  });

  it('swallows a failed mark-seen instead of leaving an unhandled rejection', async () => {
    const { markTravelSeen } = await import('@/app/golf/actions/player-notifications');
    vi.mocked(markTravelSeen).mockRejectedValueOnce(new Error('offline'));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      render(
        <FairwayTravel itineraries={[makeItinerary('a')]} coachId="coach-1" teamId="team-1" isCoach={false} nowISO="2026-07-01" />,
      );
      await waitFor(() => expect(markTravelSeen).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
