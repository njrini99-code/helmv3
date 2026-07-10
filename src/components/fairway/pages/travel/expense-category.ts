/**
 * ============================================================================
 * Fairway · Travel · expense-category — shared category label/color table
 * ----------------------------------------------------------------------------
 * `FairwayExpenseList`'s row swatches and `FairwayExpenseSummary`'s pie-chart
 * legend must read as one system — this was previously two hand-copied
 * `Record<ExpenseCategory, ...>` literals kept "IDENTICAL" by convention only.
 * One source of truth now; each file's own icon table (List) stays local.
 * ========================================================================== */

import type { ExpenseCategory } from '@/app/golf/actions/travel';
import { VIZ_SEQUENTIAL } from '@/components/fairway/charts/theme';

export const CATEGORY_CONFIG: Record<ExpenseCategory, { label: string; color: string }> = {
  lodging: { label: 'Lodging', color: VIZ_SEQUENTIAL[1] },
  transportation: { label: 'Transportation', color: VIZ_SEQUENTIAL[2] },
  meals: { label: 'Meals', color: VIZ_SEQUENTIAL[5] },
  entry_fees: { label: 'Entry Fees', color: VIZ_SEQUENTIAL[3] },
  equipment: { label: 'Equipment', color: VIZ_SEQUENTIAL[4] },
  other: { label: 'Other', color: 'var(--fw-color-text-tertiary)' },
};

export const ALL_CATEGORIES: ExpenseCategory[] = [
  'lodging',
  'transportation',
  'meals',
  'entry_fees',
  'equipment',
  'other',
];
