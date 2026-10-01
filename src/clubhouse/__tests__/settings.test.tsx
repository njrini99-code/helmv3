import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LazyMotion, domAnimation } from 'framer-motion';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrefsByCategory } from '@/lib/coachhelm/v3/notifications/router';

/**
 * Settings: every numbered state in docs/clubhouse/catalog/settings.md is
 * forced here and found by its number (data-ch-code). Writes are fakes, so a
 * failure is a failure of the write, not of the network.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
const track = vi.hoisted(() => ({ report: vi.fn(), trail: vi.fn() }));
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: track.report, chTrail: track.trail, chTagSession: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ getFeedback: () => undefined, addBreadcrumb: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { ToastProvider } from '../ui/Toast';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { SettingsView } from '../screens/settings/SettingsView';
import { SettingsSkeleton } from '../screens/settings/SettingsSkeleton';
import { parseSection, PRIORITY_LABEL, SECTIONS, type ChCoachHelmSettings, type ChDevice, type ChResult, type ChSettingsData, type ChSettingsSection, type ChSettingsWrites, type ChStaffWrites } from '../screens/settings/model';
import { coachData, failedRead, playerData, PREVIEW_STAFF } from '../preview/fixtures-settings';
import './dialog-polyfill';

beforeEach(() => {
  hapticSpy.mockClear();
  track.report.mockClear();
  track.trail.mockClear();
});

const fail = (error = 'nope'): Promise<ChResult> => Promise.resolve({ success: false, error });
const okw = (): Promise<ChResult> => Promise.resolve({ success: true });

function makeWrites(over: Partial<ChSettingsWrites> = {}): ChSettingsWrites {
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
    // The staff cards have their own tests (settings-staff.test.tsx); here a team of one, with nobody waiting.
    staff: {
      list: vi.fn(() => Promise.resolve({ success: true, data: PREVIEW_STAFF.slice(0, 1) })),
      pending: vi.fn(() => Promise.resolve({ success: true, data: [] })),
      invite: vi.fn(() => Promise.resolve({ success: true, data: { token: 't', code: 'STAFF7QX', role: 'coach' as const, hours: 72 } })),
      approve: vi.fn(okw),
      decline: vi.fn(okw),
    },
    ...over,
  };
}

function makeDevice(over: Partial<ChDevice['push']> = {}): ChDevice {
  return {
    native: true,
    push: { status: 'unsubscribed', pending: false, subscribe: vi.fn(() => Promise.resolve({ ok: true })), unsubscribe: vi.fn(() => Promise.resolve({ ok: true })), ...over },
  };
}

function setup(opts: { data?: ChSettingsData; writes?: Partial<ChSettingsWrites>; section?: ChSettingsSection; device?: ChDevice; onDeleted?: () => void } = {}) {
  const writes = makeWrites(opts.writes);
  const device = opts.device ?? makeDevice();
  const onDeleted = opts.onDeleted ?? vi.fn();
  const user = userEvent.setup();
  const view = (data: ChSettingsData) => (
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <SettingsView data={data} writes={writes} device={device} initialSection={opts.section ?? 'account'} onDeleted={onDeleted} />
        </div>
      </ToastProvider>
    </LazyMotion>
  );
  const utils = render(view(opts.data ?? coachData()));
  // What router.refresh() does: the same page again, with a new read from the server.
  const serve = (data: ChSettingsData) => utils.rerender(view(data));
  return { ...utils, writes, user, serve };
}

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
const card = (name: string) => screen.getByRole('region', { name });

describe('Settings · 80xx error toasts', () => {
  it('CH-8001 profile save fails', async () => {
    const { user } = setup({ writes: { saveProfile: vi.fn(() => fail()) } });
    const name = screen.getByLabelText('Full name');
    await user.clear(name);
    await user.type(name, 'Maya R');
    await user.click(within(card('Profile')).getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-8001', /Couldn't save your profile/);
  });

  it('CH-8002 photo upload is rejected', async () => {
    setup({ writes: { uploadAvatar: vi.fn(() => Promise.resolve({ success: false, error: 'Photos must be under 2 MB.' })) } });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'big.png', { type: 'image/png' })] } });
    });
    await expectCode('CH-8002', /under 2 MB/);
  });

  it('CH-8003 email change fails', async () => {
    const { user } = setup({ writes: { changeEmail: vi.fn(() => fail()) } });
    await user.type(screen.getByLabelText('New email'), 'new@unc.edu');
    await user.click(screen.getByRole('button', { name: 'Send confirmation' }));
    await expectCode('CH-8003', /Couldn't start the email change/);
  });

  it('CH-8004 password change fails with the reason', async () => {
    const { user } = setup({ writes: { changePassword: vi.fn(() => fail('Your current password is incorrect.')) } });
    await user.type(screen.getByLabelText('Current password'), 'old-pass');
    await user.type(screen.getByLabelText('New password'), 'new-password');
    await user.type(screen.getByLabelText('Confirm new password'), 'new-password');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    await expectCode('CH-8004', /incorrect/);
  });

  it('CH-8005 81302 an email or push switch fails and flips back', async () => {
    const { user } = setup({ section: 'notifications', writes: { setDelivery: vi.fn(() => fail()) } });
    const sw = screen.getByRole('switch', { name: 'Messages by email' });
    expect(sw).toBeChecked();
    await user.click(sw);
    await expectCode('CH-8005', /Couldn't change messages email/);
    expect(screen.getByRole('switch', { name: 'Messages by email' })).toBeChecked();
  });

  it('CH-8006 weekly team email fails', async () => {
    const { user } = setup({ section: 'notifications', writes: { setDigest: vi.fn(() => fail()) } });
    await user.click(screen.getByRole('switch', { name: 'Weekly team email' }));
    await expectCode('CH-8006', /weekly email/);
  });

  it('CH-8007 push on this device fails', async () => {
    const { user } = setup({ section: 'notifications', device: makeDevice({ subscribe: vi.fn(() => Promise.resolve({ ok: false, error: 'Blocked by the browser.' })) }) });
    await user.click(screen.getByRole('switch', { name: 'Push on this device' }));
    await expectCode('CH-8007', /Couldn't turn on push here/);
  });

  it('CH-8008 a CoachHelm update switch fails (player)', async () => {
    const { user } = setup({ data: playerData(true), section: 'notifications', writes: { setRoutingCell: vi.fn(() => fail()) } });
    await user.click(screen.getByRole('switch', { name: 'New insight, push' }));
    await expectCode('CH-8008', /new insight/);
  });

  it('CH-8009 mute push fails (player)', async () => {
    const { user } = setup({ data: playerData(true), section: 'notifications', writes: { setRoutingAll: vi.fn(() => fail()) } });
    await user.click(screen.getByRole('button', { name: 'Mute push' }));
    await expectCode('CH-8009', /Couldn't mute push/);
  });

  it('CH-8010 CoachHelm quiet mode fails (player)', async () => {
    const { user } = setup({ data: playerData(true), section: 'notifications', writes: { setRoutingQuiet: vi.fn(() => fail()) } });
    await user.click(screen.getByRole('switch', { name: 'Quiet mode for CoachHelm' }));
    await expectCode('CH-8010', /quiet mode/);
  });

  it('CH-8011 team details save fails', async () => {
    const { user } = setup({ section: 'team', writes: { saveTeam: vi.fn(() => fail()) } });
    await user.type(screen.getByLabelText('Team name'), ' A');
    await user.click(within(card('Team details')).getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-8011', /team details/);
  });

  it('CH-8012 a new invite code fails and the old one stays', async () => {
    const { user } = setup({ section: 'team', writes: { regenerateCode: vi.fn(() => Promise.resolve({ success: false, error: 'nope' })) } });
    await user.click(within(card('Invite players')).getByRole('button', { name: 'Make a new code' }));
    await user.click(within(code('CH-8503') as HTMLElement).getByRole('button', { name: 'Make a new code' }));
    await expectCode('CH-8012', /invite code/);
    expect(screen.getByText('K7M2Q9XA')).toBeTruthy();
  });

  it('CH-8013 copying fails', async () => {
    const { user } = setup({ section: 'team' });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) } });
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    await expectCode('CH-8013', /Couldn't copy/);
  });

  it('CH-8014 scoring save fails', async () => {
    const { user } = setup({ section: 'team', writes: { saveScoring: vi.fn(() => fail()) } });
    await user.click(screen.getByRole('radio', { name: 'Match play' }));
    await user.click(within(card('Scoring and format')).getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-8014', /scoring settings/);
  });

  it('CH-8015 reminder schedule save fails', async () => {
    const { user } = setup({ section: 'team', writes: { saveReminders: vi.fn(() => fail()) } });
    await user.click(screen.getByRole('switch', { name: 'Send reminders' }));
    await user.click(within(card('Event reminders')).getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-8015', /reminder schedule/);
  });

  it('CH-8016 golf details save fails (player)', async () => {
    const { user } = setup({ data: playerData(true), section: 'golf', writes: { saveGolf: vi.fn(() => fail()) } });
    const h = screen.getByLabelText('Handicap');
    await user.clear(h);
    await user.type(h, '3.1');
    await user.click(within(card('Golf details')).getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-8016', /golf details/);
  });

  it('CH-8017 leaving the team fails (player)', async () => {
    const { user } = setup({ data: playerData(true), section: 'golf', writes: { leaveTeam: vi.fn(() => fail()) } });
    await user.click(screen.getByRole('button', { name: 'Leave team' }));
    await user.click(within(code('CH-8502') as HTMLElement).getByRole('button', { name: 'Leave team' }));
    await expectCode('CH-8017', /leave the team/);
  });

  it('CH-8018 a join request fails (player, no team)', async () => {
    const { user } = setup({ data: playerData(false, false), section: 'golf', writes: { requestJoin: vi.fn(() => fail('That code does not match a team.')) } });
    await user.type(screen.getByLabelText('Invite code'), 'abc123');
    await user.click(screen.getByRole('button', { name: 'Ask to join' }));
    await expectCode('CH-8018', /does not match a team/);
  });

  it('CH-8019 cancelling a join request fails', async () => {
    const { user } = setup({ data: playerData(false, true), section: 'golf', writes: { cancelRequest: vi.fn(() => fail()) } });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await expectCode('CH-8019', /cancel the request/);
  });

  it('CH-8020 81302 a CoachHelm dashboard switch fails', async () => {
    const { user } = setup({ section: 'coachhelm', writes: { setCoachHelmCoach: vi.fn(() => fail()) } });
    await user.click(screen.getByRole('switch', { name: 'Insights' }));
    await expectCode('CH-8020', /insights/);
    expect(screen.getByRole('switch', { name: 'Insights' })).toBeChecked();
  });

  it('CH-8021 the team CoachHelm switch fails (head coach)', async () => {
    const { user } = setup({ section: 'coachhelm', writes: { setCoachHelmTeam: vi.fn(() => fail()) } });
    await user.click(screen.getByRole('switch', { name: 'CoachHelm for the whole team' }));
    await expectCode('CH-8021', /for the team/);
  });

  it('CH-8022 81302 a CoachHelm setting fails and reverts', async () => {
    const { user } = setup({ section: 'coachhelm', writes: { savePhilosophy: vi.fn(() => Promise.resolve({ success: false, error: 'nope' })) } });
    const sw = screen.getByRole('switch', { name: 'Performance plateau' });
    expect(sw).not.toBeChecked();
    await user.click(sw);
    await expectCode('CH-8022', /CoachHelm setting/);
    expect(screen.getByRole('switch', { name: 'Performance plateau' })).not.toBeChecked();
    expect(code('CH-8405')!.textContent).toMatch(/didn't save/);
  });

  it('CH-8023 deleting the account fails', async () => {
    const { user } = setup({ writes: { deleteAccount: vi.fn(() => fail('Your account has recorded data that must be reassigned by an admin.')) } });
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    const dialog = code('CH-8501') as HTMLElement;
    await user.type(within(dialog).getByLabelText('Type delete to confirm'), 'delete');
    await user.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    await expectCode('CH-8023', /reassigned by an admin/);
  });

  it('CH-8024 sign out fails', async () => {
    const { user } = setup({ writes: { signOut: vi.fn(() => Promise.reject(new Error('network'))) } });
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await expectCode('CH-8024', /sign you out/);
  });

  it('CH-8025 report a problem falls back to email', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Report a problem/ }));
    await expectCode('CH-8025', /Opening email/);
  });
});

describe('Settings · 81xx validation', () => {
  it('CH-8101 a coach clears their name', async () => {
    const { user } = setup();
    await user.clear(screen.getByLabelText('Full name'));
    await expectCode('CH-8101', /Add your name/);
    expect(within(card('Profile')).getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('CH-8102 a player clears their first name', async () => {
    const { user } = setup({ data: playerData(true) });
    await user.clear(screen.getByLabelText('First name'));
    await expectCode('CH-8102', /first and last name/);
  });

  it('CH-8103 and CH-8104 new email checks', async () => {
    const { user, writes } = setup();
    await user.type(screen.getByLabelText('New email'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Send confirmation' }));
    await expectCode('CH-8103', /valid email/);
    await user.clear(screen.getByLabelText('New email'));
    await user.type(screen.getByLabelText('New email'), 'MAYA.REYES@unc.edu');
    await expectCode('CH-8104', /already your email/);
    expect(writes.changeEmail).not.toHaveBeenCalled();
  });

  it.each([
    ['CH-8105', '', 'new-password', 'new-password', /current password/],
    ['CH-8106', 'old', 'short', 'short', /8 characters/],
    ['CH-8107', 'old', 'new-password', 'other-password', /don't match/],
  ])('%s password checks', async (c, cur, next, confirm, text) => {
    const { user, writes } = setup();
    if (cur) await user.type(screen.getByLabelText('Current password'), cur);
    await user.type(screen.getByLabelText('New password'), next);
    await user.type(screen.getByLabelText('Confirm new password'), confirm);
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    await expectCode(c, text);
    expect(writes.changePassword).not.toHaveBeenCalled();
    expect(hapticSpy).toHaveBeenCalledWith('warning');
  });

  it.each([
    ['CH-8108', 'Team name', '', /team needs a name/],
    ['CH-8109', 'Name', '', /school needs a name/],
    ['CH-8110', 'State', 'N', /two-letter/],
  ])('%s team details checks', async (c, label, value, text) => {
    const { user } = setup({ section: 'team' });
    const f = screen.getByLabelText(label);
    await user.clear(f);
    if (value) await user.type(f, value);
    await expectCode(c, text);
  });

  it('CH-8111 the first reminder must come first', async () => {
    setup({ section: 'team' });
    const [first] = screen.getAllByRole('slider');
    fireEvent.change(first!, { target: { value: '1' } });
    fireEvent.change(first!, { target: { value: '2' } });
    const final = screen.getAllByRole('slider')[1]!;
    fireEvent.change(final, { target: { value: '720' } });
    await expectCode('CH-8111', /before the final one/);
  });

  it.each([
    ['CH-8112', 'Handicap', '60', /Handicap must be/],
    ['CH-8113', 'Handicap index', '-20', /Handicap index must be/],
    ['CH-8114', 'Graduation year', '27', /Graduation year/],
    ['CH-8115', 'State', 'N', /two-letter/],
  ])('%s golf details checks', async (c, label, value, text) => {
    const { user } = setup({ data: playerData(true), section: 'golf' });
    const f = screen.getByLabelText(label);
    await user.clear(f);
    await user.type(f, value);
    await expectCode(c, text);
  });
});

describe('Settings · 82xx didn\'t load', () => {
  it.each([
    ['CH-8201', 'account', { profile: failedRead }, /Your profile didn't load/],
    ['CH-8202', 'notifications', { delivery: failedRead }, /email and push settings didn't load/],
    ['CH-8204', 'notifications', { digest: failedRead }, /didn't load/],
    ['CH-8205', 'team', { team: failedRead }, /Team details didn't load/],
    ['CH-8206', 'team', { joinCode: failedRead }, /invite code didn't load/],
    ['CH-8207', 'team', { scoring: failedRead }, /Scoring settings didn't load/],
    ['CH-8208', 'team', { reminders: failedRead }, /Event reminders didn't load/],
    ['CH-8211', 'coachhelm', { coachhelm: failedRead }, /CoachHelm settings didn't load/],
  ] as const)('%s coach section read fails', async (c, section, patch, text) => {
    setup({ data: { ...coachData(), ...patch }, section });
    await expectCode(c, text);
  });

  it.each([
    ['CH-8203', 'notifications', { playerRouting: failedRead }, /CoachHelm update settings didn't load/],
    ['CH-8209', 'golf', { golf: failedRead }, /golf details didn't load/],
    ['CH-8210', 'golf', { membership: failedRead }, /team membership didn't load/],
  ] as const)('%s player section read fails', async (c, section, patch, text) => {
    setup({ data: { ...playerData(true), ...patch }, section });
    await expectCode(c, text);
  });

  it('CH-8212 a section that crashes is contained', async () => {
    const boom = { ...coachData(), delivery: { value: null as unknown as Record<string, boolean>, error: false as const } };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setup({ data: boom, section: 'notifications' });
    await expectCode('CH-8212', /Notifications couldn.t be shown/);
    expect(screen.getByRole('navigation', { name: 'Settings sections' })).toBeTruthy();
    spy.mockRestore();
  });
});

describe('Settings · 83xx empty', () => {
  it('CH-8301 a coach without a team', async () => {
    setup({ data: { ...coachData(), teamId: null, team: null, joinCode: null, scoring: null, reminders: null }, section: 'team' });
    await expectCode('CH-8301', /aren't on a team yet/);
  });
  it('CH-8302 a player without a team can ask to join', async () => {
    setup({ data: playerData(false, false), section: 'golf' });
    await expectCode('CH-8302', /Join a team/);
    expect(screen.getByRole('button', { name: 'Ask to join' })).toBeTruthy();
  });
  it('CH-8303 a pending join request', async () => {
    setup({ data: playerData(false, true), section: 'golf' });
    await expectCode('CH-8303', /Waiting on Wake Forest Golf/);
  });
  it('CH-8304 no photo shows the monogram', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Add photo' })).toBeTruthy();
    expect(document.querySelector('.ch-set-photo .ch-avatar')?.textContent).toBe('MR');
  });
});

describe('Settings · 84xx loading', () => {
  it('CH-8401 the page skeleton', () => {
    render(<SettingsSkeleton />);
    expect(code('CH-8401')?.getAttribute('aria-busy')).toBe('true');
  });

  it('CH-8402 a form shows Saving… and cannot double submit', async () => {
    let resolve: (v: ChResult) => void = () => {};
    const saveProfile = vi.fn(() => new Promise<ChResult>((r) => (resolve = r)));
    const { user } = setup({ writes: { saveProfile } });
    await user.type(screen.getByLabelText('Full name'), 's');
    await user.click(within(card('Profile')).getByRole('button', { name: 'Save changes' }));
    const busy = within(card('Profile')).getByRole('button', { name: 'Saving…' });
    expect(busy).toBeDisabled();
    expect(code('CH-8402')).not.toBeNull();
    await act(async () => resolve({ success: true }));
    expect(saveProfile).toHaveBeenCalledTimes(1);
  });

  it('CH-8403 a saving switch holds and cannot be flipped again', async () => {
    let resolve: (v: ChResult) => void = () => {};
    const { user } = setup({ section: 'notifications', writes: { setDelivery: vi.fn(() => new Promise<ChResult>((r) => (resolve = r))) } });
    await user.click(screen.getByRole('switch', { name: 'Tasks by push' }));
    const sw = screen.getByRole('switch', { name: 'Tasks by push' });
    expect(sw).toBeDisabled();
    expect(sw).not.toBeChecked();
    expect(code('CH-8403')).not.toBeNull();
    await act(async () => resolve({ success: true }));
  });

  it('CH-8405 CoachHelm autosave status', async () => {
    const { user } = setup({ section: 'coachhelm' });
    expect(code('CH-8405')!.textContent).toMatch(/save as you make them/);
    await user.click(screen.getByRole('switch', { name: 'Performance plateau' }));
    await waitFor(() => expect(code('CH-8405')!.textContent).toMatch(/All changes saved/));
  });
});

describe('Settings · 85xx confirm', () => {
  it('CH-8501 delete needs "delete" typed', async () => {
    const { user, writes } = setup();
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    const dialog = code('CH-8501') as HTMLElement;
    const confirm = within(dialog).getByRole('button', { name: 'Delete account' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Type delete to confirm'), 'delete');
    expect(confirm).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Keep my account' }));
    expect(writes.deleteAccount).not.toHaveBeenCalled();
  });

  it('CH-8502 leave team asks first', async () => {
    const { user, writes } = setup({ data: playerData(true), section: 'golf' });
    await user.click(screen.getByRole('button', { name: 'Leave team' }));
    await expectCode('CH-8502', /Leave Varsity/);
    await user.click(screen.getByRole('button', { name: 'Stay on the team' }));
    expect(writes.leaveTeam).not.toHaveBeenCalled();
  });

  it('CH-8503 a new invite code asks first', async () => {
    const { user, writes } = setup({ section: 'team' });
    await user.click(within(card('Invite players')).getByRole('button', { name: 'Make a new code' }));
    await expectCode('CH-8503', /K7M2Q9XA stops working/);
    await user.click(screen.getByRole('button', { name: 'Keep this code' }));
    expect(writes.regenerateCode).not.toHaveBeenCalled();
  });

  it('CH-8504 reset CoachHelm updates asks first', async () => {
    const { user, writes } = setup({ data: playerData(true), section: 'notifications' });
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await expectCode('CH-8504', /Reset CoachHelm updates/);
    expect(writes.setRoutingAll).not.toHaveBeenCalled();
  });

  it('CH-8505 turning CoachHelm off asks first', async () => {
    const { user, writes } = setup({ section: 'coachhelm' });
    await user.click(screen.getByRole('switch', { name: 'CoachHelm on your dashboards' }));
    await expectCode('CH-8505', /Turn off CoachHelm/);
    expect(writes.setCoachHelmCoach).not.toHaveBeenCalled();
  });

  it('CH-8506 and CH-8508 leaving with unsaved changes', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Full name'), 'x');
    const before = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(true);
    expect(document.documentElement.dataset.chGuard).toBe('CH-8508');
    const a = document.createElement('a');
    a.href = '/golf/dashboard/roster';
    a.textContent = 'Roster';
    document.body.appendChild(a);
    await user.click(a);
    await expectCode('CH-8506', /Leave without saving/);
    a.remove();
  });

  it('CH-8507 switching section with unsaved changes', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Full name'), 'x');
    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    await expectCode('CH-8507', /changes in this section/);
  });
});

describe('Settings · motion, haptics, accessibility', () => {
  it('CH-8608 animations off makes Clubhouse motion instant', async () => {
    const { user } = setup({ section: 'preferences' });
    await user.click(screen.getByRole('switch', { name: 'Animations' }));
    const saved = JSON.parse(localStorage.getItem('golf_appearance_preferences') ?? '{}');
    expect(saved.show_animations).toBe(false);
    await user.click(screen.getByRole('switch', { name: 'Animations' }));
  });

  it('CH-8701 CH-8702 CH-8703 80902 a switch ticks, a save that lands is silent, a failure has the error pattern (D-70)', async () => {
    const setDelivery = vi.fn().mockImplementationOnce(okw).mockImplementationOnce(() => fail());
    const { user } = setup({ section: 'notifications', writes: { setDelivery } });
    await user.click(screen.getByRole('switch', { name: 'Tasks by push' }));
    await waitFor(() => expect(setDelivery).toHaveBeenCalledTimes(1));
    // Let the landed save finish before asserting it stayed silent.
    await act(async () => {
      await setDelivery.mock.results[0]?.value;
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(hapticSpy).not.toHaveBeenCalledWith('success');
    expect(hapticSpy).not.toHaveBeenCalledWith('commit');
    // ... and no toast: the switch already showed the new position.
    expect(document.querySelector('.ch-toast')).toBeNull();
    await user.click(screen.getByRole('switch', { name: 'Tasks by email' }));
    await waitFor(() => expect(hapticSpy).toHaveBeenCalledWith('error'));
  });

  it('CH-8704 warning before delete', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(hapticSpy).toHaveBeenCalledWith('warning');
  });

  it('CH-8705 success on copy', async () => {
    const { user } = setup({ section: 'team' });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(() => Promise.resolve()) } });
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(hapticSpy).toHaveBeenCalledWith('success'));
  });

  it('CH-8707 turning Haptics back on gives one more selection tick, and the switch is only in the app', async () => {
    const web = setup({ section: 'preferences', device: { ...makeDevice(), native: false } });
    expect(screen.queryByRole('switch', { name: 'Haptics' })).toBeNull();
    web.unmount();
    const { user } = setup({ section: 'preferences' });
    const sw = screen.getByRole('switch', { name: 'Haptics' });
    expect(sw).toBeChecked();
    hapticSpy.mockClear();
    await user.click(sw);
    expect(sw).not.toBeChecked();
    expect(hapticSpy.mock.calls.filter(([k]) => k === 'select')).toHaveLength(1);
    hapticSpy.mockClear();
    await user.click(sw);
    expect(sw).toBeChecked();
    expect(hapticSpy.mock.calls.filter(([k]) => k === 'select')).toHaveLength(2);
  });

  it('CH-8801 the section list is navigation with the current section marked', () => {
    setup({ section: 'team' });
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(nav).getByRole('button', { name: /Team/ }).getAttribute('aria-current')).toBe('page');
  });

  it('CH-8802 every switch has a name', () => {
    for (const section of ['notifications', 'coachhelm', 'team', 'preferences'] as const) {
      const { unmount } = setup({ section });
      for (const sw of screen.getAllByRole('switch')) expect(sw).toHaveAccessibleName();
      unmount();
    }
  });

  it('CH-8803 save status is announced', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Full name'), 'x');
    const status = within(card('Profile')).getByText('Unsaved changes').closest('[aria-live]');
    expect(status?.getAttribute('aria-live')).toBe('polite');
  });

  it('CH-8804 errors are alerts', async () => {
    const { user } = setup({ writes: { saveProfile: vi.fn(() => fail()) } });
    await user.type(screen.getByLabelText('Full name'), 'x');
    await user.click(within(card('Profile')).getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-8001');
    expect(code('CH-8001')!.getAttribute('role')).toBe('alert');
  });

  it('CH-8805 notification grids are tables', () => {
    setup({ data: playerData(true), section: 'notifications' });
    expect(screen.getByRole('table', { name: 'Email and push by kind of update' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'CoachHelm updates by channel' })).toBeTruthy();
  });

  it('CH-8807 fields are labelled and their errors described', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('New email'), 'nope');
    await user.tab();
    const f = screen.getByLabelText('New email');
    await waitFor(() => expect(f.getAttribute('aria-invalid')).toBe('true'));
    expect(f).toHaveAccessibleDescription(/valid email/);
  });
});

// ── Contracts with no catalog row: docs/clubhouse/pages/P008-settings/CONTRACT.md, named by their Bridge ID ──

const ok = <T,>(value: T) => ({ value, error: false as const });
const nav = () => screen.getByRole('navigation', { name: 'Settings sections' });
type User = ReturnType<typeof userEvent.setup>;
const openSection = (user: User, name: RegExp) => user.click(within(nav()).getByRole('button', { name }));

function assistantData(): ChSettingsData {
  const d = coachData();
  const ch = (d.coachhelm as { value: ChCoachHelmSettings }).value;
  return { ...d, coachhelm: ok({ ...ch, team: { enabled: true, disabledAt: null, isHeadCoach: false } }) };
}

/** The browser reports no network for as long as the test runs. */
function goOffline() {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
  return () => {
    delete (window.navigator as unknown as Record<string, unknown>).onLine;
  };
}

