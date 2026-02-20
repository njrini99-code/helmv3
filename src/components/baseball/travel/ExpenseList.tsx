'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconTrash, IconChevronDown, IconChevronUp } from '@/components/icons';
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

const CATEGORY_CONFIG: Record<ExpenseCategory, { icon: string; label: string; color: string }> = {
  transport: { icon: '🚌', label: 'Transport', color: 'bg-purple-100 text-purple-700' },
  lodging: { icon: '🏨', label: 'Lodging', color: 'bg-blue-100 text-blue-700' },
  meals: { icon: '🍽️', label: 'Meals', color: 'bg-orange-100 text-orange-700' },
  equipment: { icon: '⚾', label: 'Equipment', color: 'bg-green-100 text-green-700' },
  other: { icon: '📦', label: 'Other', color: 'bg-warm-100 text-warm-700' },
};

const PAID_BY_LABELS: Record<string, string> = {
  team: 'Team',
  player: 'Player',
  pending_reimbursement: 'Pending',
  split: 'Split',
};

export function ExpenseList({ expenses, onRefresh, isCoach }: ExpenseListProps) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this expense?')) return;

    setDeleting(id);
    const result = await deleteExpense(id);

    if (result.success) {
      onRefresh();
    } else {
      alert(result.error || 'Failed to delete expense');
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
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">💸</span>
        </div>
        <h3 className="text-lg font-semibold text-warm-900 mb-2">No Expenses Yet</h3>
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
        const isExpanded = expandedId === expense.id;

        return (
          <motion.div
            key={expense.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white rounded-xl border border-warm-200 overflow-hidden hover:shadow-md transition-shadow"
          >
            <div
              className="p-4 flex items-center gap-4 cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : expense.id)}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${config.color}`}>
                <span className="text-lg">{config.icon}</span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-warm-900 truncate">
                  {expense.description || config.label}
                </p>
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

              <div className="text-right hidden sm:block">
                <p className="text-sm text-warm-600">{formatDate(expense.expense_date)}</p>
              </div>

              <div className="text-right">
                <p className="font-semibold text-warm-900">{formatCurrency(expense.amount)}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  expense.paid_by === 'team' ? 'bg-green-100 text-green-700' :
                  expense.paid_by === 'pending_reimbursement' ? 'bg-amber-100 text-amber-700' :
                  'bg-warm-100 text-warm-600'
                }`}>
                  {PAID_BY_LABELS[expense.paid_by] || expense.paid_by}
                </span>
              </div>

              <div className="text-warm-400">
                {isExpanded ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
              </div>
            </div>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-2 border-t border-warm-100">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mb-4">
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
                    </div>

                    {expense.notes && (
                      <div className="mb-4">
                        <p className="text-warm-500 text-xs uppercase tracking-wide mb-1">Notes</p>
                        <p className="text-warm-700 text-sm">{expense.notes}</p>
                      </div>
                    )}

                    {isCoach && (
                      <div className="flex items-center gap-2 pt-2 border-t border-warm-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(expense.id);
                          }}
                          disabled={deleting === expense.id}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <IconTrash size={14} />
                          {deleting === expense.id ? 'Deleting...' : 'Delete'}
                        </button>
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
