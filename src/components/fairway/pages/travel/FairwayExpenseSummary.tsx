'use client';

/**
 * ============================================================================
 * Fairway · Travel · FairwayExpenseSummary — trip expense breakdown + budgets
 * ----------------------------------------------------------------------------
 * The Fairway re-skin of the legacy ExpenseSummary (src/components/golf/
 * travel/ExpenseSummary.tsx), which FairwayTripDetail previously reused
 * VERBATIM. Same total/budget header, same category pie chart + budget-vs-
 * actual bars, same payment-status cards — but on Fairway controls:
 *
 *   • `@/components/fairway` Button/IconButton (replaces `@/components/ui/button`)
 *   • `@/components/fairway/forms` Input (replaces `@/components/ui/input`)
 *   • `font-fw-sans` throughout (Fairway type is a token, not just color)
 *
 * DEVIATION from a pure verbatim port: the legacy `handleSaveBudget` had no
 * failure path at all — a rejected `setBudget` call silently closed the editor
 * as if it had saved. `fairwayToast.error` now fires on failure and the editor
 * STAYS OPEN so the coach can retry without re-typing.
 *
 * Category swatch colors + pie chart logic (recharts) are UNCHANGED — this is
 * a token/control migration, not a re-architecture.
 * ========================================================================== */

import { useState, useMemo } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { IconTrendingUp, IconTrendingDown, IconEdit } from '@/components/icons';
import { Button, IconButton, fairwayToast } from '@/components/fairway';
import { Input } from '@/components/fairway/forms';
// Deep import of the chart theme (DOM-free, self-contained) rather than the
// charts barrel — avoids pulling the heavy recharts/visx graph into this
// bundle a second time (recharts itself is already required below).
import { VIZ_SEQUENTIAL } from '@/components/fairway/charts/theme';
import {
  type ExpenseSummary as ExpenseSummaryType,
  type ExpenseCategory,
  type TravelBudget,
  setBudget,
} from '@/app/golf/actions/travel';

export interface FairwayExpenseSummaryProps {
  summary: ExpenseSummaryType;
  budgets: TravelBudget[];
  itineraryId: string;
  isCoach: boolean;
  onBudgetUpdated: () => void;
}