describe('Settings · opening and permission', () => {
  it('80101 opens with the role, team and email, the rail and the first card, and needs no team', () => {
    setup({ data: { ...coachData(), teamId: null, teamName: null, team: null, joinCode: null, scoring: null, reminders: null } });
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
    expect(document.querySelector('.ch-set-head p')?.textContent).toBe('Coach · maya.reyes@unc.edu');
    expect(within(nav()).getAllByRole('button')).toHaveLength(5);
    expect(card('Profile')).toBeTruthy();
  });

  it('80801 the rail lists the sections the role has, and a section it does not have opens Account', () => {
    const labels = () => within(nav()).getAllByRole('button').map((b) => b.querySelector('b')?.textContent);
    const coach = setup();
    expect(labels()).toEqual(['Account', 'Notifications', 'Team', 'CoachHelm', 'Preferences']);
    coach.unmount();
    setup({ data: playerData(true) });
    expect(labels()).toEqual(['Account', 'Golf profile', 'Notifications', 'Preferences']);
    expect(SECTIONS.player.map((s) => s.id)).not.toContain('coachhelm');
    expect(SECTIONS.player.map((s) => s.id)).not.toContain('team');
    expect(SECTIONS.coach.map((s) => s.id)).not.toContain('golf');
    expect(parseSection('coachhelm', 'player')).toBe('account');
    expect(parseSection('team', 'player')).toBe('account');
    expect(parseSection('golf', 'coach')).toBe('account');
    expect(parseSection('nope', 'coach')).toBe('account');
    expect(parseSection('coachhelm', 'coach')).toBe('coachhelm');
    expect(parseSection('golf', 'player')).toBe('golf');
  });

  it('80102 choosing a section puts it in the address, so every section can be linked', async () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    const { user } = setup();
    await openSection(user, /^Team/);
    expect(replace).toHaveBeenLastCalledWith(null, '', '/golf/dashboard/settings?section=team');
    await openSection(user, /^CoachHelm/);
    expect(replace).toHaveBeenLastCalledWith(null, '', '/golf/dashboard/settings?section=coachhelm');
    replace.mockRestore();
  });

  it('80804 an assistant coach cannot change the team CoachHelm switch, and is told why', async () => {
    const { user, writes } = setup({ data: assistantData(), section: 'coachhelm' });
    const sw = screen.getByRole('switch', { name: 'CoachHelm for the whole team' });
    expect(sw).toBeDisabled();
    expect(screen.getByText('Only the head coach can change this.')).toBeTruthy();
    await user.click(sw);
    expect(writes.setCoachHelmTeam).not.toHaveBeenCalled();
  });

  it('80805 an assistant coach still gets the team cards; a write the database refuses reads as that card failing', async () => {
    const { user } = setup({ data: assistantData(), section: 'team', writes: { saveTeam: vi.fn(() => fail('permission denied for table golf_teams')) } });
    for (const name of ['Team details', 'Invite players', 'Scoring and format', 'Event reminders']) expect(card(name)).toBeTruthy();
    await user.type(screen.getByLabelText('Team name'), ' A');
    await user.click(within(card('Team details')).getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-8011', /Couldn.t save team details/);
    expect(code('CH-8011')!.textContent).toMatch(/access to do this/);
  });
});

