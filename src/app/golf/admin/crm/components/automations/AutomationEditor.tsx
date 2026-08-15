'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconX, IconPlus, IconTrash, IconZap } from '@/components/icons';
import {
  createAutomation,
  updateAutomation,
} from '@/app/golf/actions/crm-automations';
import type {
  CrmAutomation,
  CrmAutomationAction,
  CrmAutomationCondition,
  CrmAutomationConditionOp,
  CrmAutomationTrigger,
} from '@/lib/crm/automations-engine';
import { TRIGGER_EVENTS, ACTION_KINDS } from './AutomationsSeed';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

// ============================================================================
// AutomationEditor — modal form for creating or editing a crm_automations row.
// Mirrors the SaveSegmentDialog dialog pattern at
// src/app/golf/admin/crm/components/segments/SaveSegmentDialog.tsx
// ============================================================================

interface AutomationEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  automation?: CrmAutomation | null; // omit/null for create mode
  onSaved?: (saved: CrmAutomation) => void;
}

const CONDITION_OPS: ReadonlyArray<{ value: CrmAutomationConditionOp; label: string }> = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'does not equal' },
  { value: 'in', label: 'is one of' },
  { value: 'not_in', label: 'is not one of' },
  { value: 'gt', label: 'is greater than' },
  { value: 'gte', label: 'is greater than or equal to' },
  { value: 'lt', label: 'is less than' },
  { value: 'lte', label: 'is less than or equal to' },
  { value: 'contains', label: 'contains' },
  { value: 'is_null', label: 'is empty' },
  { value: 'is_not_null', label: 'is not empty' },
];

function defaultCondition(): CrmAutomationCondition {
  return { field: 'coach.status', op: 'eq', value: '' };
}

function defaultAction(): CrmAutomationAction {
  return { kind: 'set_coach_status', params: { value: '' } };
}

