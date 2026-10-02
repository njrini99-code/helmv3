import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Settings, Team: the coaching staff (swap audit section 14, D1). The staff list, the assistants waiting to be
 * approved, and staff invites, on the reads and writes Fairway's Team page uses. Who may do what is the server's call,
 * so the fakes answer as the server does: an assistant's requests read and invite are refused.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
const track = vi.hoisted(() => ({ report: vi.fn(), trail: vi.fn() }));
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: track.report, chTrail: track.trail, chTagSession: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ getFeedback: () => undefined, addBreadcrumb: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));

import { ToastProvider } from '../ui/Toast';
import { PhoneChromeProvider } from '../shell/phone-chrome';
import { SettingsView } from '../screens/settings/SettingsView';
import type { ChDevice, ChPendingCoach, ChResult, ChSettingsWrites, ChStaffMember, ChStaffWrites } from '../screens/settings/model';
import { coachData } from '../preview/fixtures-settings';
import './dialog-polyfill';

const HEAD: ChStaffMember = { coachId: 'maya', fullName: 'Maya Reyes', title: 'Head Coach', role: 'head_coach' };
const ASSISTANT: ChStaffMember = { coachId: 'dev', fullName: 'Devon Park', title: 'Director of Golf', role: 'assistant_coach' };
const WAITING: ChPendingCoach = { coachId: 'avery', fullName: 'Avery Lee', email: 'avery@unc.edu' };
const NAMELESS: ChPendingCoach = { coachId: 'sam', fullName: null, email: 'sam@unc.edu' };
const INVITE = { token: 'tok123', code: 'STAFF7QX', role: 'coach' as const, hours: 72 };

const ok = (): Promise<ChResult> => Promise.resolve({ success: true });
const refused = (error: string): Promise<ChResult<never>> => Promise.resolve({ success: false, error });

function staffWrites(over: Partial<ChStaffWrites> = {}): ChStaffWrites {
  return {
    list: vi.fn(() => Promise.resolve({ success: true, data: [HEAD, ASSISTANT] })),
    pending: vi.fn(() => Promise.resolve({ success: true, data: [WAITING] })),
    invite: vi.fn(() => Promise.resolve({ success: true, data: INVITE })),
    approve: vi.fn(ok),
    decline: vi.fn(ok),
    ...over,
  };
}

function makeWrites(staff: ChStaffWrites): ChSettingsWrites {
  return {
    saveProfile: vi.fn(ok),
    uploadAvatar: vi.fn(() => Promise.resolve({ success: true, data: { url: 'https://x.test/a.png' } })),
    changeEmail: vi.fn(ok),
    changePassword: vi.fn(ok),
    setDelivery: vi.fn(ok),
    setDigest: vi.fn(ok),
    setRoutingCell: vi.fn(ok),
    setRoutingAll: vi.fn(ok),
    setRoutingQuiet: vi.fn(ok),
    saveScoring: vi.fn(ok),
    saveReminders: vi.fn(ok),
    saveTeam: vi.fn(ok),
    regenerateCode: vi.fn(() => Promise.resolve({ success: true, data: { joinCode: 'R4T8W2PL' } })),
    saveGolf: vi.fn(ok),
    leaveTeam: vi.fn(ok),
    requestJoin: vi.fn(ok),
    cancelRequest: vi.fn(ok),
    setCoachHelmCoach: vi.fn(ok),
    setCoachHelmTeam: vi.fn(ok),
    savePhilosophy: vi.fn((id: string | null) => Promise.resolve({ success: true, data: { id: id ?? 'ph1' } })),
    deleteAccount: vi.fn(ok),
    signOut: vi.fn(() => Promise.resolve()),
    cleanupAfterDelete: vi.fn(() => Promise.resolve()),
    refresh: vi.fn(),
    staff,
  };
}

const device: ChDevice = { native: false, push: { status: 'unsubscribed', pending: false, subscribe: vi.fn(), unsubscribe: vi.fn() } as unknown as ChDevice['push'] };

