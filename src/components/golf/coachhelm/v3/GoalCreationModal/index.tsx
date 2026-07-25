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
 *
 * Tier 4 polish (v3 feature audit feature #4): the panel uses `surface-lift`
 * (Liquid Glass material) + canonical `drawerVariants` for the entrance,
 * with the backdrop fading via `backdropVariants`. Wrapped in
 * `AnimatePresence` so the exit animation runs cleanly when `open`
 * flips false.
 */

import { useState, useTransition, useEffect } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import {
  createGoal,
  suggestGoalTarget,
  type GoalTargetSuggestion,
} from '@/app/golf/actions/v3/goals';
import type { GoalTargetSource } from '@/lib/coachhelm/v3/goals/types';
import {
  METRIC_IDS,
  type MetricId,
} from '@/lib/coachhelm/v3/metrics/registry';
import { METRIC_RENDER_CONFIG } from '@/lib/coachhelm/v3/standing/metric-config';
import { formatValue } from '@/components/golf/coachhelm/v3/StandingBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  drawerVariants,
  drawerTransition,
  backdropVariants,
  backdropTransition,
} from '@/lib/coachhelm/v3/motion';

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

/** Tidy precision for the editable target input — 2dp for strokes, 1dp else. */
function roundForInput(value: number, unit: GoalTargetSuggestion['unit']): string {
  const dp = unit === 'strokes' ? 2 : 1;
  return String(Number(value.toFixed(dp)));
}

export function GoalCreationModal({
  open,
  onClose,
  initialMetricId,
}: GoalCreationModalProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  const [metricId, setMetricId] = useState<MetricId>(initialMetricId ?? 'sg_putting');
  const [windowDays, setWindowDays] = useState(30);
  const [targetValue, setTargetValue] = useState<string>('');
  const [shareWithCoach, setShareWithCoach] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Auto-fill: the player's live standing on the chosen metric drives a
  // suggested target (midpoint to Tour) + a captured baseline. `userEdited`
  // flips once they type, so we can stamp the right target_source on submit.
  const [suggestion, setSuggestion] = useState<GoalTargetSuggestion | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [userEdited, setUserEdited] = useState(false);

  const cfg = METRIC_RENDER_CONFIG[metricId];

  // Fetch + auto-fill whenever the metric changes (or the modal opens). Picking
  // a new stat always re-fills the suggested target; the player can then edit.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingSuggestion(true);
    setSuggestion(null);
    suggestGoalTarget(metricId)
      .then((s) => {
        if (cancelled) return;
        setSuggestion(s);
        setTargetValue(
          s.hasStanding && s.suggested_target !== null
            ? roundForInput(s.suggested_target, s.unit)
            : '',
        );
        setUserEdited(false);
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestion(false);
      });
    return () => {
      cancelled = true;
    };
  }, [metricId, open]);

  function submit() {
    setError(null);
    const raw = targetValue.trim();
    let target: number | null;
    let target_source: GoalTargetSource | null;
    if (raw === '') {
      // Blank → fall back to the suggested target if we have one (honest null
      // only when there's no standing to base a target on).
      target = suggestion?.suggested_target ?? null;
      target_source = target !== null ? 'midpoint' : null;
    } else {
      const n = Number(raw);
      if (Number.isNaN(n)) {
        setError('Target must be a number');
        return;
      }
      target = n;
      // Untouched auto-fill = midpoint; an edited value = manual.
      target_source = !userEdited && suggestion?.hasStanding ? 'midpoint' : 'manual';
    }
    // Capture the current value as the baseline so the progress track has a
    // real starting tick from day one (cron moves `current` off it later).
    const baseline = suggestion?.baseline ?? null;
    const endsAt = new Date(Date.now() + windowDays * 86400_000).toISOString();
    startTransition(async () => {
      const result = await createGoal({
        metric_id: metricId,
        title: `${cfg.display_label} — ${windowDays}-day goal`,
        category: 'manual',
        ends_at: endsAt,
        target_value: target,
        target_source,
        baseline_value: baseline,
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
    <AnimatePresence>
      {open && (
        <m.div
          key="goal-creation-modal"
          data-testid="goal-creation-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Create new goal"
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={prefersReducedMotion ? { duration: 0 } : (backdropTransition)}
          onClick={onClose}
        >
          <m.div
            className="surface-lift w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-t-3xl md:rounded-3xl p-6"
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={prefersReducedMotion ? { duration: 0 } : (drawerTransition)}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-medium text-warm-900 mb-4">New goal</h2>

            <div className="space-y-4">
              {/* Metric picker */}
              <div>
                <span className="text-xs font-medium text-warm-700">What stat?</span>
                <div className="mt-1">
                  <Select
                    value={metricId}
                    onChange={(v) => setMetricId(v as MetricId)}
                    options={METRIC_IDS.map((id) => ({
                      value: id,
                      label: METRIC_RENDER_CONFIG[id].display_label,
                    }))}
                  />
                </div>
              </div>

              {/* Window picker */}
              <div>
                <span className="text-xs font-medium text-warm-700">How long?</span>
                <div className="mt-1">
                  <Select
                    value={String(windowDays)}
                    onChange={(v) => setWindowDays(Number(v))}
                    options={WINDOW_OPTIONS.map((opt) => ({
                      value: String(opt.days),
                      label: opt.label,
                    }))}
                  />
                </div>
              </div>

              {/* Target value — auto-filled from the player's live standing */}
              <label className="block">
                <span className="text-xs font-medium text-warm-700">
                  Target ({cfg.unit})
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={targetValue}
                  onChange={(e) => {
                    setTargetValue(e.target.value);
                    setUserEdited(true);
                  }}
                  placeholder={loadingSuggestion ? 'Finding your baseline…' : 'Enter a target'}
                  className="mt-1 tabular-nums"
                />
                {loadingSuggestion ? (
                  <span className="mt-1 block text-xs text-warm-500">Finding your baseline…</span>
                ) : suggestion?.hasStanding &&
                  suggestion.suggested_target !== null &&
                  suggestion.baseline !== null &&
                  suggestion.pga_value !== null ? (
                  <span className="mt-1 block text-xs text-warm-500">
                    {userEdited ? 'Suggested' : 'Auto-filled'}:{' '}
                    {formatValue(suggestion.suggested_target, cfg.unit)} — halfway to Tour
                    ({formatValue(suggestion.pga_value, cfg.unit)}) from your{' '}
                    {formatValue(suggestion.baseline, cfg.unit)}
                  </span>
                ) : suggestion && !suggestion.hasStanding ? (
                  <span className="mt-1 block text-xs text-warm-500">
                    No baseline logged yet — set a target to aim for.
                  </span>
                ) : null}
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
              <Button variant="ghost"
                type="button"
                onClick={onClose}
                disabled={pending}
                className="text-sm text-warm-700 px-4 py-2 rounded-xl hover:bg-warm-100 transition-colors"
              >
                Cancel
              </Button>
              <Button variant="primary"
                type="button"
                onClick={submit}
                disabled={pending}
                className="text-sm bg-accent-650 text-text-on-accent px-4 py-2 rounded-xl hover:bg-primary-700 disabled:opacity-60 transition-colors"
              >
                {pending ? 'Saving…' : 'Start goal'}
              </Button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
