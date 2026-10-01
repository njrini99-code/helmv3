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
// What the live writes import: the actions, and the browser Supabase client the times read goes through.
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
const itinerary = vi.hoisted(() => ({ read: vi.fn(), table: vi.fn(), columns: vi.fn(), id: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      itinerary.table(table);
      return {
        select: (columns: string) => {
          itinerary.columns(columns);
          return {
            eq: (_col: string, id: string) => {
              itinerary.id(id);
              return { maybeSingle: itinerary.read };
            },
          };
        },
      };
    },
  }),
}));

import { TeamHub } from '../screens/hub/TeamHub';
import { LIVE_HUB_WRITES, type ChHubWrites } from '../screens/hub/writes';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_HUB_COACH, PREVIEW_HUB_PLAYER } from '../preview/fixtures-hub';
import type { ChTeamHub } from '../data/hub';
import './dialog-polyfill';

const ok = () => Promise.resolve({ success: true });
const TIMES = { departTime: '11:00', returnDate: '2026-11-16', returnTime: '17:30' };
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
    uploadDocument: vi.fn(ok),
    deleteDocument: vi.fn(ok),
    tripTimes: vi.fn(() => Promise.resolve({ success: true, data: TIMES })),
    editTrip: vi.fn(ok),
    deleteTrip: vi.fn(ok),
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
const openMenu = async (user: User, trip: string, item: string) => {
  await user.click(screen.getByRole('button', { name: `More for ${trip}` }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
};
const editSheet = async () => within(await screen.findByRole('dialog', { name: 'Edit trip' }));

beforeEach(() => {
  hapticSpy.mockClear();
  track.chReport.mockClear();
  router.refresh.mockClear();
  for (const f of [...Object.values(travel), ...Object.values(itinerary)]) f.mockReset();
});

describe('Team Hub · Travel · Delete a trip (D2)', () => {
  it('offers a coach Edit trip and Delete trip on every trip, and a player neither', async () => {
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

  it('a screen given no trip writes offers no menu', () => {
    const w = writes();
    delete w.editTrip;
    delete w.deleteTrip;
    show(PREVIEW_HUB_COACH, w);
    expect(screen.queryByRole('button', { name: `More for ${SEA}` })).toBeNull();
  });

  it('asks first with a warning, says what goes with the trip, and Keep it sends nothing', async () => {
    const { user, w } = show();
    await openMenu(user, SEA, 'Delete trip');
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    const ask = await screen.findByRole('dialog', { name: 'Delete this trip?' });
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

  it('a refused delete says so with the reason, keeps the trip, and Retry sends it again', async () => {
    const deleteTrip = vi.fn().mockImplementationOnce(() => Promise.resolve({ success: false, error: 'Not authorized for this team' })).mockImplementationOnce(ok);
    const { user } = show(PREVIEW_HUB_COACH, writes({ deleteTrip }));
    await openMenu(user, SEA, 'Delete trip');
    await user.click(within(await screen.findByRole('dialog', { name: 'Delete this trip?' })).getByRole('button', { name: 'Delete' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Couldn’t delete Seahawk Intercollegiate/);
    expect(alert.textContent).toMatch(/Not authorized for this team/);
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

describe('Team Hub · Travel · Edit a trip (D2)', () => {
  it('opens on the trip as saved, with its times read in', async () => {
    const { user, w } = show();
    await openMenu(user, SEA, 'Edit trip');
    const d = await editSheet();
    expect(w.tripTimes).toHaveBeenCalledWith('sea');
    expect((d.getByLabelText('Trip') as HTMLInputElement).value).toBe(SEA);
    expect((d.getByLabelText('Where') as HTMLInputElement).value).toBe('Country Club of Landfall · Wilmington, NC');
    expect(d.getByRole('radio', { name: 'Bus' })).toHaveAttribute('aria-checked', 'true');
    expect((d.getByLabelText('Leaves') as HTMLInputElement).value).toBe('2026-11-14');
    expect((d.getByLabelText('From') as HTMLInputElement).value).toBe('Finley lot');
    expect((d.getByLabelText('Hotel (optional)') as HTMLInputElement).value).toBe('Hotel Ballast');
    await waitFor(() => expect((d.getByLabelText('Back') as HTMLInputElement).value).toBe('2026-11-16'));
    const [leaveAt, backAt] = d.getAllByLabelText('At') as HTMLInputElement[];
    expect(leaveAt!.value).toBe('11:00');
    expect(backAt!.value).toBe('17:30');
  });

  it('Save calls editTrip with every field, the times as read, then closes, says so and reads the page again', async () => {
    const { user, w } = show();
    await openMenu(user, SEA, 'Edit trip');
    const d = await editSheet();
    await waitFor(() => expect((d.getByLabelText('Back') as HTMLInputElement).value).toBe('2026-11-16'));
    await user.clear(d.getByLabelText('Hotel (optional)'));
    await user.type(d.getByLabelText('Hotel (optional)'), 'Hotel Ballast Wilmington');
    await user.click(d.getByRole('radio', { name: 'Van' }));
    await user.click(d.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(w.editTrip).toHaveBeenCalledWith({
        id: 'sea',
        name: SEA,
        destination: 'Country Club of Landfall · Wilmington, NC',
        transport: 'van',
        departDate: '2026-11-14',
        from: 'Finley lot',
        hotel: 'Hotel Ballast Wilmington',
        notes: '',
        departTime: '11:00',
        returnDate: '2026-11-16',
        returnTime: '17:30',
      }),
    );
    expect(await screen.findByText(`${SEA} updated`)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit trip' })).toBeNull());
    expect(router.refresh).toHaveBeenCalled();
    expect(hapticSpy).toHaveBeenCalledWith('success');
  });

  it('a refused save shows the reason, keeps the sheet with what was typed, and Retry sends it again', async () => {
    const editTrip = vi.fn().mockImplementationOnce(() => Promise.resolve({ success: false, error: 'Invalid travel itinerary data. Please check your inputs.' })).mockImplementationOnce(ok);
    const { user } = show(PREVIEW_HUB_COACH, writes({ editTrip }));
    await openMenu(user, SEA, 'Edit trip');
    const d = await editSheet();
    await waitFor(() => expect((d.getByLabelText('Back') as HTMLInputElement).value).toBe('2026-11-16'));
    await user.clear(d.getByLabelText('Trip'));
    await user.type(d.getByLabelText('Trip'), 'Seahawk Classic');
    await user.click(d.getByRole('button', { name: 'Save changes' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Couldn’t update Seahawk Classic/);
    expect(alert.textContent).toMatch(/Invalid travel itinerary data/);
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

  it('a trip needs a name, a place and a leaving day, and the return cannot be before it; nothing is sent until it does', async () => {
    const { user, w } = show();
    await openMenu(user, SEA, 'Edit trip');
    const d = await editSheet();
    await waitFor(() => expect((d.getByLabelText('Back') as HTMLInputElement).value).toBe('2026-11-16'));
    await user.clear(d.getByLabelText('Trip'));
    await user.type(d.getByLabelText('Trip'), 'Ab');
    await user.clear(d.getByLabelText('Where'));
    await user.clear(d.getByLabelText('Leaves'));
    await user.click(d.getByRole('button', { name: 'Save changes' }));

    expect(d.getByText('Name the trip, at least three characters.')).toBeTruthy();
    expect(d.getByText('Where is the team going?')).toBeTruthy();
    expect(d.getByText('Pick the day the team leaves.')).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    expect(w.editTrip).not.toHaveBeenCalled();

    await user.type(d.getByLabelText('Trip'), 'c');
    await user.type(d.getByLabelText('Where'), 'Landfall');
    fireDate(d.getByLabelText('Leaves') as HTMLInputElement, '2026-11-20');
    await user.click(d.getByRole('button', { name: 'Save changes' }));
    expect(d.getByText('The return can’t be before the departure.')).toBeTruthy();
    expect(w.editTrip).not.toHaveBeenCalled();
  });

  it('when the times will not read, they stay as they are: the fields are off, Save leaves them out, and Try again reads them', async () => {
    const tripTimes = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve({ success: false, error: 'no' }))
      .mockImplementation(() => Promise.resolve({ success: true, data: TIMES }));
    const { user, w } = show(PREVIEW_HUB_COACH, writes({ tripTimes }));
    await openMenu(user, SEA, 'Edit trip');
    const d = await editSheet();
    const failed = await d.findByRole('alert');
    expect(failed.textContent).toMatch(/The times didn’t load, so they stay as they are/);
    expect(d.getByLabelText('Back')).toBeDisabled();
    for (const at of d.getAllByLabelText('At')) expect(at).toBeDisabled();
    expect(track.chReport).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ surface: 'hub.editTrip', action: 'readTimes' }));

    await user.type(d.getByLabelText('Hotel (optional)'), ' Wilmington');
    await user.click(d.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(w.editTrip).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(w.editTrip!).mock.calls[0]![0];
    expect(sent.hotel).toBe('Hotel Ballast Wilmington');
    // Not sent at all, so the trip's own stay as saved (a blank would clear them).
    expect(sent).not.toHaveProperty('departTime');
    expect(sent).not.toHaveProperty('returnDate');
    expect(sent).not.toHaveProperty('returnTime');
  });

  it('Try again reads the times and opens the fields', async () => {
    const tripTimes = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve({ success: false, error: 'no' }))
      .mockImplementation(() => Promise.resolve({ success: true, data: TIMES }));
    const { user } = show(PREVIEW_HUB_COACH, writes({ tripTimes }));
    await openMenu(user, SEA, 'Edit trip');
    const d = await editSheet();
    await user.click(await d.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect((d.getByLabelText('Back') as HTMLInputElement).value).toBe('2026-11-16'));
    expect(d.getByLabelText('Back')).not.toBeDisabled();
    expect(d.queryByRole('alert')).toBeNull();
  });

  it('a times read that throws is reported and handled like one that failed', async () => {
    const { user } = show(PREVIEW_HUB_COACH, writes({ tripTimes: vi.fn(() => Promise.reject(new Error('network'))) }));
    await openMenu(user, SEA, 'Edit trip');
    const d = await editSheet();
    expect((await d.findByRole('alert')).textContent).toMatch(/The times didn’t load/);
    expect(track.chReport).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ action: 'readTimes' }));
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
  });
});

/** A date field set the way a person picks one: the value changes and the change is announced. */
function fireDate(input: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Team Hub · Travel · the live trip writes (D2)', () => {
  const edit = {
    id: 'sea',
    name: '  Seahawk Classic ',
    destination: ' Landfall ',
    transport: 'van' as const,
    departDate: '2026-11-14',
    from: ' Finley lot ',
    hotel: ' ',
    notes: ' Bus leaves on time ',
  };

  it('editTrip sends the trimmed fields to updateGolfTravelItinerary, with the times when they were read', async () => {
    travel.updateGolfTravelItinerary.mockResolvedValue({ success: true });
    await LIVE_HUB_WRITES.editTrip!({ ...edit, departTime: '11:00', returnDate: '2026-11-16', returnTime: '' });
    expect(travel.updateGolfTravelItinerary).toHaveBeenCalledWith({
      id: 'sea',
      event_name: 'Seahawk Classic',
      destination: 'Landfall',
      transportation_type: 'van',
      departure_date: '2026-11-14',
      departure_location: 'Finley lot',
      // A blank clears the field (the action turns '' into null).
      hotel_name: '',
      notes: 'Bus leaves on time',
      departure_time: '11:00',
      return_date: '2026-11-16',
      return_time: '',
    });
  });

  it('editTrip leaves out the times that were not read, and a transport the trip never had', async () => {
    travel.updateGolfTravelItinerary.mockResolvedValue({ success: true });
    await LIVE_HUB_WRITES.editTrip!({ ...edit, transport: null });
    const sent = travel.updateGolfTravelItinerary.mock.calls[0]![0];
    expect(Object.keys(sent).sort()).toEqual(['departure_date', 'departure_location', 'destination', 'event_name', 'hotel_name', 'id', 'notes']);
  });

  it('deleteTrip calls deleteGolfTravelItinerary with the trip and returns its answer', async () => {
    travel.deleteGolfTravelItinerary.mockResolvedValue({ success: false, error: 'Itinerary not found' });
    await expect(LIVE_HUB_WRITES.deleteTrip!('sea')).resolves.toEqual({ success: false, error: 'Itinerary not found' });
    expect(travel.deleteGolfTravelItinerary).toHaveBeenCalledWith('sea');
  });

  it('tripTimes reads the trip row and gives the times as HH:MM, and blank for what is not set', async () => {
    itinerary.read.mockResolvedValue({ data: { departure_time: '11:00:00', return_date: null, return_time: null }, error: null });
    await expect(LIVE_HUB_WRITES.tripTimes!('sea')).resolves.toEqual({ success: true, data: { departTime: '11:00', returnDate: '', returnTime: '' } });
    expect(itinerary.table).toHaveBeenCalledWith('golf_travel_itineraries');
    expect(itinerary.columns).toHaveBeenCalledWith('departure_time, return_date, return_time');
    expect(itinerary.id).toHaveBeenCalledWith('sea');
  });

  it('tripTimes says so when the read fails or the trip is gone', async () => {
    itinerary.read.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(LIVE_HUB_WRITES.tripTimes!('sea')).resolves.toEqual({ success: false, error: 'boom' });
    itinerary.read.mockResolvedValueOnce({ data: null, error: null });
    await expect(LIVE_HUB_WRITES.tripTimes!('sea')).resolves.toEqual({ success: false, error: 'This trip was not found.' });
  });
});
