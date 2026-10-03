import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Team Hub, Travel: a coach can edit and delete a trip (swap audit section 14, D2). The screen is driven with fake
 * writes; the live writes are checked on their own against mocked actions, for the payload each action receives.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
const track = vi.hoisted(() => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../lib/track', () => track);
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
// What the live writes import: the actions.
const travel = vi.hoisted(() => ({
  createGolfTravelItinerary: vi.fn(),
  getTravelerClassConflicts: vi.fn(),
  updateGolfTravelItinerary: vi.fn(),
  deleteGolfTravelItinerary: vi.fn(),
}));
vi.mock('@/app/golf/actions/travel', () => travel);
vi.mock('@/app/golf/actions/communication', () => ({ acknowledgeAnnouncement: vi.fn() }));
vi.mock('@/app/golf/actions/announcements', () => ({ createEnrichedAnnouncement: vi.fn(), deleteAnnouncement: vi.fn(), updateAnnouncement: vi.fn() }));
vi.mock('@/app/golf/actions/documents', () => ({ createGolfDocument: vi.fn(), deleteGolfDocument: vi.fn(), getPreviewUrl: vi.fn(), uploadGolfDocument: vi.fn() }));
vi.mock('@/app/golf/actions/golf', () => ({ respondToEvent: vi.fn(), updateGolfEvent: vi.fn() }));
vi.mock('@/app/golf/actions/tasks', () => ({ completeTask: vi.fn(), uncompleteTask: vi.fn(), createTask: vi.fn(), deleteTask: vi.fn() }));

import { formatters, trip as hubTrip } from '../data/hub';
import { TeamHub } from '../screens/hub/TeamHub';
import { LIVE_HUB_WRITES, type ChHubWrites } from '../screens/hub/writes';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_HUB_COACH, PREVIEW_HUB_PLAYER } from '../preview/fixtures-hub';
import type { ChTeamHub } from '../data/hub';
import './dialog-polyfill';

const ok = () => Promise.resolve({ success: true });
const SEA = 'Seahawk Intercollegiate';
const CFI = 'Carolina Fall Invitational';

function writes(over: Partial<ChHubWrites> = {}): ChHubWrites {
  return {
    reply: vi.fn(ok),
    acknowledge: vi.fn(ok),
    completeTask: vi.fn(ok),
    uncompleteTask: vi.fn(ok),
    setTravelers: vi.fn(ok),
    travelerClasses: vi.fn(() => Promise.resolve({ success: true, data: { classes: [], partial: false } })),
    openDocument: vi.fn(() => Promise.resolve({ success: true, data: { url: 'https://files.example/d1' } })),
    postAnnouncement: vi.fn(() => Promise.resolve({ success: true, data: { announcementId: 'n' } })),
    editAnnouncement: vi.fn(ok),
    deleteAnnouncement: vi.fn(ok),
    assignTask: vi.fn(ok),
    deleteTask: vi.fn(ok),
    planTrip: vi.fn(ok),
    editTrip: vi.fn(ok),
    deleteTrip: vi.fn(ok),
    uploadDocument: vi.fn(ok),
    deleteDocument: vi.fn(ok),
    ...over,
  };
}

function show(data: ChTeamHub = PREVIEW_HUB_COACH, w: ChHubWrites = writes()) {
  const user = userEvent.setup();
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <TeamHub data={data} writes={w} initialTab="travel" viewerName="Maya Reyes" />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
  return { user, w };
}

type User = ReturnType<typeof userEvent.setup>;
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const openMenu = async (user: User, trip: string, item: string) => {
  await user.click(screen.getByRole('button', { name: `More for ${trip}` }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
};
const editSheet = async () => within(await screen.findByRole('dialog', { name: 'Edit trip' }));
/** A date field set the way a person picks one: the value changes and the change is announced. */
function fireDate(input: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  hapticSpy.mockClear();
  track.chReport.mockClear();
  router.refresh.mockClear();
  for (const f of Object.values(travel)) f.mockReset();
});

describe('Team Hub · Travel · who gets the menu', () => {
  it('a coach has Edit trip and Delete trip on every trip', async () => {
    const { user } = show();
    expect(screen.getByRole('button', { name: `More for ${CFI}` })).toBeTruthy();
    expect(screen.getByRole('button', { name: `More for ${SEA}` })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: `More for ${SEA}` }));
    expect(await screen.findByRole('menuitem', { name: 'Edit trip' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Delete trip' })).toBeTruthy();
  });

  it('a player has no menu on a trip', () => {
    show(PREVIEW_HUB_PLAYER);
    expect(screen.getByText(SEA)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^More for / })).toBeNull();
  });
});

