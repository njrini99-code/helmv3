'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, Users, Star, ArrowRight, MoreHorizontal, MessageSquare, Mail } from 'lucide-react';
import type { Coach, CoachStatus } from '../crm-config';

interface ConferenceGroupViewProps {
  coaches: Coach[];
  loading: boolean;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onCoachClick: (coach: Coach) => void;
  onStatusChange: (coachId: string, status: CoachStatus) => void;
  onToggleStar: (coachId: string, currentStarred: boolean) => void;
  onLogContact: (coach: Coach) => void;
  statusConfig: Record<CoachStatus, { label: string; color: string; bgColor: string; icon: React.ReactNode; order: number }>;
  priorityConfig: Record<number, { label: string; color: string; bgColor: string; icon: React.ReactNode; iconLabel: string }>;
}

interface ConferenceGroup {
  conference: string;
  coaches: Coach[];
  divisions: { d2: number; d3: number };
  statusBreakdown: Record<string, number>;
}

const ALL_STATUSES: CoachStatus[] = [
  'new_lead', 'researching', 'outreach_pending', 'initial_contact', 'follow_up',
  'engaged', 'demo_scheduled', 'demo_completed', 'proposal_sent', 'negotiating',
  'closed_won', 'closed_lost', 'not_interested', 'bad_timing', 'nurture',
];

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function ConferenceGroupView({
  coaches,
  loading,
  selectedIds,
  onSelectionChange,
  onCoachClick,
  onStatusChange,
  onToggleStar,
  onLogContact,
  statusConfig,
}: ConferenceGroupViewProps) {
  const [expandedConferences, setExpandedConferences] = useState<Set<string>>(new Set());
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  const [openStatusDropdown, setOpenStatusDropdown] = useState<string | null>(null);

  // Group coaches by conference
  const conferenceGroups = useMemo((): ConferenceGroup[] => {
    const groups: Record<string, Coach[]> = {};
    coaches.forEach(coach => {
      if (!groups[coach.conference]) groups[coach.conference] = [];
      groups[coach.conference]!.push(coach);
    });

    return Object.entries(groups)
      .map(([conference, groupCoaches]) => ({
        conference,
        coaches: groupCoaches.sort((a, b) => {
          if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
          if (a.priority !== b.priority) return b.priority - a.priority;
          return a.name.localeCompare(b.name);
        }),
        divisions: {
          d2: groupCoaches.filter(c => c.division === 'D2').length,
          d3: groupCoaches.filter(c => c.division === 'D3').length,
        },
        statusBreakdown: groupCoaches.reduce((acc, c) => {
          acc[c.status] = (acc[c.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      }))
      .sort((a, b) => b.coaches.length - a.coaches.length);
  }, [coaches]);

  const toggleConference = (conference: string) => {
    setExpandedConferences(prev => {
      const next = new Set(prev);
      if (next.has(conference)) next.delete(conference);
      else next.add(conference);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedConferences(new Set(conferenceGroups.map(g => g.conference)));
  };

  const collapseAll = () => {
    setExpandedConferences(new Set());
  };

  const toggleGroupSelection = (group: ConferenceGroup) => {
    const groupIds = new Set(group.coaches.map(c => c.id));
    const allSelected = group.coaches.every(c => selectedIds.has(c.id));
    const next = new Set(selectedIds);
    if (allSelected) {
      groupIds.forEach(id => next.delete(id));
    } else {
      groupIds.forEach(id => next.add(id));
    }
    onSelectionChange(next);
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-4">
            <div className="flex items-center gap-4">
              <div className="w-6 h-6 rounded bg-warm-200/60 skeleton-shimmer" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-40 bg-warm-200/60 rounded skeleton-shimmer" />
                <div className="h-3 w-24 bg-warm-100/60 rounded skeleton-shimmer" />
              </div>
              <div className="h-6 w-10 bg-warm-100/60 rounded-full skeleton-shimmer" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (coaches.length === 0) {
    return (
      <div className="py-16 text-center bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass">
        <div className="w-14 h-14 rounded-2xl bg-warm-100/80 flex items-center justify-center mx-auto mb-4">
          <Users size={24} className="text-warm-300" />
        </div>
        <h3 className="text-base font-semibold text-warm-700 mb-1">No coaches found</h3>
        <p className="text-sm text-warm-500 max-w-xs mx-auto">Try adjusting your filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-warm-500">
          <span className="font-semibold text-warm-700">{conferenceGroups.length}</span> conferences ·{' '}
          <span className="font-semibold text-warm-700">{coaches.length}</span> coaches
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="px-3 py-1.5 text-xs font-medium text-warm-600 hover:text-warm-800 hover:bg-warm-50 rounded-lg transition-colors"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1.5 text-xs font-medium text-warm-600 hover:text-warm-800 hover:bg-warm-50 rounded-lg transition-colors"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Conference Groups */}
      {conferenceGroups.map((group) => {
        const isExpanded = expandedConferences.has(group.conference);
        const allSelected = group.coaches.every(c => selectedIds.has(c.id));
        const someSelected = group.coaches.some(c => selectedIds.has(c.id));
        const activeCount = group.coaches.filter(c => !['new_lead', 'closed_lost', 'not_interested', 'bad_timing'].includes(c.status)).length;

        return (
          <div
            key={group.conference}
            className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass overflow-hidden"
          >
            {/* Conference Header */}
            <button
              onClick={() => toggleConference(group.conference)}
              className="w-full flex items-center gap-3 p-4 hover:bg-warm-50/30 transition-colors"
            >
              {/* Checkbox */}
              <div onClick={e => { e.stopPropagation(); toggleGroupSelection(group); }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={() => toggleGroupSelection(group)}
                  className="w-4 h-4 rounded-md border-warm-300 text-primary-600 focus:ring-primary-500/20 cursor-pointer"
                />
              </div>

              {/* Expand/Collapse */}
              <div className="text-warm-400">
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>

              {/* Conference Name */}
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-warm-900">{group.conference}</h3>
                  <span className="px-2 py-0.5 rounded-full bg-warm-100 text-[11px] font-bold text-warm-600 tabular-nums">
                    {group.coaches.length}
                  </span>
                  {activeCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-primary-50 text-[11px] font-bold text-primary-700 tabular-nums">
                      {activeCount} active
                    </span>
                  )}
                </div>
              </div>

              {/* Division chips */}
              <div className="flex items-center gap-1.5">
                {group.divisions.d2 > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[10px] font-bold text-blue-700 tabular-nums">
                    D2: {group.divisions.d2}
                  </span>
                )}
                {group.divisions.d3 > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-primary-50 text-[10px] font-bold text-primary-700 tabular-nums">
                    D3: {group.divisions.d3}
                  </span>
                )}
              </div>

              {/* Status mini-dots */}
              <div className="flex items-center gap-0.5">
                {Object.entries(group.statusBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 3)
                  .map(([status, count]) => (
                    <span
                      key={status}
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[9px] font-medium',
                        statusConfig[status as CoachStatus]?.bgColor,
                        statusConfig[status as CoachStatus]?.color
                      )}
                    >
                      {count}
                    </span>
                  ))}
              </div>
            </button>

            {/* Expanded Coach List */}
            {isExpanded && (
              <div className="border-t border-warm-100/50">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-warm-100/30">
                      <th className="w-10 px-4 py-2" />
                      <th className="w-8 px-2 py-2" />
                      <th className="text-left px-4 py-2 text-[10px] font-semibold text-warm-500 uppercase tracking-wider">Coach</th>
                      <th className="text-left px-4 py-2 text-[10px] font-semibold text-warm-500 uppercase tracking-wider">School</th>
                      <th className="text-left px-4 py-2 text-[10px] font-semibold text-warm-500 uppercase tracking-wider w-14">Div</th>
                      <th className="text-left px-4 py-2 text-[10px] font-semibold text-warm-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-2 text-[10px] font-semibold text-warm-500 uppercase tracking-wider">Last Contact</th>
                      <th className="w-10 px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {group.coaches.map((coach) => {
                      const isSelected = selectedIds.has(coach.id);
                      return (
                        <tr
                          key={coach.id}
                          className={cn(
                            'border-b border-warm-50/50 transition-all duration-150 cursor-pointer group',
                            isSelected && 'bg-primary-50/50',
                            !isSelected && 'hover:bg-warm-50/30'
                          )}
                          onClick={() => onCoachClick(coach)}
                        >
                          <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                const next = new Set(selectedIds);
                                if (next.has(coach.id)) next.delete(coach.id);
                                else next.add(coach.id);
                                onSelectionChange(next);
                              }}
                              className="w-4 h-4 rounded-md border-warm-300 text-primary-600 focus:ring-primary-500/20 cursor-pointer"
                            />
                          </td>
                          <td className="px-2 py-2.5" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => onToggleStar(coach.id, coach.is_starred)}
                              className={cn('text-sm transition-transform hover:scale-110', coach.is_starred ? 'opacity-100' : 'opacity-20 group-hover:opacity-50')}
                            >
                              {coach.is_starred ? '⭐' : '☆'}
                            </button>
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="text-sm font-medium text-warm-900">{coach.name}</p>
                            {coach.title && <p className="text-[11px] text-warm-400 truncate max-w-[160px]">{coach.title}</p>}
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="text-sm text-warm-700 truncate max-w-[160px]">{coach.school}</p>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={cn(
                              'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                              coach.division === 'D2' ? 'bg-blue-100 text-blue-700' : 'bg-primary-100 text-primary-700'
                            )}>
                              {coach.division}
                            </span>
                          </td>
                          <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                            <div className="relative">
                              <button
                                onClick={e => { e.stopPropagation(); setOpenStatusDropdown(openStatusDropdown === coach.id ? null : coach.id); setOpenActionMenu(null); }}
                                className={cn(
                                  'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all',
                                  statusConfig[coach.status]?.bgColor,
                                  statusConfig[coach.status]?.color,
                                  'hover:ring-1 hover:ring-warm-200'
                                )}
                              >
                                {statusConfig[coach.status]?.icon}
                                <span>{statusConfig[coach.status]?.label}</span>
                              </button>
                              {openStatusDropdown === coach.id && (
                                <div className="absolute z-50 mt-1 py-1 min-w-[160px] max-h-[320px] overflow-y-auto bg-white/95 backdrop-blur-xl rounded-xl border border-warm-200/50 shadow-xl">
                                  {ALL_STATUSES.map(status => (
                                    <button key={status}
                                      onClick={() => { onStatusChange(coach.id, status); setOpenStatusDropdown(null); }}
                                      className={cn('w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors',
                                        coach.status === status ? 'bg-primary-50 font-semibold text-primary-700' : 'text-warm-700 hover:bg-warm-50'
                                      )}>
                                      {statusConfig[status]?.icon}
                                      <span>{statusConfig[status]?.label}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={cn(
                              'text-xs tabular-nums',
                              !coach.last_contacted_at ? 'text-red-500 font-medium' : 'text-warm-500'
                            )}>
                              {formatRelativeDate(coach.last_contacted_at)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                            <div className="relative">
                              <button
                                onClick={e => { e.stopPropagation(); setOpenActionMenu(openActionMenu === coach.id ? null : coach.id); setOpenStatusDropdown(null); }}
                                className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 opacity-0 group-hover:opacity-100 transition-all"
                              >
                                <MoreHorizontal size={14} />
                              </button>
                              {openActionMenu === coach.id && (
                                <div className="absolute right-0 top-full mt-1 z-50 w-44 py-1 rounded-xl bg-white border border-warm-200/80 shadow-xl">
                                  <button onClick={() => { onLogContact(coach); setOpenActionMenu(null); }}
                                    className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 flex items-center gap-2">
                                    <MessageSquare size={14} /> Log Contact
                                  </button>
                                  {coach.email && (
                                    <a href={`mailto:${coach.email}`} onClick={() => setOpenActionMenu(null)}
                                      className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 flex items-center gap-2">
                                      <Mail size={14} /> Send Email
                                    </a>
                                  )}
                                  <button onClick={() => { onStatusChange(coach.id, 'researching'); setOpenActionMenu(null); }}
                                    className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 flex items-center gap-2">
                                    <ArrowRight size={14} /> Move to Researching
                                  </button>
                                  <button onClick={() => { onToggleStar(coach.id, coach.is_starred); setOpenActionMenu(null); }}
                                    className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 flex items-center gap-2">
                                    <Star size={14} /> {coach.is_starred ? 'Unstar' : 'Star'}
                                  </button>
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
            )}
          </div>
        );
      })}
    </div>
  );
}
