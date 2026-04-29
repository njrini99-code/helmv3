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
import { Calendar, Plus, Search, Filter } from 'lucide-react';
import '@/styles/calendar-tokens.css';

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

  return (
    <div className={cn('bg-white rounded-2xl border border-warm-200 shadow-sm', className)}>
      {/* Header */}
      <div className="p-6 border-b border-warm-200">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-[20px] font-medium text-warm-900 tracking-[-0.015em]">Calendar Feeds</h2>
            <p className="text-sm text-warm-500 mt-1">
              Subscribe to your calendar in Apple Calendar, Google Calendar, or Outlook
            </p>
          </div>

          <button
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
          </button>
        </div>

        {/* Search and filter */}
        {feeds.length > 0 && (
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search feeds..."
                aria-label="Search feeds"
                inputMode="search"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="search"
                className="w-full min-h-[44px] pl-9 pr-4 py-2 rounded-lg border border-warm-200 text-base lg:text-sm
                         focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30
                         placeholder:text-warm-400 transition-colors"
              />
            </div>

            {/* Filter dropdown */}
            {allowedTypeList.length > 1 && (
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400 pointer-events-none" />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as FeedType | 'all')}
                  aria-label="Filter by feed type"
                  className="pl-9 pr-10 py-2 min-h-[44px] rounded-lg border border-warm-200 text-base lg:text-sm font-medium
                           bg-white text-warm-700 cursor-pointer
                           hover:border-warm-300 focus:outline-none focus:ring-2 focus:ring-primary-500/30
                           focus:border-primary-500 appearance-none"
                >
                  <option value="all">All Types</option>
                  {allowedTypeList.includes('team') && <option value="team">Team Events</option>}
                  {allowedTypeList.includes('personal') && <option value="personal">Personal Events</option>}
                  {allowedTypeList.includes('tournament') && <option value="tournament">Tournaments</option>}
                  {allowedTypeList.includes('all_events') && <option value="all_events">All Events</option>}
                </select>
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
          <div className="text-center py-12">
            {feeds.length === 0 ? (
              // Empty state - no feeds at all
              <>
                <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-8 h-8 text-primary-600" />
                </div>
                <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em] mb-2">
                  No calendar feeds yet
                </h3>
                <p className="text-sm text-warm-500 mb-6 max-w-md mx-auto">
                  Create a calendar feed to subscribe to your events in your favorite calendar app.
                  Your calendar will automatically update when events change.
                </p>
                <button
                  type="button"
                  onClick={() => setShowCreateSection(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                           bg-primary-600 hover:bg-primary-700 text-white font-medium
                           transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create Your First Feed
                </button>
              </>
            ) : (
              // Empty state - no matching filters
              <>
                <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-3">
                  <Search className="w-6 h-6 text-warm-400" />
                </div>
                <h3 className="text-base font-medium text-warm-900 mb-2">No matching feeds</h3>
                <p className="text-sm text-warm-500">
                  Try adjusting your search or filter
                </p>
              </>
            )}
          </div>
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

