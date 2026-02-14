'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { Coach, CoachStatus } from '../page';
import { IconStar, IconStarFilled, IconMail } from '@/components/icons';

interface PipelineViewProps {
  coaches: Coach[];
  onCoachClick: (coach: Coach) => void;
  onStatusChange: (coachId: string, status: CoachStatus) => void;
  onToggleStar: (coachId: string, currentStarred: boolean) => void;
  statusConfig: Record<CoachStatus, { label: string; color: string; bgColor: string; stage: string; order: number }>;
  priorityConfig: Record<number, { label: string; color: string; icon: string }>;
}

// Group statuses into pipeline columns
const PIPELINE_COLUMNS = [
  { 
    id: 'leads', 
    title: '🎯 Leads', 
    statuses: ['new_lead', 'researching', 'outreach_pending'] as CoachStatus[],
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200'
  },
  { 
    id: 'active', 
    title: '💬 Active', 
    statuses: ['initial_contact', 'follow_up', 'engaged'] as CoachStatus[],
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200'
  },
  { 
    id: 'closing', 
    title: '🤝 Closing', 
    statuses: ['demo_scheduled', 'demo_completed', 'proposal_sent', 'negotiating'] as CoachStatus[],
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200'
  },
  { 
    id: 'won', 
    title: '✅ Won', 
    statuses: ['closed_won'] as CoachStatus[],
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200'
  },
  { 
    id: 'other', 
    title: '📁 Other', 
    statuses: ['closed_lost', 'not_interested', 'bad_timing', 'nurture'] as CoachStatus[],
    bgColor: 'bg-warm-50',
    borderColor: 'border-warm-200'
  },
];

export function PipelineView({
  coaches,
  onCoachClick,
  onStatusChange,
  onToggleStar,
  statusConfig,
  priorityConfig,
}: PipelineViewProps) {
  // Group coaches by column
  const coachesByColumn = useMemo(() => {
    const groups: Record<string, Coach[]> = {};
    PIPELINE_COLUMNS.forEach(col => {
      groups[col.id] = coaches.filter(c => col.statuses.includes(c.status))
        .sort((a, b) => {
          // Sort by starred first, then by priority, then by updated_at
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

  const handleDrop = (e: React.DragEvent, targetStatus: CoachStatus | undefined) => {
    e.preventDefault();
    const coachId = e.dataTransfer.getData('coachId');
    if (coachId && targetStatus) {
      onStatusChange(coachId, targetStatus);
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[600px]">
      {PIPELINE_COLUMNS.map((column) => {
        const columnCoaches = coachesByColumn[column.id] || [];
        const firstStatus = column.statuses[0];
        
        return (
          <div
            key={column.id}
            className={cn(
              'flex-shrink-0 w-72 rounded-xl border',
              column.bgColor,
              column.borderColor
            )}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, firstStatus)}
          >
            {/* Column Header */}
            <div className="p-3 border-b border-warm-200/50">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-warm-900">{column.title}</h3>
                <span className="px-2 py-0.5 bg-white/80 rounded-full text-xs font-medium text-warm-600">
                  {columnCoaches.length}
                </span>
              </div>
              {/* Sub-status breakdown */}
              <div className="flex flex-wrap gap-1 mt-2">
                {column.statuses.map(status => {
                  const count = columnCoaches.filter(c => c.status === status).length;
                  if (count === 0) return null;
                  return (
                    <span 
                      key={status}
                      className={cn(
                        'px-1.5 py-0.5 rounded text-xs font-medium',
                        statusConfig[status]?.bgColor,
                        statusConfig[status]?.color
                      )}
                    >
                      {statusConfig[status]?.label}: {count}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Cards */}
            <div className="p-2 space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
              {columnCoaches.length === 0 ? (
                <div className="text-center py-8 text-warm-400 text-sm">
                  No coaches
                </div>
              ) : (
                columnCoaches.map((coach) => (
                  <div
                    key={coach.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, coach)}
                    onClick={() => onCoachClick(coach)}
                    className={cn(
                      'bg-white rounded-lg border border-warm-200 p-3 cursor-pointer',
                      'hover:shadow-md hover:border-warm-300 transition-all',
                      'active:shadow-lg active:scale-[0.98]',
                      coach.highlight_color && 'border-l-4',
                      coach.priority >= 2 && !coach.highlight_color && 'border-l-4 border-l-red-400'
                    )}
                    style={{
                      borderLeftColor: coach.highlight_color || undefined
                    }}
                  >
                    {/* Header with star and priority */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1 min-w-0">
                        {coach.priority > 0 && (
                          <span className={cn('text-sm flex-shrink-0', priorityConfig[coach.priority]?.color)}>
                            {priorityConfig[coach.priority]?.icon}
                          </span>
                        )}
                        <span className="font-medium text-warm-900 truncate text-sm">
                          {coach.name}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleStar(coach.id, coach.is_starred);
                        }}
                        className={cn(
                          'flex-shrink-0 p-0.5 rounded transition-colors',
                          coach.is_starred 
                            ? 'text-yellow-500 hover:text-yellow-600' 
                            : 'text-warm-300 hover:text-yellow-400'
                        )}
                      >
                        {coach.is_starred ? (
                          <IconStarFilled className="w-3.5 h-3.5" />
                        ) : (
                          <IconStar className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {/* School */}
                    <div className="text-xs text-warm-600 truncate mb-1">
                      {coach.school}
                    </div>

                    {/* Status badge */}
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-xs font-medium',
                        statusConfig[coach.status]?.bgColor,
                        statusConfig[coach.status]?.color
                      )}>
                        {statusConfig[coach.status]?.label}
                      </span>
                      
                      <div className="flex items-center gap-1">
                        <span className={cn(
                          'px-1.5 py-0.5 rounded text-xs font-semibold',
                          coach.division === 'D2' 
                            ? 'bg-blue-100 text-blue-700' 
                            : 'bg-purple-100 text-purple-700'
                        )}>
                          {coach.division}
                        </span>
                      </div>
                    </div>

                    {/* Email (on hover) */}
                    {coach.email && (
                      <a
                        href={`mailto:${coach.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline truncate"
                      >
                        <IconMail className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{coach.email}</span>
                      </a>
                    )}

                    {/* Follow-up indicator */}
                    {coach.next_follow_up_at && (
                      <div className={cn(
                        'mt-2 text-xs',
                        new Date(coach.next_follow_up_at) < new Date() 
                          ? 'text-red-600 font-medium' 
                          : 'text-warm-500'
                      )}>
                        📅 {new Date(coach.next_follow_up_at) < new Date() ? 'Overdue: ' : ''}
                        {new Date(coach.next_follow_up_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
