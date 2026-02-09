'use client';

/**
 * Poll Result Selector Component
 *
 * Coach interface for selecting optimal meeting time:
 * - Top 5 time slots ranked by availability
 * - Availability bar graphs with percentages
 * - Participant count display
 * - Select button for each slot
 * - Create event action
 * - Sort by availability or date
 *
 * Used after availability poll to convert to scheduled event.
 */

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { AvailabilityBar, CompactAvailabilityIndicator } from './AvailabilityCell';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  Clock,
  Users,
  TrendingUp,
  Check,
  ChevronDown,
  Plus,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import '@/styles/calendar-tokens.css';

export interface PollSlotResult {
  date: string; // ISO date string
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  availableCount: number;
  maybeCount: number;
  totalResponses: number;
  availableUsers: string[];
  maybeUsers?: string[];
}

export interface PollResultSelectorProps {
  pollTitle: string;
  results: PollSlotResult[];
  onSelectSlot: (slot: PollSlotResult) => void;
  onCreateEvent?: (slot: PollSlotResult) => void;
  maxResults?: number;
  sortBy?: 'availability' | 'date';
  className?: string;
}

type SortMode = 'availability' | 'date';

export function PollResultSelector({
  pollTitle,
  results,
  onSelectSlot,
  onCreateEvent,
  maxResults = 5,
  sortBy: initialSortBy = 'availability',
  className,
}: PollResultSelectorProps) {
  const [selectedSlot, setSelectedSlot] = useState<PollSlotResult | null>(null);
  const [sortBy, setSortBy] = useState<SortMode>(initialSortBy);
  const [showAll, setShowAll] = useState(false);

  // Sort and filter results
  const sortedResults = useMemo(() => {
    const sorted = [...results].sort((a, b) => {
      if (sortBy === 'availability') {
        // Sort by availability percentage (descending)
        const aPercentage = a.totalResponses > 0 ? a.availableCount / a.totalResponses : 0;
        const bPercentage = b.totalResponses > 0 ? b.availableCount / b.totalResponses : 0;

        if (aPercentage !== bPercentage) {
          return bPercentage - aPercentage;
        }

        // Tie-breaker: total count
        return b.availableCount - a.availableCount;
      } else {
        // Sort by date/time (ascending)
        const aDateTime = new Date(`${a.date}T${a.startTime}`);
        const bDateTime = new Date(`${b.date}T${b.startTime}`);
        return aDateTime.getTime() - bDateTime.getTime();
      }
    });

    return showAll ? sorted : sorted.slice(0, maxResults);
  }, [results, sortBy, showAll, maxResults]);

  function handleSelectSlot(slot: PollSlotResult) {
    setSelectedSlot(slot);
    onSelectSlot(slot);
  }

  function handleCreateEvent() {
    if (selectedSlot && onCreateEvent) {
      onCreateEvent(selectedSlot);
    }
  }

  const hasMoreResults = results.length > maxResults;

  return (
    <div className={cn('bg-white rounded-2xl border border-warm-200 shadow-sm', className)}>
      {/* Header */}
      <div className="p-5 border-b border-warm-200">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h3 className="text-lg font-semibold text-warm-900">{pollTitle}</h3>
            <p className="text-sm text-warm-500 mt-1">
              Top time slots based on team availability
            </p>
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortMode)}
              className="pl-3 pr-8 py-2 text-sm border border-warm-200 rounded-lg bg-white text-warm-700 font-medium cursor-pointer hover:border-warm-300 focus:outline-none focus:ring-2 focus:ring-green-100 focus:border-green-500"
            >
              <option value="availability">Best Availability</option>
              <option value="date">Earliest Date</option>
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-warm-400" />
            <span className="text-warm-600">
              {results[0]?.totalResponses || 0} responses
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-warm-400" />
            <span className="text-warm-600">{results.length} time slots</span>
          </div>
        </div>
      </div>

      {/* Results list */}
      <div className="divide-y divide-warm-200">
        {sortedResults.length === 0 ? (
          <div className="p-12 text-center">
            <TrendingUp className="w-12 h-12 text-warm-300 mx-auto mb-3" />
            <p className="text-sm text-warm-500">No poll results available</p>
          </div>
        ) : (
          <>
            {sortedResults.map((slot, index) => {
              const dateObj = parseISO(slot.date);
              const _percentage =
                slot.totalResponses > 0
                  ? (slot.availableCount / slot.totalResponses) * 100
                  : 0;
              void _percentage; // Suppress unused warning - may be used in future
              const isSelected = selectedSlot === slot;
              const isTopChoice = sortBy === 'availability' && index === 0;

              return (
                <div
                  key={`${slot.date}-${slot.startTime}`}
                  className={cn(
                    'p-4 transition-all',
                    isSelected && 'bg-green-50',
                    isTopChoice && 'bg-emerald-50/50'
                  )}
                >
                  <div className="flex items-start gap-4">
                    {/* Rank badge */}
                    <div
                      className={cn(
                        'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold',
                        isTopChoice
                          ? 'bg-emerald-600 text-white'
                          : 'bg-warm-100 text-warm-600'
                      )}
                    >
                      {index + 1}
                    </div>

                    {/* Slot details */}
                    <div className="flex-1 min-w-0">
                      {/* Date and time */}
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-warm-400" />
                          <span className="font-semibold text-warm-900">
                            {format(dateObj, 'EEEE, MMMM d')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-warm-400" />
                          <span className="text-sm text-warm-600">
                            {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                          </span>
                        </div>
                      </div>

                      {/* Availability indicator */}
                      <CompactAvailabilityIndicator
                        availableCount={slot.availableCount}
                        totalResponses={slot.totalResponses}
                        className="mb-2"
                      />

                      {/* Availability bar */}
                      <AvailabilityBar
                        availableCount={slot.availableCount}
                        maybeCount={slot.maybeCount}
                        totalResponses={slot.totalResponses}
                        showLabels
                      />

                      {/* Top choice badge */}
                      {isTopChoice && (
                        <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
                          <TrendingUp className="w-3 h-3" />
                          Best Option
                        </div>
                      )}
                    </div>

                    {/* Select button */}
                    <div className="shrink-0">
                      <button
                        onClick={() => handleSelectSlot(slot)}
                        className={cn(
                          'min-w-[100px] px-4 py-2.5 rounded-lg font-medium text-sm',
                          'transition-all duration-200',
                          isSelected
                            ? 'bg-green-600 text-white shadow-md'
                            : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                        )}
                      >
                        {isSelected ? (
                          <span className="flex items-center gap-2">
                            <Check className="w-4 h-4" />
                            Selected
                          </span>
                        ) : (
                          'Select'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Show more button */}
            {hasMoreResults && !showAll && (
              <div className="p-4">
                <button
                  onClick={() => setShowAll(true)}
                  className="w-full py-2 text-sm font-medium text-warm-600 hover:text-warm-900 flex items-center justify-center gap-2 hover:bg-warm-50 rounded-lg transition-colors"
                >
                  <span>Show {results.length - maxResults} more options</span>
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create event footer */}
      {selectedSlot && onCreateEvent && (
        <div className="p-5 border-t border-warm-200 bg-warm-50">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-warm-900">Ready to schedule?</p>
              <p className="text-xs text-warm-600 mt-0.5">
                {selectedSlot.availableCount} players available for this time
              </p>
            </div>
            <Button onClick={handleCreateEvent} className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-2" />
              Create Event
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Format time string for display
 */
function formatTime(time: string): string {
  const parts = time.split(':').map(Number);
  const hours = parts[0] ?? 0;
  const minutes = parts[1] ?? 0;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;

  if (minutes === 0) {
    return `${displayHour} ${period}`;
  }

  return `${displayHour}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * Compact Poll Results (for previews)
 */
export function CompactPollResults({
  results,
  className,
}: Pick<PollResultSelectorProps, 'results' | 'className'>) {
  // Show top 3 results
  const topResults = [...results]
    .sort((a, b) => {
      const aPercentage = a.totalResponses > 0 ? a.availableCount / a.totalResponses : 0;
      const bPercentage = b.totalResponses > 0 ? b.availableCount / b.totalResponses : 0;
      return bPercentage - aPercentage;
    })
    .slice(0, 3);

  return (
    <div className={cn('space-y-2', className)}>
      {topResults.map((slot, index) => {
        const dateObj = parseISO(slot.date);
        const percentage =
          slot.totalResponses > 0 ? (slot.availableCount / slot.totalResponses) * 100 : 0;

        return (
          <div key={`${slot.date}-${slot.startTime}`} className="flex items-center gap-2 text-sm">
            <span className="w-5 h-5 rounded bg-warm-100 text-warm-600 text-xs font-semibold flex items-center justify-center">
              {index + 1}
            </span>
            <span className="text-warm-700 flex-1 truncate">
              {format(dateObj, 'MMM d')} at {formatTime(slot.startTime)}
            </span>
            <span className="text-warm-500 tabular-nums">{Math.round(percentage)}%</span>
          </div>
        );
      })}
    </div>
  );
}
