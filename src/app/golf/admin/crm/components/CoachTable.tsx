'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { Coach, CoachStatus } from '../page';
import { IconMail, IconChevronDown, IconChevronUp, IconStar, IconStarFilled, IconChevronLeft, IconChevronRight } from '@/components/icons';

interface CoachTableProps {
  coaches: Coach[];
  loading: boolean;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onStatusChange: (coachId: string, status: CoachStatus) => void;
  onPriorityChange: (coachId: string, priority: number) => void;
  onToggleStar: (coachId: string, currentStarred: boolean) => void;
  onCoachClick: (coach: Coach) => void;
  statusConfig: Record<CoachStatus, { label: string; color: string; bgColor: string; order: number }>;
  priorityConfig: Record<number, { label: string; color: string; icon: string }>;
}

const ALL_STATUSES: CoachStatus[] = [
  'new_lead', 'researching', 'outreach_pending', 'initial_contact',
  'follow_up', 'engaged', 'demo_scheduled', 'demo_completed',
  'proposal_sent', 'negotiating', 'closed_won', 'closed_lost',
  'not_interested', 'bad_timing', 'nurture'
];

type SortField = 'name' | 'school' | 'conference' | 'division' | 'status' | 'priority' | 'last_contacted_at' | 'next_follow_up_at';
type SortDir = 'asc' | 'desc';

const PAGE_SIZES = [25, 50, 100, 250];

// Abbreviate long conference names
const abbreviateConference = (conf: string): string => {
  const abbrevMap: Record<string, string> = {
    'Northern Sun Intercollegiate Conference': 'NSIC',
    'Great Northwest Athletic Conference': 'GNAC',
    'Great Midwest Athletic Conference': 'G-MAC',
    'Great Lakes Valley Conference': 'GLVC',
    'Mid-America Intercollegiate Athletics Association': 'MIAA',
    'Mountain East Conference': 'MEC',
    'Northeast-10 Conference': 'NE10',
    'Pacific West Conference': 'PacWest',
    'Peach Belt Conference': 'PBC',
    'Rocky Mountain Athletic Conference': 'RMAC',
    'Sunshine State Conference': 'SSC',
    'Lone Star Conference': 'LSC',
    'Gulf South Conference': 'GSC',
    'Pennsylvania State Athletic Conference': 'PSAC',
    'Central Atlantic Collegiate Conference': 'CACC',
    'South Atlantic Conference': 'SAC',
    'Conference Carolinas': 'CC',
    'Central Intercollegiate Athletic Association': 'CIAA',
    'Southern Intercollegiate Athletic Conference': 'SIAC',
  };
  return abbrevMap[conf] || conf;
};

