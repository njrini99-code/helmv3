'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  IconStar,
  IconChevronDown,
  IconChevronRight,
  IconUsers,
  IconArrowRight,
  IconMoreHorizontal,
  IconMessageSquare,
  IconMail,
} from '@/components/icons';
import type { Coach, CoachStatus } from '../crm-config';
import { Button, IconButton } from '@/components/ui/button';
import { SequenceEnrollmentBadge } from './badges/SequenceEnrollmentBadge';
import type { CoachEnrollmentSummary } from '@/app/golf/actions/crm-sequences';

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
  // Accepted for API parity with other CRM views; reserved for future priority chips.
  priorityConfig: Record<number, { label: string; color: string; bgColor: string; icon: React.ReactNode; iconLabel: React.ReactNode }>;
  // coach_id -> sequence enrollment summary, for the queue badge
  coachEnrollments?: Record<string, CoachEnrollmentSummary>;
  // True when the parent's coach fetch itself failed (as opposed to a filter
  // legitimately returning zero rows) — swaps the empty state to a retry message.
  error?: boolean;
}

interface ConferenceGroup {
  conference: string;
  coaches: Coach[];
  divisions: Record<string, number>;
  statusBreakdown: Record<string, number>;
}

// No-conference bucket label — coaches with a null/blank `conference` are
// grouped here instead of under a blank, unlabeled header.
const NO_CONFERENCE_LABEL = 'No Conference';

