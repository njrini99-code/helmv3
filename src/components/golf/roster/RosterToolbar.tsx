'use client';

import { useState, memo } from 'react';
import { cn } from '@/lib/utils';
import { IconDownload, IconFilter, IconChevronDown } from '@/components/icons';
import { triggerHaptic } from '@/lib/utils/capacitor';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
    void triggerHaptic('light');
    const newDirection = field === sortField && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDirection(newDirection);
    setShowSortMenu(false);
    onSortChange?.(field, newDirection);
  };

  const handleToggleMenu = () => {
    void triggerHaptic('light');
    setShowSortMenu((v) => !v);
  };

  const selectedSort = SORT_OPTIONS.find(o => o.value === sortField);

  return (
    <div className="flex items-center justify-between gap-3 mb-5">
      <DropdownMenu open={showSortMenu} onOpenChange={setShowSortMenu}>
        <DropdownMenuTrigger asChild>
          <button
            onClick={handleToggleMenu}
            className="pill-soft"
            aria-label="Sort roster"
          >
            <IconFilter size={13} className="text-warm-400" />
            <span>Sort: {selectedSort?.label}</span>
            <span className="text-warm-400">{sortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
            <IconChevronDown size={13} className={cn('text-warm-400 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]', showSortMenu && 'rotate-180')} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[220px]">
          {SORT_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => handleSortChange(option.value)}
              selected={option.value === sortField}
              className="flex items-center justify-between"
            >
              <span>{option.label}</span>
              {option.value === sortField && (
                <span className="text-primary-500 text-[14px]">{sortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {onExport && (
        <button
          onClick={() => {
            void triggerHaptic('light');
            onExport();
          }}
          className="pill-soft"
          aria-label={`Export ${playerCount} players as CSV`}
        >
          <IconDownload size={13} />
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
