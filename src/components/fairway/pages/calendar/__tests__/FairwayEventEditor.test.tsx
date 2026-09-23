import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

// ---------------------------------------------------------------------------
// Mocks — ModalShell flattened (portal/animation-free), member-rail tint
// stubbed, golf actions module fully mocked so dynamic import() resolves to
// controllable fakes.
// ---------------------------------------------------------------------------

vi.mock('@/components/fairway/overlays/ModalShell', () => {
  // `trigger` is rendered like the real shell's Radix `asChild` trigger: a
  // click on it opens the dialog. The people picker relies on this.
  const Root = ({ open, title, children, trigger, onOpenChange }: {
    open: boolean; title?: React.ReactNode; children?: React.ReactNode;
    trigger?: React.ReactNode; onOpenChange?: (open: boolean) => void;
  }) => (
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- test stub; the real shell's trigger is a native button */}
      {trigger ? <span onClick={() => onOpenChange?.(true)}>{trigger}</span> : null}
      {open ? (
        <div data-testid="modal-shell">
          {title ? <h2>{title}</h2> : null}
          {children}
        </div>
      ) : null}
    </>
  );
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

/**
 * Renders the editor and, by default, jumps the phone-width stage dock to
 * Review — the one stage whose bottom dock carries the publish action
 * (Save changes / Create event). Every field stays mounted on every stage
 * (see editor/EventEditorStages.tsx), so this only changes which dock
 * buttons render. Pass `{ stage: 'essentials' }` to stay on the first stage.
 */
function renderEditor(
  overrides: Partial<React.ComponentProps<typeof FairwayEventEditor>> = {},
  { stage = 'review' }: { stage?: 'essentials' | 'review' } = {},
) {
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
  if (stage === 'review') {
    const reviewDot = screen.queryByRole('button', { name: 'Go to Review' });
    if (reviewDot) fireEvent.click(reviewDot);
  }
  return { ...utils, onSave, props };
}

/** The invite UI is the people picker (§2.3): open it from the summary
 * button, toggle rows by name, and apply. Each name toggles once. */
async function pickPlayers(...names: RegExp[]) {
  fireEvent.click(screen.getByRole('button', { name: /Choose/ }));
  for (const name of names) {
    fireEvent.click(await screen.findByRole('option', { name }));
  }
  fireEvent.click(screen.getByRole('button', { name: /Apply attendees/ }));
}

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

  /**
   * Opening an event and closing it WITHOUT touching anything must not warn
   * about discarding changes.
   *
   * pristineRef is snapshotted when the editor opens, but the attendee
   * hydration and stored-recurrence prefill both call setFormData afterwards.
   * Those are the editor loading itself, not the coach editing — yet they made
   * isDirty true, so every event that had attendees or a recurrence rule
   * raised the discard guard over nothing.
   *
   * This can only be seen after a re-render: the first paint is clean and the
   * false dirty state appears when hydration resolves.
   */
  it('does not warn about discarding when hydration was the only change', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult(['p1', 'p2']));
    renderEditor();

    await waitFor(() => expect(getEventRSVP).toHaveBeenCalledWith('evt-1'));
    await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());
    // Hydration landed: the invitees really are selected.
    await waitFor(() => expect(screen.getByText(/2 of/)).toBeInTheDocument());

    // A clean draft offers no Discard affordance at all — closing is the
    // shell's own X, which never asks.
    expect(screen.queryByRole('button', { name: /^Discard$/ })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('heading', { name: /Discard this/i })).toHaveLength(0);
  });

  it('still warns about discarding once the coach actually edits', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult(['p1', 'p2']));
    renderEditor();
    await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: /^Discard$/ }));
    expect(screen.getAllByRole('heading', { name: /Discard this/i }).length).toBeGreaterThan(0);
  });

  it('computes adds and removes from explicit toggles and surfaces the save summary', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult(['p1', 'p2']));
    const { onSave } = renderEditor();
    await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());

    await pickPlayers(/Ben Reed/, /Cam Knox/); // deselect existing, select new

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

    await pickPlayers(/Cam Knox/);
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

// ---------------------------------------------------------------------------
// Primary button validity — the event-name input carries a DOM `required`
// attribute but this form has no enclosing <form>, so nothing ever enforced
// it: the primary button stayed clickable against an empty title. This
// mirrors the Settings-page precedent (primary stays disabled until the form
// is submittable) without touching handleSubmit's own guard.
// ---------------------------------------------------------------------------