describe('Settings · saving', () => {
  it('80901 a save that lands: a toast names it, the success haptic fires and the card says Saved', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Full name'), 's');
    await user.click(within(card('Profile')).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Profile saved')).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('success');
    expect(await within(card('Profile')).findByText('Saved')).toBeTruthy();
    expect(within(card('Profile')).getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('80902 a CoachHelm autosave that lands is silent too: no toast, no success haptic, and the status line says All changes saved', async () => {
    const { user } = setup({ section: 'coachhelm' });
    await user.click(screen.getByRole('switch', { name: 'Performance plateau' }));
    await waitFor(() => expect(code('CH-8405')!.textContent).toMatch(/All changes saved/));
    expect(document.querySelector('.ch-toast')).toBeNull();
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(hapticSpy).not.toHaveBeenCalledWith('success');
  });

  it('80903 once the account is deleted the toast says so and the page hands over to the clean-up', async () => {
    const onDeleted = vi.fn();
    const { user, writes } = setup({ onDeleted });
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    const dialog = code('CH-8501') as HTMLElement;
    await user.type(within(dialog).getByLabelText('Type delete to confirm'), 'delete');
    await user.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(writes.deleteAccount).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Your account was deleted')).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('success');
  });

  it('81205 a save that fails keeps what was typed, and Retry sends the same values again', async () => {
    const saveProfile = vi.fn().mockImplementationOnce(() => fail()).mockImplementation(okw);
    const { user } = setup({ writes: { saveProfile } });
    const name = screen.getByLabelText('Full name');
    await user.clear(name);
    await user.type(name, 'Maya R');
    await user.click(within(card('Profile')).getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-8001');
    expect(name).toHaveValue('Maya R');
    expect(within(card('Profile')).getByRole('button', { name: 'Save changes' })).toBeEnabled();
    expect(await within(card('Profile')).findByText('Unsaved changes')).toBeTruthy();
    await user.click(within(code('CH-8001') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(2));
    expect(saveProfile.mock.calls[1]).toEqual(saveProfile.mock.calls[0]);
    expect(await screen.findByText('Profile saved')).toBeTruthy();
  });

  it('81205 Retry that lands after the person kept typing does not overwrite the newer typing, which stays as an unsaved edit', async () => {
    const saveProfile = vi.fn().mockImplementationOnce(() => fail()).mockImplementation(okw);
    const { user } = setup({ writes: { saveProfile } });
    const name = screen.getByLabelText('Full name');
    await user.clear(name);
    await user.type(name, 'Maya R');
    await user.click(within(card('Profile')).getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-8001');
    await user.type(name, 'eyes');
    await user.click(within(code('CH-8001') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(2));
    expect(saveProfile.mock.calls[1]![0]).toMatchObject({ fullName: 'Maya R' });
    await screen.findByText('Profile saved');
    expect(name).toHaveValue('Maya Reyes');
    expect(await within(card('Profile')).findByText('Unsaved changes')).toBeTruthy();
    expect(within(card('Profile')).getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('81402 Retry on a save that failed finishes it the way the button does: the card is clean, the new code shows, the dialog closes', async () => {
    const saveProfile = vi.fn().mockImplementationOnce(() => fail()).mockImplementation(okw);
    const regenerateCode = vi.fn().mockImplementationOnce(() => fail()).mockImplementation(() => Promise.resolve({ success: true, data: { joinCode: 'R4T8W2PL' } }));
    const { user, writes } = setup({ writes: { saveProfile, regenerateCode } });
    await user.type(screen.getByLabelText('Full name'), 's');
    await user.click(within(card('Profile')).getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-8001');
    await user.click(within(code('CH-8001') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(within(card('Profile')).queryByText('Unsaved changes')).toBeNull());
    expect(within(card('Profile')).getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(writes.refresh).toHaveBeenCalledTimes(1);

    await openSection(user, /^Team/);
    await screen.findByRole('region', { name: 'Invite players' });
    await user.click(within(card('Invite players')).getByRole('button', { name: 'Make a new code' }));
    await user.click(within(code('CH-8503') as HTMLElement).getByRole('button', { name: 'Make a new code' }));
    await expectCode('CH-8012');
    await user.click(within(code('CH-8012') as HTMLElement).getByRole('button', { name: 'Retry' }));
    expect(await within(card('Invite players')).findByText('R4T8W2PL')).toBeTruthy();
    expect(within(card('Invite players')).queryByText('K7M2Q9XA')).toBeNull();
  });

  it('81402 Retry on a switch that failed flips it again and sends the same value', async () => {
    const setDelivery = vi.fn().mockImplementationOnce(() => fail()).mockImplementation(okw);
    const { user } = setup({ section: 'notifications', writes: { setDelivery } });
    await user.click(screen.getByRole('switch', { name: 'Tasks by push' }));
    await expectCode('CH-8005');
    expect(screen.getByRole('switch', { name: 'Tasks by push' })).toBeChecked();
    await user.click(within(code('CH-8005') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(setDelivery).toHaveBeenCalledTimes(2));
    expect(setDelivery.mock.calls[1]).toEqual(setDelivery.mock.calls[0]);
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Tasks by push' })).not.toBeChecked());
  });

  it('81302 a switch that fails goes back on its own, without undoing another one flipped meanwhile', async () => {
    let failFirst: (v: ChResult) => void = () => {};
    const setCoachHelmCoach = vi.fn().mockImplementationOnce(() => new Promise<ChResult>((r) => (failFirst = r))).mockImplementation(okw);
    const { user } = setup({ section: 'coachhelm', writes: { setCoachHelmCoach } });
    await user.click(screen.getByRole('switch', { name: 'Insights' }));
    await user.click(screen.getByRole('switch', { name: 'Predictions' }));
    await waitFor(() => expect(setCoachHelmCoach).toHaveBeenCalledTimes(2));
    await act(async () => failFirst({ success: false, error: 'nope' }));
    await expectCode('CH-8020', /insights/);
    expect(screen.getByRole('switch', { name: 'Insights' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Predictions' })).not.toBeChecked();
  });

  it('81501 a save that changes what the server renders asks for a fresh read, and a failed one does not', async () => {
    const failing = setup({ writes: { saveProfile: vi.fn(() => fail()) } });
    await failing.user.type(screen.getByLabelText('Full name'), 'x');
    await failing.user.click(within(card('Profile')).getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-8001');
    expect(failing.writes.refresh).not.toHaveBeenCalled();
    failing.unmount();

    const profile = setup();
    await profile.user.type(screen.getByLabelText('Full name'), 'x');
    await profile.user.click(within(card('Profile')).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(profile.writes.refresh).toHaveBeenCalledTimes(1));
    profile.unmount();

    const team = setup({ section: 'team' });
    await team.user.type(screen.getByLabelText('Team name'), ' A');
    await team.user.click(within(card('Team details')).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(team.writes.refresh).toHaveBeenCalledTimes(1));
    team.unmount();

    const leave = setup({ data: playerData(true), section: 'golf' });
    await leave.user.click(screen.getByRole('button', { name: 'Leave team' }));
    await leave.user.click(within(code('CH-8502') as HTMLElement).getByRole('button', { name: 'Leave team' }));
    await waitFor(() => expect(leave.writes.refresh).toHaveBeenCalledTimes(1));
    leave.unmount();

    const join = setup({ data: playerData(false, false), section: 'golf' });
    await join.user.type(screen.getByLabelText('Invite code'), 'abc123');
    await join.user.click(screen.getByRole('button', { name: 'Ask to join' }));
    await waitFor(() => expect(join.writes.refresh).toHaveBeenCalledTimes(1));
  });

  it('81401 Try again on a section that did not load reads the page again', async () => {
    const { user, writes } = setup({ data: { ...coachData(), delivery: failedRead }, section: 'notifications' });
    await expectCode('CH-8202');
    await user.click(within(code('CH-8202') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(writes.refresh).toHaveBeenCalledTimes(1);
  });

  it('81401 after the refresh the notice becomes the card, and the open section and a draft in another card stay', async () => {
    const { user, writes, serve } = setup({ data: { ...coachData(), scoring: failedRead }, section: 'team' });
    await user.type(screen.getByLabelText('Team name'), ' B');
    await user.click(within(code('CH-8207') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(writes.refresh).toHaveBeenCalledTimes(1);
    serve({ ...coachData(), teamName: 'Junior varsity' });
    expect(await screen.findByRole('region', { name: 'Scoring and format' })).toBeTruthy();
    expect(code('CH-8207')).toBeNull();
    expect(within(nav()).getByRole('button', { name: /^Team/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('Team name')).toHaveValue('Varsity B');
  });

  it('82001 Enter sends the email confirmation and asks to join; every other card saves only with its button', async () => {
    const email = setup();
    await email.user.type(screen.getByLabelText('New email'), 'new@unc.edu{Enter}');
    await waitFor(() => expect(email.writes.changeEmail).toHaveBeenCalledWith('new@unc.edu'));
    await email.user.type(screen.getByLabelText('Full name'), 'x{Enter}');
    expect(email.writes.saveProfile).not.toHaveBeenCalled();
    email.unmount();

    const join = setup({ data: playerData(false, false), section: 'golf' });
    await join.user.type(screen.getByLabelText('Invite code'), 'abc123{Enter}');
    await waitFor(() => expect(join.writes.requestJoin).toHaveBeenCalledWith('ABC123', ''));
  });
});

describe('Settings · what the person is told about standing conditions', () => {
  it('80701 while offline a switch and a CoachHelm autosave are refused before they change', async () => {
    const online = goOffline();
    try {
      const setDelivery = vi.fn(okw);
      const notifications = setup({ section: 'notifications', writes: { setDelivery } });
      await notifications.user.click(screen.getByRole('switch', { name: 'Tasks by push' }));
      await expectCode('CH-1903', /you're offline/);
      expect(setDelivery).not.toHaveBeenCalled();
      expect(screen.getByRole('switch', { name: 'Tasks by push' })).toBeChecked();
      expect(hapticSpy).toHaveBeenCalledWith('error');
      notifications.unmount();

      const savePhilosophy = vi.fn();
      const coachhelm = setup({ section: 'coachhelm', writes: { savePhilosophy } });
      await coachhelm.user.click(screen.getByRole('switch', { name: 'Performance plateau' }));
      await expectCode('CH-1903', /offline/);
      expect(savePhilosophy).not.toHaveBeenCalled();
      expect(screen.getByRole('switch', { name: 'Performance plateau' })).not.toBeChecked();
    } finally {
      online();
    }
  });

  it('81002 push blocked in the browser: the switch cannot be used and the row says how to allow it', () => {
    setup({ section: 'notifications', device: makeDevice({ status: 'denied' }) });
    expect(screen.getByRole('switch', { name: 'Push on this device' })).toBeDisabled();
    expect(screen.getByText(/blocked for GolfHelm in this browser/)).toBeTruthy();
  });

  it('81002 push the browser cannot do at all: the row is not shown', () => {
    setup({ section: 'notifications', device: makeDevice({ status: 'unsupported' }) });
    expect(screen.queryByRole('switch', { name: 'Push on this device' })).toBeNull();
  });

  it('81003 quiet mode: every update but messages reads Paused by quiet mode and cannot be switched', () => {
    const coach = coachData();
    const delivery = { value: { ...(coach.delivery.value as Record<string, boolean>), quiet_mode: true }, error: false as const };
    const first = setup({ data: { ...coach, delivery }, section: 'notifications' });
    expect(screen.getAllByText('Paused by quiet mode')).toHaveLength(4);
    expect(screen.getByRole('switch', { name: 'Tasks by push' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Messages by push' })).toBeEnabled();
    first.unmount();

    const player = playerData(true);
    const routing = { value: { ...(player.playerRouting!.value as { prefs: PrefsByCategory; quiet: boolean }), quiet: true }, error: false as const };
    setup({ data: { ...player, playerRouting: routing }, section: 'notifications' });
    expect(screen.getAllByText('Always delivered')).toHaveLength(2);
    expect(screen.getAllByText('Paused by quiet mode')).toHaveLength(7);
    expect(screen.getByRole('switch', { name: 'New insight, push' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Round review ready, push' })).toBeEnabled();
  });
});

// The coaching staff's own checks (what is read, sent and shown, on desktop and phone) are in settings-staff.test.tsx.
describe('Settings · Team · the coaching staff', () => {
  it('CH-8026 CH-8027 CH-8028 CH-8213 an approval, a decline and a staff invite that are refused are toasts; a requests read that fails is a notice', async () => {
    const user = userEvent.setup();
    const pending = [{ coachId: 'avery', fullName: 'Avery Lee', email: 'avery@unc.edu' }];
    const refused = (error: string) => Promise.resolve({ success: false, error });
    const staff = {
      list: vi.fn<ChStaffWrites['list']>(() => Promise.resolve({ success: true, data: PREVIEW_STAFF })),
      pending: vi.fn<ChStaffWrites['pending']>().mockImplementationOnce(() => refused('We could not load pending requests.')).mockImplementation(() => Promise.resolve({ success: true, data: pending })),
      invite: vi.fn<ChStaffWrites['invite']>(() => refused('Only a head coach of this team can invite staff.')),
      approve: vi.fn<ChStaffWrites['approve']>(() => refused('Only a head coach of this team can do that.')),
      decline: vi.fn<ChStaffWrites['decline']>(() => refused('We could not decline that request.')),
    };
    setup({ section: 'team', writes: { staff } });
    await expectCode('CH-8213', /Requests didn't load/);
    await user.click(within(code('CH-8213') as HTMLElement).getByRole('button', { name: 'Try again' }));
    const requests = await screen.findByRole('region', { name: 'Assistant coach requests' });
    await user.click(within(requests).getByRole('button', { name: 'Approve' }));
    await expectCode('CH-8026', /Couldn't approve Avery Lee/);
    expect(staff.approve).toHaveBeenCalledWith('avery');
    await user.click(within(requests).getByRole('button', { name: 'Decline' }));
    await expectCode('CH-8027', /Couldn't decline Avery Lee/);
    expect(staff.decline).toHaveBeenCalledWith('avery');
    await user.click(within(await screen.findByRole('region', { name: 'Staff invitations' })).getByRole('button', { name: 'Create invite' }));
    await expectCode('CH-8028', /Couldn't make the assistant coach invite/);
    expect(staff.invite).toHaveBeenCalledWith('coach');
  });
});

describe('Settings · what a saved value does when the person leaves the section', () => {
  it('81204 a value saved in Team is still there when the person leaves the section and comes back', async () => {
    const { user } = setup({ section: 'team' });
    await user.click(screen.getByRole('radio', { name: 'Match play' }));
    await user.click(within(card('Scoring and format')).getByRole('button', { name: 'Save changes' }));
    await user.click(within(card('Invite players')).getByRole('button', { name: 'Make a new code' }));
    await user.click(within(code('CH-8503') as HTMLElement).getByRole('button', { name: 'Make a new code' }));
    await within(card('Invite players')).findByText('R4T8W2PL');
    await openSection(user, /^Account/);
    await screen.findByLabelText('Full name');
    await openSection(user, /^Team/);
    await screen.findByRole('region', { name: 'Scoring and format' });
    expect(screen.getByRole('radio', { name: 'Match play' })).toBeChecked();
    expect(within(card('Invite players')).getByText('R4T8W2PL')).toBeTruthy();
  });

  it('81204 a fresh read from the server replaces the page’s copy, so a section opened again shows what the server now says', async () => {
    const { user, serve } = setup({ section: 'team' });
    await user.click(screen.getByRole('radio', { name: 'Match play' }));
    await user.click(within(card('Scoring and format')).getByRole('button', { name: 'Save changes' }));
    await within(card('Scoring and format')).findByText('Saved');
    serve({ ...coachData(), teamName: 'Junior varsity' });
    expect(document.querySelector('.ch-set-head p')!.textContent).toContain('Junior varsity');
    await openSection(user, /^Account/);
    await screen.findByLabelText('Full name');
    await openSection(user, /^Team/);
    await screen.findByRole('region', { name: 'Scoring and format' });
    expect(screen.getByRole('radio', { name: 'Stroke play' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Match play' })).not.toBeChecked();
  });

  it('81204 a switch that saved stays where it was put after leaving Notifications and coming back', async () => {
    const { user } = setup({ section: 'notifications' });
    await user.click(screen.getByRole('switch', { name: 'Tasks by push' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Tasks by push' })).toBeEnabled());
    expect(screen.getByRole('switch', { name: 'Tasks by push' })).not.toBeChecked();
    await openSection(user, /^Account/);
    await screen.findByLabelText('Full name');
    await openSection(user, /^Notifications/);
    expect(await screen.findByRole('switch', { name: 'Tasks by push' })).not.toBeChecked();
  });

  it('81204 CoachHelm keeps the row its first save created, so the next save updates it instead of making a second', async () => {
    const d = coachData();
    const ch = (d.coachhelm as { value: ChCoachHelmSettings }).value;
    const data = { ...d, coachhelm: ok({ ...ch, philosophy: { ...ch.philosophy, id: null } as unknown as ChCoachHelmSettings['philosophy'] }) };
    const savePhilosophy = vi.fn((id: string | null) => Promise.resolve({ success: true, data: { id: id ?? 'ph9' } }));
    const setCoachHelmCoach = vi.fn(okw);
    const { user } = setup({ data, section: 'coachhelm', writes: { savePhilosophy, setCoachHelmCoach } });
    await user.click(screen.getByRole('switch', { name: 'Performance plateau' }));
    await waitFor(() => expect(code('CH-8405')!.textContent).toMatch(/All changes saved/));
    await user.click(screen.getByRole('switch', { name: 'Insights' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Insights' })).toBeEnabled());
    await openSection(user, /^Account/);
    await screen.findByLabelText('Full name');
    await openSection(user, /^CoachHelm/);
    await screen.findByRole('switch', { name: 'Closing hole problems' });
    expect(screen.getByRole('switch', { name: 'Performance plateau' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Insights' })).not.toBeChecked();
    await user.click(screen.getByRole('switch', { name: 'Closing hole problems' }));
    await waitFor(() => expect(savePhilosophy).toHaveBeenCalledTimes(2));
    expect(savePhilosophy.mock.calls[0]![0]).toBeNull();
    expect(savePhilosophy.mock.calls[1]![0]).toBe('ph9');
  });

  it('81204 a join request the player cancelled does not come back', async () => {
    const { user } = setup({ data: playerData(false, true), section: 'golf' });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText(/Waiting on Wake Forest Golf/)).toBeNull());
    await openSection(user, /^Account/);
    await screen.findByLabelText('First name');
    await openSection(user, /^Golf profile/);
    await screen.findByRole('region', { name: 'Join a team' });
    expect(screen.queryByText(/Waiting on Wake Forest Golf/)).toBeNull();
  });

  it('81206 a CoachHelm slider moved just before the person leaves the section is still saved', async () => {
    const { user, writes } = setup({ section: 'coachhelm' });
    fireEvent.change(screen.getByRole('slider', { name: 'Decline threshold' }), { target: { value: '3' } });
    expect(writes.savePhilosophy).not.toHaveBeenCalled();
    await openSection(user, /^Account/);
    await waitFor(() => expect(writes.savePhilosophy).toHaveBeenCalledWith('ph1', { declineThreshold: 3 }));
    expect(writes.savePhilosophy).toHaveBeenCalledTimes(1);
  });

  it('81204 a draft the person discards is gone, and a save that failed is not kept as saved', async () => {
    const { user } = setup({ writes: { saveProfile: vi.fn(() => fail()) } });
    const name = screen.getByLabelText('Full name');
    await user.clear(name);
    await user.type(name, 'Maya R');
    await user.click(within(card('Profile')).getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-8001');
    await openSection(user, /^Notifications/);
    await expectCode('CH-8507');
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    await screen.findByRole('region', { name: 'Email and push' });
    await openSection(user, /^Account/);
    expect(await screen.findByLabelText('Full name')).toHaveValue('Maya Reyes');
  });
});

describe('Settings · Discard', () => {
  it('81708 Discard on a card warns before the edits are dropped', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Full name'), 'x');
    hapticSpy.mockClear();
    await user.click(within(card('Profile')).getByRole('button', { name: 'Discard' }));
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    expect(screen.getByLabelText('Full name')).toHaveValue('Maya Reyes');
  });

  it('81708 Discard changes when leaving a section warns before the edits are dropped', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Full name'), 'x');
    await openSection(user, /^Notifications/);
    await expectCode('CH-8507');
    hapticSpy.mockClear();
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(hapticSpy).toHaveBeenCalledWith('warning');
  });

  it('81708 Discard and leave when following a link warns, then leaves', async () => {
    const assign = vi.fn();
    const real = window.location;
    const { user } = setup();
    await user.type(screen.getByLabelText('Full name'), 'x');
    const a = document.createElement('a');
    a.href = '/golf/dashboard/roster';
    a.textContent = 'Roster';
    document.body.appendChild(a);
    await user.click(a);
    await expectCode('CH-8506');
    Object.defineProperty(window, 'location', { configurable: true, value: { ...real, assign } });
    hapticSpy.mockClear();
    await user.click(screen.getByRole('button', { name: 'Discard and leave' }));
    Object.defineProperty(window, 'location', { configurable: true, value: real });
    a.remove();
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    expect(assign).toHaveBeenCalledWith('/golf/dashboard/roster');
  });
});

describe('Settings · what is reported', () => {
  it('82301 a form save that fails is reported once with its action, and left a breadcrumb', async () => {
    const { user } = setup({ writes: { saveProfile: vi.fn(() => fail('nope')) } });
    await user.type(screen.getByLabelText('Full name'), 'x');
    await user.click(within(card('Profile')).getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-8001');
    expect(track.report).toHaveBeenCalledTimes(1);
    expect(track.report).toHaveBeenCalledWith(expect.any(Error), { surface: 'settings', action: 'settings.saveProfile', severity: 'low' });
    expect(track.trail).toHaveBeenCalledWith('action settings.saveProfile');
  });

  it('82301 a write that throws is reported with its error, as well as the failure it becomes', async () => {
    const { user } = setup({ writes: { saveProfile: vi.fn(() => Promise.reject(new Error('network down'))) } });
    await user.type(screen.getByLabelText('Full name'), 'x');
    await user.click(within(card('Profile')).getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-8001');
    expect(track.report).toHaveBeenNthCalledWith(1, expect.objectContaining({ message: 'network down' }), { surface: 'settings', action: 'settings.saveProfile' });
  });

  it('82301 a switch that fails is reported under its section, and every intent leaves a breadcrumb', async () => {
    const { user } = setup({ section: 'notifications', writes: { setDelivery: vi.fn(() => fail('nope')) } });
    await user.click(screen.getByRole('switch', { name: 'Tasks by push' }));
    await expectCode('CH-8005');
    expect(track.trail).toHaveBeenCalledWith('settings notifications push_task_reminders');
    expect(track.report).toHaveBeenCalledWith(expect.any(Error), { surface: 'settings.notifications', action: 'push_task_reminders', severity: 'low' });
    await openSection(user, /^Team/);
    expect(track.trail).toHaveBeenCalledWith('settings section team');
  });

  it('82301 a section that crashes is reported as high severity under its own surface', async () => {
    const boom = { ...coachData(), delivery: { value: null as unknown as Record<string, boolean>, error: false as const } };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setup({ data: boom, section: 'notifications' });
    await expectCode('CH-8212');
    spy.mockRestore();
    expect(track.report).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ surface: 'settings.notifications', severity: 'high' }));
  });
});

// ── The phone (docs/clubhouse/phone/settings.md, owner-approved 2026-09-30) ──

describe('Settings · phone (docs/clubhouse/phone/settings.md)', () => {
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
    router.back.mockClear();
    localStorage.clear();
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    window.history.replaceState(null, '', '/');
  });

  /** The shell's phone top bar, where the page's PhoneTop renders. */
  function SlotHost() {
    const { setSlot } = usePhoneChromeState();
    return <div ref={setSlot} data-testid="phone-top" />;
  }
  function phone(opts: { data?: ChSettingsData; writes?: Partial<ChSettingsWrites>; device?: ChDevice; onDeleted?: () => void; initialSection?: ChSettingsSection } = {}) {
    const writes = makeWrites(opts.writes);
    const onDeleted = opts.onDeleted ?? vi.fn();
    const user = userEvent.setup();
    const utils = render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              <SlotHost />
              <SettingsView data={opts.data ?? coachData()} writes={writes} device={opts.device ?? makeDevice()} initialSection={opts.initialSection ?? 'account'} onDeleted={onDeleted} />
            </div>
          </PhoneChromeProvider>
        </ToastProvider>
      </LazyMotion>,
    );
    return { ...utils, writes, user, onDeleted };
  }
  const top = () => within(screen.getByTestId('phone-top'));
  const list = () => screen.getByRole('navigation', { name: 'Settings sections' });
  const openRow = async (user: User, name: RegExp) => {
    await user.click(within(list()).getByRole('button', { name }));
    await screen.findByRole('button', { name: 'Back to Settings' });
  };
  /** A sheet by its catalog number, when it is open (a closed one keeps its dialog in the page). */
  const sheetOf = (c: string) => {
    const d = code(c);
    return d?.hasAttribute('open') ? (d as HTMLElement) : null;
  };
  /** Waits for a sheet to open, by its catalog number. */
  const openSheet = (c: string) =>
    waitFor(() => {
      const d = sheetOf(c);
      if (!d) throw new Error(`${c} is not open`);
      return d;
    });
  const dialog = (name: string) => screen.getByRole('dialog', { name });
  /** A finger down at y=100 on `handle`, dragged `to` px down, held a moment so the release is not a flick, then let go. */
  const dragSheet = async (handle: HTMLElement, to: number) => {
    act(() => {
      handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 100, button: 0 }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientY: 100 + to }));
    });
    await new Promise((r) => setTimeout(r, 20));
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientY: 100 + to }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientY: 100 + to }));
    });
  };

  it('81901 the coach root: a large title, the identity row, the sections with their summaries, help, and Sign out', () => {
    phone();
    expect(top().getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
    expect(top().getByRole('button', { name: 'Back to More' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Maya Reyes Head coach · Varsity' })).toBeTruthy();
    const rows = within(list()).getAllByRole('button');
    expect(rows.map((b) => b.querySelector('.ch-setm-row__l')?.textContent)).toEqual(['Account', 'Notifications', 'Team', 'CoachHelm', 'Preferences']);
    expect(rows.map((b) => b.querySelector('.ch-setm-row__v')?.textContent)).toEqual(['Profile, email', 'Email, Push', 'Scoring, invites', 'Priorities, alerts', 'Motion, units']);
    expect(screen.getByRole('button', { name: 'Report a problem' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Privacy policy' }).getAttribute('href')).toBe('/privacy');
    expect(screen.getByRole('link', { name: 'Terms of service' }).getAttribute('href')).toBe('/terms');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    // Not the desktop page reflowed: no section rail.
    expect(document.querySelector('.ch-set-rail')).toBeNull();
  });

  it('81901 the player root has Golf profile in place of Team and CoachHelm, and the handicap on the identity row', () => {
    phone({ data: playerData(true) });
    expect(screen.getByRole('button', { name: 'Jonah Okafor Player · Varsity · HCP 2.4' })).toBeTruthy();
    const rows = within(list()).getAllByRole('button');
    expect(rows.map((b) => b.querySelector('.ch-setm-row__l')?.textContent)).toEqual(['Account', 'Golf profile', 'Notifications', 'Preferences']);
    expect(rows.map((b) => b.querySelector('.ch-setm-row__v')?.textContent)).toEqual(['Profile, email', 'Handicap, team', 'Push, CoachHelm', 'Motion, units']);
  });

  it('81901 CH-8801 a row pushes its section, the bar reads "Settings", and Back and the edge swipe pop it (CH-1906)', async () => {
    const { user } = phone();
    await openRow(user, /^Notifications/);
    expect(await screen.findByText(/Which updates reach you/)).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Settings sections' })).toBeNull();
    expect(top().getByRole('heading', { level: 1, name: 'Notifications' })).toBeTruthy();
    expect((window.history.state as { chPhone?: number } | null)?.chPhone).toBe(1);
    await user.click(top().getByRole('button', { name: 'Back to Settings' }));
    await screen.findByRole('navigation', { name: 'Settings sections' });
    await openRow(user, /^Team/);
    // The browser's back (the iOS edge swipe) pops the same screen.
    act(() => window.history.back());
    expect(await top().findByRole('button', { name: 'Back to More' })).toBeTruthy();
    await screen.findByRole('navigation', { name: 'Settings sections' });
  });

  it('81901 a section named in the URL opens pushed, and the list is what Back returns to', async () => {
    window.history.replaceState(null, '', '/golf/dashboard/settings?section=coachhelm');
    const { user } = phone();
    expect(await screen.findByRole('list', { name: 'Priorities, most important first' })).toBeTruthy();
    await user.click(top().getByRole('button', { name: 'Back to Settings' }));
    await screen.findByRole('navigation', { name: 'Settings sections' });
  });

  it('81901 80102 an old address opens its section pushed: /settings/notifications passes its section with no query, and the bare page still opens on the list', async () => {
    window.history.replaceState(null, '', '/golf/dashboard/settings/notifications');
    const first = phone({ initialSection: 'notifications' });
    expect(await screen.findByText(/Which updates reach you/)).toBeTruthy();
    expect(top().getByRole('button', { name: 'Back to Settings' })).toBeTruthy();
    first.unmount();
    // The route's default section (Account) is not a request for it.
    window.history.replaceState(null, '', '/golf/dashboard/settings');
    phone({ initialSection: 'account' });
    expect(screen.getByRole('navigation', { name: 'Settings sections' })).toBeTruthy();
    expect(top().getByRole('button', { name: 'Back to More' })).toBeTruthy();
  });

  it('81901 CH-8008 a kind of update says what is on, and its sheet changes every category in it with one write (player)', async () => {
    const setRoutingAll = vi.fn((_prefs: PrefsByCategory) => okw());
    const { user } = phone({ data: playerData(true), writes: { setRoutingAll } });
    await openRow(user, /^Notifications/);
    const updates = await screen.findByRole('region', { name: 'CoachHelm updates' });
    const kinds = within(updates).getAllByRole('button');
    // Round reviews and goals your coach assigned are on for push; the rest of each kind isn't: "(some)".
    expect(kinds.map((b) => b.querySelector('.ch-setm-row__v')?.textContent)).toEqual(['In app, Push (some)', 'In app, Push (some), Email (some)', 'In app']);
    await user.click(within(updates).getByRole('button', { name: /^Insights/ }));
    const sheet = dialog('Insights');
    expect(within(sheet).getByRole('switch', { name: 'In app' })).toBeChecked();
    expect(within(sheet).getByRole('switch', { name: 'Push' })).not.toBeChecked();
    hapticSpy.mockClear();
    await user.click(within(sheet).getByRole('switch', { name: 'Push' }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    await waitFor(() => expect(setRoutingAll).toHaveBeenCalledTimes(1));
    const sent = setRoutingAll.mock.calls[0]![0] as PrefsByCategory;
    expect(['new_insight', 'composite_insight', 'coach_commented'].map((c) => sent[c as keyof PrefsByCategory]?.push)).toEqual([true, true, true]);
    // What was already set is sent back as it was.
    expect(sent.coach_assigned_goal).toEqual({ push: true, email: true, in_app: true });
    expect(within(dialog('Insights')).getByRole('switch', { name: 'Push' })).toBeChecked();
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(within(updates).getByRole('button', { name: /^Insights/ }).querySelector('.ch-setm-row__v')?.textContent).toBe('In app, Push'));
  });

  it('81901 CH-8005 CH-8203 a switch in a kind sheet that fails flips back and says so; a failed read says so with Try again', async () => {
    const setDelivery = vi.fn(() => fail());
    const { user, writes } = phone({ writes: { setDelivery } });
    await openRow(user, /^Notifications/);
    const mail = await screen.findByRole('region', { name: 'Email and push' });
    expect(within(mail).getByRole('button', { name: /^Messages/ }).querySelector('.ch-setm-row__v')?.textContent).toBe('Email, Push');
    expect(within(mail).getByRole('button', { name: /^Events & reminders/ }).querySelector('.ch-setm-row__v')?.textContent).toBe('Email');
    await user.click(within(mail).getByRole('button', { name: /^Messages/ }));
    const sheet = dialog('Messages');
    expect(within(sheet).getByRole('switch', { name: 'Push' })).toBeChecked();
    await user.click(within(sheet).getByRole('switch', { name: 'Push' }));
    await expectCode('CH-8005', /Couldn't change messages push/);
    expect(setDelivery).toHaveBeenCalledWith('push_messages', false);
    await waitFor(() => expect(within(dialog('Messages')).getByRole('switch', { name: 'Push' })).toBeChecked());
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(writes.refresh).not.toHaveBeenCalled();
  });

  it('81901 CH-8202 CH-8203 a section whose read failed says so in its place, with Try again', async () => {
    const { user, writes } = phone({ data: { ...playerData(true), delivery: failedRead, playerRouting: failedRead } });
    await openRow(user, /^Notifications/);
    await expectCode('CH-8202', /email and push settings didn't load/);
    await expectCode('CH-8203', /CoachHelm update settings didn't load/);
    expect(screen.queryByRole('switch', { name: 'Push' })).toBeNull();
    await user.click(within(code('CH-8202') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(writes.refresh).toHaveBeenCalledTimes(1);
  });

  it('81901 CH-8201 a profile that did not load opens Account from the identity row, with the notice and no edit sheet', async () => {
    const { user } = phone({ data: { ...coachData(), profile: failedRead } });
    await user.click(screen.getByRole('button', { name: /^maya\.reyes@unc\.edu/ }));
    await expectCode('CH-8201', /profile didn't load/);
    expect(screen.queryByRole('dialog', { name: 'Profile' })).toBeNull();
  });

  it('81901 CH-8204 the weekly team email that did not load is disabled with its reason; push on this device keeps its blocked reason', async () => {
    const { user } = phone({ data: { ...coachData(), digest: failedRead }, device: makeDevice({ status: 'denied' }) });
    await openRow(user, /^Notifications/);
    await expectCode('CH-8204', /didn't load/);
    expect(screen.getByRole('switch', { name: 'Weekly team email' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Push on this device' })).toBeDisabled();
    expect(screen.getByText(/blocked for GolfHelm/)).toBeTruthy();
  });

  it('81901 CH-8010 quiet mode pauses the kinds it silences, and the sheet says so instead of offering switches', async () => {
    const { user, writes } = phone({ data: playerData(true) });
    await openRow(user, /^Notifications/);
    const updates = await screen.findByRole('region', { name: 'CoachHelm updates' });
    await user.click(within(updates).getByRole('switch', { name: 'Quiet mode for CoachHelm' }));
    await waitFor(() => expect(writes.setRoutingQuiet).toHaveBeenCalledWith(true));
    expect(within(updates).getByRole('button', { name: /^Insights/ }).querySelector('.ch-setm-row__v')?.textContent).toBe('Paused');
    // Round reviews and goals your coach assigns are always delivered.
    expect(within(updates).getByRole('button', { name: /^Goals/ }).querySelector('.ch-setm-row__v')?.textContent).not.toBe('Paused');
    expect(within(updates).getByText(/always delivered/)).toBeTruthy();
    await user.click(within(updates).getByRole('button', { name: /^Insights/ }));
    const sheet = dialog('Insights');
    expect(within(sheet).getByRole('switch', { name: 'Push' })).toBeDisabled();
    expect(within(sheet).getByText(/Paused by quiet mode/)).toBeTruthy();
  });

  describe('the priority ranker', () => {
    const list = () => screen.getByRole('list', { name: 'Priorities, most important first' });
    const labels = () => within(list()).getAllByRole('listitem').map((li) => li.querySelector('.ch-setm-rank__txt > span')?.textContent);
    const keyOf = (label: string) => Object.entries(PRIORITY_LABEL).find(([, v]) => v.label === label)![0];
    const savedOrder = (fn: ReturnType<typeof vi.fn>, n: number) => {
      const patch = fn.mock.calls[n]![1] as Record<string, number>;
      return Object.keys(patch).sort((a, b) => patch[a]! - patch[b]!);
    };

    it('81901 CH-8701 holding a row and dragging it moves it a step at a time with a tick each, and saves once, on drop', async () => {
      const savePhilosophy = vi.fn((id: string | null) => Promise.resolve({ success: true, data: { id: id ?? 'ph1' } }));
      const { user } = phone({ writes: { savePhilosophy } });
      await openRow(user, /^CoachHelm/);
      await screen.findByRole('list', { name: 'Priorities, most important first' });
      const [a, b, c, d, e] = labels() as string[];
      const first = within(list()).getAllByRole('listitem')[0]!;
      hapticSpy.mockClear();
      act(() => {
        first.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 100, button: 0 }));
      });
      // Touch and hold: nothing lifts until the hold is over.
      await new Promise((r) => setTimeout(r, 120));
      expect(first.className).not.toContain('is-held');
      await waitFor(() => expect(first.className).toContain('is-held'));
      act(() => {
        window.dispatchEvent(new MouseEvent('pointermove', { clientY: 100 + 57 }));
      });
      expect(labels()).toEqual([b, a, c, d, e]);
      act(() => {
        window.dispatchEvent(new MouseEvent('pointermove', { clientY: 100 + 57 * 2 }));
      });
      expect(labels()).toEqual([b, c, a, d, e]);
      expect(hapticSpy.mock.calls.filter((c) => c[0] === 'select')).toHaveLength(2);
      // Still in the hand: nothing is saved yet.
      expect(savePhilosophy).not.toHaveBeenCalled();
      act(() => {
        window.dispatchEvent(new MouseEvent('pointerup', { clientY: 100 + 57 * 2 }));
      });
      await waitFor(() => expect(savePhilosophy).toHaveBeenCalledTimes(1));
      expect(savedOrder(savePhilosophy, 0)).toEqual([b, c, a, d, e].map((l) => keyOf(l!)));
      expect(within(list()).getAllByRole('listitem')[2]!.className).not.toContain('is-held');
    });

    it('81901 a finger that moves before the hold is over is scrolling: the row does not lift', async () => {
      const savePhilosophy = vi.fn((id: string | null) => Promise.resolve({ success: true, data: { id: id ?? 'ph1' } }));
      const { user } = phone({ writes: { savePhilosophy } });
      await openRow(user, /^CoachHelm/);
      await screen.findByRole('list', { name: 'Priorities, most important first' });
      const before = labels();
      const first = within(list()).getAllByRole('listitem')[0]!;
      act(() => {
        first.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 100, button: 0 }));
        window.dispatchEvent(new MouseEvent('pointermove', { clientY: 130 }));
      });
      await new Promise((r) => setTimeout(r, 320));
      act(() => {
        window.dispatchEvent(new MouseEvent('pointermove', { clientY: 260 }));
        window.dispatchEvent(new MouseEvent('pointerup', { clientY: 260 }));
      });
      expect(first.className).not.toContain('is-held');
      expect(labels()).toEqual(before);
      expect(savePhilosophy).not.toHaveBeenCalled();
    });

    it('81901 the handle takes the arrow keys, and each move saves and ticks (with a keyboard or VoiceOver)', async () => {
      const savePhilosophy = vi.fn((id: string | null) => Promise.resolve({ success: true, data: { id: id ?? 'ph1' } }));
      const { user } = phone({ writes: { savePhilosophy } });
      await openRow(user, /^CoachHelm/);
      await screen.findByRole('list', { name: 'Priorities, most important first' });
      const [a, b, c, d, e] = labels() as string[];
      hapticSpy.mockClear();
      screen.getByRole('button', { name: `Reorder ${b}` }).focus();
      await user.keyboard('{ArrowUp}');
      expect(labels()).toEqual([b, a, c, d, e]);
      await waitFor(() => expect(savePhilosophy).toHaveBeenCalledTimes(1));
      expect(savedOrder(savePhilosophy, 0)).toEqual([b, a, c, d, e].map((l) => keyOf(l!)));
      expect(hapticSpy).toHaveBeenCalledWith('select');
      // The top row can't go higher: no write.
      screen.getByRole('button', { name: `Reorder ${b}` }).focus();
      await user.keyboard('{ArrowUp}');
      expect(savePhilosophy).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole('button', { name: `Move ${c} down` }));
      expect(labels()).toEqual([b, a, d, c, e]);
    });

    it('81901 CH-8022 CH-8405 a reorder that fails to save goes back, and the status line says so', async () => {
      const { user } = phone({ writes: { savePhilosophy: vi.fn(() => Promise.resolve({ success: false, error: 'nope' })) } });
      await openRow(user, /^CoachHelm/);
      await screen.findByRole('list', { name: 'Priorities, most important first' });
      const before = labels();
      screen.getByRole('button', { name: `Reorder ${before[1]}` }).focus();
      await user.keyboard('{ArrowUp}');
      await expectCode('CH-8022', /Couldn't save that CoachHelm setting/);
      expect(labels()).toEqual(before);
      expect(code('CH-8405')!.textContent).toMatch(/didn't save/);
    });
  });

  describe('edit sheets and the discard question', () => {
    const openProfile = async (user: User) => {
      await user.click(screen.getByRole('button', { name: /^Maya Reyes/ }));
      return dialog('Profile');
    };

    it('81901 CH-8509 the profile sheet keeps Save off until something changes, and closing with changes asks first', async () => {
      const { user, writes } = phone();
      const sheet = await openProfile(user);
      const save = within(sheet).getByRole('button', { name: 'Save' });
      expect(save).toBeDisabled();
      expect(within(sheet).queryByLabelText('First name')).toBeNull();
      await user.type(within(sheet).getByLabelText('Full name'), ' Jr');
      expect(save).toBeEnabled();
      // Cancel with changes: an action sheet with the destructive choice, and it warns as it opens.
      hapticSpy.mockClear();
      await user.click(within(sheet).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(sheetOf('CH-8509')).not.toBeNull());
      const ask = sheetOf('CH-8509')!;
      expect(ask.getAttribute('role')).toBe('alertdialog');
      expect(hapticSpy).toHaveBeenCalledWith('warning');
      expect(within(ask).getByRole('button', { name: 'Discard changes' })).toBeTruthy();
      // Keep editing: still there, still as typed.
      await user.click(within(ask).getByRole('button', { name: 'Keep editing' }));
      await waitFor(() => expect(sheetOf('CH-8509')).toBeNull());
      expect(within(dialog('Profile')).getByLabelText('Full name')).toHaveValue('Maya Reyes Jr');
      // Swiping the sheet down asks too, and puts the sheet back where it was.
      await dragSheet(sheet.querySelector('.ch-setm-bar') as HTMLElement, 120);
      await waitFor(() => expect(sheetOf('CH-8509')).not.toBeNull());
      expect((sheet.closest('dialog') as HTMLElement).style.translate).toBe('');
      // Discard: closed, nothing sent, and it opens again as saved.
      await user.click(within(sheetOf('CH-8509')!).getByRole('button', { name: 'Discard changes' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Profile' })).toBeNull());
      expect(writes.saveProfile).not.toHaveBeenCalled();
      await openProfile(user);
      expect(within(dialog('Profile')).getByLabelText('Full name')).toHaveValue('Maya Reyes');
      expect(within(dialog('Profile')).getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('81901 a sheet with nothing changed closes at once, without asking', async () => {
      const { user } = phone();
      const sheet = await openProfile(user);
      await user.click(within(sheet).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Profile' })).toBeNull());
      expect(sheetOf('CH-8509')).toBeNull();
    });

    it('81901 CH-8702 Save sends the name, closes the sheet with the success pattern and asks for a fresh read (player: first and last name)', async () => {
      const { user, writes } = phone({ data: playerData(true) });
      await user.click(screen.getByRole('button', { name: /^Jonah Okafor/ }));
      const sheet = dialog('Profile');
      expect(within(sheet).queryByLabelText('Full name')).toBeNull();
      await user.clear(within(sheet).getByLabelText('First name'));
      await user.type(within(sheet).getByLabelText('First name'), 'Jon');
      hapticSpy.mockClear();
      await user.click(within(sheet).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(writes.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Jon', lastName: 'Okafor' })));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Profile' })).toBeNull());
      expect(hapticSpy).toHaveBeenCalledWith('success');
      expect(writes.refresh).toHaveBeenCalled();
      expect(screen.getByText('Profile saved')).toBeTruthy();
    });

    it('81901 CH-8001 CH-8102 a save that fails keeps the sheet open with what was typed; a cleared name keeps Save off', async () => {
      const { user } = phone({ data: playerData(true), writes: { saveProfile: vi.fn(() => fail()) } });
      await user.click(screen.getByRole('button', { name: /^Jonah Okafor/ }));
      const sheet = dialog('Profile');
      await user.clear(within(sheet).getByLabelText('First name'));
      await expectCode('CH-8102', /first and last name/);
      expect(within(sheet).getByRole('button', { name: 'Save' })).toBeDisabled();
      await user.type(within(sheet).getByLabelText('First name'), 'Jon');
      await user.click(within(sheet).getByRole('button', { name: 'Save' }));
      await expectCode('CH-8001', /Couldn't save your profile/);
      expect(within(dialog('Profile')).getByLabelText('First name')).toHaveValue('Jon');
    });

    it('81901 CH-8402 a sheet that is saving reads "Saving…", cannot be sent twice, and stays open until the save lands', async () => {
      let resolve: (v: ChResult) => void = () => {};
      const saveProfile = vi.fn(() => new Promise<ChResult>((r) => (resolve = r)));
      const { user } = phone({ writes: { saveProfile } });
      const sheet = await openProfile(user);
      await user.type(within(sheet).getByLabelText('Full name'), ' Jr');
      await user.click(within(sheet).getByRole('button', { name: 'Save' }));
      expect(within(sheet).getByRole('button', { name: 'Saving…' })).toBeDisabled();
      expect(code('CH-8402')).not.toBeNull();
      // Nothing closes it meanwhile: not Cancel, not a swipe (which springs back), and no discard question.
      await user.click(within(sheet).getByRole('button', { name: 'Cancel' }));
      await dragSheet(sheet.querySelector('.ch-setm-bar') as HTMLElement, 120);
      expect(sheet.hasAttribute('open')).toBe(true);
      expect(sheet.style.translate).toBe('');
      expect(sheetOf('CH-8509')).toBeNull();
      expect(saveProfile).toHaveBeenCalledTimes(1);
      await act(async () => resolve({ success: true }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Profile' })).toBeNull());
    });

    it('81901 CH-1903 a sheet saved while offline is refused at once, and keeps what was typed', async () => {
      const restore = goOffline();
      try {
        const { user, writes } = phone();
        const sheet = await openProfile(user);
        await user.type(within(sheet).getByLabelText('Full name'), ' Jr');
        await user.click(within(sheet).getByRole('button', { name: 'Save' }));
        await expectCode('CH-1903', /offline/);
        expect(writes.saveProfile).not.toHaveBeenCalled();
        expect(within(dialog('Profile')).getByLabelText('Full name')).toHaveValue('Maya Reyes Jr');
      } finally {
        restore();
      }
    });

    it('81901 CH-8404 a photo that is uploading dims the coin and reads "Uploading…" until it lands', async () => {
      let resolve: (v: ChResult<{ url: string }>) => void = () => {};
      const uploadAvatar = vi.fn(() => new Promise<ChResult<{ url: string }>>((r) => (resolve = r)));
      const { user } = phone({ writes: { uploadAvatar } });
      const sheet = await openProfile(user);
      const input = sheet.querySelector('input[type="file"]') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { files: [new File(['x'], 'me.png', { type: 'image/png' })] } });
      });
      expect(within(sheet).getByRole('button', { name: 'Uploading…' })).toBeDisabled();
      expect(sheet.querySelector('.ch-setm-coin')!.className).toContain('is-busy');
      await act(async () => resolve({ success: true, data: { url: 'https://x.test/me.png' } }));
      await waitFor(() => expect(within(sheet).getByRole('button', { name: 'Replace photo' })).toBeEnabled());
      // A new photo is an edit like any other: Save turns on.
      expect(within(sheet).getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    it('81901 CH-8002 CH-8304 a photo the upload refuses says why; with no photo the sheet shows the initials coin', async () => {
      const { user } = phone({ writes: { uploadAvatar: vi.fn(() => Promise.resolve({ success: false, error: 'Photos must be under 2 MB.' })) } });
      const sheet = await openProfile(user);
      expect(code('CH-8304')!.textContent).toBe('MR');
      const input = sheet.querySelector('input[type="file"]') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { files: [new File(['x'], 'big.png', { type: 'image/png' })] } });
      });
      await expectCode('CH-8002', /under 2 MB/);
    });

    it('81901 CH-8506 CH-8508 a sheet with unsaved changes guards the page: closing the tab asks, a link off the page asks, and neither once it is discarded', async () => {
      const { user } = phone();
      const sheet = await openProfile(user);
      expect(document.documentElement.dataset.chGuard).toBeUndefined();
      await user.type(within(sheet).getByLabelText('Full name'), ' Jr');
      const before = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(before);
      expect(before.defaultPrevented).toBe(true);
      expect(document.documentElement.dataset.chGuard).toBe('CH-8508');
      const a = document.createElement('a');
      a.href = '/golf/dashboard/roster';
      a.textContent = 'Roster';
      document.body.appendChild(a);
      await user.click(a);
      await expectCode('CH-8506', /Leave without saving/);
      a.remove();
      await user.click(within(code('CH-8506') as HTMLElement).getByRole('button', { name: 'Keep editing' }));
      // Discarding the edits takes the guard off.
      await user.click(within(sheet).getByRole('button', { name: 'Cancel' }));
      await user.click(within(await openSheet('CH-8509')).getByRole('button', { name: 'Discard changes' }));
      await waitFor(() => expect(document.documentElement.dataset.chGuard).toBeUndefined());
    });

    it("81901 Change on the profile sheet's Email row opens Change email over it, and closing that returns to the profile", async () => {
      const { user } = phone();
      const sheet = await openProfile(user);
      await user.type(within(sheet).getByLabelText('Full name'), ' Jr');
      await user.click(within(sheet).getByRole('button', { name: /^maya\.reyes@unc\.edu Change/ }));
      const email = dialog('Change email');
      expect(email.hasAttribute('open')).toBe(true);
      await user.click(within(email).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Change email' })).toBeNull());
      // The profile is where it was, with what was typed.
      expect(within(dialog('Profile')).getByLabelText('Full name')).toHaveValue('Maya Reyes Jr');
    });

    it('81901 CH-8003 CH-8103 82001 Change email: a wrong address is named, Enter sends the confirmation, and Account says to check the inbox', async () => {
      const { user, writes } = phone();
      await openRow(user, /^Account/);
      await user.click(await screen.findByRole('button', { name: /^Email maya\.reyes@unc\.edu/ }));
      const sheet = dialog('Change email');
      expect(within(sheet).getByRole('button', { name: 'Send' })).toBeDisabled();
      await user.type(within(sheet).getByLabelText('New email'), 'nope{Enter}');
      await expectCode('CH-8103', /valid email/);
      expect(writes.changeEmail).not.toHaveBeenCalled();
      await user.clear(within(sheet).getByLabelText('New email'));
      await user.type(within(sheet).getByLabelText('New email'), 'new@unc.edu{Enter}');
      await waitFor(() => expect(writes.changeEmail).toHaveBeenCalledWith('new@unc.edu'));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Change email' })).toBeNull());
      expect(screen.getByText(/Check new@unc\.edu/)).toBeTruthy();
    });

    it('81901 CH-8004 CH-8107 Change password: a mismatch warns and sends nothing; a wrong current password says so', async () => {
      const { user, writes } = phone({ writes: { changePassword: vi.fn(() => fail('Your current password is incorrect.')) } });
      await openRow(user, /^Account/);
      await user.click(await screen.findByRole('button', { name: /^Password/ }));
      const sheet = dialog('Password');
      await user.type(within(sheet).getByLabelText('Current password'), 'old-pass');
      await user.type(within(sheet).getByLabelText('New password'), 'new-password');
      await user.type(within(sheet).getByLabelText('Confirm new password'), 'other-password');
      hapticSpy.mockClear();
      await user.click(within(sheet).getByRole('button', { name: 'Update' }));
      await expectCode('CH-8107', /don't match/);
      expect(hapticSpy).toHaveBeenCalledWith('warning');
      expect(writes.changePassword).not.toHaveBeenCalled();
      await user.clear(within(sheet).getByLabelText('Confirm new password'));
      await user.type(within(sheet).getByLabelText('Confirm new password'), 'new-password');
      await user.click(within(sheet).getByRole('button', { name: 'Update' }));
      await expectCode('CH-8004', /incorrect/);
      expect(writes.changePassword).toHaveBeenCalledWith('old-pass', 'new-password');
    });

    it('81901 CH-8016 CH-8112 golf details open in a sheet from any row, and a handicap out of range keeps Save off (player)', async () => {
      const { user, writes } = phone({ data: playerData(true) });
      await openRow(user, /^Golf profile/);
      const group = await screen.findByRole('region', { name: 'Golf details' });
      expect(within(group).getByRole('button', { name: /^Handicap 2\.4/ })).toBeTruthy();
      expect(within(group).getByRole('button', { name: /^Phone Not set/ })).toBeTruthy();
      await user.click(within(group).getByRole('button', { name: /^Hometown/ }));
      const sheet = dialog('Golf details');
      await user.clear(within(sheet).getByLabelText('Handicap'));
      await user.type(within(sheet).getByLabelText('Handicap'), '99');
      await expectCode('CH-8112', /between −10 and 54/);
      expect(within(sheet).getByRole('button', { name: 'Save' })).toBeDisabled();
      await user.clear(within(sheet).getByLabelText('Handicap'));
      await user.type(within(sheet).getByLabelText('Handicap'), '3.1');
      await user.click(within(sheet).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(writes.saveGolf).toHaveBeenCalledWith(expect.objectContaining({ handicap: '3.1', hometown: 'Charlotte' })));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Golf details' })).toBeNull());
    });
  });

  describe('destructive choices are action sheets', () => {
    it('81901 CH-8501 CH-8510 CH-8704 Delete account asks in an action sheet, then for "delete" typed, and only then deletes', async () => {
      const onDeleted = vi.fn();
      const { user, writes } = phone({ onDeleted });
      await openRow(user, /^Account/);
      hapticSpy.mockClear();
      await user.click(await screen.findByRole('button', { name: 'Delete account' }));
      await waitFor(() => expect(sheetOf('CH-8501')).not.toBeNull());
      expect(hapticSpy).toHaveBeenCalledWith('warning');
      const ask = sheetOf('CH-8501')!;
      expect(ask.getAttribute('role')).toBe('alertdialog');
      expect(within(ask).getByText('Delete your account?')).toBeTruthy();
      // Cancel: nothing further.
      await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(sheetOf('CH-8501')).toBeNull());
      expect(sheetOf('CH-8510')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Delete account' }));
      await user.click(within(await openSheet('CH-8501')).getByRole('button', { name: 'Delete account' }));
      // The follow-up sheet: Delete stays off until "delete" is typed.
      await waitFor(() => expect(sheetOf('CH-8510')).not.toBeNull());
      const typed = sheetOf('CH-8510')!;
      expect(within(typed).getByRole('button', { name: 'Delete' })).toBeDisabled();
      await user.type(within(typed).getByLabelText('Type delete to confirm'), 'dele');
      expect(within(typed).getByRole('button', { name: 'Delete' })).toBeDisabled();
      await user.type(within(typed).getByLabelText('Type delete to confirm'), 'te');
      expect(writes.deleteAccount).not.toHaveBeenCalled();
      await user.click(within(typed).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(writes.deleteAccount).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    });

    it('81901 CH-8023 a delete that fails says why and leaves the typed sheet open', async () => {
      const { user } = phone({ writes: { deleteAccount: vi.fn(() => fail('Your account has recorded data that must be reassigned by an admin.')) } });
      await openRow(user, /^Account/);
      await user.click(await screen.findByRole('button', { name: 'Delete account' }));
      await user.click(within(await openSheet('CH-8501')).getByRole('button', { name: 'Delete account' }));
      const typed = await openSheet('CH-8510');
      await user.type(within(typed).getByLabelText('Type delete to confirm'), 'delete');
      await user.click(within(typed).getByRole('button', { name: 'Delete' }));
      await expectCode('CH-8023', /reassigned by an admin/);
      expect(sheetOf('CH-8510')).not.toBeNull();
    });

    it('81901 CH-8502 Leave team asks first, and Cancel leaves the team as it was (player)', async () => {
      const { user, writes } = phone({ data: playerData(true) });
      await openRow(user, /^Golf profile/);
      hapticSpy.mockClear();
      await user.click(await screen.findByRole('button', { name: 'Leave team' }));
      await waitFor(() => expect(sheetOf('CH-8502')).not.toBeNull());
      expect(hapticSpy).toHaveBeenCalledWith('warning');
      const ask = sheetOf('CH-8502')!;
      expect(within(ask).getByText('Leave Varsity?')).toBeTruthy();
      await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
      expect(writes.leaveTeam).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Leave team' }));
      await user.click(within(await openSheet('CH-8502')).getByRole('button', { name: 'Leave team' }));
      await waitFor(() => expect(writes.leaveTeam).toHaveBeenCalledTimes(1));
      expect(writes.refresh).toHaveBeenCalled();
    });

    it('81901 CH-8017 leaving that fails says so, with Retry', async () => {
      const { user } = phone({ data: playerData(true), writes: { leaveTeam: vi.fn(() => fail()) } });
      await openRow(user, /^Golf profile/);
      await user.click(await screen.findByRole('button', { name: 'Leave team' }));
      await user.click(within(await openSheet('CH-8502')).getByRole('button', { name: 'Leave team' }));
      await expectCode('CH-8017', /leave the team/);
    });

    it('81901 CH-8503 New code asks first; Cancel keeps the code, Replace makes a new one', async () => {
      const { user, writes } = phone();
      await openRow(user, /^Team/);
      const invite = await screen.findByRole('region', { name: 'Invite players' });
      expect(within(invite).getByText('K7M2Q9XA')).toBeTruthy();
      hapticSpy.mockClear();
      await user.click(within(invite).getByRole('button', { name: 'New code' }));
      await waitFor(() => expect(sheetOf('CH-8503')).not.toBeNull());
      expect(hapticSpy).toHaveBeenCalledWith('warning');
      const ask = sheetOf('CH-8503')!;
      expect(within(ask).getByText(/K7M2Q9XA stops working right away/)).toBeTruthy();
      await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
      expect(writes.regenerateCode).not.toHaveBeenCalled();
      await user.click(within(invite).getByRole('button', { name: 'New code' }));
      await user.click(within(await openSheet('CH-8503')).getByRole('button', { name: 'Replace code' }));
      await waitFor(() => expect(writes.regenerateCode).toHaveBeenCalledTimes(1));
      expect(await within(invite).findByText('R4T8W2PL')).toBeTruthy();
    });

    it('81901 CH-8012 a new code that fails leaves the old one on screen', async () => {
      const { user } = phone({ writes: { regenerateCode: vi.fn(() => Promise.resolve({ success: false, error: 'nope' })) } });
      await openRow(user, /^Team/);
      const invite = await screen.findByRole('region', { name: 'Invite players' });
      await user.click(within(invite).getByRole('button', { name: 'New code' }));
      await user.click(within(await openSheet('CH-8503')).getByRole('button', { name: 'Replace code' }));
      await expectCode('CH-8012', /invite code/);
      expect(within(invite).getByText('K7M2Q9XA')).toBeTruthy();
    });

    it('81901 CH-8505 Turn off CoachHelm asks first; Cancel leaves the switch on', async () => {
      const { user, writes } = phone();
      await openRow(user, /^CoachHelm/);
      const power = await screen.findByRole('region', { name: 'CoachHelm' });
      const dash = within(power).getByRole('switch', { name: 'CoachHelm on your dashboards' });
      hapticSpy.mockClear();
      await user.click(dash);
      await waitFor(() => expect(sheetOf('CH-8505')).not.toBeNull());
      expect(hapticSpy).toHaveBeenCalledWith('warning');
      const ask = sheetOf('CH-8505')!;
      expect(writes.setCoachHelmCoach).not.toHaveBeenCalled();
      await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
      expect(dash).toBeChecked();
      expect(writes.setCoachHelmCoach).not.toHaveBeenCalled();
      await user.click(dash);
      await user.click(within(await openSheet('CH-8505')).getByRole('button', { name: 'Turn off CoachHelm' }));
      await waitFor(() => expect(writes.setCoachHelmCoach).toHaveBeenCalledWith({ enabled: false }));
      await waitFor(() => expect(within(power).getByRole('switch', { name: 'CoachHelm on your dashboards' })).not.toBeChecked());
      // Turning it back on needs no question.
      await user.click(within(power).getByRole('switch', { name: 'CoachHelm on your dashboards' }));
      await waitFor(() => expect(writes.setCoachHelmCoach).toHaveBeenCalledWith({ enabled: true }));
    });
  });

  describe('Team', () => {
    it('81901 CH-8014 a choice opens a bottom sheet of options and saves as it is picked, with a tick', async () => {
      const { user, writes } = phone();
      await openRow(user, /^Team/);
      const scoring = await screen.findByRole('region', { name: 'Scoring and format' });
      expect(within(scoring).getByRole('button', { name: /^Handicap system USGA Handicap/ })).toBeTruthy();
      await user.click(within(scoring).getByRole('button', { name: /^Handicap system/ }));
      const sheet = dialog('Handicap system');
      expect(within(sheet).getByRole('radio', { name: 'USGA Handicap' })).toHaveAttribute('aria-checked', 'true');
      hapticSpy.mockClear();
      await user.click(within(sheet).getByRole('radio', { name: 'World Handicap System' }));
      expect(hapticSpy).toHaveBeenCalledWith('select');
      await waitFor(() => expect(writes.saveScoring).toHaveBeenCalledWith({ scoringFormat: 'stroke_play', handicapSystem: 'world', defaultTees: 'blue', timezone: 'America/New_York' }));
      expect(within(scoring).getByRole('button', { name: /^Handicap system World Handicap System/ })).toBeTruthy();
      // The timezone lives in Team details and saves with the same record, on top of the choice just made.
      const details = screen.getByRole('region', { name: 'Team details' });
      await waitFor(() => expect(within(details).getByRole('button', { name: /^Team timezone/ })).toBeEnabled());
      await user.click(within(details).getByRole('button', { name: /^Team timezone/ }));
      await user.click(within(dialog('Team timezone')).getByRole('radio', { name: 'Pacific (PT)' }));
      await waitFor(() => expect(writes.saveScoring).toHaveBeenLastCalledWith({ scoringFormat: 'stroke_play', handicapSystem: 'world', defaultTees: 'blue', timezone: 'America/Los_Angeles' }));
    });

    it('81901 CH-8014 while a scoring choice is saving, the other choices wait, so none is sent on top of one that has not landed', async () => {
      let resolve: (v: ChResult) => void = () => {};
      const saveScoring = vi.fn(() => new Promise<ChResult>((r) => (resolve = r)));
      const { user } = phone({ writes: { saveScoring } });
      await openRow(user, /^Team/);
      const scoring = await screen.findByRole('region', { name: 'Scoring and format' });
      await user.click(within(scoring).getByRole('button', { name: /^Default tees/ }));
      await user.click(within(dialog('Default tees')).getByRole('radio', { name: 'Gold' }));
      await waitFor(() => expect(saveScoring).toHaveBeenCalledTimes(1));
      for (const name of [/^Scoring format/, /^Handicap system/, /^Default tees/]) expect(within(scoring).getByRole('button', { name })).toBeDisabled();
      expect(within(screen.getByRole('region', { name: 'Team details' })).getByRole('button', { name: /^Team timezone/ })).toBeDisabled();
      await act(async () => resolve({ success: true }));
      await waitFor(() => expect(within(scoring).getByRole('button', { name: /^Scoring format/ })).toBeEnabled());
      expect(within(scoring).getByRole('button', { name: /^Default tees Gold/ })).toBeTruthy();
    });

    it('81901 CH-8014 81302 a choice that fails to save goes back and says so', async () => {
      const { user } = phone({ writes: { saveScoring: vi.fn(() => fail()) } });
      await openRow(user, /^Team/);
      const scoring = await screen.findByRole('region', { name: 'Scoring and format' });
      await user.click(within(scoring).getByRole('button', { name: /^Default tees/ }));
      await user.click(within(dialog('Default tees')).getByRole('radio', { name: 'Gold' }));
      await expectCode('CH-8014', /Couldn't save scoring settings/);
      await waitFor(() => expect(within(scoring).getByRole('button', { name: /^Default tees Blue/ })).toBeTruthy());
    });

    it('81901 CH-8011 CH-8108 Team name opens the details sheet with the season and school; a cleared name keeps Save off', async () => {
      const { user, writes } = phone();
      await openRow(user, /^Team/);
      const details = await screen.findByRole('region', { name: 'Team details' });
      await user.click(within(details).getByRole('button', { name: /^Team name Varsity/ }));
      const sheet = dialog('Team details');
      expect(within(sheet).getByLabelText('Season')).toHaveValue('2026–27');
      expect(within(sheet).getByLabelText('Conference')).toHaveValue('ACC');
      expect(within(sheet).getByRole('button', { name: 'Save' })).toBeDisabled();
      await user.clear(within(sheet).getByLabelText('Team name'));
      await expectCode('CH-8108', /needs a name/);
      expect(within(sheet).getByRole('button', { name: 'Save' })).toBeDisabled();
      await user.type(within(sheet).getByLabelText('Team name'), 'Varsity A');
      await user.click(within(sheet).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(writes.saveTeam).toHaveBeenCalledWith(expect.objectContaining({ name: 'Varsity A', season: '2026–27' })));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Team details' })).toBeNull());
    });

    it('81901 CH-8015 CH-8111 a reminder time is a slider in a sheet; a first reminder that is not before the final one is refused', async () => {
      const data = { ...coachData(), reminders: ok({ enabled: true, earlyHours: 24, lateMinutes: 60 }) };
      const { user, writes } = phone({ data });
      await openRow(user, /^Team/);
      const group = await screen.findByRole('region', { name: 'Event reminders' });
      expect(within(group).getByRole('button', { name: /^First reminder 1 day before/ })).toBeTruthy();
      expect(within(group).getByRole('button', { name: /^Final reminder 1 hour before/ })).toBeTruthy();
      await user.click(within(group).getByRole('button', { name: /^First reminder/ }));
      const sheet = dialog('First reminder');
      expect(within(sheet).getByRole('button', { name: 'Save' })).toBeDisabled();
      fireEvent.change(within(sheet).getByRole('slider', { name: 'First reminder' }), { target: { value: '48' } });
      expect(within(sheet).getByRole('button', { name: 'Save' })).toBeEnabled();
      await user.click(within(sheet).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(writes.saveReminders).toHaveBeenCalledWith({ enabled: true, earlyHours: 48, lateMinutes: 60 }));
      await waitFor(() => expect(within(group).getByRole('button', { name: /^First reminder 2 days before/ })).toBeTruthy());
      // With the first reminder 2 hours out, a final reminder 4 hours out would come before it.
      await user.click(within(group).getByRole('button', { name: /^First reminder/ }));
      fireEvent.change(within(dialog('First reminder')).getByRole('slider', { name: 'First reminder' }), { target: { value: '2' } });
      await user.click(within(dialog('First reminder')).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(within(group).getByRole('button', { name: /^First reminder 2 hours before/ })).toBeTruthy());
      await user.click(within(group).getByRole('button', { name: /^Final reminder/ }));
      fireEvent.change(within(dialog('Final reminder')).getByRole('slider', { name: 'Final reminder' }), { target: { value: '240' } });
      await expectCode('CH-8111', /first reminder has to come before the final one/);
      expect(within(dialog('Final reminder')).getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('81901 CH-8015 Send reminders saves as it flips and goes back if the save fails; the times appear only while it is on', async () => {
      const saveReminders = vi.fn(() => fail());
      const { user } = phone({ writes: { saveReminders } });
      await openRow(user, /^Team/);
      const group = await screen.findByRole('region', { name: 'Event reminders' });
      expect(within(group).getByRole('button', { name: /^First reminder/ })).toBeTruthy();
      await user.click(within(group).getByRole('switch', { name: 'Send reminders' }));
      await expectCode('CH-8015', /reminder schedule/);
      expect(saveReminders).toHaveBeenCalledWith({ enabled: false, earlyHours: 24, lateMinutes: 60 });
      await waitFor(() => expect(within(group).getByRole('switch', { name: 'Send reminders' })).toBeChecked());
    });

    it('81901 CH-8301 a coach with no team sees why Team is empty', async () => {
      const { user } = phone({ data: { ...coachData(), teamId: null, teamName: null, team: null, joinCode: null, scoring: null, reminders: null } });
      await openRow(user, /^Team/);
      await expectCode('CH-8301', /aren't on a team yet/);
    });

    it('81901 CH-8205 CH-8207 CH-8206 CH-8208 a read that failed is named in its place, and the rest of Team still works', async () => {
      const { user } = phone({ data: { ...coachData(), team: failedRead, scoring: failedRead, joinCode: failedRead, reminders: failedRead } });
      await openRow(user, /^Team/);
      await expectCode('CH-8205', /Team details didn't load/);
      await expectCode('CH-8206', /invite code didn't load/);
      await expectCode('CH-8207', /Scoring settings didn't load/);
      await expectCode('CH-8208', /Event reminders didn't load/);
      expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    });

    it('81901 CH-8013 CH-8705 Share opens the share sheet; without one it copies the join link, and says how to do it by hand when copying fails', async () => {
      const share = vi.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'share', { configurable: true, value: share });
      const first = phone();
      await openRow(first.user, /^Team/);
      await first.user.click(await screen.findByRole('button', { name: 'Share' }));
      expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: 'Join with code K7M2Q9XA', url: expect.stringContaining('/golf/join/K7M2Q9XA') }));
      first.unmount();
      delete (navigator as unknown as Record<string, unknown>).share;

      const second = phone();
      const writeText = vi.fn(() => Promise.resolve());
      // After setup: user-event installs its own clipboard when it starts.
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
      await openRow(second.user, /^Team/);
      hapticSpy.mockClear();
      await second.user.click(await screen.findByRole('button', { name: 'Share' }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/golf/join/K7M2Q9XA')));
      expect(hapticSpy).toHaveBeenCalledWith('success');
      writeText.mockImplementationOnce(() => Promise.reject(new Error('denied')));
      await second.user.click(screen.getByRole('button', { name: 'Share' }));
      await expectCode('CH-8013', /Couldn't copy/);
    });
  });

  describe('CoachHelm', () => {
    it('81901 CH-8405 CH-8022 every desktop control is a row: switches, pickers that save as they are picked, and sliders at full width', async () => {
      const savePhilosophy = vi.fn((id: string | null) => Promise.resolve({ success: true, data: { id: id ?? 'ph1' } }));
      const { user } = phone({ writes: { savePhilosophy } });
      await openRow(user, /^CoachHelm/);
      await screen.findByRole('list', { name: 'Priorities, most important first' });
      expect(code('CH-8405')!.textContent).toBe('Changes save as you make them');
      // Sensitivity is a picker row.
      await user.click(screen.getByRole('button', { name: /^Alert sensitivity/ }));
      await user.click(within(dialog('Alert sensitivity')).getByRole('radio', { name: 'More alerts' }));
      await waitFor(() => expect(savePhilosophy).toHaveBeenCalledWith('ph1', { alertSensitivity: 'aggressive' }));
      await waitFor(() => expect(code('CH-8405')!.textContent).toBe('All changes saved'));
      // An alert is a switch row; a slider row holds its label, value and slider.
      await user.click(screen.getByRole('switch', { name: 'Performance plateau' }));
      await waitFor(() => expect(savePhilosophy).toHaveBeenCalledWith('ph1', { alertPlateau: true }));
      const rounds = screen.getByRole('slider', { name: 'Minimum rounds' });
      expect(rounds.closest('.ch-setm-row')?.className).toContain('is-slider');
      expect(screen.getByText('Rounds a player needs before CoachHelm says anything about them.')).toBeTruthy();
      // Alerts, thresholds, windows and display are all here.
      for (const name of ['Decline threshold', 'Pressure gap', 'Bubble zone', 'Minimum confidence', 'Hole ranking', 'Pattern lookback']) expect(screen.getByRole('slider', { name })).toBeTruthy();
      for (const name of [/^Alert delivery/, /^Stats comparison/, /^Insight detail/]) expect(screen.getByRole('button', { name })).toBeTruthy();
      for (const name of ['Show strokes gained', 'Show advanced statistics', 'Insights', 'Predictions', 'Patterns']) expect(screen.getByRole('switch', { name })).toBeTruthy();
    });

    it('81901 CH-8021 an assistant coach sees the team switch locked, with the reason; the head coach can change it', async () => {
      const first = phone({ data: assistantData() });
      // An assistant coach is "Coach", not "Head coach".
      expect(screen.getByRole('button', { name: 'Maya Reyes Coach · Varsity' })).toBeTruthy();
      await openRow(first.user, /^CoachHelm/);
      const power = await screen.findByRole('region', { name: 'CoachHelm' });
      expect(within(power).getByRole('switch', { name: 'CoachHelm for the whole team' })).toBeDisabled();
      expect(within(power).getByText('Only the head coach can change this.')).toBeTruthy();
      first.unmount();

      const head = phone({ writes: { setCoachHelmTeam: vi.fn(() => fail()) } });
      await openRow(head.user, /^CoachHelm/);
      await head.user.click(await screen.findByRole('switch', { name: 'CoachHelm for the whole team' }));
      await expectCode('CH-8021', /for the team/);
    });

    it('81901 CH-8211 a CoachHelm read that failed says so with Try again, and shows none of the controls', async () => {
      const { user, writes } = phone({ data: { ...coachData(), coachhelm: failedRead } });
      await openRow(user, /^CoachHelm/);
      await expectCode('CH-8211', /CoachHelm settings didn't load/);
      expect(screen.queryByRole('list', { name: 'Priorities, most important first' })).toBeNull();
      await user.click(within(code('CH-8211') as HTMLElement).getByRole('button', { name: 'Try again' }));
      expect(writes.refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('a player without a team', () => {
    it('81901 CH-8302 CH-8018 82001 Join a team is a sheet: the code is upper-cased, Enter asks, and a refused code says why', async () => {
      const { user, writes } = phone({ data: playerData(false, false), writes: { requestJoin: vi.fn(() => fail('That code does not match a team.')) } });
      await openRow(user, /^Golf profile/);
      await expectCode('CH-8302');
      await user.click(await screen.findByRole('button', { name: /^Invite code/ }));
      const sheet = dialog('Join a team');
      expect(within(sheet).getByRole('button', { name: 'Send' })).toBeDisabled();
      await user.type(within(sheet).getByLabelText('Invite code'), 'abc123{Enter}');
      await waitFor(() => expect(writes.requestJoin).toHaveBeenCalledWith('ABC123', ''));
      await expectCode('CH-8018', /does not match a team/);
    });

    it('81901 CH-8303 CH-8019 a request that is waiting shows its date and can be cancelled', async () => {
      const { user, writes } = phone({ data: playerData(false, true) });
      await openRow(user, /^Golf profile/);
      await expectCode('CH-8303', /Waiting on Wake Forest Golf/);
      expect(within(code('CH-8303') as HTMLElement).getByText(/^Sent /)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Invite code/ })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(writes.cancelRequest).toHaveBeenCalledWith('rq1'));
      await waitFor(() => expect(code('CH-8303')).toBeNull());
    });

    it('81901 CH-8209 CH-8210 golf details and membership reads that failed are named in their place', async () => {
      const { user } = phone({ data: { ...playerData(true), golf: failedRead, membership: failedRead } });
      await openRow(user, /^Golf profile/);
      await expectCode('CH-8209', /golf details didn't load/);
      await expectCode('CH-8210', /team membership didn't load/);
    });
  });

  it('81901 CH-1903 a switch flipped while offline is refused at once and never sent', async () => {
    const restore = goOffline();
    try {
      const { user, writes } = phone();
      await openRow(user, /^Notifications/);
      await user.click(await screen.findByRole('switch', { name: 'Quiet mode' }));
      await expectCode('CH-1903', /offline/);
      expect(writes.setDelivery).not.toHaveBeenCalled();
      expect(screen.getByRole('switch', { name: 'Quiet mode' })).not.toBeChecked();
    } finally {
      restore();
    }
  });

  it('81901 CH-8403 a switch that is saving holds its position and cannot be flipped again', async () => {
    let resolve: (v: ChResult) => void = () => {};
    const setDelivery = vi.fn(() => new Promise<ChResult>((r) => (resolve = r)));
    const { user } = phone({ writes: { setDelivery } });
    await openRow(user, /^Notifications/);
    await user.click(await screen.findByRole('switch', { name: 'Quiet mode' }));
    expect(screen.getByRole('switch', { name: 'Quiet mode' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Quiet mode' })).toBeDisabled();
    expect(code('CH-8403')).not.toBeNull();
    await act(async () => resolve({ success: true }));
    await waitFor(() => expect(code('CH-8403')).toBeNull());
  });

  it('81901 CH-8608 Preferences keeps Animations and, in the app, Haptics on this device', async () => {
    const { user } = phone();
    await openRow(user, /^Preferences/);
    await user.click(await screen.findByRole('switch', { name: 'Animations' }));
    expect(JSON.parse(localStorage.getItem('golf_appearance_preferences') ?? '{}').show_animations).toBe(false);
    expect(screen.getByRole('switch', { name: 'Haptics' })).toBeChecked();
  });

  it('81901 CH-8024 CH-8025 Sign out that fails says so, and Report a problem falls back to email', async () => {
    const { user, writes } = phone({ writes: { signOut: vi.fn(() => Promise.reject(new Error('network'))) } });
    await user.click(screen.getByRole('button', { name: 'Report a problem' }));
    await expectCode('CH-8025', /Opening email/);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await expectCode('CH-8024', /sign you out/);
    expect(writes.signOut).toHaveBeenCalledTimes(1);
  });

  it('81901 CH-8401 the loading skeleton has a phone version of the list, switched in CSS', () => {
    render(<SettingsSkeleton />);
    const skel = document.querySelector('.ch-setm-skel');
    expect(skel).not.toBeNull();
    expect(skel!.querySelectorAll('.ch-setm-row')).toHaveLength(5);
    expect(document.querySelector('.ch-set-skel-desk')).not.toBeNull();
  });

  it('81901 CH-8212 a section that crashes is named, and the list and tab bar still work', async () => {
    const boom = { ...coachData(), delivery: { value: null as unknown as Record<string, boolean>, error: false as const } };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { user } = phone({ data: boom });
    await openRow(user, /^Notifications/);
    await expectCode('CH-8212', /Notifications couldn.t be shown/);
    spy.mockRestore();
    await user.click(top().getByRole('button', { name: 'Back to Settings' }));
    await screen.findByRole('navigation', { name: 'Settings sections' });
  });
});

describe('Settings · this file', () => {
  it('82401 every catalog row of kinds 0 to 5 is named by a test here, and so is every Bridge ID this page proves', () => {
    const root = process.cwd();
    const tests = ['settings.test.tsx', 'settings-server.test.tsx'].map((f) => readFileSync(join(root, 'src/clubhouse/__tests__', f), 'utf8'));
    const all = tests.join('\n');
    const catalog = readFileSync(join(root, 'docs/clubhouse/catalog/settings.md'), 'utf8');
    const missing = [...catalog.matchAll(/^\|\s*CH-(80|81|82|83|84|85)(\d{2})\s*\|.*$/gm)]
      .filter((m) => !/\|\s*preview\s*\|\s*$/.test(m[0].trim()))
      .map((m) => `CH-${m[1]}${m[2]}`)
      .filter((c) => !all.includes(c));
    expect(missing).toEqual([]);
    const bridge = JSON.parse(readFileSync(join(root, 'config/clubhouse/bridge-contracts.json'), 'utf8')) as Array<{ id: number; page: string; chCode?: string; status: string }>;
    const titles = all.split('\n').filter((l) => /^\s*(it|describe)(\.each\(.*\))?\(/.test(l));
    const unnamed = bridge.filter((r) => r.page === 'P008' && !r.chCode && r.status === 'implemented').filter((r) => !titles.some((l) => l.includes(String(r.id))));
    expect(unnamed.map((r) => r.id)).toEqual([]);
  });
});
