'use client';

import { useMemo } from 'react';
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

const PIPELINE_COLUMNS: { status: CoachStatus; gradient: string }[] = [
  { status: 'new_lead', gradient: 'from-slate-500 to-slate-600' },
  { status: 'contacted', gradient: 'from-blue-500 to-blue-600' },
  { status: 'demo_scheduled', gradient: 'from-violet-500 to-violet-600' },
  { status: 'customer', gradient: 'from-emerald-500 to-emerald-600' },
  { status: 'closed', gradient: 'from-rose-500 to-rose-600' },
];

export function PipelineView({
  coaches,
  onCoachClick,
  onStatusChange,
  onToggleStar,
  statusConfig,
  priorityConfig,
}: PipelineViewProps) {
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
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetStatus: CoachStatus) => {
    e.preventDefault();
    const coachId = e.dataTransfer.getData('coachId');
    if (coachId) {
      onStatusChange(coachId, targetStatus);
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {PIPELINE_COLUMNS.map((column) => {
        const config = statusConfig[column.status];
        const columnCoaches = coachesByStatus[column.status] || [];
        
        return (
          <div
            key={column.status}
            className="flex-shrink-0 w-72"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.status)}
          >
            {/* Column Header */}
            <div className={cn(
              'rounded-t-xl px-4 py-3 bg-gradient-to-r text-white',
              column.gradient
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{config.icon}</span>
                  <span className="font-bold">{config.label}</span>
                </div>
                <span className="px-2.5 py-1 bg-white/20 rounded-full text-sm font-bold">
                  {columnCoaches.length}
                </span>
              </div>
            </div>

            {/* Cards Container */}
            <div className="bg-slate-100 rounded-b-xl p-3 space-y-2 min-h-[400px] max-h-[calc(100vh-320px)] overflow-y-auto">
              {columnCoaches.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <div className="text-3xl mb-2">📭</div>
                  <p className="text-sm">Drop coaches here</p>
                </div>
              ) : (
                columnCoaches.map((coach) => (
                  <div
                    key={coach.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, coach)}
                    onClick={() => onCoachClick(coach)}
                    className={cn(
                      'bg-white rounded-xl p-3 cursor-pointer transition-all',
                      'hover:shadow-md hover:scale-[1.02] active:scale-[0.98]',
                      'border-2 border-transparent',
                      coach.is_starred && 'border-amber-300 bg-amber-50',
                      coach.priority === 2 && !coach.is_starred && 'border-orange-300 bg-orange-50'
                    )}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {coach.priority > 0 && (
                          <span className="flex-shrink-0">{priorityConfig[coach.priority]?.icon}</span>
                        )}
                        <span className="font-semibold text-slate-900 text-sm truncate">
                          {coach.name}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleStar(coach.id, coach.is_starred);
                        }}
                        className="flex-shrink-0 text-lg"
                      >
                        {coach.is_starred ? '⭐' : '☆'}
                      </button>
                    </div>

                    {/* School */}
                    <div className="text-xs text-slate-600 truncate mb-2">
                      🏫 {coach.school}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        'px-2 py-0.5 rounded-lg text-xs font-bold',
                        coach.division === 'D2' 
                          ? 'bg-blue-100 text-blue-700' 
                          : 'bg-violet-100 text-violet-700'
                      )}>
                        {coach.division}
                      </span>
                      
                      {coach.email && (
                        <a
                          href={`mailto:${coach.email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-600 hover:text-blue-800 text-xs"
                        >
                          ✉️
                        </a>
                      )}
                    </div>
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