// Category swatch colors map onto the Fairway sequential viz ramp (cream →
// green → amber) — token-backed `var(--fw-viz-seq-*)` references that resolve
// to the locked warm palette, so this surface never reintroduces the old raw
// blue/purple/orange hex. One stable stop per category (order = ALL_CATEGORIES).
// IDENTICAL mapping to FairwayExpenseList's CATEGORY_SWATCH.
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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function FairwayExpenseSummary({
  summary,
  budgets,
  itineraryId,
  isCoach,
  onBudgetUpdated,
}: FairwayExpenseSummaryProps) {
  const prefersReducedMotion = useReducedMotion();
  const [editingBudget, setEditingBudget] = useState<ExpenseCategory | null>(null);
  const [budgetValue, setBudgetValue] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  const pieData = useMemo(() => {
    return ALL_CATEGORIES.filter((cat) => summary.byCategory[cat] > 0).map((cat) => ({
      name: CATEGORY_CONFIG[cat].label,
      value: summary.byCategory[cat],
      color: CATEGORY_CONFIG[cat].color,
    }));
  }, [summary.byCategory]);

  const budgetLookup = useMemo(() => {
    const lookup: Record<string, number> = {};
    budgets.forEach((b) => {
      lookup[b.category] = b.budgeted_amount;
    });
    return lookup;
  }, [budgets]);

  const totalBudget = useMemo(() => {
    return Object.values(budgetLookup).reduce((sum, val) => sum + val, 0);
  }, [budgetLookup]);

  async function handleSaveBudget(category: ExpenseCategory) {
    const amount = parseFloat(budgetValue);
    if (isNaN(amount) || amount < 0) return;

    setSavingBudget(true);
    const result = await setBudget({
      itinerary_id: itineraryId,
      category,
      budgeted_amount: amount,
    });
    setSavingBudget(false);

    if (result.success) {
      onBudgetUpdated();
      setEditingBudget(null);
      setBudgetValue('');
    } else {
      // Stay open — a real retry affordance instead of a silent close-as-if-saved.
      fairwayToast.error(result.error || 'Failed to save budget');
    }
  }

  function startEditBudget(category: ExpenseCategory) {
    setEditingBudget(category);
    setBudgetValue(budgetLookup[category]?.toString() || '');
  }

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; payload: { color: string } }>;
  }) => {
    if (active && payload && payload.length && payload[0]) {
      const item = payload[0];
      return (
        <div className="rounded-fw-md border border-border-subtle bg-elevated px-3 py-2 shadow-raise">
          <p className="font-fw-sans text-body-sm font-medium text-text-primary">{item.name}</p>
          <p className="font-fw-sans text-body-sm text-text-secondary tabular-nums">
            {formatCurrency(item.value)}
          </p>
          <p className="font-fw-sans text-caption text-text-tertiary tabular-nums">
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
            <p className="mb-1 font-fw-sans text-body-sm font-medium text-text-secondary">
              Total Expenses
            </p>
            <p className="font-fw-sans text-h1 font-light tracking-[-0.025em] text-text-primary tabular-nums md:text-display">
              {formatCurrency(summary.total)}
            </p>
            {totalBudget > 0 && (
              <div className="mt-2 flex items-center gap-2">
                {summary.total <= totalBudget ? (
                  <>
                    <IconTrendingDown size={16} className="text-fw-success" />
                    <span className="font-fw-sans text-body-sm text-fw-success">
                      {formatCurrency(totalBudget - summary.total)} under budget
                    </span>
                  </>
                ) : (
                  <>
                    <IconTrendingUp size={16} className="text-fw-danger" />
                    <span className="font-fw-sans text-body-sm text-fw-danger">
                      {formatCurrency(summary.total - totalBudget)} over budget
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="font-fw-sans text-body-sm text-text-tertiary tabular-nums">
              {summary.count} expenses
            </p>
            {totalBudget > 0 && (
              <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary tabular-nums">
                Budget: {formatCurrency(totalBudget)}
              </p>
            )}
          </div>
        </div>

        {/* Budget Progress Bar */}
        {totalBudget > 0 && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
              <m.div
                className={`h-full rounded-full ${
                  summary.total <= totalBudget ? 'bg-accent-500' : 'bg-fw-danger'
                }`}
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.min((summary.total / totalBudget) * 100, 100)}%`,
                }}
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <p className="mt-1 text-right font-fw-sans text-caption text-text-tertiary tabular-nums">
              {((summary.total / totalBudget) * 100).toFixed(0)}% of budget used
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pie Chart */}
        <div className="rounded-card border border-border-subtle bg-surface p-6">
          <h3 className="mb-4 font-fw-sans text-body font-medium text-text-primary">
            Breakdown by Category
          </h3>
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
                      <span className="font-fw-sans text-body-sm text-text-secondary">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center font-fw-sans text-body-sm text-text-tertiary">
              No expenses to display
            </div>
          )}
        </div>

        {/* Category Breakdown with Budgets */}
        <div className="rounded-card border border-border-subtle bg-surface p-6">
          <h3 className="mb-4 font-fw-sans text-body font-medium text-text-primary">
            Budget vs Actual
          </h3>
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
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: config.color }} />
                      <span className="font-fw-sans text-body-sm font-medium text-text-secondary">
                        {config.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-fw-sans text-body-sm font-medium text-text-primary tabular-nums">
                        {formatCurrency(spent)}
                      </span>
                      {editingBudget === category ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={budgetValue}
                            onChange={(e) => setBudgetValue(e.target.value)}
                            className="w-20 min-h-0 px-2 py-1 text-body-sm"
                            placeholder="Budget"
                            aria-label={`Budget for ${config.label}`}
                            disabled={savingBudget}
                            // eslint-disable-next-line jsx-a11y/no-autofocus -- inline budget editor opens on explicit user click; focus should land in the field it opened
                            autoFocus
                          />
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => { void handleSaveBudget(category); }}
                            busy={savingBudget}
                            className="h-auto min-h-0 px-2 py-1 text-caption"
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingBudget(null);
                              setBudgetValue('');
                            }}
                            disabled={savingBudget}
                            className="h-auto min-h-0 px-2 py-1 text-caption"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span className="font-fw-sans text-body-sm text-text-tertiary tabular-nums">
                            / {budget > 0 ? formatCurrency(budget) : '—'}
                          </span>
                          {isCoach && (
                            <IconButton
                              variant="ghost"
                              size="sm"
                              aria-label={`Edit budget for ${config.label}`}
                              onClick={() => startEditBudget(category)}
                              className="h-7 w-7"
                            >
                              <IconEdit size={12} />
                            </IconButton>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                    <m.div
                      className="h-full rounded-full"
                      style={{
                        backgroundColor: percentage > 100 ? 'var(--fw-color-danger)' : config.color,
                      }}
                      initial={{ width: 0 }}
                      animate={{
                        width: budget > 0 ? `${Math.min(percentage, 100)}%` : spent > 0 ? '100%' : '0%',
                      }}
                      transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }}
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
        <h3 className="mb-4 font-fw-sans text-body font-medium text-text-primary">Payment Status</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-fw-md bg-accent-50 p-4">
            <p className="mb-1 font-fw-sans text-body-sm text-text-secondary">Team Paid</p>
            <p className="font-fw-mono text-h3 font-medium tracking-[-0.012em] text-text-primary tabular-nums">
              {formatCurrency(summary.byPaidBy.team)}
            </p>
          </div>
          <div className="rounded-fw-md bg-surface-sunken p-4">
            <p className="mb-1 font-fw-sans text-body-sm text-text-secondary">Player Paid</p>
            <p className="font-fw-mono text-h3 font-medium tracking-[-0.012em] text-text-primary tabular-nums">
              {formatCurrency(summary.byPaidBy.player)}
            </p>
          </div>
          <div className="rounded-fw-md bg-fw-warning-bg p-4">
            <p className="mb-1 font-fw-sans text-body-sm text-text-secondary">Pending Reimbursement</p>
            <p className="font-fw-mono text-h3 font-medium tracking-[-0.012em] text-text-primary tabular-nums">
              {formatCurrency(summary.byPaidBy.pending_reimbursement)}
            </p>
          </div>
          {/* Split is a deferred path (ExpenseForm offers no 'split' option), so an
              always-$0 card would be a fabricated metric. Only surface it when
              legacy rows actually carry a split amount — honest "> 0" rule. */}
          {summary.byPaidBy.split > 0 && (
            <div className="rounded-fw-md bg-surface-sunken p-4">
              <p className="mb-1 font-fw-sans text-body-sm text-text-secondary">Split</p>
              <p className="font-fw-mono text-h3 font-medium tracking-[-0.012em] text-text-primary tabular-nums">
                {formatCurrency(summary.byPaidBy.split)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FairwayExpenseSummary;
