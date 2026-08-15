'use client';

/**
 * ============================================================================
 * Fairway · Travel · FairwayExpenseList — the itinerary's logged expenses
 * ----------------------------------------------------------------------------
 * The Fairway re-skin of the legacy ExpenseList (src/components/golf/travel/
 * ExpenseList.tsx), which FairwayTripDetail previously reused VERBATIM. Same
 * expand-to-detail row behavior, same delete flow (deleteTravelExpense,
 * unchanged), same receipt viewer — but on Fairway surfaces/tokens:
 *
 *   • ModalShell delete confirm (replaces the legacy `ConfirmDialog`)
 *   • ModalShell receipt viewer (replaces the raw `bg-warm-900/70` full-screen
 *     click-catcher `<Button>` overlay)
 *   • `fairwayToast` (replaces the direct `@/components/ui/sonner` import)
 *   • Category swatch colors mirror `FairwayExpenseSummary`'s pie-chart legend
 *     (same `VIZ_SEQUENTIAL` ramp) so the two panels read as one system.
 *
 * DEVIATION from a pure verbatim port: on a failed delete, the confirm modal
 * now STAYS OPEN (busy clears, `fairwayToast.error` fires) instead of silently
 * closing as if it had succeeded — a retry affordance the legacy dialog never
 * had. Every other write path is unchanged.
 *
 * ALL write logic preserved VERBATIM: `deleteTravelExpense` import path and
 * contract unchanged — no delete-then-reinsert, a single DELETE per confirm.
 * ========================================================================== */

import * as React from 'react';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { ComponentType, SVGAttributes } from 'react';
import {
  IconEdit,
  IconTrash,
  IconEye,
  IconChevronDown,
  IconChevronUp,
  IconHome,
  IconAirplane,
  IconClipboardList,
  IconAward,
  IconFlag,
  IconLayers,
} from '@/components/icons';
import { Button, Badge, ModalShell, fairwayToast, type FwStatusTone } from '@/components/fairway';
import {
  deleteTravelExpense,
  type TravelExpense,
  type ExpenseCategory,
} from '@/app/golf/actions/travel';
// Shared with FairwayExpenseSummary's pie-chart legend so this list's dots
// and that panel's swatches can never independently drift.
import { CATEGORY_CONFIG } from './expense-category';
import { parseDateOnly } from '@/lib/utils/date-only';

export interface FairwayExpenseListProps {
  expenses: TravelExpense[];
  onEdit: (expense: TravelExpense) => void;
  onRefresh: () => void;
  isCoach: boolean;
}

type ExpenseIcon = ComponentType<SVGAttributes<SVGElement> & { size?: number }>;

const CATEGORY_ICON: Record<ExpenseCategory, ExpenseIcon> = {
  lodging: IconHome,
  transportation: IconAirplane,
  meals: IconClipboardList,
  entry_fees: IconAward,
  equipment: IconFlag,
  other: IconLayers,
};

const PAID_BY_LABELS: Record<string, string> = {
  team: 'Team',
  player: 'Player',
  pending_reimbursement: 'Pending',
  split: 'Split',
};