function show(staff: ChStaffWrites = staffWrites()) {
  const user = userEvent.setup();
  const writes = makeWrites(staff);
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <PhoneChromeProvider>
          <div className="ch-root" data-ui="clubhouse">
            <SettingsView data={coachData()} writes={writes} device={device} initialSection="team" onDeleted={vi.fn()} />
          </div>
        </PhoneChromeProvider>
      </ToastProvider>
    </LazyMotion>,
  );
  return { user, writes, staff };
}

const card = (name: string) => screen.findByRole('region', { name });
const noCard = (name: string) => expect(screen.queryByRole('region', { name })).toBeNull();

beforeEach(() => {
  hapticSpy.mockClear();
  track.report.mockClear();
});

describe('Settings · Team · coaching staff (D1)', () => {
  it('shows the staff with their roles, the assistants waiting, and the invite card to a head coach', async () => {
    show();
    const staff = await card('Coaching staff');
    expect(within(staff).getByText('Maya Reyes')).toBeTruthy();
    expect(within(staff).getByText('Devon Park')).toBeTruthy();
    expect(within(staff).getByText('Head coach')).toBeTruthy();
    expect(within(staff).getByText('Assistant coach')).toBeTruthy();
    // A title that only repeats the role pill ("Head Coach" beside "Head coach") is dropped; one that says more stays.
    expect(within(staff).queryByText('Head Coach')).toBeNull();
    expect(within(staff).getByText('Director of Golf')).toBeTruthy();

    const requests = await card('Assistant coach requests');
    expect(within(requests).getByText('Avery Lee')).toBeTruthy();
    expect(within(requests).getByText('avery@unc.edu')).toBeTruthy();
    expect(within(requests).getByText('1')).toBeTruthy();

    const invites = await card('Staff invitations');
    expect(within(invites).getByRole('radiogroup', { name: 'Staff role' })).toBeTruthy();
    expect(within(invites).getByRole('button', { name: 'Create invite' })).toBeTruthy();
  });

  it('a name-less request shows the email as its name', async () => {
    show(staffWrites({ pending: vi.fn(() => Promise.resolve({ success: true, data: [NAMELESS] })) }));
    const requests = await card('Assistant coach requests');
    expect(within(requests).getByText('sam@unc.edu')).toBeTruthy();
  });
});

