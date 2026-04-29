'use client';

import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconChevronRight,
  IconTarget,
  IconCrosshair,
  IconFlag,
  IconCircleDot,
  IconMap,
  IconBrain,
  IconTrophy,
  IconWind,
  IconDumbbell,
  IconClipboardList,
} from '@/components/icons';
import type { ComponentType } from 'react';
import type { PlayerFocusArea, FocusAreaIconName } from '@/lib/coachhelm/insight-types';
import { getFocusAreaConfig } from '@/lib/coachhelm/insight-types';

const FOCUS_AREA_ICON_MAP: Record<FocusAreaIconName, ComponentType<{ size?: number; className?: string }>> = {
  crosshair: IconCrosshair,
  flag: IconFlag,
  'circle-dot': IconCircleDot,
  map: IconMap,
  brain: IconBrain,
  trophy: IconTrophy,
  target: IconTarget,
  wind: IconWind,
  dumbbell: IconDumbbell,
  'clipboard-list': IconClipboardList,
};

interface FocusAreaCardProps {
  focusArea: PlayerFocusArea;
  onClick?: () => void;
}

export function FocusAreaCard({ focusArea, onClick }: FocusAreaCardProps) {
  // DB rows use `area_type`; `category` was the client-side name. Accept both
  // so we don't crash on rows that only ship `area_type`.
  const areaKey = focusArea.category ?? (focusArea as unknown as { area_type?: string }).area_type;
  const config = getFocusAreaConfig(areaKey);
  const AreaIcon = FOCUS_AREA_ICON_MAP[config.icon] ?? IconTarget;

  return (
    <GlassCard
      className={cn(
        'group transition-all duration-200',
        onClick && 'cursor-pointer hover:shadow-md hover:border-primary-200'
      )}
      padding="md"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Priority Badge */}
        <div
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0',
            focusArea.priority === 1 && 'bg-primary-100 text-primary-700',
            focusArea.priority === 2 && 'bg-primary-50 text-primary-600',
            focusArea.priority === 3 && 'bg-warm-100 text-warm-600',
            focusArea.priority === 4 && 'bg-warm-50 text-warm-500',
            focusArea.priority === 5 && 'bg-warm-50 text-warm-400'
          )}
        >
          {focusArea.priority}
        </div>

        {/* Icon */}
        <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
          <AreaIcon size={18} />
        </div>

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
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 text-primary-700 text-xs font-semibold rounded-full ring-1 ring-primary-100">
              <IconTarget size={12} className="text-primary-600" />
              {focusArea.target_improvement}
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
            className="text-warm-300 group-hover:text-primary-500 transition-colors flex-shrink-0"
          />
        )}
      </div>
    </GlassCard>
  );
}