const PAID_BY_TONE: Record<string, FwStatusTone> = {
  team: 'accent',
  player: 'neutral',
  pending_reimbursement: 'warning',
  split: 'neutral',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  // `expense_date` is a date-only column. Parsing it raw gives UTC midnight,
  // which renders as the previous day for every negative-offset (i.e. US)
  // user — an expense stored 2026-07-08 displayed as "Jul 7, 2026" while the
  // CSV export of the same row correctly said 2026-07-08.
  return parseDateOnly(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function FairwayExpenseList({ expenses, onEdit, onRefresh, isCoach }: FairwayExpenseListProps) {
  const prefersReducedMotion = useReducedMotion();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [viewingReceipt, setViewingReceipt] = React.useState<string | null>(null);
  const [receiptStatus, setReceiptStatus] = React.useState<'loading' | 'loaded' | 'error'>('loading');

  function openReceipt(url: string | null) {
    if (!url) return;
    setReceiptStatus('loading');
    setViewingReceipt(url);
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    setDeleting(true);
    const result = await deleteTravelExpense(pendingDeleteId);
    setDeleting(false);
    if (result.success) {
      setPendingDeleteId(null);
      onRefresh();
    } else {
      // Stay open — a real retry affordance, not a silent close-as-if-succeeded.
      fairwayToast.error(result.error || 'Failed to delete expense');
    }
  }

  // Reachable only defensively — the parent (FairwayTripDetail) already gates
  // this component behind `expenses.length > 0` and renders its own EmptyState
  // otherwise, so this never renders a competing empty state.
  if (expenses.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {expenses.map((expense) => {
        const CategoryIcon = CATEGORY_ICON[expense.category] ?? CATEGORY_ICON.other;
        const categoryLabel = CATEGORY_CONFIG[expense.category]?.label ?? 'Other';
        const swatch = CATEGORY_CONFIG[expense.category]?.color ?? CATEGORY_CONFIG.other.color;
        const isExpanded = expandedId === expense.id;

        return (
          <div
            key={expense.id}
            className="overflow-hidden rounded-fw-md border border-border-subtle bg-surface shadow-flat"
          >
            {/* eslint-disable-next-line helm/no-raw-button -- full-row disclosure toggle; the Fairway Button is a pill CTA and can't host a left-aligned full-width row */}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : expense.id)}
              aria-expanded={isExpanded}
              className="flex w-full items-center gap-3.5 p-4 text-left outline-none transition-colors hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-inset"
            >
              <span
                className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-fw-sm bg-surface-sunken text-text-secondary"
                aria-hidden
              >
                <CategoryIcon size={18} />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                  {expense.description}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5 font-fw-sans text-caption text-text-tertiary">
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: swatch }}
                      aria-hidden
                    />
                    {categoryLabel}
                  </span>
                  {expense.vendor_name ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="truncate">{expense.vendor_name}</span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="hidden text-right sm:block">
                <p className="font-fw-sans text-caption text-text-tertiary tabular-nums">
                  {formatDate(expense.expense_date)}
                </p>
              </div>

              <div className="flex-shrink-0 text-right">
                <p className="font-fw-mono text-body-sm font-medium text-text-primary tabular-nums">
                  {formatCurrency(expense.amount)}
                </p>
                <Badge tone={PAID_BY_TONE[expense.paid_by] ?? 'neutral'} size="sm" className="mt-1">
                  {PAID_BY_LABELS[expense.paid_by] || expense.paid_by}
                </Badge>
              </div>

              <span className="flex-shrink-0 text-text-tertiary" aria-hidden>
                {isExpanded ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
              </span>
            </button>

            <AnimatePresence initial={false}>
              {isExpanded ? (
                <m.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={
                    prefersReducedMotion
                      ? { duration: 0 }
                      : { height: { type: 'spring', stiffness: 500, damping: 32 }, opacity: { duration: 0.15 } }
                  }
                  className="overflow-hidden"
                >
                  <div className="border-t border-border-subtle px-4 pb-4 pt-3">
                    <div className="grid grid-cols-2 gap-4 font-fw-sans text-caption sm:grid-cols-4">
                      <div>
                        <p className="mb-1 uppercase tracking-[0.08em] text-text-tertiary">Date</p>
                        <p className="text-text-primary tabular-nums">{formatDate(expense.expense_date)}</p>
                      </div>
                      <div>
                        <p className="mb-1 uppercase tracking-[0.08em] text-text-tertiary">Vendor</p>
                        <p className="text-text-primary">{expense.vendor_name || '—'}</p>
                      </div>
                      <div>
                        <p className="mb-1 uppercase tracking-[0.08em] text-text-tertiary">Paid by</p>
                        <p className="text-text-primary">{PAID_BY_LABELS[expense.paid_by] || expense.paid_by}</p>
                      </div>
                      <div>
                        <p className="mb-1 uppercase tracking-[0.08em] text-text-tertiary">Receipt</p>
                        {expense.receipt_url ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openReceipt(expense.receipt_url)}
                            leftIcon={<IconEye size={14} />}
                            className="-ml-2 h-auto min-h-0 px-2 py-1 text-accent-700 hover:text-fw-success-ink"
                          >
                            View
                          </Button>
                        ) : (
                          <p className="text-text-tertiary">None</p>
                        )}
                      </div>
                    </div>

                    {expense.notes ? (
                      <div className="mt-3.5">
                        <p className="mb-1 font-fw-sans text-caption uppercase tracking-[0.08em] text-text-tertiary">
                          Notes
                        </p>
                        <p className="font-fw-sans text-body-sm text-text-secondary">{expense.notes}</p>
                      </div>
                    ) : null}

                    {isCoach ? (
                      <div className="mt-3.5 flex items-center gap-2 border-t border-border-subtle pt-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(expense)}
                          leftIcon={<IconEdit size={14} />}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setPendingDeleteId(expense.id)}
                          leftIcon={<IconTrash size={14} />}
                        >
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </m.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}

      {/* Delete confirm — ONE ModalShell instance, matching the trip-delete
          confirm on FairwayTripDetail (single overlay paradigm across Travel). */}
      <ModalShell
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDeleteId(null);
        }}
        size="sm"
        title="Delete this expense?"
        description="This can't be undone."
      >
        <ModalShell.Footer>
          <Button variant="ghost" onClick={() => setPendingDeleteId(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => { void confirmDelete(); }} busy={deleting}>
            Delete expense
          </Button>
        </ModalShell.Footer>
      </ModalShell>

      {/* Receipt viewer — replaces the legacy raw bg-warm-900/70 click-catcher. */}
      <ModalShell
        open={viewingReceipt !== null}
        onOpenChange={(open) => {
          if (!open) setViewingReceipt(null);
        }}
        size="xl"
        title="Receipt"
      >
        <ModalShell.Body>
          {receiptStatus === 'error' ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-fw-md bg-surface-sunken py-12 text-center">
              <p className="font-fw-sans text-body-sm font-medium text-text-primary">
                Couldn&apos;t load receipt
              </p>
              <p className="font-fw-sans text-caption text-text-tertiary">
                The file may have moved or expired.
              </p>
              {viewingReceipt ? (
                <a
                  href={viewingReceipt}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-fw-sans text-caption font-medium text-accent-700 underline underline-offset-2 hover:text-fw-success-ink"
                >
                  Open in new tab
                </a>
              ) : null}
            </div>
          ) : viewingReceipt ? (
            <div className="relative">
              {receiptStatus === 'loading' ? (
                <div
                  className="absolute inset-0 flex animate-pulse items-center justify-center rounded-fw-md bg-surface-sunken"
                  aria-hidden="true"
                >
                  <span className="font-fw-sans text-caption text-text-tertiary">Loading receipt…</span>
                </div>
              ) : null}
              {viewingReceipt.endsWith('.pdf') ? (
                <iframe
                  src={viewingReceipt}
                  className="h-96 w-full rounded-fw-md border-0"
                  title="Receipt PDF"
                  // `viewingReceipt` is a coach-uploaded `receipt_url` — a
                  // mis-typed URL, compromised storage object, or malicious
                  // link would otherwise get full script/form/top-nav rights.
                  // Empty sandbox = no script, no forms, no top-frame nav.
                  sandbox=""
                  onLoad={() => setReceiptStatus('loaded')}
                  onError={() => setReceiptStatus('error')}
                />
              ) : (
                // A user-uploaded Supabase Storage URL, not an optimizable static
                // asset — matches the legacy ExpenseList's receipt viewer (raw <img>).
                <img
                  src={viewingReceipt}
                  alt="Receipt"
                  className="h-auto w-full rounded-fw-md"
                  onLoad={() => setReceiptStatus('loaded')}
                  onError={() => setReceiptStatus('error')}
                />
              )}
            </div>
          ) : null}
        </ModalShell.Body>
        <ModalShell.Footer>
          <Button variant="ghost" onClick={() => setViewingReceipt(null)}>
            Close
          </Button>
        </ModalShell.Footer>
      </ModalShell>
    </div>
  );
}
