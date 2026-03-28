'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconStar, IconArrowRight, IconRocket, IconZap, IconUsers } from '@/components/icons';
import type { Coach, CoachStatus, PipelineStage } from '../crm-config';
import { STATUS_COLORS, PRIORITY_CONFIG } from '../crm-config';

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
}

const CARDS_PER_PAGE = 20;

function getNextStageStatus(stages: PipelineStage[], currentStageId: string): CoachStatus | null {
  const idx = stages.findIndex(s => s.id === currentStageId);
  if (idx < 0 || idx >= stages.length - 1) return null;
  const nextStage = stages[idx + 1];
  if (!nextStage || !nextStage.statuses[0]) return null;
  return nextStage.statuses[0];
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
  priorityConfig,
  pipelineStages,
  stats,
  onBulkUpdate,
  onRefresh,
}: PipelineViewProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);

  const allNewLeads = stats.byStatus.new_lead === stats.total && stats.total > 0;

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
    const targetStatus = stage.statuses[0];
    if (coachId && targetStatus) onStatusChange(coachId, targetStatus);
    setDraggingId(null);
    setDropTarget(null);
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

  return (
    <div className="space-y-4">
      {/* Getting Started — only when ALL coaches are new leads */}
      {allNewLeads && (
        <div className={cn(
          'p-6 rounded-2xl text-center',
          'glass-standard'
        )}>
          <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-4">
            <IconRocket size={28} className="text-primary-600" />
          </div>
          <h3 className="text-lg font-bold text-warm-900 mb-2">Ready to start your pipeline</h3>
          <p className="text-sm text-warm-500 max-w-md mx-auto mb-4">
            All {stats.total} coaches are new leads. Start by contacting your top prospects and moving them through the pipeline.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => handleResearchNext(10)}
              disabled={processing}
              className="px-4 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors text-sm shadow-sm shadow-primary-500/25 disabled:opacity-50"
            >
              <span className="flex items-center gap-2"><IconZap size={16} /> Research Top 10</span>
            </button>
            <button
              onClick={() => handleResearchNext(25)}
              disabled={processing}
              className="px-4 py-2.5 bg-white border border-warm-200/50 text-warm-700 rounded-xl font-medium hover:bg-warm-50 active:bg-warm-100 transition-colors text-sm disabled:opacity-50"
            >
              Research Top 25
            </button>
          </div>
        </div>
      )}

      {/* Pipeline Funnel Summary — pill-shaped stages */}
      <div className="flex items-center gap-2 p-3 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/20 shadow-glass overflow-x-auto scrollbar-hide">
        {pipelineStages.map((stage, index) => {
          const count = coachesByStage[stage.id]?.length || 0;
          return (
            <div key={stage.id} className="flex items-center flex-1 min-w-0">
              <div className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-full transition-all w-full',
                count > 0 ? `${stage.bgColor} ${stage.color}` : 'bg-warm-50 text-warm-400'
              )}>
                <span className="text-sm flex-shrink-0">{stage.icon}</span>
                <div className="min-w-0">
                  <div className="text-label font-medium truncate">{stage.label}</div>
                  <div className="text-base font-bold tabular-nums leading-tight">{count}</div>
                </div>
              </div>
              {index < pipelineStages.length - 1 && (
                <IconArrowRight size={14} className="mx-1 text-warm-300 flex-shrink-0" />
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
            <div
              key={stage.id}
              className="min-w-0 flex flex-col"
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => handleDrop(e, stage)}
            >
              {/* Column Header — premium glass with status color accent */}
              <div className={cn(
                'bg-white/50 backdrop-blur-sm border border-white/20 rounded-2xl overflow-hidden mb-2',
              )}>
                {/* Status color accent bar */}
                <div className={cn('h-1', stageColors?.dot || 'bg-warm-300')} />
                <div className="px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="flex-shrink-0">{stage.icon}</span>
                      <h3 className="text-sm font-semibold text-warm-900 truncate">{stage.label}</h3>
                    </div>
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-medium tabular-nums flex-shrink-0',
                      columnCoaches.length > 0
                        ? `${stageColors?.bg || 'bg-warm-50'} ${stageColors?.text || 'text-warm-700'}`
                        : 'bg-warm-100 text-warm-400'
                    )}>
                      {columnCoaches.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cards Container */}
              <div className={cn(
                'rounded-2xl p-2 space-y-2 flex-1 overflow-y-auto transition-all',
                'bg-warm-50/30 border border-warm-100/30',
                isDropping && 'bg-primary-50/40 border-primary-200/50 ring-2 ring-primary-200/50'
              )} style={{ maxHeight: '70vh' }}>
                {columnCoaches.length === 0 ? (
                  <EmptyColumn stage={stage} />
                ) : (
                  <>
                    {visibleCoaches.map((coach) => (
                      <KanbanCard
                        key={coach.id}
                        coach={coach}
                        nextStatus={nextStatus}
                        isDragging={draggingId === coach.id}
                        statusConfig={statusConfig}
                        priorityConfig={priorityConfig}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onClick={() => onCoachClick(coach)}
                        onStatusChange={onStatusChange}
                        onToggleStar={onToggleStar}
                      />
                    ))}
                    {hasMore && (
                      <button onClick={() => toggleExpanded(stage.id)} className="w-full py-2 text-center text-sm font-medium text-primary-600 hover:bg-primary-50/50 rounded-xl transition-colors">
                        Show {columnCoaches.length - CARDS_PER_PAGE} more…
                      </button>
                    )}
                    {isExpanded && columnCoaches.length > CARDS_PER_PAGE && (
                      <button onClick={() => toggleExpanded(stage.id)} className="w-full py-2 text-center text-sm font-medium text-warm-500 hover:bg-warm-50/50 rounded-xl transition-colors">
                        Show less
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// KANBAN CARD — premium glass card with hover lift + keyboard accessibility
// ============================================================================
function KanbanCard({
  coach, nextStatus, isDragging, priorityConfig,
  onDragStart, onDragEnd, onClick, onStatusChange, onToggleStar,
}: {
  coach: Coach;
  nextStatus: CoachStatus | null;
  isDragging: boolean;
  statusConfig: Record<CoachStatus, { label: string; color: string; bgColor: string; icon: React.ReactNode; order: number }>;
  priorityConfig: Record<number, { label: string; color: string; bgColor: string; icon: React.ReactNode }>;
  onDragStart: (e: React.DragEvent, coach: Coach) => void;
  onDragEnd: () => void;
  onClick: () => void;
  onStatusChange: (coachId: string, status: CoachStatus) => void;
  onToggleStar: (coachId: string, currentStarred: boolean) => void;
}) {
  const daysInStage = daysSince(coach.updated_at);
  const priorityCfg = PRIORITY_CONFIG[coach.priority];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onClick();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (nextStatus) {
        onStatusChange(coach.id, nextStatus);
      }
    }
  };

  return (
    <div
      draggable
      tabIndex={0}
      role="button"
      aria-label={`${coach.name} at ${coach.school}. ${coach.division}. ${daysInStage} days in stage.${nextStatus ? ' Press Space to advance.' : ''}`}
      onDragStart={(e) => onDragStart(e, coach)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'bg-white/70 rounded-xl p-3 shadow-sm',
        'hover:shadow-md hover:-translate-y-0.5',
        'focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-300',
        'transition-all duration-200',
        'cursor-grab active:cursor-grabbing group',
        isDragging && 'opacity-40 scale-95',
      )}
    >
      {/* Name + Star */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-warm-900 leading-tight line-clamp-1">{coach.name}</p>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleStar(coach.id, coach.is_starred); }}
          className="flex-shrink-0 mt-0.5"
          tabIndex={-1}
          aria-label={coach.is_starred ? 'Unstar coach' : 'Star coach'}
        >
          {coach.is_starred ? (
            <IconStar size={14} className="text-amber-500 fill-amber-500" />
          ) : (
            <IconStar size={14} className="text-warm-300 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </button>
      </div>

      {/* School */}
      <p className="text-xs text-warm-500 line-clamp-1 mb-2">{coach.school}</p>

      {/* Bottom row: Division + Priority dot + Last contacted */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {/* Division badge */}
          <span className={cn(
            'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full',
            coach.division === 'D2' ? 'bg-blue-50 text-blue-700' : 'bg-primary-50 text-primary-700'
          )}>
            {coach.division}
          </span>
          {/* Priority dot */}
          {coach.priority > 0 && priorityCfg?.icon && (
            <span className="flex-shrink-0">{priorityCfg.icon}</span>
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
          <button
            onClick={(e) => { e.stopPropagation(); onStatusChange(coach.id, nextStatus); }}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 rounded-md flex items-center justify-center hover:bg-primary-50 active:bg-primary-100 text-primary-600 transition-all"
            title="Advance to next stage"
            aria-label={`Advance ${coach.name} to next stage`}
            tabIndex={-1}
          >
            <IconArrowRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EMPTY COLUMN — clean muted state, no emoji
// ============================================================================
function EmptyColumn({ stage }: { stage: PipelineStage }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center mb-2 text-warm-300">
        <IconUsers size={20} />
      </div>
      <p className="text-xs text-warm-400 font-medium">No coaches here yet</p>
      <p className="text-[10px] text-warm-300 mt-0.5">Drag coaches here or update their status</p>
    </div>
  );
}
