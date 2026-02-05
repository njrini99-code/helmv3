'use client';

import { useState, memo } from 'react';
import { cn } from '@/lib/utils';
import { IconDownload, IconFilter, IconChevronDown } from '@/components/icons';

type SortField = 'name' | 'handicap' | 'rounds' | 'avg_score';
type SortDirection = 'asc' | 'desc';

interface RosterToolbarProps {
  playerCount: number;
  onSortChange?: (field: SortField, direction: SortDirection) => void;
  onExport?: () => void;
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'handicap', label: 'Handicap' },
  { value: 'rounds', label: 'Rounds Played' },
  { value: 'avg_score', label: 'Avg Score' },
];

export const RosterToolbar = memo(function RosterToolbar({
  playerCount,
  onSortChange,
  onExport,
}: RosterToolbarProps) {
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const handleSortChange = (field: SortField) => {
    const newDirection = field === sortField && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDirection(newDirection);
    setShowSortMenu(false);
    onSortChange?.(field, newDirection);
  };

  const selectedSort = SORT_OPTIONS.find(o => o.value === sortField);

  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      {/* Sort Controls */}
      <div className="relative">
        <button
          onClick={() => setShowSortMenu(!showSortMenu)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium',
            'bg-white border border-slate-200 text-slate-600',
            'hover:bg-slate-50 hover:border-slate-300',
            'transition-all duration-150 active:scale-95'
          )}
          aria-label="Sort roster"
        >
          <IconFilter size={14} className="text-slate-400" />
          <span>Sort: {selectedSort?.label}</span>
          <span className="text-slate-400">{sortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
          <IconChevronDown size={14} className={cn('text-slate-400 transition-transform', showSortMenu && 'rotate-180')} />
        </button>

        {showSortMenu && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setShowSortMenu(false)} />
            <div className={cn(
              'absolute left-0 top-full mt-1 z-40',
              'bg-white rounded-xl border border-slate-200 shadow-lg',
              'py-1 min-w-[180px]'
            )}>
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSortChange(option.value)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between',
                    option.value === sortField
                      ? 'text-primary-700 bg-primary-50 font-medium'
                      : 'text-slate-600 hover:bg-slate-50'
                  )}
                >
                  <span>{option.label}</span>
                  {option.value === sortField && (
                    <span className="text-primary-500">{sortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Export Button */}
      {onExport && (
        <button
          onClick={onExport}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium',
            'bg-white border border-slate-200 text-slate-600',
            'hover:bg-slate-50 hover:border-slate-300',
            'transition-all duration-150 active:scale-95'
          )}
          aria-label={`Export ${playerCount} players as CSV`}
        >
          <IconDownload size={14} />
          <span className="hidden sm:inline">Export</span>
        </button>
      )}
    </div>
  );
});

/**
 * Helper: export roster data as CSV
 */
export function exportRosterCSV(players: Array<{
  first_name: string | null;
  last_name: string | null;
  hometown: string | null;
  state: string | null;
  graduation_year: number | null;
  handicap: number | null;
  rounds_count?: number;
  avg_score?: number;
}>) {
  const headers = ['First Name', 'Last Name', 'Hometown', 'State', 'Grad Year', 'Handicap', 'Rounds', 'Avg Score'];
  const rows = players.map(p => [
    p.first_name || '',
    p.last_name || '',
    p.hometown || '',
    p.state || '',
    p.graduation_year?.toString() || '',
    p.handicap !== null ? p.handicap.toFixed(1) : '',
    p.rounds_count?.toString() || '0',
    p.avg_score && p.avg_score > 0 ? p.avg_score.toFixed(1) : '',
  ]);

  const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `roster_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
