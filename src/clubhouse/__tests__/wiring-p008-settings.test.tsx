import { LazyMotion, domAnimation } from 'motion/react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * P008 wiring pass (2026-10-17): the two places Settings did not behave like production's Settings.
 * - Event reminders: the database refuses times out of order whether or not reminders are on, so switching them off
 *   with the times out of order must not send (Fairway's EventRemindersPanel checks the order unconditionally).
 * - Join a team: after Ask to join, the page reads again; the waiting request must replace the form then, as Fairway's
 *   JoinTeamSection re-reads its requests, not only once the section is reopened.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ getFeedback: () => undefined, addBreadcrumb: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));

import { ToastProvider } from '../ui/Toast';
import { SettingsView } from '../screens/settings/SettingsView';
import type { ChDevice, ChResult, ChSettingsData, ChSettingsSection, ChSettingsWrites } from '../screens/settings/model';
import { coachData, playerData, PREVIEW_STAFF } from '../preview/fixtures-settings';
import './dialog-polyfill';

const okw = (): Promise<ChResult> => Promise.resolve({ success: true });

function makeWrites(): ChSettingsWrites {
  return {
    saveProfile: vi.fn(okw),
    uploadAvatar: vi.fn(() => Promise.resolve({ success: true, data: { url: 'https://x.test/a.png' } })),
    changeEmail: vi.fn(okw),
    changePassword: vi.fn(okw),
    setDelivery: vi.fn(okw),
    setDigest: vi.fn(okw),
    setRoutingCell: vi.fn(okw),
    setRoutingAll: vi.fn(okw),
    setRoutingQuiet: vi.fn(okw),
    saveScoring: vi.fn(okw),
    saveReminders: vi.fn(okw),
    saveTeam: vi.fn(okw),
    regenerateCode: vi.fn(() => Promise.resolve({ success: true, data: { joinCode: 'R4T8W2PL' } })),
    saveGolf: vi.fn(okw),
    leaveTeam: vi.fn(okw),
    requestJoin: vi.fn(okw),
    cancelRequest: vi.fn(okw),
    setCoachHelmCoach: vi.fn(okw),
    setCoachHelmTeam: vi.fn(okw),
    savePhilosophy: vi.fn((id: string | null) => Promise.resolve({ success: true, data: { id: id ?? 'ph1' } })),
    deleteAccount: vi.fn(okw),
    signOut: vi.fn(() => Promise.resolve()),
    cleanupAfterDelete: vi.fn(() => Promise.resolve()),
    refresh: vi.fn(),
    staff: {
      list: vi.fn(() => Promise.resolve({ success: true, data: PREVIEW_STAFF.slice(0, 1) })),
      pending: vi.fn(() => Promise.resolve({ success: true, data: [] })),
      invite: vi.fn(() => Promise.resolve({ success: true, data: { token: 't', code: 'STAFF7QX', role: 'coach' as const, hours: 72 } })),
      approve: vi.fn(okw),
      decline: vi.fn(okw),
    },
  };
}

const device: ChDevice = {
  native: false,
  push: { status: 'unsupported', pending: false, subscribe: vi.fn(() => Promise.resolve({ ok: true })), unsubscribe: vi.fn(() => Promise.resolve({ ok: true })) },
};

function setup(data: ChSettingsData, section: ChSettingsSection) {
  const writes = makeWrites();
  const user = userEvent.setup();
  const view = (d: ChSettingsData) => (
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <SettingsView data={d} writes={writes} device={device} initialSection={section} onDeleted={vi.fn()} />
        </div>
      </ToastProvider>
    </LazyMotion>
  );
  const utils = render(view(data));
  // What router.refresh() does: the same page again, with a new read from the server.
  const serve = (d: ChSettingsData) => utils.rerender(view(d));
  return { writes, user, serve };
}

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);

describe('P008 wiring · event reminders', () => {
  it('times out of order are refused even with reminders switched off, and stay on screen to fix', async () => {
    const { user, writes } = setup(coachData(), 'team');
    const reminders = screen.getByRole('region', { name: 'Event reminders' });
    const [first, final] = within(reminders).getAllByRole('slider');
    fireEvent.change(first!, { target: { value: '2' } });
    fireEvent.change(final!, { target: { value: '720' } });
    await waitFor(() => expect(code('CH-8111')).not.toBeNull());

    await user.click(within(reminders).getByRole('switch', { name: 'Send reminders' }));
    expect(within(reminders).getByRole('switch', { name: 'Send reminders' })).not.toBeChecked();
    expect(code('CH-8111')?.textContent).toMatch(/before the final one/);
    expect(within(reminders).getAllByRole('slider')).toHaveLength(2);
    const save = within(reminders).getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    await user.click(save);
    expect(writes.saveReminders).not.toHaveBeenCalled();
  });

  it('switching reminders off with the times in order saves, and the times are hidden', async () => {
    const { user, writes } = setup(coachData(), 'team');
    const reminders = screen.getByRole('region', { name: 'Event reminders' });
    await user.click(within(reminders).getByRole('switch', { name: 'Send reminders' }));
    expect(within(reminders).queryAllByRole('slider')).toHaveLength(0);
    await user.click(within(reminders).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes.saveReminders).toHaveBeenCalledWith({ enabled: false, earlyHours: 24, lateMinutes: 60 }));
  });
});

describe('P008 wiring · join a team', () => {
  it('after Ask to join the fresh read shows the waiting request in place of the form', async () => {
    const { user, writes, serve } = setup(playerData(false, false), 'golf');
    await user.type(screen.getByLabelText('Team code'), 'abc123');
    await user.click(screen.getByRole('button', { name: 'Ask to join' }));
    await waitFor(() => expect(writes.requestJoin).toHaveBeenCalledWith('ABC123', ''));
    await waitFor(() => expect(writes.refresh).toHaveBeenCalledTimes(1));

    serve(playerData(false, true));
    await waitFor(() => expect(code('CH-8303')?.textContent).toMatch(/Waiting on Wake Forest Golf/));
    expect(screen.queryByRole('button', { name: 'Ask to join' })).toBeNull();
  });

  it('a cancelled request leaves the form again, and a later read without it keeps it gone', async () => {
    const { user, writes, serve } = setup(playerData(false, true), 'golf');
    await waitFor(() => expect(code('CH-8303')).not.toBeNull());
    await user.click(within(code('CH-8303') as HTMLElement).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(writes.cancelRequest).toHaveBeenCalledWith('rq1'));
    await waitFor(() => expect(code('CH-8303')).toBeNull());
    expect(screen.getByRole('button', { name: 'Ask to join' })).toBeTruthy();
    serve(playerData(false, false));
    expect(code('CH-8303')).toBeNull();
  });
});