describe('Team Hub · Travel · CH-10504 CH-10009 Delete a trip (D2)', () => {
  it('CH-10504 asks first with a warning, says what goes with the trip, and Keep it sends nothing', async () => {
    const { user, w } = show();
    await openMenu(user, SEA, 'Delete trip');
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    const ask = await screen.findByRole('dialog', { name: 'Delete this trip?' });
    expect(code('CH-10504')).toBe(ask);
    expect(ask.textContent).toMatch(/expenses and budgets are deleted with it/);
    expect(ask.textContent).toMatch(/calendar event stays/);
    expect(w.deleteTrip).not.toHaveBeenCalled();
    await user.click(within(ask).getByRole('button', { name: 'Keep it' }));
    expect(w.deleteTrip).not.toHaveBeenCalled();
    expect(screen.getByText(SEA)).toBeTruthy();
  });

  it('Delete calls deleteTrip with the trip, the trip leaves the page at once, and the page reads again', async () => {
    const { user, w } = show();
    await openMenu(user, SEA, 'Delete trip');
    await user.click(within(await screen.findByRole('dialog', { name: 'Delete this trip?' })).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(w.deleteTrip).toHaveBeenCalledWith('sea'));
    expect(w.deleteTrip).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText(SEA)).toBeNull());
    expect(await screen.findByText(`Deleted ${SEA}`)).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('success');
    expect(router.refresh).toHaveBeenCalled();
    // The other trip is untouched.
    expect(screen.getByText(CFI)).toBeTruthy();
  });

  it('CH-10009 a refused delete says so with the reason, keeps the trip, and Retry sends it again', async () => {
    const deleteTrip = vi.fn().mockImplementationOnce(() => Promise.resolve({ success: false, error: 'Not authorized for this team' })).mockImplementationOnce(ok);
    const { user } = show(PREVIEW_HUB_COACH, writes({ deleteTrip }));
    await openMenu(user, SEA, 'Delete trip');
    await user.click(within(await screen.findByRole('dialog', { name: 'Delete this trip?' })).getByRole('button', { name: 'Delete' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Couldn’t delete Seahawk Intercollegiate/);
    expect(alert.textContent).toMatch(/Not authorized for this team/);
    expect(code('CH-10009')).not.toBeNull();
    expect(screen.getByText(SEA)).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(track.chReport).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ action: 'hub.delete' }));

    // The toast moves into the open dialog once it is up, so the button is found again.
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(deleteTrip).toHaveBeenCalledTimes(2));
    expect(deleteTrip).toHaveBeenLastCalledWith('sea');
    await waitFor(() => expect(screen.queryByText(SEA)).toBeNull());
  });

  it('deleting the next trip promotes the one after it', async () => {
    const { user } = show();
    await openMenu(user, CFI, 'Delete trip');
    await user.click(within(await screen.findByRole('dialog', { name: 'Delete this trip?' })).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText(CFI)).toBeNull());
    expect(screen.getByText(SEA)).toBeTruthy();
  });
});

