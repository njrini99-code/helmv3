'use client';

import { Highlight, HIGHLIGHT_CONFIG } from '@/lib/coachhelm/types';

interface HighlightsSectionProps {
  highlights: Highlight[];
}

export function HighlightsSection({ highlights }: HighlightsSectionProps) {
  if (highlights.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-5"
      style={{ animation: 'fadeInUp 0.5s ease-out 0.3s both' }}
    >
      <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <span className="text-lg">✨</span>
        Highlights
      </h3>

      <div className="space-y-3">
        {highlights.map((highlight, index) => {
          const config = HIGHLIGHT_CONFIG[highlight.type];
          return (
            <div
              key={highlight.id}
              className="flex items-start gap-3 p-3 rounded-xl bg-gradient-to-r from-green-50 to-white border border-green-100"
              style={{
                animation: `fadeInUp 0.4s ease-out ${300 + index * 80}ms both`,
              }}
            >
              <span className="text-2xl">{highlight.emoji || config?.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{highlight.title}</span>
                  <span className="text-xs text-slate-500">Hole {highlight.holeNumber}</span>
                </div>
                <p className="text-sm text-slate-600 mt-0.5">{highlight.description}</p>
              </div>
              <div className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded">
                {highlight.impact}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
