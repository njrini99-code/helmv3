// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ScheduleSnapshot, ScheduleWindowRequest } from '@/lib/calendar/scheduling-contracts';

const useScheduleWindow = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/golf/use-schedule-window', () => ({ useScheduleWindow }));
vi.mock('@/app/golf/actions/scheduling', () => ({ getScheduleWindow: vi.fn() }));

import { CalendarPersonDialog } from '../CalendarPersonDialog';

const request: ScheduleWindowRequest = {
  teamId: '11111111-1111-4111-8111-111111111111',
  date: '2026-09-08',
  participantIds: ['22222222-2222-4222-8222-222222222222'],
};

const snapshot: ScheduleSnapshot = {
  teamId: request.teamId,
  timeZone: 'America/New_York',
  window: { start: '2026-09-08T04:00:00.000Z', end: '2026-09-09T04:00:00.000Z' },
  checkedAt: '2026-09-08T12:00:00.000Z',
  participants: [{
    id: request.participantIds[0]!,
    kind: 'player',
    name: 'Ava Stone',
    avatarUrl: null,
    isViewer: false,
    required: true,
    verification: 'complete',
    intervals: [
      { id: 'class-1', type: 'class', title: 'Calculus III', start: '2026-09-08T13:00:00.000Z', end: '2026-09-08T14:15:00.000Z' },
      { id: 'event-1', type: 'event', title: 'Team practice', eventId: 'event-1', start: '2026-09-08T18:00:00.000Z', end: '2026-09-08T20:00:00.000Z' },
    ],
  }],
};

beforeEach(() => {
  useScheduleWindow.mockReturnValue({ snapshot, loading: false, error: null, retry: vi.fn() });
});

describe('CalendarPersonDialog', () => {
  it('renders the class-day visual and lets a known event open from the schedule', () => {
    const onEvent = vi.fn();
    render(<CalendarPersonDialog request={request} personId={request.participantIds[0]!} onDateChange={() => {}} onCompare={() => {}} onClose={() => {}} onEvent={onEvent} />);

    // ModalShell's real entrance begins at opacity 0 in jsdom. Assert the
    // rendered contract here; interaction/motion itself is covered there.
    expect(screen.getByRole('heading', { name: 'Ava Stone' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Class day' })).toBeInTheDocument();
    expect(screen.getByLabelText('Classes schedule timeline')).toBeInTheDocument();
    expect(screen.getAllByText('Calculus III')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Team practice' }));
    expect(onEvent).toHaveBeenCalledWith('event-1');
  });

  it('opens class detail from a lane block when the interval carries a classId (SCREEN-BUILD-PLAN.md §2.4)', () => {
    const onOpenClass = vi.fn();
    const withClass: ScheduleSnapshot = {
      ...snapshot,
      participants: [{
        ...snapshot.participants[0]!,
        intervals: [
          { id: 'class-2', type: 'class', classId: 'class-uuid-1', title: 'Biology 201', start: '2026-09-08T13:00:00.000Z', end: '2026-09-08T14:15:00.000Z' },
        ],
      }],
    };
    useScheduleWindow.mockReturnValue({ snapshot: withClass, loading: false, error: null, retry: vi.fn() });
    render(
      <CalendarPersonDialog
        request={request}
        personId={request.participantIds[0]!}
        onDateChange={() => {}}
        onCompare={() => {}}
        onClose={() => {}}
        onEvent={() => {}}
        onOpenClass={onOpenClass}
      />,
    );

    // The lane block AND the commitments row both open class detail.
    fireEvent.click(screen.getByTitle(/Biology 201/));
    expect(onOpenClass).toHaveBeenCalledWith({ classId: 'class-uuid-1', eventId: undefined, date: request.date });

    onOpenClass.mockClear();
    // Two "Biology 201" controls exist now (lane block + commitments row) —
    // the lane block is the one with a `title` attribute; take the other.
    const buttons = screen.getAllByRole('button', { name: 'Biology 201' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]!);
    expect(onOpenClass).toHaveBeenCalledWith({ classId: 'class-uuid-1', eventId: undefined, date: request.date });
  });

  it('leaves a class interval with neither classId nor eventId inert — never a fabricated deep link', () => {
    const onOpenClass = vi.fn();
    render(
      <CalendarPersonDialog
        request={request}
        personId={request.participantIds[0]!}
        onDateChange={() => {}}
        onCompare={() => {}}
        onClose={() => {}}
        onEvent={() => {}}
        onOpenClass={onOpenClass}
      />,
    );
    // "Calculus III" (class-1) has no classId/eventId in this fixture — it
    // must render as plain text, never a clickable control.
    expect(screen.queryByRole('button', { name: 'Calculus III' })).not.toBeInTheDocument();
  });

  it('keeps partial schedule data visibly unverified', () => {
    useScheduleWindow.mockReturnValue({
      snapshot: { ...snapshot, participants: snapshot.participants.map((person) => ({ ...person, verification: 'partial' as const })) },
      loading: false,
      error: null,
      retry: vi.fn(),
    });
    render(<CalendarPersonDialog request={request} personId={request.participantIds[0]!} onDateChange={() => {}} onCompare={() => {}} onClose={() => {}} onEvent={() => {}} />);

    expect(screen.getByText(/could not be fully verified/i)).toBeInTheDocument();
  });
});
