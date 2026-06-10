'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { IconStar, IconMoreHorizontal, IconMessageSquare, IconArrowRight, IconChevronDown, IconChevronRight, IconMail, IconUpload, IconUserPlus, IconFlame, IconZap } from '@/components/icons';
import { STATUS_COLORS } from '../crm-config';
import type { Coach, CoachStatus } from '../crm-config';
import type { CrmSegment } from '@/app/golf/admin/crm/types/foundations';
import { EmailStatusBadge, type EmailStatusFields } from './EmailStatusBadge';
import { SegmentBadge } from './segments/SegmentBadge';
import { EngagementBadge } from './badges/EngagementBadge';
import type { CoachEngagement } from '../types/foundations';
import { Button, IconButton } from '@/components/ui/button';

// The Coach type from crm-config.tsx predates Stream 1's migration that added
// `last_email_event_type` and `last_email_event_at` to crm_coaches. Extend it
// locally as an additive intersection so both fields are available without
// modifying the shared type.
type CoachRow = Coach & EmailStatusFields;

type StatusConfig = Record<CoachStatus, { label: string; color: string; bgColor: string; icon: React.ReactNode; order: number }>;
type PriorityConfig = Record<number, { label: string; color: string; bgColor: string; icon: React.ReactNode; iconLabel: React.ReactNode }>;

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
  statusConfig: StatusConfig;
  priorityConfig: PriorityConfig;
  // Engagement map keyed by coach.id; rendered in the leftmost data column
  // as a Hot/Warm/Cold pill. Optional — when omitted, no badge column shows.
  coachEngagement?: Record<string, CoachEngagement>;
  // Segment-membership map keyed by coach.id. Each entry is the list of
  // segments this coach belongs to (computed in the parent — see
  // SavedSegmentsRail integration). Stream C owns this prop & rightmost
  // column; do NOT touch the left side of the table.
  coachSegments?: Record<string, CrmSegment[]>;
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

// ============================================================================
// MEMOIZED ROW COMPONENT
// ============================================================================
// Every row subscribes to shared state (sort, pagination, dropdown open state)
// via its parent. Extracting into a memoized component keeps hover/small
// updates cheap: rows only re-render when their own data / selection /
// focus / own-dropdown state changes. Callbacks from the parent must be
// stable (wrap in useCallback on the caller side).
// ============================================================================
interface CoachTableRowProps {
  coach: Coach;
  isSelected: boolean;
  isFocused: boolean;
  isStatusOpen: boolean;
  isActionOpen: boolean;
  isPriorityOpen: boolean;
  onClick: (coach: Coach) => void;
  onToggleSelect: (id: string) => void;
  onToggleStar: (coachId: string, currentStarred: boolean) => void;
  onStatusChange: (coachId: string, status: CoachStatus) => void;
  onPriorityChange?: (coachId: string, priority: number) => void;
  onLogContact: (coach: Coach) => void;
  onOpenStatus: (id: string | null) => void;
  onOpenAction: (id: string | null) => void;
  onOpenPriority: (id: string | null) => void;
  statusConfig: StatusConfig;
  priorityConfig: PriorityConfig;
  engagement?: CoachEngagement;
  segments?: CrmSegment[];
}

