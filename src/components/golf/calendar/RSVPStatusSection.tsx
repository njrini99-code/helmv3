'use client';

/**
 * RSVP Status Section Component - Premium UI
 *
 * Coach view for monitoring event RSVP status:
 * - RSVP Progress Ring showing breakdown
 * - Player list with avatars
 * - Response status dots
 * - Quick stats (accepted/total)
 * - Filter by response status
 * - Search functionality
 * - Export functionality
 * - Send reminders (bulk selection)
 *
 * Used in event detail pages for coaches to monitor attendance.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { RSVPProgressRing } from './RSVPProgressRing';
import { Users, Download, Search } from 'lucide-react';
import '@/styles/calendar-tokens.css';

interface RSVPParticipant {
  id: string;
  user_id: string;
  name: string;
  avatar_url?: string | null;
  response: 'accepted' | 'tentative' | 'declined' | 'pending';
  responded_at?: string | null;
  email?: string;
  phone?: string;
}

interface RSVPStatusSectionProps {
  participants: RSVPParticipant[];
  totalInvited: number;
  className?: string;
  onExport?: () => void;
  onSendReminder?: (participantIds: string[]) => Promise<void>;
  compact?: boolean;
}

type RSVPFilter = 'all' | 'accepted' | 'tentative' | 'declined' | 'pending';

interface RSVPStats {
  accepted: number;
  tentative: number;
  declined: number;
  pending: number;
  total: number;
  percentage: number;
}

const RESPONSE_CONFIGS = {
  accepted: {
    label: 'Accepted',
    color: 'bg-primary-500',
    textColor: 'text-primary-700',
    bgColor: 'bg-primary-50',
  },
  tentative: {
    label: 'Tentative',
    color: 'bg-amber-500',
    textColor: 'text-amber-700',
    bgColor: 'bg-amber-50',
  },
  declined: {
    label: 'Declined',
    color: 'bg-rose-400',
    textColor: 'text-rose-700',
    bgColor: 'bg-rose-50',
  },
  pending: {
    label: 'No Response',
    color: 'bg-warm-300',
    textColor: 'text-warm-600',
    bgColor: 'bg-warm-50',
  },
};

export function RSVPStatusSection({
  participants,
  totalInvited,
  className,
  onExport,
  onSendReminder,
  compact = false,
}: RSVPStatusSectionProps) {
  const [filter, setFilter] = useState<RSVPFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Calculate stats
  const stats: RSVPStats = {
    accepted: participants.filter((p) => p.response === 'accepted').length,
    tentative: participants.filter((p) => p.response === 'tentative').length,
    declined: participants.filter((p) => p.response === 'declined').length,
    pending: participants.filter((p) => p.response === 'pending').length,
    total: totalInvited,
    percentage:
      totalInvited > 0
        ? (participants.filter((p) => p.response === 'accepted').length / totalInvited) * 100
        : 0,
  };

  // Filter and search participants
  const filteredParticipants = participants
    .filter((p) => filter === 'all' || p.response === filter)
    .filter((p) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(query) ||
        p.email?.toLowerCase().includes(query)
      );
    });

  function toggleSelection(id: string) {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  }

  function selectAll() {
    if (selectedIds.size === filteredParticipants.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredParticipants.map((p) => p.id)));
    }
  }

  async function handleSendReminder() {
    if (onSendReminder && selectedIds.size > 0) {
      await onSendReminder(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  }

  return (
    <div className={cn('bg-white rounded-2xl border border-warm-200 shadow-sm', className)}>
      {/* Header */}
      <div className={cn('p-6 border-b border-warm-200', compact && 'p-4')}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className={cn('font-semibold text-warm-900', compact ? 'text-base' : 'text-lg')}>
              RSVP Status
            </h3>
            <p className="text-sm text-warm-500 mt-1">
              {stats.accepted} of {stats.total} accepted
            </p>
          </div>

          {onExport && (
            <button
              onClick={onExport}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-warm-700 bg-warm-50 hover:bg-warm-100 active:bg-warm-200 rounded-lg border border-warm-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
        </div>

        {/* Progress Ring */}
        <div className="flex justify-center">
          <RSVPProgressRing
            confirmed={stats.accepted}
            maybe={stats.tentative}
            declined={stats.declined}
            pending={stats.pending}
            total={stats.total}
            size={compact ? 'md' : 'lg'}
            showLabel={!compact}
          />
        </div>
      </div>

      {/* Filters and search */}
      <div className={cn('p-4 border-b border-warm-200 space-y-3', compact && 'p-3')}>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
          <input
            type="text"
            placeholder="Search players..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex flex-wrap gap-2">
          <FilterButton
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            count={participants.length}
          >
            All
          </FilterButton>
          <FilterButton
            active={filter === 'accepted'}
            onClick={() => setFilter('accepted')}
            count={stats.accepted}
            color="primary"
          >
            Accepted
          </FilterButton>
          <FilterButton
            active={filter === 'tentative'}
            onClick={() => setFilter('tentative')}
            count={stats.tentative}
            color="amber"
          >
            Tentative
          </FilterButton>
          <FilterButton
            active={filter === 'declined'}
            onClick={() => setFilter('declined')}
            count={stats.declined}
            color="rose"
          >
            Declined
          </FilterButton>
          <FilterButton
            active={filter === 'pending'}
            onClick={() => setFilter('pending')}
            count={stats.pending}
            color="slate"
          >
            Pending
          </FilterButton>
        </div>
      </div>

      {/* Player list */}
      <div className="divide-y divide-warm-200 max-h-[400px] overflow-y-auto overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }} data-scroll-container>
        {filteredParticipants.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-8 h-8 text-warm-300 mx-auto mb-2" />
            <p className="text-sm text-warm-500">
              {searchQuery ? 'No players match your search' : 'No players in this category'}
            </p>
          </div>
        ) : (
          <>
            {/* Select all (if reminder function available) */}
            {onSendReminder && filteredParticipants.length > 1 && (
              <div className="p-3 bg-warm-50 border-b border-warm-200">
                <button
                  onClick={selectAll}
                  className="text-sm text-warm-700 hover:text-warm-900 font-medium"
                >
                  {selectedIds.size === filteredParticipants.length
                    ? 'Deselect All'
                    : `Select All (${filteredParticipants.length})`}
                </button>
              </div>
            )}

            {filteredParticipants.map((participant) => (
              <ParticipantRow
                key={participant.id}
                participant={participant}
                selected={selectedIds.has(participant.id)}
                onToggleSelect={() => toggleSelection(participant.id)}
                showCheckbox={!!onSendReminder}
                compact={compact}
              />
            ))}
          </>
        )}
      </div>

      {/* Actions footer (if selections made) */}
      {selectedIds.size > 0 && onSendReminder && (
        <div className="p-4 border-t border-warm-200 bg-warm-50">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-warm-600">{selectedIds.size} selected</p>
            <button
              onClick={handleSendReminder}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Send Reminder
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Filter Button Component
 */
function FilterButton({
  active,
  onClick,
  count,
  color = 'slate',
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  color?: 'primary' | 'amber' | 'rose' | 'slate';
  children: React.ReactNode;
}) {
  const colorClasses = {
    primary: active ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-700 hover:bg-primary-100',
    amber: active ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100',
    rose: active ? 'bg-rose-500 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100',
    slate: active ? 'bg-warm-600 text-white' : 'bg-warm-100 text-warm-700 hover:bg-warm-200',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
        'flex items-center gap-2',
        colorClasses[color]
      )}
    >
      <span>{children}</span>
      <span className={cn('tabular-nums', active ? 'opacity-90' : 'opacity-75')}>
        {count}
      </span>
    </button>
  );
}

/**
 * Participant Row Component
 */
function ParticipantRow({
  participant,
  selected,
  onToggleSelect,
  showCheckbox,
  compact,
}: {
  participant: RSVPParticipant;
  selected: boolean;
  onToggleSelect: () => void;
  showCheckbox: boolean;
  compact?: boolean;
}) {
  const config = RESPONSE_CONFIGS[participant.response];

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 hover:bg-warm-50 active:bg-warm-100 transition-colors',
        selected && 'bg-primary-50',
        compact && 'p-2'
      )}
    >
      {/* Checkbox (if enabled) */}
      {showCheckbox && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-2 focus:ring-primary-100"
        />
      )}

      {/* Avatar */}
      <div className="shrink-0">
        {participant.avatar_url ? (
          <img
            src={participant.avatar_url}
            alt={participant.name}
            className={cn('rounded-full object-cover', compact ? 'w-8 h-8' : 'w-10 h-10')}
          />
        ) : (
          <div
            className={cn(
              'rounded-full bg-warm-200 flex items-center justify-center text-warm-600 font-medium',
              compact ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
            )}
          >
            {participant.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)}
          </div>
        )}
      </div>

      {/* Name and email */}
      <div className="flex-1 min-w-0">
        <p className={cn('font-medium text-warm-900 truncate', compact ? 'text-sm' : 'text-base')}>
          {participant.name}
        </p>
        {!compact && participant.email && (
          <p className="text-xs text-warm-500 truncate">{participant.email}</p>
        )}
      </div>

      {/* Response status */}
      <div className="shrink-0">
        <div
          className={cn(
            'flex items-center gap-2 px-2.5 py-1 rounded-full',
            config.bgColor
          )}
        >
          <div className={cn('w-2 h-2 rounded-full', config.color)}></div>
          {!compact && (
            <span className={cn('text-xs font-medium', config.textColor)}>
              {config.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

