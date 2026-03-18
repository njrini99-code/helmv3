'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { IconStar, IconMoreHorizontal, IconMessageSquare, IconArrowRight, IconChevronDown, IconChevronRight, IconMail, IconUpload, IconUserPlus, IconFlame, IconZap } from '@/components/icons';
import type { Coach, CoachStatus } from '../crm-config';

interface CoachTableProps {
  coaches: Coach[];
  loading: boolean;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onStatusChange: (coachId: string, status: CoachStatus) => void;
  onPriorityChange?: (coachId: string, priority: number) => void;
  onToggleStar: (coachId: string, currentStarred: boolean) => void;
  onCoachClick: (coach: Coach) => void;
  onLogContact: (coach: Coach) => void;
  onImport?: () => void;
  onAddCoach?: () => void;
  statusConfig: Record<CoachStatus, { label: string; color: string; bgColor: string; icon: React.ReactNode; order: number }>;
  priorityConfig: Record<number, { label: string; color: string; bgColor: string; icon: React.ReactNode; iconLabel: string }>;
}

const ALL_STATUSES: CoachStatus[] = [
  'new_lead', 'contacted', 'engaged', 'proposal', 'won', 'lost', 'nurture',
];

type SortField = 'name' | 'school' | 'conference' | 'division' | 'status' | 'priority' | 'last_contacted_at';
type SortDir = 'asc' | 'desc';