const CoachTableRow = React.memo(
  function CoachTableRow({
    coach,
    isSelected,
    isFocused,
    isStatusOpen,
    isActionOpen,
    isPriorityOpen,
    onClick,
    onToggleSelect,
    onToggleStar,
    onStatusChange,
    onPriorityChange,
    onLogContact,
    onOpenStatus,
    onOpenAction,
    onOpenPriority,
    statusConfig,
    priorityConfig,
    engagement,
    segments,
  }: CoachTableRowProps) {
    const handleRowClick = () => onClick(coach);
    const handleCheckbox = () => onToggleSelect(coach.id);
    const handleStar = () => onToggleStar(coach.id, coach.is_starred);

    return (
      <tr
        className={cn(
          'border-b border-warm-50 cursor-pointer group transition-colors duration-150',
          isSelected && 'bg-primary-50/50 border-l-2 border-l-primary-500',
          !isSelected && isFocused && 'bg-white/60',
          !isSelected && !isFocused && 'hover:bg-white/60',
        )}
        onClick={handleRowClick}
      >
        {/* Checkbox */}
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={handleCheckbox}
            className="w-4 h-4 rounded-md border-warm-300 text-primary-600 focus:ring-primary-500/20 cursor-pointer"
          />
        </td>

        {/* Star */}
        <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
          <IconButton variant="default" aria-label="Favorite"
            onClick={handleStar}
            className={cn('transition-all duration-200 hover:scale-110 active:scale-95', coach.is_starred ? 'opacity-100' : 'opacity-20 group-hover:opacity-50')}
          >
            <IconStar size={14} className={cn('transition-colors duration-200', coach.is_starred ? 'fill-amber-400 text-amber-400' : 'text-warm-300 hover:text-amber-300')} />
          </IconButton>
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
            coach.division === 'D2' ? 'bg-blue-100 text-blue-700' : 'bg-primary-100 text-primary-700',
          )}>
            {coach.division}
          </span>
        </td>

        {/* Conference — hidden below xl */}
        <td className="hidden xl:table-cell px-4 py-3">
          <p className="text-xs text-warm-500 truncate">{coach.conference}</p>
        </td>

        {/* Engagement (Hot / Warm / Cold) — leftmost data column, before Status.
            Stream B owns this column; do not move it without coordinating. */}
        <td className="px-4 py-3">
          <EngagementBadge coachId={coach.id} engagement={engagement} size="sm" />
        </td>

        {/* Status dropdown */}
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <div className="relative">
            <Button variant="ghost"
              onClick={e => { e.stopPropagation(); onOpenStatus(isStatusOpen ? null : coach.id); }}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all',
                STATUS_COLORS[coach.status]?.bg, STATUS_COLORS[coach.status]?.text, STATUS_COLORS[coach.status]?.border,
                'hover:ring-1 hover:ring-warm-200',
              )}
            >
              <span className="flex items-center">{statusConfig[coach.status]?.icon}</span>
              <span>{statusConfig[coach.status]?.label}</span>
              <IconChevronDown size={12} className="opacity-50" />
            </Button>
            {isStatusOpen && (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only wrapper prevents row click from closing dropdown
              <div className="absolute z-50 mt-1 py-1 min-w-[160px] max-h-[320px] overflow-y-auto bg-white/95 backdrop-blur-xl rounded-xl border border-warm-200/50 shadow-xl" onClick={e => e.stopPropagation()}>
                {ALL_STATUSES.map(status => (
                  <Button variant="primary"
                    key={status}
                    onClick={() => { onStatusChange(coach.id, status); onOpenStatus(null); }}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors',
                      coach.status === status ? 'bg-primary-50 font-semibold text-primary-700' : 'text-warm-700 hover:bg-warm-50 active:bg-warm-100',
                    )}
                  >
                    <span className="flex items-center">{statusConfig[status]?.icon}</span>
                    <span>{statusConfig[status]?.label}</span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </td>

        {/* Email status — hidden below md */}
        <td className="hidden md:table-cell px-4 py-3">
          <EmailStatusBadge
            email_status={(coach as CoachRow).email_status}
            last_email_event_type={(coach as CoachRow).last_email_event_type}
            last_email_event_at={(coach as CoachRow).last_email_event_at}
            compact
          />
        </td>

        {/* Priority — hidden below lg */}
        <td className="hidden lg:table-cell px-4 py-3">
          {coach.priority > 0 ? (
            <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full', priorityConfig[coach.priority]?.bgColor, priorityConfig[coach.priority]?.color)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', coach.priority >= 2 ? 'bg-orange-500' : 'bg-amber-500')} />
              <span className="flex items-center">{priorityConfig[coach.priority]?.iconLabel}</span>
              {priorityConfig[coach.priority]?.label}
            </span>
          ) : (
            <span className="text-micro text-warm-300">&mdash;</span>
          )}
        </td>

        {/* Last Contact — hidden below lg */}
        <td className="hidden lg:table-cell px-4 py-3">
          <span className={cn(
            'text-xs tabular-nums',
            !coach.last_contacted_at ? 'text-red-500 font-medium' : 'text-warm-500',
          )}>
            {formatRelativeDate(coach.last_contacted_at)}
          </span>
        </td>

        {/* Segments — rightmost data column. Stream C owns this. Renders one
            mini chip per saved-segment this coach belongs to. */}
        <td className="hidden xl:table-cell px-4 py-3">
          {segments && segments.length > 0 ? (
            <div className="flex flex-wrap gap-1 max-w-[180px]">
              {segments.slice(0, 3).map((seg) => (
                <SegmentBadge key={seg.id} segment={seg} variant="chip" />
              ))}
              {segments.length > 3 && (
                <span className="text-eyebrow text-warm-400 self-center">+{segments.length - 3}</span>
              )}
            </div>
          ) : (
            <span className="text-micro text-warm-300">&mdash;</span>
          )}
        </td>

        {/* Three-dot action menu */}
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <div className="relative">
            <IconButton variant="default" aria-label="More options"
              onClick={e => { e.stopPropagation(); onOpenAction(isActionOpen ? null : coach.id); }}
              className={cn(
                'p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200',
                'opacity-0 group-hover:opacity-100 transition-all duration-200',
              )}
            >
              <IconMoreHorizontal size={16} />
            </IconButton>
            {isActionOpen && (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only wrapper prevents row click from closing action menu
              <div className="absolute right-0 top-full mt-1 z-50 w-48 py-1 rounded-xl bg-white/95 backdrop-blur-xl border border-warm-200/50 shadow-xl" onClick={e => e.stopPropagation()}>
                <Button variant="ghost"
                  onClick={() => { onLogContact(coach); onOpenAction(null); }}
                  className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 active:bg-warm-100 transition-colors flex items-center gap-2"
                >
                  <IconMessageSquare size={16} className="text-warm-400" /> Log Contact
                </Button>
                {coach.email && (
                  <a
                    href={`mailto:${coach.email}`}
                    onClick={() => onOpenAction(null)}
                    className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-2"
                  >
                    <IconMail size={16} className="text-warm-400" /> Send Email
                  </a>
                )}
                <Button variant="ghost"
                  onClick={() => { onStatusChange(coach.id, 'contacted' as CoachStatus); onOpenAction(null); }}
                  className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-2"
                >
                  <IconArrowRight size={16} className="text-warm-400" /> Move to Contacted
                </Button>
                <Button variant="ghost"
                  onClick={() => { onToggleStar(coach.id, coach.is_starred); onOpenAction(null); }}
                  className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-2"
                >
                  <IconStar size={16} className="text-warm-400" /> {coach.is_starred ? 'Unstar' : 'Star'}
                </Button>

                {/* Set Priority submenu */}
                <div className="relative">
                  <Button variant="ghost"
                    onClick={e => { e.stopPropagation(); onOpenPriority(isPriorityOpen ? null : coach.id); }}
                    className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <IconFlame size={16} className="text-warm-400" /> Set Priority
                    </span>
                    <IconChevronRight size={12} className="text-warm-400" />
                  </Button>
                  {isPriorityOpen && (
                    <div className="absolute left-full top-0 ml-1 z-50 w-36 py-1 rounded-xl bg-white/95 backdrop-blur-xl border border-warm-200/50 shadow-xl">
                      <Button variant="ghost"
                        onClick={() => { onPriorityChange?.(coach.id, 0); onOpenAction(null); onOpenPriority(null); }}
                        className={cn(
                          'w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors',
                          coach.priority === 0 ? 'bg-warm-50 font-semibold text-warm-900' : 'text-warm-700 hover:bg-warm-50 active:bg-warm-100',
                        )}
                      >
                        Normal
                      </Button>
                      <Button variant="ghost"
                        onClick={() => { onPriorityChange?.(coach.id, 1); onOpenAction(null); onOpenPriority(null); }}
                        className={cn(
                          'w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors',
                          coach.priority === 1 ? 'bg-amber-50 font-semibold text-amber-700' : 'text-warm-700 hover:bg-warm-50 active:bg-warm-100',
                        )}
                      >
                        <IconZap size={16} className="text-amber-500" /> High
                      </Button>
                      <Button variant="ghost"
                        onClick={() => { onPriorityChange?.(coach.id, 2); onOpenAction(null); onOpenPriority(null); }}
                        className={cn(
                          'w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors',
                          coach.priority >= 2 ? 'bg-orange-50 font-semibold text-orange-700' : 'text-warm-700 hover:bg-warm-50 active:bg-warm-100',
                        )}
                      >
                        <IconFlame size={16} className="text-orange-500" /> Hot
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  },
  (prev, next) => {
    // Row only re-renders when its own data / selection / focus / own-dropdown
    // state changes, or when a callback reference changes (callers should
    // stabilize these with useCallback). Unrelated coach updates in the same
    // page no longer re-render this row.
    return (
      prev.coach === next.coach &&
      prev.isSelected === next.isSelected &&
      prev.isFocused === next.isFocused &&
      prev.isStatusOpen === next.isStatusOpen &&
      prev.isActionOpen === next.isActionOpen &&
      prev.isPriorityOpen === next.isPriorityOpen &&
      prev.statusConfig === next.statusConfig &&
      prev.priorityConfig === next.priorityConfig &&
      prev.engagement === next.engagement &&
      prev.segments === next.segments &&
      prev.onClick === next.onClick &&
      prev.onToggleSelect === next.onToggleSelect &&
      prev.onToggleStar === next.onToggleStar &&
      prev.onStatusChange === next.onStatusChange &&
      prev.onPriorityChange === next.onPriorityChange &&
      prev.onLogContact === next.onLogContact &&
      prev.onOpenStatus === next.onOpenStatus &&
      prev.onOpenAction === next.onOpenAction &&
      prev.onOpenPriority === next.onOpenPriority
    );
  },
);

// ============================================================================
// MEMOIZED MOBILE CARD COMPONENT
// ============================================================================
// The <md companion to CoachTableRow. Carries EVERY column, value and action
// the desktop row exposes (checkbox, star, name + title, school, division,
// conference, engagement, status dropdown, email status, priority, last
// contact, segments, three-dot action menu) — laid out vertically as a card so
// nothing is hidden behind a horizontal scroll on phones. Shares the exact same
// props / handlers / memo contract as CoachTableRow.
// ============================================================================
const CoachTableCard = React.memo(
  function CoachTableCard({
    coach,
    isSelected,
    isFocused,
    isStatusOpen,
    isActionOpen,
    isPriorityOpen,
    onClick,
    onToggleSelect,
    onToggleStar,
    onStatusChange,
    onPriorityChange,
    onLogContact,
    onOpenStatus,
    onOpenAction,
    onOpenPriority,
    statusConfig,
    priorityConfig,
    engagement,
    segments,
  }: CoachTableRowProps) {
    const handleCardClick = () => onClick(coach);
    const handleCheckbox = () => onToggleSelect(coach.id);
    const handleStar = () => onToggleStar(coach.id, coach.is_starred);

    return (
      <button
        type="button"
        className={cn(
          'cursor-pointer group transition-colors duration-150 px-4 py-3.5 w-full text-left',
          isSelected && 'bg-primary-50/50 border-l-2 border-l-primary-500',
          !isSelected && isFocused && 'bg-white/60',
          !isSelected && !isFocused && 'hover:bg-white/60',
        )}
        onClick={handleCardClick}
      >
        {/* Top row: checkbox + name/title + star + action menu */}
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only wrapper prevents card click when interacting with checkbox */}
          <div className="pt-0.5" onClick={e => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={handleCheckbox}
              className="w-4 h-4 rounded-md border-warm-300 text-primary-600 focus:ring-primary-500/20 cursor-pointer"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-warm-900 leading-tight truncate">{coach.name}</p>
            {coach.title && <p className="text-label text-warm-400 truncate">{coach.title}</p>}
            <p className="text-sm text-warm-800 truncate mt-0.5">{coach.school}</p>
          </div>

          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only wrapper prevents card click when interacting with action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            {/* Star */}
            <IconButton variant="default" aria-label="Favorite"
              onClick={handleStar}
              className={cn('transition-all duration-200 hover:scale-110 active:scale-95', coach.is_starred ? 'opacity-100' : 'opacity-40')}
            >
              <IconStar size={14} className={cn('transition-colors duration-200', coach.is_starred ? 'fill-amber-400 text-amber-400' : 'text-warm-300 hover:text-amber-300')} />
            </IconButton>

            {/* Three-dot action menu */}
            <div className="relative">
              <IconButton variant="default" aria-label="More options"
                onClick={e => { e.stopPropagation(); onOpenAction(isActionOpen ? null : coach.id); }}
                className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200 transition-all duration-200"
              >
                <IconMoreHorizontal size={16} />
              </IconButton>
              {isActionOpen && (
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only wrapper prevents card click from closing action menu
                <div className="absolute right-0 top-full mt-1 z-50 w-48 py-1 rounded-xl bg-white/95 backdrop-blur-xl border border-warm-200/50 shadow-xl" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost"
                    onClick={() => { onLogContact(coach); onOpenAction(null); }}
                    className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 active:bg-warm-100 transition-colors flex items-center gap-2"
                  >
                    <IconMessageSquare size={16} className="text-warm-400" /> Log Contact
                  </Button>
                  {coach.email && (
                    <a
                      href={`mailto:${coach.email}`}
                      onClick={() => onOpenAction(null)}
                      className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-2"
                    >
                      <IconMail size={16} className="text-warm-400" /> Send Email
                    </a>
                  )}
                  <Button variant="ghost"
                    onClick={() => { onStatusChange(coach.id, 'contacted' as CoachStatus); onOpenAction(null); }}
                    className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-2"
                  >
                    <IconArrowRight size={16} className="text-warm-400" /> Move to Contacted
                  </Button>
                  <Button variant="ghost"
                    onClick={() => { onToggleStar(coach.id, coach.is_starred); onOpenAction(null); }}
                    className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-2"
                  >
                    <IconStar size={16} className="text-warm-400" /> {coach.is_starred ? 'Unstar' : 'Star'}
                  </Button>

                  {/* Set Priority submenu */}
                  <div className="relative">
                    <Button variant="ghost"
                      onClick={e => { e.stopPropagation(); onOpenPriority(isPriorityOpen ? null : coach.id); }}
                      className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <IconFlame size={16} className="text-warm-400" /> Set Priority
                      </span>
                      <IconChevronRight size={12} className="text-warm-400" />
                    </Button>
                    {isPriorityOpen && (
                      <div className="absolute right-full top-0 mr-1 z-50 w-36 py-1 rounded-xl bg-white/95 backdrop-blur-xl border border-warm-200/50 shadow-xl">
                        <Button variant="ghost"
                          onClick={() => { onPriorityChange?.(coach.id, 0); onOpenAction(null); onOpenPriority(null); }}
                          className={cn(
                            'w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors',
                            coach.priority === 0 ? 'bg-warm-50 font-semibold text-warm-900' : 'text-warm-700 hover:bg-warm-50 active:bg-warm-100',
                          )}
                        >
                          Normal
                        </Button>
                        <Button variant="ghost"
                          onClick={() => { onPriorityChange?.(coach.id, 1); onOpenAction(null); onOpenPriority(null); }}
                          className={cn(
                            'w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors',
                            coach.priority === 1 ? 'bg-amber-50 font-semibold text-amber-700' : 'text-warm-700 hover:bg-warm-50 active:bg-warm-100',
                          )}
                        >
                          <IconZap size={16} className="text-amber-500" /> High
                        </Button>
                        <Button variant="ghost"
                          onClick={() => { onPriorityChange?.(coach.id, 2); onOpenAction(null); onOpenPriority(null); }}
                          className={cn(
                            'w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors',
                            coach.priority >= 2 ? 'bg-orange-50 font-semibold text-orange-700' : 'text-warm-700 hover:bg-warm-50 active:bg-warm-100',
                          )}
                        >
                          <IconFlame size={16} className="text-orange-500" /> Hot
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Meta chips: division + conference + engagement + status dropdown + email + priority */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only wrapper prevents card click while interacting with meta chips/dropdowns */}
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-7" onClick={e => e.stopPropagation()}>
          {/* Division */}
          <span className={cn(
            'text-micro font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
            coach.division === 'D2' ? 'bg-blue-100 text-blue-700' : 'bg-primary-100 text-primary-700',
          )}>
            {coach.division}
          </span>

          {/* Conference */}
          {coach.conference && (
            <span className="text-xs text-warm-500 truncate max-w-[140px]">{coach.conference}</span>
          )}

          {/* Engagement */}
          <EngagementBadge coachId={coach.id} engagement={engagement} size="sm" />

          {/* Status dropdown */}
          <div className="relative">
            <Button variant="ghost"
              onClick={e => { e.stopPropagation(); onOpenStatus(isStatusOpen ? null : coach.id); }}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all',
                STATUS_COLORS[coach.status]?.bg, STATUS_COLORS[coach.status]?.text, STATUS_COLORS[coach.status]?.border,
                'hover:ring-1 hover:ring-warm-200',
              )}
            >
              <span className="flex items-center">{statusConfig[coach.status]?.icon}</span>
              <span>{statusConfig[coach.status]?.label}</span>
              <IconChevronDown size={12} className="opacity-50" />
            </Button>
            {isStatusOpen && (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only wrapper prevents card click from closing status dropdown
              <div className="absolute z-50 mt-1 py-1 min-w-[160px] max-h-[320px] overflow-y-auto bg-white/95 backdrop-blur-xl rounded-xl border border-warm-200/50 shadow-xl" onClick={e => e.stopPropagation()}>
                {ALL_STATUSES.map(status => (
                  <Button variant="primary"
                    key={status}
                    onClick={() => { onStatusChange(coach.id, status); onOpenStatus(null); }}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors',
                      coach.status === status ? 'bg-primary-50 font-semibold text-primary-700' : 'text-warm-700 hover:bg-warm-50 active:bg-warm-100',
                    )}
                  >
                    <span className="flex items-center">{statusConfig[status]?.icon}</span>
                    <span>{statusConfig[status]?.label}</span>
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Email status */}
          <EmailStatusBadge
            email_status={(coach as CoachRow).email_status}
            last_email_event_type={(coach as CoachRow).last_email_event_type}
            last_email_event_at={(coach as CoachRow).last_email_event_at}
            compact
          />

          {/* Priority */}
          {coach.priority > 0 ? (
            <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full', priorityConfig[coach.priority]?.bgColor, priorityConfig[coach.priority]?.color)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', coach.priority >= 2 ? 'bg-orange-500' : 'bg-amber-500')} />
              <span className="flex items-center">{priorityConfig[coach.priority]?.iconLabel}</span>
              {priorityConfig[coach.priority]?.label}
            </span>
          ) : null}
        </div>

        {/* Footer: last contact + segments */}
        <div className="mt-2 flex items-center justify-between gap-2 pl-7">
          <span className={cn(
            'text-xs tabular-nums',
            !coach.last_contacted_at ? 'text-red-500 font-medium' : 'text-warm-500',
          )}>
            {formatRelativeDate(coach.last_contacted_at)}
          </span>
          {segments && segments.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-end max-w-[180px]">
              {segments.slice(0, 3).map((seg) => (
                <SegmentBadge key={seg.id} segment={seg} variant="chip" />
              ))}
              {segments.length > 3 && (
                <span className="text-eyebrow text-warm-400 self-center">+{segments.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </button>
    );
  },
  (prev, next) => {
    // Identical memo contract to CoachTableRow.
    return (
      prev.coach === next.coach &&
      prev.isSelected === next.isSelected &&
      prev.isFocused === next.isFocused &&
      prev.isStatusOpen === next.isStatusOpen &&
      prev.isActionOpen === next.isActionOpen &&
      prev.isPriorityOpen === next.isPriorityOpen &&
      prev.statusConfig === next.statusConfig &&
      prev.priorityConfig === next.priorityConfig &&
      prev.engagement === next.engagement &&
      prev.segments === next.segments &&
      prev.onClick === next.onClick &&
      prev.onToggleSelect === next.onToggleSelect &&
      prev.onToggleStar === next.onToggleStar &&
      prev.onStatusChange === next.onStatusChange &&
      prev.onPriorityChange === next.onPriorityChange &&
      prev.onLogContact === next.onLogContact &&
      prev.onOpenStatus === next.onOpenStatus &&
      prev.onOpenAction === next.onOpenAction &&
      prev.onOpenPriority === next.onOpenPriority
    );
  },
);

// ============================================================================
// MAIN TABLE COMPONENT
// ============================================================================
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
  coachEngagement,
  coachSegments,
}: CoachTableProps) {
  const [openStatusDropdown, setOpenStatusDropdown] = useState<string | null>(null);
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  const [openPrioritySubmenu, setOpenPrioritySubmenu] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  // focusedIndex is only set by keyboard nav (j/k) — NOT on mouse hover.
  // Hover state is now pure CSS (`hover:bg-white/60` on the row) which
  // avoids re-rendering the table on every mouse traversal.
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

  // Stable setters for the memoized row component
  const handleOpenStatus = useCallback((id: string | null) => {
    setOpenStatusDropdown(id);
    if (id !== null) setOpenActionMenu(null);
  }, []);
  const handleOpenAction = useCallback((id: string | null) => {
    setOpenActionMenu(id);
    if (id !== null) {
      setOpenStatusDropdown(null);
      setOpenPrioritySubmenu(null);
    }
  }, []);
  const handleOpenPriority = useCallback((id: string | null) => {
    setOpenPrioritySubmenu(id);
  }, []);

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
            <div className="h-4 w-14 bg-warm-100/60 rounded-full skeleton-shimmer" />
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
            <Button variant="ghost"
              onClick={onImport}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-warm-200/50 text-warm-700 rounded-xl font-medium hover:bg-warm-50 active:bg-warm-100 transition-colors text-sm"
            >
              <IconUpload size={16} /> Import Coaches
            </Button>
          )}
          {onAddCoach && (
            <Button variant="primary"
              onClick={onAddCoach}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors text-sm shadow-sm shadow-primary-500/25"
            >
              <IconUserPlus size={16} /> Add Coach
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Desktop table — hidden on <md, horizontally scrollable from md up */}
      <table className="hidden md:table w-full table-fixed min-w-[600px]">
        <thead>
          <tr className="border-b border-warm-100 bg-warm-50/50">
            <th className="w-10 px-4 py-3">
              <input type="checkbox" checked={paginatedCoaches.length > 0 && paginatedCoaches.every(c => selectedIds.has(c.id))} onChange={toggleAll}
                className="w-4 h-4 rounded-md border-warm-300 text-primary-600 focus:ring-primary-500/20 cursor-pointer" />
            </th>
            <th className="w-10 px-2 py-3" />
            <TH field="name" label="Coach" onSort={handleSort}><SortArrow field="name" /></TH>
            <TH field="school" label="School" onSort={handleSort}><SortArrow field="school" /></TH>
            <TH field="division" label="Div" onSort={handleSort} className="w-16"><SortArrow field="division" /></TH>
            <TH field="conference" label="Conference" onSort={handleSort} className="hidden xl:table-cell"><SortArrow field="conference" /></TH>
            {/* Engagement column header — leftmost of the new data columns,
                aligned with the badge cell rendered inside CoachTableRow. */}
            <th className="text-left px-4 py-3 text-xs font-medium text-warm-500 uppercase tracking-wide w-24">Engagement</th>
            <TH field="status" label="Status" onSort={handleSort}><SortArrow field="status" /></TH>
            <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-medium text-warm-500 uppercase tracking-wide w-24">Email</th>
            <TH field="priority" label="Priority" onSort={handleSort} className="hidden lg:table-cell w-20"><SortArrow field="priority" /></TH>
            <TH field="last_contacted_at" label="Last Contact" onSort={handleSort} className="hidden lg:table-cell"><SortArrow field="last_contacted_at" /></TH>
            {/* Segments column header — Stream C owns. Hidden below xl. */}
            <th className="hidden xl:table-cell text-left px-4 py-3 text-xs font-medium text-warm-500 uppercase tracking-wide w-[180px]">Segments</th>
            <th className="w-12 px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {paginatedCoaches.map((coach, index) => (
            <CoachTableRow
              key={coach.id}
              coach={coach}
              isSelected={selectedIds.has(coach.id)}
              isFocused={focusedIndex === index}
              isStatusOpen={openStatusDropdown === coach.id}
              isActionOpen={openActionMenu === coach.id}
              isPriorityOpen={openPrioritySubmenu === coach.id}
              onClick={onCoachClick}
              onToggleSelect={toggleSelection}
              onToggleStar={onToggleStar}
              onStatusChange={onStatusChange}
              onPriorityChange={onPriorityChange}
              onLogContact={onLogContact}
              onOpenStatus={handleOpenStatus}
              onOpenAction={handleOpenAction}
              onOpenPriority={handleOpenPriority}
              statusConfig={statusConfig}
              priorityConfig={priorityConfig}
              engagement={coachEngagement?.[coach.id]}
              segments={coachSegments?.[coach.id]}
            />
          ))}
        </tbody>
      </table>

      {/* Mobile card list — shown only on <md. One card per coach carrying the
          SAME columns / values / actions as a desktop row (nothing dropped):
          selection checkbox, star toggle, name + title, school, division,
          conference, engagement, status dropdown, email status, priority,
          last contact, segments, and the three-dot action menu. */}
      <div className="md:hidden divide-y divide-warm-50">
        {paginatedCoaches.map((coach, index) => (
          <CoachTableCard
            key={coach.id}
            coach={coach}
            isSelected={selectedIds.has(coach.id)}
            isFocused={focusedIndex === index}
            isStatusOpen={openStatusDropdown === coach.id}
            isActionOpen={openActionMenu === coach.id}
            isPriorityOpen={openPrioritySubmenu === coach.id}
            onClick={onCoachClick}
            onToggleSelect={toggleSelection}
            onToggleStar={onToggleStar}
            onStatusChange={onStatusChange}
            onPriorityChange={onPriorityChange}
            onLogContact={onLogContact}
            onOpenStatus={handleOpenStatus}
            onOpenAction={handleOpenAction}
            onOpenPriority={handleOpenPriority}
            statusConfig={statusConfig}
            priorityConfig={priorityConfig}
            engagement={coachEngagement?.[coach.id]}
            segments={coachSegments?.[coach.id]}
          />
        ))}
      </div>

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
              className="text-sm px-2.5 py-1.5 rounded-lg bg-white/50 border border-warm-200/60 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-300 transition-all duration-200">
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
      className={cn('text-left px-4 py-3 text-xs font-medium text-warm-500 uppercase tracking-wide cursor-pointer hover:text-warm-700 transition-colors', className)}
      onClick={() => onSort(field)}
    >
      {label}{children}
    </th>
  );
}

function PaginationButton({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <Button variant="ghost" onClick={onClick} disabled={disabled}
      className="px-2 py-1 rounded-lg hover:bg-white/60 disabled:opacity-40 text-sm font-medium transition-colors">
      {children}
    </Button>
  );
}
