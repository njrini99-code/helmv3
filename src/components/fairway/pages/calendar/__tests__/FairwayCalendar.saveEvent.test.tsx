/**
 * FairwayCalendar — what the coach's event save sends and says.
 *
 * - An emptied location or notes on edit is sent as '' (the server stores null). It used to be dropped as undefined,
 *   so a coach could never clear either field. A field the event never had stays undefined.
 * - A save whose invitations failed (`data.invitationsError`) warns instead of the plain success toast.
 *
 * The editor and drawer are stubs that hand back their props, so the real handleSaveEvent runs against mocked actions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { GolfEventFormData } from '@/components/golf/calendar/EventDetailModal';
import { fairwayToast } from '@/components/fairway';
import { FairwayCalendar } from '../FairwayCalendar';

const actions = vi.hoisted(() => ({
  createGolfEvent: vi.fn(),
  updateGolfEvent: vi.fn(),
  editRecurringEvent: vi.fn(),
  createRecurringEvent: vi.fn(),
}));
const captured = vi.hoisted(() => ({
  editor: null as null | { onSave: (data: unknown) => Promise<void> },
  drawer: null as null | { onEdit?: (ev: unknown) => void },
}));

vi.mock('@/app/golf/actions/calendar-events', () => ({
  createGolfEvent: actions.createGolfEvent,
  updateGolfEvent: actions.updateGolfEvent,
}));
vi.mock('@/app/golf/actions/recurring-events', () => ({
  createRecurringEvent: actions.createRecurringEvent,
  editRecurringEvent: actions.editRecurringEvent,
}));
vi.mock('../FairwayEventEditor', () => ({
  FairwayEventEditor: (props: { onSave: (data: unknown) => Promise<void> }) => {
    captured.editor = props;
    return null;
  },
}));
vi.mock('../FairwayEventDetailDrawer', () => ({
  FairwayEventDetailDrawer: (props: { onEdit?: (ev: unknown) => void }) => {
    captured.drawer = props;
    return null;
  },
}));
vi.mock('@/hooks/golf/use-calendar-range-events', () => ({
  useCalendarRangeEvents: ({ initialEvents }: { initialEvents: CalendarEvent[] }) => ({
    events: initialEvents,
    isLoadingRange: false,
    rangeError: null,
    retryRange: vi.fn(),
    refetchVisibleRange: vi.fn(),
  }),
}));
vi.mock('@/contexts/notification-badge-context', () => ({
  useNotificationBadges: () => ({
    announcements: 0,
    tasks: 0,
    messages: 0,
    travel: 0,
    calendarNotifications: 0,
    coachhelm: 0,
    notificationsUnread: 0,
    total: 0,
    unseenAnnouncements: [],
    hasUnseenAnnouncements: false,
    markAnnouncementsSeen: vi.fn(),
  }),
}));

const event: CalendarEvent = {
  id: 'ev-1',
  team_id: 'team-1',
  title: 'Practice',
  event_type: 'practice',
  start_date: '2026-10-20T14:00:00Z',
  end_date: '2026-10-20T16:00:00Z',
  start_time: '2026-10-20T14:00:00Z',
  end_time: '2026-10-20T16:00:00Z',
  location: 'North range',
  description: 'Bring wedges',
  requires_rsvp: false,
};

function form(overrides: Partial<GolfEventFormData> = {}): GolfEventFormData {
  return {
    title: 'Practice',
    eventType: 'practice',
    startDate: '2026-10-20',
    endDate: null,
    startTime: '10:00',
    endTime: '12:00',
    allDay: false,
    location: null,
    courseName: null,
    description: null,
    isMandatory: false,
    requiresRsvp: false,
    rsvpDeadline: null,
    maxAttendees: null,
    attendeeIds: [],
    recurrence: 'none',
    recurrenceCount: 10,
    ...overrides,
  };
}

function renderCalendar() {
  render(
    <FairwayCalendar
      events={[event]}
      teamMembers={[]}
      isCoach
      teamTimezone="America/New_York"
      upcomingCount={1}
      serverNow="2026-10-17T12:00:00.000Z"
      classOwnersResolved
    />,
  );
}

async function openEditAndSave(ev: Partial<CalendarEvent>, data: GolfEventFormData) {
  act(() => captured.drawer?.onEdit?.({ ...event, ...ev }));
  await act(async () => {
    await captured.editor?.onSave(data);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  captured.editor = null;
  captured.drawer = null;
  actions.updateGolfEvent.mockResolvedValue({ success: true });
  actions.editRecurringEvent.mockResolvedValue({ success: true, data: { eventId: 'ev-1' } });
  actions.createGolfEvent.mockResolvedValue({ success: true, data: { eventId: 'ev-new' } });
});

describe('FairwayCalendar — clearing location and notes on edit', () => {
  it('sends an emptied location and notes as a clear', async () => {
    renderCalendar();
    await openEditAndSave({}, form({ location: null, description: '' }));
    expect(actions.updateGolfEvent).toHaveBeenCalledTimes(1);
    expect(actions.updateGolfEvent.mock.calls[0]![1]).toMatchObject({ location: '', description: '' });
  });

  it('leaves untouched a field the event never had', async () => {
    renderCalendar();
    await openEditAndSave({ location: null, description: null }, form());
    const payload = actions.updateGolfEvent.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.location).toBeUndefined();
    expect(payload.description).toBeUndefined();
  });

  it('keeps a filled location as typed', async () => {
    renderCalendar();
    await openEditAndSave({}, form({ location: 'South range', description: 'Bring wedges' }));
    expect(actions.updateGolfEvent.mock.calls[0]![1]).toMatchObject({ location: 'South range', description: 'Bring wedges' });
  });

  it('clears on a series edit too', async () => {
    renderCalendar();
    await openEditAndSave({}, form({ editScope: 'all' }));
    expect(actions.editRecurringEvent).toHaveBeenCalledTimes(1);
    expect(actions.editRecurringEvent.mock.calls[0]![0].updates).toMatchObject({ location: '', description: '' });
  });
});

describe('FairwayCalendar — invitations that did not go out', () => {
  it('warns on an update whose invitations failed', async () => {
    const warning = vi.spyOn(fairwayToast, 'warning');
    const success = vi.spyOn(fairwayToast, 'success');
    actions.updateGolfEvent.mockResolvedValue({
      success: true,
      data: { invitationsError: "The changes were saved, but the new invitations didn't go out." },
    });
    renderCalendar();
    await openEditAndSave({}, form({ location: 'North range' }));
    expect(success).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith('Event updated · invitations didn’t go out', {
      description: "The changes were saved, but the new invitations didn't go out. Open the event and invite them again.",
    });
  });

  it('warns on a create whose invitations failed', async () => {
    const warning = vi.spyOn(fairwayToast, 'warning');
    const success = vi.spyOn(fairwayToast, 'success');
    actions.createGolfEvent.mockResolvedValue({
      success: true,
      data: { eventId: 'ev-new', invitationsError: "The event was created, but its invitations didn't all go out." },
    });
    renderCalendar();
    await act(async () => {
      await captured.editor?.onSave(form({ attendeeIds: ['p1'] }));
    });
    expect(actions.createGolfEvent).toHaveBeenCalledTimes(1);
    expect(success).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith('Event created · invitations didn’t go out', expect.any(Object));
  });

  it('keeps the plain success toast when invitations went out', async () => {
    const warning = vi.spyOn(fairwayToast, 'warning');
    const success = vi.spyOn(fairwayToast, 'success');
    renderCalendar();
    await openEditAndSave({}, form({ location: 'North range' }));
    expect(warning).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledWith('Event updated');
  });
});
