import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewPlanSheet } from '../NewPlanSheet';

/**
 * Q7 (owner, 12 Nov): "New plan" creates the practice itself. With no practice to plan, or on "A new practice", the sheet
 * asks the day, start, end and an optional place; Create puts the practice on the calendar through the Calendar's own
 * create (createGolfEvent) and then saves the plan on it, as it always has.
 */
const push = vi.fn();
const refresh = vi.fn();
const save = vi.fn();
const createEvent = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => false }));
vi.mock('../../../ui/Toast', () => ({ useToast: () => vi.fn() }));
vi.mock('@/app/golf/actions/practice-plans', () => ({ savePracticePlan: (...a: unknown[]) => save(...a), copyPlanBody: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-events', () => ({ createGolfEvent: (...a: unknown[]) => createEvent(...a) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  save.mockReset().mockResolvedValue({ success: true, planId: 'p9', version: 1, updatedAt: null });
  createEvent.mockReset().mockResolvedValue({ success: true, data: { eventId: 'ev-new' } });
});

// Thursday 12 Nov 2026, 10 AM in New York: the next weekday is Friday the 13th.
const NOW = new Date('2026-11-12T15:00:00Z');
const open = [{ id: 'e1', label: 'Thursday, Nov 19', detail: '2:00 to 5:00 PM · Lakeside', title: 'Thursday practice', place: 'Lakeside', allDay: false, minutes: 180 }];
const sheet = (events = [] as typeof open) =>
  render(<NewPlanSheet open onClose={vi.fn()} events={events} copies={[]} roster={['r1']} zone="America/New_York" now={NOW} initialStart="blank" />);
const createButton = () => screen.getByRole('button', { name: 'Create plan', hidden: true });

describe('New plan with no practice to plan', () => {
  it('asks when, and Create makes the calendar practice and then the plan on it', async () => {
    sheet();
    const when = screen.getByRole('group', { name: 'When', hidden: true });
    expect(within(when).getByText('Day')).toBeTruthy();
    expect(within(when).getByText('Starts')).toBeTruthy();
    expect(within(when).getByText('Ends')).toBeTruthy();
    fireEvent.change(within(when).getByRole('textbox', { name: /Place/, hidden: true }), { target: { value: 'Lakeside' } });
    expect(screen.queryByRole('radiogroup', { name: 'Which practice', hidden: true })).toBeNull();
    fireEvent.click(createButton());
    await waitFor(() => expect(push).toHaveBeenCalledWith('/golf/dashboard/practice/plan/p9/edit'));
    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(createEvent.mock.calls[0]![0]).toMatchObject({
      title: 'Practice',
      eventType: 'practice',
      startDate: '2026-11-13',
      startTime: '15:00',
      endTime: '17:00',
      allDay: false,
      location: 'Lakeside',
      requiresRsvp: false,
      // The team on it, as the Calendar's editor starts a practice; no replies asked, so nobody is notified.
      attendeeIds: ['r1'],
      timezoneOffset: 300,
    });
    expect(createEvent.mock.calls[0]![0].requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'ev-new', title: 'Practice', expectedVersion: null, step: 'blocks' }));
  });

  it('a plan that fails after the practice was made keeps the practice: Create again only saves the plan', async () => {
    save.mockResolvedValueOnce({ success: false, error: 'Practice plans aren’t on for your team yet.' });
    sheet();
    fireEvent.click(createButton());
    await waitFor(() => expect(screen.getByRole('alert', { hidden: true }).textContent).toContain('aren’t on'));
    // The practice is on the calendar now: its day and time are a line, not fields that would make a second one.
    expect(screen.getByText(/On the calendar/).textContent).toContain('Friday, Nov 13');
    expect(screen.queryByRole('group', { name: 'When', hidden: true })).toBeNull();
    // The page reads the calendar again, so the practice is listed if the sheet is opened afresh.
    expect(refresh).toHaveBeenCalledTimes(1);
    fireEvent.click(createButton());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![0]).toMatchObject({ eventId: 'ev-new' });
  });

  it('a practice the calendar refused says so, and saves no plan', async () => {
    createEvent.mockResolvedValueOnce({ success: false, error: 'End time must be after the start time.' });
    sheet();
    fireEvent.click(createButton());
    await waitFor(() => expect(screen.getByRole('alert', { hidden: true }).textContent).toBe('End time must be after the start time.'));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'When', hidden: true })).toBeTruthy();
  });
});

describe('New plan with practices to plan', () => {
  it('offers A new practice beside them; an existing practice is planned without making one', async () => {
    sheet(open);
    const which = screen.getByRole('radiogroup', { name: 'Which practice', hidden: true });
    expect(within(which).getAllByRole('radio', { hidden: true }).map((r) => r.textContent)).toEqual([expect.stringContaining('Thursday, Nov 19'), expect.stringContaining('A new practice')]);
    expect(screen.queryByRole('group', { name: 'When', hidden: true })).toBeNull();
    fireEvent.click(createButton());
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'e1' })));
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('A new practice asks when, and makes it', async () => {
    sheet(open);
    fireEvent.click(screen.getByRole('radio', { name: /A new practice/, hidden: true }));
    expect(screen.getByRole('group', { name: 'When', hidden: true })).toBeTruthy();
    fireEvent.click(createButton());
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'ev-new' })));
    expect(createEvent).toHaveBeenCalledTimes(1);
  });
});
