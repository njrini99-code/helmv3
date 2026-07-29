'use client';

// =============================================================================
// src/components/baseball/settings/AiAuditLog.tsx
//
// Packet: qa-screens (AI-settings enforcement remediation)
//
// The v4 §AI Settings AI-AUDIT ROW, surfaced. This is the staff-facing proof that
// the AI-governance toggles are LOAD-BEARING: every CoachHelm generation writes a
// baseball_ai_audit row recording how the policy resolved it (approved / pending /
// withheld + which gate fired + whether a guardrail redacted), and this component
// renders that feed.
//
// PRIMARY TASK of this surface: clear the PENDING APPROVAL queue. When player-
// visible AI requires staff approval, fresh player-facing output is held at
// staff_only (pending) until a coach approves it here — that approval is the one
// prominent action. Below it, the recent audit feed is a scannable governance log.
//
// Cream/green palette + GolfHelm primitives. Loading skeleton, empty state, and
// error state are all handled. Read-only viewers see the log but no approve action.
// =============================================================================

import { useEffect, useState, useTransition } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import {
  getAiAuditLog,
  approveAiOutput,
  dismissAiOutput,
} from '@/app/baseball/actions/ai-governance';
import type {
  BaseballAiAuditRow,
  BaseballAiAuditDisposition,
} from '@/lib/types/baseball-ai-audit';
import type { AiWithholdReason } from '@/lib/baseball/ai-policy';

// -----------------------------------------------------------------------------
// Display helpers — human-readable governance language (no raw enum leakage).
// -----------------------------------------------------------------------------

const WITHHELD_LABEL: Record<AiWithholdReason, string> = {
  ai_disabled: 'AI is turned off',
  staff_ai_disabled: 'Staff AI is turned off',
  player_visible_disabled: 'Player-visible AI is off — kept staff-only',
  below_confidence: 'Below the confidence threshold',
  missing_source_refs: 'No source references',
  awaiting_approval: 'Awaiting your approval',
};

const DISPOSITION_STYLE: Record<
  BaseballAiAuditDisposition,
  { label: string; cls: string }
> = {
  approved: { label: 'Approved', cls: 'border-grade-plus/30 bg-grade-plus/10 text-grade-plus' },
  // Ink system, not raw amber — "pending" is a warning/caution status
  // (doctrine: warning -> pursuit soft), needs-approval, not an error.
  pending: { label: 'Pending', cls: 'bg-pursuit/10 text-pursuit border-pursuit/30' },
  withheld: { label: 'Withheld', cls: 'border-[color:var(--hairline)] bg-[var(--paper)] text-text-secondary' },
};