const PAGE_SIZES = [25, 50, 100];

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function CoachTable({
  coaches,
  loading,
  selectedIds,
  onSelectionChange,
  onStatusChange,
  onPriorityChange,
  onToggleStar,
  onCoachClick,
  onLogContact,
  onImport,
  onAddCoach,
  statusConfig,
  priorityConfig,
}: CoachTableProps) {
  const [openStatusDropdown, setOpenStatusDropdown] = useState<string | null>(null);
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  const [openPrioritySubmenu, setOpenPrioritySubmenu] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  useEffect(() => { setPage(1); }, [coaches.length]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!openStatusDropdown && !openActionMenu) return;
    const handler = () => { setOpenStatusDropdown(null); setOpenActionMenu(null); setOpenPrioritySubmenu(null); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openStatusDropdown, openActionMenu]);

  // Sort
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
        case 'last_contacted_at':
          aVal = a.last_contacted_at ? new Date(a.last_contacted_at).getTime() : 0;
          bVal = b.last_contacted_at ? new Date(b.last_contacted_at).getTime() : 0;
          break;
      }
      if (aVal === null || bVal === null) return 0;
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [coaches, sortField, sortDir, statusConfig]);

  const totalPages = Math.ceil(sortedCoaches.length / pageSize);
  const paginatedCoaches = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedCoaches.slice(start, start + pageSize);
  }, [sortedCoaches, page, pageSize]);

  const toggleSelection = useCallback((id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  }, [selectedIds, onSelectionChange]);

  // Keyboard nav
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!paginatedCoaches.length) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
    switch (e.key) {
      case 'j': e.preventDefault(); setFocusedIndex(prev => prev === null ? 0 : Math.min(prev + 1, paginatedCoaches.length - 1)); break;
      case 'k': e.preventDefault(); setFocusedIndex(prev => prev === null ? 0 : Math.max(prev - 1, 0)); break;
      case 's':
        if (focusedIndex !== null && paginatedCoaches[focusedIndex]) {
          e.preventDefault();
          const c = paginatedCoaches[focusedIndex];
          onToggleStar(c.id, c.is_starred);
        }
        break;
      case 'Enter':
        if (focusedIndex !== null && paginatedCoaches[focusedIndex]) { e.preventDefault(); onCoachClick(paginatedCoaches[focusedIndex]); }
        break;
      case 'x':
        if (focusedIndex !== null && paginatedCoaches[focusedIndex]) { e.preventDefault(); toggleSelection(paginatedCoaches[focusedIndex].id); }
        break;
      case 'Escape': setFocusedIndex(null); setOpenStatusDropdown(null); setOpenActionMenu(null); setOpenPrioritySubmenu(null); break;
    }
  }, [paginatedCoaches, focusedIndex, onToggleStar, onCoachClick, toggleSelection]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const toggleAll = () => {
    if (paginatedCoaches.every(c => selectedIds.has(c.id))) {
      const next = new Set(selectedIds);
      paginatedCoaches.forEach(c => next.delete(c.id));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      paginatedCoaches.forEach(c => next.add(c.id));
      onSelectionChange(next);
    }
  };

  const SortArrow = ({ field }: { field: SortField }) => (
    <span className="ml-0.5 text-micro">{sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}</span>
  );

  // Loading skeleton
  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3">
            <div className="w-4 h-4 rounded bg-warm-200/60 skeleton-shimmer" />
            <div className="w-4 h-4 rounded bg-warm-200/60 skeleton-shimmer" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-36 bg-warm-200/60 rounded skeleton-shimmer" />
              <div className="h-2.5 w-24 bg-warm-100/60 rounded skeleton-shimmer" />
            </div>
            <div className="h-3 w-32 bg-warm-100/60 rounded skeleton-shimmer" />
            <div className="h-5 w-10 bg-warm-100/60 rounded-full skeleton-shimmer" />
            <div className="h-5 w-20 bg-warm-100/60 rounded-full skeleton-shimmer" />
            <div className="h-3 w-16 bg-warm-100/60 rounded skeleton-shimmer" />
          </div>
        ))}
      </div>
    );
  }

  if (coaches.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-warm-100/80 flex items-center justify-center mx-auto mb-4">
          <IconMessageSquare size={24} className="text-warm-300" />
        </div>
        <h3 className="text-base font-semibold text-warm-700 mb-1">No coaches found</h3>
        <p className="text-sm text-warm-500 max-w-xs mx-auto mb-6">Try adjusting your filters or import some coaches to get started.</p>
        <div className="flex items-center justify-center gap-3">
          {onImport && (
            <button
              onClick={onImport}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-warm-200/50 text-warm-700 rounded-xl font-medium hover:bg-warm-50 active:bg-warm-100 transition-colors text-sm"
            >
              <IconUpload size={16} /> Import Coaches
            </button>
          )}
          {onAddCoach && (
            <button
              onClick={onAddCoach}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors text-sm shadow-sm shadow-primary-500/25"
            >
              <IconUserPlus size={16} /> Add Coach
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed min-w-[600px]">
        <thead>
          <tr className="border-b border-warm-100">
            <th className="w-10 px-4 py-3">
              <input type="checkbox" checked={paginatedCoaches.length > 0 && paginatedCoaches.every(c => selectedIds.has(c.id))} onChange={toggleAll}
                className="w-4 h-4 rounded-md border-warm-300 text-primary-600 focus:ring-primary-500/20 cursor-pointer" />
            </th>
            <th className="w-10 px-2 py-3" />
            <TH field="name" label="Coach" onSort={handleSort}><SortArrow field="name" /></TH>
            <TH field="school" label="School" onSort={handleSort}><SortArrow field="school" /></TH>
            <TH field="division" label="Div" onSort={handleSort} className="w-16"><SortArrow field="division" /></TH>
            <TH field="conference" label="Conference" onSort={handleSort} className="hidden xl:table-cell"><SortArrow field="conference" /></TH>
            <TH field="status" label="Status" onSort={handleSort}><SortArrow field="status" /></TH>
            <TH field="priority" label="Priority" onSort={handleSort} className="hidden lg:table-cell w-20"><SortArrow field="priority" /></TH>
            <TH field="last_contacted_at" label="Last Contact" onSort={handleSort} className="hidden lg:table-cell"><SortArrow field="last_contacted_at" /></TH>
            <th className="w-12 px-4 py-3" />
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
                  'border-b border-warm-50 transition-all duration-150 cursor-pointer group',
                  isSelected && 'bg-primary-50/50 border-l-2 border-l-primary-400',
                  !isSelected && isFocused && 'bg-primary-50/20',
                  !isSelected && !isFocused && 'hover:bg-primary-50/20'
                )}
                onClick={() => onCoachClick(coach)}
                onMouseEnter={() => setFocusedIndex(index)}
              >
                {/* Checkbox */}
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelection(coach.id)}
                    className="w-4 h-4 rounded-md border-warm-300 text-primary-600 focus:ring-primary-500/20 cursor-pointer" />
                </td>

                {/* Star */}
                <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                  <button onClick={() => onToggleStar(coach.id, coach.is_starred)}
                    className={cn('transition-transform hover:scale-110', coach.is_starred ? 'opacity-100' : 'opacity-20 group-hover:opacity-50')}>
                    <IconStar size={14} className={cn(coach.is_starred ? 'fill-amber-400 text-amber-400' : 'text-warm-300')} />
                  </button>
                </td>

                {/* Coach name + title */}
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-warm-900 leading-tight truncate">{coach.name}</p>
                  {coach.title && <p className="text-label text-warm-400 truncate">{coach.title}</p>}
                </td>

                {/* School */}
                <td className="px-4 py-3">
                  <p className="text-sm text-warm-800 truncate">{coach.school}</p>
                </td>

                {/* Division */}
                <td className="px-4 py-3">
                  <span className={cn(
                    'text-micro font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                    coach.division === 'D2' ? 'bg-blue-100 text-blue-700' : 'bg-primary-100 text-primary-700'
                  )}>
                    {coach.division}
                  </span>
                </td>

                {/* Conference — hidden below xl */}
                <td className="hidden xl:table-cell px-4 py-3">
                  <p className="text-xs text-warm-500 truncate">{coach.conference}</p>
                </td>

                {/* Status dropdown */}
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="relative">
                    <button
                      onClick={e => { e.stopPropagation(); setOpenStatusDropdown(openStatusDropdown === coach.id ? null : coach.id); setOpenActionMenu(null); }}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-micro font-medium transition-all',
                        statusConfig[coach.status]?.bgColor, statusConfig[coach.status]?.color,
                        'hover:ring-1 hover:ring-warm-200'
                      )}
                    >
                      <span className="flex items-center">{statusConfig[coach.status]?.icon}</span>
                      <span>{statusConfig[coach.status]?.label}</span>
                      <IconChevronDown size={9} className="opacity-40" />
                    </button>
                    {openStatusDropdown === coach.id && (
                      <div className="absolute z-50 mt-1 py-1 min-w-[160px] max-h-[320px] overflow-y-auto bg-white/95 backdrop-blur-xl rounded-xl border border-warm-200/50 shadow-xl" onClick={e => e.stopPropagation()}>
                        {ALL_STATUSES.map(status => (
                          <button key={status}
                            onClick={() => { onStatusChange(coach.id, status); setOpenStatusDropdown(null); }}
                            className={cn('w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors',
                              coach.status === status ? 'bg-primary-50 font-semibold text-primary-700' : 'text-warm-700 hover:bg-warm-50 active:bg-warm-100'
                            )}>
                            <span className="flex items-center">{statusConfig[status]?.icon}</span>
                            <span>{statusConfig[status]?.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </td>

                {/* Priority — hidden below lg */}
                <td className="hidden lg:table-cell px-4 py-3">
                  {coach.priority > 0 ? (
                    <span className={cn('text-micro font-bold px-1.5 py-0.5 rounded', priorityConfig[coach.priority]?.bgColor, priorityConfig[coach.priority]?.color)}>
                      {priorityConfig[coach.priority]?.iconLabel} {priorityConfig[coach.priority]?.label}
                    </span>
                  ) : (
                    <span className="text-micro text-warm-300">&mdash;</span>
                  )}
                </td>

                {/* Last Contact — hidden below lg */}
                <td className="hidden lg:table-cell px-4 py-3">
                  <span className={cn(
                    'text-xs tabular-nums',
                    !coach.last_contacted_at ? 'text-red-500 font-medium' : 'text-warm-500'
                  )}>
                    {formatRelativeDate(coach.last_contacted_at)}
                  </span>
                </td>

                {/* Three-dot action menu */}
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="relative">
                    <button
                      onClick={e => { e.stopPropagation(); setOpenActionMenu(openActionMenu === coach.id ? null : coach.id); setOpenStatusDropdown(null); setOpenPrioritySubmenu(null); }}
                      className={cn(
                        'p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200',
                        'opacity-0 group-hover:opacity-100 transition-all duration-200'
                      )}
                    >
                      <IconMoreHorizontal size={16} />
                    </button>
                    {openActionMenu === coach.id && (
                      <div className="absolute right-0 top-full mt-1 z-50 w-48 py-1 rounded-xl bg-white border border-warm-200/80 shadow-xl" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { onLogContact(coach); setOpenActionMenu(null); }}
                          className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 active:bg-warm-100 flex items-center gap-2">
                          <IconMessageSquare size={14} /> Log Contact
                        </button>
                        {coach.email && (
                          <a href={`mailto:${coach.email}`} onClick={() => setOpenActionMenu(null)}
                            className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-2">
                            <IconMail size={14} /> Send Email
                          </a>
                        )}
                        <button onClick={() => { onStatusChange(coach.id, 'contacted' as CoachStatus); setOpenActionMenu(null); }}
                          className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-2">
                          <IconArrowRight size={14} /> Move to Contacted
                        </button>
                        <button onClick={() => { onToggleStar(coach.id, coach.is_starred); setOpenActionMenu(null); }}
                          className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-2">
                          <IconStar size={14} /> {coach.is_starred ? 'Unstar' : 'Star'}
                        </button>

                        {/* Set Priority submenu */}
                        <div className="relative">
                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenPrioritySubmenu(openPrioritySubmenu === coach.id ? null : coach.id); }}
                            className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center justify-between"
                          >
                            <span className="flex items-center gap-2">
                              <IconFlame size={14} /> Set Priority
                            </span>
                            <IconChevronRight size={12} className="text-warm-400" />
                          </button>
                          {openPrioritySubmenu === coach.id && (
                            <div className="absolute left-full top-0 ml-1 z-50 w-36 py-1 rounded-xl bg-white border border-warm-200/80 shadow-xl">
                              <button
                                onClick={() => { onPriorityChange?.(coach.id, 0); setOpenActionMenu(null); setOpenPrioritySubmenu(null); }}
                                className={cn('w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors',
                                  coach.priority === 0 ? 'bg-warm-50 font-semibold text-warm-900' : 'text-warm-700 hover:bg-warm-50 active:bg-warm-100'
                                )}
                              >
                                Normal
                              </button>
                              <button
                                onClick={() => { onPriorityChange?.(coach.id, 1); setOpenActionMenu(null); setOpenPrioritySubmenu(null); }}
                                className={cn('w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors',
                                  coach.priority === 1 ? 'bg-amber-50 font-semibold text-amber-700' : 'text-warm-700 hover:bg-warm-50 active:bg-warm-100'
                                )}
                              >
                                <IconZap size={14} className="text-amber-500" /> High
                              </button>
                              <button
                                onClick={() => { onPriorityChange?.(coach.id, 2); setOpenActionMenu(null); setOpenPrioritySubmenu(null); }}
                                className={cn('w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors',
                                  coach.priority >= 2 ? 'bg-orange-50 font-semibold text-orange-700' : 'text-warm-700 hover:bg-warm-50 active:bg-warm-100'
                                )}
                              >
                                <IconFlame size={14} className="text-orange-500" /> Hot
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="bg-warm-50/20 border-t border-warm-100/30 px-4 py-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-sm text-warm-600">
            <span className="font-medium tabular-nums">
              {((page - 1) * pageSize) + 1}&ndash;{Math.min(page * pageSize, sortedCoaches.length)} of {sortedCoaches.length}
            </span>
            {selectedIds.size > 0 && (
              <span className="px-2 py-0.5 bg-primary-100 text-primary-700 rounded-lg text-xs font-semibold tabular-nums">
                {selectedIds.size} selected
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="text-sm px-2.5 py-1.5 rounded-lg bg-white/60 border border-warm-200/50 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s}/page</option>)}
            </select>
            <div className="flex items-center gap-1">
              <PaginationButton onClick={() => setPage(1)} disabled={page === 1}>&laquo;</PaginationButton>
              <PaginationButton onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>&lsaquo;</PaginationButton>
              <span className="px-3 text-sm font-semibold text-warm-700 tabular-nums">{page} / {totalPages}</span>
              <PaginationButton onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>&rsaquo;</PaginationButton>
              <PaginationButton onClick={() => setPage(totalPages)} disabled={page === totalPages}>&raquo;</PaginationButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================
function TH({ field, label, onSort, children, className }: {
  field: SortField; label: string; onSort: (f: SortField) => void; children: React.ReactNode; className?: string;
}) {
  return (
    <th
      className={cn('text-left px-4 py-3 text-label font-semibold text-warm-500 uppercase tracking-wider cursor-pointer hover:text-warm-700 transition-colors', className)}
      onClick={() => onSort(field)}
    >
      {label}{children}
    </th>
  );
}

function PaginationButton({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="px-2 py-1 rounded-lg hover:bg-white/60 disabled:opacity-40 text-sm font-medium transition-colors">
      {children}
    </button>
  );
}