describe('Settings · Team · CH-8026 CH-8027 approving and declining (D1)', () => {
  it('Approve calls approve with the coach, tells who was approved, drops the row and reads the staff again', async () => {
    const { user, staff } = show();
    const requests = await card('Assistant coach requests');
    expect(staff!.list).toHaveBeenCalledTimes(1);
    vi.mocked(staff!.pending).mockResolvedValue({ success: true, data: [] });
    await user.click(within(requests).getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(staff!.approve).toHaveBeenCalledWith('avery'));
    expect(staff!.decline).not.toHaveBeenCalled();
    expect(await screen.findByText('Avery Lee is now an assistant coach')).toBeTruthy();
    await waitFor(() => noCard('Assistant coach requests'));
    await waitFor(() => expect(staff!.list).toHaveBeenCalledTimes(2));
    expect(hapticSpy).toHaveBeenCalledWith('success');
  });

  it('a refused approval says so with the reason, keeps the row, and Retry sends it again', async () => {
    const approve = vi.fn().mockImplementationOnce(() => refused('Only a head coach of this team can do that.')).mockImplementationOnce(ok);
    const { user } = show(staffWrites({ approve }));
    const requests = await card('Assistant coach requests');
    await user.click(within(requests).getByRole('button', { name: 'Approve' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Couldn't approve Avery Lee/);
    expect(alert.textContent).toMatch(/Only a head coach of this team can do that/);
    expect(within(requests).getByText('Avery Lee')).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(document.querySelector('[data-ch-code="CH-8026"]')).not.toBeNull();
    expect(track.report).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ action: 'settings.approveAssistant' }));

    // The toast moves into the page's dialog layer once it is up, so the button is found again.
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(2));
    expect(approve).toHaveBeenLastCalledWith('avery');
  });

  it('Decline calls decline with the coach and tells who was declined', async () => {
    const { user, staff } = show();
    const requests = await card('Assistant coach requests');
    vi.mocked(staff!.pending).mockResolvedValue({ success: true, data: [] });
    await user.click(within(requests).getByRole('button', { name: 'Decline' }));

    await waitFor(() => expect(staff!.decline).toHaveBeenCalledWith('avery'));
    expect(staff!.approve).not.toHaveBeenCalled();
    expect(await screen.findByText('Declined Avery Lee')).toBeTruthy();
    await waitFor(() => noCard('Assistant coach requests'));
  });

  it('a failed decline shows the error and keeps the row', async () => {
    const { user } = show(staffWrites({ decline: vi.fn(() => refused('We could not decline that request.')) }));
    const requests = await card('Assistant coach requests');
    await user.click(within(requests).getByRole('button', { name: 'Decline' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Couldn't decline Avery Lee/);
    expect(alert.textContent).toMatch(/could not decline that request/);
    expect(document.querySelector('[data-ch-code="CH-8027"]')).not.toBeNull();
    expect(within(requests).getByText('Avery Lee')).toBeTruthy();
  });

  it('one request is decided at a time: both buttons wait while one is saving', async () => {
    let finish: (r: ChResult) => void = () => {};
    const { user } = show(staffWrites({ approve: vi.fn(() => new Promise<ChResult>((r) => (finish = r))) }));
    const requests = await card('Assistant coach requests');
    await user.click(within(requests).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(within(requests).getByRole('button', { name: 'Approving…' })).toBeDisabled());
    expect(within(requests).getByRole('button', { name: 'Decline' })).toBeDisabled();
    finish({ success: true });
    await waitFor(() => noCard('Assistant coach requests'));
  });
});

describe('Settings · Team · CH-8028 staff invitations (D1)', () => {
  it('Create invite calls invite for an assistant coach, shows the code, and Copy copies the code and the link', async () => {
    const { user, staff } = show();
    const invites = await card('Staff invitations');
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    expect(within(invites).getByRole('radio', { name: 'Assistant coach' })).toBeChecked();
    await user.click(within(invites).getByRole('button', { name: 'Create invite' }));

    await waitFor(() => expect(staff!.invite).toHaveBeenCalledWith('coach'));
    expect(await within(invites).findByText('STAFF7QX')).toBeTruthy();
    expect(invites.textContent).toMatch(/Assistant coach invite · works for 72 hours/);

    await user.click(within(invites).getByRole('button', { name: 'Copy staff code' }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith('STAFF7QX'));
    expect(await screen.findByText('Staff code copied')).toBeTruthy();
    await user.click(within(invites).getByRole('button', { name: 'Copy staff invite link' }));
    await waitFor(() => expect(copy).toHaveBeenLastCalledWith(`${window.location.origin}/golf/staff/join/tok123`));
    expect(await screen.findByText('Staff invite link copied')).toBeTruthy();
    copy.mockRestore();
  });

  it('a Program admin invite asks for the admin role and says what it grants', async () => {
    const invite = vi.fn(() => Promise.resolve({ success: true, data: { ...INVITE, role: 'admin' as const } }));
    const { user } = show(staffWrites({ invite }));
    const invites = await card('Staff invitations');
    expect(invites.textContent).toMatch(/Coaching access to this team only/);
    await user.click(within(invites).getByRole('radio', { name: 'Program admin' }));
    expect(invites.textContent).toMatch(/Head-coach access across every team in the program/);
    await user.click(within(invites).getByRole('button', { name: 'Create invite' }));
    await waitFor(() => expect(invite).toHaveBeenCalledWith('admin'));
    await waitFor(() => expect(invites.textContent).toMatch(/Program admin invite/));
  });

  it('a refused invite shows the server reason as the error, with no code, and clears the one before it', async () => {
    const invite = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve({ success: true, data: INVITE }))
      .mockImplementationOnce(() => refused('Only a head coach of this team can invite staff.'));
    const { user } = show(staffWrites({ invite }));
    const invites = await card('Staff invitations');
    await user.click(within(invites).getByRole('button', { name: 'Create invite' }));
    expect(await within(invites).findByText('STAFF7QX')).toBeTruthy();
    await user.click(within(invites).getByRole('button', { name: 'Create invite' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Couldn't make the assistant coach invite/);
    expect(alert.textContent).toMatch(/Only a head coach of this team can invite staff/);
    expect(within(invites).queryByText('STAFF7QX')).toBeNull();
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(document.querySelector('[data-ch-code="CH-8028"]')).not.toBeNull();
    expect(track.report).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ action: 'settings.createStaffInvite' }));
  });

  it('an invite with no short code still gives the link', async () => {
    const { user } = show(staffWrites({ invite: vi.fn(() => Promise.resolve({ success: true, data: { ...INVITE, code: null } })) }));
    const invites = await card('Staff invitations');
    await user.click(within(invites).getByRole('button', { name: 'Create invite' }));
    expect(await within(invites).findByText(/No code this time/)).toBeTruthy();
    expect(within(invites).queryByRole('button', { name: 'Copy staff code' })).toBeNull();
    expect(within(invites).getByRole('button', { name: 'Copy staff invite link' })).toBeTruthy();
  });

  it('a copy the browser blocks says so (CH-8013)', async () => {
    const { user } = show();
    const invites = await card('Staff invitations');
    await user.click(within(invites).getByRole('button', { name: 'Create invite' }));
    await within(invites).findByText('STAFF7QX');
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    await user.click(within(invites).getByRole('button', { name: 'Copy staff code' }));
    await waitFor(() => expect(document.querySelector('[data-ch-code="CH-8013"]')).not.toBeNull());
    expect(document.querySelector('[data-ch-code="CH-8013"]')!.textContent).toMatch(/Couldn't copy/);
    copy.mockRestore();
  });
});

describe('Settings · Team · CH-8213 what the server refuses or cannot read (D1)', () => {
  it('an assistant sees the staff but no requests and no invite card, and the refused requests read is not reported', async () => {
    const asAssistant: ChStaffMember[] = [{ ...HEAD, coachId: 'someone-else' }, { ...ASSISTANT, coachId: 'maya', fullName: 'Maya Reyes' }];
    show(
      staffWrites({
        list: vi.fn(() => Promise.resolve({ success: true, data: asAssistant })),
        pending: vi.fn(() => refused('Only a head coach of this team can do that.')),
      }),
    );
    await card('Coaching staff');
    await waitFor(() => noCard('Staff invitations'));
    noCard('Assistant coach requests');
    expect(track.report).not.toHaveBeenCalled();
  });

  it('a staff read that fails leaves the card out (never a false "no staff"), is reported, and still offers invites', async () => {
    show(staffWrites({ list: vi.fn(() => refused('Could not load the coaching staff. Please try again.')) }));
    await card('Staff invitations');
    noCard('Coaching staff');
    expect(track.report).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ surface: 'settings.staff', action: 'list', severity: 'low' }));
  });

  it('a head coach whose requests read fails is told, reported, and Try again reads it again', async () => {
    const pending = vi.fn().mockImplementationOnce(() => refused('We could not load pending requests.')).mockImplementation(() => Promise.resolve({ success: true, data: [WAITING] }));
    const { user } = show(staffWrites({ pending }));
    const requests = await card('Assistant coach requests');
    expect(requests.textContent).toMatch(/Requests didn't load/);
    expect(document.querySelector('[data-ch-code="CH-8213"]')).not.toBeNull();
    expect(track.report).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ action: 'pending', severity: 'low' }));
    await user.click(within(requests).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Assistant coach requests' })).getByText('Avery Lee')).toBeTruthy());
  });

  it('a read that throws is reported and leaves the card out', async () => {
    show(staffWrites({ list: vi.fn(() => Promise.reject(new Error('network'))) }));
    await card('Staff invitations');
    noCard('Coaching staff');
    expect(track.report).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ surface: 'settings.staff', action: 'list' }));
  });
});

