'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
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
  pauseEnrollment,
  resumeEnrollment,
  stopEnrollment,
  type CrmSequence,
  type CrmSequenceStep,
  type CrmSequenceEnrollment,
  type SequenceEnrollmentCounts,
  type SequenceEnrollmentStatus,
  type SequencePerformance,
  type SequencePerformanceStep,
} from '@/app/golf/actions/crm-sequences';
import { SequenceStepEditor } from './SequenceStepEditor';
import { EnrollSegmentDialog } from './EnrollSegmentDialog';
import { Button } from '@/components/ui/button';

// Lite coach shape for the enrollments list — just enough to identify who's
// enrolled without pulling in the full CrmCoach surface from crm-config.
interface EnrollmentCoachLite {
  name: string;
  email: string | null;
}

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
  const [coachesById, setCoachesById] = useState<
    Record<string, EnrollmentCoachLite>
  >({});
  const [busyEnrollmentId, setBusyEnrollmentId] = useState<string | null>(
    null,
  );
  const [enrollmentActionError, setEnrollmentActionError] = useState<
    string | null
  >(null);
  const fetchedCoachIdsRef = useRef<Set<string>>(new Set());

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

  // Resolve coach name/email for whatever enrollment rows are on screen.
  // Cheap batch lookup, client-side (same pattern as SequenceStepEditor's
  // template fetch) — crm_sequence_enrollments only stores coach_id.
  useEffect(() => {
    const ids = Array.from(new Set(enrollments.map((e) => e.coach_id))).filter(
      (id) => !fetchedCoachIdsRef.current.has(id),
    );
    if (ids.length === 0) return;
    ids.forEach((id) => fetchedCoachIdsRef.current.add(id));

    let cancelled = false;
    const supabase = createClient();
    supabase
      .from('crm_coaches')
      .select('id, name, email')
      .in('id', ids)
      .then(({ data, error: coachErr }) => {
        if (cancelled || coachErr || !data) return;
        setCoachesById((prev) => {
          const next = { ...prev };
          for (const row of data as Array<{
            id: string;
            name: string;
            email: string | null;
          }>) {
            next[row.id] = { name: row.name, email: row.email };
          }
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enrollments]);

  const handlePauseEnrollment = async (enrollmentId: string) => {
    setBusyEnrollmentId(enrollmentId);
    setEnrollmentActionError(null);
    try {
      const updated = await pauseEnrollment(enrollmentId);
      setEnrollments((prev) =>
        prev.map((e) => (e.id === updated.id ? updated : e)),
      );
      onChange?.();
    } catch (err) {
      setEnrollmentActionError(
        err instanceof Error ? err.message : 'Failed to pause enrollment',
      );
    } finally {
      setBusyEnrollmentId(null);
    }
  };

  const handleResumeEnrollment = async (enrollmentId: string) => {
    setBusyEnrollmentId(enrollmentId);
    setEnrollmentActionError(null);
    try {
      const updated = await resumeEnrollment(enrollmentId);
      setEnrollments((prev) =>
        prev.map((e) => (e.id === updated.id ? updated : e)),
      );
      onChange?.();
    } catch (err) {
      setEnrollmentActionError(
        err instanceof Error ? err.message : 'Failed to resume enrollment',
      );
    } finally {
      setBusyEnrollmentId(null);
    }
  };

  const handleStopEnrollment = async (enrollmentId: string) => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        'Stop this enrollment? The coach will not receive any remaining steps in this sequence.',
      );
      if (!ok) return;
    }
    setBusyEnrollmentId(enrollmentId);
    setEnrollmentActionError(null);
    try {
      const updated = await stopEnrollment(enrollmentId, 'manual');
      setEnrollments((prev) =>
        prev.map((e) => (e.id === updated.id ? updated : e)),
      );
      onChange?.();
    } catch (err) {
      setEnrollmentActionError(
        err instanceof Error ? err.message : 'Failed to stop enrollment',
      );
    } finally {
      setBusyEnrollmentId(null);
    }
  };

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
      <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-6">
        <div className="flex items-center gap-2 text-sm text-text-tertiary">
          <IconLoader size={14} className="animate-spin" />
          Loading sequence…
        </div>
      </div>
    );
  }

  if (error || !sequence) {
    return (
      <div className="bg-surface backdrop-blur-xl border border-fw-danger/25 rounded-card p-6">
        <p className="text-sm text-fw-danger-ink">{error ?? 'Sequence not found'}</p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-text-primary">{sequence.name}</h2>
          {sequence.description && (
            <p className="text-sm text-text-secondary mt-1 max-w-2xl">
              {sequence.description}
            </p>
          )}
        </div>
        <Button variant="ghost"
          type="button"
          onClick={() => setEnrollDialogOpen(true)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-fw-md text-sm font-medium',
            'bg-surface border border-border-subtle text-text-secondary',
            'hover:bg-surface-sunken active:bg-surface-sunken transition-colors',
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
          <h3 className="text-sm font-semibold text-text-primary">Steps</h3>
          <Button variant="primary"
            type="button"
            onClick={() => {
              setAdding(true);
              setEditingStepId(null);
            }}
            disabled={adding}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-fw-sm text-sm font-medium',
              'bg-accent-650 text-text-on-accent hover:bg-accent-700 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <IconPlus size={14} /> Add step
          </Button>
        </div>

        {steps.length === 0 && !adding && (
          <div className="py-10 text-center bg-surface-sunken/60 rounded-fw-md border border-border-subtle">
            <p className="text-sm text-text-tertiary">
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
                      'bg-surface border border-border-subtle rounded-fw-md',
                      'hover:bg-surface-tint hover:shadow-flat transition-all',
                    )}
                  >
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-accent-50 text-accent-700 font-bold text-sm flex items-center justify-center">
                      {step.step_order}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {step.subject_override ??
                          (step.template_id
                            ? '(uses template subject)'
                            : 'Untitled step')}
                      </p>
                      <p className="text-xs text-text-tertiary mt-0.5">
                        Wait {step.delay_hours}h before sending
                        {step.template_id ? ' • template attached' : ''}
                      </p>
                      {performance && (
                        <StepPerformanceLine
                          metrics={perfByStepOrder.get(step.step_order)}
                        />
                      )}
                    </div>
                    <span className="text-xs text-text-tertiary group-hover:text-text-secondary transition-colors">
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

      {/* Enrollments */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">Enrollments</h3>
          {enrollments.length > 0 && (
            <span className="text-xs text-text-tertiary">
              {enrollments.length} shown
            </span>
          )}
        </div>

        {enrollmentActionError && (
          <p className="text-xs text-fw-danger-ink bg-fw-danger-bg border border-fw-danger/25 rounded-fw-sm px-3 py-2 mb-2">
            {enrollmentActionError}
          </p>
        )}

        {enrollments.length === 0 ? (
          <div className="py-8 text-center bg-surface-sunken/60 rounded-fw-md border border-border-subtle">
            <p className="text-sm text-text-tertiary">
              No coaches enrolled yet. Use <strong>Enroll segment</strong>{' '}
              above to add some.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {enrollments.map((enrollment) => (
              <EnrollmentRow
                key={enrollment.id}
                enrollment={enrollment}
                coach={coachesById[enrollment.coach_id]}
                onPause={() => handlePauseEnrollment(enrollment.id)}
                onResume={() => handleResumeEnrollment(enrollment.id)}
                onStop={() => handleStopEnrollment(enrollment.id)}
                busy={busyEnrollmentId === enrollment.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Enroll segment dialog */}
      <EnrollSegmentDialog
        open={enrollDialogOpen}
        onOpenChange={setEnrollDialogOpen}
        sequenceId={sequenceId}
        onEnrolled={() => {
          // Refetch this builder's own enrollments/counts, AND tell the
          // parent (onChange) so the SequencesList row's active-enrollment
          // count refreshes too — previously only the local refresh() ran,
          // so the list row kept showing the stale pre-enroll count until
          // something else (e.g. a step edit) happened to bump refreshKey.
          refresh();
          onChange?.();
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
        'rounded-fw-md px-4 py-3',
        tone === 'primary'
          ? 'bg-accent-50 border border-accent-100'
          : 'bg-surface-sunken/70 border border-border-subtle',
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'text-xs font-medium uppercase tracking-wider',
            tone === 'primary' ? 'text-accent-700' : 'text-text-tertiary',
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            tone === 'primary' ? 'text-accent-700' : 'text-text-tertiary',
          )}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn(
          'text-2xl font-bold tabular-nums mt-1',
          tone === 'primary' ? 'text-accent-800' : 'text-text-primary',
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ============================================================================
// EnrollmentStatusBadge — small pill for an enrollment's lifecycle status.
// ============================================================================
const ENROLLMENT_STATUS_STYLES: Record<SequenceEnrollmentStatus, string> = {
  active: 'bg-accent-50 text-accent-700 border-accent-100',
  paused: 'bg-fw-warning-bg text-fw-warning-ink border-fw-warning-ring/60',
  completed: 'bg-surface-sunken text-text-secondary border-border-subtle',
  stopped: 'bg-fw-danger-bg text-fw-danger-ink border-fw-danger/20',
};

function EnrollmentStatusBadge({ status }: { status: SequenceEnrollmentStatus }) {
  return (
    <span
      className={cn(
        'px-1.5 py-0.5 rounded text-eyebrow font-bold uppercase tracking-wider border flex-shrink-0',
        ENROLLMENT_STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}

// ============================================================================
// EnrollmentRow — one coach's enrollment. Pause/Resume/Stop wire directly to
// the server actions (pauseEnrollment/resumeEnrollment/stopEnrollment) —
// previously the fetched enrollment list was only used to derive a count
// fallback, with no way for an operator to actually manage a running
// enrollment, and a paused enrollment had no way back to active.
//
// Button copy says "…enrollment" (not the bare "Pause"/"Stop" used
// previously) so it reads distinctly from the sequence-level "Pause
// sequence" / "Activate sequence" action in SequenceCard — those two toggle
// very different things (the whole drip vs. one coach's progress through it).
// ============================================================================
function EnrollmentRow({
  enrollment,
  coach,
  onPause,
  onResume,
  onStop,
  busy,
}: {
  enrollment: CrmSequenceEnrollment;
  coach?: EnrollmentCoachLite;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  busy: boolean;
}) {
  const canPause = enrollment.status === 'active';
  const canResume = enrollment.status === 'paused';
  const canStop = enrollment.status === 'active' || enrollment.status === 'paused';

  return (
    <div className="flex items-center gap-3 p-3 bg-surface border border-border-subtle rounded-fw-md">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">
          {coach?.name ?? 'Loading…'}
        </p>
        <p className="text-xs text-text-tertiary truncate">
          {coach?.email ?? enrollment.coach_id}
        </p>
      </div>
      <span className="text-xs text-text-tertiary tabular-nums flex-shrink-0">
        Step {enrollment.current_step}
      </span>
      <EnrollmentStatusBadge status={enrollment.status} />
      {(canPause || canResume || canStop) && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {canPause && (
            <Button variant="ghost"
              type="button"
              onClick={onPause}
              disabled={busy}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-fw-sm text-xs font-medium',
                'text-text-secondary hover:text-text-primary hover:bg-surface-sunken transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {busy ? <IconLoader size={12} className="animate-spin" /> : 'Pause enrollment'}
            </Button>
          )}
          {canResume && (
            <Button variant="ghost"
              type="button"
              onClick={onResume}
              disabled={busy}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-fw-sm text-xs font-medium',
                'text-accent-700 hover:bg-accent-50 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {busy ? <IconLoader size={12} className="animate-spin" /> : 'Resume enrollment'}
            </Button>
          )}
          {canStop && (
            <Button variant="ghost"
              type="button"
              onClick={onStop}
              disabled={busy}
              className={cn(
                'px-2 py-1 rounded-fw-sm text-xs font-medium',
                'text-fw-danger-ink hover:bg-fw-danger-bg/50 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              Stop enrollment
            </Button>
          )}
        </div>
      )}
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
  if (rate >= 5) return 'text-accent-700';
  if (rate >= 2) return 'text-fw-warning-ink';
  return 'text-text-tertiary';
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
      <div className="rounded-fw-md px-4 py-3 bg-surface-sunken/70 border border-border-subtle">
        <p className="text-sm text-text-tertiary">
          No sends yet — reply metrics appear once this drip starts sending.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-fw-md px-4 py-3 bg-surface-sunken/70 border border-border-subtle flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
        TRUE reply
      </span>
      <span className={cn('font-bold tabular-nums', replyRateClass(totals.reply_rate))}>
        {totals.reply_rate}%
      </span>
      <span className="text-text-tertiary">·</span>
      <span className="text-text-secondary">
        delivered <span className="font-semibold tabular-nums text-text-primary">{totals.delivered}</span>
      </span>
      <span className="text-text-tertiary">·</span>
      <span className={cn(bounceHot ? 'text-fw-danger-ink font-semibold' : 'text-text-secondary')}>
        {bounceHot && '⚠ '}bounced{' '}
        <span className={cn('tabular-nums', bounceHot ? 'font-bold' : 'font-semibold text-text-primary')}>
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
    return <p className="text-xs text-text-tertiary mt-0.5">No sends yet</p>;
  }
  return (
    <p className="text-xs text-text-tertiary mt-0.5 tabular-nums">
      <span className="tabular-nums">{metrics.sent}</span> sent ·{' '}
      <span className="tabular-nums">{metrics.delivered}</span> delivered ·{' '}
      <span className={cn('font-semibold', replyRateClass(metrics.reply_rate))}>
        {metrics.reply_rate}% reply
      </span>
      {metrics.bounced > 0 && (
        <span className="text-fw-danger-ink"> · ⚠ bounce {metrics.bounced}</span>
      )}
    </p>
  );
}
