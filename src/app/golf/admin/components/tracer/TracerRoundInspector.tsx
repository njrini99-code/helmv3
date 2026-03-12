'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CircleDot,
  ChevronDown,
  ChevronRight,
  Stethoscope,
  ArrowUpDown,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { timeAgo, formatDate } from '../admin-utils';
import type { FlatRound, TracerIncident } from './tracer-types';

// ============================================================================
// TYPES
// ============================================================================

interface TracerRoundInspectorProps {
  rounds: FlatRound[];
  onDiagnose: (roundId: string) => void;
}

type SortKey = 'player' | 'course' | 'date' | 'score' | 'status' | 'holes' | 'issues';
type StatusFilter = 'all' | 'completed' | 'in_progress' | 'draft';

// ============================================================================
// HELPERS
// ============================================================================

function isStuckRound(round: FlatRound): boolean {
  return (
    round.status === 'in_progress' &&
    !!round.updated_at &&
    Date.now() - new Date(round.updated_at).getTime() > 2 * 60 * 60 * 1000
  );
}

function getChecks(round: FlatRound) {
  const isComplete = round.status === 'completed';
  const isInProgress = round.status === 'in_progress';

  return [
    { label: 'Holes', ok: round.actual_holes > 0, detail: `${round.actual_holes}/${round.expected_holes}` },
    { label: 'Shots', ok: round.total_shots > 0, detail: `${round.total_shots}` },
    { label: 'Submitted', ok: isComplete, detail: isComplete ? 'Yes' : isInProgress ? 'No' : 'Draft' },
    { label: 'Putts', ok: round.has_putts, detail: round.has_putts ? 'Yes' : 'No' },
    { label: 'FW', ok: round.has_fairways, detail: round.has_fairways ? 'Yes' : 'No' },
    { label: 'GIR', ok: round.has_gir, detail: round.has_gir ? 'Yes' : 'No' },
    { label: 'Putt Details', ok: round.putt_details_count > 0, detail: `${round.putt_details_count}` },
    { label: 'Appr Details', ok: round.approach_details_count > 0, detail: `${round.approach_details_count}` },
    { label: 'Stats Cached', ok: round.stats_cached, detail: round.stats_cached ? 'Yes' : 'No' },
    { label: 'SG', ok: round.has_strokes_gained, detail: round.has_strokes_gained ? 'Yes' : 'No' },
  ];
}

function getIssueCount(round: FlatRound): number {
  return round.errors.length;
}

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]![0]?.toUpperCase() ?? '?';
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

