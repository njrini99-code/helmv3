'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  IconEdit,
  IconTrash,
  IconX,
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
import type { ComponentType, SVGAttributes } from 'react';
import { toast } from '@/components/ui/sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button, IconButton } from '@/components/ui/button';
import {
  deleteTravelExpense,
  type TravelExpense,
  type ExpenseCategory,
} from '@/app/golf/actions/travel';

interface ExpenseListProps {
  expenses: TravelExpense[];
  onEdit: (expense: TravelExpense) => void;
  onRefresh: () => void;
  isCoach: boolean;
}

type ExpenseIcon = ComponentType<SVGAttributes<SVGElement> & { size?: number }>;

const CATEGORY_CONFIG: Record<ExpenseCategory, { icon: ExpenseIcon; label: string; color: string }> = {
  lodging: { icon: IconHome, label: 'Lodging', color: 'bg-blue-100 text-blue-700' },
  transportation: { icon: IconAirplane, label: 'Transportation', color: 'bg-purple-100 text-purple-700' },
  meals: { icon: IconClipboardList, label: 'Meals', color: 'bg-orange-100 text-orange-700' },
  entry_fees: { icon: IconAward, label: 'Entry Fees', color: 'bg-primary-100 text-primary-700' },
  equipment: { icon: IconFlag, label: 'Equipment', color: 'bg-teal-100 text-teal-700' },
  other: { icon: IconLayers, label: 'Other', color: 'bg-warm-100 text-warm-700' },
};

const PAID_BY_LABELS: Record<string, string> = {
  team: 'Team',
  player: 'Player',
  pending_reimbursement: 'Pending',
  split: 'Split',
};

