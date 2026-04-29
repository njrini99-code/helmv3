'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { IconTrendingUp, IconTrendingDown, IconEdit } from '@/components/icons';
import {
  type ExpenseSummary as ExpenseSummaryType,
  type ExpenseCategory,
  type TravelBudget,
  setBudget,
} from '@/app/golf/actions/travel';

interface ExpenseSummaryProps {
  summary: ExpenseSummaryType;
  budgets: TravelBudget[];
  itineraryId: string;
  isCoach: boolean;
  onBudgetUpdated: () => void;
}

const CATEGORY_CONFIG: Record<ExpenseCategory, { label: string; color: string }> = {
  lodging: { label: 'Lodging', color: '#3B82F6' },
  transportation: { label: 'Transportation', color: '#8B5CF6' },
  meals: { label: 'Meals', color: '#F97316' },
  entry_fees: { label: 'Entry Fees', color: '#22C55E' },
  equipment: { label: 'Equipment', color: '#14B8A6' },
  other: { label: 'Other', color: '#78716c' },
};

const ALL_CATEGORIES: ExpenseCategory[] = [
  'lodging',
  'transportation',
  'meals',
  'entry_fees',
  'equipment',
  'other',
];

export function ExpenseSummary({
  summary,
  budgets,
  itineraryId,
  isCoach,
  onBudgetUpdated,
}: ExpenseSummaryProps) {
  const [editingBudget, setEditingBudget] = useState<ExpenseCategory | null>(null);
  const [budgetValue, setBudgetValue] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  // Prepare data for pie chart
  const pieData = useMemo(() => {
    return ALL_CATEGORIES
      .filter((cat) => summary.byCategory[cat] > 0)
      .map((cat) => ({
        name: CATEGORY_CONFIG[cat].label,
        value: summary.byCategory[cat],
        color: CATEGORY_CONFIG[cat].color,
      }));
  }, [summary.byCategory]);

  // Build budget lookup
  const budgetLookup = useMemo(() => {
    const lookup: Record<string, number> = {};
    budgets.forEach((b) => {
      lookup[b.category] = b.budgeted_amount;
    });
    return lookup;
  }, [budgets]);

  // Total budget
  const totalBudget = useMemo(() => {
    return Object.values(budgetLookup).reduce((sum, val) => sum + val, 0);
  }, [budgetLookup]);

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  async function handleSaveBudget(category: ExpenseCategory) {
    const amount = parseFloat(budgetValue);
    if (isNaN(amount) || amount < 0) return;

    setSavingBudget(true);
    const result = await setBudget({
      itinerary_id: itineraryId,
      category,
      budgeted_amount: amount,
    });

    if (result.success) {
      onBudgetUpdated();
    }
    setSavingBudget(false);
    setEditingBudget(null);
    setBudgetValue('');
  }

  function startEditBudget(category: ExpenseCategory) {
    setEditingBudget(category);
    setBudgetValue(budgetLookup[category]?.toString() || '');
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { color: string } }> }) => {
    if (active && payload && payload.length && payload[0]) {
      const item = payload[0];
      return (
        <div className="bg-cream-50/95 backdrop-blur-sm rounded-lg shadow-lg border border-warm-200 px-3 py-2">
          <p className="text-sm font-medium text-warm-900">{item.name}</p>
          <p className="text-sm text-warm-600">{formatCurrency(item.value)}</p>
          <p className="text-xs text-warm-400">
            {((item.value / summary.total) * 100).toFixed(1)}% of total
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Total Summary Card */}
      <div className="bg-gradient-to-br from-primary-50 to-primary-50 rounded-2xl p-6 border border-primary-100">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-primary-700 mb-1">Total Expenses</p>
            <p className="text-3xl font-bold text-primary-900 tabular-nums">{formatCurrency(summary.total)}</p>
            {totalBudget > 0 && (
              <div className="flex items-center gap-2 mt-2">
                {summary.total <= totalBudget ? (
                  <>
                    <IconTrendingDown size={16} className="text-primary-600" />
                    <span className="text-sm text-primary-600">
                      {formatCurrency(totalBudget - summary.total)} under budget
                    </span>
                  </>
                ) : (
                  <>
                    <IconTrendingUp size={16} className="text-red-600" />
                    <span className="text-sm text-red-600">
                      {formatCurrency(summary.total - totalBudget)} over budget
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm text-warm-500">{summary.count} expenses</p>
            {totalBudget > 0 && (
              <p className="text-sm text-warm-500 mt-1">
                Budget: {formatCurrency(totalBudget)}
              </p>
            )}
          </div>
        </div>

        {/* Budget Progress Bar */}
        {totalBudget > 0 && (
          <div className="mt-4">
            <div className="h-2 bg-cream-100/60 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${
                  summary.total <= totalBudget ? 'bg-primary-500' : 'bg-red-500'
                }`}
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.min((summary.total / totalBudget) * 100, 100)}%`,
                }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <p className="text-xs text-warm-500 mt-1 text-right">
              {((summary.total / totalBudget) * 100).toFixed(0)}% of budget used
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="bg-white rounded-2xl border border-warm-200 p-6">
          <h3 className="font-semibold text-warm-900 mb-4">Breakdown by Category</h3>
          {pieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    formatter={(value) => (
                      <span className="text-sm text-warm-600">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-warm-400">
              No expenses to display
            </div>
          )}
        </div>

        {/* Category Breakdown with Budgets */}
        <div className="bg-white rounded-2xl border border-warm-200 p-6">
          <h3 className="font-semibold text-warm-900 mb-4">Budget vs Actual</h3>
          <div className="space-y-4">
            {ALL_CATEGORIES.map((category) => {
              const config = CATEGORY_CONFIG[category];
              const spent = summary.byCategory[category] || 0;
              const budget = budgetLookup[category] || 0;
              const percentage = budget > 0 ? (spent / budget) * 100 : 0;

              return (
                <div key={category} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: config.color }}
                      />
                      <span className="text-sm font-medium text-warm-700">
                        {config.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-warm-900">
                        {formatCurrency(spent)}
                      </span>
                      {editingBudget === category ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={budgetValue}
                            onChange={(e) => setBudgetValue(e.target.value)}
                            className="w-20 px-2 py-1 text-sm border border-warm-200 rounded"
                            placeholder="Budget"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveBudget(category)}
                            disabled={savingBudget}
                            className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingBudget(null);
                              setBudgetValue('');
                            }}
                            className="px-2 py-1 text-xs text-warm-500 hover:text-warm-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm text-warm-400">
                            / {budget > 0 ? formatCurrency(budget) : '-'}
                          </span>
                          {isCoach && (
                            <button
                              onClick={() => startEditBudget(category)}
                              className="p-1 hover:bg-warm-100 active:bg-warm-200 rounded transition-colors"
                            >
                              <IconEdit size={12} className="text-warm-400" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        backgroundColor:
                          percentage > 100 ? '#EF4444' : config.color,
                      }}
                      initial={{ width: 0 }}
                      animate={{
                        width: budget > 0
                          ? `${Math.min(percentage, 100)}%`
                          : spent > 0
                          ? '100%'
                          : '0%',
                      }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Payment Status Summary */}
      <div className="bg-white rounded-2xl border border-warm-200 p-6">
        <h3 className="font-semibold text-warm-900 mb-4">Payment Status</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
            <p className="text-sm text-amber-700 mb-1">Pending Reimbursement</p>
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