describe('Team Hub · Travel · CH-10013 CH-10103 CH-10104 CH-10105 CH-10106 Edit a trip (D2)', () => {
  it('opens on the trip as saved, dates and times included', async () => {
    const { user } = show();
    await openMenu(user, SEA, 'Edit trip');
    const d = await editSheet();
    expect((d.getByLabelText('Trip') as HTMLInputElement).value).toBe(SEA);
    expect((d.getByLabelText('Where') as HTMLInputElement).value).toBe('Country Club of Landfall · Wilmington, NC');
    expect(d.getByRole('radio', { name: 'Bus' })).toHaveAttribute('aria-checked', 'true');
    expect((d.getByLabelText('Leaves') as HTMLInputElement).value).toBe('2026-11-14');
    expect((d.getByLabelText('From') as HTMLInputElement).value).toBe('Finley lot');
    expect((d.getByLabelText('Back') as HTMLInputElement).value).toBe('2026-11-16');
    expect((d.getByLabelText('Hotel (optional)') as HTMLInputElement).value).toBe('Hotel Ballast');
    const [leaveAt, backAt] = d.getAllByLabelText('At') as HTMLInputElement[];
    expect(leaveAt!.value).toBe('11:00');
    // This trip has no return time saved.
    expect(backAt!.value).toBe('');
  });

  it('Save calls editTrip with every field, then closes, says so and reads the page again', async () => {
    const { user, w } = show();
    await openMenu(user, SEA, 'Edit trip');
    const d = await editSheet();
    await user.clear(d.getByLabelText('Hotel (optional)'));
    await user.type(d.getByLabelText('Hotel (optional)'), 'Hotel Ballast Wilmington');
    await user.click(d.getByRole('radio', { name: 'Van' }));
    fireDate(d.getByLabelText('Back') as HTMLInputElement, '2026-11-17');
    await user.click(d.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(w.editTrip).toHaveBeenCalledWith({
        id: 'sea',
        name: SEA,
        destination: 'Country Club of Landfall · Wilmington, NC',
        transport: 'van',
        departDate: '2026-11-14',
        departTime: '11:00',
        from: 'Finley lot',
        returnDate: '2026-11-17',
        returnTime: '',
        hotel: 'Hotel Ballast Wilmington',
        notes: '',
      }),
    );
    expect(await screen.findByText(`${SEA} updated`)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit trip' })).toBeNull());
    expect(router.refresh).toHaveBeenCalled();
    expect(hapticSpy).toHaveBeenCalledWith('success');
  });

  it('a wrong date and a wrong time can be fixed: the changed values are what is sent', async () => {
    const { user, w } = show();
    await openMenu(user, CFI, 'Edit trip');
    const d = await editSheet();
    fireDate(d.getByLabelText('Leaves') as HTMLInputElement, '2026-11-04');
    const [leaveAt] = d.getAllByLabelText('At') as HTMLInputElement[];
    fireDate(leaveAt!, '13:30');
    await user.click(d.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(w.editTrip).toHaveBeenCalledWith(expect.objectContaining({ id: 'cfi', departDate: '2026-11-04', departTime: '13:30', returnDate: '2026-11-05', returnTime: '17:00' })));
  });

  it('CH-10013 a refused save shows the reason, keeps the sheet with what was typed, and Retry sends it again', async () => {
    const editTrip = vi.fn().mockImplementationOnce(() => Promise.resolve({ success: false, error: 'Invalid travel itinerary data. Please check your inputs.' })).mockImplementationOnce(ok);
    const { user } = show(PREVIEW_HUB_COACH, writes({ editTrip }));
    await openMenu(user, SEA, 'Edit trip');
    const d = await editSheet();
    await user.clear(d.getByLabelText('Trip'));
    await user.type(d.getByLabelText('Trip'), 'Seahawk Classic');
    await user.click(d.getByRole('button', { name: 'Save changes' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Couldn’t update Seahawk Classic/);
    expect(alert.textContent).toMatch(/Invalid travel itinerary data/);
    expect(code('CH-10013')).not.toBeNull();
    expect(screen.getByRole('dialog', { name: 'Edit trip' })).toBeTruthy();
    expect((d.getByLabelText('Trip') as HTMLInputElement).value).toBe('Seahawk Classic');
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(track.chReport).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ action: 'hub.editTrip' }));
    expect(router.refresh).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(editTrip).toHaveBeenCalledTimes(2));
    expect(editTrip).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'sea', name: 'Seahawk Classic' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit trip' })).toBeNull());
  });

  it('CH-10103 CH-10104 CH-10105 CH-10106 a trip needs a name, a place and a leaving day, and the return cannot be before it; nothing is sent until it does', async () => {
    const { user, w } = show();
    await openMenu(user, SEA, 'Edit trip');
    const d = await editSheet();
    await user.clear(d.getByLabelText('Trip'));
    await user.type(d.getByLabelText('Trip'), 'Ab');
    await user.clear(d.getByLabelText('Where'));
    await user.clear(d.getByLabelText('Leaves'));
    await user.click(d.getByRole('button', { name: 'Save changes' }));

    expect(d.getByText('Name the trip, at least three characters.')).toBeTruthy();
    expect(d.getByText('Where is the team going?')).toBeTruthy();
    expect(d.getByText('Pick the day the team leaves.')).toBeTruthy();
    expect(code('CH-10103')).not.toBeNull();
    expect(code('CH-10104')).not.toBeNull();
    expect(code('CH-10105')).not.toBeNull();
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    expect(w.editTrip).not.toHaveBeenCalled();

    await user.type(d.getByLabelText('Trip'), 'c');
    await user.type(d.getByLabelText('Where'), 'Landfall');
    fireDate(d.getByLabelText('Leaves') as HTMLInputElement, '2026-11-20');
    await user.click(d.getByRole('button', { name: 'Save changes' }));
    expect(d.getByText('The return can’t be before the departure.')).toBeTruthy();
    expect(code('CH-10106')).not.toBeNull();
    expect(w.editTrip).not.toHaveBeenCalled();
  });

  it('opening a different trip starts from that trip, not the last one', async () => {
    const { user } = show();
    await openMenu(user, SEA, 'Edit trip');
    let d = await editSheet();
    expect((d.getByLabelText('Trip') as HTMLInputElement).value).toBe(SEA);
    await user.click(d.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit trip' })).toBeNull());
    await openMenu(user, CFI, 'Edit trip');
    d = await editSheet();
    expect((d.getByLabelText('Trip') as HTMLInputElement).value).toBe(CFI);
    expect((d.getByLabelText('Hotel (optional)') as HTMLInputElement).value).toBe('Mid Pines Inn');
    expect((d.getByLabelText('Back') as HTMLInputElement).value).toBe('2026-11-05');
  });
});

