import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn() }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const table = vi.hoisted(() => ({ read: { data: null as unknown, error: null as unknown }, upserts: [] as unknown[] }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => table.read }) }),
      upsert: async (row: unknown) => {
        table.upserts.push(row);
        return { error: null };
      },
    }),
  }),
}));

import { ToastProvider } from '../ui/Toast';
import {
  CourseLocationCard,
  CourseSourceContext,
  isMissingColumn,
  liveCourseSource,
  locateHere,
  roundCoord,
  type ChCourseRead,
  type ChCourseSource,
} from '../screens/settings/course-location';

const wrap = (source: ChCourseSource) =>
  function Wrap({ children }: { children: ReactNode }) {
    return (
      <ToastProvider scope="t">
        <CourseSourceContext.Provider value={() => source}>{children}</CourseSourceContext.Provider>
      </ToastProvider>
    );
  };
const fake = (read: ChCourseRead, save = vi.fn(async () => ({ success: true }))): ChCourseSource => ({ read: async () => read, save });

describe('the course location before its migration (CH-8320)', () => {
  it('a missing column is "off", never an error', async () => {
    expect(isMissingColumn({ code: '42703', message: 'column golf_team_settings.course_latitude does not exist' })).toBe(true);
    expect(isMissingColumn({ code: 'PGRST204' })).toBe(true);
    expect(isMissingColumn({ code: '42501', message: 'permission denied' })).toBe(false);
    table.read = { data: null, error: { code: '42703', message: 'column golf_team_settings.course_latitude does not exist' } };
    await expect(liveCourseSource('team-1').read()).resolves.toEqual({ status: 'off' });
  });

  it('draws nothing while the columns are missing or the read failed', async () => {
    for (const read of [{ status: 'off' }, { status: 'failed' }] as ChCourseRead[]) {
      const { container, unmount } = render(<CourseLocationCard teamId="team-1" />, { wrapper: wrap(fake(read)) });
      await act(async () => {});
      expect(container.textContent).toBe('');
      unmount();
    }
  });
});

describe('the course location once its columns exist', () => {
  it('shows what is set and clears it', async () => {
    const save = vi.fn(async () => ({ success: true }));
    render(<CourseLocationCard teamId="team-1" />, { wrapper: wrap(fake({ status: 'ok', value: { lat: 35.19, lng: -79.47, label: 'Pinehurst No. 2' } }, save)) });
    await screen.findByText('35.19, -79.47');
    expect(screen.getByText('Set: Pinehurst No. 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(null));
    await screen.findByText('Not set');
    expect(refresh).toHaveBeenCalled();
  });

  it('takes this device’s location, rounded to two decimals, with a name', async () => {
    const save = vi.fn(async () => ({ success: true }));
    const geo = { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 35.18734, longitude: -79.46612 } } as GeolocationPosition) };
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
    render(<CourseLocationCard teamId="team-1" />, { wrapper: wrap(fake({ status: 'ok', value: null }, save)) });
    fireEvent.click(await screen.findByRole('button', { name: 'Use this device’s location' }));
    await screen.findByText('35.19, -79.47');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Home course' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ lat: 35.19, lng: -79.47, label: 'Home course' }));
  });

  it('says why when the device will not share where it is', async () => {
    const denied = { getCurrentPosition: (_ok: PositionCallback, bad: PositionErrorCallback) => bad({ code: 1 } as GeolocationPositionError) } as unknown as Geolocation;
    await expect(locateHere(denied)).resolves.toEqual({ problem: expect.stringMatching(/Location is off/) });
    await expect(locateHere(null)).resolves.toEqual({ problem: expect.stringMatching(/can’t share/) });
    expect(roundCoord(-79.466)).toBe(-79.47);
  });

  it('writes the rounded point and a trimmed name, or nulls to clear', async () => {
    table.upserts = [];
    const live = liveCourseSource('team-1');
    await live.save({ lat: 35.18734, lng: -79.46612, label: '  Pinehurst  ' });
    await live.save(null);
    expect(table.upserts[0]).toMatchObject({ team_id: 'team-1', course_latitude: 35.19, course_longitude: -79.47, course_label: 'Pinehurst' });
    expect(table.upserts[1]).toMatchObject({ team_id: 'team-1', course_latitude: null, course_longitude: null, course_label: null });
  });
});

describe('a location the device will not give (CH-8320)', () => {
  it('says why inline, keeps the name usable, and offers no Save without a point', async () => {
    const denied = { getCurrentPosition: (_ok: PositionCallback, bad: PositionErrorCallback) => bad({ code: 1 } as GeolocationPositionError) };
    Object.defineProperty(navigator, 'geolocation', { value: denied, configurable: true });
    const save = vi.fn(async () => ({ success: true }));
    render(<CourseLocationCard teamId="team-1" />, { wrapper: wrap(fake({ status: 'ok', value: null }, save)) });
    fireEvent.click(await screen.findByRole('button', { name: 'Use this device’s location' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Location is off for this app/);
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    expect(name.disabled).toBe(false);
    fireEvent.change(name, { target: { value: 'Home course' } });
    expect(name.value).toBe('Home course');
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('on the phone too', async () => {
    const { CourseLocationPhone } = await import('../screens/settings/course-location');
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
    render(<CourseLocationPhone teamId="team-1" />, { wrapper: wrap(fake({ status: 'ok', value: null })) });
    fireEvent.click(await screen.findByRole('button', { name: 'Use this phone’s location' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/can’t share its location/);
    expect((screen.getByLabelText('Name') as HTMLInputElement).disabled).toBe(false);
  });
});

describe('without a Supabase client (CH-8320)', () => {
  it('reads as off, so the row draws nothing and nothing throws', async () => {
    const mod = await import('@/lib/supabase/client');
    const spy = vi.spyOn(mod, 'createClient').mockImplementation(() => {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
    });
    await expect(liveCourseSource('team-1').read()).resolves.toEqual({ status: 'off' });
    await expect(liveCourseSource('team-1').save(null)).resolves.toMatchObject({ success: false });
    spy.mockRestore();
  });

  it('a read that throws leaves the row undrawn', async () => {
    const throwing: ChCourseSource = { read: async () => Promise.reject(new Error('dropped')), save: async () => ({ success: true }) };
    const { container } = render(<CourseLocationCard teamId="team-1" />, { wrapper: wrap(throwing) });
    await act(async () => {});
    expect(container.textContent).toBe('');
  });
});