describe('Settings · phone · Team · coaching staff (D1)', () => {
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
    // A section named in the address opens pushed on the phone.
    window.history.replaceState(null, '', '/golf/dashboard/settings?section=team');
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    window.history.replaceState(null, '', '/');
  });

  /** The phone opens straight onto Team: the address names it. */
  async function openTeam(staff?: ChStaffWrites) {
    const view = show(staff);
    await screen.findByRole('region', { name: 'Invite players' });
    return view;
  }
  const group = (name: string) => screen.findByRole('region', { name });

  it('lists the staff and the requests, and Approve calls approve and drops the row', async () => {
    const { user, staff } = await openTeam();
    const people = await group('Coaching staff');
    expect(people.textContent).toMatch(/Maya Reyes/);
    expect(people.textContent).toMatch(/Head coach/);
    expect(people.textContent).toMatch(/Director of Golf/);
    const requests = await group('Assistant coach requests · 1');
    expect(requests.textContent).toMatch(/avery@unc.edu/);
    vi.mocked(staff!.pending).mockResolvedValue({ success: true, data: [] });
    await user.click(within(requests).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(staff!.approve).toHaveBeenCalledWith('avery'));
    expect(await screen.findByText('Avery Lee is now an assistant coach')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('region', { name: /^Assistant coach requests/ })).toBeNull());
  });

  it('CH-8213 a head coach whose requests read fails is told, and Try again reads it again', async () => {
    const pending = vi.fn().mockImplementationOnce(() => refused('We could not load pending requests.')).mockImplementation(() => Promise.resolve({ success: true, data: [WAITING] }));
    const { user } = await openTeam(staffWrites({ pending }));
    const failed = await group('Assistant coach requests');
    expect(failed.getAttribute('data-ch-code')).toBe('CH-8213');
    expect(failed.textContent).toMatch(/Requests didn't load/);
    await user.click(within(failed).getByRole('button', { name: 'Try again' }));
    await group('Assistant coach requests · 1');
    expect(pending).toHaveBeenCalledTimes(2);
  });

  it('a failed Decline shows the error', async () => {
    const { user } = await openTeam(staffWrites({ decline: vi.fn(() => refused('We could not decline that request.')) }));
    const requests = await group('Assistant coach requests · 1');
    await user.click(within(requests).getByRole('button', { name: 'Decline' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Couldn't decline Avery Lee/);
  });

  it('picks the role, makes the invite and shows its code with Copy code and Copy link', async () => {
    const { user, staff } = await openTeam();
    const invites = await group('Staff invitations');
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await user.click(within(invites).getByRole('button', { name: /Staff role/ }));
    const picker = await screen.findByRole('radiogroup', { name: 'Staff role' });
    await user.click(within(picker).getByRole('radio', { name: 'Program admin' }));
    await user.click(within(invites).getByRole('button', { name: 'Create invite' }));

    await waitFor(() => expect(staff!.invite).toHaveBeenCalledWith('admin'));
    expect(await within(invites).findByText('STAFF7QX')).toBeTruthy();
    await user.click(within(invites).getByRole('button', { name: 'Copy code' }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith('STAFF7QX'));
    await user.click(within(invites).getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(copy).toHaveBeenLastCalledWith(`${window.location.origin}/golf/staff/join/tok123`));
    copy.mockRestore();
  });

  it('a refused invite shows the server reason', async () => {
    const { user } = await openTeam(staffWrites({ invite: vi.fn(() => refused('Only a head coach of this team can invite staff.')) }));
    const invites = await group('Staff invitations');
    await user.click(within(invites).getByRole('button', { name: 'Create invite' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Couldn't make the assistant coach invite/);
    expect(alert.textContent).toMatch(/Only a head coach of this team can invite staff/);
  });

  it('an assistant is not offered invites', async () => {
    await openTeam(
      staffWrites({
        list: vi.fn(() => Promise.resolve({ success: true, data: [{ ...ASSISTANT, coachId: 'maya' }] })),
        pending: vi.fn(() => refused('Only a head coach of this team can do that.')),
      }),
    );
    await group('Coaching staff');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Staff invitations' })).toBeNull());
  });
});
