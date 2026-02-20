'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { ArrowRight, Rocket, Star, Zap } from 'lucide-react';
import type { Coach, CoachStatus, PipelineStage } from '../crm-config';

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
        await onBulkUpdate(newLeads.map(c => c.id), { status: 'researching' as CoachStatus });
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
            <Rocket size={28} className="text-primary-600" />
          </div>
          <h3 className="text-lg font-bold text-warm-900 mb-2">Ready to start your pipeline</h3>
          <p className="text-sm text-warm-500 max-w-md mx-auto mb-4">
            All {stats.total} coaches are new leads. Start by researching your top prospects and moving them through the pipeline.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => handleResearchNext(10)}
              disabled={processing}
              className="px-4 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors text-sm shadow-sm shadow-primary-500/25 disabled:opacity-50"
            >
              <span className="flex items-center gap-2"><Zap size={16} /> Research Top 10</span>
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
      <div className="flex items-center gap-2 p-3 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/20 shadow-glass">
        {pipelineStages.map((stage, index) => {
          const count = coachesByStage[stage.id]?.length || 0;
          return (
            <div key={stage.id} className="flex items-center flex-1 min-w-0">
              <div className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-full transition-all w-full',
                count > 0 ? `${stage.bgColor} ${stage.color}` : 'bg-warm-50 text-warm-400'
              )}>
                <span className="text-sm flex-shrink-0">{stage.emoji}</span>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium truncate">{stage.label}</div>
                  <div className="text-base font-bold tabular-nums leading-tight">{count}</div>
                </div>
              </div>
              {index < pipelineStages.length - 1 && (
                <ArrowRight size={14} className="mx-1 text-warm-300 flex-shrink-0" />
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

          return (
            <div
              key={stage.id}
              className="min-w-0 flex flex-col"
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => handleDrop(e, stage)}
            >
              {/* Column Header — clean, minimal */}
              <div className={cn(
                'rounded-xl px-3 py-2.5 mb-2 border-t-[3px]',
                'glass-standard',
                stage.borderColor
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm flex-shrink-0">{stage.emoji}</span>
                    <h3 className="text-sm font-semibold text-warm-900 truncate">{stage.label}</h3>
                  </div>
                  <span className={cn(
                    'min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center flex-shrink-0',
                    'text-[11px] font-bold tabular-nums',
                    columnCoaches.length > 0
                      ? `bg-gradient-to-r ${stage.gradient} text-white`
                      : 'bg-warm-100 text-warm-400'
                  )}>
                    {columnCoaches.length}
                  </span>
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
// KANBAN CARD — premium hover lift
// ============================================================================
function KanbanCard({
  coach, nextStatus, isDragging,
  onDragStart, onDragEnd, onClick, onStatusChange,
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

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, coach)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        'p-3 rounded-xl bg-white border border-warm-200/60 shadow-sm',
        'hover:shadow-md hover:-translate-y-0.5 hover:border-warm-300',
        'transition-all duration-200',
        'cursor-grab active:cursor-grabbing group',
        isDragging && 'opacity-40 scale-95',
      )}
    >
      {/* Name + Star */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-semibold text-warm-900 leading-tight line-clamp-1">{coach.name}</p>
        {coach.is_starred && <Star size={14} className="text-amber-500 fill-amber-500 flex-shrink-0 mt-0.5" />}
      </div>

      {/* School */}
      <p className="text-xs text-warm-500 line-clamp-1 mb-0.5">{coach.school}</p>

      {/* Conference */}
      <p className="text-[11px] text-warm-400 line-clamp-1 mb-2">{coach.conference}</p>

      {/* Bottom: Division + Days + Priority + Quick advance */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
            coach.division === 'D2' ? 'bg-blue-50 text-blue-700' : 'bg-primary-100 text-primary-700'
          )}>
            {coach.division}
          </span>
          <span className={cn(
            'text-[10px] font-medium tabular-nums',
            daysInStage > 14 ? 'text-amber-600' : 'text-warm-400'
          )}>
            {daysInStage}d
          </span>
          {coach.priority > 0 && (
            <span className={cn(
              'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
              coach.priority >= 2 ? 'bg-orange-50 text-orange-600' : 'bg-amber-50 text-amber-600'
            )}>
              {coach.priority >= 2 ? '🔥 Hot' : '⚡ High'}
            </span>
          )}
        </div>

        {/* Quick advance button */}
        {nextStatus && (
          <button
            onClick={(e) => { e.stopPropagation(); onStatusChange(coach.id, nextStatus); }}
            className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center hover:bg-primary-50 active:bg-primary-100 text-primary-600 transition-all"
            title="Advance to next stage"
          >
            <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// EMPTY COLUMN
// ============================================================================
function EmptyColumn({ stage }: { stage: PipelineStage }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center mb-2">
        <span className="text-lg">{stage.emoji}</span>
      </div>
      <p className="text-xs text-warm-400 font-medium">No coaches here yet</p>
      <p className="text-[11px] text-warm-300 mt-0.5">Drag coaches here or update their status</p>
    </div>
  );
}
