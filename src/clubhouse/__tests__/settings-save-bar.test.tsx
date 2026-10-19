import { LazyMotion, domAnimation } from 'motion/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Settings saves one honest way (P008, 2026-10-19): a card that needs an explicit save shows its bar only while there is
 * something to save (Unsaved changes, Discard, Save changes), the button is busy while the save is out, a landed save
 * says Saved and lets the bar go, and Cmd/Ctrl+S saves from the card. The team code is one large tabular code with a
 * Copy that says Copied.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ getFeedback: () => undefined, addBreadcrumb: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));

import { ToastProvider } from '../ui/Toast';
import { SettingsView } from '../screens/settings/SettingsView';
import type { ChDevice, ChResult, ChSettingsSection, ChSettingsWrites } from '../screens/settings/model';
import { coachData, PREVIEW_STAFF } from '../preview/fixtures-settings';
import './dialog-polyfill';

beforeEach(() => hapticSpy.mockClear());

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

const device: ChDevice = {
  native: false,
  push: { status: 'unsubscribed', pending: false, subscribe: vi.fn(() => Promise.resolve({ ok: true })), unsubscribe: vi.fn(() => Promise.resolve({ ok: true })) },
};

function setup(section: ChSettingsSection, over: Partial<ChSettingsWrites> = {}) {
  const writes = makeWrites(over);
  const user = userEvent.setup();
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <SettingsView data={coachData()} writes={writes} device={device} initialSection={section} onDeleted={vi.fn()} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
  return { user, writes };
}

const card = (name: string) => screen.getByRole('region', { name });

describe('the inline save bar', () => {
  it('is not there until the card is edited, and goes when Discard puts the value back', async () => {
    const { user } = setup('account');
    const profile = card('Profile');
    expect(within(profile).queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(within(profile).queryByText('Unsaved changes')).toBeNull();

    await user.type(screen.getByLabelText('Full name'), 'x');
    expect(within(profile).getByText('Unsaved changes')).toBeTruthy();
    expect(within(profile).getByRole('button', { name: 'Save changes' })).toBeEnabled();

    await user.click(within(profile).getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText('Full name')).toHaveValue('Maya Reyes');
    await waitFor(() => expect(within(profile).queryByRole('button', { name: 'Save changes' })).toBeNull());
  });

  it('holds the button busy while the save is out, then says Saved and lets the buttons go', async () => {
    let land!: (r: ChResult) => void;
    const saveProfile = vi.fn(() => new Promise<ChResult>((r) => (land = r)));
    const { user } = setup('account', { saveProfile });
    const profile = card('Profile');
    await user.type(screen.getByLabelText('Full name'), 's');
    await user.click(within(profile).getByRole('button', { name: 'Save changes' }));

    const busy = await within(profile).findByRole('button', { name: 'Saving…' });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(within(profile).queryByRole('button', { name: 'Discard' })).toBeNull();

    land({ success: true });
    expect(await within(profile).findByText('Saved')).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('success');
    expect(saveProfile).toHaveBeenCalledTimes(1);
    expect(within(profile).queryByRole('button', { name: /Save changes|Saving/ })).toBeNull();
    expect(within(profile).queryByText('Unsaved changes')).toBeNull();
  });

  it('keeps Save off while the edit is not valid, and says why in the bar', async () => {
    const { user } = setup('account');
    const name = screen.getByLabelText('Full name');
    await user.clear(name);
    const profile = card('Profile');
    expect(within(profile).getByRole('button', { name: 'Save changes' })).toBeDisabled();
    // The bar names the problem where it would say Unsaved changes.
    const bar = within(profile).getByRole('group', { name: 'Save changes' });
    expect(within(bar).queryByText('Unsaved changes')).toBeNull();
    expect(bar.querySelector('.is-invalid')?.textContent).toMatch(/name/i);
  });

  it('Cmd+S saves from a field in the card, Enter in a profile field does not', async () => {
    const { user, writes } = setup('account');
    await user.type(screen.getByLabelText('Full name'), 'x{Enter}');
    expect(writes.saveProfile).not.toHaveBeenCalled();
    await user.keyboard('{Meta>}s{/Meta}');
    await waitFor(() => expect(writes.saveProfile).toHaveBeenCalledTimes(1));
  });

  it('Cmd+S with nothing to save does nothing', async () => {
    const { user, writes } = setup('account');
    await user.click(screen.getByLabelText('Full name'));
    await user.keyboard('{Meta>}s{/Meta}');
    expect(writes.saveProfile).not.toHaveBeenCalled();
  });

  it('the password card offers its Update only once something is typed, and clears itself when it lands', async () => {
    const { user, writes } = setup('account');
    const pw = card('Password');
    expect(within(pw).queryByRole('button', { name: 'Update password' })).toBeNull();
    await user.type(screen.getByLabelText('Current password'), 'old-password');
    await user.type(screen.getByLabelText('New password'), 'new-password-1');
    await user.type(screen.getByLabelText('Confirm new password'), 'new-password-1');
    await user.click(within(pw).getByRole('button', { name: 'Update password' }));
    await waitFor(() => expect(writes.changePassword).toHaveBeenCalledWith('old-password', 'new-password-1'));
    await waitFor(() => expect(screen.getByLabelText('Current password')).toHaveValue(''));
    expect(await within(pw).findByText('Saved')).toBeTruthy();
  });
});

describe('the section footing', () => {
  it('puts Sign out in Session and Delete account alone in a Danger zone card at the end', () => {
    setup('account');
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby') ?? '');
    expect(regions.at(-1)).toBe('set-danger-t');
    expect(within(card('Session')).getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(within(card('Danger zone')).getByRole('button', { name: 'Delete account' })).toBeTruthy();
    expect(within(card('Danger zone')).queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('has no line floating over the CoachHelm title: a setting says Saved by its own row', async () => {
    const { user } = setup('coachhelm');
    expect(document.querySelector('.ch-set-autosave')).toBeNull();
    await user.click(screen.getByRole('switch', { name: 'Insights' }));
    await waitFor(() => expect(document.querySelector('[data-ch-code="CH-8405"]')).not.toBeNull());
    expect(document.querySelector('[data-ch-code="CH-8405"]')!.closest('.ch-set-row')?.textContent).toMatch(/Insights/);
  });
});

describe('the team code', () => {
  it('is one code with its Copy, which says Copied and gives the success tick', async () => {
    const { user } = setup('team');
    const invite = await screen.findByRole('region', { name: 'Invite players' });
    const codeEl = invite.querySelector('.ch-set-code');
    expect(codeEl?.textContent).toBe('K7M2Q9XA');
    await user.click(within(invite).getByRole('button', { name: 'Copy code' }));
    expect(await navigator.clipboard.readText()).toBe('K7M2Q9XA');
    expect(await within(invite).findByRole('button', { name: 'Copied' })).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('success');
  });
});
