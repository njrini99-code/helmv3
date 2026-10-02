import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Settings, Preferences: the distance unit (swap audit section 14, D7). It is the preference Fairway's Settings writes
 * and the shot screen reads (`golf_distance_unit_pref`, a device preference), so the checks are on that one key and on
 * a reader of it (the shot screen's own hook), on the desktop card and on the phone's picker row.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ getFeedback: () => undefined, addBreadcrumb: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));

import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import { ToastProvider } from '../ui/Toast';
import { PhoneChromeProvider } from '../shell/phone-chrome';
import { SettingsView } from '../screens/settings/SettingsView';
import type { ChDevice, ChSettingsWrites } from '../screens/settings/model';
import { coachData } from '../preview/fixtures-settings';
import './dialog-polyfill';

const KEY = 'golf_distance_unit_pref';

/** What the shot screen reads (RoundTracking uses this same hook). */
function ShotScreenReader() {
  return <output aria-label="Shot screen unit">{useDistanceUnits().distancePref}</output>;
}

const ok = () => Promise.resolve({ success: true });
const writes = (): ChSettingsWrites =>
  new Proxy({ refresh: vi.fn() } as unknown as ChSettingsWrites, { get: (t, k) => (k in t ? t[k as keyof ChSettingsWrites] : vi.fn(ok)) });
const device: ChDevice = { native: false, push: { status: 'unsubscribed', pending: false, subscribe: vi.fn(), unsubscribe: vi.fn() } as unknown as ChDevice['push'] };

function show() {
  const user = userEvent.setup();
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <PhoneChromeProvider>
          <div className="ch-root" data-ui="clubhouse">
            <ShotScreenReader />
            <SettingsView data={coachData()} writes={writes()} device={device} initialSection="preferences" onDeleted={vi.fn()} />
          </div>
        </PhoneChromeProvider>
      </ToastProvider>
    </LazyMotion>,
  );
  return user;
}

beforeEach(() => {
  hapticSpy.mockClear();
  localStorage.clear();
});

describe('Settings · Preferences · distance units (D7)', () => {
  it('shows Yards by default, and choosing Meters writes the preference the shot screen reads', async () => {
    const user = show();
    const group = screen.getByRole('radiogroup', { name: 'Distance units' });
    expect(within(group).getByRole('radio', { name: 'Yards' })).toBeChecked();
    expect(screen.getByLabelText('Shot screen unit').textContent).toBe('yards');

    await user.click(within(group).getByRole('radio', { name: 'Meters' }));

    expect(localStorage.getItem(KEY)).toBe('meters');
    expect(within(group).getByRole('radio', { name: 'Meters' })).toBeChecked();
    await waitFor(() => expect(screen.getByLabelText('Shot screen unit').textContent).toBe('meters'));
    expect(hapticSpy).toHaveBeenCalledWith('select');

    await user.click(within(group).getByRole('radio', { name: 'Yards' }));
    expect(localStorage.getItem(KEY)).toBe('yards');
    await waitFor(() => expect(screen.getByLabelText('Shot screen unit').textContent).toBe('yards'));
  });

  it('opens on the unit already saved, from Fairway or an earlier visit', async () => {
    localStorage.setItem(KEY, 'meters');
    show();
    await waitFor(() => expect(within(screen.getByRole('radiogroup', { name: 'Distance units' })).getByRole('radio', { name: 'Meters' })).toBeChecked());
  });

  it('keeps working for the session when the device refuses to store it, and says it is saved on this device only', async () => {
    const user = show();
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    try {
      await user.click(within(screen.getByRole('radiogroup', { name: 'Distance units' })).getByRole('radio', { name: 'Meters' }));
      await waitFor(() => expect(screen.getByLabelText('Shot screen unit').textContent).toBe('meters'));
    } finally {
      set.mockRestore();
    }
    expect(screen.getByText(/Saved on this device only/)).toBeTruthy();
  });
});

describe('Settings · phone · Preferences · distance units (D7)', () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({
      matches: q === '(max-width: 820px)',
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as never;
    window.history.replaceState(null, '', '/golf/dashboard/settings');
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    window.history.replaceState(null, '', '/');
  });

  it('is a picker row that shows the unit, and picking Meters writes the same preference', async () => {
    const user = show();
    await user.click(within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole('button', { name: /^Preferences/ }));
    const row = await screen.findByRole('button', { name: /Distance units/ });
    expect(row.textContent).toMatch(/Yards/);

    await user.click(row);
    const picker = await screen.findByRole('radiogroup', { name: 'Distance units' });
    await user.click(within(picker).getByRole('radio', { name: 'Meters' }));

    expect(localStorage.getItem(KEY)).toBe('meters');
    await waitFor(() => expect(screen.getByLabelText('Shot screen unit').textContent).toBe('meters'));
    expect(screen.getByRole('button', { name: /Distance units/ }).textContent).toMatch(/Meters/);
  });
});
