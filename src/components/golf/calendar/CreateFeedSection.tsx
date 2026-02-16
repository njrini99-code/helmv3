'use client';

/**
 * Create Feed Section Component
 *
 * Workflow for creating new calendar feeds:
 * - Feed type selection with icon buttons
 * - Feed name input
 * - Optional description
 * - Team/player selection (context-based)
 * - URL generation preview
 * - Create action
 *
 * Features:
 * - Large icon buttons (touch-friendly)
 * - Visual feedback on selection
 * - Form validation
 * - Loading states
 * - Auto-generated feed names
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Calendar, Users, Trophy, Globe, Sparkles } from 'lucide-react';
import { type FeedType } from './CalendarFeedManager';
import '@/styles/calendar-tokens.css';

export interface CreateFeedSectionProps {
  onCreate: (type: FeedType, name: string) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  allowedTypes?: FeedType[];
  showNameInput?: boolean;
  className?: string;
}

const FEED_TYPE_OPTIONS = [
  {
    type: 'team' as FeedType,
    icon: Users,
    label: 'Team Events',
    description: 'All events for your team',
    colorClass: 'text-primary-700',
    bgClass: 'bg-primary-50',
    borderClass: 'border-primary-200',
    selectedClass: 'bg-primary-600 text-white ring-4 ring-primary-200 shadow-lg',
  },
  {
    type: 'personal' as FeedType,
    icon: Calendar,
    label: 'Personal Events',
    description: 'Only your events',
    colorClass: 'text-primary-700',
    bgClass: 'bg-primary-50',
    borderClass: 'border-primary-200',
    selectedClass: 'bg-primary-600 text-white ring-4 ring-primary-200 shadow-lg',
  },
  {
    type: 'tournament' as FeedType,
    icon: Trophy,
    label: 'Tournaments',
    description: 'Tournament events only',
    colorClass: 'text-amber-700',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
    selectedClass: 'bg-amber-600 text-white ring-4 ring-amber-200 shadow-lg',
  },
  {
    type: 'all_events' as FeedType,
    icon: Globe,
    label: 'All Events',
    description: 'Every event on your calendar',
    colorClass: 'text-violet-700',
    bgClass: 'bg-violet-50',
    borderClass: 'border-violet-200',
    selectedClass: 'bg-violet-600 text-white ring-4 ring-violet-200 shadow-lg',
  },
];

export function CreateFeedSection({
  onCreate,
  onCancel,
  loading = false,
  allowedTypes,
  showNameInput = true,
  className,
}: CreateFeedSectionProps) {
  const [selectedType, setSelectedType] = useState<FeedType | null>(null);
  const [feedName, setFeedName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const availableOptions = allowedTypes
    ? FEED_TYPE_OPTIONS.filter((option) => allowedTypes.includes(option.type))
    : FEED_TYPE_OPTIONS;

  async function handleCreate() {
    if (!selectedType) {
      setError('Please select a feed type');
      return;
    }

    const selectedOption = availableOptions.find((option) => option.type === selectedType);
    const resolvedName = feedName.trim() || (selectedOption ? `My ${selectedOption.label}` : '');

    if (!resolvedName) {
      setError('Please enter a feed name');
      return;
    }

    setError(null);
    try {
      await onCreate(selectedType, resolvedName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create feed');
    }
  }

  function handleTypeSelect(type: FeedType) {
    setSelectedType(type);
    setError(null);

    // Auto-generate feed name if empty
    if (!feedName) {
      const option = availableOptions.find((opt) => opt.type === type);
      if (option) {
        setFeedName(`My ${option.label}`);
      }
    }
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-primary-600" />
          <h3 className="text-lg font-semibold text-warm-900">Create Calendar Feed</h3>
        </div>
        <p className="text-sm text-warm-600">
          Choose what events to include in your calendar feed
        </p>
      </div>

      {/* Feed type selection */}
      <div>
        <label className="block text-sm font-medium text-warm-700 mb-3">
          Feed Type
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {availableOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = selectedType === option.type;

            return (
              <button
                key={option.type}
                type="button"
                onClick={() => handleTypeSelect(option.type)}
                disabled={loading}
                className={cn(
                  // Base styles
                  'flex flex-col items-center justify-center gap-2',
                  'min-h-[100px] p-4 rounded-xl border-2',
                  'transition-all duration-200 active:scale-95',
                  'touch-manipulation',
                  // Default state
                  !isSelected && option.bgClass,
                  !isSelected && option.borderClass,
                  !isSelected && 'hover:shadow-md',
                  // Selected state
                  isSelected && option.selectedClass,
                  // Disabled state
                  loading && 'opacity-50 cursor-not-allowed'
                )}
              >
                <Icon
                  className={cn(
                    'shrink-0 w-6 h-6',
                    isSelected ? 'text-white' : option.colorClass
                  )}
                />
                <div className="text-center">
                  <p
                    className={cn(
                      'text-xs font-bold uppercase tracking-wide',
                      isSelected ? 'text-white' : option.colorClass
                    )}
                  >
                    {option.label}
                  </p>
                  <p
                    className={cn(
                      'text-xs mt-1',
                      isSelected ? 'text-white/90' : 'text-warm-500'
                    )}
                  >
                    {option.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feed name */}
      {showNameInput && (
        <div>
          <label htmlFor="feed-name" className="block text-sm font-medium text-warm-700 mb-2">
            Feed Name
          </label>
          <input
            id="feed-name"
            type="text"
            value={feedName}
            onChange={(e) => {
              setFeedName(e.target.value);
              setError(null);
            }}
            placeholder="e.g., My Team Events"
            disabled={loading}
            className="w-full px-4 py-2.5 rounded-lg border border-warm-200
                     focus:border-primary-500 focus:ring-2 focus:ring-primary-100
                     text-warm-900 placeholder:text-warm-400 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-warm-500 mt-1.5">
            This name will help you identify the feed in your calendar app
          </p>
        </div>
      )}

      {/* Preview URL (when type is selected) */}
      {selectedType && (
        <div className="p-4 rounded-lg bg-warm-50 border border-warm-200">
          <p className="text-xs font-medium text-warm-700 mb-2">Feed URL Preview</p>
          <code className="text-xs text-warm-600 font-mono break-all">
            webcal://helmsportslabs.com/api/calendar/{selectedType}/[token]
          </code>
          <p className="text-xs text-warm-500 mt-2">
            The actual URL will be generated when you create the feed
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-warm-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2.5 rounded-lg font-medium text-sm
                   bg-white text-warm-700 border border-warm-200
                   hover:bg-warm-50 hover:border-warm-300
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={loading || !selectedType || (showNameInput && !feedName.trim())}
          className="px-4 py-2.5 rounded-lg font-medium text-sm
                   bg-primary-600 text-white hover:bg-primary-700
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors"
        >
          {loading ? 'Creating...' : 'Create Feed'}
        </button>
      </div>
    </div>
  );
}

/**
 * Quick Create Feed Button (inline variant)
 */
export function QuickCreateFeed({
  onSelect,
}: {
  onSelect: (type: FeedType) => void;
}) {
  return (
    <div className="pills-scroll pb-2">
      {FEED_TYPE_OPTIONS.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.type}
            type="button"
            onClick={() => onSelect(option.type)}
            className={cn(
              'shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg',
              'border-2 transition-all active:scale-95',
              option.bgClass,
              option.borderClass,
              'hover:shadow-md'
            )}
          >
            <Icon className={cn('w-4 h-4', option.colorClass)} />
            <span className={cn('text-sm font-medium', option.colorClass)}>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
