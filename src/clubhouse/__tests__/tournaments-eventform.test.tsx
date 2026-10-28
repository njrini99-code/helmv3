import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push, refresh: vi.fn(), replace: vi.fn() }) }));
const create = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/tournaments-calendar', () => ({ createTournamentFromCalendar: create }));
vi.mock('../screens/qualifiers/writes', () => ({ LIVE_WRITES: { courses: vi.fn(async () => []), tees: vi.fn(async () => []) } }));
// The course picker has its own tests (calendar.test): here a stub sets the course, so the form's own rules are what runs.
vi.mock('../screens/tournaments/fields/TournamentFields', () => ({
  TournamentFields: ({ state, onChange }: { state: Record<string, unknown>; onChange: (s: unknown) => void }) => (
    <button type="button" onClick={() => onChange({ ...state, course: { id: 'course-1', label: 'Pinehurst No. 2', teeId: null } })}>
      Pick Pinehurst
    </button>
  ),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('../ui/Toast', async (orig) => ({ ...(await orig<typeof import('../ui/Toast')>()), useToast: () => toast }));
const haptic = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic }));
const report = vi.hoisted(() => vi.fn());
vi.mock('../lib/track', () => ({ chReport: report, chTrail: vi.fn(), chTagSession: vi.fn() }));

import { EventForm } from '../screens/tournaments/EventForm';
import { tourFixture } from '../preview/fixtures-tournaments';

const f = tourFixture('ready');
const draw = (data = f.form.create) => render(<EventForm data={data} phone={false} />);
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Create tournament' }));

afterEach(cleanup);
beforeEach(() => {
  create.mockReset();
  nav.push.mockReset();
  toast.mockReset();
  haptic.mockReset();
  report.mockReset();
});

const fillAndSubmit = () => {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test Invitational' } });
  fireEvent.click(screen.getByRole('button', { name: 'Pick Pinehurst' }));
  submit();
};

describe('New event (Tournaments page)', () => {
  it('is the real form, not the placeholder', () => {
    const { container } = draw();
    expect(container.querySelector('[data-ch-tour-view="form"] h1')?.textContent).toBe('New event');
    expect(container.querySelector('[data-ch-code="CH-16301"]')).toBeNull();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('CH-6147 and CH-6140: a missing name and course are said together and nothing is sent', () => {
    draw();
    submit();
    expect(document.querySelector('[data-ch-code="CH-6147"]')).not.toBeNull();
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(create).not.toHaveBeenCalled();
  });

  it('saves through the calendar’s create action, with the team, its zone and no attendees, then opens the desk', async () => {
    create.mockResolvedValue({ success: true, data: { tournamentId: 'tour-9', version: 1, replayed: false, rounds: [] } });
    draw();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test Invitational' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pick Pinehurst' }));
    submit();
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const sent = create.mock.calls[0]![0];
    expect(sent).toMatchObject({ teamId: f.form.create.teamId, name: 'Test Invitational', courseId: 'course-1', requiresRsvp: false, attendeeIds: [] });
    expect(sent.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent.rounds).toHaveLength(1);
    expect(sent.rounds[0].date).toBe(f.form.create.today);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/golf/dashboard/tournaments/tour-9'));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ code: 'CH-6040', title: 'Test Invitational is set up in Tournaments' }));
  });

  it('a refused save stays on the page and says why', async () => {
    create.mockResolvedValue({ success: false, error: 'No', code: 'failed' });
    draw();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test Invitational' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pick Pinehurst' }));
    submit();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Nothing was saved');
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('a refused save is said once, by the page: no second toast or haptic from the action', async () => {
    create.mockResolvedValue({ success: false, error: 'No', code: 'failed' });
    draw();
    fillAndSubmit();
    await screen.findByRole('alert');
    expect(toast).not.toHaveBeenCalled();
    expect(haptic.mock.calls.filter(([k]) => k === 'error')).toHaveLength(1);
  });

  it('CH-6001: a save that throws (a rejected promise) gets the standard error toast with Try again and the error haptic', async () => {
    create.mockRejectedValue(new Error('network down'));
    draw();
    fillAndSubmit();
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'error',
        title: 'Couldn’t set up Test Invitational',
        body: 'Your changes are still on this page. Try again in a moment.',
        code: 'CH-6001',
        action: expect.objectContaining({ label: 'Try again' }),
      }),
    );
    expect(haptic).toHaveBeenCalledWith('error');
    expect(report).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ action: 'tournaments.create' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('editing an event is still the placeholder', () => {
    const { container } = draw(f.form.edit);
    expect(container.querySelector('[data-ch-code="CH-16301"]')).not.toBeNull();
  });
});
