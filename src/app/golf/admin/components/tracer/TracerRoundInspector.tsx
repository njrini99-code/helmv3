'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  IconSearch,
  IconCheckCircle2,
  IconWarning,
  IconClock,
  IconCircleDot,
  IconChevronDown,
  IconChevronRight,
  IconShieldAlert,
  IconXCircle,
} from '@/components/icons';
import { IconFilter as Filter, IconStethoscope as Stethoscope, IconArrowUpDown as ArrowUpDown } from '@/components/icons';
import { timeAgo, formatDate } from '../admin-utils';
import type { FlatRound, TracerIncident } from './tracer-types';
import { Button } from '@/components/ui/button';

// ============================================================================
// TYPES
// ============================================================================

interface TracerRoundInspectorProps {
  rounds: FlatRound[];
  onDiagnose: (roundId: string) => void;
}

type SortKey = 'priority' | 'player' | 'course' | 'date' | 'submitted' | 'score' | 'status' | 'holes' | 'issues';
type StatusFilter = 'all' | 'completed' | 'in_progress' | 'draft';

// ============================================================================
// HELPERS
// ============================================================================

function isStuckRound(round: FlatRound): boolean {
  return (
    round.status === 'in_progress' &&
    !!round.updated_at &&
    Date.now() - new Date(round.updated_at).getTime() > 1 * 60 * 60 * 1000
  );
}

function getChecks(round: FlatRound) {
  const isComplete = round.status === 'completed';
  const isInProgress = round.status === 'in_progress';
  const stuck = isStuckRound(round);

  return [
    { label: 'Holes Recorded', ok: round.actual_holes > 0, detail: `${round.actual_holes}/${round.expected_holes}` },
    { label: 'Shots Recorded', ok: round.total_shots > 0, detail: `${round.total_shots}` },
    {
      label: 'Status',
      ok: isComplete,
      detail: isComplete ? 'Submitted' : stuck ? `Stuck (${Math.round((Date.now() - new Date(round.updated_at!).getTime()) / 3600000)}h)` : isInProgress ? 'In Progress' : 'Draft',
    },
    { label: 'Putts', ok: round.has_putts, detail: round.has_putts ? 'Yes' : 'No' },
    { label: 'Fairways', ok: round.has_fairways, detail: round.has_fairways ? 'Yes' : 'No' },
    { label: 'GIR', ok: round.has_gir, detail: round.has_gir ? 'Yes' : 'No' },
    { label: 'Putt Details', ok: round.putt_details_count > 0, detail: `${round.putt_details_count}` },
    { label: 'Approach Details', ok: round.approach_details_count > 0, detail: `${round.approach_details_count}` },
    { label: 'Stats Cached', ok: round.stats_cached, detail: round.stats_cached ? 'Yes' : 'No' },
    { label: 'Strokes Gained', ok: round.has_strokes_gained, detail: round.has_strokes_gained ? 'Yes' : 'No' },
  ];
}

function getIssueCount(round: FlatRound): number {
  return round.errors.length;
}

function computePriority(round: FlatRound): { level: 'critical' | 'high' | 'medium' | 'low'; score: number } {
  let score = 0;
  if (isStuckRound(round)) score += 40;
  if (round.errors.length > 0) score += 20 * round.errors.length;
  if (!round.stats_cached) score += 15;
  if (round.actual_holes < round.expected_holes) score += 10;

  const level = score >= 60 ? 'critical' : score >= 30 ? 'high' : score >= 10 ? 'medium' : 'low';
  return { level, score };
}

const PRIORITY_BADGE_STYLES: Record<'critical' | 'high' | 'medium' | 'low', string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-amber-100 text-amber-800 border-amber-200',
  medium: 'bg-blue-100 text-blue-800 border-blue-200',
  low: 'bg-warm-100 text-warm-600 border-warm-200',
};

const PRIORITY_LABELS: Record<'critical' | 'high' | 'medium' | 'low', string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]![0]?.toUpperCase() ?? '?';
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

