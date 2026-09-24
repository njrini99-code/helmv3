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
 * Presentation (UI audit 2026-09-23): a Fairway `Sheet` — an OPAQUE content
 * sheet with the shared grabber and the HIG header row (Cancel · title ·
 * Start goal). It replaced a hand-rolled `fixed inset-0` glass panel that:
 *   • let the page behind read through the form (`surface-lift` glass),
 *   • ignored Escape and never moved focus into the dialog,
 *   • rendered in place, not portaled — `position: fixed` inside a
 *     transformed page ancestor, the likely source of the blank band seen
 *     above it in the audit pane.
 * The Sheet primitive (vaul + Radix) now owns Escape, the focus trap, focus
 * return to the "Set a goal" button, scroll lock and reduced motion.
 */

import { useState, useTransition, useEffect, useId } from 'react';
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
import { Button } from '@/components/fairway/controls/button';
import { Input } from '@/components/ui/input';
// Fairway Select, NOT ui/select: ui/select portals its list to document.body,
// which inside a Radix-modal sheet is "outside" — tapping an option would
// dismiss the sheet. The Fairway Select portals into the sheet's own subtree.
import { Select } from '@/components/fairway/forms/Select';
import { Sheet } from '@/components/fairway/overlays/Sheet';

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

/**
 * Caption for a metric that HAS a standing reading but no honest auto-target
 * (`suggested_target === null`). Says which of the three reasons applies so
 * the empty field never reads as a loading failure.
 */
function noTargetCopy(
  s: Pick<GoalTargetSuggestion, 'baseline' | 'pga_value' | 'no_target_reason'>,
  unit: GoalTargetSuggestion['unit'],
): string {
  const baseline = s.baseline === null ? '' : formatValue(s.baseline, unit);
  switch (s.no_target_reason) {
    case 'basis_mismatch':
      return `Your ${baseline} counts only approaches that hit the green; the Tour figure counts every approach, so there is no Tour target to aim at — set your own.`;
    case 'already_ahead':
      return s.pga_value === null
        ? `You are at ${baseline}, ahead of the Tour anchor — set a target to hold or extend it.`
        : `You are at ${baseline}, ahead of Tour (${formatValue(s.pga_value, unit)}) — set a target to hold or extend it.`;
    case 'no_womens_anchor':
      return `Your baseline is ${baseline}. No women’s Tour benchmark for this metric yet — set a target to aim for.`;
    default:
      return `Your baseline is ${baseline} — set a target to aim for.`;
  }
}

export function GoalCreationModal({
  open,
  onClose,
  initialMetricId,
}: GoalCreationModalProps) {
  const metricLabelId = useId();
  const windowLabelId = useId();
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
      // Untouched auto-fill = midpoint; an edited value = manual. A standing
      // with no honest auto-target (`no_target_reason`) never auto-fills, so
      // anything in the field is the user's own number.
      target_source =
        !userEdited && suggestion?.hasStanding && suggestion.suggested_target !== null
          ? 'midpoint'
          : 'manual';
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
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      side="bottom"
      title="New focus area"
      data-slot="goal-creation-modal"
      // A save in flight can't be abandoned by a drag, a scrim tap or Escape.
      dismissible={!pending}
      className="md:mx-auto md:w-full md:max-w-md"
      leadingAction={
        <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
      }
      trailingAction={
        <Button variant="primary" size="sm" type="button" onClick={submit} disabled={pending}>
          {pending ? 'Saving…' : 'Start focus area'}
        </Button>
      }
    >
      <Sheet.Body className="space-y-4 pt-4">
        {/* Metric picker */}
        <div>
          <span id={metricLabelId} className="text-body-sm font-medium text-text-secondary">
            What stat?
          </span>
          <div className="mt-1">
            <Select
              aria-labelledby={metricLabelId}
              value={metricId}
              onValueChange={(v) => {
                if (v) setMetricId(v as MetricId);
              }}
              options={METRIC_IDS.map((id) => ({
                value: id,
                label: METRIC_RENDER_CONFIG[id].display_label,
              }))}
            />
          </div>
        </div>

        {/* Window picker */}
        <div>
          <span id={windowLabelId} className="text-body-sm font-medium text-text-secondary">
            How long?
          </span>
          <div className="mt-1">
            <Select
              aria-labelledby={windowLabelId}
              value={String(windowDays)}
              onValueChange={(v) => {
                if (v) setWindowDays(Number(v));
              }}
              options={WINDOW_OPTIONS.map((opt) => ({
                value: String(opt.days),
                label: opt.label,
              }))}
            />
          </div>
        </div>

        {/* Target value — auto-filled from the player's live standing */}
        <label className="block">
          <span className="text-body-sm font-medium text-text-secondary">
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
            <span className="mt-1 block text-caption text-text-tertiary">Finding your baseline…</span>
          ) : suggestion?.hasStanding &&
            suggestion.suggested_target !== null &&
            suggestion.baseline !== null &&
            suggestion.pga_value !== null ? (
            <span className="mt-1 block text-caption text-text-tertiary">
              {userEdited ? 'Suggested' : 'Auto-filled'}:{' '}
              {formatValue(suggestion.suggested_target, cfg.unit)} — halfway to Tour
              ({formatValue(suggestion.pga_value, cfg.unit)}) from your{' '}
              {formatValue(suggestion.baseline, cfg.unit)}
            </span>
          ) : suggestion?.hasStanding && suggestion.baseline !== null ? (
            <span className="mt-1 block text-caption text-text-tertiary">
              {noTargetCopy(suggestion, cfg.unit)}
            </span>
          ) : suggestion && !suggestion.hasStanding ? (
            <span className="mt-1 block text-caption text-text-tertiary">
              No baseline logged yet — set a target to aim for.
            </span>
          ) : null}
        </label>

        {/* Share toggle */}
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
          <span className="text-body-sm font-medium text-text-secondary">Share with coach?</span>
          <input
            type="checkbox"
            checked={shareWithCoach}
            onChange={(e) => setShareWithCoach(e.target.checked)}
            className="h-5 w-5 rounded border-border-strong accent-[var(--fw-color-accent-650)]"
          />
        </label>

        {error && (
          <p role="alert" className="text-body-sm text-fw-danger-ink">{error}</p>
        )}
      </Sheet.Body>
    </Sheet>
  );
}
