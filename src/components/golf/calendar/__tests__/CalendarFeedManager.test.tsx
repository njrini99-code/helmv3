// @vitest-environment jsdom
/**
 * CalendarFeedManager + FeedCard — Fairway re-skin.
 *
 * These pin the FUNCTIONAL contract (list/search/create/regenerate/delete)
 * after the legacy bg-cream-50 double-boxed card + raw amber/violet/rose
 * chrome was replaced with flush Fairway primitives (Surface/StatusPill/
 * Button danger variant) — see FeedCard's FEED_TYPE_META and the dropped
 * outer card in CalendarFeedManager's root.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CalendarFeedManager } from '@/components/golf/calendar/CalendarFeedManager';
import type { CalendarFeed } from '@/components/golf/calendar/FeedCard';

function feed(overrides: Partial<CalendarFeed> & { id: string }): CalendarFeed {
  return {
    name: 'My Team Events',
    type: 'team',
    url: 'webcal://helmsportslabs.com/api/calendar/team/tok123',
    created_at: '2026-06-01T12:00:00.000Z',
    last_synced_at: null,
    ...overrides,
  };
}

const onCreateFeed = vi.fn();
const onRegenerateFeed = vi.fn();
const onDeleteFeed = vi.fn();

beforeEach(() => {
  onCreateFeed.mockReset();
  onRegenerateFeed.mockReset();
  onDeleteFeed.mockReset();
});

describe('CalendarFeedManager — empty state', () => {
  it('shows the honest empty state and opens the create flow from its CTA', () => {
    render(
      <CalendarFeedManager
        feeds={[]}
        onCreateFeed={onCreateFeed}
        onRegenerateFeed={onRegenerateFeed}
        onDeleteFeed={onDeleteFeed}
      />,
    );

    expect(screen.getByText('No calendar feeds yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create Your First Feed' }));
    // CreateFeedSection mounts (its own "Create Calendar Feed" heading).
    expect(screen.getByText('Create Calendar Feed')).toBeInTheDocument();
  });
});

describe('CalendarFeedManager — feed list', () => {
  it('renders each feed with its type label and last-synced time', () => {
    render(
      <CalendarFeedManager
        feeds={[
          feed({ id: 'f1', name: 'Team Schedule', type: 'team', last_synced_at: '2026-06-10T12:00:00.000Z' }),
          feed({ id: 'f2', name: 'My Personal', type: 'personal' }),
        ]}
        onCreateFeed={onCreateFeed}
        onRegenerateFeed={onRegenerateFeed}
        onDeleteFeed={onDeleteFeed}
      />,
    );

    expect(screen.getByText('Team Schedule')).toBeInTheDocument();
    expect(screen.getByText('My Personal')).toBeInTheDocument();
    expect(screen.getByText('Team Events')).toBeInTheDocument();
    expect(screen.getByText('Personal Events')).toBeInTheDocument();
    expect(screen.getByText('2 feeds total')).toBeInTheDocument();
  });

  it('filters the list by search query', () => {
    render(
      <CalendarFeedManager
        feeds={[
          feed({ id: 'f1', name: 'Team Schedule', type: 'team' }),
          feed({ id: 'f2', name: 'Tournament Feed', type: 'tournament' }),
        ]}
        onCreateFeed={onCreateFeed}
        onRegenerateFeed={onRegenerateFeed}
        onDeleteFeed={onDeleteFeed}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Search feeds...'), {
      target: { value: 'Tournament' },
    });

    expect(screen.getByText('Tournament Feed')).toBeInTheDocument();
    expect(screen.queryByText('Team Schedule')).not.toBeInTheDocument();
  });

  it('asks for confirmation before deleting, then calls onDeleteFeed with the feed id', () => {
    render(
      <CalendarFeedManager
        feeds={[feed({ id: 'f1', name: 'Team Schedule', type: 'team' })]}
        onCreateFeed={onCreateFeed}
        onRegenerateFeed={onRegenerateFeed}
        onDeleteFeed={onDeleteFeed}
      />,
    );

    const card = screen.getByText('Team Schedule').closest('div[data-slot="surface"]') as HTMLElement;
    expect(card).not.toBeNull();

    fireEvent.click(within(card).getByRole('button', { name: 'Delete feed' }));
    expect(screen.getByText('Delete this feed?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDeleteFeed).toHaveBeenCalledWith('f1');
  });

  it('regenerates the feed URL on demand', () => {
    render(
      <CalendarFeedManager
        feeds={[feed({ id: 'f1', name: 'Team Schedule', type: 'team' })]}
        onCreateFeed={onCreateFeed}
        onRegenerateFeed={onRegenerateFeed}
        onDeleteFeed={onDeleteFeed}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate feed URL' }));
    expect(onRegenerateFeed).toHaveBeenCalledWith('f1');
  });
});
