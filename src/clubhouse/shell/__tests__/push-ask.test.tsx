import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CH-1911: the push soft ask in the iOS app (release blocker 12, docs/clubhouse/phone/push-opt-in.md). Shown once, at a
 * calm moment, while iOS has not been asked and nobody has answered; Turn on is iOS's prompt through the shared
 * requestPushPermission; Not now is kept and never asked again.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const push = vi.hoisted(() => ({
  shouldShowPushSoftAsk: vi.fn(async () => true),
  requestPushPermission: vi.fn(async (): Promise<'granted' | 'denied'> => 'granted'),
  setPushSoftAskState: vi.fn(),
}));
vi.mock('@/lib/utils/push-registration', () => push);

import { PushAsk } from '../PushAsk';
import { PUSH_ASK_SETTLE_MS, pushAskCalm, pushAskRouteOk, resetPushAskForTest } from '../push-ask';
import { ToastProvider } from '../../ui/Toast';
import '../../__tests__/dialog-polyfill';

const HOME = '/golf/dashboard';
const tree = (pathname: string, role: 'coach' | 'player' = 'player') => (
  <div className="ch-root" data-ui="clubhouse">
    <ToastProvider scope="t">
      <PushAsk pathname={pathname} role={role} />
    </ToastProvider>
  </div>
);
const sheet = () => document.querySelector('dialog[data-ch-code="CH-1911"][open]');
/** Let the settle time pass and the stored-answer read land. */
async function settle(ms = PUSH_ASK_SETTLE_MS) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers();
  resetPushAskForTest();
  hapticSpy.mockClear();
  push.shouldShowPushSoftAsk.mockReset().mockResolvedValue(true);
  push.requestPushPermission.mockReset().mockResolvedValue('granted');
  push.setPushSoftAskState.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('CH-1911 when the push ask may show', () => {
  it('waits for the page to settle: nothing on first paint, the sheet once the page has held', async () => {
    render(tree(HOME));
    await settle(PUSH_ASK_SETTLE_MS - 100);
    expect(sheet()).toBeNull();
    expect(push.shouldShowPushSoftAsk).not.toHaveBeenCalled();
    await settle(100);
    expect(sheet()).not.toBeNull();
    expect(screen.getByText('Turn on notifications')).toBeTruthy();
    expect(sheet()!.textContent).toMatch(/Know when your coach messages you, the schedule changes or a round review is ready, even with GolfHelm closed\. You can change this in Settings, under Notifications\./);
  });

  it('names what push brings for a coach', async () => {
    render(tree(HOME, 'coach'));
    await settle();
    expect(sheet()!.textContent).toMatch(/Know when a player posts a round, messages you or answers an event/);
  });

  it('not in a browser, not after an answer in either UI, not once iOS has asked (shouldShowPushSoftAsk says no)', async () => {
    push.shouldShowPushSoftAsk.mockResolvedValue(false);
    render(tree(HOME));
    await settle();
    expect(push.shouldShowPushSoftAsk).toHaveBeenCalledTimes(1);
    expect(sheet()).toBeNull();
  });

  it('never on round entry or Settings; a move to a calm page starts the wait again', async () => {
    const view = render(tree('/golf/dashboard/rounds/new'));
    await settle();
    view.rerender(tree('/golf/dashboard/rounds/continue/r1'));
    await settle();
    view.rerender(tree('/golf/dashboard/settings'));
    await settle();
    expect(push.shouldShowPushSoftAsk).not.toHaveBeenCalled();
    expect(sheet()).toBeNull();
    view.rerender(tree('/golf/dashboard/calendar'));
    await settle(PUSH_ASK_SETTLE_MS / 2);
    // A navigation before the page has held restarts the wait.
    view.rerender(tree('/golf/dashboard/roster'));
    await settle(PUSH_ASK_SETTLE_MS / 2 + 100);
    expect(sheet()).toBeNull();
    await settle(PUSH_ASK_SETTLE_MS / 2);
    expect(sheet()).not.toBeNull();
  });

  it('not while something else has the person (a sheet open, a field focused); it waits for the next page', async () => {
    const other = document.createElement('dialog');
    other.setAttribute('open', '');
    document.body.appendChild(other);
    const view = render(tree(HOME));
    await settle();
    expect(sheet()).toBeNull();
    other.remove();
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();
    view.rerender(tree('/golf/dashboard/calendar'));
    await settle();
    expect(sheet()).toBeNull();
    field.blur();
    view.rerender(tree('/golf/dashboard/roster'));
    await settle();
    expect(sheet()).not.toBeNull();
  });

  it('the rules on their own: quiet routes, and what counts as calm', () => {
    expect(pushAskRouteOk('/golf/dashboard')).toBe(true);
    expect(pushAskRouteOk('/golf/dashboard/messages')).toBe(true);
    expect(pushAskRouteOk('/golf/dashboard/rounds')).toBe(true);
    expect(pushAskRouteOk('/golf/dashboard/rounds/new')).toBe(false);
    expect(pushAskRouteOk('/golf/dashboard/rounds/continue/abc')).toBe(false);
    expect(pushAskRouteOk('/golf/dashboard/settings')).toBe(false);
    expect(pushAskCalm(document)).toBe(true);
    const strip = document.createElement('div');
    strip.setAttribute('data-strip', 'open');
    document.body.appendChild(strip);
    expect(pushAskCalm(document)).toBe(false);
    strip.remove();
    const hiddenDialog = document.createElement('div');
    hiddenDialog.setAttribute('role', 'dialog');
    hiddenDialog.hidden = true;
    document.body.appendChild(hiddenDialog);
    expect(pushAskCalm(document)).toBe(true);
    hiddenDialog.hidden = false;
    expect(pushAskCalm(document)).toBe(false);
    hiddenDialog.remove();
    // An open menu or list (the team switcher, a Menu) is a moment the person is busy too.
    for (const role of ['menu', 'listbox']) {
      const overlay = document.createElement('div');
      overlay.setAttribute('role', role);
      document.body.appendChild(overlay);
      expect(pushAskCalm(document)).toBe(false);
      overlay.remove();
    }
  });
});

