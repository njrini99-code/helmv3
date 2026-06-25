'use client';

// =============================================================================
// src/components/lifting/nutrition/NutritionPlanAssignmentsTable.tsx
//
// Helm Lifting Lab — coach view: list of org nutrition plans with
// acknowledgment progress (X of Y athletes acknowledged).
//
// Features:
//   - Sortable table / stacked-card list (responsive)
//   - Per-plan acknowledged count with progress bar
//   - Archive action (soft-delete) with confirmation
//   - Filter by status (draft | published | archived)
//   - Honest empty state
//   - Skeleton loader while data loads
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';

import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconFileText,
  IconLink,
  IconNote,
  IconTrash,
  IconCheck,
  IconClock,
  IconUsers,
  IconWarning,
} from '@/components/icons';
import { archiveNutritionPlan } from '@/app/lifting/actions/nutrition';
import type { CoachNutritionPlanRow } from '@/app/lifting/actions/nutrition';
import type { PlanType, ScheduleStatus } from '@/lib/types/helm-lifting-checkins';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  orgId: string;
  rows: CoachNutritionPlanRow[];
  /** Show archived plans in the list. Default false. */
  includeArchived?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_META: Record<ScheduleStatus, { label: string; cls: string; dot: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-warm-50 text-warm-500 border-warm-200',    dot: 'bg-warm-300' },
  published: { label: 'Published', cls: 'bg-primary-50 text-primary-700 border-primary-200', dot: 'bg-primary-500' },
  archived:  { label: 'Archived',  cls: 'bg-warm-50 text-warm-400 border-warm-200',    dot: 'bg-warm-200' },
};

const PLAN_TYPE_ICON: Record<PlanType, React.ReactNode> = {
  document: <IconFileText size={15} />,
  link:     <IconLink size={15} />,
  note:     <IconNote size={15} />,
};

const PLAN_TYPE_LABEL: Record<PlanType, string> = {
  document: 'Document',
  link:     'Link',
  note:     'Note',
};

type StatusFilter = 'all' | ScheduleStatus;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function AckBar({ acked, total }: { acked: number; total: number }) {
  if (total === 0) {
    return <span className="text-xs text-warm-300 italic">No direct assignments</span>;
  }
  const pct = Math.round((acked / total) * 100);
  const allDone = acked === total;
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-warm-100">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            allDone ? 'bg-primary-500' : 'bg-amber-400'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-medium ${allDone ? 'text-primary-600' : 'text-warm-500'}`}>
        {acked}/{total}
      </span>
      {allDone && <IconCheck size={12} className="text-primary-500" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function NutritionPlanAssignmentsTableSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-warm-200 bg-white p-4">
          <div className="flex items-center gap-4">
            <div className="h-4 w-1/3 rounded bg-warm-100" />
            <div className="h-4 w-16 rounded bg-warm-100" />
            <div className="ml-auto h-4 w-24 rounded bg-warm-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NutritionPlanAssignmentsTable({ orgId, rows, includeArchived = false }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!includeArchived && r.plan.status === 'archived') return false;
      if (statusFilter === 'all') return true;
      return r.plan.status === statusFilter;
    });
  }, [rows, statusFilter, includeArchived]);

  // Status filter tabs
  const statusOptions: StatusFilter[] = includeArchived
    ? ['all', 'published', 'draft', 'archived']
    : ['all', 'published', 'draft'];

  function handleArchive(planId: string) {
    setConfirmArchiveId(null);
    setArchivingId(planId);
    startTransition(async () => {
      const result = await archiveNutritionPlan({ orgId, planId });
      setArchivingId(null);
      if (!result.success) {
        toast.error(result.error ?? 'Could not archive plan.');
      } else {
        toast.success('Plan archived.');
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {statusOptions.map((s) => {
          const count = s === 'all' ? rows.filter((r) => includeArchived || r.plan.status !== 'archived').length
            : rows.filter((r) => r.plan.status === s).length;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={[
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                statusFilter === s
                  ? 'border-primary-400 bg-primary-50 text-primary-700'
                  : 'border-warm-200 bg-white text-warm-600 hover:border-warm-300',
              ].join(' ')}
            >
              {s === 'all' ? 'All' : (STATUS_META[s as ScheduleStatus]?.label ?? s)}
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                statusFilter === s ? 'bg-primary-100 text-primary-600' : 'bg-warm-100 text-warm-500'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<IconUsers size={28} className="text-warm-300" />}
          title="No nutrition plans yet"
          description={
            statusFilter === 'all'
              ? 'Upload your first plan to get started.'
              : `No ${STATUS_META[statusFilter as ScheduleStatus]?.label.toLowerCase() ?? statusFilter} plans.`
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const { plan, assignmentCount, acknowledgedCount, lastAssignedAt } = row;
            const statusMeta = STATUS_META[plan.status];
            const isArchiving = archivingId === plan.id;
            const isConfirming = confirmArchiveId === plan.id;

            return (
              <motion.div
                key={plan.id}
                layout
                initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: isArchiving ? 0.5 : 1, y: 0 }}
                transition={{ duration: 0.14 }}
              >
                <Card variant="flat" className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      {/* Plan type icon + title */}
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span className="mt-0.5 shrink-0 text-warm-400">
                          {PLAN_TYPE_ICON[plan.plan_type]}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-warm-900">{plan.title}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-warm-400">
                            <span>{PLAN_TYPE_LABEL[plan.plan_type]}</span>
                            {lastAssignedAt && (
                              <>
                                <span>·</span>
                                <span className="flex items-center gap-1">
                                  <IconClock size={11} />
                                  {formatRelativeDate(lastAssignedAt)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Status badge */}
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusMeta.cls}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
                        {statusMeta.label}
                      </span>

                      {/* Ack progress */}
                      <div className="shrink-0">
                        <AckBar acked={acknowledgedCount} total={assignmentCount} />
                      </div>

                      {/* Actions */}
                      {plan.status !== 'archived' && (
                        <div className="flex shrink-0 items-center gap-1">
                          {isConfirming ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-warm-500">Archive?</span>
                              <button
                                type="button"
                                onClick={() => handleArchive(plan.id)}
                                disabled={isArchiving}
                                className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmArchiveId(null)}
                                className="rounded-lg px-2 py-1 text-xs text-warm-400 hover:bg-warm-50 transition-colors"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmArchiveId(plan.id)}
                              disabled={isArchiving || isPending}
                              title="Archive plan"
                              className="rounded-lg p-1.5 text-warm-300 transition-colors hover:bg-warm-50 hover:text-warm-500 disabled:opacity-40"
                            >
                              {isArchiving ? (
                                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-warm-200 border-t-warm-500" />
                              ) : (
                                <IconTrash size={14} />
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Description snippet (if any) */}
                    {plan.description && (
                      <p className="mt-2 line-clamp-1 text-xs text-warm-400 pl-6">
                        {plan.description}
                      </p>
                    )}

                    {/* Warning: draft with assignments */}
                    {plan.status === 'draft' && assignmentCount > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 pl-6 text-xs text-amber-600">
                        <IconWarning size={12} />
                        <span>Draft — athletes cannot see this plan yet</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
