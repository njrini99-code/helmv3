'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Coach, CoachStatus } from '../page';
import { IconMail, IconChevronDown, IconStar, IconStarFilled } from '@/components/icons';

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
    if (selectedIds.size === coaches.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(coaches.map(c => c.id)));
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
          <thead className="bg-warm-50 border-b border-warm-200">
            <tr>
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.size === coaches.length && coaches.length > 0}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded border-warm-300 text-emerald-600 focus:ring-emerald-500"
                />
              </th>
              <th className="w-10 px-2 py-3"></th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-warm-600 uppercase tracking-wider">Coach</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-warm-600 uppercase tracking-wider">School</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-warm-600 uppercase tracking-wider">Conference</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-warm-600 uppercase tracking-wider">Div</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-warm-600 uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-warm-600 uppercase tracking-wider">Priority</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-warm-600 uppercase tracking-wider">Last Contact</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-warm-600 uppercase tracking-wider">Follow-up</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-100">
            {coaches.map((coach) => {
              const followUp = formatFollowUp(coach.next_follow_up_at);
              const rowStyle = getRowHighlight(coach);
              
              return (
                <tr
                  key={coach.id}
                  className={cn(
                    'hover:bg-warm-50/50 transition-colors cursor-pointer group',
                    selectedIds.has(coach.id) && 'bg-emerald-50/50'
                  )}
                  style={{
                    ...rowStyle,
                    borderLeft: rowStyle.borderLeftColor ? `3px solid ${rowStyle.borderLeftColor}` : undefined
                  }}
                  onClick={() => onCoachClick(coach)}
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
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {coach.priority > 0 && (
                        <span className={cn('text-sm', priorityConfig[coach.priority]?.color)}>
                          {priorityConfig[coach.priority]?.icon}
                        </span>
                      )}
                      <div>
                        <div className="font-medium text-warm-900">{coach.name}</div>
                        {coach.title && (
                          <div className="text-xs text-warm-500">{coach.title}</div>
                        )}
                      </div>
                    </div>
                    {coach.email && (
                      <a
                        href={`mailto:${coach.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 mt-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        <IconMail className="w-3 h-3" />
                        <span className="truncate max-w-[180px]">{coach.email}</span>
                      </a>
                    )}
                  </td>

                  {/* School */}
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-warm-900">{coach.school}</div>
                    <div className="text-xs text-warm-500 capitalize">
                      {coach.program === 'mens' ? "Men's" : coach.program === 'womens' ? "Women's" : 'Both'}
                    </div>
                  </td>

                  {/* Conference */}
                  <td className="px-4 py-3">
                    <div className="text-sm text-warm-700 max-w-[140px] truncate" title={coach.conference}>
                      {coach.conference}
                    </div>
                  </td>

                  {/* Division */}
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
                  <td className="px-4 py-3">
                    <div className="text-sm text-warm-600">
                      {formatDate(coach.last_contacted_at)}
                    </div>
                  </td>

                  {/* Follow-up */}
                  <td className="px-4 py-3">
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
      
      {/* Footer */}
      <div className="border-t border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-500">
        Showing {coaches.length} coaches
        {selectedIds.size > 0 && (
          <span className="ml-2 text-emerald-600 font-medium">
            • {selectedIds.size} selected
          </span>
        )}
      </div>
    </div>
  );
}
