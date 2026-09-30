import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LazyMotion, domAnimation } from 'framer-motion';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

import { ToastProvider } from '../ui/Toast';
import { SettingsView } from '../screens/settings/SettingsView';
import { SettingsSkeleton } from '../screens/settings/SettingsSkeleton';
import { parseSection, SECTIONS, type ChCoachHelmSettings, type ChDevice, type ChResult, type ChSettingsData, type ChSettingsSection, type ChSettingsWrites } from '../screens/settings/model';
import { coachData, failedRead, playerData } from '../preview/fixtures-settings';
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
