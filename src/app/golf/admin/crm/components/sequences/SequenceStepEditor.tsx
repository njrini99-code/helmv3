'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconChevronDown, IconEye, IconLoader, IconTrash } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { mergeTags, type Recipient } from '@/lib/crm/merge-tags';
import {
  upsertSequenceStep,
  deleteSequenceStep,
  type CrmSequenceStep,
} from '@/app/golf/actions/crm-sequences';
import {
  listTemplates,
  type CrmEmailTemplate,
  type TemplateFormat,
} from '@/app/golf/actions/crm-templates';

// ============================================================================
// SequenceStepEditor — form for one step. Used inline by SequenceBuilder.
//
// A "step" is the unit fired by the cron: optional template (subject/body
// pulled from crm_email_templates) plus optional per-step subject/body
// overrides plus a delay_hours (wait BEFORE firing this step relative to
// the previous one).
//
// Template options are loaded via the same listTemplates() server action
// TemplateManager uses (not a raw client-side select) — that gets us the
// full subject/body/format for every template in one round trip, so
// picking a template needs no follow-up fetch to power the live preview.
// ============================================================================

// Resolves what will actually be SENT for this step: override wins over the
// template, exactly mirroring scripts/process-sequence-batch.mjs's
// `step.subject_override || tpl?.subject || ''` / same-for-body / `tpl?.format
// || 'text'` — so what the operator previews here is what the cron sends.
// Exported (pure, no I/O) for colocated unit coverage.
export function resolveStepPreview(
  overrides: { subjectOverride: string; bodyOverride: string },
  template: CrmEmailTemplate | null,
): { subject: string; body: string; format: TemplateFormat } {
  return {
    subject: overrides.subjectOverride.trim() || template?.subject || '',
    body: overrides.bodyOverride.trim() || template?.body || '',
    format: template?.format ?? 'text',
  };
}

// Format chip labels — mirror TemplateManager's FORMAT_META wording exactly
// so the same format reads identically in both surfaces.
const STEP_FORMAT_META: Record<TemplateFormat, { label: string; badge: string }> = {
  text: { label: 'Plain text', badge: 'bg-sky-900 text-white' },
  plain: { label: 'Branded shell', badge: 'bg-warm-900 text-white' },
  html: { label: 'Full HTML', badge: 'bg-violet-900 text-white' },
};

// Mirrors TemplateManager's SAMPLE_RECIPIENT so a step's preview renders
// with the exact same sample values as the template's own live preview.
const PREVIEW_COACH: Recipient = {
  id: 'preview',
  email: 'coach.sample@stateu.edu',
  name: 'Jordan Sample',
  title: 'Head Coach',
  school: 'State University',
  conference: 'Atlantic Coast',
  division: 'D1',
  program: 'mens',
  team_size: 10,
  current_software: 'spreadsheets',
};

// ── Preview pane ──
// Same idiom as TemplateManager's PreviewPane: runs the shared mergeTags()
// against the sample coach, html format renders in a sandboxed iframe
// (srcDoc, empty sandbox — no scripts, no same-origin), text/plain renders
// whitespace-preserved.
function StepPreviewPane({
  subject,
  body,
  format,
}: {
  subject: string;
  body: string;
  format: TemplateFormat;
}) {
  const mergedSubject = useMemo(() => mergeTags(subject, PREVIEW_COACH), [subject]);
  const mergedBody = useMemo(() => mergeTags(body, PREVIEW_COACH), [body]);
  const fmt = STEP_FORMAT_META[format];

  return (
    <div className="rounded-xl border border-warm-200/60 glass-standard overflow-clip">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-warm-200/60 bg-warm-50/40">
        <span
          className={cn(
            'px-2 py-0.5 rounded-full text-eyebrow font-bold uppercase tracking-wider',
            fmt.badge,
          )}
        >
          {fmt.label}
        </span>
        <span className="ml-auto text-eyebrow text-warm-400">
          rendered for {PREVIEW_COACH.name}
        </span>
      </div>
      <div className="px-3 py-2.5 border-b border-warm-100/80">
        <p className="text-eyebrow uppercase tracking-wider text-warm-400 mb-0.5">Subject</p>
        <p className="text-sm font-semibold text-warm-900 break-words">
          {mergedSubject || <span className="text-warm-300 italic">No subject</span>}
        </p>
      </div>
      <div className="p-3 max-h-64 overflow-auto bg-cream-100/40">
        {format === 'html' ? (
          mergedBody.trim() ? (
            <iframe
              title="Step email preview"
              sandbox=""
              srcDoc={mergedBody}
              className="w-full min-h-[14rem] rounded-lg border border-warm-200 bg-cream-50"
            />
          ) : (
            <p className="text-sm text-warm-300 italic">No HTML body yet</p>
          )
        ) : mergedBody.trim() ? (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-warm-700">
            {mergedBody}
          </pre>
        ) : (
          <p className="text-sm text-warm-300 italic">No body yet</p>
        )}
      </div>
    </div>
  );
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
  const [templates, setTemplates] = useState<CrmEmailTemplate[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Default open — the whole point is to remove the "cross-reference the
  // Templates tab" step, so don't make the operator click to discover it.
  const [showPreview, setShowPreview] = useState(true);

  // Load template options once on mount, via the same server action
  // TemplateManager uses — full subject/body/format per template, no
  // per-selection follow-up fetch needed.
  useEffect(() => {
    let cancelled = false;
    listTemplates()
      .then((data) => {
        if (cancelled) return;
        setTemplates(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          `Failed to load templates: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  const preview = useMemo(
    () => resolveStepPreview({ subjectOverride, bodyOverride }, selectedTemplate),
    [subjectOverride, bodyOverride, selectedTemplate],
  );

  const hasPreviewContent =
    Boolean(templateId) || subjectOverride.trim().length > 0 || bodyOverride.trim().length > 0;

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
        // Editing an existing step must carry its id so the action moves the
        // SAME row (atomic reorder) instead of upserting a duplicate.
        ...(step?.id ? { id: step.id } : {}),
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

      {/* Preview — resolved subject/body/format, exactly what the cron sends */}
      {hasPreviewContent && (
        <div className="pt-1 border-t border-warm-100">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowPreview((v) => !v)}
            aria-expanded={showPreview}
            className="w-full flex items-center justify-between px-2 py-2 min-h-0 text-xs font-semibold text-warm-600 hover:text-warm-800 hover:bg-cream-50 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <IconEye size={13} className="text-primary-500" aria-hidden />
              Preview
            </span>
            <IconChevronDown
              size={14}
              aria-hidden
              className={cn(
                'text-warm-400 transition-transform duration-200',
                showPreview && 'rotate-180',
              )}
            />
          </Button>
          {showPreview && (
            <div className="pb-1">
              <StepPreviewPane
                subject={preview.subject}
                body={preview.body}
                format={preview.format}
              />
            </div>
          )}
        </div>
      )}

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
