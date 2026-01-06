'use client';

import { cn } from '@/lib/utils';
import { AreaToReview, AREA_CONFIG } from '@/lib/coachhelm/types';

interface AreasToReviewSectionProps {
  areas: AreaToReview[];
}

export function AreasToReviewSection({ areas }: AreasToReviewSectionProps) {
  if (areas.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-5"
      style={{ animation: 'fadeInUp 0.5s ease-out 0.4s both' }}
    >
      <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <span className="text-lg">🔍</span>
        Areas to Review
      </h3>

      <div className="space-y-3">
        {areas.map((area, index) => {
          const config = AREA_CONFIG[area.type];
          return (
            <div
              key={area.id}
              className={cn(
                'p-4 rounded-xl border-l-4',
                area.severity === 'high' && 'bg-red-50 border-l-red-500',
                area.severity === 'medium' && 'bg-amber-50 border-l-amber-500',
                area.severity === 'low' && 'bg-slate-50 border-l-slate-400',
              )}
              style={{
                animation: `fadeInUp 0.4s ease-out ${400 + index * 80}ms both`,
              }}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">{config?.emoji || '⚠️'}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-slate-900">{area.title}</span>
                  </div>
                  <p className="text-sm text-slate-600">{area.description}</p>

                  {/* Root cause */}
                  <div className="mt-2 pt-2 border-t border-slate-200/60">
                    <div className="text-xs font-medium text-slate-500 mb-1">Root Cause</div>
                    <p className="text-sm text-slate-700">{area.rootCause}</p>
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
