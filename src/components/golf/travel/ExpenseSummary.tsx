'use client';

import { useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { IconTrendingUp, IconTrendingDown, IconEdit } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';
// Deep import of the chart theme (DOM-free, self-contained) rather than the
// charts barrel — avoids pulling the heavy recharts/visx graph into this bundle.
import { VIZ_SEQUENTIAL } from '@/components/fairway/charts/theme';
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

// Category swatch colors map onto the Fairway sequential viz ramp (cream → green
// → amber) — token-backed `var(--fw-viz-seq-*)` references that resolve to the
// locked warm palette, so this surface never reintroduces the old raw blue/
// purple/orange hex. One stable stop per category (order = ALL_CATEGORIES).
const CATEGORY_CONFIG: Record<ExpenseCategory, { label: string; color: string }> = {
  lodging: { label: 'Lodging', color: VIZ_SEQUENTIAL[1] },
  transportation: { label: 'Transportation', color: VIZ_SEQUENTIAL[2] },
  meals: { label: 'Meals', color: VIZ_SEQUENTIAL[5] },
  entry_fees: { label: 'Entry Fees', color: VIZ_SEQUENTIAL[3] },
  equipment: { label: 'Equipment', color: VIZ_SEQUENTIAL[4] },
  other: { label: 'Other', color: 'var(--fw-color-text-tertiary)' },
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
  const prefersReducedMotion = useReducedMotion();
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
        <div className="rounded-lg border border-border-subtle bg-elevated px-3 py-2 shadow-raise">
          <p className="text-sm font-medium text-text-primary">{item.name}</p>
          <p className="text-sm text-text-secondary tabular-nums">{formatCurrency(item.value)}</p>
          <p className="text-xs text-text-tertiary tabular-nums">
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
      <div className="rounded-card border border-border-subtle bg-surface-tint p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-text-secondary mb-1">Total Expenses</p>
            <p className="text-h1 md:text-display font-light tracking-[-0.025em] text-text-primary tabular-nums">{formatCurrency(summary.total)}</p>
            {totalBudget > 0 && (
              <div className="flex items-center gap-2 mt-2">
                {summary.total <= totalBudget ? (
                  <>
                    <IconTrendingDown size={16} className="text-fw-success" />
                    <span className="text-sm text-fw-success">
                      {formatCurrency(totalBudget - summary.total)} under budget
                    </span>
                  </>
                ) : (
                  <>
                    <IconTrendingUp size={16} className="text-fw-danger" />
                    <span className="text-sm text-fw-danger">
                      {formatCurrency(summary.total - totalBudget)} over budget
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm text-text-tertiary tabular-nums">{summary.count} expenses</p>
            {totalBudget > 0 && (
              <p className="text-sm text-text-tertiary mt-1 tabular-nums">
                Budget: {formatCurrency(totalBudget)}
              </p>
            )}
          </div>
        </div>

        {/* Budget Progress Bar */}
        {totalBudget > 0 && (
          <div className="mt-4">
            <div className="h-2 bg-surface-sunken rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${
                  summary.total <= totalBudget ? 'bg-accent-500' : 'bg-fw-danger'
                }`}
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.min((summary.total / totalBudget) * 100, 100)}%`,
                }}
                transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.8, ease: 'easeOut' })}
              />
            </div>
            <p className="text-xs text-text-tertiary mt-1 text-right tabular-nums">
              {((summary.total / totalBudget) * 100).toFixed(0)}% of budget used
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="rounded-card border border-border-subtle bg-surface p-6">
          <h3 className="font-medium text-text-primary mb-4">Breakdown by Category</h3>
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
                      <span className="text-sm text-text-secondary">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-text-tertiary">
              No expenses to display
            </div>
          )}
        </div>

        {/* Category Breakdown with Budgets */}
        <div className="rounded-card border border-border-subtle bg-surface p-6">
          <h3 className="font-medium text-text-primary mb-4">Budget vs Actual</h3>
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
                      <span className="text-sm font-medium text-text-secondary">
                        {config.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary tabular-nums">
                        {formatCurrency(spent)}
                      </span>
                      {editingBudget === category ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={budgetValue}
                            onChange={(e) => setBudgetValue(e.target.value)}
                            className="w-20 px-2 py-1 text-sm rounded border border-border-subtle bg-surface text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                            placeholder="Budget"
                            aria-label={`Budget for ${config.label}`}
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus
                          />
                          <Button variant="primary"
                            onClick={() => handleSaveBudget(category)}
                            disabled={savingBudget}
                            className="px-2 py-1 text-xs"
                          >
                            Save
                          </Button>
                          <Button variant="ghost"
                            onClick={() => {
                              setEditingBudget(null);
                              setBudgetValue('');
                            }}
                            className="px-2 py-1 text-xs"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm text-text-tertiary tabular-nums">
                            / {budget > 0 ? formatCurrency(budget) : '—'}
                          </span>
                          {isCoach && (
                            <IconButton variant="default" aria-label={`Edit budget for ${config.label}`}
                              onClick={() => startEditBudget(category)}
                              className="p-1 rounded hover:bg-surface-sunken transition-colors"
                            >
                              <IconEdit size={12} className="text-text-tertiary" />
                            </IconButton>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 bg-surface-sunken rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        backgroundColor:
                          percentage > 100 ? 'var(--fw-color-danger)' : config.color,
                      }}
                      initial={{ width: 0 }}
                      animate={{
                        width: budget > 0
                          ? `${Math.min(percentage, 100)}%`
                          : spent > 0
                          ? '100%'
                          : '0%',
                      }}
                      transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.5, ease: 'easeOut' })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Payment Status Summary */}
      <div className="rounded-card border border-border-subtle bg-surface p-6">
        <h3 className="font-medium text-text-primary mb-4">Payment Status</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-accent-50 rounded-xl">
            <p className="text-sm text-text-secondary mb-1">Team Paid</p>
            <p className="text-h3 font-medium tracking-[-0.012em] text-text-primary tabular-nums">
              {formatCurrency(summary.byPaidBy.team)}
            </p>
          </div>
          <div className="p-4 bg-surface-sunken rounded-xl">
            <p className="text-sm text-text-secondary mb-1">Player Paid</p>
            <p className="text-h3 font-medium tracking-[-0.012em] text-text-primary tabular-nums">
              {formatCurrency(summary.byPaidBy.player)}
            </p>
          </div>
          <div className="p-4 bg-fw-warning-bg rounded-xl">
            <p className="text-sm text-text-secondary mb-1">Pending Reimbursement</p>
            <p className="text-h3 font-medium tracking-[-0.012em] text-text-primary tabular-nums">
              {formatCurrency(summary.byPaidBy.pending_reimbursement)}
            </p>
          </div>
          {/* Split is a deferred path (ExpenseForm offers no 'split' option), so an
              always-$0 card would be a fabricated metric. Only surface it when
              legacy rows actually carry a split amount — honest "> 0" rule. */}
          {summary.byPaidBy.split > 0 && (
            <div className="p-4 bg-surface-sunken rounded-xl">
              <p className="text-sm text-text-secondary mb-1">Split</p>
              <p className="text-h3 font-medium text-text-primary tracking-[-0.012em] tabular-nums">
                {formatCurrency(summary.byPaidBy.split)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
