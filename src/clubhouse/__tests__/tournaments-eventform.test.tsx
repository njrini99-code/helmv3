import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push, refresh: vi.fn(), replace: vi.fn() }) }));
const update = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/tournaments', () => ({ updateTournament: update }));
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
  update.mockReset();
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

  it('lays the fields at the left and, at the right, what creating does with the two keys; each day stands under its own name', () => {
    const { container } = draw();
    const side = container.querySelector('.ch-tour-lu-form__side') as HTMLElement;
    expect(within(side).getByRole('button', { name: 'Create tournament' })).toBeInTheDocument();
    expect(within(side).getByRole('link', { name: 'Cancel' })).toBeInTheDocument();
    expect(side.querySelector('.ch-tour-lu-form__receipt')?.textContent).toMatch(/^Creates the tournament/);
    const main = container.querySelector('.ch-tour-lu-form__main') as HTMLElement;
    expect(within(main).getByLabelText('Name')).toBeInTheDocument();
    // The shared tournament fields (stubbed here) and the qualifier are with the name, not in the held column.
    expect(within(main).getByRole('button', { name: 'Pick Pinehurst' })).toBeInTheDocument();
    expect(main.querySelector('#ch-tour-form-qual')).not.toBeNull();
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
    expect(haptic.mock.calls.filter(([k]) => k === 'success')).toHaveLength(1);
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

  it('a throw after a refusal clears the old notice, so only the toast speaks', async () => {
    create.mockResolvedValueOnce({ success: false, error: 'No', code: 'failed' }).mockRejectedValueOnce(new Error('network down'));
    draw();
    fillAndSubmit();
    await screen.findByRole('alert');
    submit();
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

});

describe('Edit event (Tournaments page)', () => {
  const edit = f.form.edit;
  const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  it('is the same page on the event’s saved values, with no placeholder', () => {
    const { container } = draw(edit);
    expect(container.querySelector('[data-ch-tour-view="form"] h1')?.textContent).toBe('Edit event');
    expect(container.querySelector('[data-ch-code="CH-16301"]')).toBeNull();
    expect(screen.getByLabelText('Name')).toHaveValue(edit.initial.name);
    expect(screen.queryByRole('button', { name: 'Create tournament' })).toBeNull();
  });

  it('saves through updateTournament at the version it was opened at, then opens the desk (CH-16061)', async () => {
    update.mockResolvedValue({ success: true, data: { version: (edit.initial.version ?? 0) + 1 } });
    draw(edit);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed Classic' } });
    save();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const [id, input, version] = update.mock.calls[0]!;
    expect(id).toBe(edit.eventId);
    expect(input.name).toBe('Renamed Classic');
    expect(input.rounds).toHaveLength(edit.initial.rounds.length);
    expect(version).toBe(edit.initial.version);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(`/golf/dashboard/tournaments/${edit.eventId}`));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ code: 'CH-16061' }));
  });

  it('a stale event is refused with its words and a Reload key, and the typed name stays (CH-16060)', async () => {
    update.mockResolvedValue({ success: false, error: 'stale', code: 'stale' });
    draw(edit);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mine' } });
    save();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-ch-code', 'CH-16060');
    expect(alert.textContent).toContain('Couldn’t save the changes. Nothing was changed.');
    expect(alert.textContent).toContain('changed since you opened it');
    expect(screen.getByRole('button', { name: 'Reload the event' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Mine');
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('says a missing name before sending anything', () => {
    draw(edit);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } });
    save();
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(update).not.toHaveBeenCalled();
  });

  it('draws its loading state as Edit event', () => {
    const { container } = render(<EventForm data={edit} load="loading" phone={false} />);
    expect(container.querySelector('[data-ch-tour-view="form"]')).toHaveAttribute('data-ch-code', 'CH-16401');
    expect(container.querySelector('[data-ch-tour-view="form"]')).toHaveAttribute('aria-label', 'Loading edit event');
  });
});

describe('New event on the phone (F-0054)', () => {
  it('names the page once: one large title, and no eyebrow repeating the back label', () => {
    const { container } = render(<EventForm data={f.form.create} phone />);
    const h1 = container.querySelector('h1.ch-large-title');
    expect(h1?.textContent).toBe('New event');
    expect(h1?.hasAttribute('data-ch-large-title')).toBe(true);
    expect([...container.querySelectorAll('.ch-intro__eyebrow')].map((e) => e.textContent)).not.toContain('Tournaments');
  });
  it('desktop keeps its eyebrow and its canopy head', () => {
    const { container } = draw();
    expect(container.querySelector('.ch-large-title')).toBeNull();
    expect(container.textContent).toContain('Tournaments');
  });
});