export function ExpenseList({ expenses, onEdit, onRefresh, isCoach }: ExpenseListProps) {
  const prefersReducedMotion = useReducedMotion();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  function openReceipt(url: string | null) {
    if (!url) return;
    setReceiptStatus('loading');
    setViewingReceipt(url);
  }

  function handleDelete(id: string) {
    setPendingDeleteId(id);
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;

    setDeleting(id);
    const result = await deleteTravelExpense(id);

    if (result.success) {
      onRefresh();
    } else {
      toast.error(result.error || 'Failed to delete expense');
    }
    setDeleting(null);
    setPendingDeleteId(null);
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
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">💸</span>
        </div>
        <h3 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-2">No Expenses Yet</h3>
        <p className="text-sm text-warm-500 max-w-sm mx-auto">
          {isCoach
            ? 'Add your first expense to start tracking costs for this trip.'
            : 'No expenses have been recorded for this trip yet.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {expenses.map((expense, index) => {
        const config = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.other;
        const CategoryIcon = config.icon;
        const isExpanded = expandedId === expense.id;

        return (
          <motion.div
            key={expense.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ delay: index * 0.05 })}
            className="bg-cream-50 rounded-xl border border-warm-200 overflow-hidden hover:shadow-md transition-shadow"
          >
            {/* Main Row */}
            <Button
              variant="ghost"
              type="button"
              className="p-4 rounded-none h-auto flex items-center gap-4 justify-start cursor-pointer w-full text-left hover:bg-transparent"
              onClick={() => setExpandedId(isExpanded ? null : expense.id)}
            >
              {/* Category Icon */}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${config.color}`}>
                <CategoryIcon size={18} />
              </div>

              {/* Description */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-warm-900 truncate">{expense.description}</p>
                <div className="flex items-center gap-2 text-xs text-warm-500 mt-0.5">
                  <span>{config.label}</span>
                  {expense.vendor_name && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-warm-300" />
                      <span className="truncate">{expense.vendor_name}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Date */}
              <div className="text-right hidden sm:block">
                <p className="text-sm text-warm-600">{formatDate(expense.expense_date)}</p>
              </div>

              {/* Amount */}
              <div className="text-right">
                <p className="font-medium text-warm-900">{formatCurrency(expense.amount)}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  expense.paid_by === 'team' ? 'bg-primary-100 text-primary-700' :
                  expense.paid_by === 'pending_reimbursement' ? 'bg-amber-100 text-amber-700' :
                  'bg-warm-100 text-warm-600'
                }`}>
                  {PAID_BY_LABELS[expense.paid_by] || expense.paid_by}
                </span>
              </div>

              {/* Expand Arrow */}
              <div className="text-warm-400">
                {isExpanded ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
              </div>
            </Button>

            {/* Expanded Details */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={prefersReducedMotion ? { duration: 0 } : ({ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } })}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-2 border-t border-warm-100">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
                      <div>
                        <p className="text-warm-500 text-xs uppercase tracking-wide mb-1">Date</p>
                        <p className="text-warm-900">{formatDate(expense.expense_date)}</p>
                      </div>
                      <div>
                        <p className="text-warm-500 text-xs uppercase tracking-wide mb-1">Vendor</p>
                        <p className="text-warm-900">{expense.vendor_name || '-'}</p>
                      </div>
                      <div>
                        <p className="text-warm-500 text-xs uppercase tracking-wide mb-1">Paid By</p>
                        <p className="text-warm-900">{PAID_BY_LABELS[expense.paid_by]}</p>
                      </div>
                      <div>
                        <p className="text-warm-500 text-xs uppercase tracking-wide mb-1">Receipt</p>
                        {expense.receipt_url ? (
                          <Button variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              openReceipt(expense.receipt_url);
                            }}
                            className="text-primary-600 hover:text-primary-700 flex items-center gap-1"
                          >
                            <IconEye size={14} />
                            View
                          </Button>
                        ) : (
                          <p className="text-warm-400">None</p>
                        )}
                      </div>
                    </div>

                    {expense.notes && (
                      <div className="mb-4">
                        <p className="text-warm-500 text-xs uppercase tracking-wide mb-1">Notes</p>
                        <p className="text-warm-700 text-sm">{expense.notes}</p>
                      </div>
                    )}

                    {/* Actions */}
                    {isCoach && (
                      <div className="flex items-center gap-2 pt-2 border-t border-warm-100">
                        <Button variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(expense);
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm text-warm-600 hover:text-warm-900 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors"
                        >
                          <IconEdit size={14} />
                          Edit
                        </Button>
                        <Button variant="danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(expense.id);
                          }}
                          disabled={deleting === expense.id}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
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

      {/* Delete confirmation */}
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete expense?"
        message="Are you sure you want to delete this expense? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleting !== null}
        onConfirm={() => { void confirmDelete(); }}
        onCancel={() => {
          if (deleting === null) setPendingDeleteId(null);
        }}
      />

      {/* Receipt Viewer Modal */}
      {viewingReceipt && (
        <Button
          variant="ghost"
          type="button"
          aria-label="Close receipt viewer"
          className="fixed inset-0 bg-warm-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 w-full h-full rounded-none border-none cursor-default hover:bg-warm-900/70"
          onClick={() => setViewingReceipt(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-cream-50 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-warm-200 flex items-center justify-between">
              <h3 className="font-medium text-warm-900">Receipt</h3>
              <IconButton variant="default" aria-label="Close receipt"
                onClick={() => setViewingReceipt(null)}
                className="p-2 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors"
              >
                <IconX size={18} />
              </IconButton>
            </div>
            <div className="p-4 max-h-[60vh] overflow-auto">
              {receiptStatus === 'error' ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <p className="text-warm-700 text-sm font-medium">Couldn&apos;t load receipt</p>
                  <p className="text-warm-500 text-xs">
                    The file may have moved or expired.
                  </p>
                  <a
                    href={viewingReceipt}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-700 text-sm font-medium underline underline-offset-2"
                  >
                    Open in new tab
                  </a>
                </div>
              ) : (
                <div className="relative">
                  {receiptStatus === 'loading' && (
                    <div
                      className="absolute inset-0 flex items-center justify-center rounded-lg bg-warm-100 animate-pulse"
                      aria-hidden="true"
                    >
                      <span className="text-warm-500 text-xs">Loading receipt…</span>
                    </div>
                  )}
                  {viewingReceipt.endsWith('.pdf') ? (
                    <iframe
                      src={viewingReceipt}
                      className="w-full h-96 border-0"
                      title="Receipt PDF"
                      onLoad={() => setReceiptStatus('loaded')}
                      onError={() => setReceiptStatus('error')}
                    />
                  ) : (
                    <img
                      src={viewingReceipt}
                      alt="Receipt"
                      className="w-full h-auto rounded-lg"
                      onLoad={() => setReceiptStatus('loaded')}
                      onError={() => setReceiptStatus('error')}
                    />
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </Button>
      )}
    </div>
  );
}
