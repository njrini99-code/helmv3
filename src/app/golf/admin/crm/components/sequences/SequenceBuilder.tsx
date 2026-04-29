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
  type CrmSequence,
  type CrmSequenceStep,
  type CrmSequenceEnrollment,
} from '@/app/golf/actions/crm-sequences';
import { SequenceStepEditor } from './SequenceStepEditor';
import { EnrollSegmentDialog } from './EnrollSegmentDialog';

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
      const enrolled = await listEnrollments(sequenceId, { limit: 200 });
      setSequence(seq);
      setSteps(seqSteps);
      setEnrollments(enrolled);
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
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <div className="flex items-center gap-2 text-sm text-warm-500">
          <IconLoader size={14} className="animate-spin" />
          Loading sequence…
        </div>
      </div>
    );
  }

  if (error || !sequence) {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-red-200 rounded-2xl p-6">
        <p className="text-sm text-red-700">{error ?? 'Sequence not found'}</p>
      </div>
    );
  }

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 space-y-6">
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
        <button
          type="button"
          onClick={() => setEnrollDialogOpen(true)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium',
            'bg-white border border-warm-200/60 text-warm-700',
            'hover:bg-warm-50 active:bg-warm-100 transition-colors',
          )}
        >
          <IconBookmark size={14} /> Enroll segment
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Active"
          value={activeEnrollmentCount}
          tone="primary"
          icon={<IconUsers size={14} />}
        />
        <StatCard
          label="Completed"
          value={completedEnrollmentCount}
          tone="neutral"
          icon={<IconClock size={14} />}
        />
        <StatCard
          label="Stopped"
          value={stoppedEnrollmentCount}
          tone="neutral"
          icon={<IconClock size={14} />}
        />
      </div>

      {/* Steps */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-warm-900">Steps</h3>
          <button
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
          </button>
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
                  <button
                    type="button"
                    onClick={() => {
                      setEditingStepId(step.id);
                      setAdding(false);
                    }}
                    className={cn(
                      'group w-full text-left flex items-center gap-3 p-4',
                      'bg-white/80 border border-warm-200/60 rounded-xl',
                      'hover:bg-white hover:shadow-sm transition-all',
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
                    </div>
                    <span className="text-xs text-warm-400 group-hover:text-warm-600 transition-colors">
                      Edit
                    </span>
                  </button>
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