function sortIndicator(active: boolean, asc: boolean) {
  if (!active) return <ArrowUpDown size={12} className="text-warm-300 opacity-0 group-hover/th:opacity-100 transition-opacity" />;
  return <span className="text-primary-600 font-bold text-[10px]">{asc ? '\u2191' : '\u2193'}</span>;
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

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>('date');
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
        case 'player':
          return dir * a.player_name.localeCompare(b.player_name);
        case 'course':
          return dir * (a.course_name ?? '').localeCompare(b.course_name ?? '');
        case 'date':
          return dir * (a.round_date ?? '').localeCompare(b.round_date ?? '');
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
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
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
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-warm-400 pointer-events-none" />
        </div>

        {/* Stuck only toggle */}
        <button
          onClick={() => setStuckOnly((prev) => !prev)}
          className={cn(
            'flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
            stuckOnly
              ? 'bg-amber-100 border border-amber-300 text-amber-800'
              : 'bg-white/60 border border-white/30 text-warm-500 hover:bg-white/80 hover:text-warm-700'
          )}
        >
          <Clock size={14} />
          Stuck only
          {stuckCount > 0 && (
            <span className={cn(
              'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold',
              stuckOnly ? 'bg-amber-200 text-amber-900' : 'bg-amber-100 text-amber-700'
            )}>
              {stuckCount}
            </span>
          )}
        </button>

        {/* Has errors toggle */}
        <button
          onClick={() => setHasErrorsOnly((prev) => !prev)}
          className={cn(
            'flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
            hasErrorsOnly
              ? 'bg-red-100 border border-red-300 text-red-800'
              : 'bg-white/60 border border-white/30 text-warm-500 hover:bg-white/80 hover:text-warm-700'
          )}
        >
          <AlertTriangle size={14} />
          Has errors
          {errorCount > 0 && (
            <span className={cn(
              'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold',
              hasErrorsOnly ? 'bg-red-200 text-red-900' : 'bg-red-100 text-red-700'
            )}>
              {errorCount}
            </span>
          )}
        </button>
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
      <div className="bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] overflow-clip">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-warm-100/80">
                <th className="w-10 px-3 py-3.5" />
                <SortableTh label="Player" sortKey="player" currentKey={sortKey} asc={sortAsc} onSort={handleSort} align="left" />
                <SortableTh label="Course" sortKey="course" currentKey={sortKey} asc={sortAsc} onSort={handleSort} align="left" className="hidden md:table-cell" />
                <SortableTh label="Date" sortKey="date" currentKey={sortKey} asc={sortAsc} onSort={handleSort} className="hidden md:table-cell" />
                <SortableTh label="Score" sortKey="score" currentKey={sortKey} asc={sortAsc} onSort={handleSort} className="hidden sm:table-cell" />
                <SortableTh label="Status" sortKey="status" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                <SortableTh label="Holes" sortKey="holes" currentKey={sortKey} asc={sortAsc} onSort={handleSort} className="hidden md:table-cell" />
                <SortableTh label="Issues" sortKey="issues" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                <th className="px-4 py-3.5 font-medium text-[11px] uppercase tracking-wider text-warm-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRounds.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
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
        'px-4 py-3.5 font-medium text-[11px] uppercase tracking-wider cursor-pointer select-none group/th',
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
  const stuck = isStuckRound(round);
  const checks = getChecks(round);
  const issueCount = round.errors.length;

  return (
    <>
      <tr
        className={cn(
          'border-b border-warm-50/80 cursor-pointer transition-colors',
          stuck && 'border-l-[3px] border-l-amber-400',
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
              <ChevronDown size={14} className="text-warm-500" />
            ) : (
              <ChevronRight size={14} className="text-warm-400" />
            )}
          </div>
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
        <td className="hidden md:table-cell px-4 py-3.5 text-center text-warm-500 text-xs whitespace-nowrap">
          {round.round_date ? formatDate(round.round_date) : <span className="text-warm-300">&mdash;</span>}
        </td>

        {/* Score */}
        <td className="hidden sm:table-cell px-4 py-3.5 text-center">
          {round.total_score != null ? (
            <span className="tabular-nums">
              <span className="font-bold text-warm-800">{round.total_score}</span>
              {round.score_to_par != null && (
                <span className={cn(
                  'ml-1 text-xs font-semibold',
                  round.score_to_par > 0 ? 'text-red-500' : round.score_to_par < 0 ? 'text-green-600' : 'text-warm-400'
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
          <StatusBadge status={round.status} stuck={stuck} currentHole={round.current_hole} expectedHoles={round.expected_holes} />
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
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">
              <AlertTriangle size={10} />
              {issueCount}
            </span>
          ) : round.status === 'completed' ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-600">
              <CheckCircle2 size={10} />
              Clear
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warm-400">
              <CircleDot size={10} />
              Watching
            </span>
          )}
        </td>

        {/* Actions */}
        <td className="px-4 py-3.5 text-center">
          <button
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
          </button>
        </td>
      </tr>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <tr>
            <td colSpan={9} className="bg-warm-50/30 p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="px-6 py-4">
                  {/* Checks grid */}
                  <div className="mb-3">
                    <span className="text-[11px] font-semibold text-warm-500 uppercase tracking-wider">
                      Recorded Round Snapshot
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {checks.map((check) => (
                      <span
                        key={check.label}
                        title={`${check.label}: ${check.detail}`}
                        className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium',
                          check.ok
                            ? 'bg-green-50/70 text-green-700'
                            : round.status === 'completed'
                              ? 'bg-red-50/70 text-red-600'
                              : 'bg-warm-100/50 text-warm-400'
                        )}
                      >
                        {check.ok ? (
                          <CheckCircle2 size={11} className="flex-shrink-0" />
                        ) : round.status === 'completed' ? (
                          <XCircle size={11} className="flex-shrink-0" />
                        ) : (
                          <CircleDot size={11} className="flex-shrink-0" />
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
                      'text-[11px] font-semibold uppercase tracking-wider',
                      round.errors.length > 0 ? 'text-red-500' : 'text-green-600'
                    )}>
                      {round.errors.length > 0 ? `Open tracer incidents (${round.errors.length})` : 'Open tracer incidents'}
                    </span>
                    {round.errors.length > 0 ? (
                      round.errors.map((err) => (
                        <InlineError key={err.id} error={err} />
                      ))
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg bg-green-50/60 px-3 py-2 text-xs text-green-700">
                        <CheckCircle2 size={12} className="flex-shrink-0" />
                        No open shot-tracking incidents are tied to this round right now.
                      </div>
                    )}
                  </div>

                  {/* Meta info */}
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-warm-200/30 text-[11px] text-warm-400">
                    <span>Round ID: <span className="font-mono text-warm-500">{round.round_id.slice(0, 8)}...</span></span>
                    {round.created_at && <span>Created: {timeAgo(round.created_at)}</span>}
                    {round.updated_at && <span>Updated: {timeAgo(round.updated_at)}</span>}
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

function StatusBadge({ status, stuck, currentHole, expectedHoles }: { status: string; stuck: boolean; currentHole?: number | null; expectedHoles?: number }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-green-50 text-green-700">
        Completed
      </span>
    );
  }

  if (status === 'in_progress') {
    return (
      <div className="inline-flex flex-col items-center gap-0.5">
        <span className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold',
          stuck ? 'bg-amber-100 text-amber-800' : 'bg-amber-50 text-amber-700'
        )}>
          <span className={cn(
            'w-1.5 h-1.5 rounded-full bg-amber-400',
            stuck ? 'animate-pulse' : ''
          )} />
          {stuck ? 'Stuck' : 'In Progress'}
        </span>
        {currentHole != null && currentHole > 0 && (
          <span className="text-[10px] font-medium text-warm-500 tabular-nums">
            Hole {currentHole}{expectedHoles ? `/${expectedHoles}` : ''}
          </span>
        )}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-warm-100 text-warm-500">
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
    <div className="flex items-start gap-2 rounded-lg bg-red-50/50 px-3 py-2 text-xs text-red-600">
      <span className={cn(
        'font-bold uppercase text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 mt-px',
        badgeColors[error.severity] || 'bg-warm-100 text-warm-600'
      )}>
        {error.severity}
      </span>
      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-white/70 text-red-500">
        <ShieldAlert size={11} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium text-warm-800">{error.title}</p>
        <p className="mt-0.5 break-words text-warm-600">{error.summary}</p>
      </div>
      {error.lastSeen && (
        <span className="ml-auto flex-shrink-0 whitespace-nowrap text-[10px] text-warm-400">
          {timeAgo(error.lastSeen)}
        </span>
      )}
    </div>
  );
}
