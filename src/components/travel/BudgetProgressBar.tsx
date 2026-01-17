'use client';

import { cn } from '@/lib/utils';
import type { TravelBudget, ExpenseCategory } from '@/lib/types/travel';

// Format currency
const formatCurrency = (amount: number, currency: string = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
};

// Category colors for the stacked bar
const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  transportation: 'bg-blue-500',
  lodging: 'bg-purple-500',
  meals: 'bg-amber-500',
  entry_fees: 'bg-green-500',
  equipment: 'bg-rose-500',
  other: 'bg-gray-500',
};

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  transportation: 'Transportation',
  lodging: 'Lodging',
  meals: 'Meals',
  entry_fees: 'Entry Fees',
  equipment: 'Equipment',
  other: 'Other',
};

interface BudgetProgressBarProps {
  budget: TravelBudget;
  showBreakdown?: boolean;
  className?: string;
}

export function BudgetProgressBar({
  budget,
  showBreakdown = false,
  className,
}: BudgetProgressBarProps) {
  const { total_budget, total_spent, remaining, by_category } = budget;

  // Calculate percentage used
  const percentUsed = total_budget > 0 ? Math.min((total_spent / total_budget) * 100, 100) : 0;

  // Determine color based on percentage
  const getStatusColor = () => {
    if (percentUsed >= 100) return 'text-destructive';
    if (percentUsed >= 80) return 'text-amber-600';
    return 'text-primary';
  };

  const getProgressColor = () => {
    if (percentUsed >= 100) return 'bg-destructive';
    if (percentUsed >= 80) return 'bg-amber-500';
    return 'bg-primary';
  };

  // Calculate category widths for stacked bar
  const categoryWidths = Object.entries(by_category).map(([category, amount]) => ({
    category: category as ExpenseCategory,
    amount,
    width: total_budget > 0 ? (amount / total_budget) * 100 : 0,
  })).filter(item => item.amount > 0);

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header stats */}
      <div className="flex items-center justify-between text-sm">
        <div>
          <span className="text-muted-foreground">Spent: </span>
          <span className={cn('font-semibold', getStatusColor())}>
            {formatCurrency(total_spent)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Budget: </span>
          <span className="font-semibold">{formatCurrency(total_budget)}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative">
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          {showBreakdown && categoryWidths.length > 0 ? (
            // Stacked bar with categories
            <div className="flex h-full">
              {categoryWidths.map(({ category, width }, index) => (
                <div
                  key={category}
                  className={cn(
                    CATEGORY_COLORS[category],
                    'h-full transition-all duration-500',
                    index === 0 && 'rounded-l-full',
                    index === categoryWidths.length - 1 && width >= 100 && 'rounded-r-full'
                  )}
                  style={{ width: `${width}%` }}
                  title={`${CATEGORY_LABELS[category]}: ${formatCurrency(by_category[category])}`}
                />
              ))}
            </div>
          ) : (
            // Simple progress bar
            <div
              className={cn('h-full rounded-full transition-all duration-500', getProgressColor())}
              style={{ width: `${percentUsed}%` }}
            />
          )}
        </div>

        {/* Budget line indicator at 100% */}
        {total_budget > 0 && percentUsed < 100 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-foreground/30"
            style={{ right: 0 }}
          />
        )}
      </div>

      {/* Remaining / Percentage */}
      <div className="flex items-center justify-between text-sm">
        <div>
          <span className="text-muted-foreground">Remaining: </span>
          <span className={cn('font-medium', remaining < 0 ? 'text-destructive' : 'text-foreground')}>
            {remaining < 0 ? '-' : ''}{formatCurrency(Math.abs(remaining))}
          </span>
        </div>
        <span className={cn('font-medium', getStatusColor())}>
          {percentUsed.toFixed(0)}% used
        </span>
      </div>

      {/* Category breakdown legend (if showBreakdown) */}
      {showBreakdown && categoryWidths.length > 0 && (
        <div className="pt-2 grid grid-cols-2 gap-2">
          {categoryWidths.map(({ category, amount }) => (
            <div key={category} className="flex items-center gap-2 text-xs">
              <div className={cn('w-3 h-3 rounded-sm', CATEGORY_COLORS[category])} />
              <span className="text-muted-foreground">{CATEGORY_LABELS[category]}:</span>
              <span className="font-medium">{formatCurrency(amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Over budget warning */}
      {remaining < 0 && (
        <div className="flex items-center gap-2 p-2 bg-destructive/10 rounded-md text-destructive text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span>Over budget by {formatCurrency(Math.abs(remaining))}</span>
        </div>
      )}
    </div>
  );
}

// Compact version for cards/lists
interface BudgetProgressCompactProps {
  spent: number;
  budget: number;
  className?: string;
}

export function BudgetProgressCompact({ spent, budget, className }: BudgetProgressCompactProps) {
  const percentUsed = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;

  const getProgressColor = () => {
    if (percentUsed >= 100) return 'bg-destructive';
    if (percentUsed >= 80) return 'bg-amber-500';
    return 'bg-primary';
  };

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatCurrency(spent)} / {formatCurrency(budget)}</span>
        <span>{percentUsed.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', getProgressColor())}
          style={{ width: `${percentUsed}%` }}
        />
      </div>
    </div>
  );
}
