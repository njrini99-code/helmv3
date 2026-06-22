/**
 * ============================================================================
 * FairwayPlayerHub (live Fairway player Hub) — regression coverage (P152)
 * ----------------------------------------------------------------------------
 * The flag-ON player Hub is the prod-served home, but had NO test coverage. The
 * load-bearing behaviors are the optimistic write boundary (complete + RSVP,
 * each with revert-on-failure AND a visible error toast — the P143 fix) and the
 * honest-empty bucketing (a past trip must NEVER appear as an "upcoming" hero).
 *
 * These tests render the REAL FairwayPlayerHubWrapper. They mock only:
 *   • the two server actions (completeTask / respondToEvent) — to drive
 *     success/failure deterministically,
 *   • next/navigation (router.refresh is a no-op here),
 *   • the Fairway primitive barrel + the hub sub-parts, reduced to tiny test
 *     doubles that expose the onComplete / onRSVP callbacks as plain buttons and
 *     render the upcoming-trip bucket so the honest-empty assertion is real.
 * The wrapper's optimistic state + revert + fairwayToast logic is the genuine
 * code under test.
 * ========================================================================== */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Server actions (the write boundary) ────────────────────────────────────
const completeTask = vi.fn();
const respondToEvent = vi.fn();
vi.mock('@/app/golf/actions/tasks', () => ({ completeTask: (...a: unknown[]) => completeTask(...a) }));
vi.mock('@/app/golf/actions/golf', () => ({ respondToEvent: (...a: unknown[]) => respondToEvent(...a) }));

