import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Calendar, Add to calendar app: a link can be replaced or removed (swap audit section 14, D3). Both end the link the
 * person may already have shared, so each says so and asks first; nothing is sent until they confirm.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
const track = vi.hoisted(() => ({ report: vi.fn(), trail: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: track.report, chTrail: track.trail, chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
const feeds = vi.hoisted(() => ({
  getCalendarFeeds: vi.fn(),
  createCalendarFeed: vi.fn(),
  regenerateCalendarFeed: vi.fn(),
  deleteCalendarFeed: vi.fn(),
}));
vi.mock('@/app/golf/actions/calendar-feeds', () => feeds);
vi.mock('@/app/golf/actions/golf', () => ({ createGolfEvent: vi.fn(), updateGolfEvent: vi.fn(), deleteGolfEvent: vi.fn() }));
vi.mock('@/app/golf/actions/recurring-events', () => ({ createRecurringEvent: vi.fn(), deleteRecurringEvent: vi.fn(), editRecurringEvent: vi.fn() }));

import { SubscribeSheet } from '../screens/calendar/editor';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

type User = ReturnType<typeof userEvent.setup>;
const TEAM = { id: 'f1', name: 'Team', type: 'team' as const, url: 'https://helm.test/api/calendar/feeds/old-team' };
const MINE = { id: 'f2', name: 'Mine', type: 'personal' as const, url: 'https://helm.test/api/calendar/feeds/old-mine' };

function show(role: 'coach' | 'player' = 'coach') {
  const user = userEvent.setup();
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <SubscribeSheet open onClose={vi.fn()} role={role} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
  return user;
}
/** One link's row, by its name. */
const rowOf = async (name: string) => {
  const title = await screen.findByText(name, { selector: 'b' });
  return title.closest('.ch-feed') as HTMLElement;
};
const ask = (row: HTMLElement, button: string, user: User) => user.click(within(row).getByRole('button', { name: button }));
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);

beforeEach(() => {
  hapticSpy.mockClear();
  track.report.mockClear();
  for (const f of Object.values(feeds)) f.mockReset();
  feeds.getCalendarFeeds.mockResolvedValue({ success: true, data: [TEAM, MINE] });
});

describe('Calendar · links · CH-6504 CH-6013 New link (D3)', () => {
  it('asks first, says the old link stops working, and sends nothing until it is confirmed', async () => {
    const user = show();
    const row = await rowOf('Team schedule');
    await ask(row, 'New link', user);

    const question = within(row).getByRole('group', { name: 'Make a new Team schedule link?' });
    expect(code('CH-6504')).toBe(question);
    expect(question.textContent).toMatch(/current link stops working right away/);
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    expect(feeds.regenerateCalendarFeed).not.toHaveBeenCalled();

    // Keep link closes the question and changes nothing; focus started on it, so Enter never confirms by accident.
    await user.click(within(question).getByRole('button', { name: 'Keep link' }));
    expect(within(row).queryByRole('group')).toBeNull();
    expect(feeds.regenerateCalendarFeed).not.toHaveBeenCalled();
    expect(within(row).getByRole('button', { name: 'New link' })).toBeTruthy();
  });

  it('calls regenerateCalendarFeed with the feed type and shows the new link in place of the old', async () => {
    feeds.regenerateCalendarFeed.mockResolvedValue({ success: true, data: { ...TEAM, id: 'f3', url: 'https://helm.test/api/calendar/feeds/new-team' } });
    const user = show();
    const row = await rowOf('Team schedule');
    expect(row.querySelector('code')?.textContent).toBe('webcal://helm.test/api/calendar/feeds/old-team');
    await ask(row, 'New link', user);
    await user.click(within(row).getByRole('button', { name: 'Make a new link' }));

    await waitFor(() => expect(feeds.regenerateCalendarFeed).toHaveBeenCalledWith('team'));
    expect(feeds.regenerateCalendarFeed).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(row.querySelector('code')?.textContent).toBe('webcal://helm.test/api/calendar/feeds/new-team'));
    expect(await screen.findByText('New Team schedule link ready')).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('success');
    // The other link is untouched.
    expect((await rowOf('My schedule')).querySelector('code')?.textContent).toBe('webcal://helm.test/api/calendar/feeds/old-mine');
    expect(feeds.regenerateCalendarFeed).not.toHaveBeenCalledWith('personal');
  });

  it('a refused replacement shows the error, reads the links again, and offers no Retry', async () => {
    feeds.regenerateCalendarFeed.mockResolvedValue({ success: false, error: 'Failed to regenerate feed' });
    const user = show();
    const row = await rowOf('Team schedule');
    expect(feeds.getCalendarFeeds).toHaveBeenCalledTimes(1);
    await ask(row, 'New link', user);
    await user.click(within(row).getByRole('button', { name: 'Make a new link' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Couldn't make a new Team schedule link/);
    expect(alert.textContent).toMatch(/Failed to regenerate feed/);
    expect(code('CH-6013')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(track.report).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ action: 'calendar.regenerateFeed' }));
    // The server deletes the old link before it makes the new one, so what exists is read again.
    await waitFor(() => expect(feeds.getCalendarFeeds).toHaveBeenCalledTimes(2));
  });

  it('a failed replacement that left no link shows Create link where the link was', async () => {
    feeds.regenerateCalendarFeed.mockResolvedValue({ success: false, error: 'Failed to create feed' });
    const user = show();
    const row = await rowOf('Team schedule');
    feeds.getCalendarFeeds.mockResolvedValue({ success: true, data: [MINE] });
    await ask(row, 'New link', user);
    await user.click(within(row).getByRole('button', { name: 'Make a new link' }));
    await screen.findByRole('alert');
    await waitFor(() => expect(within(row).getByRole('button', { name: 'Create link' })).toBeTruthy());
    expect(within(row).queryByRole('button', { name: 'New link' })).toBeNull();
  });
});

describe('Calendar · links · CH-6505 CH-6014 Remove (D3)', () => {
  it('asks first, says the link stops working, and sends nothing until it is confirmed', async () => {
    const user = show();
    const row = await rowOf('My schedule');
    await ask(row, 'Remove', user);
    const question = within(row).getByRole('group', { name: 'Remove the My schedule link?' });
    expect(code('CH-6505')).toBe(question);
    expect(question.textContent).toMatch(/link stops working right away/);
    expect(feeds.deleteCalendarFeed).not.toHaveBeenCalled();
    await user.click(within(question).getByRole('button', { name: 'Keep link' }));
    expect(feeds.deleteCalendarFeed).not.toHaveBeenCalled();
    expect(row.querySelector('code')).not.toBeNull();
  });

  it('calls deleteCalendarFeed with the feed type, and the row goes back to Create link', async () => {
    feeds.deleteCalendarFeed.mockResolvedValue({ success: true });
    const user = show();
    const row = await rowOf('My schedule');
    await ask(row, 'Remove', user);
    await user.click(within(row).getByRole('button', { name: 'Remove link' }));

    await waitFor(() => expect(feeds.deleteCalendarFeed).toHaveBeenCalledWith('personal'));
    expect(feeds.deleteCalendarFeed).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(within(row).getByRole('button', { name: 'Create link' })).toBeTruthy());
    expect(row.querySelector('code')).toBeNull();
    expect(await screen.findByText('My schedule link removed')).toBeTruthy();
    // The team link is untouched.
    expect((await rowOf('Team schedule')).querySelector('code')).not.toBeNull();
  });

  it('a failed removal shows the error with Retry, keeps the link, and Retry sends it again', async () => {
    feeds.deleteCalendarFeed.mockResolvedValueOnce({ success: false, error: 'Failed to disable calendar feed' }).mockResolvedValueOnce({ success: true });
    const user = show();
    const row = await rowOf('Team schedule');
    await ask(row, 'Remove', user);
    await user.click(within(row).getByRole('button', { name: 'Remove link' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Couldn't remove the Team schedule link/);
    expect(alert.textContent).toMatch(/Failed to disable calendar feed/);
    expect(code('CH-6014')).not.toBeNull();
    expect(row.querySelector('code')).not.toBeNull();
    expect(track.report).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ action: 'calendar.removeFeed' }));

    // The toast moves into the open dialog once it is up, so the button is found again rather than kept from `alert`.
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(feeds.deleteCalendarFeed).toHaveBeenCalledTimes(2));
    expect(feeds.deleteCalendarFeed).toHaveBeenLastCalledWith('team');
    await waitFor(() => expect(row.querySelector('code')).toBeNull());
  });

  it('a link that is saving cannot be replaced or removed again', async () => {
    let finish: (v: { success: boolean }) => void = () => {};
    feeds.deleteCalendarFeed.mockImplementation(() => new Promise((r) => (finish = r)));
    const user = show();
    const row = await rowOf('Team schedule');
    await ask(row, 'Remove', user);
    await user.click(within(row).getByRole('button', { name: 'Remove link' }));
    await waitFor(() => expect(feeds.deleteCalendarFeed).toHaveBeenCalledTimes(1));
    for (const b of within(await rowOf('My schedule')).getAllByRole('button', { name: /New link|Remove/ })) expect(b).toBeDisabled();
    finish({ success: true });
    await waitFor(() => expect(within(row).getByRole('button', { name: 'Create link' })).toBeTruthy());
  });
});

describe('Calendar · links · a player', () => {
  it('manages only their own link; the team link is never offered', async () => {
    feeds.getCalendarFeeds.mockResolvedValue({ success: true, data: [MINE] });
    feeds.deleteCalendarFeed.mockResolvedValue({ success: true });
    const user = show('player');
    const row = await rowOf('My schedule');
    expect(screen.queryByText('Team schedule', { selector: 'b' })).toBeNull();
    await ask(row, 'Remove', user);
    await user.click(within(row).getByRole('button', { name: 'Remove link' }));
    await waitFor(() => expect(feeds.deleteCalendarFeed).toHaveBeenCalledWith('personal'));
  });

  it('a row with no link offers only Create link, nothing to replace or remove', async () => {
    feeds.getCalendarFeeds.mockResolvedValue({ success: true, data: [] });
    show();
    const row = await rowOf('Team schedule');
    expect(within(row).getByRole('button', { name: 'Create link' })).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'New link' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});