function sourceRefCount(refs: unknown): number {
  return Array.isArray(refs) ? refs.length : 0;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function confidencePct(c: number | null): string {
  return c == null || !Number.isFinite(c) ? '—' : `${Math.round(c * 100)}%`;
}

// -----------------------------------------------------------------------------
// Row
// -----------------------------------------------------------------------------

function AuditRowItem({
  row,
  canManage,
  onApprove,
  onDismiss,
  busy,
}: {
  row: BaseballAiAuditRow;
  canManage: boolean;
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
  busy: boolean;
}) {
  const disp = DISPOSITION_STYLE[row.disposition];
  const isPending = row.disposition === 'pending' && row.withheld_reason === 'awaiting_approval';
  const guardrails: string[] = [];
  if (row.guardrail_medical) guardrails.push('medical');
  if (row.guardrail_academic) guardrails.push('academic');

  return (
    <div className="flex flex-col gap-2 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-md border px-1.5 py-0.5 text-caption font-semibold',
              disp.cls,
            )}
          >
            {disp.label}
          </span>
          <span className="truncate text-sm font-medium text-text-primary">
            {row.generator ?? 'AI output'}
          </span>
          <span className="text-xs text-text-tertiary">{formatWhen(row.generated_at)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-tertiary">
          <span>Confidence {confidencePct(row.confidence)}</span>
          <span>{sourceRefCount(row.source_refs)} sources</span>
          <span className="capitalize">{row.visibility.replace('_', ' ')}</span>
          {row.withheld_reason && row.disposition !== 'approved' && (
            <span className="text-text-secondary">{WITHHELD_LABEL[row.withheld_reason]}</span>
          )}
          {guardrails.length > 0 && (
            <span className="text-text-secondary">
              Redacted: {guardrails.join(' + ')}
            </span>
          )}
        </div>
      </div>

      {canManage && isPending && (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            isLoading={busy}
            disabled={busy}
            onClick={() => onApprove(row.id)}
          >
            Approve for players
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onDismiss(row.id)}
          >
            Keep staff-only
          </Button>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

export function AiAuditLog({ teamId, canManage }: { teamId: string; canManage: boolean }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<BaseballAiAuditRow[] | null>(null);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const reduceMotion = useReducedMotion();

  const load = () => {
    setError(false);
    startTransition(async () => {
      try {
        const res = await getAiAuditLog({ limit: 30 });
        if (res.success) setRows(res.rows);
        else {
          setError(true);
          setRows([]);
        }
      } catch {
        setError(true);
        setRows([]);
      }
    });
  };

  // teamId is part of the dep so a team switch reloads the right log.
  useEffect(() => {
    load();
  }, [teamId]);

  const handleApprove = (id: string) => {
    setBusyId(id);
    startTransition(async () => {
      try {
        const res = await approveAiOutput(id);
        if (res.success) {
          showToast('AI output approved for players', 'success');
          load();
        } else {
          showToast(res.error ?? 'Could not approve the AI output.', 'error');
        }
      } catch {
        showToast('Could not approve the AI output.', 'error');
      } finally {
        setBusyId(null);
      }
    });
  };

  const handleDismiss = (id: string) => {
    setBusyId(id);
    startTransition(async () => {
      try {
        const res = await dismissAiOutput(id);
        if (res.success) {
          showToast('Kept staff-only', 'success');
          load();
        } else {
          showToast(res.error ?? 'Could not update the AI output.', 'error');
        }
      } catch {
        showToast('Could not update the AI output.', 'error');
      } finally {
        setBusyId(null);
      }
    });
  };

  const pending = (rows ?? []).filter(
    (r) => r.disposition === 'pending' && r.withheld_reason === 'awaiting_approval',
  );
  const recent = rows ?? [];

  return (
    <div className="rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-annual text-sm font-semibold text-text-primary">AI audit log</h3>
        {rows !== null && (
          <Button variant="ghost" size="sm" onClick={load}>
            Refresh
          </Button>
        )}
      </div>

      {/* Loading skeleton — canonical Skeleton primitive, not raw CSS */}
      {rows === null && !error && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading AI audit log">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] p-3">
              <Skeleton className="h-5 w-16 rounded-md" />
              <Skeleton className="h-4 flex-1 rounded-md" />
              <Skeleton className="h-4 w-24 rounded-md" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] p-4 text-center">
          <p className="text-sm text-text-secondary">Could not load the AI audit log.</p>
          <Button variant="ghost" size="sm" onClick={load} className="mt-2">
            Try again
          </Button>
        </div>
      )}

      {/* Empty state */}
      {rows !== null && !error && recent.length === 0 && (
        <div className="rounded-fw-md border border-dashed border-[color:var(--hairline)] bg-[var(--paper)] p-4 text-center">
          <p className="text-sm text-text-secondary">No AI activity yet.</p>
          <p className="mt-0.5 text-xs text-text-tertiary">
            When CoachHelm generates signals, each one is logged here with its
            governance outcome.
          </p>
        </div>
      )}

      {/* Pending-approval queue (the primary action of this surface) */}
      {rows !== null && !error && pending.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-pursuit">
            Awaiting your approval ({pending.length})
          </p>
          <AnimatePresence initial={false}>
            <ul className="space-y-2">
              {pending.map((r, i) => (
                <motion.li
                  key={r.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? {} : { opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.16, delay: i * 0.04 }}
                  layout
                >
                  <AuditRowItem
                    row={r}
                    canManage={canManage}
                    onApprove={handleApprove}
                    onDismiss={handleDismiss}
                    busy={busyId === r.id}
                  />
                </motion.li>
              ))}
            </ul>
          </AnimatePresence>
        </div>
      )}

      {/* Recent feed */}
      {rows !== null && !error && recent.length > 0 && (
        <div>
          {pending.length > 0 && (
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Recent activity
            </p>
          )}
          <AnimatePresence initial={false}>
            <ul className="space-y-2">
              {recent
                .filter((r) => !(r.disposition === 'pending' && r.withheld_reason === 'awaiting_approval'))
                .slice(0, 15)
                .map((r, i) => (
                  <motion.li
                    key={r.id}
                    initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.14, delay: i * 0.025 }}
                  >
                    <AuditRowItem
                      row={r}
                      canManage={canManage}
                      onApprove={handleApprove}
                      onDismiss={handleDismiss}
                      busy={busyId === r.id}
                    />
                  </motion.li>
                ))}
            </ul>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
