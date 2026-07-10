'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { IconStar, IconMoreHorizontal, IconMessageSquare, IconArrowRight, IconChevronDown, IconChevronRight, IconMail, IconSend, IconExternalLink, IconPhone, IconUpload, IconUserPlus, IconUser, IconUsers, IconUserX, IconCheck, IconFlame, IconZap, IconSchool, IconX } from '@/components/icons';
import { STATUS_COLORS, CRM_ASSIGNEES } from '../crm-config';
import type { Coach, CoachStatus, CrmAssignee } from '../crm-config';
import { setCoachAssignee } from '@/app/golf/actions/crm-assignee';
import type { CrmSegment } from '@/app/golf/admin/crm/types/foundations';
import { EmailStatusBadge, type EmailStatusFields } from './EmailStatusBadge';
import { SegmentBadge } from './segments/SegmentBadge';
import { EngagementBadge } from './badges/EngagementBadge';
import { SequenceEnrollmentBadge } from './badges/SequenceEnrollmentBadge';
import type { CoachEngagement } from '../types/foundations';
import type { CoachEnrollmentSummary } from '@/app/golf/actions/crm-sequences';
import { Button, IconButton } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/select';

// Row-density modes. Comfortable keeps the original generous vertical rhythm;
// Compact tightens cell padding + line height so ~2x as many rows fit a
// viewport. Purely presentational — does not change any data or behavior.
type Density = 'comfortable' | 'compact';

// Fixed per-density cell padding for the desktop <td>/<th> cells. Keeping these
// as constants (not inline) lets the row + header + card share identical
// spacing so columns line up exactly.
const DENSITY_CELL_PADDING: Record<Density, string> = {
  comfortable: 'px-4 py-3',
  compact: 'px-4 py-1.5',
};
// Tighter padding for the narrow leading checkbox / star / action columns.
const DENSITY_EDGE_PADDING: Record<Density, string> = {
  comfortable: 'py-3',
  compact: 'py-1.5',
};

// Short display labels for role_level values
const ROLE_LABELS: Record<string, string> = {
  head_coach: 'Head',
  assistant_coach: 'Asst',
  associate_head_coach: 'Assoc HC',
  director: 'Dir',
  volunteer: 'Vol',
};

// Short display labels for program values
const PROGRAM_LABELS: Record<string, string> = {
  mens: 'M',
  womens: 'W',
  both: 'M/W',
};

// Builds the single muted secondary line under the coach name: "School · Title".
// Either part may be missing; we join only the present parts with a middot.
function coachSecondaryLine(coach: Coach): string {
  return [coach.school, coach.title].filter(Boolean).join(' · ');
}

