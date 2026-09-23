// @vitest-environment jsdom

/**
 * BusyTimeEditor — SCREEN-BUILD-PLAN.md §2.7 (S7).
 *
 * The global test-setup `matchMedia` mock reports `matches: false`, so every
 * test here effectively renders the mobile shell (this component has no
 * media-query branch of its own, but its siblings do — kept consistent).
 * DateChooser/TimeChooser popovers are never opened in these tests: every
 * scenario relies on their pre-filled defaults (today's date, 09:00–10:00),
 * which is enough to exercise validation, repeat serialization, edit
 * prefill, and the offline/submit-error states without driving a calendar
 * grid through jsdom.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BusyTimeEditor } from '../BusyTimeEditor';
import type { CoachBlockedTimeRow } from '../useBlockedTime';

afterEach(cleanup);

function makeRow(overrides: Partial<CoachBlockedTimeRow> = {}): CoachBlockedTimeRow {
  return {
    id: 'row-1',
    coach_id: 'coach-1',
    start_date: '2026-09-10',
    end_date: '2026-09-10',
    start_time: '14:00',
    end_time: '15:00',
    is_recurring: false,
    reason: null,
    recurrence_rule: null,
    created_at: null,
    updated_at: null,
    title: 'Class',
    all_day: false,
    description: 'Private note here',
    ...overrides,
  };
}

describe('BusyTimeEditor — create', () => {
  it('rejects submit with no title and never calls onSave', () => {
    const onSave = vi.fn();
    render(<BusyTimeEditor initial={null} saving={false} submitError={null} onSave={onSave} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Add a title for this busy time.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('submits a simple timed block with the prefilled defaults', () => {
    const onSave = vi.fn();
    render(<BusyTimeEditor initial={null} saving={false} submitError={null} onSave={onSave} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText('Busy time title'), { target: { value: 'Physio appointment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Physio appointment',
        allDay: false,
        startTime: '09:00',
        endTime: '10:00',
        recurrenceRule: '',
        description: '',
      }),
    );
  });

  it('has no Delete affordance while creating', () => {
    render(<BusyTimeEditor initial={null} saving={false} submitError={null} onSave={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('turning on Repeat weekly shows seven day chips and requires at least one', () => {
    const onSave = vi.fn();
    render(<BusyTimeEditor initial={null} saving={false} submitError={null} onSave={onSave} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText('Busy time title'), { target: { value: 'Study hall' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Repeat weekly' }));

    const group = screen.getByRole('group', { name: 'Repeat on these days' });
    const dayButtons = Array.from(group.querySelectorAll('button'));
    expect(dayButtons).toHaveLength(7);

    // Deselect every day, then submit — the form must refuse, never guess a day.
    dayButtons.forEach((button) => {
      if (button.getAttribute('aria-pressed') === 'true') fireEvent.click(button);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Pick at least one day to repeat.');
    expect(onSave).not.toHaveBeenCalled();

    // Select Monday and submit — recurrenceRule is a real RRULE string, and a
    // recurring block collapses its own end date back onto the start date.
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0]![0];
    expect(payload.recurrenceRule).toMatch(/^RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO$/);
    expect(payload.endDate).toBe(payload.startDate);
  });
});

describe('BusyTimeEditor — edit', () => {
  it('prefills fields from the existing block and offers Delete', () => {
    const onDelete = vi.fn();
    render(
      <BusyTimeEditor
        initial={makeRow()}
        saving={false}
        submitError={null}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByLabelText('Busy time title')).toHaveValue('Class');
    expect(screen.getByLabelText('Private note')).toHaveValue('Private note here');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('shows the caller-supplied submit error and keeps the typed title intact', () => {
    render(
      <BusyTimeEditor
        initial={makeRow()}
        saving={false}
        submitError="Blocked time not found"
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('Blocked time not found')).toBeInTheDocument();
    expect(screen.getByLabelText('Busy time title')).toHaveValue('Class');
  });
});

describe('BusyTimeEditor — offline', () => {
  it('disables Save and shows the offline notice without clearing input', () => {
    render(
      <BusyTimeEditor initial={makeRow()} saving={false} submitError={null} disabled onSave={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText(/You.{1,2}re offline/)).toBeInTheDocument();
    expect(screen.getByLabelText('Busy time title')).toHaveValue('Class');
  });
});
