'use client';

// =============================================================================
// ExpenseList — reskinned onto "The Living Annual" kit (Lane 3 · THE
// PRESSBOX, team ink — sibling of TravelClient which already migrated; this
// nested component was missed in that pass). PRESENTATION ONLY: the
// `deleteExpense` action and row data are unchanged.
//
// Off-palette chrome removed: cream/warm row cards with `hover:shadow-md`
// (a drop shadow — spec §4.3 forbids elevation outside actively-dragged
// objects) become a hairline-divided row list with `pressableClass`'s
// lane-ink hover tint; the five colored category chips become one neutral
// icon tile (the emoji still carries the read via shape, not chrome color);
// the paid-by pill is now an `<InkBadge>` stamp instead of blue/amber/warm.
// =============================================================================

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { IconTrash, IconChevronDown, IconChevronUp, IconFileText } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import { InkBadge, Eyebrow, pressableClass } from '@/components/baseball/living-annual';
import {
  deleteExpense,
  type BaseballTravelExpense,
  type ExpenseCategory,
} from '@/app/baseball/actions/travel';

interface ExpenseListProps {
  expenses: BaseballTravelExpense[];
  onRefresh: () => void;
  isCoach: boolean;
}

const CATEGORY_CONFIG: Record<ExpenseCategory, { icon: string; label: string }> = {
  transport: { icon: '🚌', label: 'Transport' },
  lodging: { icon: '🏨', label: 'Lodging' },
  meals: { icon: '🍽️', label: 'Meals' },
  equipment: { icon: '⚾', label: 'Equipment' },
  other: { icon: '📦', label: 'Other' },
};

const PAID_BY_TONE: Record<string, 'team' | 'pursuit' | 'neutral'> = {
  team: 'team',
  pending_reimbursement: 'pursuit',
  player: 'neutral',
  split: 'neutral',
};

const PAID_BY_LABELS: Record<string, string> = {
  team: 'Team',
  player: 'Player',
  pending_reimbursement: 'Pending',
  split: 'Split',
};

export function ExpenseList({ expenses, onRefresh, isCoach }: ExpenseListProps) {
  const { showToast } = useToast();
  const prefersReducedMotion = useReducedMotion();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this expense?')) return;

    setDeleting(id);
    const result = await deleteExpense(id);

    if (result.success) {
      onRefresh();
    } else {
      showToast(result.error || 'Failed to delete expense', 'error');
    }
    setDeleting(null);
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  if (expenses.length === 0) {
    return (
      <div className="py-8 text-center">
        <IconFileText size={28} className="mx-auto mb-2 text-text-tertiary" aria-hidden />
        <p className="font-annual text-body-sm text-text-secondary">No expenses yet</p>
        <p className="mt-1 text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
          {isCoach
            ? 'Add the first expense to start tracking costs for this trip'
            : 'No expenses have been recorded for this trip yet'}
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[color:var(--hairline)] rounded-fw-md border border-[color:var(--hairline)]">
      {expenses.map((expense, index) => {
        const config = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.other;
        const isExpanded = expandedId === expense.id;

        return (
          <motion.div
            key={expense.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { delay: index * 0.05 }}
          >
            <div
              role="button"
              tabIndex={0}
              className={pressableClass({ ink: 'team', className: 'flex items-center gap-4 p-4' })}
              onClick={() => setExpandedId(isExpanded ? null : expense.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setExpandedId(isExpanded ? null : expense.id);
                }
              }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--paper-canvas)]">
                <span className="text-lg" aria-hidden>{config.icon}</span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-annual text-body-sm font-medium text-text-primary">
                  {expense.description || config.label}
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
                  <span>{config.label}</span>
                  {expense.vendor_name && (
                    <>
                      <span className="h-1 w-1 rounded-full bg-[color:var(--hairline)]" />
                      <span className="truncate normal-case tracking-normal">{expense.vendor_name}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="hidden text-right sm:block">
                <p className="font-annual text-body-sm text-text-secondary">{formatDate(expense.expense_date)}</p>
              </div>

              <div className="text-right">
                <p className="font-annual text-body-sm font-semibold tabular-nums text-text-primary">
                  {formatCurrency(expense.amount)}
                </p>
                <InkBadge
                  label={(PAID_BY_LABELS[expense.paid_by] || expense.paid_by).toUpperCase()}
                  tone={PAID_BY_TONE[expense.paid_by] ?? 'neutral'}
                  variant="soft"
                />
              </div>

              <div className="text-text-tertiary">
                {isExpanded ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
              </div>
            </div>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-[color:var(--hairline)] px-4 pb-4 pt-3">
                    <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <div>
                        <Eyebrow ink="muted" className="mb-1">Date</Eyebrow>
                        <p className="font-annual text-body-sm text-text-primary">{formatDate(expense.expense_date)}</p>
                      </div>
                      <div>
                        <Eyebrow ink="muted" className="mb-1">Vendor</Eyebrow>
                        <p className="font-annual text-body-sm text-text-primary">{expense.vendor_name || '-'}</p>
                      </div>
                      <div>
                        <Eyebrow ink="muted" className="mb-1">Paid By</Eyebrow>
                        <p className="font-annual text-body-sm text-text-primary">{PAID_BY_LABELS[expense.paid_by]}</p>
                      </div>
                    </div>

                    {expense.notes && (
                      <div className="mb-4">
                        <Eyebrow ink="muted" className="mb-1">Notes</Eyebrow>
                        <p className="font-annual text-body-sm text-text-secondary">{expense.notes}</p>
                      </div>
                    )}

                    {isCoach && (
                      <div className="flex items-center gap-2 border-t border-[color:var(--hairline)] pt-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(expense.id);
                          }}
                          disabled={deleting === expense.id}
                          className="gap-2 text-destructive hover:bg-destructive/10 active:bg-destructive/15"
                        >
                          <IconTrash size={14} />
                          {deleting === expense.id ? 'Deleting...' : 'Delete'}
                        </Button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
