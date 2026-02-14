'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { Coach, CoachStatus } from '../page';

interface CoachTableProps {
  coaches: Coach[];
  loading: boolean;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onStatusChange: (coachId: string, status: CoachStatus) => void;
  onPriorityChange: (coachId: string, priority: number) => void;
  onToggleStar: (coachId: string, currentStarred: boolean) => void;
  onCoachClick: (coach: Coach) => void;
  statusConfig: Record<CoachStatus, { label: string; color: string; bgColor: string; icon: string; order: number }>;
  priorityConfig: Record<number, { label: string; color: string; bgColor: string; icon: string }>;
}

const ALL_STATUSES: CoachStatus[] = ['new_lead', 'contacted', 'demo_scheduled', 'customer', 'closed'];

type SortField = 'name' | 'school' | 'conference' | 'division' | 'status' | 'priority';
type SortDir = 'asc' | 'desc';

const PAGE_SIZES = [25, 50, 100];

// Conference abbreviations
const CONF_ABBREV: Record<string, string> = {
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
  const [pageSize, setPageSize] = useState(25);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

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
        case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
        case 'school': aVal = a.school.toLowerCase(); bVal = b.school.toLowerCase(); break;
        case 'conference': aVal = a.conference.toLowerCase(); bVal = b.conference.toLowerCase(); break;
        case 'division': aVal = a.division; bVal = b.division; break;
        case 'status': aVal = statusConfig[a.status]?.order || 0; bVal = statusConfig[b.status]?.order || 0; break;
        case 'priority': aVal = a.priority; bVal = b.priority; break;
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
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
    
    switch (e.key) {
      case 'j':
        e.preventDefault();
        setFocusedIndex(prev => prev === null ? 0 : Math.min(prev + 1, paginatedCoaches.length - 1));
        break;
      case 'k':
        e.preventDefault();
        setFocusedIndex(prev => prev === null ? 0 : Math.max(prev - 1, 0));
        break;
      case 's':
        if (focusedIndex !== null && paginatedCoaches[focusedIndex]) {
          e.preventDefault();
          const coach = paginatedCoaches[focusedIndex];
          onToggleStar(coach.id, coach.is_starred);
        }
        break;
      case 'Enter':
        if (focusedIndex !== null && paginatedCoaches[focusedIndex]) {
          e.preventDefault();
          onCoachClick(paginatedCoaches[focusedIndex]);
        }
        break;
      case 'x':
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

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) newSelection.delete(id);
    else newSelection.add(id);
    onSelectionChange(newSelection);
  };

  const toggleAll = () => {
    if (paginatedCoaches.every(c => selectedIds.has(c.id))) {
      const newSelection = new Set(selectedIds);
      paginatedCoaches.forEach(c => newSelection.delete(c.id));
      onSelectionChange(newSelection);
    } else {
      const newSelection = new Set(selectedIds);
      paginatedCoaches.forEach(c => newSelection.add(c.id));
      onSelectionChange(newSelection);
    }
  };

  if (loading) {
    return (
      <div className="p-16">
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="animate-spin w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full" />
          <span className="text-warm-500 font-medium">Loading coaches...</span>
        </div>
      </div>
    );
  }

  if (coaches.length === 0) {
    return (
      <div className="p-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">📋</span>
        </div>
        <h3 className="text-lg font-bold text-warm-900 mb-2">No coaches found</h3>
        <p className="text-warm-500 text-sm">Try adjusting your filters or import some data.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-warm-50/50 border-b border-warm-100/50">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={paginatedCoaches.length > 0 && paginatedCoaches.every(c => selectedIds.has(c.id))}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500"
                />
              </th>
              <th className="w-10 px-2 py-3"></th>
              <th 
                className="text-left px-4 py-3 text-[11px] font-medium text-warm-400 uppercase tracking-wider cursor-pointer hover:text-warm-600 transition-colors"
                onClick={() => handleSort('name')}
              >
                Coach {sortField === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className="text-left px-4 py-3 text-[11px] font-medium text-warm-400 uppercase tracking-wider cursor-pointer hover:text-warm-600 transition-colors"
                onClick={() => handleSort('school')}
              >
                School {sortField === 'school' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className="text-left px-4 py-3 text-[11px] font-medium text-warm-400 uppercase tracking-wider cursor-pointer hover:text-warm-600 transition-colors w-24"
                onClick={() => handleSort('division')}
              >
                Div {sortField === 'division' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className="text-left px-4 py-3 text-[11px] font-medium text-warm-400 uppercase tracking-wider cursor-pointer hover:text-warm-600 transition-colors"
                onClick={() => handleSort('status')}
              >
                Status {sortField === 'status' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className="text-left px-4 py-3 text-[11px] font-medium text-warm-400 uppercase tracking-wider cursor-pointer hover:text-warm-600 transition-colors w-28"
                onClick={() => handleSort('priority')}
              >
                Priority {sortField === 'priority' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedCoaches.map((coach, index) => {
              const isFocused = focusedIndex === index;
              const isSelected = selectedIds.has(coach.id);
              
              return (
                <tr
                  key={coach.id}
                  className={cn(
                    'border-b border-warm-100/50 transition-all cursor-pointer group',
                    isSelected && 'bg-primary-50/50',
                    isFocused && 'ring-2 ring-inset ring-primary-400',
                    !isSelected && !isFocused && 'hover:bg-white/50'
                  )}
                  onClick={() => onCoachClick(coach)}
                  onMouseEnter={() => setFocusedIndex(index)}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelection(coach.id)}
                      className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500"
                    />
                  </td>
                  
                  {/* Star */}
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onToggleStar(coach.id, coach.is_starred)}
                      className={cn(
                        'text-lg transition-transform hover:scale-110',
                        coach.is_starred ? 'opacity-100' : 'opacity-30 group-hover:opacity-60'
                      )}
                    >
                      {coach.is_starred ? '⭐' : '☆'}
                    </button>
                  </td>

                  {/* Coach Info */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {coach.priority > 0 && (
                        <span className="text-base flex-shrink-0">{priorityConfig[coach.priority]?.icon}</span>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-warm-900 text-sm">{coach.name}</div>
                        {coach.email && (
                          <a
                            href={`mailto:${coach.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-primary-600 hover:text-primary-700 hover:underline truncate block max-w-[200px]"
                          >
                            {coach.email}
                          </a>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* School */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-warm-900 text-sm truncate max-w-[200px]">{coach.school}</div>
                    <div className="text-xs text-warm-400 truncate max-w-[200px]">
                      {CONF_ABBREV[coach.conference] || coach.conference}
                    </div>
                  </td>

                  {/* Division */}
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold',
                      coach.division === 'D2' 
                        ? 'bg-blue-50 text-blue-700' 
                        : 'bg-violet-50 text-violet-700'
                    )}>
                      {coach.division}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      <button
                        onClick={() => setOpenDropdown(
                          openDropdown?.id === coach.id && openDropdown.type === 'status' 
                            ? null 
                            : { id: coach.id, type: 'status' }
                        )}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                          statusConfig[coach.status]?.bgColor,
                          statusConfig[coach.status]?.color,
                          'hover:ring-2 hover:ring-offset-1 hover:ring-warm-200'
                        )}
                      >
                        <span>{statusConfig[coach.status]?.icon}</span>
                        <span>{statusConfig[coach.status]?.label}</span>
                        <span className="text-[10px] opacity-50">▼</span>
                      </button>
                      
                      {openDropdown?.id === coach.id && openDropdown.type === 'status' && (
                        <div className={cn(
                          'absolute z-50 mt-1.5 py-1.5 min-w-[160px]',
                          'bg-white/95 backdrop-blur-xl rounded-xl',
                          'border border-warm-200/50 shadow-lg'
                        )}>
                          {ALL_STATUSES.map((status) => (
                            <button
                              key={status}
                              onClick={() => {
                                onStatusChange(coach.id, status);
                                setOpenDropdown(null);
                              }}
                              className={cn(
                                'w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2',
                                coach.status === status ? 'bg-warm-50' : 'hover:bg-warm-50'
                              )}
                            >
                              <span>{statusConfig[status]?.icon}</span>
                              <span className={statusConfig[status]?.color}>{statusConfig[status]?.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Priority */}
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      <button
                        onClick={() => setOpenDropdown(
                          openDropdown?.id === coach.id && openDropdown.type === 'priority' 
                            ? null 
                            : { id: coach.id, type: 'priority' }
                        )}
                        className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                          priorityConfig[coach.priority]?.bgColor,
                          priorityConfig[coach.priority]?.color,
                          'hover:ring-2 hover:ring-warm-200'
                        )}
                      >
                        {priorityConfig[coach.priority]?.icon} {priorityConfig[coach.priority]?.label}
                        <span className="text-[10px] opacity-50 ml-1">▼</span>
                      </button>
                      
                      {openDropdown?.id === coach.id && openDropdown.type === 'priority' && (
                        <div className={cn(
                          'absolute z-50 mt-1.5 py-1.5 min-w-[120px]',
                          'bg-white/95 backdrop-blur-xl rounded-xl',
                          'border border-warm-200/50 shadow-lg'
                        )}>
                          {[2, 1, 0].map((p) => (
                            <button
                              key={p}
                              onClick={() => {
                                onPriorityChange(coach.id, p);
                                setOpenDropdown(null);
                              }}
                              className={cn(
                                'w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2',
                                coach.priority === p ? 'bg-warm-50' : 'hover:bg-warm-50',
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Footer */}
      <div className="bg-warm-50/30 border-t border-warm-100/50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-warm-600">
          <span className="font-medium tabular-nums">
            {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, sortedCoaches.length)} of {sortedCoaches.length}
          </span>
          {selectedIds.size > 0 && (
            <span className="px-2 py-0.5 bg-primary-100 text-primary-700 rounded-lg text-xs font-semibold tabular-nums">
              {selectedIds.size} selected
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className={cn(
              'text-sm px-2.5 py-1.5 rounded-lg',
              'bg-white/60 border border-warm-200/50',
              'focus:ring-2 focus:ring-primary-500 focus:border-transparent'
            )}
          >
            {PAGE_SIZES.map(size => (
              <option key={size} value={size}>{size}/page</option>
            ))}
          </select>
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-2 py-1 rounded-lg hover:bg-white/60 disabled:opacity-40 text-sm font-medium transition-colors"
            >
              ««
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 rounded-lg hover:bg-white/60 disabled:opacity-40 text-sm font-medium transition-colors"
            >
              ‹
            </button>
            <span className="px-3 text-sm font-semibold text-warm-700 tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 rounded-lg hover:bg-white/60 disabled:opacity-40 text-sm font-medium transition-colors"
            >
              ›
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="px-2 py-1 rounded-lg hover:bg-white/60 disabled:opacity-40 text-sm font-medium transition-colors"
            >
              »»
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