describe('FairwayEventEditor — primary button validity', () => {
  it('disables Create event while the title is empty, and enables it once filled', async () => {
    const { onSave } = renderEditor({ event: null });

    const createButton = screen.getByRole('button', { name: /create event/i });
    expect(createButton).toBeDisabled();

    fireEvent.click(createButton);
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: 'Morning practice' } });
    expect(createButton).toBeEnabled();

    fireEvent.click(createButton);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it('disables Save changes if an existing title is cleared out', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult([]));
    renderEditor();
    await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    expect(saveButton).toBeEnabled();

    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: '   ' } });
    expect(saveButton).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Invite-grid name display — chips used to truncate to "First L." (last
// name's first letter + a period), which both threw away a name that already
// fit the chip and, on a name like "(Nick Rini)", built the string "(." —
// the "Coach (." bug reported from production.
// ---------------------------------------------------------------------------

describe('FairwayEventEditor — people picker name display', () => {
  it('renders full names in the picker instead of truncated initials', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult([]));
    renderEditor();
    await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Choose/ }));
    expect(await screen.findByRole('option', { name: /Ava Stone/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Ben Reed/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Cam Knox/ })).toBeInTheDocument();
    // None of the old truncated "First L." forms should be present.
    expect(screen.queryByRole('option', { name: /^Ava S\.$/ })).not.toBeInTheDocument();
  });

  it('cannot reproduce the "Coach (." mangling for a parenthetical placeholder name', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult([]));
    renderEditor({
      teamPlayers: [{ id: 'coach-1', first_name: 'Coach', last_name: '(Nick Rini)' }],
    });
    await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Choose/ }));
    expect(await screen.findByRole('option', { name: /Coach \(Nick Rini\)/ })).toBeInTheDocument();
    expect(screen.queryByText('Coach (.')).not.toBeInTheDocument();
  });
});

