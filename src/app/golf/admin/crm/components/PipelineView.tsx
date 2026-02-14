'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Coach, CoachStatus } from '../page';

interface PipelineViewProps {
  coaches: Coach[];
  onCoachClick: (coach: Coach) => void;
  onStatusChange: (coachId: string, status: CoachStatus) => void;
  onToggleStar: (coachId: string, currentStarred: boolean) => void;
  statusConfig: Record<CoachStatus, { label: string; color: string; bgColor: string; icon: string; order: number }>;
  priorityConfig: Record<number, { label: string; color: string; bgColor: string; icon: string }>;
}

const PIPELINE_COLUMNS: { status: CoachStatus; headerBg: string; headerBorder: string }[] = [
  { status: 'new_lead', headerBg: 'bg-slate-100', headerBorder: 'border-l-slate-400' },
  { status: 'contacted', headerBg: 'bg-blue-50', headerBorder: 'border-l-blue-500' },
  { status: 'demo_scheduled', headerBg: 'bg-amber-50', headerBorder: 'border-l-amber-500' },
  { status: 'customer', headerBg: 'bg-emerald-50', headerBorder: 'border-l-emerald-500' },
  { status: 'closed', headerBg: 'bg-red-50', headerBorder: 'border-l-red-400' },
];

export function PipelineView({
  coaches,
  onCoachClick,
  onStatusChange,
  onToggleStar,
  statusConfig,
  priorityConfig,
}: PipelineViewProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<CoachStatus | null>(null);

  // Group coaches by status
  const coachesByStatus = useMemo(() => {
    const groups: Record<CoachStatus, Coach[]> = {
      new_lead: [],
      contacted: [],
      demo_scheduled: [],
      customer: [],
      closed: [],
    };
    
    coaches.forEach(coach => {
      if (groups[coach.status]) {
        groups[coach.status].push(coach);
      }
    });
    
    // Sort each group
    Object.keys(groups).forEach(status => {
      groups[status as CoachStatus].sort((a, b) => {
        if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
        if (a.priority !== b.priority) return b.priority - a.priority;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
    });
    
    return groups;
  }, [coaches]);

  const handleDragStart = (e: React.DragEvent, coach: Coach) => {
    e.dataTransfer.setData('coachId', coach.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(coach.id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const handleDragOver = (e: React.DragEvent, status: CoachStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(status);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: CoachStatus) => {
    e.preventDefault();
    const coachId = e.dataTransfer.getData('coachId');
    if (coachId) {
      onStatusChange(coachId, targetStatus);
    }
    setDraggingId(null);
    setDropTarget(null);
  };

  return (
    <div className="flex gap-4 overflow-x-auto p-4 pb-6">
      {PIPELINE_COLUMNS.map((column) => {
        const config = statusConfig[column.status];
        const columnCoaches = coachesByStatus[column.status] || [];
        const isDropTarget = dropTarget === column.status;
        
        return (
          <div
            key={column.status}
            className="flex-shrink-0 w-72"
            onDragOver={(e) => handleDragOver(e, column.status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column.status)}
          >
            {/* Column Header */}
            <div className={cn(
              'rounded-xl px-4 py-3 mb-3 border-l-4',
              'bg-white/65 backdrop-blur-[16px]',
              'border border-white/30',
              'shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]',
              column.headerBorder
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{config.icon}</span>
                  <span className="font-semibold text-warm-900 text-sm">{config.label}</span>
                </div>
                <span className={cn(
                  'px-2 py-0.5 rounded-lg text-xs font-bold tabular-nums',
                  config.bgColor, config.color
                )}>
                  {columnCoaches.length}
                </span>
              </div>
            </div>

            {/* Cards Container */}
            <div className={cn(
              'rounded-2xl p-3 space-y-2.5 min-h-[400px] max-h-[calc(100vh-320px)] overflow-y-auto transition-all',
              'bg-warm-50/50 border border-warm-100/50',
              isDropTarget && 'bg-primary-50/50 border-primary-200 ring-2 ring-primary-200'
            )}>
              {columnCoaches.length === 0 ? (
                <div className="text-center py-12 text-warm-400">
                  <div className="w-12 h-12 rounded-xl bg-warm-100 flex items-center justify-center mx-auto mb-3">
                    <span className="text-2xl">📭</span>
                  </div>
                  <p className="text-sm font-medium">No coaches here</p>
                  <p className="text-xs text-warm-300 mt-1">Drag coaches to move them</p>
                </div>
              ) : (
                columnCoaches.map((coach) => (
                  <div
                    key={coach.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, coach)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onCoachClick(coach)}
                    className={cn(
                      'rounded-xl p-3.5 cursor-pointer transition-all',
                      'bg-white/65 backdrop-blur-[16px]',
                      'border border-white/30',
                      'shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]',
                      'hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:-translate-y-0.5',
                      'active:scale-[0.98]',
                      draggingId === coach.id && 'opacity-50 scale-95',
                      coach.is_starred && 'ring-2 ring-amber-300/50',
                      coach.priority === 2 && !coach.is_starred && 'ring-2 ring-orange-300/50'
                    )}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {coach.priority > 0 && (
                          <span className="flex-shrink-0">{priorityConfig[coach.priority]?.icon}</span>
                        )}
                        <span className="font-semibold text-warm-900 text-sm truncate">
                          {coach.name}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleStar(coach.id, coach.is_starred);
                        }}
                        className="flex-shrink-0 text-lg hover:scale-110 transition-transform"
                      >
                        {coach.is_starred ? '⭐' : '☆'}
                      </button>
                    </div>

                    {/* School */}
                    <div className="text-xs text-warm-500 truncate mb-3 flex items-center gap-1.5">
                      <span className="text-warm-400">🏫</span>
                      <span>{coach.school}</span>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        'px-2 py-0.5 rounded-lg text-xs font-semibold',
                        coach.division === 'D2' 
                          ? 'bg-blue-50 text-blue-700' 
                          : 'bg-violet-50 text-violet-700'
                      )}>
                        {coach.division}
                      </span>
                      
                      {coach.email && (
                        <a
                          href={`mailto:${coach.email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary-600 hover:text-primary-700 text-xs hover:underline"
                        >
                          ✉️
                        </a>
                      )}
                    </div>

                    {/* Tags / Notes indicator */}
                    {(coach.tags?.length || coach.notes) && (
                      <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-warm-100/50">
                        {coach.notes && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-warm-100 text-warm-500 rounded font-medium">
                            📝 Notes
                          </span>
                        )}
                        {coach.tags?.slice(0, 2).map((tag, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 bg-primary-50 text-primary-600 rounded font-medium">
                            {tag}
                          </span>
                        ))}
                        {(coach.tags?.length || 0) > 2 && (
                          <span className="text-[10px] text-warm-400">
                            +{(coach.tags?.length || 0) - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
