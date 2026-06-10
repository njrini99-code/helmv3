import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

// ---------------------------------------------------------------------------
// Mocks — heavy children + server-action module. The drawer is flattened so
// the form renders inline; the golf actions module is fully mocked so the
// component's dynamic import() resolves to controllable fakes.
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open ? <div data-testid="drawer">{children}</div> : null,
  DrawerContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children, id }: { children?: React.ReactNode; id?: string }) => <h2 id={id}>{children}</h2>,
}));

vi.mock('@/hooks/use-focus-trap', () => ({
  useFocusTrap: () => ({ modalRef: { current: null } }),
}));

vi.mock('@/components/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/useRSVP', () => ({
  useRSVP: () => ({ rsvpSummary: null, isLoading: false, error: null }),
  usePlayerEventRSVP: () => ({ status: 'pending', isLoading: false, respond: vi.fn() }),
}));

vi.mock('../EventDocumentsSection', () => ({
  EventDocumentsSection: () => <div data-testid="docs-section" />,
}));
vi.mock('../RSVPStatusSection', () => ({
  RSVPStatusSection: () => <div data-testid="rsvp-status" />,
}));
vi.mock('../PlayerRSVPCard', () => ({
  PlayerRSVPCard: () => <div data-testid="player-rsvp" />,
}));
vi.mock('../ConflictWarning', () => ({
  ConflictWarning: () => <div data-testid="conflict-warning" />,
}));

const getEventRSVP = vi.fn();
const checkScheduleConflicts = vi.fn();
vi.mock('@/app/golf/actions/golf', () => ({
  getEventRSVP: (...args: unknown[]) => getEventRSVP(...args),
  checkScheduleConflicts: (...args: unknown[]) => checkScheduleConflicts(...args),
  sendEventReminderToPlayers: vi.fn(),
}));

import { EventDetailModal, type GolfEventFormData } from '../EventDetailModal';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLAYERS = [
  { id: 'p1', first_name: 'Ava', last_name: 'Stone' },
  { id: 'p2', first_name: 'Ben', last_name: 'Reed' },
  { id: 'p3', first_name: 'Cam', last_name: 'Knox' },
];

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    team_id: 'team-1',
    title: 'Practice',
    event_type: 'practice',
    status: 'confirmed',
    start_date: '2026-06-15T13:00:00Z',
    end_date: '2026-06-15T15:00:00Z',
    all_day: false,
    location: 'Range',
    description: null,
    requires_rsvp: false,
    rsvp_deadline: null,
    max_attendees: null,
    parent_event_id: null,
    recurrence_rule: null,
    ...overrides,
  } as CalendarEvent;
}

function rsvpResult(playerIds: string[]) {
  return {
    success: true,
    data: {
      summary: {
        total: playerIds.length,
        accepted: 0,
        declined: 0,
        tentative: 0,
        pending: playerIds.length,
        attendees: playerIds.map((id) => ({
          playerId: id,
          playerName: id,
          status: 'pending',
          avatarUrl: null,
        })),
      },
      responseRate: 0,
      acceptanceRate: 0,
    },
  };
}

function renderModal(overrides: Partial<React.ComponentProps<typeof EventDetailModal>> = {}) {
  const onSave = vi.fn<(data: GolfEventFormData) => Promise<void>>().mockResolvedValue(undefined);
  const props: React.ComponentProps<typeof EventDetailModal> = {
    isOpen: true,
    onClose: vi.fn(),
    event: makeEvent(),
    isCreating: false,
    isCoach: true,
    onSave,
    isSaving: false,
    teamPlayers: PLAYERS,
    ...overrides,
  };
  const utils = render(<EventDetailModal {...props} />);
  return { ...utils, onSave, props };
}

const playerToggle = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  vi.clearAllMocks();
  checkScheduleConflicts.mockResolvedValue({ success: true, data: { hasConflict: false, conflicts: [], suggestions: [] } });
});

// ---------------------------------------------------------------------------
// Attendee hydration + explicit add/remove deltas (audit #4)
// ---------------------------------------------------------------------------

