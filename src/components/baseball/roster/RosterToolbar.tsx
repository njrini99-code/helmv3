'use client';

import { useState, memo } from 'react';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui/button';
import {
  IconFilter,
  IconChevronDown,
  IconList,
  IconLayoutGrid,
  IconDownload,
} from '@/components/icons';

export type SortField = 'name' | 'position' | 'avg' | 'obp' | 'slg' | 'ops' | 'exit_velo' | 'sessions';
export type SortDirection = 'asc' | 'desc';
export type ViewMode = 'compact' | 'expanded';

interface RosterToolbarProps {
  playerCount: number;
  sortField: SortField;
  sortDirection: SortDirection;
  viewMode: ViewMode;
  onSortChange: (field: SortField, direction: SortDirection) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onExport?: () => void;
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'position', label: 'Position' },
  { value: 'avg', label: 'AVG' },
  { value: 'obp', label: 'OBP' },
  { value: 'slg', label: 'SLG' },
  { value: 'ops', label: 'OPS' },
  { value: 'exit_velo', label: 'Exit Velo' },
  { value: 'sessions', label: 'Sessions' },
];

export const RosterToolbar = memo(function RosterToolbar({
  playerCount,
  sortField,
  sortDirection,
  viewMode,
  onSortChange,
  onViewModeChange,
  onExport,
}: RosterToolbarProps) {
  const [showSortMenu, setShowSortMenu] = useState(false);

  const handleSortChange = (field: SortField) => {
    const newDirection = field === sortField && sortDirection === 'asc' ? 'desc' : 'asc';
    onSortChange(field, newDirection);
    setShowSortMenu(false);
  };

  const selectedSort = SORT_OPTIONS.find((o) => o.value === sortField);

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {/* Sort Controls */}
        <div className="relative">
          <Button variant="ghost"
            onClick={() => setShowSortMenu(!showSortMenu)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium',
              'bg-cream-100/75 backdrop-blur-sm border border-warm-200 text-warm-600',
              'hover:bg-white hover:border-warm-300',
              'transition-all duration-150 active:scale-95'
            )}
            aria-label="Sort roster"
          >
            <IconFilter size={14} className="text-warm-400" />
            <span className="hidden sm:inline">Sort:</span>
            <span className="font-medium">{selectedSort?.label}</span>
            <span className="text-warm-400">
              {sortDirection === 'asc' ? '↑' : '↓'}
            </span>
            <IconChevronDown
              size={14}
              className={cn(
                'text-warm-400 transition-transform',
                showSortMenu && 'rotate-180'
              )}
            />
          </Button>

          {showSortMenu && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setShowSortMenu(false)}
              />
              <div
                className={cn(
                  'absolute left-0 top-full mt-1 z-40',
                  'bg-white rounded-xl border border-warm-200 shadow-lg',
                  'py-1 min-w-[180px]'
                )}
              >
                {SORT_OPTIONS.map((option) => (
                  <Button variant="primary"
                    key={option.value}
                    onClick={() => handleSortChange(option.value)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between',
                      option.value === sortField
                        ? 'text-primary-700 bg-primary-50 font-medium'
                        : 'text-warm-600 hover:bg-warm-50 active:bg-warm-100'
                    )}
                  >
                    <span>{option.label}</span>
                    {option.value === sortField && (
                      <span className="text-primary-500">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* View Toggle - Desktop only */}
        <div className="hidden lg:flex items-center bg-cream-100/75 backdrop-blur-sm border border-warm-200 rounded-xl p-1">
          <IconButton variant="primary"
            onClick={() => onViewModeChange('compact')}
            className={cn(
              'p-2 rounded-lg transition-all',
              viewMode === 'compact'
                ? 'bg-primary-100 text-primary-700'
                : 'text-warm-400 hover:text-warm-600 hover:bg-warm-100'
            )}
            aria-label="Compact view"
            title="Compact view"
          >
            <IconList size={16} />
          </IconButton>
          <IconButton variant="primary"
            onClick={() => onViewModeChange('expanded')}
            className={cn(
              'p-2 rounded-lg transition-all',
              viewMode === 'expanded'
                ? 'bg-primary-100 text-primary-700'
                : 'text-warm-400 hover:text-warm-600 hover:bg-warm-100'
            )}
            aria-label="Expanded view"
            title="Expanded view"
          >
            <IconLayoutGrid size={16} />
          </IconButton>
        </div>
      </div>

      {/* Export Button */}
      {onExport && (
        <Button variant="ghost"
          onClick={onExport}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium',
            'bg-cream-100/75 backdrop-blur-sm border border-warm-200 text-warm-600',
            'hover:bg-white hover:border-warm-300',
            'transition-all duration-150 active:scale-95'
          )}
          aria-label={`Export ${playerCount} players as CSV`}
        >
          <IconDownload size={14} />
          <span className="hidden sm:inline">Export</span>
        </Button>
      )}
    </div>
  );
});

/**
 * Export roster data as CSV
 */
export function exportRosterCSV(
  players: Array<{
    first_name: string | null;
    last_name: string | null;
    primary_position: string | null;
    grad_year: number | null;
    jersey_number: number | null;
    career_avg: number | null;
    career_obp: number | null;
    career_slg: number | null;
    career_ops: number | null;
    avg_exit_velocity: number | null;
    total_sessions: number | null;
    status: string | null;
  }>
) {
  const headers = [
    'First Name',
    'Last Name',
    'Position',
    'Grad Year',
    'Jersey #',
    'AVG',
    'OBP',
    'SLG',
    'OPS',
    'Exit Velo',
    'Sessions',
    'Status',
  ];
  const rows = players.map((p) => [
    p.first_name || '',
    p.last_name || '',
    p.primary_position || '',
    p.grad_year?.toString() || '',
    p.jersey_number?.toString() || '',
    p.career_avg !== null ? p.career_avg.toFixed(3) : '',
    p.career_obp !== null ? p.career_obp.toFixed(3) : '',
    p.career_slg !== null ? p.career_slg.toFixed(3) : '',
    p.career_ops !== null ? p.career_ops.toFixed(3) : '',
    p.avg_exit_velocity !== null ? p.avg_exit_velocity.toFixed(1) : '',
    p.total_sessions?.toString() || '0',
    p.status || '',
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `roster_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
