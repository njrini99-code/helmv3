import { LazyMotion, domAnimation } from 'motion/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Settings, Preferences: the time format (QUEUE doc-07, CH-8980). A device preference like the distance unit: the cookie
 * is what the server reads for its first frame, localStorage tells the other tabs, and every time on screen redraws at
 * once from the provider with no request. The checks are on that preference, on a reader of it (a server-written label
 * and a time field), and on the phone's picker row.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ getFeedback: () => undefined, addBreadcrumb: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));

import { ChClockProvider, useChClockText } from '../lib/use-clock';
import type { ChClock } from '../lib/clock-cookie';
import { ToastProvider } from '../ui/Toast';
import { TimeField } from '../ui/TimeField';
import { PhoneChromeProvider } from '../shell/phone-chrome';
import { SettingsView } from '../screens/settings/SettingsView';
import type { ChDevice, ChSettingsWrites } from '../screens/settings/model';
import { coachData } from '../preview/fixtures-settings';
import './dialog-polyfill';

const KEY = 'ch_clock';

/** A server-written 12-hour label, drawn the way the screens draw one. */
function Label({ text }: { text: string }) {
  return <output aria-label="Server label">{useChClockText()(text)}</output>;
}
function Field() {
  const [v, setV] = useState('15:30');
  return <TimeField label="Start time" value={v} onChange={setV} />;
}

const ok = () => Promise.resolve({ success: true });
const writes = (): ChSettingsWrites =>
  new Proxy({ refresh: vi.fn() } as unknown as ChSettingsWrites, { get: (t, k) => (k in t ? t[k as keyof ChSettingsWrites] : vi.fn(ok)) });
const device: ChDevice = { native: false, push: { status: 'unsubscribed', pending: false, subscribe: vi.fn(), unsubscribe: vi.fn() } as unknown as ChDevice['push'] };

function show(clock: ChClock = '12') {
  const user = userEvent.setup();
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <PhoneChromeProvider>
          <ChClockProvider clock={clock}>
            <div className="ch-root" data-ui="clubhouse">
              <Label text="Thu · 3:30 PM · Carolina Inn" />
              <Field />
              <SettingsView data={coachData()} writes={writes()} device={device} initialSection="preferences" onDeleted={vi.fn()} />
            </div>
          </ChClockProvider>
        </PhoneChromeProvider>
      </ToastProvider>
    </LazyMotion>,
  );
  return user;
}

const label = () => screen.getByLabelText('Server label').textContent;
const cookie = () => document.cookie.split('; ').find((c) => c.startsWith('ch_clock='));

beforeEach(() => {
  hapticSpy.mockClear();
  localStorage.clear();
  document.cookie = 'ch_clock=; path=/; max-age=0';
});

describe('Settings · Preferences · time format (CH-8980)', () => {
  it('shows 12-hour by default, and choosing 24-hour redraws every time on the screen at once', async () => {
    const user = show();
    const group = screen.getByRole('radiogroup', { name: 'Time format' });
    expect(within(group).getByRole('radio', { name: '12-hour' })).toBeChecked();
    expect(label()).toBe('Thu · 3:30 PM · Carolina Inn');
    expect((screen.getByLabelText('Start time') as HTMLInputElement).value).toBe('3:30 PM');

    await user.click(within(group).getByRole('radio', { name: '24-hour' }));

    expect(within(group).getByRole('radio', { name: '24-hour' })).toBeChecked();
    expect(label()).toBe('Thu · 15:30 · Carolina Inn');
    expect((screen.getByLabelText('Start time') as HTMLInputElement).value).toBe('15:30');
    expect(screen.getByText(/Times read 15:30/)).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('select');

    await user.click(within(group).getByRole('radio', { name: '12-hour' }));
    expect(label()).toBe('Thu · 3:30 PM · Carolina Inn');
  });

  it('writes the cookie the server reads and the key the other tabs hear', async () => {
    const user = show();
    await user.click(within(screen.getByRole('radiogroup', { name: 'Time format' })).getByRole('radio', { name: '24-hour' }));
    expect(cookie()).toBe('ch_clock=24');
    expect(localStorage.getItem(KEY)).toBe('24');
    await user.click(within(screen.getByRole('radiogroup', { name: 'Time format' })).getByRole('radio', { name: '12-hour' }));
    expect(cookie()).toBe('ch_clock=12');
    expect(localStorage.getItem(KEY)).toBe('12');
  });

  it('opens on the clock the server read from the cookie, with nothing flipping after hydration', () => {
    show('24');
    expect(within(screen.getByRole('radiogroup', { name: 'Time format' })).getByRole('radio', { name: '24-hour' })).toBeChecked();
    expect(label()).toBe('Thu · 15:30 · Carolina Inn');
  });

  it('follows a change made in another tab', async () => {
    show();
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: '24' }));
    });
    await waitFor(() => expect(label()).toBe('Thu · 15:30 · Carolina Inn'));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'something_else', newValue: '12' }));
    });
    expect(label()).toBe('Thu · 15:30 · Carolina Inn');
  });

  it('keeps working for the session when the device refuses to store it', async () => {
    const user = show();
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    try {
      await user.click(within(screen.getByRole('radiogroup', { name: 'Time format' })).getByRole('radio', { name: '24-hour' }));
      expect(label()).toBe('Thu · 15:30 · Carolina Inn');
      expect(cookie()).toBe('ch_clock=24');
    } finally {
      set.mockRestore();
    }
  });
});

describe('Settings · phone · Preferences · time format (CH-8980)', () => {
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

  it('is a picker row that shows the format, and picking 24-hour redraws the times', async () => {
    const user = show();
    await user.click(within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole('button', { name: /^Preferences/ }));
    const row = await screen.findByRole('button', { name: /Time format/ });
    expect(row.textContent).toMatch(/12-hour/);

    await user.click(row);
    const picker = await screen.findByRole('radiogroup', { name: 'Time format' });
    await user.click(within(picker).getByRole('radio', { name: '24-hour' }));

    expect(cookie()).toBe('ch_clock=24');
    expect(label()).toBe('Thu · 15:30 · Carolina Inn');
    expect(screen.getByRole('button', { name: /Time format/ }).textContent).toMatch(/24-hour/);
  });
});