describe('EventDetailModal — attendee hydration and deltas', () => {
  it('hydrates the selection from existing attendance rows and sends empty deltas when untouched', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult(['p1', 'p2']));
    const { onSave } = renderModal();

    await waitFor(() => expect(getEventRSVP).toHaveBeenCalledWith('evt-1'));
    // Hydration done — loading note gone.
    await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]![0];
    expect(payload.attendeeIds.sort()).toEqual(['p1', 'p2']);
    expect(payload.addAttendeeIds).toEqual([]);
    expect(payload.removeAttendeeIds).toEqual([]);
  });

  it('computes adds and removes from explicit toggles and surfaces the save summary', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult(['p1', 'p2']));
    const { onSave } = renderModal();
    await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());

    // Deselect Ben (existing), select Cam (new).
    fireEvent.click(playerToggle(/Ben R\./));
    fireEvent.click(playerToggle(/Cam K\./));

    // Save summary mentions both directions.
    expect(screen.getByText(/1 player added · 1 player removed/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]![0];
    expect(payload.addAttendeeIds).toEqual(['p3']);
    expect(payload.removeAttendeeIds).toEqual(['p2']);
  });

  it('fail-safe: when hydration errors, sends selection as adds and NO removals', async () => {
    getEventRSVP.mockRejectedValue(new Error('network'));
    const { onSave } = renderModal();

    await waitFor(() => expect(screen.getByText(/Couldn't load the current invitees/i)).toBeInTheDocument());

    fireEvent.click(playerToggle(/Cam K\./));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]![0];
    expect(payload.addAttendeeIds).toEqual(['p3']);
    expect(payload.removeAttendeeIds).toEqual([]);
  });

  it('disables attendee toggles while hydration is in flight', async () => {
    let resolveRsvp: (v: unknown) => void = () => {};
    getEventRSVP.mockReturnValue(new Promise((resolve) => { resolveRsvp = resolve; }));
    renderModal();

    expect(screen.getByText(/Loading current invitees/i)).toBeInTheDocument();
    expect(playerToggle(/Ava S\./)).toBeDisabled();

    resolveRsvp(rsvpResult(['p1']));
    await waitFor(() => expect(playerToggle(/Ava S\./)).not.toBeDisabled());
  });
});

// ---------------------------------------------------------------------------
// Series scope picker (audit #6) + recurrence payload
// ---------------------------------------------------------------------------

describe('EventDetailModal — series and recurrence', () => {
  it('editing a series occurrence surfaces the scope dialog and routes the chosen scope', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult([]));
    const { onSave } = renderModal({
      event: makeEvent({ parent_event_id: 'root-1' }),
    });
    await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    // No save yet — the scope dialog interposes, defaulting to 'this'.
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Update recurring event/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /This event only/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0].editScope).toBe('this');
  });

  it('create mode emits a structured recurrenceRule from the pattern fields', async () => {
    const { onSave } = renderModal({ event: null, isCreating: true });

    fireEvent.change(screen.getByPlaceholderText(/event name/i), { target: { value: 'Morning practice' } });
    fireEvent.change(screen.getByLabelText(/^Repeats$/i), { target: { value: 'weekly' } });
    // Pick Mon + Wed.
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wednesday' }));

    fireEvent.click(screen.getByRole('button', { name: /create event/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]![0];
    expect(payload.recurrenceRule).toEqual({ frequency: 'weekly', weekdays: [1, 3], count: 10 });
  });

  it('a series root prefills its stored pattern for the series-extend affordance', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult([]));
    renderModal({
      event: makeEvent({ recurrence_rule: 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;COUNT=8' }),
    });

    expect(screen.getByText(/Series pattern/i)).toBeInTheDocument();
    await waitFor(() => {
      expect((screen.getByLabelText(/Series pattern/i) as HTMLSelectElement).value).toBe('biweekly');
    });
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Friday' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tuesday' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/extends this series/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Cancelled lifecycle (audit #19 UI half)
// ---------------------------------------------------------------------------

describe('EventDetailModal — cancelled events', () => {
  it('renders the cancelled state read-only with no save or delete affordance', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult(['p1']));
    renderModal({
      event: makeEvent({ status: 'cancelled' }),
      onDelete: vi.fn(),
    });

    expect(screen.getByText('Cancelled Event')).toBeInTheDocument();
    expect(screen.getByText(/This event is cancelled/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel event/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/event name/i)).toBeDisabled();
  });

  it('offers Restore only when wired, and calls it', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult([]));
    const onRestore = vi.fn().mockResolvedValue(undefined);
    renderModal({ event: makeEvent({ status: 'cancelled' }), onRestore });

    fireEvent.click(screen.getByRole('button', { name: /restore event/i }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1));
  });

  it('uses soft-cancel copy for one-off deletes', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult([]));
    renderModal({ onDelete: vi.fn() });
    await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());

    expect(screen.getByRole('button', { name: /cancel event/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /cancel event/i }));
    expect(screen.getByRole('button', { name: /confirm cancellation/i })).toBeInTheDocument();
  });
});
