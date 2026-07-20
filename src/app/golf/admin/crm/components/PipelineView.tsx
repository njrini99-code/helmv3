'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconStar, IconArrowRight, IconRocket, IconZap, IconUsers, IconX } from '@/components/icons';
import type { Coach, CoachStatus, PipelineStage } from '../crm-config';
import { STATUS_COLORS, PRIORITY_CONFIG } from '../crm-config';
import { Button, IconButton } from '@/components/ui/button';
import { getStageAges, type StageAge } from '@/app/golf/actions/crm-stage-ages';
import { daysBetween, agingTier, median } from './pipeline-aging';

interface PipelineViewProps {
  coaches: Coach[];
  onCoachClick: (coach: Coach) => void;
  onStatusChange: (coachId: string, status: CoachStatus) => void;
  onToggleStar: (coachId: string, currentStarred: boolean) => void;
  statusConfig: Record<CoachStatus, { label: string; color: string; bgColor: string; icon: React.ReactNode; order: number }>;
  priorityConfig: Record<number, { label: string; color: string; bgColor: string; icon: React.ReactNode }>;
  pipelineStages: PipelineStage[];
  stats: {
    total: number;
    byStatus: Record<CoachStatus, number>;
    byStage: Record<string, number>;
  };
  onBulkUpdate: (ids: string[], updates: Partial<Coach>) => Promise<void>;
  onRefresh: () => void;
  /** Optional — while true, renders skeleton columns instead of a false
   *  "no pipeline" flash during the initial fetch. Callers that don't pass
   *  it keep today's behavior (treated as not loading). */
  loading?: boolean;
  /** Optional — when provided together with onSelectionChange, cards render a
   *  bulk-selection checkbox (mirrors CoachTable's row checkbox) so
   *  BulkActionsBar becomes reachable from the board. Callers that omit
   *  either prop keep today's behavior: no checkbox is rendered at all. */
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

const CARDS_PER_PAGE = 20;

// Quick-advance (card arrow + Space key) only fires when the next stage maps
// to exactly one status — for multi-status stages (e.g. "Closed" = won/lost/
// nurture) there is no single correct target, so the affordance is hidden and
// the coach must be moved via drag-and-drop, which prompts for the specific
// outcome (see StageChoicePrompt below).
function getNextStageStatus(stages: PipelineStage[], currentStageId: string): CoachStatus | null {
  const idx = stages.findIndex(s => s.id === currentStageId);
  if (idx < 0 || idx >= stages.length - 1) return null;
  const nextStage = stages[idx + 1];
  if (!nextStage || nextStage.statuses.length !== 1) return null;
  return nextStage.statuses[0] ?? null;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const days = daysSince(dateStr);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Get the primary status color for a pipeline stage (uses first status in the stage) */
function getStageStatusColor(stage: PipelineStage) {
  const primaryStatus = stage.statuses[0];
  return primaryStatus ? STATUS_COLORS[primaryStatus] : null;
}

export function PipelineView({
  coaches,
  onCoachClick,
  onStatusChange,
  onToggleStar,
  statusConfig,
  pipelineStages,
  stats,
  onBulkUpdate,
  onRefresh,
  loading = false,
  selectedIds,
  onSelectionChange,
}: PipelineViewProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  // Set when a coach is dropped into a stage that maps to more than one
  // status (currently only "Closed" = won/lost/nurture) — we can't infer the
  // intended outcome from the drop alone, so we ask instead of guessing.
  const [pendingStageChoice, setPendingStageChoice] = useState<{ coach: Coach; stage: PipelineStage } | null>(null);
  // Real per-coach stage-entry timestamps (get_crm_stage_ages RPC). Fetched
  // once on mount — degrades to {} on error, in which case the chip/median
  // fall back to coach.updated_at (see stageAgeDays below).
  const [stageAges, setStageAges] = useState<Record<string, StageAge>>({});

  useEffect(() => {
    let cancelled = false;
    getStageAges().then((ages) => {
      if (!cancelled) setStageAges(ages);
    });
    return () => { cancelled = true; };
  }, []);

  // Derived from the coaches PROP (the filtered board), not page-level stats —
  // with filters applied the two can disagree and the banner would lie.
  const allNewLeads = coaches.length > 0 && coaches.every((c) => c.status === 'new_lead');

  // Group coaches by pipeline stage
  const coachesByStage = useMemo(() => {
    const groups: Record<string, Coach[]> = {};
    pipelineStages.forEach(stage => { groups[stage.id] = []; });

    coaches.forEach(coach => {
      const stage = pipelineStages.find(s => s.statuses.includes(coach.status));
      if (stage) {
        const group = groups[stage.id];
        if (group) group.push(coach);
      }
    });

    Object.keys(groups).forEach(stageId => {
      const group = groups[stageId];
      if (group) {
        group.sort((a, b) => {
          if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
          if (a.priority !== b.priority) return b.priority - a.priority;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
      }
    });

    return groups;
  }, [coaches, pipelineStages]);

  // Median days-in-stage per (non-closed) column header — computed only from
  // coaches with a known stage-age entry (real or seed transition). Columns
  // with zero known-age coaches omit the stat rather than showing a
  // misleading 0.
  const stageMedianDays = useMemo(() => {
    const result: Record<string, number> = {};
    pipelineStages.forEach((stage) => {
      if (stage.id === 'closed') return;
      const knownDays = (coachesByStage[stage.id] || [])
        .map((c) => stageAges[c.id])
        .filter((age): age is StageAge => Boolean(age))
        .map((age) => daysBetween(age.stageSince));
      if (knownDays.length > 0) {
        result[stage.id] = median(knownDays);
      }
    });
    return result;
  }, [pipelineStages, coachesByStage, stageAges]);

  // Selection is entirely optional (see PipelineViewProps) — onToggleSelect is
  // only defined (and only then does a card render its checkbox) when the
  // caller passed onSelectionChange. hasSelection forces every card's
  // checkbox visible (not just hover/focus) once at least one is checked, so
  // the affordance doesn't disappear out from under an in-progress selection.
  const hasSelection = !!selectedIds && selectedIds.size > 0;
  const onToggleSelect = onSelectionChange
    ? (coachId: string) => {
        const next = new Set(selectedIds ?? []);
        if (next.has(coachId)) next.delete(coachId); else next.add(coachId);
        onSelectionChange(next);
      }
    : undefined;

  const handleDragStart = (e: React.DragEvent, coach: Coach) => {
    e.dataTransfer.setData('coachId', coach.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(coach.id);
  };

  const handleDragEnd = () => { setDraggingId(null); setDropTarget(null); };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(stageId);
  };

  const handleDrop = (e: React.DragEvent, stage: PipelineStage) => {
    e.preventDefault();
    const coachId = e.dataTransfer.getData('coachId');
    setDraggingId(null);
    setDropTarget(null);
    if (!coachId) return;

    const coach = coaches.find((c) => c.id === coachId);
    if (!coach) return;

    // Dropped back into the stage the coach is already in — including a
    // stray reorder among won/lost/nurture cards already inside the same
    // "Closed" column. Not a real move; do NOT write a status.
    if (stage.statuses.includes(coach.status)) return;

    // Unambiguous single-status stage — safe to write directly.
    if (stage.statuses.length === 1) {
      const targetStatus = stage.statuses[0];
      if (targetStatus) onStatusChange(coachId, targetStatus);
      return;
    }

    // Multi-status stage (e.g. "Closed") — don't guess which of won/lost/
    // nurture was intended. Ask.
    setPendingStageChoice({ coach, stage });
  };

  const handleResearchNext = async (count: number) => {
    setProcessing(true);
    try {
      const newLeads = coaches
        .filter(c => c.status === 'new_lead')
        .sort((a, b) => {
          if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
          if (a.priority !== b.priority) return b.priority - a.priority;
          return a.name.localeCompare(b.name);
        })
        .slice(0, count);
      if (newLeads.length > 0) {
        await onBulkUpdate(newLeads.map(c => c.id), { status: 'contacted' as CoachStatus });
        onRefresh();
      }
    } finally { setProcessing(false); }
  };

  const toggleExpanded = (stageId: string) => {
    setExpandedColumns(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId); else next.add(stageId);
      return next;
    });
  };

  // Loading skeleton — avoids a false "no pipeline" flash (all stage columns
  // at 0) while the initial coach list is still in flight.
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="glass-standard flex items-center gap-2 p-3 rounded-2xl">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-11 flex-1 rounded-full bg-warm-100/70 skeleton-shimmer" />
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="min-w-0 flex flex-col gap-2">
              <div className="glass-standard rounded-2xl h-14 skeleton-shimmer" />
              <div className="rounded-2xl p-2 space-y-2 bg-warm-50/30 border border-warm-100/40">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-20 rounded-2xl bg-warm-100/60 skeleton-shimmer" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Getting Started — only when ALL coaches are new leads */}
      {allNewLeads && (
        <div className="glass-standard p-6 rounded-2xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-4">
            <IconRocket size={24} className="text-primary-600" />
          </div>
          <h3 className="text-base font-semibold text-warm-900 mb-1.5 tracking-tight">Ready to start your pipeline</h3>
          <p className="text-sm text-warm-500 max-w-md mx-auto mb-4">
            All {stats.total} coaches are new leads. Start by contacting your top prospects and moving them through the pipeline.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="primary"
              type="button"
              onClick={() => handleResearchNext(10)}
              disabled={processing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors text-sm shadow-sm shadow-primary-500/20 disabled:opacity-50"
            >
              <IconZap size={14} /> Research Top 10
            </Button>
            <Button variant="ghost"
              type="button"
              onClick={() => handleResearchNext(25)}
              disabled={processing}
              className="px-4 py-2 glass-standard text-warm-700 rounded-xl font-medium hover:bg-cream-100 transition-colors text-sm disabled:opacity-50"
            >
              Research Top 25
            </Button>
          </div>
        </div>
      )}

      {/* Pipeline Funnel Summary — pill-shaped stages */}
      <div className="glass-standard flex items-center gap-2 p-3 rounded-2xl overflow-x-auto scrollbar-hide">
        {pipelineStages.map((stage, index) => {
          const count = coachesByStage[stage.id]?.length || 0;
          return (
            <div key={stage.id} className="flex items-center flex-1 min-w-0">
              <div className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-full transition-colors w-full',
                count > 0 ? `${stage.bgColor} ${stage.color}` : 'bg-warm-50 text-warm-400'
              )}>
                <span className="flex-shrink-0">{stage.icon}</span>
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{stage.label}</div>
                  <div className="text-base font-bold tabular-nums leading-tight">{count}</div>
                </div>
              </div>
              {index < pipelineStages.length - 1 && (
                <IconArrowRight size={14} className="mx-1 text-warm-300 flex-shrink-0" aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>

      {/* Kanban Columns — CSS grid, no horizontal scroll */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {pipelineStages.map((stage) => {
          const columnCoaches = coachesByStage[stage.id] || [];
          const isDropping = dropTarget === stage.id;
          const isExpanded = expandedColumns.has(stage.id);
          const visibleCoaches = isExpanded ? columnCoaches : columnCoaches.slice(0, CARDS_PER_PAGE);
          const hasMore = columnCoaches.length > CARDS_PER_PAGE && !isExpanded;
          const nextStatus = getNextStageStatus(pipelineStages, stage.id);
          const stageColors = getStageStatusColor(stage);

          return (
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- drag-and-drop zone; keyboard reordering not yet implemented
            <div
              key={stage.id}
              className="min-w-0 flex flex-col"
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => handleDrop(e, stage)}
            >
              {/* Column Header — glass-standard with status color accent */}
              <div className="glass-standard rounded-2xl overflow-hidden mb-2">
                <div className={cn('h-1', stageColors?.dot || 'bg-warm-300')} aria-hidden="true" />
                <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="flex-shrink-0" aria-hidden="true">{stage.icon}</span>
                    <h3 className="text-sm font-semibold text-warm-900 truncate tracking-tight">{stage.label}</h3>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-medium tabular-nums flex-shrink-0',
                      columnCoaches.length > 0
                        ? `${stageColors?.bg || 'bg-warm-50'} ${stageColors?.text || 'text-warm-700'}`
                        : 'bg-warm-100 text-warm-400'
                    )}>
                      {columnCoaches.length}
                    </span>
                    {stageMedianDays[stage.id] !== undefined && (
                      <span className="text-micro text-warm-400 tabular-nums whitespace-nowrap">
                        · {Math.round(stageMedianDays[stage.id]!)}d median
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Cards Container */}
              <div
                className={cn(
                  'rounded-2xl p-2 space-y-2 flex-1 overflow-y-auto transition-colors',
                  'bg-warm-50/30 border border-warm-100/40',
                  isDropping && 'bg-primary-50/40 border-primary-200/60 ring-2 ring-primary-200/50'
                )}
                style={{ maxHeight: '70vh' }}
                aria-label={`${stage.label} column, ${columnCoaches.length} coaches`}
              >
                {columnCoaches.length === 0 ? (
                  <EmptyColumn />
                ) : (
                  <>
                    {visibleCoaches.map((coach) => (
                      <KanbanCard
                        key={coach.id}
                        coach={coach}
                        stageId={stage.id}
                        stageAge={stageAges[coach.id]}
                        nextStatus={nextStatus}
                        isDragging={draggingId === coach.id}
                        statusConfig={statusConfig}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onClick={() => onCoachClick(coach)}
                        onStatusChange={onStatusChange}
                        onToggleStar={onToggleStar}
                        isSelected={selectedIds?.has(coach.id) ?? false}
                        hasSelection={hasSelection}
                        onToggleSelect={onToggleSelect}
                      />
                    ))}
                    {hasMore && (
                      <Button variant="primary"
                        type="button"
                        onClick={() => toggleExpanded(stage.id)}
                        className="w-full py-2 text-center text-sm font-medium text-primary-600 hover:bg-primary-50/60 rounded-xl transition-colors"
                      >
                        Show {columnCoaches.length - CARDS_PER_PAGE} more…
                      </Button>
                    )}
                    {isExpanded && columnCoaches.length > CARDS_PER_PAGE && (
                      <Button variant="ghost"
                        type="button"
                        onClick={() => toggleExpanded(stage.id)}
                        className="w-full py-2 text-center text-sm font-medium text-warm-500 hover:bg-warm-50/60 rounded-xl transition-colors"
                      >
                        Show less
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {pendingStageChoice && (
        <StageChoicePrompt
          coach={pendingStageChoice.coach}
          stage={pendingStageChoice.stage}
          statusConfig={statusConfig}
          onChoose={(status) => {
            onStatusChange(pendingStageChoice.coach.id, status);
            setPendingStageChoice(null);
          }}
          onCancel={() => setPendingStageChoice(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// STAGE CHOICE PROMPT — shown when a card is dropped into a stage that maps
// to more than one status (currently only "Closed" = won/lost/nurture), so
// the exact outcome can't be inferred from the drop target alone.
// ============================================================================
function StageChoicePrompt({
  coach, stage, statusConfig, onChoose, onCancel,
}: {
  coach: Coach;
  stage: PipelineStage;
  statusConfig: Record<CoachStatus, { label: string; color: string; bgColor: string; icon: React.ReactNode; order: number }>;
  onChoose: (status: CoachStatus) => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="stage-choice-title" className="fixed inset-0 z-modal flex items-center justify-center px-4">
      <IconButton variant="default"
        type="button"
        aria-label="Close dialog"
        onClick={onCancel}
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
      ><span className="sr-only">Close dialog</span></IconButton>

      <div className="relative w-full max-w-sm rounded-2xl bg-cream-50 shadow-2xl border border-warm-100 p-5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h2 id="stage-choice-title" className="text-base font-semibold text-warm-900">
            Move to {stage.label}
          </h2>
          <IconButton variant="default"
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="p-1.5 -mt-1 -mr-1 rounded-md hover:bg-warm-100 text-warm-400 hover:text-warm-700"
          >
            <IconX size={14} />
          </IconButton>
        </div>
        <p className="text-xs text-warm-500 mb-4">
          {coach.name} · {coach.school} — {stage.label} covers more than one status. Pick the exact outcome.
        </p>
        <div className="space-y-1.5">
          {stage.statuses.map((status) => {
            const cfg = statusConfig[status];
            const colors = STATUS_COLORS[status];
            return (
              <Button key={status} variant="ghost"
                type="button"
                onClick={() => onChoose(status)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium justify-start',
                  'border border-warm-100 hover:border-warm-200 transition-colors',
                  colors?.bg, colors?.text,
                )}
              >
                <span aria-hidden="true">{cfg?.icon}</span>
                {cfg?.label ?? status}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// KANBAN CARD — glass-standard card with hover lift + keyboard accessibility
// ============================================================================
function KanbanCard({
  coach, stageId, stageAge, nextStatus, isDragging, statusConfig,
  onDragStart, onDragEnd, onClick, onStatusChange, onToggleStar,
  isSelected = false, hasSelection = false, onToggleSelect,
}: {
  coach: Coach;
  /** id of the pipeline column this card is rendered in — the aging chip is
   *  suppressed for 'closed' (won/lost/nurture no longer "age" in a stage). */
  stageId: string;
  /** Real per-coach stage-entry timestamp from get_crm_stage_ages(), if any.
   *  Falls back to coach.updated_at when absent (e.g. RPC failed, or the
   *  coach predates stage-transition tracking and has no seed row yet). */
  stageAge: StageAge | undefined;
  nextStatus: CoachStatus | null;
  isDragging: boolean;
  statusConfig: Record<CoachStatus, { label: string; color: string; bgColor: string; icon: React.ReactNode; order: number }>;
  onDragStart: (e: React.DragEvent, coach: Coach) => void;
  onDragEnd: () => void;
  onClick: () => void;
  onStatusChange: (coachId: string, status: CoachStatus) => void;
  onToggleStar: (coachId: string, currentStarred: boolean) => void;
  /** Whether this card is currently in the caller's selection set. Ignored
   *  (and no checkbox renders) when onToggleSelect is absent. */
  isSelected?: boolean;
  /** Whether ANY card is currently selected — forces this card's checkbox
   *  visible instead of only on hover/focus, so it doesn't vanish mid-selection. */
  hasSelection?: boolean;
  /** Present only when the board's selection feature is enabled (see
   *  PipelineViewProps.onSelectionChange). Renders a checkbox + wires the
   *  'x' keyboard shortcut when set. */
  onToggleSelect?: (coachId: string) => void;
}) {
  const stageSince = stageAge?.stageSince ?? coach.updated_at;
  const daysInStage = daysBetween(stageSince);
  const showAgingChip = stageId !== 'closed';
  const tier = agingTier(daysInStage);
  const priorityCfg = PRIORITY_CONFIG[coach.priority];
  const statusCfg = statusConfig[coach.status];
  const statusColors = STATUS_COLORS[coach.status];
  const selectable = !!onToggleSelect;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onClick();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (nextStatus) {
        onStatusChange(coach.id, nextStatus);
      }
    } else if ((e.key === 'x' || e.key === 'X') && onToggleSelect) {
      e.preventDefault();
      onToggleSelect(coach.id);
    }
  };

  return (
    <div
      draggable
      tabIndex={0}
      role="button"
      aria-keyshortcuts={selectable ? 'x' : undefined}
      aria-label={`${coach.name} at ${coach.school}. ${coach.division}. Status: ${statusCfg?.label ?? coach.status}. ${daysInStage} days in stage.${nextStatus ? ' Press Space to advance.' : ''}${selectable ? ' Press x to select.' : ''}`}
      onDragStart={(e) => onDragStart(e, coach)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'glass-standard rounded-2xl p-3',
        'hover:-translate-y-0.5 hover:bg-cream-100',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:border-primary-300',
        'transition-all duration-200',
        'cursor-grab active:cursor-grabbing group',
        isDragging && 'opacity-40 scale-95',
        isSelected && 'ring-2 ring-primary-500/50 bg-primary-50/30',
      )}
    >
      {/* Name + optional selection checkbox + Star */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-start gap-2 min-w-0">
          {selectable && (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only wrapper prevents card click when interacting with checkbox
            <div className="pt-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect?.(coach.id)}
                tabIndex={-1}
                aria-label={isSelected ? `Deselect ${coach.name}` : `Select ${coach.name}`}
                className={cn(
                  'w-4 h-4 rounded-md border-warm-300 text-primary-600 focus:ring-primary-500/20 cursor-pointer transition-opacity',
                  hasSelection ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                )}
              />
            </div>
          )}
          <p className="text-sm font-semibold text-warm-900 leading-tight line-clamp-1 tracking-tight">{coach.name}</p>
        </div>
        <Button variant="ghost"
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleStar(coach.id, coach.is_starred); }}
          className="flex-shrink-0 mt-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          tabIndex={-1}
          aria-label={coach.is_starred ? `Unstar ${coach.name}` : `Star ${coach.name}`}
          aria-pressed={coach.is_starred}
        >
          {coach.is_starred ? (
            <IconStar size={14} className="text-amber-500 fill-amber-500" aria-hidden="true" />
          ) : (
            <IconStar size={14} className="text-warm-300 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
          )}
        </Button>
      </div>

      {/* School */}
      <p className="text-xs text-warm-500 line-clamp-1 mb-2">{coach.school}</p>

      {/* Status badge — column groups multiple statuses (e.g. Closed = won/
          lost/nurture), so the card must still show which one this coach is. */}
      {statusCfg && (
        <span className={cn(
          'inline-flex items-center gap-1 text-eyebrow font-semibold px-1.5 py-0.5 rounded-full mb-1.5',
          statusColors?.bg, statusColors?.text,
        )}>
          <span aria-hidden="true">{statusCfg.icon}</span>
          {statusCfg.label}
        </span>
      )}

      {/* Bottom row: Division + Priority dot + Last contacted */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {/* Division badge */}
          <span className={cn(
            'text-eyebrow font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full',
            coach.division === 'D2' ? 'bg-blue-50 text-blue-700' : 'bg-primary-50 text-primary-700'
          )}>
            {coach.division}
          </span>
          {/* Priority dot */}
          {coach.priority > 0 && priorityCfg?.icon && (
            <span className="flex-shrink-0" aria-label={priorityCfg.label}>{priorityCfg.icon}</span>
          )}
          {/* Stage-aging chip — hidden for the "Closed" column (won/lost/
              nurture cards no longer age in a stage). Tint escalates
              fresh -> aging -> stale at the 14d / 30d thresholds. */}
          {showAgingChip && (
            <span
              className={cn(
                'text-micro tabular-nums rounded-full px-2 py-0.5 flex-shrink-0',
                tier === 'fresh' && 'bg-cream-100 text-warm-500',
                tier === 'aging' && 'bg-amber-50 text-amber-700',
                tier === 'stale' && 'bg-red-50 text-red-700',
              )}
              title={stageAge?.isSeed ? 'approximate — tracking started Jul 20, 2026' : undefined}
            >
              {daysInStage}d in stage
            </span>
          )}
        </div>

        {/* Last contacted — relative time */}
        <span className="text-xs text-warm-400 tabular-nums">
          {relativeTime(coach.last_contacted_at)}
        </span>
      </div>

      {/* Quick advance button */}
      {nextStatus && (
        <div className="flex justify-end mt-1.5">
          <IconButton variant="primary"
            type="button"
            onClick={(e) => { e.stopPropagation(); onStatusChange(coach.id, nextStatus); }}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 rounded-md flex items-center justify-center hover:bg-primary-50 active:bg-primary-100 text-primary-600 transition-all"
            title="Advance to next stage"
            aria-label={`Advance ${coach.name} to next stage`}
            tabIndex={-1}
          >
            <IconArrowRight size={12} aria-hidden="true" />
          </IconButton>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EMPTY COLUMN — clean muted state, no emoji
// ============================================================================
function EmptyColumn() {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center mb-2 text-warm-300">
        <IconUsers size={20} aria-hidden="true" />
      </div>
      <p className="text-xs text-warm-400 font-medium">No coaches here yet</p>
      <p className="text-eyebrow text-warm-300 mt-0.5">Drag coaches here or update their status</p>
    </div>
  );
}
