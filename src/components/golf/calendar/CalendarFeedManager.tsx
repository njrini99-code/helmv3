'use client';

/**
 * Calendar Feed Manager Component
 *
 * Settings panel for managing iCal/webcal calendar feeds:
 * - List of existing feeds
 * - Create new feed button
 * - Feed type selector
 * - Integration with FeedCard components
 *
 * Features:
 * - Feed type filtering (all, team, personal, tournament)
 * - Search by feed name
 * - Empty state for first feed
 * - Loading states for async operations
 *
 * Fairway tokens only — this mounts live inside the Fairway "Subscribe to
 * your calendar" Sheet (FairwayCalendar.tsx), so it renders FLUSH in
 * Sheet.Body (no own outer card chrome — the Sheet already supplies the
 * panel) the same way FairwayEventDetailDrawer composes its sections.
 */

import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { FeedCard, type CalendarFeed } from './FeedCard';
import { CreateFeedSection } from './CreateFeedSection';
import { Calendar, Plus, Search, X } from 'lucide-react';
import { Button, Input, Select, EmptyState, Inset, type SelectOption } from '@/components/fairway';

interface CalendarFeedManagerProps {
  feeds: CalendarFeed[];
  onCreateFeed: (type: FeedType, name: string) => Promise<CalendarFeed>;
  onRegenerateFeed: (feedId: string) => Promise<void>;
  onDeleteFeed: (feedId: string) => Promise<void>;
  allowedTypes?: FeedType[];
  showNameInput?: boolean;
  className?: string;
}

export type FeedType = 'team' | 'personal' | 'tournament' | 'all_events';

export function CalendarFeedManager({
  feeds,
  onCreateFeed,
  onRegenerateFeed,
  onDeleteFeed,
  allowedTypes,
  showNameInput = true,
  className,
}: CalendarFeedManagerProps) {
  const [showCreateSection, setShowCreateSection] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FeedType | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const allowedTypeList = useMemo(
    () => allowedTypes ?? (['team', 'personal', 'tournament', 'all_events'] as FeedType[]),
    [allowedTypes]
  );

  useEffect(() => {
    if (filterType !== 'all' && !allowedTypeList.includes(filterType)) {
      setFilterType('all');
    }
  }, [filterType, allowedTypeList]);

  // Filter feeds based on search and type
  const filteredFeeds = useMemo(() => {
    return feeds
      .filter((feed) => {
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return (
            feed.name.toLowerCase().includes(query) ||
            feed.type.toLowerCase().includes(query)
          );
        }
        return true;
      })
      .filter((feed) => {
        if (filterType === 'all') return true;
        return feed.type === filterType;
      });
  }, [feeds, searchQuery, filterType]);

  async function handleCreateFeed(type: FeedType, name: string) {
    setLoading(true);
    try {
      await onCreateFeed(type, name);
      setShowCreateSection(false);
    } catch {
      // Feed creation failed - UI will show original state
    } finally {
      setLoading(false);
    }
  }

  const filterOptions: SelectOption[] = [
    { value: 'all', label: 'All Types' },
    ...(allowedTypeList.includes('team') ? [{ value: 'team', label: 'Team Events' }] : []),
    ...(allowedTypeList.includes('personal') ? [{ value: 'personal', label: 'Personal Events' }] : []),
    ...(allowedTypeList.includes('tournament') ? [{ value: 'tournament', label: 'Tournaments' }] : []),
    ...(allowedTypeList.includes('all_events') ? [{ value: 'all_events', label: 'All Events' }] : []),
  ];

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-fw-display text-h3 font-medium text-text-primary tracking-[-0.015em]">
            Calendar Feeds
          </h2>
          <p className="mt-1 font-fw-sans text-body-sm text-text-secondary">
            Subscribe to your calendar in Apple Calendar, Google Calendar, or Outlook
          </p>
        </div>

        <Button
          variant={showCreateSection ? 'secondary' : 'primary'}
          size="sm"
          onClick={() => setShowCreateSection(!showCreateSection)}
          leftIcon={showCreateSection ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        >
          {showCreateSection ? 'Cancel' : 'New Feed'}
        </Button>
      </div>

      {/* Search and filter */}
      {feeds.length > 0 && (
        <div className="flex items-center gap-3">
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search feeds..."
            aria-label="Search feeds"
            leading={<Search className="h-4 w-4 text-text-tertiary" aria-hidden="true" />}
            className="flex-1"
          />

          {allowedTypeList.length > 1 && (
            <Select
              options={filterOptions}
              value={filterType}
              onValueChange={(value) => setFilterType(value as FeedType | 'all')}
              className="w-48"
            />
          )}
        </div>
      )}

      {/* Create feed section (collapsible) */}
      {showCreateSection && (
        <Inset padding="md">
          <CreateFeedSection
            onCreate={handleCreateFeed}
            onCancel={() => setShowCreateSection(false)}
            loading={loading}
            allowedTypes={allowedTypeList}
            showNameInput={showNameInput}
          />
        </Inset>
      )}

      {/* Feeds list */}
      {filteredFeeds.length === 0 ? (
        feeds.length === 0 ? (
          <EmptyState
            variant="subtle"
            icon={Calendar}
            title="No calendar feeds yet"
            description="Create a calendar feed to subscribe to your events in your favorite calendar app. Your calendar will automatically update when events change."
            action={
              <Button variant="primary" size="sm" onClick={() => setShowCreateSection(true)}>
                Create Your First Feed
              </Button>
            }
          />
        ) : (
          <EmptyState variant="search" icon={Search} title="No matching feeds" description="Try adjusting your search or filter." />
        )
      ) : (
        <div className="space-y-3">
          {filteredFeeds.map((feed) => (
            <FeedCard
              key={feed.id}
              feed={feed}
              onRegenerate={() => onRegenerateFeed(feed.id)}
              onDelete={() => onDeleteFeed(feed.id)}
            />
          ))}
        </div>
      )}

      {/* Footer stats */}
      {feeds.length > 0 && (
        <p className="text-center font-fw-sans text-caption text-text-tertiary">
          {feeds.length} {feeds.length === 1 ? 'feed' : 'feeds'} total
          {filteredFeeds.length !== feeds.length &&
            ` • ${filteredFeeds.length} ${filteredFeeds.length === 1 ? 'match' : 'matches'} current filter`}
        </p>
      )}
    </div>
  );
}