export function CoachTable({
  coaches,
  loading,
  selectedIds,
  onSelectionChange,
  onStatusChange,
  onPriorityChange,
  onToggleStar,
  onCoachClick,
  statusConfig,
  priorityConfig,
}: CoachTableProps) {
  const [openDropdown, setOpenDropdown] = useState<{ id: string; type: 'status' | 'priority' } | null>(null);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // Reset page when coaches change (filter applied)
  useEffect(() => {
    setPage(1);
  }, [coaches.length]);

  // Sort coaches
  const sortedCoaches = useMemo(() => {
    if (!sortField) return coaches;
    
    return [...coaches].sort((a, b) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;
      
      switch (sortField) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'school':
          aVal = a.school.toLowerCase();
          bVal = b.school.toLowerCase();
          break;
        case 'conference':
          aVal = a.conference.toLowerCase();
          bVal = b.conference.toLowerCase();
          break;
        case 'division':
          aVal = a.division;
          bVal = b.division;
          break;
        case 'status':
          aVal = statusConfig[a.status]?.order || 0;
          bVal = statusConfig[b.status]?.order || 0;
          break;
        case 'priority':
          aVal = a.priority;
          bVal = b.priority;
          break;
        case 'last_contacted_at':
          aVal = a.last_contacted_at || '';
          bVal = b.last_contacted_at || '';
          break;
        case 'next_follow_up_at':
          aVal = a.next_follow_up_at || '';
          bVal = b.next_follow_up_at || '';
          break;
      }
      
      if (aVal === null || bVal === null) return 0;
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [coaches, sortField, sortDir, statusConfig]);

  // Paginate
  const totalPages = Math.ceil(sortedCoaches.length / pageSize);
  const paginatedCoaches = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedCoaches.slice(start, start + pageSize);
  }, [sortedCoaches, page, pageSize]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (paginatedCoaches.length === 0) return;
    
    // Don't handle if focus is in an input
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
    
    switch (e.key) {
      case 'j': // Down
        e.preventDefault();
        setFocusedIndex(prev => 
          prev === null ? 0 : Math.min(prev + 1, paginatedCoaches.length - 1)
        );
        break;
      case 'k': // Up
        e.preventDefault();
        setFocusedIndex(prev => 
          prev === null ? 0 : Math.max(prev - 1, 0)
        );
        break;
      case 's': // Star
        if (focusedIndex !== null && paginatedCoaches[focusedIndex]) {
          e.preventDefault();
          const coach = paginatedCoaches[focusedIndex];
          onToggleStar(coach.id, coach.is_starred);
        }
        break;
      case 'Enter': // Open detail
        if (focusedIndex !== null && paginatedCoaches[focusedIndex]) {
          e.preventDefault();
          onCoachClick(paginatedCoaches[focusedIndex]);
        }
        break;
      case 'x': // Toggle selection
        if (focusedIndex !== null && paginatedCoaches[focusedIndex]) {
          e.preventDefault();
          toggleSelection(paginatedCoaches[focusedIndex].id);
        }
        break;
      case 'Escape':
        setFocusedIndex(null);
        setOpenDropdown(null);
        break;
    }
  }, [paginatedCoaches, focusedIndex, onToggleStar, onCoachClick]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatFollowUp = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, isOverdue: true };
    if (diffDays === 0) return { text: 'Today', isOverdue: false };
    if (diffDays === 1) return { text: 'Tomorrow', isOverdue: false };
    if (diffDays < 7) return { text: `In ${diffDays}d`, isOverdue: false };
    return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), isOverdue: false };
  };

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    onSelectionChange(newSelection);
  };

  const toggleAll = () => {
    if (selectedIds.size === paginatedCoaches.length) {
      // Deselect all on current page
      const newSelection = new Set(selectedIds);
      paginatedCoaches.forEach(c => newSelection.delete(c.id));
      onSelectionChange(newSelection);
    } else {
      // Select all on current page
      const newSelection = new Set(selectedIds);
      paginatedCoaches.forEach(c => newSelection.add(c.id));
      onSelectionChange(newSelection);
    }
  };

  const getRowHighlight = (coach: Coach) => {
    if (coach.highlight_color) {
      return { backgroundColor: `${coach.highlight_color}15`, borderLeftColor: coach.highlight_color };
    }
    if (coach.priority === 3) {
      return { backgroundColor: '#fef2f215', borderLeftColor: '#ef4444' };
    }
    if (coach.priority === 2) {
      return { backgroundColor: '#fff7ed15', borderLeftColor: '#f97316' };
    }
    return {};
  };

  const SortHeader = ({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <th 
      className={cn(
        'text-left px-4 py-3 text-xs font-semibold text-warm-600 uppercase tracking-wider cursor-pointer hover:bg-warm-100 select-none transition-colors',
        className
      )}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          sortDir === 'asc' 
            ? <IconChevronUp className="w-3 h-3" />
            : <IconChevronDown className="w-3 h-3" />
        )}
      </div>
    </th>
  );

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-warm-200 p-8">
        <div className="flex items-center justify-center gap-3">
          <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
          <span className="text-warm-500">Loading coaches...</span>
        </div>
      </div>
    );
  }

  if (coaches.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-warm-200 p-12 text-center">
        <div className="text-4xl mb-4">📋</div>
        <h3 className="text-lg font-medium text-warm-900 mb-2">No coaches found</h3>
        <p className="text-warm-500">Try adjusting your filters or import some data to get started.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-warm-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-warm-50 border-b border-warm-200 sticky top-0 z-10">
            <tr>
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  checked={paginatedCoaches.length > 0 && paginatedCoaches.every(c => selectedIds.has(c.id))}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded border-warm-300 text-emerald-600 focus:ring-emerald-500"
                />
              </th>
              <th className="w-10 px-2 py-3"></th>
              <SortHeader field="name">Coach</SortHeader>
              <SortHeader field="school">School</SortHeader>
              <SortHeader field="conference">Conference</SortHeader>
              <SortHeader field="division" className="w-16">Div</SortHeader>
              <SortHeader field="status">Status</SortHeader>
              <SortHeader field="priority" className="w-24">Priority</SortHeader>
              <SortHeader field="last_contacted_at" className="w-28">Last Contact</SortHeader>
              <SortHeader field="next_follow_up_at" className="w-28">Follow-up</SortHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-100">
            {paginatedCoaches.map((coach, index) => {
              const followUp = formatFollowUp(coach.next_follow_up_at);
              const rowStyle = getRowHighlight(coach);
              const isFocused = focusedIndex === index;
              
              return (
                <tr
                  key={coach.id}
                  className={cn(
                    'hover:bg-warm-50/50 transition-colors cursor-pointer group',
                    selectedIds.has(coach.id) && 'bg-emerald-50/50',
                    isFocused && 'ring-2 ring-inset ring-emerald-400'
                  )}
                  style={{
                    ...rowStyle,
                    borderLeft: rowStyle.borderLeftColor ? `3px solid ${rowStyle.borderLeftColor}` : undefined
                  }}
                  onClick={() => onCoachClick(coach)}
                  onMouseEnter={() => setFocusedIndex(index)}
                >
                  {/* Checkbox */}
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(coach.id)}
                      onChange={() => toggleSelection(coach.id)}
                      className="w-4 h-4 rounded border-warm-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </td>
                  
                  {/* Star */}
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onToggleStar(coach.id, coach.is_starred)}
                      className={cn(
                        'p-1 rounded transition-colors',
                        coach.is_starred 
                          ? 'text-yellow-500 hover:text-yellow-600' 
                          : 'text-warm-300 hover:text-yellow-400 opacity-0 group-hover:opacity-100'
                      )}
                    >
                      {coach.is_starred ? (
                        <IconStarFilled className="w-4 h-4" />
                      ) : (
                        <IconStar className="w-4 h-4" />
                      )}
                    </button>
                  </td>

                  {/* Coach Info */}
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {coach.priority > 0 && (
                        <span className={cn('text-sm', priorityConfig[coach.priority]?.color)}>
                          {priorityConfig[coach.priority]?.icon}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-warm-900 truncate">{coach.name}</div>
                        {coach.email && (
                          <a
                            href={`mailto:${coach.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            <IconMail className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate max-w-[160px]">{coach.email}</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* School */}
                  <td className="px-4 py-2">
                    <div className="text-sm font-medium text-warm-900 truncate max-w-[180px]" title={coach.school}>
                      {coach.school}
                    </div>
                    <div className="text-xs text-warm-500 capitalize">
                      {coach.program === 'mens' ? "Men's" : coach.program === 'womens' ? "Women's" : 'Both'}
                    </div>
                  </td>

                  {/* Conference */}
                  <td className="px-4 py-2">
                    <div 
                      className="text-sm text-warm-700 truncate max-w-[120px]" 
                      title={coach.conference}
                    >
                      {abbreviateConference(coach.conference)}
                    </div>
                  </td>

                  {/* Division */}
                  <td className="px-4 py-2">
                    <span className={cn(
                      'inline-flex px-2 py-0.5 rounded text-xs font-semibold',
                      coach.division === 'D2' 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-purple-100 text-purple-700'
                    )}>
                      {coach.division}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      <button
                        onClick={() => setOpenDropdown(
                          openDropdown?.id === coach.id && openDropdown.type === 'status' 
                            ? null 
                            : { id: coach.id, type: 'status' }
                        )}
                        className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all hover:ring-2 hover:ring-offset-1',
                          statusConfig[coach.status]?.bgColor,
                          statusConfig[coach.status]?.color
                        )}
                      >
                        {statusConfig[coach.status]?.label || coach.status}
                        <IconChevronDown className="w-3 h-3 opacity-60" />
                      </button>
                      
                      {openDropdown?.id === coach.id && openDropdown.type === 'status' && (
                        <div className="absolute z-30 mt-1 bg-white border border-warm-200 rounded-lg shadow-lg py-1 min-w-[160px] max-h-[300px] overflow-y-auto">
                          {ALL_STATUSES.map((status) => (
                            <button
                              key={status}
                              onClick={() => {
                                onStatusChange(coach.id, status);
                                setOpenDropdown(null);
                              }}
                              className={cn(
                                'w-full text-left px-3 py-1.5 text-sm hover:bg-warm-50 transition-colors flex items-center gap-2',
                                coach.status === status && 'bg-warm-100'
                              )}
                            >
                              <span className={cn(
                                'inline-block w-2 h-2 rounded-full',
                                statusConfig[status]?.bgColor.replace('bg-', 'bg-').replace('-100', '-400')
                              )} />
                              {statusConfig[status]?.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Priority */}
                  <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      <button
                        onClick={() => setOpenDropdown(
                          openDropdown?.id === coach.id && openDropdown.type === 'priority' 
                            ? null 
                            : { id: coach.id, type: 'priority' }
                        )}
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors hover:bg-warm-100',
                          priorityConfig[coach.priority]?.color || 'text-warm-500'
                        )}
                      >
                        {priorityConfig[coach.priority]?.icon} {priorityConfig[coach.priority]?.label}
                        <IconChevronDown className="w-3 h-3 opacity-60" />
                      </button>
                      
                      {openDropdown?.id === coach.id && openDropdown.type === 'priority' && (
                        <div className="absolute z-30 mt-1 bg-white border border-warm-200 rounded-lg shadow-lg py-1 min-w-[120px]">
                          {[3, 2, 1, 0].map((p) => (
                            <button
                              key={p}
                              onClick={() => {
                                onPriorityChange(coach.id, p);
                                setOpenDropdown(null);
                              }}
                              className={cn(
                                'w-full text-left px-3 py-1.5 text-sm hover:bg-warm-50 transition-colors',
                                coach.priority === p && 'bg-warm-100',
                                priorityConfig[p]?.color
                              )}
                            >
                              {priorityConfig[p]?.icon} {priorityConfig[p]?.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Last Contact */}
                  <td className="px-4 py-2">
                    <div className="text-sm text-warm-600">
                      {formatDate(coach.last_contacted_at)}
                    </div>
                  </td>

                  {/* Follow-up */}
                  <td className="px-4 py-2">
                    {followUp ? (
                      <div className={cn(
                        'text-sm font-medium',
                        followUp.isOverdue ? 'text-red-600' : 'text-warm-600'
                      )}>
                        {followUp.text}
                      </div>
                    ) : (
                      <span className="text-sm text-warm-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Footer with Pagination */}
      <div className="border-t border-warm-200 bg-warm-50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-warm-600">
          <span>
            Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, sortedCoaches.length)} of {sortedCoaches.length}
          </span>
          {selectedIds.size > 0 && (
            <span className="text-emerald-600 font-medium">
              • {selectedIds.size} selected
            </span>
          )}
          <div className="flex items-center gap-2 text-xs text-warm-500">
            <kbd className="px-1.5 py-0.5 bg-warm-200 rounded">j</kbd>/<kbd className="px-1.5 py-0.5 bg-warm-200 rounded">k</kbd> nav
            <kbd className="px-1.5 py-0.5 bg-warm-200 rounded">s</kbd> star
            <kbd className="px-1.5 py-0.5 bg-warm-200 rounded">x</kbd> select
            <kbd className="px-1.5 py-0.5 bg-warm-200 rounded">↵</kbd> open
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Page Size */}
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="text-sm border border-warm-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {PAGE_SIZES.map(size => (
              <option key={size} value={size}>{size} per page</option>
            ))}
          </select>
          
          {/* Page Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="p-1.5 rounded hover:bg-warm-200 disabled:opacity-40 disabled:cursor-not-allowed"
              title="First page"
            >
              <IconChevronLeft className="w-4 h-4" />
              <IconChevronLeft className="w-4 h-4 -ml-2" />
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded hover:bg-warm-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <IconChevronLeft className="w-4 h-4" />
            </button>
            
            <span className="px-3 text-sm font-medium">
              Page {page} of {totalPages}
            </span>
            
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded hover:bg-warm-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <IconChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="p-1.5 rounded hover:bg-warm-200 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Last page"
            >
              <IconChevronRight className="w-4 h-4" />
              <IconChevronRight className="w-4 h-4 -ml-2" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