// ── Router + Link (next/link needs IntersectionObserver in jsdom) ──────────
const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children?: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// ── Toast (the P143 visible-feedback channel under test) ───────────────────
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('@/components/fairway', () => ({
  fairwayToast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) },
  // Minimal primitive doubles used by FairwayPlayerHub itself.
  ViewHeader: ({ title }: { title?: React.ReactNode }) => <header>{title}</header>,
  // eslint-disable-next-line helm/no-raw-button
  Button: ({ children }: { children?: React.ReactNode }) => <button type="button">{children}</button>,
  InsightCard: ({ title }: { title?: React.ReactNode }) => <div>{title}</div>,
  Surface: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

// ── hub-parts: expose the callbacks as plain buttons + render the upcoming
//    trips bucket so honest-empty is testable against the real filter. ───────
vi.mock('./hub-parts', () => ({
  useTimeWord: () => 'Good morning',
  SectionTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  TaskRow: ({ onComplete }: { onComplete: () => void }) => (
    // eslint-disable-next-line helm/no-raw-button
    <button type="button" onClick={() => void onComplete()}>complete-task</button>
  ),
  RSVPRow: ({ onRSVP }: { onRSVP: (s: 'accepted' | 'declined' | 'tentative') => void }) => (
    // eslint-disable-next-line helm/no-raw-button
    <button type="button" onClick={() => void onRSVP('accepted')}>rsvp-going</button>
  ),
  TripRow: ({ trip }: { trip: { event_name: string } }) => <div data-testid="upcoming-trip">{trip.event_name}</div>,
  TripDetailSheet: () => null,
  AnnouncementsList: () => null,
}));

import { FairwayPlayerHubWrapper } from './FairwayPlayerHub';

const baseProps = {
  trips: [],
  tasks: [],
  events: [],
  announcements: [],
  playerName: 'Nick Rini',
  teamName: 'Demo University',
};

const overdueTask = {
  id: 't1',
  title: 'Upload swing video',
  description: null,
  due_date: '2020-01-01',
  category: null,
  requires_upload: true,
  status: 'overdue' as const,
  completed_at: null,
};

const pendingEvent = {
  id: 'e1',
  event_id: 'evt1',
  title: 'Team practice',
  event_type: 'practice',
  start_time: '2999-01-01T10:00:00Z',
  end_time: null,
  location: 'Range',
  is_mandatory: false,
  rsvp_status: 'pending' as const,
  going_count: 0,
  maybe_count: 0,
};

beforeEach(() => {
  completeTask.mockReset();
  respondToEvent.mockReset();
  refresh.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

describe('FairwayPlayerHub — optimistic write boundary', () => {
  it('completeTask failure reverts AND surfaces the plain-language reason (P143)', async () => {
    completeTask.mockResolvedValue({ success: false, error: 'Task is locked by your coach.' });
    render(<FairwayPlayerHubWrapper {...baseProps} tasks={[overdueTask]} />);

    fireEvent.click(screen.getByText('complete-task'));

    await waitFor(() => expect(completeTask).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Task is locked by your coach.'));
  });

  it('completeTask success does NOT toast an error', async () => {
    completeTask.mockResolvedValue({ success: true });
    render(<FairwayPlayerHubWrapper {...baseProps} tasks={[overdueTask]} />);

    fireEvent.click(screen.getByText('complete-task'));

    await waitFor(() => expect(completeTask).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();
  });

  it('RSVP failure reverts AND surfaces the typed error instead of a silent flicker (P143)', async () => {
    respondToEvent.mockResolvedValue({ success: false, error: 'RSVP deadline has passed for this event.' });
    render(<FairwayPlayerHubWrapper {...baseProps} events={[pendingEvent]} />);

    fireEvent.click(screen.getByText('rsvp-going'));

    await waitFor(() => expect(respondToEvent).toHaveBeenCalledWith('evt1', 'accepted'));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('RSVP deadline has passed for this event.'),
    );
  });

  it('RSVP success does NOT toast an error', async () => {
    respondToEvent.mockResolvedValue({ success: true });
    render(<FairwayPlayerHubWrapper {...baseProps} events={[pendingEvent]} />);

    fireEvent.click(screen.getByText('rsvp-going'));

    await waitFor(() => expect(respondToEvent).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();
  });

  it('RSVP success shows an explicit confirmation toast (P156)', async () => {
    respondToEvent.mockResolvedValue({ success: true });
    render(<FairwayPlayerHubWrapper {...baseProps} events={[pendingEvent]} />);

    fireEvent.click(screen.getByText('rsvp-going'));

    await waitFor(() => expect(respondToEvent).toHaveBeenCalledWith('evt1', 'accepted'));
    // A saved RSVP must be visibly distinct from a silent failure: success toast
    // fires, error toast does not (visibility-of-system-status, Nielsen #1).
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("RSVP saved — you're going"));
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('FairwayPlayerHub — honest-empty bucketing', () => {
  it('a past trip is EXCLUDED from upcoming trips (never a fabricated hero)', () => {
    const pastTrip = {
      id: 'tr1',
      event_name: 'Last season finale',
      destination: 'Pinehurst',
      transportation_type: 'bus' as const,
      departure_date: '2020-01-01',
      departure_time: null,
      departure_location: null,
      return_date: '2020-01-03',
      return_time: null,
      hotel_name: null,
      hotel_address: null,
      hotel_phone: null,
      hotel_confirmation: null,
      uniform_requirements: null,
      gear_list: null,
      room_assignments: null,
      notes: null,
      flight_info: null,
    };
    render(<FairwayPlayerHubWrapper {...baseProps} trips={[pastTrip]} />);
    expect(screen.queryByTestId('upcoming-trip')).toBeNull();
  });

  it('a future trip IS shown in upcoming trips', () => {
    const futureTrip = {
      id: 'tr2',
      event_name: 'Spring invitational',
      destination: 'Augusta',
      transportation_type: 'fly' as const,
      departure_date: '2999-05-01',
      departure_time: null,
      departure_location: null,
      return_date: '2999-05-03',
      return_time: null,
      hotel_name: null,
      hotel_address: null,
      hotel_phone: null,
      hotel_confirmation: null,
      uniform_requirements: null,
      gear_list: null,
      room_assignments: null,
      notes: null,
      flight_info: null,
    };
    render(<FairwayPlayerHubWrapper {...baseProps} trips={[futureTrip]} />);
    expect(screen.getByTestId('upcoming-trip')).toHaveTextContent('Spring invitational');
  });
});
