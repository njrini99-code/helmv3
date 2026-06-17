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
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="automation-editor-title"
          className="w-full max-w-2xl max-h-[90vh] overflow-hidden bg-white rounded-2xl border border-warm-200/60 shadow-2xl pointer-events-auto flex flex-col"
        >
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-warm-100">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                  <IconZap size={16} className="text-primary-600" />
                </span>
                <h2 id="automation-editor-title" className="text-base font-semibold text-warm-900">
                  {isEdit ? 'Edit automation' : 'New automation'}
                </h2>
              </div>
              <IconButton variant="default"
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="p-1.5 rounded-md text-warm-500 hover:text-warm-900 hover:bg-warm-100 transition-colors"
              >
                <IconX size={14} />
              </IconButton>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Name + Active */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label htmlFor="automation-name" className="block text-xs font-medium text-warm-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  {/* eslint-disable-next-line jsx-a11y/no-autofocus -- intentional default focus in dialog */}
                  <input autoFocus
                    id="automation-name"
                    type="text"
                    required
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Follow up after open"
                    className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500/20"
                  />
                  <span className="text-sm text-warm-700">Active</span>
                </label>
              </div>

              {/* Description */}
              <div>
                <label htmlFor="automation-description" className="block text-xs font-medium text-warm-700 mb-1">
                  Description <span className="text-warm-400 font-normal">(optional)</span>
                </label>
                <textarea
                  id="automation-description"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this automation do?"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 placeholder:text-warm-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
                />
              </div>

              {/* Trigger + Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
                <div>
                  <label htmlFor="automation-trigger" className="block text-xs font-medium text-warm-700 mb-1">
                    Trigger event <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="automation-trigger"
                    value={triggerEvent}
                    onChange={(e) => setTriggerEvent(e.target.value as CrmAutomationTrigger)}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
                  >
                    {TRIGGER_EVENTS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-eyebrow text-warm-500">
                    {TRIGGER_EVENTS.find((t) => t.value === triggerEvent)?.description}
                  </p>
                </div>
                <div>
                  <label htmlFor="automation-priority" className="block text-xs font-medium text-warm-700 mb-1">
                    Priority
                  </label>
                  <input
                    id="automation-priority"
                    type="number"
                    min={0}
                    max={1000}
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
                  />
                  <p className="mt-1 text-eyebrow text-warm-500">Lower runs first.</p>
                </div>
              </div>

              {/* Conditions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-warm-500">
                    Conditions <span className="font-normal normal-case text-warm-400">(all must match)</span>
                  </span>
                  <Button variant="ghost"
                    type="button"
                    onClick={addCondition}
                    className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                  >
                    <IconPlus size={12} /> Add condition
                  </Button>
                </div>
                {conditions.length === 0 ? (
                  <p className="text-xs text-warm-500 px-3 py-2 bg-warm-50/40 rounded-lg border border-dashed border-warm-200">
                    No conditions — runs on every matching event.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {conditions.map((cond, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto] gap-2 items-center"
                      >
                        <input
                          type="text"
                          value={cond.field}
                          onChange={(e) => updateCondition(idx, { field: e.target.value })}
                          placeholder="coach.status"
                          className="px-3 py-1.5 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                        <select
                          value={cond.op}
                          onChange={(e) =>
                            updateCondition(idx, { op: e.target.value as CrmAutomationConditionOp })
                          }
                          className="px-3 py-1.5 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        >
                          {CONDITION_OPS.map((op) => (
                            <option key={op.value} value={op.value}>
                              {op.label}
                            </option>
                          ))}
                        </select>
                        {cond.op === 'is_null' || cond.op === 'is_not_null' ? (
                          <span className="text-xs text-warm-400 italic px-3">—</span>
                        ) : (
                          <input
                            type="text"
                            value={typeof cond.value === 'string' ? cond.value : String(cond.value ?? '')}
                            onChange={(e) => updateCondition(idx, { value: e.target.value })}
                            placeholder="value"
                            className="px-3 py-1.5 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                          />
                        )}
                        <IconButton variant="default"
                          type="button"
                          onClick={() => removeCondition(idx)}
                          aria-label="Remove condition"
                          className="p-1.5 rounded-md text-warm-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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
                  <span className="text-xs font-semibold uppercase tracking-wider text-warm-500">
                    Actions <span className="font-normal normal-case text-warm-400">(run in order)</span>
                  </span>
                  <Button variant="ghost"
                    type="button"
                    onClick={addAction}
                    className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
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
                        <select
                          value={action.kind}
                          onChange={(e) => {
                            const nextKind = e.target.value as CrmAutomationAction['kind'];
                            const nextMeta = ACTION_KINDS.find((k) => k.value === nextKind);
                            updateAction(idx, {
                              kind: nextKind,
                              params: nextMeta ? { [nextMeta.paramKey]: '' } : {},
                            });
                          }}
                          className="px-3 py-1.5 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        >
                          {ACTION_KINDS.map((k) => (
                            <option key={k.value} value={k.value}>
                              {k.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={typeof paramVal === 'string' ? paramVal : String(paramVal ?? '')}
                          onChange={(e) => updateActionParam(idx, paramKey, e.target.value)}
                          placeholder={meta?.paramPlaceholder ?? ''}
                          className="px-3 py-1.5 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                        <IconButton variant="default"
                          type="button"
                          onClick={() => removeAction(idx)}
                          aria-label="Remove action"
                          disabled={actions.length === 1}
                          className={cn(
                            'p-1.5 rounded-md transition-colors',
                            actions.length === 1
                              ? 'text-warm-300 cursor-not-allowed'
                              : 'text-warm-400 hover:text-red-600 hover:bg-red-50',
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
              <div className="border-t border-warm-100 pt-3">
                <Button variant="ghost"
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="text-xs font-medium text-warm-600 hover:text-warm-900 transition-colors"
                >
                  {showAdvanced ? '▾' : '▸'} Advanced JSON view
                </Button>
                {showAdvanced && (
                  <pre className="mt-2 p-3 bg-warm-50 border border-warm-200 rounded-lg text-eyebrow text-warm-700 overflow-x-auto whitespace-pre">
                    {advancedJson}
                  </pre>
                )}
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-warm-100 bg-warm-50/40 rounded-b-2xl">
              <Button variant="ghost"
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="px-3 py-1.5 text-sm text-warm-600 hover:text-warm-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </Button>
              <Button variant="primary"
                type="submit"
                disabled={submitting || !name.trim()}
                className={cn(
                  'px-4 py-1.5 text-sm font-semibold rounded-xl shadow-sm transition-colors',
                  'bg-primary-600 text-white hover:bg-primary-700',
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
