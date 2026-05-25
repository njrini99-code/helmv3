'use client';

/**
 * GoalCreationModal (W19) — player-facing goal creation form.
 *
 * Master plan Part VI.4 sketch:
 *
 *   ┌─────────────────────────────┐
 *   │ New Goal                    │
 *   ├─────────────────────────────┤
 *   │ What stat?  [metric ▾]      │
 *   │ How long?   [30 days ▾]     │
 *   │ Target:     [18%]           │
 *   │ Share with coach? ○ Off     │
 *   │ [Cancel]    [Start Goal]    │
 *   └─────────────────────────────┘
 *
 * Coach-side modal (with player picker + mandatory toggle) is a follow-up.
 */

import { useState, useTransition } from 'react';
import { createGoal } from '@/app/golf/actions/v3/goals';
import {
  METRIC_IDS,
  type MetricId,
} from '@/lib/coachhelm/v3/metrics/registry';
import { METRIC_RENDER_CONFIG } from '@/lib/coachhelm/v3/standing/metric-config';

export interface GoalCreationModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional pre-selected metric (e.g. from "accept suggestion" flow). */
  initialMetricId?: MetricId;
}

const WINDOW_OPTIONS = [
  { label: '1 week',  days: 7   },
  { label: '2 weeks', days: 14  },
  { label: '30 days', days: 30  },
  { label: '60 days', days: 60  },
  { label: '90 days', days: 90  },
];

export function GoalCreationModal({
  open,
  onClose,
  initialMetricId,
}: GoalCreationModalProps) {
  const [metricId, setMetricId] = useState<MetricId>(initialMetricId ?? 'sg_putting');
  const [windowDays, setWindowDays] = useState(30);
  const [targetValue, setTargetValue] = useState<string>('');
  const [shareWithCoach, setShareWithCoach] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const cfg = METRIC_RENDER_CONFIG[metricId];

  function submit() {
    setError(null);
    const target = targetValue.trim() === '' ? null : Number(targetValue);
    if (target !== null && Number.isNaN(target)) {
      setError('Target must be a number');
      return;
    }
    const endsAt = new Date(Date.now() + windowDays * 86400_000).toISOString();
    startTransition(async () => {
      const result = await createGoal({
        metric_id: metricId,
        title: `${cfg.display_label} — ${windowDays}-day goal`,
        category: 'manual',
        ends_at: endsAt,
        target_value: target,
        target_source: target !== null ? 'manual' : null,
        baseline_value: null,
        shared_with_coach: shareWithCoach,
      });
      if (!result.ok) {
        setError(result.error ?? 'Failed to create');
        return;
      }
      onClose();
    });
  }

  return (
    <div
      data-testid="goal-creation-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Create new goal"
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-t-3xl md:rounded-3xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-medium text-warm-900 mb-4">New goal</h2>

        <div className="space-y-4">
          {/* Metric picker */}
          <label className="block">
            <span className="text-xs font-medium text-warm-700">What stat?</span>
            <select
              value={metricId}
              onChange={(e) => setMetricId(e.target.value as MetricId)}
              className="mt-1 block w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm focus:border-primary-600 focus:outline-none"
            >
              {METRIC_IDS.map((id) => (
                <option key={id} value={id}>
                  {METRIC_RENDER_CONFIG[id].display_label}
                </option>
              ))}
            </select>
          </label>

          {/* Window picker */}
          <label className="block">
            <span className="text-xs font-medium text-warm-700">How long?</span>
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              className="mt-1 block w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm focus:border-primary-600 focus:outline-none"
            >
              {WINDOW_OPTIONS.map((opt) => (
                <option key={opt.days} value={opt.days}>{opt.label}</option>
              ))}
            </select>
          </label>

          {/* Target value */}
          <label className="block">
            <span className="text-xs font-medium text-warm-700">
              Target ({cfg.unit})
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="Leave blank for auto-target"
              className="mt-1 block w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm focus:border-primary-600 focus:outline-none tabular-nums"
            />
          </label>

          {/* Share toggle */}
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-xs font-medium text-warm-700">Share with coach?</span>
            <input
              type="checkbox"
              checked={shareWithCoach}
              onChange={(e) => setShareWithCoach(e.target.checked)}
              className="h-4 w-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500"
            />
          </label>

          {error && (
            <p role="alert" className="text-xs text-red-600">{error}</p>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-sm text-warm-700 px-4 py-2 rounded-xl hover:bg-warm-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="text-sm bg-primary-600 text-white px-4 py-2 rounded-xl hover:bg-primary-700 disabled:opacity-60 transition-colors"
          >
            {pending ? 'Saving…' : 'Start goal'}
          </button>
        </div>
      </div>
    </div>
  );
}
