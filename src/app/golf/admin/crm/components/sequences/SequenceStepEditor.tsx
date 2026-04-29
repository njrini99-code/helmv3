'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { IconLoader, IconTrash } from '@/components/icons';
import {
  upsertSequenceStep,
  deleteSequenceStep,
  type CrmSequenceStep,
} from '@/app/golf/actions/crm-sequences';

// ============================================================================
// SequenceStepEditor — form for one step. Used inline by SequenceBuilder.
//
// A "step" is the unit fired by the cron: optional template (subject/body
// pulled from crm_email_templates) plus optional per-step subject/body
// overrides plus a delay_hours (wait BEFORE firing this step relative to
// the previous one).
// ============================================================================

interface TemplateLite {
  id: string;
  name: string;
  category: string;
}

interface SequenceStepEditorProps {
  sequenceId: string;
  step?: CrmSequenceStep;
  /** Used when creating a new step (server enforces uniqueness on this). */
  defaultStepOrder: number;
  onSaved: (step: CrmSequenceStep) => void;
  onDeleted?: (stepId: string) => void;
  onCancel?: () => void;
}

export function SequenceStepEditor({
  sequenceId,
  step,
  defaultStepOrder,
  onSaved,
  onDeleted,
  onCancel,
}: SequenceStepEditorProps) {
  const [stepOrder, setStepOrder] = useState<number>(
    step?.step_order ?? defaultStepOrder,
  );
  const [delayHours, setDelayHours] = useState<number>(step?.delay_hours ?? 0);
  const [templateId, setTemplateId] = useState<string>(step?.template_id ?? '');
  const [subjectOverride, setSubjectOverride] = useState<string>(
    step?.subject_override ?? '',
  );
  const [bodyOverride, setBodyOverride] = useState<string>(
    step?.body_override ?? '',
  );
  const [templates, setTemplates] = useState<TemplateLite[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load template options once on mount.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from('crm_email_templates')
      .select('id, name, category')
      .order('category', { ascending: true })
      .order('name', { ascending: true })
      .then(({ data, error: tplErr }) => {
        if (cancelled) return;
        if (tplErr) {
          setError(`Failed to load templates: ${tplErr.message}`);
          return;
        }
        setTemplates((data ?? []) as TemplateLite[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stepOrder < 1) {
      setError('Step number must be 1 or greater');
      return;
    }
    if (delayHours < 0) {
      setError('Delay must be 0 or greater');
      return;
    }
    if (!templateId && !subjectOverride.trim()) {
      setError('Pick a template or supply a subject override');
      return;
    }
    if (!templateId && !bodyOverride.trim()) {
      setError('Pick a template or supply a body override');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const saved = await upsertSequenceStep({
        sequence_id: sequenceId,
        step_order: stepOrder,
        delay_hours: delayHours,
        ...(templateId ? { template_id: templateId } : {}),
        ...(subjectOverride.trim()
          ? { subject_override: subjectOverride.trim() }
          : {}),
        ...(bodyOverride.trim() ? { body_override: bodyOverride.trim() } : {}),
      });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save step');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!step?.id) return;
    if (typeof window !== 'undefined') {
      const ok = window.confirm('Delete this step?');
      if (!ok) return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteSequenceStep(step.id);
      onDeleted?.(step.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete step');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <form
      onSubmit={handleSave}
      className="bg-white/80 backdrop-blur-xl border border-warm-200/60 rounded-xl p-4 space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="step-order"
            className="block text-xs font-medium text-warm-700 mb-1"
          >
            Step #
          </label>
          <input
            id="step-order"
            type="number"
            min={1}
            value={stepOrder}
            onChange={(e) => setStepOrder(Number.parseInt(e.target.value, 10) || 1)}
            className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
          />
        </div>
        <div>
          <label
            htmlFor="step-delay"
            className="block text-xs font-medium text-warm-700 mb-1"
          >
            Delay (hours)
          </label>
          <input
            id="step-delay"
            type="number"
            min={0}
            value={delayHours}
            onChange={(e) =>
              setDelayHours(Math.max(0, Number.parseInt(e.target.value, 10) || 0))
            }
            className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="step-template"
          className="block text-xs font-medium text-warm-700 mb-1"
        >
          Template
        </label>
        <select
          id="step-template"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
        >
          <option value="">— No template (use overrides below) —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              [{t.category}] {t.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="step-subject"
          className="block text-xs font-medium text-warm-700 mb-1"
        >
          Subject override{' '}
          <span className="text-warm-400 font-normal">(optional)</span>
        </label>
        <input
          id="step-subject"
          type="text"
          value={subjectOverride}
          onChange={(e) => setSubjectOverride(e.target.value)}
          placeholder="Leave blank to use template subject"
          className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
        />
      </div>

      <div>
        <label
          htmlFor="step-body"
          className="block text-xs font-medium text-warm-700 mb-1"
        >
          Body override{' '}
          <span className="text-warm-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="step-body"
          rows={4}
          value={bodyOverride}
          onChange={(e) => setBodyOverride(e.target.value)}
          placeholder="Leave blank to use template body"
          className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <div>
          {step?.id && onDeleted && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm',
                'text-red-600 hover:bg-red-50 transition-colors',
                'disabled:opacity-50',
              )}
            >
              {deleting ? (
                <IconLoader size={14} className="animate-spin" />
              ) : (
                <IconTrash size={14} />
              )}
              Delete step
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-3 py-1.5 text-sm text-warm-600 hover:text-warm-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-xl shadow-sm',
              'bg-primary-600 text-white hover:bg-primary-700 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {submitting && <IconLoader size={14} className="animate-spin" />}
            Save step
          </button>
        </div>
      </div>
    </form>
  );
}
