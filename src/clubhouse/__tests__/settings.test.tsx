import { LazyMotion, domAnimation } from 'framer-motion';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Settings: every numbered state in docs/clubhouse/catalog/settings.md is
 * forced here and found by its number (data-ch-code). Writes are fakes, so a
 * failure is a failure of the write, not of the network.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ getFeedback: () => undefined, addBreadcrumb: vi.fn() }));

import { ToastProvider } from '../ui/Toast';
import { SettingsView } from '../screens/settings/SettingsView';
import { SettingsSkeleton } from '../screens/settings/SettingsSkeleton';
import type { ChDevice, ChResult, ChSettingsData, ChSettingsSection, ChSettingsWrites } from '../screens/settings/model';
import { coachData, failedRead, playerData } from '../preview/fixtures-settings';

beforeAll(() => {
  // jsdom has no <dialog> modal API.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  hapticSpy.mockClear();
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

function setup(opts: { data?: ChSettingsData; writes?: Partial<ChSettingsWrites>; section?: ChSettingsSection; device?: ChDevice } = {}) {
  const writes = makeWrites(opts.writes);
  const user = userEvent.setup();
  const utils = render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <SettingsView data={opts.data ?? coachData()} writes={writes} device={opts.device ?? makeDevice()} initialSection={opts.section ?? 'account'} onDeleted={vi.fn()} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
  return { ...utils, writes, user };
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

  it('CH-8005 an email or push switch fails and flips back', async () => {
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

  it('CH-8020 a CoachHelm dashboard switch fails', async () => {
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

  it('CH-8022 a CoachHelm setting fails and reverts', async () => {
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

  it('CH-8701 CH-8702 CH-8703 select, commit and error haptics', async () => {
    const { user } = setup({ section: 'notifications', writes: { setDelivery: vi.fn().mockImplementationOnce(okw).mockImplementationOnce(() => fail()) } });
    await user.click(screen.getByRole('switch', { name: 'Tasks by push' }));
    await waitFor(() => expect(hapticSpy).toHaveBeenCalledWith('commit'));
    expect(hapticSpy).toHaveBeenCalledWith('select');
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
