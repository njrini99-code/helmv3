'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BudgetProgressBar } from './BudgetProgressBar';
import type { TravelBudget, ExpenseCategory } from '@/lib/types/travel';

// Format currency
const formatCurrency = (amount: number, currency: string = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
};

// Category configuration
const CATEGORY_CONFIG: Record<ExpenseCategory, { label: string; color: string; bgColor: string }> = {
  transportation: { label: 'Transportation', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  lodging: { label: 'Lodging', color: 'text-purple-600', bgColor: 'bg-purple-100' },
  meals: { label: 'Meals', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  entry_fees: { label: 'Entry Fees', color: 'text-green-600', bgColor: 'bg-green-100' },
  equipment: { label: 'Equipment', color: 'text-rose-600', bgColor: 'bg-rose-100' },
  other: { label: 'Other', color: 'text-gray-600', bgColor: 'bg-gray-100' },
};

// Category icons
const CATEGORY_ICONS: Record<ExpenseCategory, React.ReactNode> = {
  transportation: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
    </svg>
  ),
  lodging: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  ),
  meals: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.87c1.355 0 2.697.055 4.024.165C17.155 8.51 18 9.473 18 10.608v2.513m-3-4.87v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0L3 16.5m15-3.38a48.474 48.474 0 0 0-6-.37c-2.032 0-4.034.125-6 .37m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.17c0 .62-.504 1.124-1.125 1.124H4.125A1.125 1.125 0 0 1 3 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 0 1 6 13.12" />
    </svg>
  ),
  entry_fees: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
    </svg>
  ),
  equipment: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
    </svg>
  ),
  other: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
    </svg>
  ),
};

interface ExpenseSummaryProps {
  budget: TravelBudget;
  pendingCount?: number;
  className?: string;
}

export function ExpenseSummary({ budget, pendingCount, className }: ExpenseSummaryProps) {
  const { total_budget, total_spent, remaining, by_category, pending_count } = budget;

  // Sort categories by amount
  const sortedCategories = Object.entries(by_category)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .filter(([_, amount]) => amount > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <div className={className}>
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Budget Overview</CardTitle>
              <CardDescription>Trip expense tracking</CardDescription>
            </div>
            {(pendingCount ?? pending_count) > 0 && (
              <Badge variant="secondary">
                {pendingCount ?? pending_count} pending
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Main stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{formatCurrency(total_spent)}</p>
              <p className="text-xs text-muted-foreground">Total Spent</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{formatCurrency(total_budget)}</p>
              <p className="text-xs text-muted-foreground">Budget</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${remaining < 0 ? 'text-destructive' : 'text-foreground'}`}>
                {remaining < 0 ? '-' : ''}{formatCurrency(Math.abs(remaining))}
              </p>
              <p className="text-xs text-muted-foreground">Remaining</p>
            </div>
          </div>

          {/* Progress bar */}
          <BudgetProgressBar budget={budget} showBreakdown={true} />

          {/* Category breakdown */}
          {sortedCategories.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">By Category</h4>
              <div className="space-y-2">
                {sortedCategories.map(([category, amount]) => {
                  const config = CATEGORY_CONFIG[category as ExpenseCategory];
                  const percentage = total_spent > 0 ? (amount / total_spent) * 100 : 0;

                  return (
                    <div key={category} className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-md ${config.bgColor}`}>
                        <span className={config.color}>
                          {CATEGORY_ICONS[category as ExpenseCategory]}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate">{config.label}</span>
                          <span className="text-sm font-semibold">{formatCurrency(amount)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${config.bgColor.replace('100', '500')}`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right">
                            {percentage.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {sortedCategories.length === 0 && (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">No expenses recorded yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Compact summary card for dashboard/list views
interface ExpenseSummaryCompactProps {
  budget: number;
  spent: number;
  pendingCount: number;
}

export function ExpenseSummaryCompact({ budget, spent, pendingCount }: ExpenseSummaryCompactProps) {
  const percentUsed = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;

  return (
    <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
      <div className="flex-1">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="font-medium">{formatCurrency(spent)}</span>
          <span className="text-muted-foreground">of {formatCurrency(budget)}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              percentUsed >= 100
                ? 'bg-destructive'
                : percentUsed >= 80
                  ? 'bg-amber-500'
                  : 'bg-primary'
            }`}
            style={{ width: `${percentUsed}%` }}
          />
        </div>
      </div>
      {pendingCount > 0 && (
        <Badge variant="secondary" className="shrink-0">
          {pendingCount} pending
        </Badge>
      )}
    </div>
  );
}