describe('CH-1911 answering the push ask', () => {
  it('Turn on: the light tap, then iOS prompt; allowed, the success tap and "Notifications are on"', async () => {
    render(tree(HOME));
    await settle();
    await act(async () => {
      screen.getByRole('button', { name: 'Turn on' }).click();
    });
    expect(push.requestPushPermission).toHaveBeenCalledTimes(1);
    expect(hapticSpy.mock.calls.map(([k]) => k)).toEqual(['press', 'success']);
    expect(sheet()).toBeNull();
    expect(screen.getByText('Notifications are on')).toBeTruthy();
    // requestPushPermission stores the answer itself; the ask does not write "dismissed" over it.
    expect(push.setPushSoftAskState).not.toHaveBeenCalled();
  });

  it('Turn on, then Don’t Allow: the sheet closes quietly, no success tap, no toast', async () => {
    push.requestPushPermission.mockResolvedValue('denied');
    render(tree(HOME));
    await settle();
    await act(async () => {
      screen.getByRole('button', { name: 'Turn on' }).click();
    });
    expect(sheet()).toBeNull();
    expect(hapticSpy.mock.calls.map(([k]) => k)).toEqual(['press']);
    expect(screen.queryByText('Notifications are on')).toBeNull();
  });

  it('while iOS prompt is up, the sheet waits: Not now and Esc do nothing until the answer', async () => {
    let answer!: (v: 'granted' | 'denied') => void;
    push.requestPushPermission.mockImplementation(() => new Promise((r) => (answer = r)));
    render(tree(HOME));
    await settle();
    await act(async () => {
      screen.getByRole('button', { name: 'Turn on' }).click();
    });
    expect((screen.getByRole('button', { name: 'Not now' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      sheet()!.dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    expect(sheet()).not.toBeNull();
    expect(push.setPushSoftAskState).not.toHaveBeenCalled();
    await act(async () => answer('granted'));
    expect(sheet()).toBeNull();
  });

  it('Not now keeps the answer, is silent, and the ask never comes back this launch or after', async () => {
    const view = render(tree(HOME));
    await settle();
    await act(async () => {
      screen.getByRole('button', { name: 'Not now' }).click();
    });
    expect(sheet()).toBeNull();
    expect(push.setPushSoftAskState).toHaveBeenCalledWith('dismissed');
    expect(hapticSpy).not.toHaveBeenCalled();
    view.rerender(tree('/golf/dashboard/calendar'));
    await settle();
    expect(sheet()).toBeNull();
    expect(push.shouldShowPushSoftAsk).toHaveBeenCalledTimes(1);
  });

  it('closing it any other way (Esc, the close button) counts as Not now', async () => {
    render(tree(HOME));
    await settle();
    await act(async () => {
      screen.getByRole('button', { name: 'Close' }).click();
    });
    expect(sheet()).toBeNull();
    expect(push.setPushSoftAskState).toHaveBeenCalledWith('dismissed');
  });

  it('shows at most once a launch, even unanswered (the sheet remounting with the shell)', async () => {
    const view = render(tree(HOME));
    await settle();
    expect(sheet()).not.toBeNull();
    view.unmount();
    render(tree('/golf/dashboard/calendar'));
    await settle();
    expect(sheet()).toBeNull();
    expect(push.shouldShowPushSoftAsk).toHaveBeenCalledTimes(1);
  });
});
