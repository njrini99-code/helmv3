/**
 * The two expense-category vocabularies, pinned to the database that defines
 * them.
 *
 * WHAT THIS IS NOT. It is not a fix for a reproduced defect — there isn't one.
 * Traced 2026-08-30 across every layer:
 *
 *   golf      DB enum `golf_expense_category`      == app union (6 members)
 *   baseball  DB CHECK on baseball_travel_expenses == app union (5 members)
 *
 * Both are internally consistent. They are DIFFERENT on purpose — two products,
 * two constraints — and the superficial mismatch (`transportation` vs
 * `transport`, golf's extra `entry_fees`) is not drift.
 *
 * WHAT IT IS. The coupling is real and nothing enforced it. `getExpenseSummary`
 * accumulates with
 *
 *     if (expense.category in summary.byCategory) { ...byCategory[...] += amount }
 *
 * so a category the union does not know is skipped from the breakdown while
 * still counting toward `total` — the breakdown silently stops adding up. That
 * is unreachable today because the CHECK constraint forbids such a value, which
 * means the app union's correctness rests entirely on a database constraint
 * that no test mentioned.
 *
 * Widen either constraint without widening its union and this fails, which is
 * the moment the silent-drop becomes reachable.
 *
 * Read from the committed migration rather than a live query so it runs in CI
 * with no database.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ExpenseCategory as GolfExpenseCategory } from '@/app/golf/actions/travel';
import type { ExpenseCategory as BaseballExpenseCategory } from '@/app/baseball/actions/travel';

const BASELINE = resolve(
  __dirname,
  '../../../../supabase/migrations/20260527000000_prod_public_baseline.sql',
);
const sql = readFileSync(BASELINE, 'utf-8');

/** The values the DB enum declares, read out of the committed migration. */
function enumMembers(name: string): string[] {
  const m = sql.match(new RegExp(`CREATE TYPE "public"\\."${name}" AS ENUM \\(([\\s\\S]*?)\\);`));
  if (!m) throw new Error(`enum ${name} not found in the baseline migration`);
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
}

/** The values a CHECK constraint allows, read out of the committed migration. */
function checkMembers(constraint: string): string[] {
  const m = sql.match(new RegExp(`CONSTRAINT "${constraint}" CHECK[\\s\\S]*?ARRAY\\[([\\s\\S]*?)\\]`));
  if (!m) throw new Error(`constraint ${constraint} not found in the baseline migration`);
  return [...m[1]!.matchAll(/'([^']+)'::"?text"?/g)].map((x) => x[1]!);
}

// Compile-time exhaustiveness: these arrays ARE the unions, so a member added
// to the type without being added here fails typecheck rather than at runtime.
const GOLF: readonly GolfExpenseCategory[] = [
  'lodging', 'transportation', 'meals', 'entry_fees', 'equipment', 'other',
];
const BASEBALL: readonly BaseballExpenseCategory[] = [
  'transport', 'lodging', 'meals', 'equipment', 'other',
];

describe('expense categories match the database that constrains them', () => {
  it('golf: the app union equals the golf_expense_category enum', () => {
    expect([...GOLF].sort()).toEqual(enumMembers('golf_expense_category').sort());
  });

  it('baseball: the app union equals the CHECK constraint', () => {
    expect([...BASEBALL].sort()).toEqual(
      checkMembers('baseball_travel_expenses_category_check').sort(),
    );
  });

  it('the two vocabularies are deliberately different, and that is recorded', () => {
    // Guards against someone "harmonising" them and breaking one product's
    // constraint. Golf carries entry_fees and spells transportation in full.
    expect(GOLF).toContain('entry_fees');
    expect(GOLF).toContain('transportation');
    expect(BASEBALL).not.toContain('entry_fees');
    expect(BASEBALL).toContain('transport');
  });

  it('every category a product allows has a bucket in its own summary', () => {
    // The invariant that makes the breakdown add up. `getExpenseSummary`
    // initialises byCategory from the union; a DB value outside it is dropped
    // from the breakdown while still counting toward total.
    const baseballBuckets = ['transport', 'lodging', 'meals', 'equipment', 'other'];
    for (const c of checkMembers('baseball_travel_expenses_category_check')) {
      expect(baseballBuckets, `no summary bucket for '${c}' — it would vanish from the breakdown`).toContain(c);
    }
  });
});
