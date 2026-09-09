import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EventReviewReceipt } from '../EventReviewReceipt';
import type { GolfEventFormData } from '@/components/golf/calendar/EventDetailModal';
import type { ChangedFieldEntry } from '../changeDetection';

function makeForm(overrides: Partial<GolfEventFormData> = {}): GolfEventFormData {
  return {
    title: 'Morning practice',
    eventType: 'practice',
    startDate: '2026-06-15',
    endDate: '2026-06-15',
    startTime: '09:00',
    endTime: '11:00',
    allDay: false,
    location: 'West range',
    courseName: null,
    description: null,
    isMandatory: false,
    requiresRsvp: false,
    rsvpDeadline: null,
    maxAttendees: null,
    attendeeIds: [],
    recurrence: 'none',
    recurrenceCount: 10,
    recurrenceWeekdays: [],
    recurrenceEndMode: 'count',
    recurrenceUntil: null,
    ...overrides,
  };
}

function renderReceipt(overrides: Partial<React.ComponentProps<typeof EventReviewReceipt>> = {}) {
  return render(
    <EventReviewReceipt
      headingId="review-heading"
      isCreating
      formData={makeForm()}
      tzAbbrev="EDT"
      totalPlayers={12}
      attendeeAddCount={0}
      attendeeRemoveCount={0}
      recurrencePreview={null}
      verificationStatus="ready"
      conflicts={{ hasConflict: false, conflicts: [], suggestions: [] }}
      changes={[]}
      offline={false}
      {...overrides}
    />,
  );
}

describe('EventReviewReceipt', () => {
  it('renders What/When/Where/Who/Repeats/RSVP and never invents a notification count', () => {
    renderReceipt();
    expect(screen.getByText(/Morning practice · Practice/)).toBeInTheDocument();
    expect(screen.getByText('West range')).toBeInTheDocument();
    expect(screen.getByText('No one invited yet')).toBeInTheDocument();
    expect(screen.getByText('Does not repeat')).toBeInTheDocument();
    expect(screen.getByText('Not required')).toBeInTheDocument();
    expect(screen.getByText('Attendees will be notified.')).toBeInTheDocument();
    // Never claims a count the server doesn't return.
    expect(screen.queryByText(/notified\./i)?.textContent).not.toMatch(/\d/);
  });

  it('never restates the verification panel\'s own copy', () => {
    renderReceipt({ verificationStatus: 'ready', conflicts: { hasConflict: false, conflicts: [], suggestions: [] } });
    expect(screen.queryByText(/No conflicts found/)).not.toBeInTheDocument();
    expect(screen.getByText('All checked schedules are clear.')).toBeInTheDocument();
  });

  it('never claims a clean bill when the check has not run yet (idle, zero data)', () => {
    renderReceipt({ verificationStatus: 'idle', conflicts: null });
    expect(screen.getByText('Schedules not checked yet.')).toBeInTheDocument();
    expect(screen.queryByText('All checked schedules are clear.')).not.toBeInTheDocument();
  });

  it('states unresolved overlaps as a count without repeating overlap rows', () => {
    renderReceipt({
      verificationStatus: 'ready',
      conflicts: {
        hasConflict: true,
        conflicts: [
          { userId: 'p1', userName: 'Ava Stone', conflictingEvent: { title: 'Lift', type: 'event', start: '2026-06-15T14:00:00Z', end: '2026-06-15T15:00:00Z' } },
          { userId: 'p2', userName: 'Ben Reed', conflictingEvent: { title: 'Lab', type: 'class', start: '2026-06-15T14:00:00Z', end: '2026-06-15T15:00:00Z' } },
        ],
        suggestions: [],
      },
    });
    expect(screen.getByText('2 unresolved overlaps — review before publishing.')).toBeInTheDocument();
    expect(screen.queryByText(/Ava Stone/)).not.toBeInTheDocument();
  });

  it('shows the invited count and, in edit mode, the add/remove delta', () => {
    renderReceipt({
      isCreating: false,
      formData: makeForm({ attendeeIds: ['p1', 'p2', 'p3'] }),
      attendeeAddCount: 1,
      attendeeRemoveCount: 2,
    });
    expect(screen.getByText(/3 invited/)).toBeInTheDocument();
    expect(screen.getByText(/1 added/)).toBeInTheDocument();
    expect(screen.getByText(/2 removed/)).toBeInTheDocument();
  });

  it('renders the changed-field diff only in edit mode', () => {
    const changes: ChangedFieldEntry[] = [
      { key: 'location', label: 'Location', before: 'Range', after: 'West range' },
    ];
    renderReceipt({ isCreating: false, changes });
    expect(screen.getByText('What changed')).toBeInTheDocument();
    expect(screen.getByText('Location:')).toBeInTheDocument();
    expect(screen.getByText('Range')).toBeInTheDocument();
    // "West range" also appears in the Where row (same value, unchanged from
    // create) — the diff row renders its own copy alongside it.
    expect(screen.getAllByText('West range').length).toBeGreaterThanOrEqual(1);
  });

  it('omits the diff section entirely when creating', () => {
    renderReceipt({ isCreating: true });
    expect(screen.queryByText('What changed')).not.toBeInTheDocument();
  });

  it('shows the offline notice with the draft-kept reassurance', () => {
    renderReceipt({ offline: true });
    expect(screen.getByText("You're offline")).toBeInTheDocument();
    expect(screen.getByText(/Your draft is kept/)).toBeInTheDocument();
  });

  it('renders correctly at a 320px mobile width', () => {
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true, writable: true });
    try {
      renderReceipt();
      expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true, writable: true });
    }
  });
});
