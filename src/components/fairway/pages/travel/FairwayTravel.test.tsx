/**
 * ============================================================================
 * FairwayTravel — #173 orphaned desktop detail-pane regression coverage
 * ----------------------------------------------------------------------------
 * With a long enough trip list, the CSS-Grid `stretch` default matched the
 * detail column's height to the (much taller) list column, then vertically
 * centered its content — so the "Select a trip" empty state, and the real
 * detail view once a trip is picked, rendered far below the fold instead of
 * staying in view. The fix pins the detail column near the top of the
 * viewport at `lg:` (`sticky` + `self-start`, mirroring FairwayTasks's
 * templates rail) so it's always visible while the list scrolls beside it.
 *
 * jsdom can't measure real layout/stretch, so this locks the CLASS CONTRACT
 * that produces the fix: the grid disables stretch (`lg:items-start`) and the
 * detail column opts out of it and sticks (`lg:self-start lg:sticky lg:top-6`).
 * ========================================================================== */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { FairwayTravel } from './FairwayTravel';
import type { TravelItinerary } from './travel-helpers';
import { createGolfTravelItinerary } from '@/app/golf/actions/travel';

// Module-scope spies (via vi.hoisted so the vi.mock factory below — which is
// itself hoisted above these imports — can close over the SAME objects the
// tests assert on afterward, rather than a fresh vi.fn() per render).
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

// FairwayItineraryModal loads the optional "Link to event" picker via a
// direct browser Supabase client. The real client throws synchronously
// without env vars (see src/lib/supabase/client.ts), so it's stubbed here —
// the picker itself is irrelevant to the create-navigation contract below.
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

describe('FairwayTravel — #173 orphaned detail pane', () => {
  it('never stretches the detail column to the (possibly long) list column height on desktop', () => {
    const itineraries = Array.from({ length: 8 }, (_, i) => makeItinerary(String(i)));

    render(
      <FairwayTravel
        itineraries={itineraries}
        coachId="coach-1"
        teamId="team-1"
        isCoach={false}
        nowISO="2026-07-01"
      />,
    );

    const emptyTitle = screen.getByText('Select a trip');
    // The column wrapper is the `ref`ed `lg:col-span-2` ancestor a few levels
    // up from the empty-state text.
    const detailColumn = emptyTitle.closest('.lg\\:col-span-2');
    expect(detailColumn).not.toBeNull();
    expect(detailColumn).toHaveClass('lg:col-span-2');
    expect(detailColumn).toHaveClass('lg:sticky');
    expect(detailColumn).toHaveClass('lg:top-6');
    expect(detailColumn).toHaveClass('lg:self-start');

    const grid = detailColumn?.parentElement;
    expect(grid).toHaveClass('lg:items-start');
  });

  it('keeps the same sticky/self-start column once a trip IS selected', () => {
    const itineraries = [makeItinerary('a'), makeItinerary('b')];

    render(
      <FairwayTravel
        itineraries={itineraries}
        coachId="coach-1"
        teamId="team-1"
        isCoach={false}
        nowISO="2026-07-01"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Trip a/ }));

    // The detail panel now renders the selected trip's own heading — the LAST
    // "Trip a" match (the first is the still-mounted list-card button label).
    const matches = screen.getAllByText('Trip a');
    const heading = matches[matches.length - 1]!;
    const detailColumn = heading.closest('.lg\\:col-span-2');
    expect(detailColumn).not.toBeNull();
    expect(detailColumn).toHaveClass('lg:sticky');
    expect(detailColumn).toHaveClass('lg:top-6');
    expect(detailColumn).toHaveClass('lg:self-start');
  });
});

describe('FairwayTravel — create-itinerary success stays on Travel', () => {
  // GAPS_AUDIT_INTERACTION_CRUD_2026-09-02: a coach who creates a trip was
  // reportedly bounced to /golf/dashboard/roster instead of staying on
  // /golf/dashboard/travel, unlike edit/delete which stay in place. No
  // navigation call was found anywhere in the create path (FairwayTravel,
  // FairwayItineraryModal, the createGolfTravelItinerary/updateGolfTravel
  // Itinerary server actions, ModalShell, or the dashboard layouts) — create
  // and update run the identical `handleSave` branch below, which only ever
  // calls `router.refresh()`. This locks that contract: a successful create
  // refreshes in place, closes the modal, and never calls push/back/replace
  // — with the roster route singled out as the one this regression would hit.
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

    render(
      <FairwayTravel
        itineraries={[]}
        coachId="coach-1"
        teamId="team-1"
        isCoach
        nowISO="2026-07-01"
      />,
    );

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

    // The save success path: refresh in place, modal closed.
    await waitFor(() => {
      expect(screen.queryByText('Create travel itinerary')).not.toBeInTheDocument();
    });
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);

    // The regression itself: no client-side navigation anywhere, and
    // specifically never to the roster route.
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
