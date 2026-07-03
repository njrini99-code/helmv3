'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { IconLoader, IconTrash } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
      className="glass-standard border border-warm-200/60 rounded-xl p-4 space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Input
            id="step-order"
            type="number"
            label="Step #"
            min={1}
            value={stepOrder}
            onChange={(e) => setStepOrder(Number.parseInt(e.target.value, 10) || 1)}
            className="px-3 py-2 text-sm rounded-lg"
          />
        </div>
        <div>
          <Input
            id="step-delay"
            type="number"
            label="Delay (hours)"
            min={0}
            value={delayHours}
            onChange={(e) =>
              setDelayHours(Math.max(0, Number.parseInt(e.target.value, 10) || 0))
            }
            className="px-3 py-2 text-sm rounded-lg"
          />
        </div>
      </div>

      <div>
        <Select
          options={[
            { value: '', label: '— No template (use overrides below) —' },
            ...templates.map((t) => ({ value: t.id, label: `[${t.category}] ${t.name}` })),
          ]}
          value={templateId}
          onChange={(v) => setTemplateId(v)}
          label="Template"
        />
      </div>

      <div>
        <Input
          id="step-subject"
          type="text"
          label="Subject override (optional)"
          value={subjectOverride}
          onChange={(e) => setSubjectOverride(e.target.value)}
          placeholder="Leave blank to use template subject"
          className="px-3 py-2 text-sm rounded-lg"
        />
      </div>

      <div>
        <Textarea
          id="step-body"
          label="Body override (optional)"
          rows={4}
          value={bodyOverride}
          onChange={(e) => setBodyOverride(e.target.value)}
          placeholder="Leave blank to use template body"
          className="px-3 py-2 text-sm rounded-lg resize-none"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <div>
          {step?.id && onDeleted && (
            <Button variant="danger"
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
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="ghost"
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-3 py-1.5 text-sm text-warm-600 hover:text-warm-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </Button>
          )}
          <Button variant="primary"
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
          </Button>
        </div>
      </div>
    </form>
  );
}
