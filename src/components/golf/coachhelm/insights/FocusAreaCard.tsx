'use client';

import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import { IconChevronRight } from '@/components/icons';
import type { PlayerFocusArea } from '@/lib/coachhelm/insight-types';
import { getFocusAreaConfig } from '@/lib/coachhelm/insight-types';

interface FocusAreaCardProps {
  focusArea: PlayerFocusArea;
  onClick?: () => void;
}

export function FocusAreaCard({ focusArea, onClick }: FocusAreaCardProps) {
  const config = getFocusAreaConfig(focusArea.category);

  return (
    <GlassCard
      className={cn(
        'group transition-all duration-200',
        onClick && 'cursor-pointer hover:shadow-md hover:border-green-200'
      )}
      padding="md"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Priority Badge */}
        <div
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0',
            focusArea.priority === 1 && 'bg-green-100 text-green-700',
            focusArea.priority === 2 && 'bg-green-50 text-green-600',
            focusArea.priority === 3 && 'bg-warm-100 text-warm-600',
            focusArea.priority === 4 && 'bg-warm-50 text-warm-500',
            focusArea.priority === 5 && 'bg-warm-50 text-warm-400'
          )}
        >
          {focusArea.priority}
        </div>

        {/* Icon */}
        <div className="text-2xl flex-shrink-0">{config.icon}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-warm-900 text-sm mb-1">
            {focusArea.title}
          </h4>
          <p className="text-xs text-warm-600 leading-relaxed line-clamp-2">
            {focusArea.description}
          </p>

          {/* Target Improvement */}
          {focusArea.target_improvement && (
            <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full">
              🎯 {focusArea.target_improvement}
            </div>
          )}

          {/* Drills Count */}
          {focusArea.specific_drills && focusArea.specific_drills.length > 0 && (
            <p className="text-xs text-warm-400 mt-2">
              {focusArea.specific_drills.length} recommended drill{focusArea.specific_drills.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Arrow (if clickable) */}
        {onClick && (
          <IconChevronRight
            size={16}
            className="text-warm-300 group-hover:text-green-500 transition-colors flex-shrink-0"
          />
        )}
      </div>
    </GlassCard>
  );
}