describe('FairwayEventEditor — scheduling verification and draft handoff', () => {
  it('checks the organizer even when no attendees are selected', async () => {
    renderEditor({ event: null });
    expect(screen.getByText('Checking Helm schedules…')).toBeInTheDocument();
    await waitFor(() => expect(checkScheduleConflicts).toHaveBeenCalled());
    expect(checkScheduleConflicts.mock.calls[0]?.[4]).toEqual([]);
    expect(await screen.findByText('No conflicts found in checked Helm schedules.')).toBeInTheDocument();
  });

  it('keeps partial availability unverified and does not offer unverified suggestions', async () => {
    checkScheduleConflicts.mockResolvedValue({ success: true, data: {
      hasConflict: false, conflicts: [], partial: true,
      suggestions: [{ start: '2026-06-15T14:00:00Z', end: '2026-06-15T15:00:00Z' }],
    } });
    renderEditor({ event: null });
    expect(await screen.findByText('Schedules partially checked. Some availability is not verified.')).toBeInTheDocument();
    expect(screen.queryByText(/No conflicts found/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Try / })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
  });

  it.each(['rejected', 'unsuccessful'])('shows a retryable unverified state after a %s check', async (failure) => {
    if (failure === 'rejected') checkScheduleConflicts.mockRejectedValue(new Error('offline'));
    else checkScheduleConflicts.mockResolvedValue({ success: false, error: 'offline' });
    renderEditor({ event: null });
    expect(await screen.findByText('Schedules not verified. The check could not finish.')).toBeInTheDocument();
    expect(screen.queryByText(/No conflicts found/)).not.toBeInTheDocument();
    checkScheduleConflicts.mockResolvedValue({ success: true, data: { hasConflict: false, conflicts: [] } });
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(screen.getByText('Checking Helm schedules…')).toBeInTheDocument();
    expect(await screen.findByText('No conflicts found in checked Helm schedules.')).toBeInTheDocument();
  });

  it('checks an all-day edit and excludes the same event for every existing attendee', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult(['p1', 'p2']));
    renderEditor({ event: makeEvent({ all_day: true, start_date: '2026-06-15T00:00:00Z', end_date: '2026-06-15T00:00:00Z' }) });
    await waitFor(() => expect(checkScheduleConflicts).toHaveBeenCalled());
    expect(checkScheduleConflicts.mock.calls.at(-1)).toEqual([
      '2026-06-15', '00:00', '2026-06-15', '23:59', ['p1', 'p2'], 'evt-1', expect.any(Number), true,
    ]);
  });

  it('rechecks existing attendees after accepting a new interval without resetting the draft', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult(['p1', 'p2']));
    const onFindTime = vi.fn();
    const { rerender, props, onSave } = renderEditor({ onFindTime });
    await waitFor(() => expect(checkScheduleConflicts).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: 'Draft practice' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Location' }), { target: { value: 'West range' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find a time' }));
    expect(onFindTime).toHaveBeenCalledWith(expect.objectContaining({ attendeeIds: ['p1', 'p2'], eventId: 'evt-1' }));
    rerender(<FairwayEventEditor {...props} suspended />);
    expect(screen.queryByLabelText(/event title/i)).not.toBeInTheDocument();
    const start = new Date(2026, 6, 20, 23, 30);
    const end = new Date(2026, 6, 21, 1, 30);
    rerender(<FairwayEventEditor {...props} suggestedTime={{ start: start.toISOString(), end: end.toISOString(), token: 1 }} />);
    expect(screen.getByLabelText(/event title/i)).toHaveValue('Draft practice');
    expect(screen.getByRole('textbox', { name: 'Location' })).toHaveValue('West range');
    expect(screen.getByText('Checking Helm schedules…')).toBeInTheDocument();
    await waitFor(() => expect(checkScheduleConflicts).toHaveBeenLastCalledWith(
      '2026-07-20', '23:30', '2026-07-21', '01:30', ['p1', 'p2'], 'evt-1', start.getTimezoneOffset(), false,
    ));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Draft practice', location: 'West range', attendeeIds: ['p1', 'p2'],
      startDate: '2026-07-20', endDate: '2026-07-21', startTime: '23:30', endTime: '01:30',
    })));
  });

  it('shows overlap names and times with an explicit count and expands every overlap', async () => {
    checkScheduleConflicts.mockResolvedValue({ success: true, data: {
      hasConflict: true,
      conflicts: Array.from({ length: 6 }, (_, index) => ({ userId: `u${index}`, userName: `Player ${index + 1}`, conflictingEvent: {
        title: `Commitment ${index + 1}`, type: 'event', start: '2026-06-15T14:00:00Z', end: '2026-06-15T15:00:00Z',
      } })), suggestions: [],
    } });
    renderEditor({ event: null });
    expect(await screen.findByText('6 overlaps · 6 people affected')).toBeInTheDocument();
    expect(screen.getByText('Player 1 — Commitment 1')).toBeInTheDocument();
    expect(screen.getAllByText(/Jun 15.*Event/)).toHaveLength(4);
    expect(screen.queryByText('Player 6 — Commitment 6')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all 6 overlaps (4 shown)' }));
    expect(screen.getByText('Player 6 — Commitment 6')).toBeInTheDocument();
  });

  it('discards an obsolete check when a new proposal is already checking', async () => {
    let resolveOld!: (value: unknown) => void;
    checkScheduleConflicts.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const { rerender, props } = renderEditor({ event: null });
    await waitFor(() => expect(checkScheduleConflicts).toHaveBeenCalledOnce());
    checkScheduleConflicts.mockResolvedValue({ success: true, data: { hasConflict: false, conflicts: [], partial: true } });
    rerender(<FairwayEventEditor {...props} suggestedTime={{ start: '2026-07-20T14:00:00Z', end: '2026-07-20T15:00:00Z', token: 9 }} />);
    resolveOld({ success: true, data: { hasConflict: false, conflicts: [], partial: false } });
    expect(await screen.findByText('Schedules partially checked. Some availability is not verified.')).toBeInTheDocument();
    expect(screen.queryByText(/No conflicts found/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Mobile stage navigation and the review receipt (SCREEN-BUILD-PLAN.md §2.1).
// Every field stays mounted regardless of `stage` (see
// editor/EventEditorStages.tsx's docblock) — the dock only gates whether the
// review receipt renders and moves focus, so this exercises the dock without
// disturbing any of the suite above.
// ---------------------------------------------------------------------------

describe('FairwayEventEditor — mobile stage navigation and review', () => {
  it('Continue off Essentials is disabled until the title is filled', async () => {
    renderEditor({ event: null }, { stage: 'essentials' });
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: 'Morning practice' } });
    expect(continueButton).toBeEnabled();
  });

  it('stage navigation preserves the draft, and the review stage surfaces unresolved verification', async () => {
    checkScheduleConflicts.mockResolvedValue({
      success: true,
      data: {
        hasConflict: true,
        conflicts: [
          {
            userId: 'p1',
            userName: 'Ava Stone',
            conflictingEvent: { title: 'Lift', type: 'event', start: '2026-06-15T14:00:00Z', end: '2026-06-15T15:00:00Z' },
          },
        ],
        suggestions: [],
      },
    });
    renderEditor({ event: null }, { stage: 'essentials' });
    await waitFor(() => expect(checkScheduleConflicts).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: 'Morning practice' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Location' }), { target: { value: 'West range' } });

    fireEvent.click(screen.getByRole('button', { name: 'Go to People & time' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go to Review' }));

    // The draft is untouched by navigating stages — nothing was unmounted.
    expect(screen.getByLabelText(/event title/i)).toHaveValue('Morning practice');
    expect(screen.getByRole('textbox', { name: 'Location' })).toHaveValue('West range');

    // The review receipt reflects that same draft and states the unresolved
    // verification plainly, without repeating the panel's own sentence or
    // upgrading a real conflict to a clean bill.
    expect(await screen.findByText(/Morning practice · Practice/)).toBeInTheDocument();
    expect(screen.getByText(/West range/)).toBeInTheDocument();
    expect(await screen.findByText(/1 unresolved overlap/i)).toBeInTheDocument();
    expect(screen.getByText('Attendees will be notified.')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// §7: the primary label becomes "Move event" only when every changed field
// is a time field. Driven through the existing `suggestedTime` prop (already
// exercised above) rather than the DateChooser/TimeChooser popovers, since
// that's the code path that actually mutates start/end date and time.
// ---------------------------------------------------------------------------

describe('FairwayEventEditor — "Move event" label', () => {
  it('relabels Save changes to Move event when only the time changed', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult([]));
    const { rerender, props } = renderEditor();
    await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^save changes$/i })).toBeInTheDocument();

    const start = new Date(2026, 5, 16, 9, 0);
    const end = new Date(2026, 5, 16, 11, 0);
    rerender(<FairwayEventEditor {...props} suggestedTime={{ start: start.toISOString(), end: end.toISOString(), token: 101 }} />);

    expect(await screen.findByRole('button', { name: /^move event$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^save changes$/i })).not.toBeInTheDocument();
  });

  it('keeps Save changes when a non-time field changes alongside the time', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult([]));
    const { rerender, props } = renderEditor();
    await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());

    fireEvent.change(screen.getByRole('textbox', { name: 'Location' }), { target: { value: 'West range' } });
    const start = new Date(2026, 5, 16, 9, 0);
    const end = new Date(2026, 5, 16, 11, 0);
    rerender(<FairwayEventEditor {...props} suggestedTime={{ start: start.toISOString(), end: end.toISOString(), token: 102 }} />);

    expect(await screen.findByRole('button', { name: /^save changes$/i })).toBeInTheDocument();
  });

  // Regression: opening a series ROOT re-baselines the pristine snapshot's
  // recurrence fields from the stored rule (so extending/reshaping the
  // pattern doesn't itself count as a "change"). That re-baseline must not
  // leave a stale phantom diff behind once the coach then moves the time —
  // the label should still read "Move event", not "Save changes".
  it('still reads Move event on a series root after its recurrence prefill settles', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult([]));
    const { rerender, props } = renderEditor({
      event: makeEvent({ recurrence_rule: 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR;COUNT=12' }),
    });
    await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^save changes$/i })).toBeInTheDocument();

    const start = new Date(2026, 5, 16, 9, 0);
    const end = new Date(2026, 5, 16, 11, 0);
    rerender(<FairwayEventEditor {...props} suggestedTime={{ start: start.toISOString(), end: end.toISOString(), token: 103 }} />);

    expect(await screen.findByRole('button', { name: /^move event$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^save changes$/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Offline (§2.1 states): Publish and Find a time are disabled with an
// explicit reason; every other field stays editable, and the draft is never
// dropped just because the network is down.
// ---------------------------------------------------------------------------

describe('FairwayEventEditor — offline', () => {
  afterEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  it('disables Publish and Find a time while offline, and re-enables them back online', async () => {
    getEventRSVP.mockResolvedValue(rsvpResult([]));
    const onFindTime = vi.fn();
    renderEditor({ onFindTime });
    await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();

    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    fireEvent(window, new Event('offline'));

    expect(await screen.findByText(/Reconnect to publish/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Find a time' })).toBeDisabled();

    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    fireEvent(window, new Event('online'));

    await waitFor(() => expect(screen.queryByText(/Reconnect to publish/i)).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Desktop (≥1024px, SCREEN-BUILD-PLAN.md §2 shared rules): the review
// receipt is always visible with no stage stepper — this actually forces the
// `useMediaQuery('(min-width: 1024px)')` branch to true, rather than relying
// on the suite's default matchMedia stub (always non-matching, i.e. mobile).
// ---------------------------------------------------------------------------

describe('FairwayEventEditor — desktop layout', () => {
  it('shows the review receipt immediately with no stage dock, unlike mobile', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('1024'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    try {
      getEventRSVP.mockResolvedValue(rsvpResult([]));
      renderEditor();
      await waitFor(() => expect(screen.queryByText(/Loading current invitees/i)).not.toBeInTheDocument());

      // No mobile stage dock — desktop has no stepper.
      expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Go to /i })).not.toBeInTheDocument();

      // The receipt is visible without navigating any stage.
      expect(await screen.findByRole('heading', { name: 'Review' })).toBeInTheDocument();
      expect(screen.getByText('Attendees will be notified.')).toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});

// ---------------------------------------------------------------------------
// Empty roster (§2.1 states): "empty roster (invite button disabled with
// 'No players on this team yet')". An empty team must never make the whole
// invite section disappear — that would read as "there's no invite step",
// not "there's no one to invite yet" — so it renders a disabled affordance
// with that exact message instead. Covers both the default inline-fallback
// path (no people-picker seam wired) and the summary-button seam.
// ---------------------------------------------------------------------------

describe('FairwayEventEditor — empty roster', () => {
  it('shows a disabled invite affordance with "No players on this team yet." when the roster is empty', async () => {
    // Stay on Essentials: the review receipt's own "No one invited yet"
    // line is a different element from the invite trigger under test.
    renderEditor({ event: null, teamPlayers: [] }, { stage: 'essentials' });

    expect(await screen.findByText(/No players on this team yet\./i)).toBeInTheDocument();
    const inviteButton = screen.getByText(/No players on this team yet\./i).closest('button');
    expect(inviteButton).toBeDisabled();

    // No trace of the populated-roster affordances.
    expect(screen.queryByText(/No one invited yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /select all/i })).not.toBeInTheDocument();
  });

  it('shows the same disabled empty-roster message when the people-picker seam is wired', async () => {
    const onOpenPeoplePicker = vi.fn();
    renderEditor({ event: null, teamPlayers: [], onOpenPeoplePicker }, { stage: 'essentials' });

    const inviteButton = (await screen.findByText(/No players on this team yet\./i)).closest('button');
    expect(inviteButton).toBeDisabled();
    if (inviteButton) fireEvent.click(inviteButton);
    expect(onOpenPeoplePicker).not.toHaveBeenCalled();
  });

  // Discriminator: `availablePlayers` (derived synchronously from the
  // `teamPlayers` prop) is empty from the first render, independent of
  // whether the event's OWN attendee-hydration fetch (`getEventRSVP`,
  // `attendeesLoading`) is still in flight — an empty team is already known
  // before that unrelated fetch resolves. Editing an existing event (not
  // `event: null`) puts hydration into its 'loading' window immediately on
  // mount, so asserting synchronously (no `findBy`/`waitFor`) here would
  // have caught the earlier version of this fix, which hid the empty state
  // for as long as `attendeesLoading` stayed true.
  it('shows the disabled empty-roster message even while this event\'s own attendee hydration is still loading', () => {
    getEventRSVP.mockResolvedValue(rsvpResult([]));
    renderEditor({ teamPlayers: [] });

    expect(screen.getByText(/No players on this team yet\./i)).toBeInTheDocument();
  });
});