function sortIndicator(active: boolean, asc: boolean) {
  if (!active) return <ArrowUpDown size={12} className="text-warm-300 opacity-0 group-hover/th:opacity-100 transition-opacity" />;
  return <span className="text-primary-600 font-bold text-eyebrow">{asc ? '\u2191' : '\u2193'}</span>;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TracerRoundInspector({ rounds, onDiagnose }: TracerRoundInspectorProps) {
  // Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [stuckOnly, setStuckOnly] = useState(false);
  const [hasErrorsOnly, setHasErrorsOnly] = useState(false);

  // Sort state — default to highest priority first
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [sortAsc, setSortAsc] = useState(false);

  // Expansion state
  const [expandedRound, setExpandedRound] = useState<string | null>(null);

  // Derived counts
  const stuckCount = useMemo(() => rounds.filter(isStuckRound).length, [rounds]);
  const errorCount = useMemo(() => rounds.filter((r) => r.errors.length > 0).length, [rounds]);

  // Filtered rounds
  const filteredRounds = useMemo(() => {
    let result = rounds;

    // Search
    if (search.trim()) {
      const term = search.toLowerCase().trim();
      result = result.filter(
        (r) =>
          r.player_name.toLowerCase().includes(term) ||
          (r.course_name && r.course_name.toLowerCase().includes(term))
      );
    }

    // Status
    if (statusFilter !== 'all') {
      result = result.filter((r) => r.status === statusFilter);
    }

    // Stuck only
    if (stuckOnly) {
      result = result.filter(isStuckRound);
    }

    // Has errors only
    if (hasErrorsOnly) {
      result = result.filter((r) => r.errors.length > 0);
    }

    return result;
  }, [rounds, search, statusFilter, stuckOnly, hasErrorsOnly]);

  // Sorted rounds
  const sortedRounds = useMemo(() => {
    return [...filteredRounds].sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      switch (sortKey) {
        case 'priority':
          return dir * (computePriority(a).score - computePriority(b).score);
        case 'player':
          return dir * a.player_name.localeCompare(b.player_name);
        case 'course':
          return dir * (a.course_name ?? '').localeCompare(b.course_name ?? '');
        case 'date':
          return dir * (a.round_date ?? '').localeCompare(b.round_date ?? '');
        case 'submitted':
          return dir * (a.updated_at ?? '').localeCompare(b.updated_at ?? '');
        case 'score':
          return dir * ((a.total_score ?? 999) - (b.total_score ?? 999));
        case 'status':
          return dir * a.status.localeCompare(b.status);
        case 'holes':
          return dir * (a.actual_holes - b.actual_holes);
        case 'issues':
          return dir * (getIssueCount(a) - getIssueCount(b));
        default:
          return 0;
      }
    });
  }, [filteredRounds, sortKey, sortAsc]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((prev) => !prev);
    else {
      setSortKey(key);
      setSortAsc(key === 'player' || key === 'course');
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Search */}
        <div className="relative w-full sm:w-auto sm:flex-1 min-w-0 sm:min-w-[200px]">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
          <input
            type="text"
            placeholder="Search player or course..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              'w-full pl-9 pr-4 py-2.5 rounded-xl text-sm',
              'bg-white/60 border border-white/30 text-warm-900 placeholder:text-warm-400',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-300',
              'transition-all duration-200'
            )}
          />
        </div>

        {/* Status dropdown */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={cn(
              'appearance-none pl-3 pr-8 py-2.5 rounded-xl text-sm font-medium',
              'bg-white/60 border border-white/30 text-warm-700',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-300',
              'transition-all duration-200 cursor-pointer'
            )}
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="in_progress">In Progress</option>
            <option value="draft">Draft</option>
          </select>
          <IconChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-warm-400 pointer-events-none" />
        </div>

        {/* Stuck only toggle */}
        <Button variant="ghost"
          onClick={() => setStuckOnly((prev) => !prev)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200',
            stuckOnly
              ? 'bg-amber-100 border border-amber-300 text-amber-800'
              : 'bg-white/60 border border-white/30 text-warm-500 hover:bg-white/80 hover:text-warm-700'
          )}
        >
          <IconClock size={14} />
          Stuck
          {stuckCount > 0 && (
            <span className={cn(
              'inline-flex items-center justify-center w-5 h-5 rounded-full text-eyebrow font-bold',
              stuckOnly ? 'bg-amber-200 text-amber-900' : 'bg-amber-100 text-amber-700'
            )}>
              {stuckCount}
            </span>
          )}
        </Button>

        {/* Has errors toggle */}
        <Button variant="danger"
          onClick={() => setHasErrorsOnly((prev) => !prev)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200',
            hasErrorsOnly
              ? 'bg-red-100 border border-red-300 text-red-800'
              : 'bg-white/60 border border-white/30 text-warm-500 hover:bg-white/80 hover:text-warm-700'
          )}
        >
          <IconWarning size={14} />
          Errors
          {errorCount > 0 && (
            <span className={cn(
              'inline-flex items-center justify-center w-5 h-5 rounded-full text-eyebrow font-bold',
              hasErrorsOnly ? 'bg-red-200 text-red-900' : 'bg-red-100 text-red-700'
            )}>
              {errorCount}
            </span>
          )}
        </Button>
      </div>

      {/* Summary Bar */}
      <p className="text-sm text-warm-500">
        Showing <span className="font-medium text-warm-700">{sortedRounds.length}</span> of{' '}
        <span className="font-medium text-warm-700">{rounds.length}</span> rounds
        {stuckCount > 0 && (
          <>
            {' '}&mdash;{' '}
            <span className="font-medium text-amber-600">{stuckCount} stuck</span>
          </>
        )}
        {errorCount > 0 && (
          <>
            {' '}&mdash;{' '}
            <span className="font-medium text-red-600">{errorCount} with errors</span>
          </>
        )}
      </p>

      {/* Table */}
      <div className="bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] overflow-hidden min-w-0">
        <div className="overflow-x-auto -mx-px">
          <table className="w-full text-sm min-w-[640px] sm:min-w-0">
            <thead>
              <tr className="border-b border-warm-100/80">
                <th className="w-10 px-3 py-3.5" />
                <SortableTh label="Priority" sortKey="priority" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                <SortableTh label="Player" sortKey="player" currentKey={sortKey} asc={sortAsc} onSort={handleSort} align="left" />
                <SortableTh label="Course" sortKey="course" currentKey={sortKey} asc={sortAsc} onSort={handleSort} align="left" className="hidden md:table-cell" />
                <SortableTh label="Date" sortKey="date" currentKey={sortKey} asc={sortAsc} onSort={handleSort} className="hidden sm:table-cell" />
                <SortableTh label="Submitted" sortKey="submitted" currentKey={sortKey} asc={sortAsc} onSort={handleSort} className="hidden lg:table-cell" />
                <SortableTh label="Score" sortKey="score" currentKey={sortKey} asc={sortAsc} onSort={handleSort} className="hidden sm:table-cell" />
                <SortableTh label="Status" sortKey="status" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                <SortableTh label="Holes" sortKey="holes" currentKey={sortKey} asc={sortAsc} onSort={handleSort} className="hidden md:table-cell" />
                <SortableTh label="Issues" sortKey="issues" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                <th className="px-4 py-3.5 font-medium text-eyebrow uppercase tracking-wider text-warm-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRounds.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center">
                    <Filter size={24} className="mx-auto mb-3 text-warm-300" />
                    <p className="text-warm-500 font-medium text-sm">No rounds match filters</p>
                    <p className="text-warm-400 text-xs mt-1">Try adjusting your search or filters</p>
                  </td>
                </tr>
              ) : (
                sortedRounds.map((round) => (
                  <RoundRow
                    key={round.round_id}
                    round={round}
                    isExpanded={expandedRound === round.round_id}
                    onToggle={() => setExpandedRound(expandedRound === round.round_id ? null : round.round_id)}
                    onDiagnose={() => onDiagnose(round.round_id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SORTABLE TABLE HEADER
// ============================================================================

function SortableTh({
  label,
  sortKey,
  currentKey,
  asc,
  onSort,
  align = 'center',
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  asc: boolean;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'center';
  className?: string;
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className={cn(
        'px-4 py-3.5 font-medium text-eyebrow uppercase tracking-wider cursor-pointer select-none group/th',
        'transition-colors hover:text-warm-700',
        active ? 'text-warm-700' : 'text-warm-400',
        align === 'left' && 'text-left',
        className
      )}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortIndicator(active, asc)}
      </span>
    </th>
  );
}

// ============================================================================
// ROUND ROW (EXPANDABLE)
// ============================================================================

function RoundRow({
  round,
  isExpanded,
  onToggle,
  onDiagnose,
}: {
  round: FlatRound;
  isExpanded: boolean;
  onToggle: () => void;
  onDiagnose: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const stuck = isStuckRound(round);
  const checks = getChecks(round);
  const issueCount = round.errors.length;
  const priority = computePriority(round);

  return (
    <>
      <tr
        className={cn(
          'border-b border-warm-50/80 cursor-pointer transition-colors',
          stuck && 'border-l-[3px] border-l-red-400 bg-red-50/20',
          isExpanded ? 'bg-warm-50/40' : 'hover:bg-white/50'
        )}
        onClick={onToggle}
      >
        {/* Expand chevron */}
        <td className="px-3 py-3.5">
          <div className={cn(
            'w-5 h-5 rounded-md flex items-center justify-center transition-colors',
            isExpanded ? 'bg-warm-200/50' : 'bg-transparent'
          )}>
            {isExpanded ? (
              <IconChevronDown size={14} className="text-warm-500" />
            ) : (
              <IconChevronRight size={14} className="text-warm-400" />
            )}
          </div>
        </td>

        {/* Priority */}
        <td className="px-4 py-3.5 text-center">
          <span className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-eyebrow font-semibold border',
            PRIORITY_BADGE_STYLES[priority.level]
          )}>
            {PRIORITY_LABELS[priority.level]}
          </span>
        </td>

        {/* Player */}
        <td className="px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0',
              issueCount > 0 ? 'bg-amber-50 text-amber-700' : 'bg-primary-50 text-primary-700'
            )}>
              {getInitials(round.player_name)}
            </div>
            <span className="font-medium text-warm-900 whitespace-nowrap">{round.player_name}</span>
          </div>
        </td>

        {/* Course */}
        <td className="hidden md:table-cell px-4 py-3.5 text-warm-600 max-w-[160px] truncate">
          {round.course_name || <span className="text-warm-300">&mdash;</span>}
        </td>

        {/* Date */}
        <td className="hidden sm:table-cell px-4 py-3.5 text-center text-warm-500 text-xs whitespace-nowrap">
          {round.round_date ? formatDate(round.round_date) : <span className="text-warm-300">&mdash;</span>}
        </td>

        {/* Submitted */}
        <td
          className="hidden lg:table-cell px-4 py-3.5 text-center text-warm-500 text-xs whitespace-nowrap"
          title={round.updated_at ? new Date(round.updated_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : undefined}
        >
          {round.updated_at ? timeAgo(round.updated_at) : <span className="text-warm-300">&mdash;</span>}
        </td>

        {/* Score */}
        <td className="hidden sm:table-cell px-4 py-3.5 text-center">
          {round.total_score != null ? (
            <span className="tabular-nums">
              <span className="font-bold text-warm-800">{round.total_score}</span>
              {round.score_to_par != null && (
                <span className={cn(
                  'ml-1 text-xs font-semibold',
                  round.score_to_par > 0 ? 'text-red-500' : round.score_to_par < 0 ? 'text-primary-600' : 'text-warm-400'
                )}>
                  {round.score_to_par > 0 ? '+' : ''}{round.score_to_par}
                </span>
              )}
            </span>
          ) : (
            <span className="text-warm-300">&mdash;</span>
          )}
        </td>

        {/* Status */}
        <td className="px-4 py-3.5 text-center">
          <StatusBadge status={round.status} stuck={stuck} currentHole={round.current_hole} expectedHoles={round.expected_holes} updatedAt={round.updated_at} />
        </td>

        {/* Holes */}
        <td className="hidden md:table-cell px-4 py-3.5 text-center tabular-nums text-warm-600">
          {round.status === 'in_progress' && round.current_hole ? (
            <span>
              <span className="font-semibold text-amber-700">{round.current_hole}</span>
              <span className="text-warm-400">/{round.expected_holes}</span>
            </span>
          ) : (
            <span>{round.actual_holes}/{round.expected_holes}</span>
          )}
        </td>

        {/* Issues */}
        <td className="px-4 py-3.5 text-center">
          {issueCount > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-eyebrow font-semibold bg-amber-50 text-amber-700">
              <IconWarning size={10} />
              {issueCount}
            </span>
          ) : round.status === 'completed' ? (
            <span className="inline-flex items-center gap-1 text-eyebrow font-semibold text-primary-600">
              <IconCheckCircle2 size={10} />
              Clear
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-eyebrow font-semibold text-warm-400">
              <IconCircleDot size={10} />
              Watching
            </span>
          )}
        </td>

        {/* Actions */}
        <td className="px-4 py-3.5 text-center">
          <Button variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onDiagnose();
            }}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              'border border-warm-200/60 text-warm-600',
              'hover:bg-white/80 hover:border-warm-300 hover:text-warm-800 hover:shadow-sm'
            )}
          >
            <Stethoscope size={12} />
            <span className="hidden sm:inline">Diagnose</span>
          </Button>
        </td>
      </tr>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <tr>
            <td colSpan={11} className="bg-warm-50/30 p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2, ease: 'easeInOut' })}
                className="overflow-hidden"
              >
                <div className="px-3 py-3 sm:px-6 sm:py-4">
                  {/* Checks grid */}
                  <div className="mb-3">
                    <span className="text-eyebrow font-semibold text-warm-500 uppercase tracking-wider">
                      Recorded Round Snapshot
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3 overflow-hidden">
                    {checks.map((check) => (
                      <span
                        key={check.label}
                        title={`${check.label}: ${check.detail}`}
                        className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-eyebrow font-medium',
                          check.ok
                            ? 'bg-primary-50/70 text-primary-700'
                            : round.status === 'completed'
                              ? 'bg-red-50/70 text-red-600'
                              : 'bg-warm-100/50 text-warm-400'
                        )}
                      >
                        {check.ok ? (
                          <IconCheckCircle2 size={11} className="flex-shrink-0" />
                        ) : round.status === 'completed' ? (
                          <IconXCircle size={11} className="flex-shrink-0" />
                        ) : (
                          <IconCircleDot size={11} className="flex-shrink-0" />
                        )}
                        {check.label}
                        {(!check.ok || check.detail !== 'Yes') && check.detail !== 'No' && (
                          <span className="opacity-70">{check.detail}</span>
                        )}
                      </span>
                    ))}
                  </div>

                  {/* Inline errors */}
                  <div className="space-y-1.5 mt-3">
                    <span className={cn(
                      'text-eyebrow font-semibold uppercase tracking-wider',
                      round.errors.length > 0 ? 'text-red-500' : 'text-primary-600'
                    )}>
                      {round.errors.length > 0 ? `Open tracer incidents (${round.errors.length})` : 'Open tracer incidents'}
                    </span>
                    {round.errors.length > 0 ? (
                      round.errors.map((err) => (
                        <InlineError key={err.id} error={err} />
                      ))
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg bg-primary-50/60 px-3 py-2 text-xs text-primary-700">
                        <IconCheckCircle2 size={12} className="flex-shrink-0" />
                        No open shot-tracking incidents are tied to this round right now.
                      </div>
                    )}
                  </div>

                  {/* Meta info */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 pt-3 border-t border-warm-200/30 text-eyebrow text-warm-400">
                    <span className="break-all">Round ID: <span className="font-mono text-warm-500">{round.round_id.slice(0, 8)}...</span></span>
                    {round.created_at && (
                      <span title={new Date(round.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}>
                        Created: {timeAgo(round.created_at)}
                      </span>
                    )}
                    {round.updated_at && (
                      <span title={new Date(round.updated_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}>
                        Last updated: <span className={cn(stuck ? 'text-red-500 font-medium' : 'text-warm-500')}>{timeAgo(round.updated_at)}</span>
                      </span>
                    )}
                    {round.current_hole != null && round.current_hole > 0 && <span>Current hole: <span className="text-warm-500 font-medium">{round.current_hole}/{round.expected_holes}</span></span>}
                  </div>
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

// ============================================================================
// STATUS BADGE
// ============================================================================

function StatusBadge({ status, stuck, currentHole, expectedHoles, updatedAt }: { status: string; stuck: boolean; currentHole?: number | null; expectedHoles?: number; updatedAt?: string | null }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-eyebrow font-semibold bg-primary-50 text-primary-700">
        Submitted
      </span>
    );
  }

  if (status === 'in_progress') {
    return (
      <div className="inline-flex flex-col items-center gap-0.5">
        <span className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-eyebrow font-semibold',
          stuck ? 'bg-red-100 text-red-800' : 'bg-amber-50 text-amber-700'
        )}>
          <span className={cn(
            'w-1.5 h-1.5 rounded-full',
            stuck ? 'bg-red-500 animate-pulse' : 'bg-amber-400'
          )} />
          {stuck ? 'Stuck' : 'Active'}
        </span>
        {currentHole != null && currentHole > 0 && (
          <span className={cn(
            'text-eyebrow font-medium tabular-nums',
            stuck ? 'text-red-500' : 'text-warm-500'
          )}>
            Hole {currentHole}{expectedHoles ? `/${expectedHoles}` : ''}
          </span>
        )}
        {stuck && updatedAt && (
          <span
            className="text-eyebrow text-red-400 tabular-nums"
            title={new Date(updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
          >
            {timeAgo(updatedAt)}
          </span>
        )}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-eyebrow font-semibold bg-warm-100 text-warm-500">
      Draft
    </span>
  );
}

// ============================================================================
// INLINE ERROR
// ============================================================================

function InlineError({ error }: { error: TracerIncident }) {
  const badgeColors: Record<string, string> = {
    critical: 'bg-red-100 text-red-800',
    error: 'bg-red-50 text-red-700',
    warning: 'bg-amber-50 text-amber-700',
    info: 'bg-blue-50 text-blue-700',
  };

  return (
    <div className="flex items-start gap-2 rounded-lg bg-red-50/50 px-2.5 sm:px-3 py-2 text-xs text-red-600 min-w-0 overflow-hidden">
      <span className={cn(
        'font-bold uppercase text-eyebrow px-1.5 py-0.5 rounded flex-shrink-0 mt-px',
        badgeColors[error.severity] || 'bg-warm-100 text-warm-600'
      )}>
        {error.severity}
      </span>
      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-white/70 text-red-500">
        <IconShieldAlert size={11} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium text-warm-800">{error.title}</p>
        <p className="mt-0.5 break-words text-warm-600">{error.summary}</p>
      </div>
      {error.lastSeen && (
        <span
          className="ml-auto flex-shrink-0 whitespace-nowrap text-eyebrow text-warm-400 hidden sm:inline"
          title={new Date(error.lastSeen).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
        >
          {timeAgo(error.lastSeen)}
        </span>
      )}
    </div>
  );
}
