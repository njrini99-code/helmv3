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
 */

import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { FeedCard, type CalendarFeed } from './FeedCard';
import { CreateFeedSection } from './CreateFeedSection';
import { Calendar, Plus, Search } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import '@/styles/calendar-tokens.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, type SelectOption } from '@/components/ui/select';

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
    <div className={cn('bg-cream-50 rounded-2xl border border-warm-200 shadow-sm', className)}>
      {/* Header */}
      <div className="p-6 border-b border-warm-200">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-h3 font-medium text-warm-900 tracking-[-0.015em]">Calendar Feeds</h2>
            <p className="text-sm text-warm-500 mt-1">
              Subscribe to your calendar in Apple Calendar, Google Calendar, or Outlook
            </p>
          </div>

          <Button variant="primary"
            type="button"
            onClick={() => setShowCreateSection(!showCreateSection)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm',
              'transition-all duration-200',
              showCreateSection
                ? 'bg-warm-100 text-warm-700'
                : 'bg-primary-600 text-white hover:bg-primary-700'
            )}
          >
            <Plus className="w-4 h-4" />
            {showCreateSection ? 'Cancel' : 'New Feed'}
          </Button>
        </div>

        {/* Search and filter */}
        {feeds.length > 0 && (
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="flex-1">
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search feeds..."
                aria-label="Search feeds"
                leftIcon={<Search className="w-4 h-4" />}
                className="min-h-[44px] py-2"
              />
            </div>

            {/* Filter dropdown */}
            {allowedTypeList.length > 1 && (
              <div className="w-48">
                <Select
                  options={filterOptions}
                  value={filterType}
                  onChange={(value) => setFilterType(value as FeedType | 'all')}
                  className="min-h-[44px] font-medium"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create feed section (collapsible) */}
      {showCreateSection && (
        <div className="p-6 border-b border-warm-200 bg-primary-50/30">
          <CreateFeedSection
            onCreate={handleCreateFeed}
            onCancel={() => setShowCreateSection(false)}
            loading={loading}
            allowedTypes={allowedTypeList}
            showNameInput={showNameInput}
          />
        </div>
      )}

      {/* Feeds list */}
      <div className="p-6">
        {filteredFeeds.length === 0 ? (
          feeds.length === 0 ? (
            <EmptyState
              variant="compact"
              icon={<Calendar className="w-8 h-8" />}
              title="No calendar feeds yet"
              description="Create a calendar feed to subscribe to your events in your favorite calendar app. Your calendar will automatically update when events change."
              action={{
                label: 'Create Your First Feed',
                onClick: () => setShowCreateSection(true),
              }}
            />
          ) : (
            <EmptyState
              variant="compact"
              icon={<Search className="w-6 h-6" />}
              title="No matching feeds"
              description="Try adjusting your search or filter."
            />
          )
        ) : (
          <div className="space-y-4">
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
      </div>

      {/* Footer stats */}
      {feeds.length > 0 && (
        <div className="px-6 py-4 border-t border-warm-200 bg-warm-50">
          <p className="text-xs text-warm-500 text-center">
            {feeds.length} {feeds.length === 1 ? 'feed' : 'feeds'} total
            {filteredFeeds.length !== feeds.length &&
              ` • ${filteredFeeds.length} ${filteredFeeds.length === 1 ? 'match' : 'matches'} current filter`}
          </p>
        </div>
      )}
    </div>
  );
}

