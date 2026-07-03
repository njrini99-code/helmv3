'use client';

import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  IconPlus,
  IconLoader,
  IconClock,
  IconUsers,
  IconBookmark,
} from '@/components/icons';
import {
  getSequence,
  listEnrollments,
  getSequenceEnrollmentCounts,
  getSequencePerformance,
  type CrmSequence,
  type CrmSequenceStep,
  type CrmSequenceEnrollment,
  type SequenceEnrollmentCounts,
  type SequencePerformance,
  type SequencePerformanceStep,
} from '@/app/golf/actions/crm-sequences';
import { SequenceStepEditor } from './SequenceStepEditor';
import { EnrollSegmentDialog } from './EnrollSegmentDialog';
import { Button } from '@/components/ui/button';

// ============================================================================
// SequenceBuilder — inline editor for a single sequence. Vertical stepper of
// step cards: each card shows step #, delay, and template/override summary.
// Inline "Add step" button + "Enroll segment" button.
// ============================================================================

interface SequenceBuilderProps {
  sequenceId: string;
  /** Optional callback whenever steps change (parent can re-fetch counts). */
  onChange?: () => void;
}

export function SequenceBuilder({ sequenceId, onChange }: SequenceBuilderProps) {
  const [sequence, setSequence] = useState<CrmSequence | null>(null);
  const [steps, setSteps] = useState<CrmSequenceStep[]>([]);
  const [enrollments, setEnrollments] = useState<CrmSequenceEnrollment[]>([]);
  const [counts, setCounts] = useState<SequenceEnrollmentCounts | null>(null);
  const [performance, setPerformance] = useState<SequencePerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { sequence: seq, steps: seqSteps } = await getSequence(sequenceId);
      const [enrolled, enrollCounts, perf] = await Promise.all([
        listEnrollments(sequenceId, { limit: 200 }),
        getSequenceEnrollmentCounts(sequenceId),
        // Reply metrics are best-effort: never blank the builder over a stats
        // hiccup. On failure we simply hide the performance row.
        getSequencePerformance(sequenceId).catch(() => null),
      ]);
      setSequence(seq);
      setSteps(seqSteps);
      setEnrollments(enrolled);
      setCounts(enrollCounts);
      setPerformance(perf);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sequence');
    } finally {
      setLoading(false);
    }
  }, [sequenceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleStepSaved = (saved: CrmSequenceStep) => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next.sort((a, b) => a.step_order - b.step_order);
      }
      // Replace any step at same step_order (the upsert collapses by
      // unique (sequence_id, step_order)).
      const replaced = prev.filter((s) => s.step_order !== saved.step_order);
      return [...replaced, saved].sort((a, b) => a.step_order - b.step_order);
    });
    setEditingStepId(null);
    setAdding(false);
    onChange?.();
  };

  const handleStepDeleted = (deletedId: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== deletedId));
    setEditingStepId(null);
    onChange?.();
  };

  const nextStepOrder =
    steps.length === 0
      ? 1
      : Math.max(...steps.map((s) => s.step_order)) + 1;

  // step_order -> reply-focused metrics, for the per-step performance line.
  const perfByStepOrder = new Map<number, SequencePerformanceStep>(
    (performance?.steps ?? []).map((s) => [s.step_order, s]),
  );

  const activeEnrollmentCount = enrollments.filter(
    (e) => e.status === 'active',
  ).length;
  const completedEnrollmentCount = enrollments.filter(
    (e) => e.status === 'completed',
  ).length;
  const stoppedEnrollmentCount = enrollments.filter(
    (e) => e.status === 'stopped',
  ).length;

  if (loading) {
    return (
      <div className="glass-standard rounded-2xl p-6">
        <div className="flex items-center gap-2 text-sm text-warm-500">
          <IconLoader size={14} className="animate-spin" />
          Loading sequence…
        </div>
      </div>
    );
  }

  if (error || !sequence) {
    return (
      <div className="bg-cream-50 backdrop-blur-xl border border-red-200 rounded-2xl p-6">
        <p className="text-sm text-red-700">{error ?? 'Sequence not found'}</p>
      </div>
    );
  }

  return (
    <div className="glass-standard rounded-2xl shadow-glass p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-warm-900">{sequence.name}</h2>
          {sequence.description && (
            <p className="text-sm text-warm-600 mt-1 max-w-2xl">
              {sequence.description}
            </p>
          )}
        </div>
        <Button variant="ghost"
          type="button"
          onClick={() => setEnrollDialogOpen(true)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium',
            'bg-cream-50 border border-warm-200/60 text-warm-700',
            'hover:bg-warm-50 active:bg-warm-100 transition-colors',
          )}
        >
          <IconBookmark size={14} /> Enroll segment
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Active"
          value={counts?.active ?? activeEnrollmentCount}
          tone="primary"
          icon={<IconUsers size={14} />}
        />
        <StatCard
          label="Completed"
          value={counts?.completed ?? completedEnrollmentCount}
          tone="neutral"
          icon={<IconClock size={14} />}
        />
        <StatCard
          label="Stopped"
          value={counts?.stopped ?? stoppedEnrollmentCount}
          tone="neutral"
          icon={<IconClock size={14} />}
        />
      </div>

      {/* Reply-focused performance — the north-star is REPLY rate. Open/click
          are intentionally omitted: on .edu they are security-gateway bot noise. */}
      {performance && <PerformanceSummary totals={performance.totals} />}

      {/* Steps */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-warm-900">Steps</h3>
          <Button variant="primary"
            type="button"
            onClick={() => {
              setAdding(true);
              setEditingStepId(null);
            }}
            disabled={adding}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium',
              'bg-primary-600 text-white hover:bg-primary-700 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <IconPlus size={14} /> Add step
          </Button>
        </div>

        {steps.length === 0 && !adding && (
          <div className="py-10 text-center bg-warm-50/40 rounded-xl border border-warm-100">
            <p className="text-sm text-warm-500">
              No steps yet. Click <strong>Add step</strong> to define the first
              email in this sequence.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {steps.map((step) => {
            const isEditing = editingStepId === step.id;
            return (
              <div key={step.id}>
                {isEditing ? (
                  <SequenceStepEditor
                    sequenceId={sequenceId}
                    step={step}
                    defaultStepOrder={step.step_order}
                    onSaved={handleStepSaved}
                    onDeleted={handleStepDeleted}
                    onCancel={() => setEditingStepId(null)}
                  />
                ) : (
                  <Button variant="ghost"
                    type="button"
                    onClick={() => {
                      setEditingStepId(step.id);
                      setAdding(false);
                    }}
                    className={cn(
                      'group w-full text-left flex items-center gap-3 p-4',
                      'bg-cream-50 border border-warm-200/60 rounded-xl',
                      'hover:bg-cream-100 hover:shadow-sm transition-all',
                    )}
                  >
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-50 text-primary-700 font-bold text-sm flex items-center justify-center">
                      {step.step_order}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-warm-900 truncate">
                        {step.subject_override ??
                          (step.template_id
                            ? '(uses template subject)'
                            : 'Untitled step')}
                      </p>
                      <p className="text-xs text-warm-500 mt-0.5">
                        Wait {step.delay_hours}h before sending
                        {step.template_id ? ' • template attached' : ''}
                      </p>
                      {performance && (
                        <StepPerformanceLine
                          metrics={perfByStepOrder.get(step.step_order)}
                        />
                      )}
                    </div>
                    <span className="text-xs text-warm-400 group-hover:text-warm-600 transition-colors">
                      Edit
                    </span>
                  </Button>
                )}
              </div>
            );
          })}

          {adding && (
            <SequenceStepEditor
              sequenceId={sequenceId}
              defaultStepOrder={nextStepOrder}
              onSaved={handleStepSaved}
              onCancel={() => setAdding(false)}
            />
          )}
        </div>
      </div>

      {/* Enroll segment dialog */}
      <EnrollSegmentDialog
        open={enrollDialogOpen}
        onOpenChange={setEnrollDialogOpen}
        sequenceId={sequenceId}
        onEnrolled={() => {
          // Refetch enrollments to update counts.
          refresh();
        }}
      />
    </div>
  );
}

// ============================================================================
// StatCard — small KPI tile. Local helper.
// ============================================================================
function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: 'primary' | 'neutral';
  icon: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl px-4 py-3',
        tone === 'primary'
          ? 'bg-primary-50 border border-primary-100'
          : 'bg-warm-50/60 border border-warm-100',
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'text-xs font-medium uppercase tracking-wider',
            tone === 'primary' ? 'text-primary-700' : 'text-warm-500',
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            tone === 'primary' ? 'text-primary-600' : 'text-warm-400',
          )}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn(
          'text-2xl font-bold tabular-nums mt-1',
          tone === 'primary' ? 'text-primary-900' : 'text-warm-900',
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ============================================================================
// Reply-rate color thresholds — shared by the summary + per-step line.
//   >= 5%  → primary/green (working)
//   2–5%   → amber (watch)
//   < 2%   → warm-500 (cold)
// ============================================================================
function replyRateClass(rate: number): string {
  if (rate >= 5) return 'text-primary-600';
  if (rate >= 2) return 'text-amber-600';
  return 'text-warm-500';
}

// ============================================================================
// PerformanceSummary — top-line reply metrics for the whole sequence.
// Deliberately NO open/click (security-gateway bot noise on .edu). Flags a
// bounce rate above 4% in red — the deliverability / AUP danger line.
// ============================================================================
function PerformanceSummary({
  totals,
}: {
  totals: SequencePerformance['totals'];
}) {
  const bounceRate =
    totals.sent > 0 ? Math.round((totals.bounced / totals.sent) * 1000) / 10 : 0;
  const bounceHot = bounceRate > 4;

  if (totals.sent === 0) {
    return (
      <div className="rounded-xl px-4 py-3 bg-warm-50/60 border border-warm-100">
        <p className="text-sm text-warm-500">
          No sends yet — reply metrics appear once this drip starts sending.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl px-4 py-3 bg-warm-50/60 border border-warm-100 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="text-xs font-medium uppercase tracking-wider text-warm-500">
        TRUE reply
      </span>
      <span className={cn('font-bold tabular-nums', replyRateClass(totals.reply_rate))}>
        {totals.reply_rate}%
      </span>
      <span className="text-warm-400">·</span>
      <span className="text-warm-600">
        delivered <span className="font-semibold tabular-nums text-warm-900">{totals.delivered}</span>
      </span>
      <span className="text-warm-400">·</span>
      <span className={cn(bounceHot ? 'text-red-600 font-semibold' : 'text-warm-600')}>
        {bounceHot && '⚠ '}bounced{' '}
        <span className={cn('tabular-nums', bounceHot ? 'font-bold' : 'font-semibold text-warm-900')}>
          {totals.bounced}
        </span>
        {bounceHot && <span className="ml-1 text-xs">({bounceRate}% — over 4% AUP line)</span>}
      </span>
    </div>
  );
}

// ============================================================================
// StepPerformanceLine — per-step reply metrics appended under a step card.
// Honest empty state when the step has no sends.
// ============================================================================
function StepPerformanceLine({
  metrics,
}: {
  metrics: SequencePerformanceStep | undefined;
}) {
  if (!metrics || metrics.sent === 0) {
    return <p className="text-xs text-warm-400 mt-0.5">No sends yet</p>;
  }
  return (
    <p className="text-xs text-warm-500 mt-0.5 tabular-nums">
      <span className="tabular-nums">{metrics.sent}</span> sent ·{' '}
      <span className="tabular-nums">{metrics.delivered}</span> delivered ·{' '}
      <span className={cn('font-semibold', replyRateClass(metrics.reply_rate))}>
        {metrics.reply_rate}% reply
      </span>
      {metrics.bounced > 0 && (
        <span className="text-red-600"> · ⚠ bounce {metrics.bounced}</span>
      )}
    </p>
  );
}