// Compact contact header rendered at the top of a row's hover action menu.
// Surfaces the email / phone / role / program that were moved out of the
// over-stacked name cell, so the data is one tap away without crowding the row.
function RowContactHeader({ coach }: { coach: Coach }) {
  const roleLabel = coach.role_level ? (ROLE_LABELS[coach.role_level] ?? coach.role_level) : null;
  const programLabel = PROGRAM_LABELS[coach.program] ?? null;
  const hasMeta = coach.email || coach.phone || roleLabel || programLabel;
  if (!hasMeta) return null;
  return (
    <div className="px-3 pt-2 pb-2 mb-1 border-b border-warm-100/70">
      <p className="text-sm font-semibold text-warm-900 truncate">{coach.name}</p>
      {coach.email && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-warm-500 min-w-0" title={coach.email}>
          <IconMail size={11} className="shrink-0 opacity-60" />
          <span className="truncate">{coach.email}</span>
        </p>
      )}
      {coach.phone && (
        <p className="flex items-center gap-1 text-xs text-warm-500 min-w-0" title={coach.phone}>
          <IconPhone size={11} className="shrink-0 opacity-60" />
          <span className="truncate">{coach.phone}</span>
        </p>
      )}
      {(roleLabel || programLabel) && (
        <div className="mt-1 flex items-center flex-wrap gap-1">
          {roleLabel && (
            <span className="text-micro font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-warm-100 text-warm-600">
              {roleLabel}
            </span>
          )}
          {programLabel && (
            <span className="text-micro font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
              {programLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Per-label tint for the assignee chip. Each of the (currently three) work-
// division labels gets a distinct soft pill so the book split reads at a glance.
// Unknown labels fall through to a neutral warm tint. Purely presentational.
const ASSIGNEE_TINT: Record<string, string> = {
  Nick: 'bg-primary-50 text-primary-700 ring-1 ring-primary-200',
  Ben: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  Leah: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
};

// Small tinted badge shown in the row / card when a coach has been assigned to
// one of the work-division labels (Nick/Ben/Leah). Renders the label uppercased.
function AssigneeChip({ assignee }: { assignee: string }) {
  return (
    <span
      className={cn(
        'shrink-0 inline-flex items-center gap-1 text-micro font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
        ASSIGNEE_TINT[assignee] ?? 'bg-warm-100 text-warm-600 ring-1 ring-warm-200',
      )}
      title={`Assigned to ${assignee}`}
    >
      <IconUser size={9} className="opacity-70" aria-hidden="true" />
      {assignee}
    </span>
  );
}

// Renders the "Assign ▾" submenu inside the row/card action menu: lists the
// CRM_ASSIGNEES labels + "Unassign", calls setCoachAssignee, and reflects the
// choice optimistically via onAssigneeChange (parent state) when provided. The
// write is fire-and-forget through the server action (it revalidates the route).
interface AssigneeSubmenuProps {
  coach: Coach;
  isOpen: boolean;
  onToggle: () => void;
  onCloseMenu: () => void;
  onAssigneeChange?: (coachId: string, assignee: string | null) => void;
  // Card variant flips the flyout to the left so it doesn't clip off-screen.
  flyoutSide?: 'left' | 'right';
}

function AssigneeSubmenu({
  coach,
  isOpen,
  onToggle,
  onCloseMenu,
  onAssigneeChange,
  flyoutSide = 'left',
}: AssigneeSubmenuProps) {
  const apply = (assignee: CrmAssignee | null) => {
    onAssigneeChange?.(coach.id, assignee);
    void setCoachAssignee({ coach_id: coach.id, assignee });
    onCloseMenu();
  };
  return (
    <div className="relative">
      <Button variant="ghost"
        onClick={e => { e.stopPropagation(); onToggle(); }}
        className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center justify-between"
      >
        <span className="flex items-center gap-2">
          <IconUserPlus size={16} className="text-warm-400" /> Assign
        </span>
        <IconChevronRight size={12} className="text-warm-400" />
      </Button>
      {isOpen && (
        <div className={cn(
          'absolute top-0 z-50 w-36 py-1 glass-prominent rounded-xl shadow-xl',
          flyoutSide === 'left' ? 'left-full ml-1' : 'right-full mr-1',
        )}>
          {CRM_ASSIGNEES.map(label => (
            <Button variant="ghost"
              key={label}
              onClick={() => apply(label)}
              className={cn(
                'w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors',
                coach.assigned_to === label ? 'bg-primary-50 font-semibold text-primary-700' : 'text-warm-700 hover:bg-warm-50 active:bg-warm-100',
              )}
            >
              <IconUser size={14} className={coach.assigned_to === label ? 'text-primary-500' : 'text-warm-400'} />
              <span className="flex-1">{label}</span>
              {coach.assigned_to === label && <IconCheck size={13} className="text-primary-600" />}
            </Button>
          ))}
          <div className="my-1 h-px bg-warm-100" />
          <Button variant="ghost"
            onClick={() => apply(null)}
            disabled={!coach.assigned_to}
            className={cn(
              'w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors',
              coach.assigned_to ? 'text-warm-700 hover:bg-warm-50 active:bg-warm-100' : 'text-warm-300 cursor-default',
            )}
          >
            <IconUserX size={14} className="text-warm-400" /> Unassign
          </Button>
        </div>
      )}
    </div>
  );
}

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
  // Optional: parent updates its own coach list when an assignee changes so the
  // chip reflects instantly. When omitted, the table tracks the override locally.
  onAssigneeChange?: (coachId: string, assignee: string | null) => void;
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
  // coach_id -> sequence enrollment summary, for the queue badge on the list
  coachEnrollments?: Record<string, CoachEnrollmentSummary>;
  // Segment-membership map keyed by coach.id. Each entry is the list of
  // segments this coach belongs to (computed in the parent — see
  // SavedSegmentsRail integration). Stream C owns this prop & rightmost
  // column; do NOT touch the left side of the table.
  coachSegments?: Record<string, CrmSegment[]>;
  // "Open in Gmail" manual-send. When both are set (a template is armed) and a
  // coach has an email, the row/card action menus surface a "Gmail" item that
  // opens a pre-filled Gmail compose window for that coach. Optional so other
  // callers compile unchanged.
  onOpenInGmail?: (coach: Coach) => void;
  manualTemplateArmed?: boolean;
  // School-group header "Gmail" action: a real <a href> built from the armed
  // template (subject + body merged) so it opens reliably under automation.
  // getGmailHref builds the compose URL for a coach; onGmailTouch logs the touch.
  getGmailHref?: (coach: Coach) => string | null;
  onGmailTouch?: (coach: Coach) => void;
  // When true, the Gmail actions SEND directly via the Gmail API (a <button>,
  // no compose tab). Changes the menu-item label to "Send via Gmail" and turns
  // the school-group header into a direct-send button.
  gmailDirectSend?: boolean;
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
  isAssigneeOpen: boolean;
  onClick: (coach: Coach) => void;
  onToggleSelect: (id: string) => void;
  onToggleStar: (coachId: string, currentStarred: boolean) => void;
  onStatusChange: (coachId: string, status: CoachStatus) => void;
  onPriorityChange?: (coachId: string, priority: number) => void;
  onAssigneeChange?: (coachId: string, assignee: string | null) => void;
  onLogContact: (coach: Coach) => void;
  onOpenStatus: (id: string | null) => void;
  onOpenAction: (id: string | null) => void;
  onOpenPriority: (id: string | null) => void;
  onOpenAssignee: (id: string | null) => void;
  statusConfig: StatusConfig;
  priorityConfig: PriorityConfig;
  engagement?: CoachEngagement;
  enrollment?: CoachEnrollmentSummary | null;
  segments?: CrmSegment[];
  density: Density;
  // "Open in Gmail" — only rendered when a template is armed AND the coach has
  // an email (the parent CoachTable gates on both before passing the handler).
  onOpenInGmail?: (coach: Coach) => void;
  manualTemplateArmed?: boolean;
  // Direct Gmail-API send mode — relabels the menu item "Send via Gmail".
  gmailDirectSend?: boolean;
}

const CoachTableRow = React.memo(
  function CoachTableRow({
    coach,
    isSelected,
    isFocused,
    isStatusOpen,
    isActionOpen,
    isPriorityOpen,
    isAssigneeOpen,
    onClick,
    onToggleSelect,
    onToggleStar,
    onStatusChange,
    onPriorityChange,
    onAssigneeChange,
    onLogContact,
    onOpenStatus,
    onOpenAction,
    onOpenPriority,
    onOpenAssignee,
    statusConfig,
    priorityConfig,
    engagement,
    enrollment,
    segments,
    density,
    onOpenInGmail,
    manualTemplateArmed,
    gmailDirectSend,
  }: CoachTableRowProps) {
    const handleRowClick = () => onClick(coach);
    const handleCheckbox = () => onToggleSelect(coach.id);
    const handleStar = () => onToggleStar(coach.id, coach.is_starred);
    const cellPad = DENSITY_CELL_PADDING[density];
    const edgePad = DENSITY_EDGE_PADDING[density];
    const secondary = coachSecondaryLine(coach);

    return (
      <tr
        className={cn(
          'border-b border-warm-50 cursor-pointer group transition-colors duration-150',
          isSelected && 'bg-primary-50/50',
          !isSelected && isFocused && 'bg-cream-100',
          !isSelected && !isFocused && 'hover:bg-cream-100',
        )}
        onClick={handleRowClick}
      >
        {/* Checkbox — always shown */}
        <td className={cn('px-4', edgePad)} onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={handleCheckbox}
            className="w-4 h-4 rounded-md border-warm-300 text-primary-600 focus:ring-primary-500/20 cursor-pointer"
          />
        </td>

        {/* Star — always shown */}
        <td className={cn('px-2', edgePad)} onClick={e => e.stopPropagation()}>
          <IconButton variant="default" aria-label="Favorite"
            onClick={handleStar}
            className={cn('transition-all duration-200 hover:scale-110 active:scale-95', coach.is_starred ? 'opacity-100' : 'opacity-20 group-hover:opacity-50')}
          >
            <IconStar size={14} className={cn('transition-colors duration-200', coach.is_starred ? 'fill-amber-400 text-amber-400' : 'text-warm-300 hover:text-amber-300')} />
          </IconButton>
        </td>

        {/* Coach name + ONE muted secondary line (school · title) + a small
            division chip. The over-stacked email/phone/role/program have moved
            into the row's hover action menu (and remain in the detail panel) so
            rows stay one clean line per field. Always shown. */}
        <td className={cellPad}>
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-medium text-warm-900 leading-tight truncate">{coach.name}</p>
            <span className={cn(
              'shrink-0 text-micro font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
              coach.division === 'D2' ? 'bg-blue-100 text-blue-700' : 'bg-primary-100 text-primary-700',
            )}>
              {coach.division}
            </span>
            {coach.is_primary_contact && (
              <span className="shrink-0 text-micro font-bold px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 border border-primary-200/60">★</span>
            )}
            {coach.assigned_to && <AssigneeChip assignee={coach.assigned_to} />}
          </div>
          {secondary && <p className="text-label text-warm-400 truncate">{secondary}</p>}
        </td>

        {/* Engagement (Hot / Warm / Cold) — visible at lg+.
            Stream B owns this column; do not move it without coordinating. */}
        <td className={cn('hidden lg:table-cell', cellPad)}>
          <div className="flex flex-col items-start gap-1">
            <EngagementBadge coachId={coach.id} engagement={engagement} size="sm" />
            <SequenceEnrollmentBadge summary={enrollment} />
          </div>
        </td>

        {/* Status dropdown — always shown */}
        <td className={cellPad} onClick={e => e.stopPropagation()}>
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
              <div className="absolute z-50 mt-1 py-1 min-w-[160px] max-h-[320px] overflow-y-auto glass-prominent rounded-xl shadow-xl" onClick={e => e.stopPropagation()}>
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

        {/* Email status — visible at xl+ */}
        <td className={cn('hidden xl:table-cell', cellPad)}>
          <EmailStatusBadge
            email_status={(coach as CoachRow).email_status}
            last_email_event_type={(coach as CoachRow).last_email_event_type}
            last_email_event_at={(coach as CoachRow).last_email_event_at}
            compact
          />
        </td>

        {/* Priority — visible at xl+ */}
        <td className={cn('hidden xl:table-cell', cellPad)}>
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

        {/* Conference — visible at xl+ */}
        <td className={cn('hidden xl:table-cell', cellPad)}>
          <p className="text-xs text-warm-500 truncate">{coach.conference}</p>
        </td>

        {/* Last Contact — visible whenever the table shows (md+); right-aligned
            recency with tabular-nums. "Never" is red so un-touched coaches pop. */}
        <td className={cn('hidden md:table-cell text-right', cellPad)}>
          <span className={cn(
            'text-xs tabular-nums',
            !coach.last_contacted_at ? 'text-red-500 font-medium' : 'text-warm-500',
          )}>
            {formatRelativeDate(coach.last_contacted_at)}
          </span>
        </td>

        {/* Segments — visible at xl+. Stream C owns this. Renders one
            mini chip per saved-segment this coach belongs to. */}
        <td className={cn('hidden xl:table-cell', cellPad)}>
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

        {/* Three-dot action menu — always shown */}
        <td className={cn('px-4', edgePad)} onClick={e => e.stopPropagation()}>
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
              <div className="absolute right-0 top-full mt-1 z-50 w-56 py-1 glass-prominent rounded-xl shadow-xl" onClick={e => e.stopPropagation()}>
                {/* Contact detail header — the email / phone / role / program that
                    used to over-stack the name cell now live here (still in the
                    detail panel too). */}
                <RowContactHeader coach={coach} />
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
                {manualTemplateArmed && onOpenInGmail && coach.email && (
                  <Button variant="ghost"
                    onClick={e => { e.stopPropagation(); onOpenInGmail(coach); onOpenAction(null); }}
                    className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-2"
                  >
                    {gmailDirectSend
                      ? <><IconMail size={16} className="text-primary-500" /> Send via Gmail</>
                      : <><IconExternalLink size={16} className="text-primary-500" /> Open in Gmail</>}
                  </Button>
                )}
                {coach.phone && (
                  <a
                    href={`tel:${coach.phone}`}
                    onClick={() => onOpenAction(null)}
                    className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-2"
                  >
                    <IconPhone size={16} className="text-warm-400" /> Call
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
                    <div className="absolute left-full top-0 ml-1 z-50 w-36 py-1 glass-prominent rounded-xl shadow-xl">
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

                {/* Assign submenu — work-division labels (Nick/Ben/Leah) */}
                <AssigneeSubmenu
                  coach={coach}
                  isOpen={isAssigneeOpen}
                  onToggle={() => onOpenAssignee(isAssigneeOpen ? null : coach.id)}
                  onCloseMenu={() => { onOpenAction(null); onOpenAssignee(null); }}
                  onAssigneeChange={onAssigneeChange}
                  flyoutSide="left"
                />
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
      prev.isAssigneeOpen === next.isAssigneeOpen &&
      prev.statusConfig === next.statusConfig &&
      prev.priorityConfig === next.priorityConfig &&
      prev.engagement === next.engagement &&
      prev.segments === next.segments &&
      prev.density === next.density &&
      prev.manualTemplateArmed === next.manualTemplateArmed &&
      prev.gmailDirectSend === next.gmailDirectSend &&
      prev.onOpenInGmail === next.onOpenInGmail &&
      prev.onClick === next.onClick &&
      prev.onToggleSelect === next.onToggleSelect &&
      prev.onToggleStar === next.onToggleStar &&
      prev.onStatusChange === next.onStatusChange &&
      prev.onPriorityChange === next.onPriorityChange &&
      prev.onAssigneeChange === next.onAssigneeChange &&
      prev.onLogContact === next.onLogContact &&
      prev.onOpenStatus === next.onOpenStatus &&
      prev.onOpenAction === next.onOpenAction &&
      prev.onOpenPriority === next.onOpenPriority &&
      prev.onOpenAssignee === next.onOpenAssignee
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
    isAssigneeOpen,
    onClick,
    onToggleSelect,
    onToggleStar,
    onStatusChange,
    onPriorityChange,
    onAssigneeChange,
    onLogContact,
    onOpenStatus,
    onOpenAction,
    onOpenPriority,
    onOpenAssignee,
    statusConfig,
    priorityConfig,
    engagement,
    enrollment,
    segments,
    onOpenInGmail,
    manualTemplateArmed,
    gmailDirectSend,
  }: CoachTableRowProps) {
    const handleCardClick = () => onClick(coach);
    const handleCheckbox = () => onToggleSelect(coach.id);
    const handleStar = () => onToggleStar(coach.id, coach.is_starred);

    return (
      <Button
        variant="ghost"
        type="button"
        haptic="none"
        className={cn(
          'flex flex-col items-stretch justify-start rounded-none min-h-0',
          'cursor-pointer group transition-colors duration-150 px-4 py-3.5 w-full text-left',
          isSelected && 'bg-primary-50/50',
          !isSelected && isFocused && 'bg-cream-100',
          !isSelected && !isFocused && 'hover:bg-cream-100',
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
            {/* Name + division chip (+ primary marker). The over-stacked
                email/phone/role moved into this card's action menu + detail panel. */}
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-sm font-medium text-warm-900 leading-tight truncate">{coach.name}</p>
              <span className={cn(
                'shrink-0 text-micro font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                coach.division === 'D2' ? 'bg-blue-100 text-blue-700' : 'bg-primary-100 text-primary-700',
              )}>
                {coach.division}
              </span>
              {coach.is_primary_contact && (
                <span className="shrink-0 text-micro font-bold px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 border border-primary-200/60">★</span>
              )}
              {coach.assigned_to && <AssigneeChip assignee={coach.assigned_to} />}
            </div>
            {coachSecondaryLine(coach) && (
              <p className="text-label text-warm-400 truncate">{coachSecondaryLine(coach)}</p>
            )}
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
                <div className="absolute right-0 top-full mt-1 z-50 w-56 py-1 glass-prominent rounded-xl shadow-xl" onClick={e => e.stopPropagation()}>
                  {/* Contact detail header — email / phone / role / program. */}
                  <RowContactHeader coach={coach} />
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
                  {manualTemplateArmed && onOpenInGmail && coach.email && (
                    <Button variant="ghost"
                      onClick={e => { e.stopPropagation(); onOpenInGmail(coach); onOpenAction(null); }}
                      className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-2"
                    >
                      {gmailDirectSend
                        ? <><IconMail size={16} className="text-primary-500" /> Send via Gmail</>
                        : <><IconExternalLink size={16} className="text-primary-500" /> Open in Gmail</>}
                    </Button>
                  )}
                  {coach.phone && (
                    <a
                      href={`tel:${coach.phone}`}
                      onClick={() => onOpenAction(null)}
                      className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-2"
                    >
                      <IconPhone size={16} className="text-warm-400" /> Call
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
                      <div className="absolute right-full top-0 mr-1 z-50 w-36 py-1 glass-prominent rounded-xl shadow-xl">
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

                  {/* Assign submenu — work-division labels (Nick/Ben/Leah) */}
                  <AssigneeSubmenu
                    coach={coach}
                    isOpen={isAssigneeOpen}
                    onToggle={() => onOpenAssignee(isAssigneeOpen ? null : coach.id)}
                    onCloseMenu={() => { onOpenAction(null); onOpenAssignee(null); }}
                    onAssigneeChange={onAssigneeChange}
                    flyoutSide="right"
                  />
                </div>
              )}
            </div>

            {/* Chevron — affordance that tapping the card opens the detail panel */}
            <IconChevronRight size={16} className="text-warm-300 shrink-0" aria-hidden="true" />
          </div>
        </div>

        {/* Meta row: interactive status chip + the primary engagement signal,
            then the outreach-queue / email-status / priority badges. Wraps
            gracefully on narrow phones; conference + contact details live in the
            action menu / detail panel to keep the card uncluttered. */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only wrapper prevents card click while interacting with meta chips/dropdowns */}
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-7" onClick={e => e.stopPropagation()}>
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
              <div className="absolute z-50 mt-1 py-1 min-w-[160px] max-h-[320px] overflow-y-auto glass-prominent rounded-xl shadow-xl" onClick={e => e.stopPropagation()}>
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

          {/* The ONE primary signal on the card */}
          <EngagementBadge coachId={coach.id} engagement={engagement} size="sm" />

          {/* Outreach-queue status */}
          <SequenceEnrollmentBadge summary={enrollment} />

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
      </Button>
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
      prev.isAssigneeOpen === next.isAssigneeOpen &&
      prev.statusConfig === next.statusConfig &&
      prev.priorityConfig === next.priorityConfig &&
      prev.engagement === next.engagement &&
      prev.segments === next.segments &&
      prev.manualTemplateArmed === next.manualTemplateArmed &&
      prev.gmailDirectSend === next.gmailDirectSend &&
      prev.onOpenInGmail === next.onOpenInGmail &&
      prev.onClick === next.onClick &&
      prev.onToggleSelect === next.onToggleSelect &&
      prev.onToggleStar === next.onToggleStar &&
      prev.onStatusChange === next.onStatusChange &&
      prev.onPriorityChange === next.onPriorityChange &&
      prev.onAssigneeChange === next.onAssigneeChange &&
      prev.onLogContact === next.onLogContact &&
      prev.onOpenStatus === next.onOpenStatus &&
      prev.onOpenAction === next.onOpenAction &&
      prev.onOpenPriority === next.onOpenPriority &&
      prev.onOpenAssignee === next.onOpenAssignee
    );
  },
);

// ============================================================================
// SCHOOL GROUP VIEW
// ============================================================================
// Groups coaches by school, ordered within each group: head_coach first, then
// by program (mens → womens → both), then alphabetically. Mirrors the
// ConferenceGroupView expand/collapse + group-checkbox UX.
// ============================================================================
const HEAD_ROLE_ORDER: Record<string, number> = {
  head_coach: 0,
  associate_head_coach: 1,
  director: 2,
  assistant_coach: 3,
  volunteer: 4,
};

const PROGRAM_ORDER: Record<string, number> = {
  mens: 0,
  womens: 1,
  both: 2,
};

interface SchoolGroup {
  school: string;
  coaches: Coach[];
  division: string;
  count: number;
}

interface SchoolGroupViewProps {
  coaches: Coach[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onCoachClick: (coach: Coach) => void;
  statusConfig: StatusConfig;
  manualTemplateArmed?: boolean;
  getGmailHref?: (coach: Coach) => string | null;
  onGmailTouch?: (coach: Coach) => void;
  // Direct Gmail-API send — the school header button SENDS instead of opening
  // a compose tab (a <button> calling onGmailTouch, no href).
  gmailDirectSend?: boolean;
}

// A decision-maker target for outreach — never an assistant/volunteer (mirrors
// the Today-queue rule). Head / director / associate head, or an explicit
// primary contact, qualify.
function isDecisionMaker(c: Coach): boolean {
  const r = (c.role_level ?? '').toLowerCase();
  if (r === 'assistant_coach' || r === 'volunteer') return false;
  if (r === 'head_coach' || r === 'director' || r === 'associate_head_coach') return true;
  return c.is_primary_contact === true;
}

// The school's target for the group-level Gmail button: the head/primary
// decision-maker who is still an actionable NEW LEAD with an email (groups are
// sorted head-first; the explicit primary contact wins). Returns null once that
// contact has been emailed (status flips off 'new_lead') — so the button
// disappears after you hit Gmail rather than falling back to an assistant.
function schoolGmailTarget(coaches: Coach[]): Coach | null {
  const eligible = coaches.filter(
    (c) => c.email && c.status === 'new_lead' && isDecisionMaker(c),
  );
  return eligible.find((c) => c.is_primary_contact) ?? eligible[0] ?? null;
}

function SchoolGroupView({
  coaches,
  selectedIds,
  onSelectionChange,
  onCoachClick,
  statusConfig,
  manualTemplateArmed,
  getGmailHref,
  onGmailTouch,
  gmailDirectSend = false,
}: SchoolGroupViewProps) {
  const [expandedSchools, setExpandedSchools] = useState<Set<string>>(new Set());

  const schoolGroups = useMemo((): SchoolGroup[] => {
    const groups: Record<string, Coach[]> = {};
    coaches.forEach(coach => {
      if (!groups[coach.school]) groups[coach.school] = [];
      groups[coach.school]!.push(coach);
    });

    return Object.entries(groups)
      .map(([school, groupCoaches]) => ({
        school,
        division: groupCoaches[0]?.division ?? 'D3',
        count: groupCoaches.length,
        coaches: [...groupCoaches].sort((a, b) => {
          // head-most role first
          const aRole = HEAD_ROLE_ORDER[a.role_level ?? ''] ?? 5;
          const bRole = HEAD_ROLE_ORDER[b.role_level ?? ''] ?? 5;
          if (aRole !== bRole) return aRole - bRole;
          // then by program
          const aProg = PROGRAM_ORDER[a.program] ?? 3;
          const bProg = PROGRAM_ORDER[b.program] ?? 3;
          if (aProg !== bProg) return aProg - bProg;
          return a.name.localeCompare(b.name);
        }),
      }))
      .sort((a, b) => b.count - a.count);
  }, [coaches]);

  const toggleSchool = (school: string) => {
    setExpandedSchools(prev => {
      const next = new Set(prev);
      if (next.has(school)) next.delete(school); else next.add(school);
      return next;
    });
  };

  const expandAll = () => setExpandedSchools(new Set(schoolGroups.map(g => g.school)));
  const collapseAll = () => setExpandedSchools(new Set());

  const allFilteredSelected = coaches.length > 0 && coaches.every(c => selectedIds.has(c.id));
  const toggleSelectAllFiltered = () => {
    onSelectionChange(allFilteredSelected ? new Set() : new Set(coaches.map(c => c.id)));
  };

  const toggleGroupSelection = (group: SchoolGroup) => {
    const allSelected = group.coaches.every(c => selectedIds.has(c.id));
    const next = new Set(selectedIds);
    if (allSelected) {
      group.coaches.forEach(c => next.delete(c.id));
    } else {
      group.coaches.forEach(c => next.add(c.id));
    }
    onSelectionChange(next);
  };

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm text-warm-500">
          <span className="font-semibold text-warm-700">{schoolGroups.length}</span> schools &middot;{' '}
          <span className="font-semibold text-warm-700">{coaches.length}</span> coaches
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" type="button" onClick={toggleSelectAllFiltered}
            className={cn('px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30',
              allFilteredSelected ? 'text-primary-700 bg-primary-50 hover:bg-primary-100' : 'text-primary-700 hover:bg-primary-50'
            )}>
            {allFilteredSelected ? 'Clear selection' : `Select all ${coaches.length}`}
          </Button>
          <Button variant="ghost" type="button" onClick={expandAll}
            className="px-3 py-1.5 text-xs font-medium text-warm-600 hover:text-warm-800 hover:bg-warm-50 active:bg-warm-100 rounded-lg transition-colors">
            Expand All
          </Button>
          <Button variant="ghost" type="button" onClick={collapseAll}
            className="px-3 py-1.5 text-xs font-medium text-warm-600 hover:text-warm-800 hover:bg-warm-50 active:bg-warm-100 rounded-lg transition-colors">
            Collapse All
          </Button>
        </div>
      </div>

      {schoolGroups.map((group) => {
        const isExpanded = expandedSchools.has(group.school);
        const allSelected = group.coaches.every(c => selectedIds.has(c.id));
        const someSelected = group.coaches.some(c => selectedIds.has(c.id));
        const panelId = `school-panel-${group.school.replace(/\s+/g, '-')}`;

        return (
          <div key={group.school} className="glass-standard rounded-2xl shadow-glass overflow-clip">
            {/* School Header */}
            <div className="flex items-center gap-3 p-4">
              <input
                type="checkbox"
                aria-label={`Select all coaches at ${group.school}`}
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={() => toggleGroupSelection(group)}
                className="w-4 h-4 rounded-lg border-warm-300 text-primary-600 focus:ring-primary-500/20 cursor-pointer"
              />
              <Button variant="ghost" type="button"
                onClick={() => toggleSchool(group.school)}
                aria-expanded={isExpanded}
                aria-controls={panelId}
                className="flex-1 min-w-0 flex items-center gap-3 -m-2 p-2 rounded-lg hover:bg-warm-50/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 transition-colors text-left"
              >
                <span className="text-warm-400 flex-shrink-0" aria-hidden="true">
                  {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                </span>
                <span className="flex-1 min-w-0 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-warm-900 truncate">{group.school}</h3>
                  <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-warm-100 text-label font-bold text-warm-600 tabular-nums">
                    {group.count}
                  </span>
                </span>
                <span className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                  <span className={cn(
                    'px-2 py-0.5 rounded-lg text-micro font-bold tabular-nums',
                    group.division === 'D2' ? 'bg-blue-50 text-blue-700' : 'bg-primary-50 text-primary-700'
                  )}>
                    {group.division}
                  </span>
                </span>
              </Button>

              {/* Group-level Gmail action — emails the school's primary/head
                  contact. Compose mode: a real <a href> (opens reliably under
                  automation; the click logs the touch). Direct mode: a <button>
                  that SENDS straight through the Gmail API. */}
              {(() => {
                if (!manualTemplateArmed || !getGmailHref) return null;
                const main = schoolGmailTarget(group.coaches);
                if (!main) return null;
                const roleLabel = main.is_primary_contact
                  ? 'primary contact'
                  : main.role_level === 'head_coach'
                    ? 'head coach'
                    : 'main contact';
                if (gmailDirectSend) {
                  return (
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onGmailTouch?.(main); }}
                      aria-label={`Send Gmail to ${main.name} (${roleLabel}) at ${group.school}`}
                      title={`Send to ${main.name} — ${roleLabel}`}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
                    >
                      <IconSend size={13} aria-hidden="true" /> Send
                    </Button>
                  );
                }
                const href = getGmailHref(main);
                if (!href) return null;
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => { e.stopPropagation(); onGmailTouch?.(main); }}
                    aria-label={`Open Gmail to ${main.name} (${roleLabel}) at ${group.school}`}
                    title={`Email ${main.name} — ${roleLabel}`}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
                  >
                    <IconMail size={13} aria-hidden="true" /> Gmail
                  </a>
                );
              })()}
            </div>

            {/* Expanded Coach List */}
            {isExpanded && (
              <div id={panelId} role="region" aria-label={`${group.school} coaches`} className="border-t border-warm-100/50">
                <table className="w-full table-fixed">
                  <thead>
                    <tr className="border-b border-warm-100/30">
                      <th className="w-10 px-4 py-2" />
                      <th className="text-left px-4 py-2 text-micro font-semibold text-warm-500 uppercase tracking-wider">Coach</th>
                      <th className="text-left px-4 py-2 text-micro font-semibold text-warm-500 uppercase tracking-wider w-28">Role</th>
                      <th className="text-left px-4 py-2 text-micro font-semibold text-warm-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.coaches.map(coach => {
                      const isSelected = selectedIds.has(coach.id);
                      const roleLabel = coach.role_level ? (ROLE_LABELS[coach.role_level] ?? coach.role_level) : '—';
                      const programLabel = PROGRAM_LABELS[coach.program] ?? '';
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
                                if (next.has(coach.id)) next.delete(coach.id); else next.add(coach.id);
                                onSelectionChange(next);
                              }}
                              className="w-4 h-4 rounded-lg border-warm-300 text-primary-600 focus:ring-primary-500/20 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="text-sm font-medium text-warm-900 truncate">{coach.name}</p>
                            {coach.email && <p className="text-xs text-warm-400 truncate">{coach.email}</p>}
                            <p className={cn(
                              'text-micro tabular-nums',
                              !coach.last_contacted_at ? 'text-red-500 font-medium' : 'text-warm-400',
                            )}>
                              Last contacted: {formatRelativeDate(coach.last_contacted_at)}
                            </p>
                            {coach.is_primary_contact && (
                              <span className="text-micro font-bold px-1 py-0.5 rounded bg-primary-50 text-primary-700 border border-primary-200/60">★ Primary</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1">
                              <span className="text-micro font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-warm-100 text-warm-600">{roleLabel}</span>
                              {programLabel && (
                                <span className="text-micro font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{programLabel}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-micro font-medium',
                              statusConfig[coach.status]?.bgColor,
                              statusConfig[coach.status]?.color,
                            )}>
                              {statusConfig[coach.status]?.icon}
                              <span>{statusConfig[coach.status]?.label}</span>
                            </span>
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
  onAssigneeChange,
  onToggleStar,
  onCoachClick,
  onLogContact,
  onImport,
  onAddCoach,
  statusConfig,
  priorityConfig,
  coachEngagement,
  coachEnrollments,
  coachSegments,
  onOpenInGmail,
  manualTemplateArmed,
  getGmailHref,
  onGmailTouch,
  gmailDirectSend = false,
}: CoachTableProps) {
  const [openStatusDropdown, setOpenStatusDropdown] = useState<string | null>(null);
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  const [openPrioritySubmenu, setOpenPrioritySubmenu] = useState<string | null>(null);
  const [openAssigneeSubmenu, setOpenAssigneeSubmenu] = useState<string | null>(null);
  // Local optimistic assignee overrides — only used when the parent does NOT
  // pass onAssigneeChange (i.e. it isn't managing the chip itself). Keyed by
  // coach.id; the value (label or null) wins over coach.assigned_to for display.
  const [assigneeOverrides, setAssigneeOverrides] = useState<Record<string, string | null>>({});
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [groupBySchool, setGroupBySchool] = useState(false);
  // Row density: Comfortable (default) vs Compact (~2x rows per screen). Local
  // presentational state only — does not alter data, selection, or callbacks.
  const [density, setDensity] = useState<Density>('comfortable');
  // focusedIndex is only set by keyboard nav (j/k) — NOT on mouse hover.
  // Hover state is now pure CSS (`hover:bg-cream-100` on the row) which
  // avoids re-rendering the table on every mouse traversal.
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  useEffect(() => { setPage(1); }, [coaches.length]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!openStatusDropdown && !openActionMenu) return;
    const handler = () => { setOpenStatusDropdown(null); setOpenActionMenu(null); setOpenPrioritySubmenu(null); setOpenAssigneeSubmenu(null); };
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
      setOpenAssigneeSubmenu(null);
    }
  }, []);
  const handleOpenPriority = useCallback((id: string | null) => {
    setOpenPrioritySubmenu(id);
    if (id !== null) setOpenAssigneeSubmenu(null);
  }, []);
  const handleOpenAssignee = useCallback((id: string | null) => {
    setOpenAssigneeSubmenu(id);
    if (id !== null) setOpenPrioritySubmenu(null);
  }, []);

  // Optimistic assignee update. If the parent owns the data it gets the call and
  // updates its own list; otherwise we record a local override so the chip
  // reflects the change immediately. The server write happens in AssigneeSubmenu.
  const handleAssigneeChange = useCallback((coachId: string, assignee: string | null) => {
    if (onAssigneeChange) {
      onAssigneeChange(coachId, assignee);
    } else {
      setAssigneeOverrides(prev => ({ ...prev, [coachId]: assignee }));
    }
  }, [onAssigneeChange]);

  // Apply any local override on top of the incoming coach so the row/card and
  // its action menu render the optimistic assignee. No-op when the parent owns
  // the data (no overrides are ever written in that path).
  const coachWithAssignee = useCallback((coach: Coach): Coach => {
    if (!(coach.id in assigneeOverrides)) return coach;
    const override = assigneeOverrides[coach.id] ?? null;
    if (override === coach.assigned_to) return coach;
    return { ...coach, assigned_to: override };
  }, [assigneeOverrides]);

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
      case 'Escape': setFocusedIndex(null); setOpenStatusDropdown(null); setOpenActionMenu(null); setOpenPrioritySubmenu(null); setOpenAssigneeSubmenu(null); break;
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

  // Select-all-across-pages (Gmail style). The header checkbox only toggles the
  // current page; this selects every coach matching the active filter/search so
  // you can bulk-email the whole filtered set, not just one page.
  const pageAllSelected = paginatedCoaches.length > 0 && paginatedCoaches.every(c => selectedIds.has(c.id));
  const allFilteredSelected = sortedCoaches.length > 0 && sortedCoaches.every(c => selectedIds.has(c.id));
  const selectAllFiltered = () => {
    const next = new Set(selectedIds);
    sortedCoaches.forEach(c => next.add(c.id));
    onSelectionChange(next);
  };
  const clearSelection = () => onSelectionChange(new Set());

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
          <IconUsers size={24} className="text-warm-300" />
        </div>
        <h3 className="text-base font-semibold text-warm-700 mb-1">No coaches found</h3>
        <p className="text-sm text-warm-500 max-w-xs mx-auto mb-6">Try adjusting your filters or import some coaches to get started.</p>
        <div className="flex items-center justify-center gap-3">
          {onImport && (
            <Button variant="ghost"
              onClick={onImport}
              className="flex items-center gap-2 px-4 py-2.5 bg-cream-50 border border-warm-200/50 text-warm-700 rounded-xl font-medium hover:bg-warm-50 active:bg-warm-100 transition-colors text-sm"
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

  // Group-by-school mode — render SchoolGroupView in place of the table
  if (groupBySchool) {
    return (
      <div className="p-4 space-y-3">
        {/* Grouping toggle */}
        <div className="flex justify-end">
          <Button variant="ghost" type="button"
            onClick={() => setGroupBySchool(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border bg-primary-50 border-primary-200 text-primary-700 hover:bg-primary-100 transition-colors"
          >
            <IconX size={13} aria-hidden="true" /> Exit School View
          </Button>
        </div>
        <SchoolGroupView
          coaches={coaches}
          selectedIds={selectedIds}
          onSelectionChange={onSelectionChange}
          onCoachClick={onCoachClick}
          statusConfig={statusConfig}
          manualTemplateArmed={manualTemplateArmed}
          getGmailHref={getGmailHref}
          onGmailTouch={onGmailTouch}
          gmailDirectSend={gmailDirectSend}
        />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Toolbar — density toggle + group-by-school, above the select-all banner */}
      <div className="flex items-center justify-end gap-2 px-4 pt-3 pb-1">
        {/* Density toggle (Comfortable / Compact) — desktop table only; the
            mobile card layout is fixed. */}
        <div className="hidden md:inline-flex items-center rounded-full glass-subtle p-0.5" role="group" aria-label="Row density">
          <Button variant="ghost" type="button"
            onClick={() => setDensity('comfortable')}
            aria-pressed={density === 'comfortable'}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
              density === 'comfortable' ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200' : 'text-warm-500 hover:text-warm-700',
            )}
          >
            Comfortable
          </Button>
          <Button variant="ghost" type="button"
            onClick={() => setDensity('compact')}
            aria-pressed={density === 'compact'}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
              density === 'compact' ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200' : 'text-warm-500 hover:text-warm-700',
            )}
          >
            Compact
          </Button>
        </div>
        <Button variant="ghost" type="button"
          onClick={() => setGroupBySchool(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium glass-subtle text-warm-600 hover:bg-warm-50 active:bg-warm-100 transition-colors"
        >
          <IconSchool size={13} aria-hidden="true" /> Group by School
        </Button>
      </div>

      {/* Select-all-filtered banner — act on every coach matching the current
          filter/search, not just the current page. Feeds the bulk Email action. */}
      {pageAllSelected && sortedCoaches.length > paginatedCoaches.length && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2 bg-primary-50/70 border-b border-primary-100 text-sm text-primary-800">
          {allFilteredSelected ? (
            <>
              <span>All <strong className="tabular-nums">{sortedCoaches.length}</strong> coaches matching this filter are selected.</span>
              <Button variant="ghost" onClick={clearSelection} className="px-2 py-0.5 rounded-lg font-semibold text-primary-700 hover:bg-primary-100 transition-colors">
                Clear selection
              </Button>
            </>
          ) : (
            <>
              <span><strong className="tabular-nums">{paginatedCoaches.length}</strong> on this page selected.</span>
              <Button variant="ghost" onClick={selectAllFiltered} className="px-2 py-0.5 rounded-lg font-semibold text-primary-700 hover:bg-primary-100 transition-colors">
                Select all {sortedCoaches.length} coaches
              </Button>
            </>
          )}
        </div>
      )}

      {/* Desktop table — hidden on <md. Tiered columns keep it within the
          viewport (no horizontal scroll at 1440px): table-fixed + w-full means
          columns compress + truncate rather than overflowing. Heavy columns are
          gated to lg/xl so the laptop view stays uncramped. */}
      <table className="hidden md:table w-full table-fixed">
        <thead>
          <tr className="border-b border-warm-100 bg-warm-50/50">
            {/* Checkbox — always */}
            <th className={cn('w-10 px-4', DENSITY_EDGE_PADDING[density])}>
              <input type="checkbox" checked={paginatedCoaches.length > 0 && paginatedCoaches.every(c => selectedIds.has(c.id))} onChange={toggleAll}
                className="w-4 h-4 rounded-md border-warm-300 text-primary-600 focus:ring-primary-500/20 cursor-pointer" />
            </th>
            {/* Star — always */}
            <th className={cn('w-10 px-2', DENSITY_EDGE_PADDING[density])} />
            {/* Coach (name + school·title + division chip) — always */}
            <TH field="name" label="Coach" onSort={handleSort} padding={DENSITY_CELL_PADDING[density]}><SortArrow field="name" /></TH>
            {/* Engagement — lg+ */}
            <th className={cn('hidden lg:table-cell text-left text-xs font-medium text-warm-500 uppercase tracking-wide w-24', DENSITY_CELL_PADDING[density])}>Engagement</th>
            {/* Status — always */}
            <TH field="status" label="Status" onSort={handleSort} padding={DENSITY_CELL_PADDING[density]}><SortArrow field="status" /></TH>
            {/* Email — xl+ */}
            <th className={cn('hidden xl:table-cell text-left text-xs font-medium text-warm-500 uppercase tracking-wide w-24', DENSITY_CELL_PADDING[density])}>Email</th>
            {/* Priority — xl+ */}
            <TH field="priority" label="Priority" onSort={handleSort} padding={DENSITY_CELL_PADDING[density]} className="hidden xl:table-cell w-20"><SortArrow field="priority" /></TH>
            {/* Conference — xl+ */}
            <TH field="conference" label="Conference" onSort={handleSort} padding={DENSITY_CELL_PADDING[density]} className="hidden xl:table-cell"><SortArrow field="conference" /></TH>
            {/* Last Contact — md+ (matches the cell), right-aligned numeric */}
            <TH field="last_contacted_at" label="Last Contact" onSort={handleSort} padding={DENSITY_CELL_PADDING[density]} className="hidden md:table-cell !text-right"><SortArrow field="last_contacted_at" /></TH>
            {/* Segments — xl+. Stream C owns. */}
            <th className={cn('hidden xl:table-cell text-left text-xs font-medium text-warm-500 uppercase tracking-wide w-[180px]', DENSITY_CELL_PADDING[density])}>Segments</th>
            {/* Actions — always */}
            <th className={cn('w-12 px-4', DENSITY_EDGE_PADDING[density])} />
          </tr>
        </thead>
        <tbody>
          {paginatedCoaches.map((coach, index) => (
            <CoachTableRow
              key={coach.id}
              coach={coachWithAssignee(coach)}
              isSelected={selectedIds.has(coach.id)}
              isFocused={focusedIndex === index}
              isStatusOpen={openStatusDropdown === coach.id}
              isActionOpen={openActionMenu === coach.id}
              isPriorityOpen={openPrioritySubmenu === coach.id}
              isAssigneeOpen={openAssigneeSubmenu === coach.id}
              onClick={onCoachClick}
              onToggleSelect={toggleSelection}
              onToggleStar={onToggleStar}
              onStatusChange={onStatusChange}
              onPriorityChange={onPriorityChange}
              onAssigneeChange={handleAssigneeChange}
              onLogContact={onLogContact}
              onOpenStatus={handleOpenStatus}
              onOpenAction={handleOpenAction}
              onOpenPriority={handleOpenPriority}
              onOpenAssignee={handleOpenAssignee}
              statusConfig={statusConfig}
              priorityConfig={priorityConfig}
              engagement={coachEngagement?.[coach.id]}
              enrollment={coachEnrollments?.[coach.id]}
              segments={coachSegments?.[coach.id]}
              density={density}
              onOpenInGmail={onOpenInGmail}
              manualTemplateArmed={manualTemplateArmed}
              gmailDirectSend={gmailDirectSend}
            />
          ))}
        </tbody>
      </table>

      {/* Mobile card list — shown only on <md. One card per coach: name +
          division chip, the muted school·title line, an interactive status chip,
          the primary engagement signal, and a chevron affordance. Selection
          checkbox, star toggle, and the full action menu (which surfaces
          email / phone / role / priority + last-contact + segments) are all
          preserved — tapping the card opens the detail panel. */}
      <div className="md:hidden divide-y divide-warm-50">
        {paginatedCoaches.map((coach, index) => (
          <CoachTableCard
            key={coach.id}
            coach={coachWithAssignee(coach)}
            isSelected={selectedIds.has(coach.id)}
            isFocused={focusedIndex === index}
            isStatusOpen={openStatusDropdown === coach.id}
            isActionOpen={openActionMenu === coach.id}
            isPriorityOpen={openPrioritySubmenu === coach.id}
            isAssigneeOpen={openAssigneeSubmenu === coach.id}
            onClick={onCoachClick}
            onToggleSelect={toggleSelection}
            onToggleStar={onToggleStar}
            onStatusChange={onStatusChange}
            onPriorityChange={onPriorityChange}
            onAssigneeChange={handleAssigneeChange}
            onLogContact={onLogContact}
            onOpenStatus={handleOpenStatus}
            onOpenAction={handleOpenAction}
            onOpenPriority={handleOpenPriority}
            onOpenAssignee={handleOpenAssignee}
            statusConfig={statusConfig}
            priorityConfig={priorityConfig}
            engagement={coachEngagement?.[coach.id]}
            enrollment={coachEnrollments?.[coach.id]}
            segments={coachSegments?.[coach.id]}
            density={density}
            onOpenInGmail={onOpenInGmail}
            manualTemplateArmed={manualTemplateArmed}
            gmailDirectSend={gmailDirectSend}
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
            <NativeSelect
              value={String(pageSize)}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              options={PAGE_SIZES.map(s => ({ value: String(s), label: `${s}/page` }))}
              className="min-h-0 text-sm px-2.5 py-1.5 rounded-lg bg-cream-50/85 border-warm-200/60 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-300 transition-all duration-200"
            />
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
function TH({ field, label, onSort, children, className, padding = 'px-4 py-3' }: {
  field: SortField; label: string; onSort: (f: SortField) => void; children: React.ReactNode; className?: string; padding?: string;
}) {
  return (
    <th
      className={cn('text-left text-xs font-medium text-warm-500 uppercase tracking-wide cursor-pointer hover:text-warm-700 transition-colors', padding, className)}
      onClick={() => onSort(field)}
    >
      {label}{children}
    </th>
  );
}

function PaginationButton({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <Button variant="ghost" onClick={onClick} disabled={disabled}
      className="px-2 py-1 rounded-lg hover:bg-cream-100 disabled:opacity-40 text-sm font-medium transition-colors">
      {children}
    </Button>
  );
}
