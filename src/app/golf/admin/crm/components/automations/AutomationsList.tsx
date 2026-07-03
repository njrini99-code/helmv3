'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconZap,
  IconCheckCircle2,
} from '@/components/icons';
import {
  listAutomations,
  updateAutomation,
  deleteAutomation,
} from '@/app/golf/actions/crm-automations';
import type {
  CrmAutomation,
  CrmAutomationTrigger,
} from '@/lib/crm/automations-engine';
import { AutomationEditor } from './AutomationEditor';
import { TRIGGER_EVENTS, isSeededAutomation } from './AutomationsSeed';
import { Button, IconButton } from '@/components/ui/button';

// ============================================================================
// AutomationsList — table of automations grouped by trigger_event.
// Toggle is_active in-place, edit via modal, delete with confirm.
// ============================================================================

export function AutomationsList() {
  const [automations, setAutomations] = useState<CrmAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CrmAutomation | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listAutomations();
      setAutomations(rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load automations';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Group by trigger_event for display.
  const grouped = useMemo(() => {
    const map = new Map<CrmAutomationTrigger, CrmAutomation[]>();
    for (const a of automations) {
      const list = map.get(a.trigger_event) ?? [];
      list.push(a);
      map.set(a.trigger_event, list);
    }
    return map;
  }, [automations]);

  const handleToggleActive = async (automation: CrmAutomation) => {
    setTogglingId(automation.id);
    try {
      const updated = await updateAutomation(automation.id, {
        is_active: !automation.is_active,
      });
      setAutomations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle automation';
      setError(msg);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (automation: CrmAutomation) => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Delete automation "${automation.name}"?`);
      if (!ok) return;
    }
    try {
      await deleteAutomation(automation.id);
      setAutomations((prev) => prev.filter((a) => a.id !== automation.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete automation';
      setError(msg);
    }
  };

  const handleEdit = (automation: CrmAutomation) => {
    setEditing(automation);
    setEditorOpen(true);
  };

  const handleNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const handleSaved = (saved: CrmAutomation) => {
    setAutomations((prev) => {
      const exists = prev.some((a) => a.id === saved.id);
      return exists
        ? prev.map((a) => (a.id === saved.id ? saved : a))
        : [saved, ...prev];
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-warm-900 flex items-center gap-2">
            <IconZap size={20} className="text-primary-600" />
            Automations
          </h2>
          <p className="text-sm text-warm-500 mt-0.5">
            Configurable rules that fire on email events and pipeline changes.
          </p>
        </div>
        <Button variant="primary"
          type="button"
          onClick={handleNew}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors shadow-sm"
        >
          <IconPlus size={14} /> New automation
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-cream-50 border border-warm-200/60 skeleton-shimmer" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && automations.length === 0 && (
        <div className="rounded-2xl border border-dashed border-warm-300 glass-subtle px-6 py-10 text-center">
          <span className="inline-flex w-10 h-10 rounded-full bg-warm-100 items-center justify-center mb-3">
            <IconZap size={18} className="text-warm-500" />
          </span>
          <p className="text-sm font-medium text-warm-800">No automations yet</p>
          <p className="text-xs text-warm-500 mt-1">
            Click <span className="font-medium">New automation</span> to create your first rule.
          </p>
        </div>
      )}

      {/* Grouped by trigger */}
      {!loading && automations.length > 0 && (
        <div className="space-y-6">
          {TRIGGER_EVENTS.map((trigger) => {
            const rows = grouped.get(trigger.value) ?? [];
            if (rows.length === 0) return null;
            return (
              <section key={trigger.value} className="space-y-2">
                <div className="flex items-baseline gap-2 px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-warm-700">
                    {trigger.label}
                  </h3>
                  <span className="text-eyebrow text-warm-400">{rows.length}</span>
                </div>
                <div className="rounded-2xl glass-standard overflow-hidden">
                  <ul className="divide-y divide-warm-100">
                    {rows.map((a) => {
                      const seeded = isSeededAutomation(a.name);
                      const condCount = Array.isArray(a.conditions) ? a.conditions.length : 0;
                      const actionCount = Array.isArray(a.actions) ? a.actions.length : 0;
                      return (
                        <li
                          key={a.id}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-warm-50/40 transition-colors"
                        >
                          {/* Active toggle */}
                          <IconButton variant="primary"
                            type="button"
                            onClick={() => handleToggleActive(a)}
                            disabled={togglingId === a.id}
                            aria-label={a.is_active ? 'Deactivate automation' : 'Activate automation'}
                            className={cn(
                              'mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
                              a.is_active ? 'bg-primary-500' : 'bg-warm-300',
                              togglingId === a.id && 'opacity-50',
                            )}
                          >
                            <span
                              className={cn(
                                'inline-block h-4 w-4 transform rounded-full bg-cream-50 transition-transform',
                                a.is_active ? 'translate-x-4' : 'translate-x-0.5',
                              )}
                            />
                          </IconButton>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-warm-900 truncate">
                                {a.name}
                              </span>
                              {seeded && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-eyebrow font-medium text-blue-700">
                                  <IconCheckCircle2 size={10} /> Seeded
                                </span>
                              )}
                              {!a.is_active && (
                                <span className="px-2 py-0.5 rounded-full bg-warm-100 text-eyebrow font-medium text-warm-600">
                                  Inactive
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded-full bg-warm-50 border border-warm-200 text-eyebrow text-warm-600">
                                priority {a.priority}
                              </span>
                            </div>
                            {a.description && (
                              <p className="text-xs text-warm-500 mt-0.5 line-clamp-2">
                                {a.description}
                              </p>
                            )}
                            <p className="text-eyebrow text-warm-500 mt-1">
                              {condCount === 0
                                ? 'Always runs'
                                : `${condCount} condition${condCount === 1 ? '' : 's'}`}{' '}
                              · {actionCount} action{actionCount === 1 ? '' : 's'}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <IconButton variant="default"
                              type="button"
                              onClick={() => handleEdit(a)}
                              aria-label="Edit automation"
                              className="p-1.5 rounded-md text-warm-500 hover:text-warm-900 hover:bg-warm-100 transition-colors"
                            >
                              <IconEdit size={14} />
                            </IconButton>
                            <IconButton variant="default"
                              type="button"
                              onClick={() => handleDelete(a)}
                              aria-label="Delete automation"
                              className="p-1.5 rounded-md text-warm-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <IconTrash size={14} />
                            </IconButton>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <AutomationEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        automation={editing}
        onSaved={handleSaved}
      />
    </div>
  );
}
