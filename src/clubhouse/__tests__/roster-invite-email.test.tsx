import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Roster › Invite players › Email them (QUEUE doc-60; catalog CH-3080 the invites didn't send, CH-3180 an address that
 * can't be read, CH-3980 email is off). Addresses become chips; one button sends the link and code to all; a failed
 * address stays for another try; nothing is dropped silently.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const action = vi.hoisted(() => ({ email: vi.fn() }));
vi.mock('@/app/golf/actions/team-management', () => ({ emailPlayerInvites: action.email }));

import { ToastProvider } from '../ui/Toast';
import { InviteByEmail } from '../screens/roster/InviteByEmail';

function show(enabled = true) {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <InviteByEmail enabled={enabled} />
    </ToastProvider>,
  );
  return user;
}
const box = () => screen.getByLabelText('Or email them') as HTMLInputElement;
const chips = () => Array.from(document.querySelectorAll('.ch-rs-em__chip > span:first-child')).map((n) => n.textContent);
const send = () => screen.getByRole('button', { name: /^Send/ });

beforeEach(() => {
  hapticSpy.mockClear();
  action.email.mockReset();
  action.email.mockImplementation(async (emails: string[]) => ({ success: true, data: { sent: emails.length, failed: [] } }));
});

describe('Invite by email · off', () => {
  it('CH-3980 is one quiet line when email is paused, with no field to type in', () => {
    show(false);
    expect(screen.getByText(/Email invites are off for now/)).toBeTruthy();
    expect(document.querySelector('[data-ch-code="CH-3980"]')).toBeTruthy();
    expect(screen.queryByLabelText('Or email them')).toBeNull();
  });
});

describe('Invite by email · typing', () => {
  it('turns an address into a chip on Enter, comma, semicolon or space, and on blur', async () => {
    const user = show();
    await user.type(box(), 'eli@x.edu{Enter}');
    await user.type(box(), 'mia@x.edu,');
    await user.type(box(), 'noah@x.edu;');
    await user.type(box(), 'ava@x.edu ');
    await user.type(box(), 'zed@x.edu');
    await user.tab();
    expect(chips()).toEqual(['eli@x.edu', 'mia@x.edu', 'noah@x.edu', 'ava@x.edu', 'zed@x.edu']);
    expect(box().value).toBe('');
  });

  it('reads a pasted list, once each, lowercased', async () => {
    const user = show();
    await user.click(box());
    await user.paste('Eli@x.edu, mia@x.edu\nELI@x.edu');
    expect(chips()).toEqual(['eli@x.edu', 'mia@x.edu']);
    expect(send().textContent).toBe('Send 2 invites');
  });

  it('flags an address it cannot read, and holds Send until it is fixed or removed (CH-3180)', async () => {
    const user = show();
    await user.type(box(), 'eli@x.edu nope ');
    expect(chips()).toEqual(['eli@x.edu', 'nope']);
    expect(document.querySelector('[data-ch-code="CH-3180"]')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/can’t be read/);
    expect((send() as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Remove nope' }));
    expect(chips()).toEqual(['eli@x.edu']);
    expect((send() as HTMLButtonElement).disabled).toBe(false);
  });

  it('removes the last chip on Backspace in an empty field', async () => {
    const user = show();
    await user.type(box(), 'eli@x.edu mia@x.edu ');
    await user.keyboard('{Backspace}');
    expect(chips()).toEqual(['eli@x.edu']);
  });

  it('takes ten at a time and says so', async () => {
    const user = show();
    await user.click(box());
    await user.paste(Array.from({ length: 12 }, (_, i) => `p${i}@x.edu`).join(' '));
    expect(chips()).toHaveLength(10);
    expect(screen.getByRole('alert').textContent).toMatch(/10 at a time/);
  });

  it('has nothing to send until there is an address, and a typed one counts without Enter', async () => {
    const user = show();
    expect((send() as HTMLButtonElement).disabled).toBe(true);
    await user.type(box(), 'eli@x.edu');
    expect((send() as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('Invite by email · sending', () => {
  it('sends every chip in one request, clears them, and says how many went', async () => {
    const user = show();
    await user.type(box(), 'eli@x.edu mia@x.edu ');
    await user.click(send());
    await waitFor(() => expect(action.email).toHaveBeenCalledTimes(1));
    expect(action.email).toHaveBeenCalledWith(['eli@x.edu', 'mia@x.edu']);
    await waitFor(() => expect(chips()).toEqual([]));
    expect(screen.getByText('Sent to 2 players.')).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('success');
  });

  it('sends an address typed but not yet committed', async () => {
    const user = show();
    await user.type(box(), 'eli@x.edu');
    await user.click(send());
    await waitFor(() => expect(action.email).toHaveBeenCalledWith(['eli@x.edu']));
  });

  it('keeps the address that did not send, marked, for another try', async () => {
    action.email.mockResolvedValueOnce({ success: true, data: { sent: 1, failed: ['mia@x.edu'] } });
    const user = show();
    await user.type(box(), 'eli@x.edu mia@x.edu ');
    await user.click(send());
    await waitFor(() => expect(chips()).toEqual(['mia@x.edu']));
    expect(document.querySelector('.ch-rs-em__chip.is-unsent')).toBeTruthy();
    expect(screen.getByText('Sent to 1. 1 didn’t send. Try again.')).toBeTruthy();
    await user.click(send());
    await waitFor(() => expect(action.email).toHaveBeenLastCalledWith(['mia@x.edu']));
  });

  it('CH-3080 keeps every chip when the send fails, and says why', async () => {
    action.email.mockResolvedValueOnce({ success: false, error: 'You have sent a lot of invites. Try again in a little while.', code: 'rate_limited' });
    const user = show();
    await user.type(box(), 'eli@x.edu ');
    await user.click(send());
    expect(await screen.findByText('Couldn’t send the invites')).toBeTruthy();
    expect(screen.getByText(/sent a lot of invites/)).toBeTruthy();
    expect(chips()).toEqual(['eli@x.edu']);
    // Waiting is the answer: the toast offers no Retry.
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('offers Retry when the failure is the network’s, not a rule', async () => {
    action.email.mockResolvedValueOnce({ success: false, error: 'fetch failed' });
    const user = show();
    await user.type(box(), 'eli@x.edu ');
    await user.click(send());
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(action.email).toHaveBeenCalledTimes(2));
  });
});

describe('Invite by email · accessibility (CH-3880)', () => {
  it('is one labelled field whose chips each have a named Remove, and says what went wrong in words', async () => {
    const user = show();
    expect(box().id).toBeTruthy();
    await user.type(box(), 'eli@x.edu nope ');
    expect(screen.getByRole('button', { name: 'Remove eli@x.edu' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove nope' })).toBeTruthy();
    expect(screen.getByText(/can’t be read as an email address/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/One address can’t be read/);
    await user.click(screen.getByRole('button', { name: 'Remove nope' }));
    expect(screen.queryByRole('alert')).toBeNull();
    // The result is read politely, in a live region that is on the page before it has anything to say.
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  });
});
