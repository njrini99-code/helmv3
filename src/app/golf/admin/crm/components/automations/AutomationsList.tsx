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
  createAutomation,
} from '@/app/golf/actions/crm-automations';
import type {
  CrmAutomation,
  CrmAutomationTrigger,
} from '@/lib/crm/automations-engine';
import { AutomationEditor } from './AutomationEditor';
import { AUTOMATIONS_SEED, TRIGGER_EVENTS, isSeededAutomation } from './AutomationsSeed';
import { Button, IconButton } from '@/components/ui/button';
import {
  CRM_ICON_ACTION_CLASS,
  CRM_PRIMARY_ACTION_CLASS,
  CRM_SECONDARY_ACTION_CLASS,
} from '../../page-contracts';
import { EmptyState } from '@/components/fairway';

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
  const [restoring, setRestoring] = useState(false);

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

  // Re-create any seeded automation (by name) that isn't currently present,
  // e.g. after an admin deletes one. Referenced by the file-header comment
  // but previously had no implementation anywhere in the tree.
  const missingSeeds = useMemo(() => {
    const existingNames = new Set(automations.map((a) => a.name));
    return AUTOMATIONS_SEED.filter((s) => !existingNames.has(s.name));
  }, [automations]);

  const handleRestoreDefaults = async () => {
    if (missingSeeds.length === 0) return;
    setRestoring(true);
    setError(null);
    try {
      const restored = await Promise.all(
        missingSeeds.map((seed) =>
          createAutomation({
            name: seed.name,
            description: seed.description,
            trigger_event: seed.trigger_event,
            conditions: seed.conditions,
            actions: seed.actions,
            priority: seed.priority,
          }),
        ),
      );
      setAutomations((prev) => [...restored, ...prev]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to restore default automations';
      setError(msg);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <IconZap size={20} className="text-accent-700" />
            Automations
          </h2>
          <p className="text-sm text-text-tertiary mt-0.5">
            Configurable rules that fire on email events and pipeline changes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!loading && missingSeeds.length > 0 && (
            <Button
              variant="outline"
              type="button"
              onClick={handleRestoreDefaults}
              disabled={restoring}
              className={CRM_SECONDARY_ACTION_CLASS}
            >
              <IconCheckCircle2 size={14} />
              {restoring ? 'Restoring…' : 'Restore defaults'}
            </Button>
          )}
          <Button
            variant="primary"
            type="button"
            onClick={handleNew}
            className={CRM_PRIMARY_ACTION_CLASS}
          >
            <IconPlus size={14} /> New automation
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-fw-danger-ink bg-fw-danger-bg border border-fw-danger/25 rounded-fw-md px-3 py-2">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-fw-md bg-surface border border-border-subtle skeleton-shimmer" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && automations.length === 0 && (
        <div className="rounded-card border border-dashed border-border-strong bg-surface-tint">
          <EmptyState
            variant="subtle"
            icon={<IconZap size={18} />}
            title="No automations yet"
            description={
              <>
                Click <span className="font-medium text-text-primary">New automation</span> to create
                your first rule.
              </>
            }
          />
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
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    {trigger.label}
                  </h3>
                  <span className="text-eyebrow text-text-tertiary">{rows.length}</span>
                </div>
                <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] overflow-hidden">
                  <ul className="divide-y divide-border-subtle">
                    {rows.map((a) => {
                      const seeded = isSeededAutomation(a.name);
                      const condCount = Array.isArray(a.conditions) ? a.conditions.length : 0;
                      const actionCount = Array.isArray(a.actions) ? a.actions.length : 0;
                      return (
                        <li
                          key={a.id}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-surface-sunken/40 transition-colors"
                        >
                          {/* Active toggle */}
                          <IconButton
                            variant="default"
                            type="button"
                            onClick={() => handleToggleActive(a)}
                            disabled={togglingId === a.id}
                            aria-label={a.is_active ? 'Deactivate automation' : 'Activate automation'}
                            aria-pressed={a.is_active}
                            className="mt-0.5 min-h-11 min-w-11 flex-shrink-0 rounded-fw-md bg-transparent p-0 hover:bg-surface-tint"
                          >
                            <span
                              className={cn(
                                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                                a.is_active ? 'bg-accent-650' : 'bg-border-strong',
                                togglingId === a.id && 'opacity-50',
                              )}
                            >
                              <span
                                className={cn(
                                  'inline-block h-4 w-4 transform rounded-full bg-surface transition-transform',
                                  a.is_active ? 'translate-x-4' : 'translate-x-0.5',
                                )}
                              />
                            </span>
                          </IconButton>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-text-primary truncate">
                                {a.name}
                              </span>
                              {seeded && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-accent-200 bg-accent-50 text-eyebrow font-medium text-fw-success-ink">
                                  <IconCheckCircle2 size={10} /> Seeded
                                </span>
                              )}
                              {!a.is_active && (
                                <span className="px-2 py-0.5 rounded-full bg-surface-sunken text-eyebrow font-medium text-text-secondary">
                                  Inactive
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded-full bg-surface-sunken border border-border-subtle text-eyebrow text-text-secondary">
                                priority {a.priority}
                              </span>
                            </div>
                            {a.description && (
                              <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">
                                {a.description}
                              </p>
                            )}
                            <p className="text-eyebrow text-text-tertiary mt-1">
                              {condCount === 0
                                ? 'Always runs'
                                : `${condCount} condition${condCount === 1 ? '' : 's'}`}{' '}
                              · {actionCount} action{actionCount === 1 ? '' : 's'}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <IconButton
                              variant="default"
                              type="button"
                              onClick={() => handleEdit(a)}
                              aria-label="Edit automation"
                              className={CRM_ICON_ACTION_CLASS}
                            >
                              <IconEdit size={14} />
                            </IconButton>
                            <IconButton
                              variant="default"
                              type="button"
                              onClick={() => handleDelete(a)}
                              aria-label="Delete automation"
                              className="min-h-11 min-w-11 rounded-fw-md text-text-tertiary hover:bg-fw-danger-bg hover:text-fw-danger-ink"
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
