'use client';

import { useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { IconX, IconActivity } from '@/components/icons';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';

interface Props {
  score: number;
  breakdown: AdminDashboardData['growth']['platformHealthBreakdown'];
  onClose: () => void;
}

/** Modal that surfaces the per-metric breakdown for the Platform Health Score.
 *  Each row shows: Metric | Weight | Value | Contribution. The bottom shows a
 *  one-line interpretation derived from the highest + lowest contributors. */
export function HealthScoreBreakdownModal({ score, breakdown, onClose }: Props) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const interpretation = useMemo(() => {
    if (!breakdown || breakdown.length === 0) return null;
    const sorted = [...breakdown].sort((a, b) => b.contribution - a.contribution);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (!best || !worst || best.key === worst.key) return null;

    const strongLabel = strengthLabel(best.value);
    const weakLabel = weaknessLabel(worst.value);
    return `${strongLabel} ${best.label.toLowerCase()}, ${weakLabel} ${worst.label.toLowerCase()}.`;
  }, [breakdown]);

  const scoreColor =
    score >= 70 ? 'text-primary-600' : score >= 50 ? 'text-amber-600' : 'text-red-600';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="health-breakdown-title"
      >
        <div
          className="bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/20 max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100 bg-white/80 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center">
                <IconActivity size={18} className="text-primary-600" />
              </div>
              <div>
                <h2 id="health-breakdown-title" className="text-lg font-bold text-warm-900">
                  Platform Health Score
                </h2>
                <p className="text-xs text-warm-500">
                  How the {score}/100 score is computed
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 rounded-xl hover:bg-warm-50 text-warm-400 hover:text-warm-600 transition-colors"
            >
              <IconX size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Headline score */}
            <div className="flex items-baseline justify-between rounded-xl bg-warm-50/60 border border-warm-100/60 px-4 py-3">
              <span className="text-xs font-medium text-warm-500 uppercase tracking-wider">
                Composite Score
              </span>
              <span className={cn('text-3xl font-bold tabular-nums', scoreColor)}>
                {score}
                <span className="text-base text-warm-400 font-medium ml-1">/100</span>
              </span>
            </div>

            {/* Breakdown table */}
            <div className="rounded-xl border border-warm-100/60 overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-warm-50/60 text-[11px] font-semibold uppercase tracking-wider text-warm-500">
                <span className="col-span-5">Metric</span>
                <span className="col-span-2 text-right">Weight</span>
                <span className="col-span-2 text-right">Value</span>
                <span className="col-span-3 text-right">Contribution</span>
              </div>
              {breakdown.map((row) => {
                const valueColor =
                  row.value >= 70
                    ? 'text-primary-600'
                    : row.value >= 50
                      ? 'text-amber-600'
                      : 'text-red-600';
                return (
                  <div
                    key={row.key}
                    className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-warm-100/60 items-start"
                  >
                    <div className="col-span-5">
                      <p className="text-sm font-semibold text-warm-800">{row.label}</p>
                      <p className="text-xs text-warm-500 mt-0.5 leading-snug">
                        {row.description}
                      </p>
                    </div>
                    <span className="col-span-2 text-right text-sm tabular-nums text-warm-600 self-center">
                      {Math.round(row.weight * 100)}%
                    </span>
                    <span
                      className={cn(
                        'col-span-2 text-right text-sm font-semibold tabular-nums self-center',
                        valueColor,
                      )}
                    >
                      {row.rawDisplay}
                    </span>
                    <span className="col-span-3 text-right text-sm font-semibold tabular-nums text-warm-800 self-center">
                      +{row.contribution.toFixed(1)}
                    </span>
                  </div>
                );
              })}
              {/* Total row */}
              <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-t border-warm-200 bg-warm-50/60">
                <span className="col-span-9 text-xs font-semibold uppercase tracking-wider text-warm-600">
                  Total
                </span>
                <span className="col-span-3 text-right text-sm font-bold tabular-nums text-warm-900">
                  {score}/100
                </span>
              </div>
            </div>

            {/* Interpretation */}
            {interpretation && (
              <div className="rounded-xl bg-primary-50/60 border border-primary-100/60 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary-700 mb-1">
                  Interpretation
                </p>
                <p className="text-sm text-warm-800 leading-relaxed">{interpretation}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-warm-100 bg-white/80 px-6 py-3 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-warm-600 hover:text-warm-800 font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function strengthLabel(value: number): string {
  if (value >= 80) return 'Strong';
  if (value >= 60) return 'Solid';
  return 'Mixed';
}

function weaknessLabel(value: number): string {
  if (value < 30) return 'very weak';
  if (value < 50) return 'weak';
  if (value < 70) return 'moderate';
  return 'mild softness in';
}
