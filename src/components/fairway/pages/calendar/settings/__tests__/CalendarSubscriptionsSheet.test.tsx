// @vitest-environment jsdom

/**
 * FairwayCalendarSubscriptionsSheet — SCREEN-BUILD-PLAN.md §2.9 (S9).
 *
 * `@/app/golf/actions/calendar-feeds` is mocked wholesale — this screen must
 * never touch the real Supabase-backed actions in a unit test. The
 * load-bearing checks: the token is never shown in full anywhere in the DOM
 * (only the masked form), Copy still puts the REAL url on the clipboard, a
 * player (`canManageTeamFeed={false}`) never even sees a Team row, and only
 * the two feed types the backend can actually create (`team`, `personal`)
 * ever render — never a fabricated "Tournaments"/"All events" row.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FairwayCalendarSubscriptionsSheet } from '../CalendarSubscriptionsSheet';

vi.mock('@/app/golf/actions/calendar-feeds', () => ({
  getCalendarFeeds: vi.fn(),
  createCalendarFeed: vi.fn(),
  regenerateCalendarFeed: vi.fn(),
  deleteCalendarFeed: vi.fn(),
}));

import {
  getCalendarFeeds,
  createCalendarFeed,
  regenerateCalendarFeed,
  deleteCalendarFeed,
} from '@/app/golf/actions/calendar-feeds';

const mockGetCalendarFeeds = vi.mocked(getCalendarFeeds);
const mockCreateCalendarFeed = vi.mocked(createCalendarFeed);
const mockRegenerateCalendarFeed = vi.mocked(regenerateCalendarFeed);
const mockDeleteCalendarFeed = vi.mocked(deleteCalendarFeed);

const REAL_TOKEN = 'abcd1234efgh5678ijkl9012mnop3456';
const TEAM_FEED = {
  id: 'feed-team-1',
  name: 'Team Calendar',
  type: 'team' as const,
  url: `https://helm.example.com/api/calendar/feeds/${REAL_TOKEN}`,
  // Mid-day UTC so `formatShortDate`'s local-time rendering stays on Aug 1
  // regardless of the test runner's timezone offset.
  created_at: '2026-08-01T18:00:00.000Z',
  last_synced_at: null,
};

const realOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

beforeEach(() => {
  setOnline(true);
  mockGetCalendarFeeds.mockReset();
  mockCreateCalendarFeed.mockReset();
  mockRegenerateCalendarFeed.mockReset();
  mockDeleteCalendarFeed.mockReset();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  if (realOnLine) Object.defineProperty(navigator, 'onLine', realOnLine);
});

describe('FairwayCalendarSubscriptionsSheet — real feed types only', () => {
  it('shows Team and Personal rows for a coach, and never the real token in the DOM', async () => {
    mockGetCalendarFeeds.mockResolvedValue({ success: true, data: [TEAM_FEED] });
    render(<FairwayCalendarSubscriptionsSheet open onOpenChange={() => {}} canManageTeamFeed />);

    expect(await screen.findByText('Team calendar')).toBeInTheDocument();
    expect(screen.getByText('Personal calendar')).toBeInTheDocument();
    expect(screen.queryByText(/Tournament/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/All events/i)).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(REAL_TOKEN);
    expect(document.body.innerHTML).toContain('••••');
  });

  it('hides the Team row entirely when the viewer cannot manage a team feed', async () => {
    mockGetCalendarFeeds.mockResolvedValue({ success: true, data: [] });
    render(<FairwayCalendarSubscriptionsSheet open onOpenChange={() => {}} canManageTeamFeed={false} />);

    await screen.findByText('Personal calendar');
    expect(screen.queryByText('Team calendar')).not.toBeInTheDocument();
  });
});

describe('FairwayCalendarSubscriptionsSheet — copy is real, display is masked', () => {
  it('Copy puts the full real url on the clipboard even though the row shows a masked one', async () => {
    mockGetCalendarFeeds.mockResolvedValue({ success: true, data: [TEAM_FEED] });
    render(<FairwayCalendarSubscriptionsSheet open onOpenChange={() => {}} canManageTeamFeed />);

    // Only the Team row has a real feed here (Personal shows "Not added
    // yet" with no Copy button), so this is the one Copy button in the DOM.
    await screen.findByText('Team calendar');
    fireEvent.click(screen.getByRole('button', { name: 'Copy calendar link' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(TEAM_FEED.url);
    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeInTheDocument();
  });
});

describe('FairwayCalendarSubscriptionsSheet — create / regenerate / remove', () => {
  it('creating a personal feed calls createCalendarFeed and renders the new row', async () => {
    mockGetCalendarFeeds.mockResolvedValue({ success: true, data: [] });
    mockCreateCalendarFeed.mockResolvedValue({
      success: true,
      data: { ...TEAM_FEED, id: 'feed-personal-1', type: 'personal', name: 'Personal Calendar' },
    });

    render(<FairwayCalendarSubscriptionsSheet open onOpenChange={() => {}} canManageTeamFeed={false} />);
    await screen.findByText('Not added yet');
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText('Added Aug 1')).toBeInTheDocument();
    expect(mockCreateCalendarFeed).toHaveBeenCalledWith('personal');
  });

  it('regenerate requires an inline confirm before calling regenerateCalendarFeed', async () => {
    mockGetCalendarFeeds.mockResolvedValue({ success: true, data: [TEAM_FEED] });
    mockRegenerateCalendarFeed.mockResolvedValue({
      success: true,
      data: { ...TEAM_FEED, url: TEAM_FEED.url.replace(REAL_TOKEN, 'zzzz9999zzzz9999zzzz9999zzzz9999') },
    });

    render(<FairwayCalendarSubscriptionsSheet open onOpenChange={() => {}} canManageTeamFeed />);
    await screen.findByText('Team calendar');

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate link' }));
    expect(mockRegenerateCalendarFeed).not.toHaveBeenCalled();
    expect(screen.getByText('Get a new link? The old one stops working.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    // The mutation crosses a real microtask boundary (the code-split action
    // module import), so waiting for the confirm swap to close is what
    // actually flushes it — asserting on the mock synchronously right after
    // the click races that boundary.
    await screen.findByRole('button', { name: 'Regenerate link' });
    expect(mockRegenerateCalendarFeed).toHaveBeenCalledWith('team');
  });

  it('remove requires an inline confirm before calling deleteCalendarFeed, then the row returns to "Not added yet"', async () => {
    mockGetCalendarFeeds.mockResolvedValue({ success: true, data: [TEAM_FEED] });
    mockDeleteCalendarFeed.mockResolvedValue({ success: true, data: undefined });

    render(<FairwayCalendarSubscriptionsSheet open onOpenChange={() => {}} canManageTeamFeed />);
    await screen.findByText('Team calendar');

    fireEvent.click(screen.getByRole('button', { name: 'Remove feed' }));
    expect(mockDeleteCalendarFeed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(await screen.findByText('Not added yet')).toBeInTheDocument();
    expect(mockDeleteCalendarFeed).toHaveBeenCalledWith('team');
  });
});

describe('FairwayCalendarSubscriptionsSheet — load failure and offline', () => {
  it('shows a failed-load state with Retry', async () => {
    mockGetCalendarFeeds.mockResolvedValue({ success: false, error: 'Network down' });
    render(<FairwayCalendarSubscriptionsSheet open onOpenChange={() => {}} canManageTeamFeed />);
    expect(await screen.findByText('Network down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('while offline: mutation buttons are disabled but the offline notice appears', async () => {
    mockGetCalendarFeeds.mockResolvedValue({ success: true, data: [TEAM_FEED] });
    setOnline(false);
    render(<FairwayCalendarSubscriptionsSheet open onOpenChange={() => {}} canManageTeamFeed />);

    await screen.findByText('Team calendar');
    expect(screen.getByText(/You.{1,2}re offline/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate link' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove feed' })).toBeDisabled();
  });
});

describe('FairwayCalendarSubscriptionsSheet — setup steps', () => {
  it('reveals platform-specific steps that never reprint the raw link', async () => {
    mockGetCalendarFeeds.mockResolvedValue({ success: true, data: [] });
    render(<FairwayCalendarSubscriptionsSheet open onOpenChange={() => {}} canManageTeamFeed={false} />);
    await screen.findByText('Personal calendar');

    fireEvent.click(screen.getByRole('button', { name: 'How do I add this to my calendar app?' }));
    expect(screen.getByText(/Copy the link for the calendar you want above\./)).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(REAL_TOKEN);
  });
});
