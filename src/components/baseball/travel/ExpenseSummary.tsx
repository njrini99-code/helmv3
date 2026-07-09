'use client';

// =============================================================================
// ExpenseSummary — reskinned onto "The Living Annual" kit (Lane 3 · THE
// PRESSBOX, team ink — sibling of TravelClient which already migrated; this
// nested component was missed in that pass). PRESENTATION ONLY: the
// `summary` shape and math are unchanged.
//
// Off-palette chrome removed: the primary-50/100 gradient total tile, the
// cream/warm category cards, and the five arbitrary category hex colors
// (purple/blue/orange/green/gray) are gone. Category bars now read in ONE ink
// (team green) — the bar length carries the read, not a rainbow of chrome —
// and payment status renders as `<InkBadge>` stamps + numerals instead of
// blue/amber/warm tinted tiles (spec §4.2 rule 2, §4.2 rule 4).
// =============================================================================

import { useMemo } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import {
  type BaseballExpenseSummary,
  type ExpenseCategory,
} from '@/app/baseball/actions/travel';
import { RuledStatLine, Eyebrow, InkBadge } from '@/components/baseball/living-annual';

interface ExpenseSummaryProps {
  summary: BaseballExpenseSummary;
}

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  transport: 'Transport',
  lodging: 'Lodging',
  meals: 'Meals',
  equipment: 'Equipment',
  other: 'Other',
};

const ALL_CATEGORIES: ExpenseCategory[] = ['transport', 'lodging', 'meals', 'equipment', 'other'];

const PAID_BY: Array<{ key: 'team' | 'player' | 'pending_reimbursement' | 'split'; label: string; tone: 'team' | 'pursuit' | 'neutral' }> = [
  { key: 'team', label: 'Team', tone: 'team' },
  { key: 'player', label: 'Player', tone: 'neutral' },
  { key: 'pending_reimbursement', label: 'Pending', tone: 'pursuit' },
  { key: 'split', label: 'Split', tone: 'neutral' },
];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function ExpenseSummary({ summary }: ExpenseSummaryProps) {
  const prefersReducedMotion = useReducedMotion();

  const maxCategoryAmount = useMemo(() => {
    return Math.max(...ALL_CATEGORIES.map((cat) => summary.byCategory[cat] || 0), 1);
  }, [summary.byCategory]);

  return (
    <div className="space-y-6">
      {/* Total — the record-book number, not a colored gradient tile. */}
      <div className="flex items-end justify-between gap-4 border-b border-[color:var(--hairline)] pb-4">
        <RuledStatLine label="Total Expenses" value={formatCurrency(summary.total)} ink="team" size="row" emphasis />
        <span className="pb-1 font-annual text-body-sm text-text-tertiary">
          {summary.count} expense{summary.count !== 1 ? 's' : ''}
        </span>
      </div>

      {/* By Category — one ink (team green); the bar length carries the read. */}
      <div>
        <Eyebrow ink="muted" className="mb-3">By Category</Eyebrow>
        <div className="space-y-3">
          {ALL_CATEGORIES.map((category) => {
            const spent = summary.byCategory[category] || 0;
            const percentage = maxCategoryAmount > 0 ? (spent / maxCategoryAmount) * 100 : 0;

            return (
              <div key={category} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-annual text-body-sm text-text-secondary">{CATEGORY_LABELS[category]}</span>
                  <span className="font-annual text-body-sm font-semibold tabular-nums text-text-primary">
                    {formatCurrency(spent)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[color:var(--hairline)]/40">
                  <m.div
                    className="h-full rounded-full bg-grade-plus"
                    initial={{ width: 0 }}
                    animate={{ width: spent > 0 ? `${percentage}%` : '0%' }}
                    transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment Status — InkBadge stamps, never blue/amber/warm chrome tiles. */}
      <div>
        <Eyebrow ink="muted" className="mb-3">Payment Status</Eyebrow>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {PAID_BY.map(({ key, label, tone }) => (
            <div key={key} className="space-y-1.5">
              <InkBadge label={label.toUpperCase()} tone={tone} variant="soft" />
              <p className="font-annual text-h3 font-semibold tabular-nums text-text-primary">
                {formatCurrency(summary.byPaidBy[key])}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
