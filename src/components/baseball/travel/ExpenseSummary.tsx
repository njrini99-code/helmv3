'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  type BaseballExpenseSummary,
  type ExpenseCategory,
} from '@/app/baseball/actions/travel';

interface ExpenseSummaryProps {
  summary: BaseballExpenseSummary;
}

const CATEGORY_CONFIG: Record<ExpenseCategory, { label: string; color: string }> = {
  transport: { label: 'Transport', color: '#8B5CF6' },
  lodging: { label: 'Lodging', color: '#3B82F6' },
  meals: { label: 'Meals', color: '#F97316' },
  equipment: { label: 'Equipment', color: '#22C55E' },
  other: { label: 'Other', color: '#64748B' },
};

const ALL_CATEGORIES: ExpenseCategory[] = ['transport', 'lodging', 'meals', 'equipment', 'other'];

const PAID_BY_LABELS: Record<string, string> = {
  team: 'Team',
  player: 'Player',
  pending_reimbursement: 'Pending',
  split: 'Split',
};

export function ExpenseSummary({ summary }: ExpenseSummaryProps) {
  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  const maxCategoryAmount = useMemo(() => {
    return Math.max(...ALL_CATEGORIES.map(cat => summary.byCategory[cat] || 0), 1);
  }, [summary.byCategory]);

  return (
    <div className="space-y-6">
      {/* Total Summary */}
      <div className="bg-gradient-to-br from-primary-50 to-emerald-50 rounded-2xl p-6 border border-primary-100">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-primary-700 mb-1">Total Expenses</p>
            <p className="text-3xl font-bold text-primary-900 tabular-nums">{formatCurrency(summary.total)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-warm-500">{summary.count} expenses</p>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="bg-white rounded-2xl border border-warm-200 p-6">
        <h3 className="font-semibold text-warm-900 mb-4">By Category</h3>
        <div className="space-y-4">
          {ALL_CATEGORIES.map((category) => {
            const config = CATEGORY_CONFIG[category];
            const spent = summary.byCategory[category] || 0;
            const percentage = maxCategoryAmount > 0 ? (spent / maxCategoryAmount) * 100 : 0;

            return (
              <div key={category} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: config.color }}
                    />
                    <span className="text-sm font-medium text-warm-700">{config.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-warm-900">
                    {formatCurrency(spent)}
                  </span>
                </div>
                <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: config.color }}
                    initial={{ width: 0 }}
                    animate={{ width: spent > 0 ? `${percentage}%` : '0%' }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment Status */}
      <div className="bg-white rounded-2xl border border-warm-200 p-6">
        <h3 className="font-semibold text-warm-900 mb-4">Payment Status</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-primary-50 rounded-xl">
            <p className="text-sm text-primary-700 mb-1">Team Paid</p>
            <p className="text-xl font-bold text-primary-900">
              {formatCurrency(summary.byPaidBy.team)}
            </p>
          </div>
          <div className="p-4 bg-blue-50 rounded-xl">
            <p className="text-sm text-blue-700 mb-1">Player Paid</p>
            <p className="text-xl font-bold text-blue-900">
              {formatCurrency(summary.byPaidBy.player)}
            </p>
          </div>
          <div className="p-4 bg-amber-50 rounded-xl">
            <p className="text-sm text-amber-700 mb-1">{PAID_BY_LABELS.pending_reimbursement}</p>
            <p className="text-xl font-bold text-amber-900">
              {formatCurrency(summary.byPaidBy.pending_reimbursement)}
            </p>
          </div>
          <div className="p-4 bg-warm-50 rounded-xl">
            <p className="text-sm text-warm-700 mb-1">Split</p>
            <p className="text-xl font-bold text-warm-900">
              {formatCurrency(summary.byPaidBy.split)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