export function AutomationEditor({
  open,
  onOpenChange,
  automation,
  onSaved,
}: AutomationEditorProps) {
  const isEdit = Boolean(automation);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerEvent, setTriggerEvent] = useState<CrmAutomationTrigger>('email.opened');
  const [isActive, setIsActive] = useState(true);
  const [priority, setPriority] = useState<number>(100);
  const [conditions, setConditions] = useState<CrmAutomationCondition[]>([]);
  const [actions, setActions] = useState<CrmAutomationAction[]>([defaultAction()]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when opened. If editing, hydrate from the existing row.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    setShowAdvanced(false);
    if (automation) {
      setName(automation.name);
      setDescription(automation.description ?? '');
      setTriggerEvent(automation.trigger_event);
      setIsActive(automation.is_active);
      setPriority(automation.priority);
      setConditions(
        Array.isArray(automation.conditions) && automation.conditions.length > 0
          ? automation.conditions.map((c) => ({ ...c }))
          : [],
      );
      setActions(
        Array.isArray(automation.actions) && automation.actions.length > 0
          ? automation.actions.map((a) => ({ ...a, params: { ...a.params } }))
          : [defaultAction()],
      );
    } else {
      setName('');
      setDescription('');
      setTriggerEvent('email.opened');
      setIsActive(true);
      setPriority(100);
      setConditions([]);
      setActions([defaultAction()]);
    }
  }, [open, automation]);

  // Close on Escape (mirrors SaveSegmentDialog).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const advancedJson = useMemo(() => {
    return JSON.stringify({ conditions, actions }, null, 2);
  }, [conditions, actions]);

  // Only offer triggers that a real evaluator wires up today. When editing an
  // existing automation that was already saved against a not-yet-wired
  // trigger, keep its current value selectable so the form doesn't silently
  // change it out from under the admin.
  const triggerOptions = useMemo(() => {
    return TRIGGER_EVENTS.filter(
      (t) => t.wired || (isEdit && t.value === automation?.trigger_event),
    );
  }, [isEdit, automation?.trigger_event]);

  if (!open) return null;

  // ---- handlers ----
  const updateCondition = (idx: number, patch: Partial<CrmAutomationCondition>) => {
    setConditions((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };
  const removeCondition = (idx: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== idx));
  };
  const addCondition = () => {
    setConditions((prev) => [...prev, defaultCondition()]);
  };

  const updateAction = (idx: number, patch: Partial<CrmAutomationAction>) => {
    setActions((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };
  const updateActionParam = (idx: number, key: string, value: string) => {
    setActions((prev) =>
      prev.map((a, i) => (i === idx ? { ...a, params: { ...a.params, [key]: value } } : a)),
    );
  };
  const removeAction = (idx: number) => {
    setActions((prev) => prev.filter((_, i) => i !== idx));
  };
  const addAction = () => {
    setActions((prev) => [...prev, defaultAction()]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (actions.length === 0) {
      setError('At least one action is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        trigger_event: triggerEvent,
        conditions,
        actions,
        is_active: isActive,
        priority,
      };
      const saved = isEdit && automation
        ? await updateAutomation(automation.id, payload)
        : await createAutomation(payload);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save automation';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- modal backdrop dismisses on click; Escape is handled by the dialog */}
      <div
        className="fixed inset-0 z-50 bg-nav-bg/35"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="automation-editor-title"
          className="w-full max-w-2xl max-h-[90vh] overflow-hidden bg-surface rounded-card border border-border-subtle shadow-raise pointer-events-auto flex flex-col"
        >
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-fw-sm bg-accent-50 flex items-center justify-center">
                  <IconZap size={16} className="text-accent-700" />
                </span>
                <h2 id="automation-editor-title" className="text-base font-semibold text-text-primary">
                  {isEdit ? 'Edit automation' : 'New automation'}
                </h2>
              </div>
              <IconButton variant="default"
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="p-1.5 rounded-fw-sm text-text-tertiary hover:text-text-primary hover:bg-surface-sunken transition-colors"
              >
                <IconX size={14} />
              </IconButton>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Name + Active */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label htmlFor="automation-name" className="block text-xs font-medium text-text-secondary mb-1">
                    Name <span className="text-fw-danger">*</span>
                  </label>
                  {/* eslint-disable-next-line jsx-a11y/no-autofocus -- intentional default focus in dialog */}
                  <Input autoFocus
                    id="automation-name"
                    type="text"
                    required
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Follow up after open"
                    className="min-h-0 py-2 rounded-fw-sm"
                  />
                </div>
                <div className="pb-2">
                  <Checkbox
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    label="Active"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label htmlFor="automation-description" className="block text-xs font-medium text-text-secondary mb-1">
                  Description <span className="text-text-tertiary font-normal">(optional)</span>
                </label>
                <Textarea
                  id="automation-description"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this automation do?"
                  className="py-2 rounded-fw-sm"
                />
              </div>

              {/* Trigger + Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
                <div>
                  <span className="block text-xs font-medium text-text-secondary mb-1">
                    Trigger event <span className="text-fw-danger">*</span>
                  </span>
                  <Select
                    options={triggerOptions.map((t) => ({ value: t.value, label: t.label }))}
                    value={triggerEvent}
                    onChange={(value) => setTriggerEvent(value as CrmAutomationTrigger)}
                    className="rounded-fw-sm"
                  />
                  <p className="mt-1 text-eyebrow text-text-tertiary">
                    {TRIGGER_EVENTS.find((t) => t.value === triggerEvent)?.description}
                  </p>
                </div>
                <div>
                  <label htmlFor="automation-priority" className="block text-xs font-medium text-text-secondary mb-1">
                    Priority
                  </label>
                  <Input
                    id="automation-priority"
                    type="number"
                    min={0}
                    max={1000}
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
                    className="min-h-0 py-2 rounded-fw-sm"
                  />
                  <p className="mt-1 text-eyebrow text-text-tertiary">Lower runs first.</p>
                </div>
              </div>

              {/* Conditions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Conditions <span className="font-normal normal-case text-text-tertiary">(all must match)</span>
                  </span>
                  <Button variant="ghost"
                    type="button"
                    onClick={addCondition}
                    className="flex items-center gap-1 text-xs font-medium text-accent-700 hover:text-fw-success-ink transition-colors"
                  >
                    <IconPlus size={12} /> Add condition
                  </Button>
                </div>
                {conditions.length === 0 ? (
                  <p className="text-xs text-text-tertiary px-3 py-2 bg-surface-sunken/60 rounded-fw-sm border border-dashed border-border-subtle">
                    No conditions — runs on every matching event.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {conditions.map((cond, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto] gap-2 items-center"
                      >
                        <Input
                          type="text"
                          value={cond.field}
                          onChange={(e) => updateCondition(idx, { field: e.target.value })}
                          placeholder="coach.status"
                          className="min-h-0 px-3 py-1.5 rounded-fw-sm"
                        />
                        <Select
                          options={CONDITION_OPS.map((op) => ({ value: op.value, label: op.label }))}
                          value={cond.op}
                          onChange={(value) =>
                            updateCondition(idx, { op: value as CrmAutomationConditionOp })
                          }
                          className="min-h-0 px-3 py-1.5 rounded-fw-sm"
                        />
                        {cond.op === 'is_null' || cond.op === 'is_not_null' ? (
                          <span className="text-xs text-text-tertiary italic px-3">—</span>
                        ) : (
                          <Input
                            type="text"
                            value={typeof cond.value === 'string' ? cond.value : String(cond.value ?? '')}
                            onChange={(e) => updateCondition(idx, { value: e.target.value })}
                            placeholder="value"
                            className="min-h-0 px-3 py-1.5 rounded-fw-sm"
                          />
                        )}
                        <IconButton variant="default"
                          type="button"
                          onClick={() => removeCondition(idx)}
                          aria-label="Remove condition"
                          className="p-1.5 rounded-fw-sm text-text-tertiary hover:text-fw-danger-ink hover:bg-fw-danger-bg/50 transition-colors"
                        >
                          <IconTrash size={14} />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Actions <span className="font-normal normal-case text-text-tertiary">(run in order)</span>
                  </span>
                  <Button variant="ghost"
                    type="button"
                    onClick={addAction}
                    className="flex items-center gap-1 text-xs font-medium text-accent-700 hover:text-fw-success-ink transition-colors"
                  >
                    <IconPlus size={12} /> Add action
                  </Button>
                </div>
                <div className="space-y-2">
                  {actions.map((action, idx) => {
                    const meta = ACTION_KINDS.find((k) => k.value === action.kind);
                    const paramKey = meta?.paramKey ?? 'value';
                    const paramVal = action.params?.[paramKey];
                    return (
                      <div
                        key={idx}
                        className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center"
                      >
                        <Select
                          options={ACTION_KINDS.map((k) => ({ value: k.value, label: k.label }))}
                          value={action.kind}
                          onChange={(value) => {
                            const nextKind = value as CrmAutomationAction['kind'];
                            const nextMeta = ACTION_KINDS.find((k) => k.value === nextKind);
                            updateAction(idx, {
                              kind: nextKind,
                              params: nextMeta ? { [nextMeta.paramKey]: '' } : {},
                            });
                          }}
                          className="min-h-0 px-3 py-1.5 rounded-fw-sm"
                        />
                        <Input
                          type="text"
                          value={typeof paramVal === 'string' ? paramVal : String(paramVal ?? '')}
                          onChange={(e) => updateActionParam(idx, paramKey, e.target.value)}
                          placeholder={meta?.paramPlaceholder ?? ''}
                          className="min-h-0 px-3 py-1.5 rounded-fw-sm"
                        />
                        <IconButton variant="default"
                          type="button"
                          onClick={() => removeAction(idx)}
                          aria-label="Remove action"
                          disabled={actions.length === 1}
                          className={cn(
                            'p-1.5 rounded-fw-sm transition-colors',
                            actions.length === 1
                              ? 'text-text-tertiary cursor-not-allowed'
                              : 'text-text-tertiary hover:text-fw-danger-ink hover:bg-fw-danger-bg/50',
                          )}
                        >
                          <IconTrash size={14} />
                        </IconButton>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Advanced JSON view */}
              <div className="border-t border-border-subtle pt-3">
                <Button variant="ghost"
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
                >
                  {showAdvanced ? '▾' : '▸'} Advanced JSON view
                </Button>
                {showAdvanced && (
                  <pre className="mt-2 p-3 bg-surface-sunken border border-border-subtle rounded-fw-sm text-eyebrow text-text-secondary overflow-x-auto whitespace-pre">
                    {advancedJson}
                  </pre>
                )}
              </div>

              {error && (
                <p className="text-xs text-fw-danger-ink bg-fw-danger-bg border border-fw-danger/25 rounded-fw-sm px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle bg-surface-sunken/60 rounded-b-card">
              <Button variant="ghost"
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
              >
                Cancel
              </Button>
              <Button variant="primary"
                type="submit"
                disabled={submitting || !name.trim()}
                className={cn(
                  'px-4 py-1.5 text-sm font-semibold rounded-fw-md shadow-flat transition-colors',
                  'bg-accent-650 text-text-on-accent hover:bg-accent-750',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {submitting ? 'Saving...' : isEdit ? 'Save changes' : 'Create automation'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
