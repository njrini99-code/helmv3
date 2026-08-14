import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

// ---------------------------------------------------------------------------
// Mocks — ModalShell flattened (portal/animation-free), member-rail tint
// stubbed, golf actions module fully mocked so dynamic import() resolves to
// controllable fakes.
// ---------------------------------------------------------------------------

vi.mock('@/components/fairway/overlays/ModalShell', () => {
  const Root = ({ open, title, children }: { open: boolean; title?: React.ReactNode; children?: React.ReactNode }) =>
    open ? (
      <div data-testid="modal-shell">
        {title ? <h2>{title}</h2> : null}
        {children}
      </div>
    ) : null;
  const Body = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Footer = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const ModalShell = Object.assign(Root, { Body, Footer });
  return { ModalShell };
});

vi.mock('@/components/fairway/forms/Switch', () => ({
  Switch: ({
    label,
    checked,
    onCheckedChange,
    disabled,
  }: {
    label?: React.ReactNode;
    checked: boolean;
    onCheckedChange: (next: boolean) => void;
    disabled?: boolean;
  }) => (
    <label>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
      />
      {label}
    </label>
  ),
}));

vi.mock('../FairwayCalendarMemberRail', () => ({
  tintFor: () => ({ bg: '#eef', text: '#225' }),
}));

const getEventRSVP = vi.fn();
const checkScheduleConflicts = vi.fn();
vi.mock('@/app/golf/actions/golf', () => ({
  getEventRSVP: (...args: unknown[]) => getEventRSVP(...args),
  checkScheduleConflicts: (...args: unknown[]) => checkScheduleConflicts(...args),
}));

import { FairwayEventEditor } from '../FairwayEventEditor';
import type { GolfEventFormData } from '@/components/golf/calendar/EventDetailModal';

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

function renderEditor(overrides: Partial<React.ComponentProps<typeof FairwayEventEditor>> = {}) {
  const onSave = vi.fn<(data: GolfEventFormData) => Promise<void>>().mockResolvedValue(undefined);
  const props: React.ComponentProps<typeof FairwayEventEditor> = {
    open: true,
    onClose: vi.fn(),
    event: makeEvent(),
    isCoach: true,
    onSave,
    isSaving: false,
    teamPlayers: PLAYERS,
    ...overrides,
  };
  const utils = render(<FairwayEventEditor {...props} />);
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

describe('FairwayEventEditor — attendee hydration and deltas', () => {
  it('hydrates the selection from existing attendance rows and sends empty deltas when untouched', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult(['p1', 'p2']));
    const { onSave } = renderEditor();

    await waitFor(() => expect(getEventRSVP).toHaveBeenCalledWith('evt-1'));
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
    const { onSave } = renderEditor();
    await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());

    fireEvent.click(playerToggle(/Ben R\./)); // deselect existing
    fireEvent.click(playerToggle(/Cam K\./)); // select new

    expect(screen.getByText(/1 player added · 1 player removed/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]![0];
    expect(payload.addAttendeeIds).toEqual(['p3']);
    expect(payload.removeAttendeeIds).toEqual(['p2']);
  });

  it('fail-safe: when hydration errors, sends selection as adds and NO removals', async () => {
    getEventRSVP.mockRejectedValue(new Error('network'));
    const { onSave } = renderEditor();

    await waitFor(() => expect(screen.getByText(/Couldn't load the current invitees/i)).toBeInTheDocument());

    fireEvent.click(playerToggle(/Cam K\./));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]![0];
    expect(payload.addAttendeeIds).toEqual(['p3']);
    expect(payload.removeAttendeeIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Series scope picker + recurrence pattern (audit #6 / #22)
// ---------------------------------------------------------------------------

describe('FairwayEventEditor — series and recurrence', () => {
  it('editing a series occurrence surfaces the scope picker and routes the chosen scope', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult([]));
    const { onSave } = renderEditor({ event: makeEvent({ parent_event_id: 'root-1' }) });
    await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Edit recurring event/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /This event only/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0].editScope).toBe('this');
  });

  /**
   * The recurrence controls are all visible now — a pill row for the frequency
   * and a Segmented for the end mode — so this drives them the way a coach
   * does. The end DATE is a popover DateChooser; its until→rule mapping is
   * pinned directly on the pure builder in event-form-helpers.test.ts
   * ("uses until instead of count when end mode is until and a date is set"),
   * so it isn't re-driven through the UI here.
   */
  it('create mode emits a structured recurrenceRule from the visible pattern controls', async () => {
    const { onSave } = renderEditor({ event: null });

    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: 'Morning practice' } });
    // Recurrence is a visible pill row, not a <select> — a coach can read the
    // whole pattern without opening a menu.
    const recurrence = screen.getByRole('group', { name: 'Recurrence' });
    fireEvent.click(within(recurrence).getByRole('button', { name: 'Every 2 weeks' }));
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Friday' }));
    // Series-end mode is a Segmented (Radix ToggleGroup type="single" →
    // radiogroup/radio), and the end date is a popover DateChooser.
    fireEvent.click(screen.getByRole('radio', { name: 'On a date' }));
    expect(screen.getByRole('radio', { name: 'On a date' })).toHaveAttribute('aria-checked', 'true');
    // ...and back, so the emitted rule carries a count rather than a date.
    fireEvent.click(screen.getByRole('radio', { name: 'After N events' }));

    fireEvent.click(screen.getByRole('button', { name: /create event/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]![0];
    expect(payload.recurrenceRule).toEqual({ frequency: 'biweekly', weekdays: [1, 5], count: 10 });
  });

  it('a series root prefills its stored pattern for the series-extend affordance', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult([]));
    renderEditor({ event: makeEvent({ recurrence_rule: 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR;COUNT=12' }) });

    expect(screen.getByText(/Series pattern/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(
        within(screen.getByRole('group', { name: 'Recurrence' })).getByRole('button', {
          name: 'Weekly',
        }),
      ).toHaveAttribute('aria-pressed', 'true');
    });
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Wednesday' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Friday' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sunday' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/extends this series/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Cancelled lifecycle
// ---------------------------------------------------------------------------

describe('FairwayEventEditor — cancelled events', () => {
  it('renders the cancelled state read-only with no save or delete affordance', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult(['p1']));
    renderEditor({ event: makeEvent({ status: 'cancelled' }), onDelete: vi.fn() });

    expect(screen.getByText('Cancelled event')).toBeInTheDocument();
    expect(screen.getByText(/This event is cancelled/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel event/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/event title/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /close/i })).toBeEnabled();
  });

  it('offers Restore only when wired, and calls it', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult([]));
    const onRestore = vi.fn().mockResolvedValue(undefined);
    renderEditor({ event: makeEvent({ status: 'cancelled' }), onRestore });

    fireEvent.click(screen.getByRole('button', { name: /restore event/i }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1));
  });

  it('uses soft-cancel copy for one-off deletes', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult([]));
    renderEditor({ onDelete: vi.fn() });
    await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());

    expect(screen.getByRole('button', { name: /cancel event/i })).toBeInTheDocument();
  });
});