describe('Team Hub · Travel · the loader gives Edit the trip as saved', () => {
  const f = formatters('America/New_York', new Date('2026-10-20T12:00:00Z'));
  const row = (over: Record<string, unknown> = {}) =>
    hubTrip(
      {
        id: 'x',
        event_id: null,
        event_name: 'Seahawk',
        destination: 'Wilmington',
        transportation_type: 'bus',
        departure_date: '2026-11-14',
        departure_time: '11:00:00',
        departure_location: 'Finley lot',
        return_date: '2026-11-16',
        return_time: '17:30:00',
        hotel_name: null,
        gear_list: null,
        room_assignments: null,
        notes: null,
        flight_info: null,
        uniform_requirements: null,
        ...over,
      },
      f,
      '2026-10-20',
      { travelers: null, count: null, mine: null },
    );

  it('carries the departure time, return day and return time as HH:MM and YYYY-MM-DD, beside the words', () => {
    expect(row()).toMatchObject({ departDate: '2026-11-14', departTime: '11:00', returnDate: '2026-11-16', returnTime: '17:30', depart: expect.stringContaining('11:00'), back: expect.stringContaining('5:30') });
  });

  it('gives null for what is not set', () => {
    expect(row({ departure_time: null, return_date: null, return_time: null })).toMatchObject({ departTime: null, returnDate: null, returnTime: null });
  });
});

describe('Team Hub · Travel · the live trip writes (D2)', () => {
  const edit = {
    id: 'sea',
    name: '  Seahawk Classic ',
    destination: ' Landfall ',
    transport: 'van' as const,
    departDate: '2026-11-14',
    departTime: '11:00',
    from: ' Finley lot ',
    returnDate: '2026-11-16',
    returnTime: '',
    hotel: ' ',
    notes: ' Bus leaves on time ',
  };

  it('editTrip sends every field, trimmed, to updateGolfTravelItinerary; a blank clears one', async () => {
    travel.updateGolfTravelItinerary.mockResolvedValue({ success: true });
    await LIVE_HUB_WRITES.editTrip(edit);
    expect(travel.updateGolfTravelItinerary).toHaveBeenCalledWith({
      id: 'sea',
      event_name: 'Seahawk Classic',
      destination: 'Landfall',
      transportation_type: 'van',
      departure_date: '2026-11-14',
      departure_time: '11:00',
      departure_location: 'Finley lot',
      return_date: '2026-11-16',
      // A blank clears the field (the action turns '' into null).
      return_time: '',
      hotel_name: '',
      notes: 'Bus leaves on time',
    });
  });

  it('editTrip leaves out a transport the trip never had, so its own is kept', async () => {
    travel.updateGolfTravelItinerary.mockResolvedValue({ success: true });
    await LIVE_HUB_WRITES.editTrip({ ...edit, transport: null });
    expect(travel.updateGolfTravelItinerary.mock.calls[0]![0]).not.toHaveProperty('transportation_type');
  });

  it('deleteTrip calls deleteGolfTravelItinerary with the trip and returns its answer', async () => {
    travel.deleteGolfTravelItinerary.mockResolvedValue({ success: false, error: 'Itinerary not found' });
    await expect(LIVE_HUB_WRITES.deleteTrip('sea')).resolves.toEqual({ success: false, error: 'Itinerary not found' });
    expect(travel.deleteGolfTravelItinerary).toHaveBeenCalledWith('sea');
  });
});
