'use client';

import { cn } from '@/lib/utils';
import { AreaToReview, AreaType } from '@/lib/coachhelm/types';
import {
  IconAlertCircle,
  IconTrendingDown,
  IconTarget,
  IconFlag,
  IconCrosshair,
  IconRoute,
  IconArrowDown,
} from '@/components/icons';

interface AreasToReviewSectionProps {
  areas: AreaToReview[];
}

// Config-driven icon mapping for review area types. Mirrors the (legacy) emoji
// mapping in `AREA_CONFIG` but renders as proper line-icons so we get accessible,
// crisp, color-tokenized affordances instead of system-font emoji glyphs.
const AREA_ICON_CONFIG: Record<
  AreaType,
  { Icon: React.ComponentType<{ size?: number; className?: string }>; className: string }
> = {
  three_putt: { Icon: IconAlertCircle, className: 'text-destructive' },
  double_bogey_plus: { Icon: IconTrendingDown, className: 'text-destructive' },
  penalty: { Icon: IconAlertCircle, className: 'text-destructive' },
  missed_short_putt: { Icon: IconTarget, className: 'text-warning' },
  poor_approach: { Icon: IconCrosshair, className: 'text-warning' },
  missed_fairway_trouble: { Icon: IconFlag, className: 'text-warning' },
  poor_course_management: { Icon: IconRoute, className: 'text-warning' },
  failed_up_and_down: { Icon: IconArrowDown, className: 'text-warning' },
};

export function AreasToReviewSection({ areas }: AreasToReviewSectionProps) {
  if (areas.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-warm-200 bg-white p-5"
      style={{ animation: 'fadeInUp 0.5s ease-out 0.4s both' }}
    >
      <h3 className="text-sm font-medium text-warm-900 mb-4 flex items-center gap-2">
        <IconCrosshair size={18} className="text-warm-500" />
        Areas to Review
      </h3>

      <div className="space-y-3">
        {areas.map((area, index) => {
          const iconConfig = AREA_ICON_CONFIG[area.type];
          const AreaIcon = iconConfig?.Icon ?? IconAlertCircle;
          const iconClass = iconConfig?.className ?? 'text-warning';
          return (
            <div
              key={area.id}
              className={cn(
                'p-4 rounded-xl border-l-4',
                area.severity === 'high' && 'bg-red-50 border-l-red-500',
                area.severity === 'medium' && 'bg-amber-50 border-l-amber-500',
                area.severity === 'low' && 'bg-warm-50 border-l-warm-400',
              )}
              style={{
                animation: `fadeInUp 0.4s ease-out ${400 + index * 80}ms both`,
              }}
            >
              <div className="flex items-start gap-3">
                <AreaIcon size={20} className={cn('flex-shrink-0 mt-0.5', iconClass)} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-warm-900">{area.title}</span>
                  </div>
                  <p className="text-sm text-warm-600">{area.description}</p>

                  {/* Root cause */}
                  <div className="mt-2 pt-2 border-t border-warm-200/60">
                    <div className="text-xs font-medium text-warm-500 mb-1">Root Cause</div>
                    <p className="text-sm text-warm-700">{area.rootCause}</p>
                  </div>

                  {/* Linked focus area */}
                  {area.linkedFocusArea && (
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded">
                        Practice Focus: {area.linkedFocusArea.replace(/_/g, ' ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