const ALL_STATUSES: CoachStatus[] = [
  'new_lead', 'contacted', 'engaged', 'proposal', 'won', 'lost', 'nurture',
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
  coachEnrollments,
  error = false,
}: ConferenceGroupViewProps) {
  const [expandedConferences, setExpandedConferences] = useState<Set<string>>(new Set());
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  const [openStatusDropdown, setOpenStatusDropdown] = useState<string | null>(null);

  // Close row-level menus on Escape for keyboard users.
  useEffect(() => {
    if (!openActionMenu && !openStatusDropdown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenActionMenu(null);
        setOpenStatusDropdown(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openActionMenu, openStatusDropdown]);

  const conferenceGroups = useMemo((): ConferenceGroup[] => {
    const groups: Record<string, Coach[]> = {};
    coaches.forEach(coach => {
      // Coaches with a null/blank conference land in a labeled bucket instead
      // of the raw '' key, which otherwise renders an unlabeled <h3> — and
      // since this bucket is routinely the single largest group, it would
      // sort to the top of the tab with no visible name.
      const key = coach.conference?.trim() || NO_CONFERENCE_LABEL;
      if (!groups[key]) groups[key] = [];
      groups[key]!.push(coach);
    });

    return Object.entries(groups)
      .map(([conference, groupCoaches]) => ({
        conference,
        coaches: groupCoaches.sort((a, b) => {
          if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
          if (a.priority !== b.priority) return b.priority - a.priority;
          return a.name.localeCompare(b.name);
        }),
        // Full tally over every division value present (D1/D2/D3/NAIA/JUCO*/
        // CCCAA/etc.) instead of a hardcoded D2/D3-only breakdown, so a
        // conference made up entirely of e.g. D1 or NAIA programs still
        // shows a division breakdown instead of none at all.
        divisions: groupCoaches.reduce((acc, c) => {
          const key = c.division || 'Unknown';
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
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

  // Select every coach across all conferences matching the active filter, so the
  // whole filtered set can be bulk-emailed in one shot.
  const allFilteredSelected = coaches.length > 0 && coaches.every(c => selectedIds.has(c.id));
  const toggleSelectAllFiltered = () => {
    onSelectionChange(allFilteredSelected ? new Set() : new Set(coaches.map(c => c.id)));
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="glass-standard rounded-2xl p-4">
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
      <div className="py-16 text-center glass-standard rounded-2xl">
        <div className="w-14 h-14 rounded-2xl bg-warm-100/80 flex items-center justify-center mx-auto mb-4">
          <IconUsers size={24} className="text-warm-300" />
        </div>
        {error ? (
          <>
            <h3 className="text-base font-semibold text-warm-700 mb-1">Failed to load coaches</h3>
            <p className="text-sm text-warm-500 max-w-xs mx-auto">Something went wrong fetching this data. Please retry.</p>
          </>
        ) : (
          <>
            <h3 className="text-base font-semibold text-warm-700 mb-1">No coaches found</h3>
            <p className="text-sm text-warm-500 max-w-xs mx-auto">Try adjusting your filters.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-warm-500">
          <span className="font-semibold text-warm-700">{conferenceGroups.length}</span> conferences &middot;{' '}
          <span className="font-semibold text-warm-700">{coaches.length}</span> coaches
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost"
            type="button"
            onClick={toggleSelectAllFiltered}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30',
              allFilteredSelected
                ? 'text-primary-700 bg-primary-50 hover:bg-primary-100'
                : 'text-primary-700 hover:bg-primary-50'
            )}
          >
            {allFilteredSelected ? `Clear selection` : `Select all ${coaches.length}`}
          </Button>
          <Button variant="ghost"
            type="button"
            onClick={expandAll}
            className="px-3 py-1.5 text-xs font-medium text-warm-600 hover:text-warm-800 hover:bg-warm-50 active:bg-warm-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
          >
            Expand All
          </Button>
          <Button variant="ghost"
            type="button"
            onClick={collapseAll}
            className="px-3 py-1.5 text-xs font-medium text-warm-600 hover:text-warm-800 hover:bg-warm-50 active:bg-warm-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
          >
            Collapse All
          </Button>
        </div>
      </div>

      {/* Conference Groups */}
      {conferenceGroups.map((group) => {
        const isExpanded = expandedConferences.has(group.conference);
        const allSelected = group.coaches.every(c => selectedIds.has(c.id));
        const someSelected = group.coaches.some(c => selectedIds.has(c.id));
        const activeCount = group.coaches.filter(c => !['new_lead', 'lost', 'nurture'].includes(c.status)).length;

        const panelId = `conference-panel-${group.conference.replace(/\s+/g, '-')}`;

        return (
          <div
            key={group.conference}
            className="glass-standard rounded-2xl overflow-clip"
          >
            {/* Conference Header — checkbox + toggle button are siblings (no nested interactives) */}
            <div className="flex items-center gap-3 p-4">
              <input
                type="checkbox"
                aria-label={`Select all coaches in ${group.conference}`}
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={() => toggleGroupSelection(group)}
                className="w-4 h-4 rounded-lg border-warm-300 text-primary-600 focus:ring-primary-500/20 cursor-pointer"
              />

              <Button variant="ghost"
                type="button"
                onClick={() => toggleConference(group.conference)}
                aria-expanded={isExpanded}
                aria-controls={panelId}
                className="flex-1 min-w-0 flex items-center gap-3 -m-2 p-2 rounded-lg hover:bg-warm-50/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 transition-colors text-left"
              >
                <span className="text-warm-400 flex-shrink-0" aria-hidden="true">
                  {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                </span>

                <span className="flex-1 min-w-0 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-warm-900 truncate">{group.conference}</h3>
                  <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-warm-100 text-label font-bold text-warm-600 tabular-nums">
                    {group.coaches.length}
                  </span>
                  {activeCount > 0 && (
                    <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-primary-50 text-label font-bold text-primary-700 tabular-nums">
                      {activeCount} active
                    </span>
                  )}
                </span>

                <span className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                  {Object.entries(group.divisions)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([division, count]) => (
                      <span
                        key={division}
                        className="px-2 py-0.5 rounded-lg bg-blue-50 text-micro font-bold text-blue-700 tabular-nums"
                      >
                        {division}: {count}
                      </span>
                    ))}
                </span>

                <span className="hidden sm:flex items-center gap-0.5 flex-shrink-0">
                  {Object.entries(group.statusBreakdown)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([status, count]) => (
                      <span
                        key={status}
                        className={cn(
                          'px-1.5 py-0.5 rounded text-micro font-semibold tabular-nums',
                          statusConfig[status as CoachStatus]?.bgColor,
                          statusConfig[status as CoachStatus]?.color
                        )}
                      >
                        {count}
                      </span>
                    ))}
                </span>
              </Button>
            </div>

            {/* Expanded Coach List */}
            {isExpanded && (
              <div
                id={panelId}
                role="region"
                aria-label={`${group.conference} coaches`}
                className="border-t border-warm-100/50"
              >
                <table className="w-full table-fixed">
                  <thead>
                    <tr className="border-b border-warm-100/30">
                      <th className="w-10 px-4 py-2" />
                      <th className="w-8 px-2 py-2" />
                      <th className="text-left px-4 py-2 text-micro font-semibold text-warm-500 uppercase tracking-wider">Coach</th>
                      <th className="text-left px-4 py-2 text-micro font-semibold text-warm-500 uppercase tracking-wider">School</th>
                      <th className="text-left px-4 py-2 text-micro font-semibold text-warm-500 uppercase tracking-wider w-14 hidden sm:table-cell">Div</th>
                      <th className="text-left px-4 py-2 text-micro font-semibold text-warm-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-2 text-micro font-semibold text-warm-500 uppercase tracking-wider hidden lg:table-cell">Last Contact</th>
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
                            !isSelected && 'hover:bg-primary-50/20'
                          )}
                          onClick={() => onCoachClick(coach)}
                        >
                          <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${coach.name}`}
                              checked={isSelected}
                              onChange={() => {
                                const next = new Set(selectedIds);
                                if (next.has(coach.id)) next.delete(coach.id);
                                else next.add(coach.id);
                                onSelectionChange(next);
                              }}
                              className="w-4 h-4 rounded-lg border-warm-300 text-primary-600 focus:ring-primary-500/20 cursor-pointer"
                            />
                          </td>
                          <td className="px-2 py-2.5" onClick={e => e.stopPropagation()}>
                            <IconButton variant="default"
                              type="button"
                              onClick={() => onToggleStar(coach.id, coach.is_starred)}
                              aria-label={coach.is_starred ? `Unstar ${coach.name}` : `Star ${coach.name}`}
                              aria-pressed={coach.is_starred}
                              className={cn(
                                'transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 rounded',
                                coach.is_starred ? 'opacity-100' : 'opacity-20 group-hover:opacity-50'
                              )}
                            >
                              <IconStar size={14} className={cn(coach.is_starred ? 'fill-amber-400 text-amber-400' : 'text-warm-300')} />
                            </IconButton>
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="text-sm font-medium text-warm-900 truncate">{coach.name}</p>
                            {coach.title && <p className="text-label text-warm-400 truncate">{coach.title}</p>}
                            <div className="mt-1"><SequenceEnrollmentBadge summary={coachEnrollments?.[coach.id]} /></div>
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="text-sm text-warm-700 truncate">{coach.school}</p>
                          </td>
                          <td className="hidden sm:table-cell px-4 py-2.5">
                            <span className={cn(
                              'text-micro font-bold uppercase px-1.5 py-0.5 rounded',
                              coach.division === 'D2' ? 'bg-blue-100 text-blue-700' : 'bg-primary-100 text-primary-700'
                            )}>
                              {coach.division}
                            </span>
                          </td>
                          <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                            <div className="relative">
                              <Button variant="ghost"
                                type="button"
                                onClick={e => { e.stopPropagation(); setOpenStatusDropdown(openStatusDropdown === coach.id ? null : coach.id); setOpenActionMenu(null); }}
                                aria-haspopup="menu"
                                aria-expanded={openStatusDropdown === coach.id}
                                aria-label={`Change status for ${coach.name}`}
                                className={cn(
                                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-micro font-medium transition-all',
                                  statusConfig[coach.status]?.bgColor,
                                  statusConfig[coach.status]?.color,
                                  'hover:ring-1 hover:ring-warm-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30'
                                )}
                              >
                                {statusConfig[coach.status]?.icon}
                                <span>{statusConfig[coach.status]?.label}</span>
                              </Button>
                              {openStatusDropdown === coach.id && (
                                <div
                                  role="menu"
                                  className="absolute z-50 mt-1 py-1 min-w-[160px] max-h-[320px] overflow-y-auto glass-standard rounded-xl shadow-xl"
                                >
                                  {ALL_STATUSES.map(status => (
                                    <Button variant="primary"
                                      type="button"
                                      role="menuitem"
                                      key={status}
                                      onClick={() => { onStatusChange(coach.id, status); setOpenStatusDropdown(null); }}
                                      className={cn('w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors',
                                        coach.status === status ? 'bg-primary-50 font-semibold text-primary-700' : 'text-warm-700 hover:bg-warm-50 active:bg-warm-100'
                                      )}>
                                      {statusConfig[status]?.icon}
                                      <span>{statusConfig[status]?.label}</span>
                                    </Button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="hidden lg:table-cell px-4 py-2.5">
                            <span className={cn(
                              'text-xs tabular-nums',
                              !coach.last_contacted_at ? 'text-red-500 font-medium' : 'text-warm-500'
                            )}>
                              {formatRelativeDate(coach.last_contacted_at)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                            <div className="relative">
                              <IconButton variant="default"
                                type="button"
                                onClick={e => { e.stopPropagation(); setOpenActionMenu(openActionMenu === coach.id ? null : coach.id); setOpenStatusDropdown(null); }}
                                aria-haspopup="menu"
                                aria-expanded={openActionMenu === coach.id}
                                aria-label={`More actions for ${coach.name}`}
                                className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200 opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 transition-all"
                              >
                                <IconMoreHorizontal size={14} />
                              </IconButton>
                              {openActionMenu === coach.id && (
                                <div
                                  role="menu"
                                  className="absolute right-0 top-full mt-1 z-50 w-44 py-1 rounded-xl glass-standard shadow-xl"
                                >
                                  <Button variant="ghost"
                                    type="button"
                                    role="menuitem"
                                    onClick={() => { onLogContact(coach); setOpenActionMenu(null); }}
                                    className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-2"
                                  >
                                    <IconMessageSquare size={14} /> Log Contact
                                  </Button>
                                  {coach.email && (
                                    <a
                                      role="menuitem"
                                      href={`mailto:${coach.email}`}
                                      onClick={() => setOpenActionMenu(null)}
                                      className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-2"
                                    >
                                      <IconMail size={14} /> Send Email
                                    </a>
                                  )}
                                  <Button variant="ghost"
                                    type="button"
                                    role="menuitem"
                                    onClick={() => { onStatusChange(coach.id, 'contacted'); setOpenActionMenu(null); }}
                                    className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-2"
                                  >
                                    <IconArrowRight size={14} /> Move to Contacted
                                  </Button>
                                  <Button variant="ghost"
                                    type="button"
                                    role="menuitem"
                                    onClick={() => { onToggleStar(coach.id, coach.is_starred); setOpenActionMenu(null); }}
                                    className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-2"
                                  >
                                    <IconStar size={14} /> {coach.is_starred ? 'Unstar' : 'Star'}
                                  </Button>
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
