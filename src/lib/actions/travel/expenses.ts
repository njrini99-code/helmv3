'use server';

import { revalidatePath } from 'next/cache';
import type {
  TravelExpense,
  TravelExpenseWithDetails,
  TravelBudget,
  ExpenseSummary,
  CreateExpenseData,
  UpdateExpenseData,
  ExpenseFilters,
  DateRange,
  ActionResult,
  ExpenseCategory,
} from '@/lib/types/travel';

// -----------------------------------------------------------------------------
// NOTE: The golf_travel_expenses table does not exist in the database yet.
// These functions are stubbed to return empty data until the table is created.
// -----------------------------------------------------------------------------

/**
 * Get all expenses for an itinerary
 * @stubbed Table golf_travel_expenses does not exist
 */
export async function getItineraryExpenses(
  _itineraryId: string
): Promise<ActionResult<TravelExpenseWithDetails[]>> {
  // Table does not exist - return empty array
  return { success: true, data: [] };
}

/**
 * Get expenses with filters
 * @stubbed Table golf_travel_expenses does not exist
 */
export async function getExpenses(
  _filters?: ExpenseFilters
): Promise<ActionResult<TravelExpenseWithDetails[]>> {
  // Table does not exist - return empty array
  return { success: true, data: [] };
}

/**
 * Get a single expense by ID
 * @stubbed Table golf_travel_expenses does not exist
 */
export async function getExpense(_id: string): Promise<ActionResult<TravelExpenseWithDetails>> {
  return { success: false, error: 'Expense tracking is not yet available' };
}

/**
 * Create a new expense
 * @stubbed Table golf_travel_expenses does not exist
 */
export async function createExpense(
  _data: CreateExpenseData
): Promise<ActionResult<TravelExpense>> {
  return { success: false, error: 'Expense tracking is not yet available. The database table has not been created.' };
}

/**
 * Update an expense
 * @stubbed Table golf_travel_expenses does not exist
 */
export async function updateExpense(
  _id: string,
  _data: UpdateExpenseData
): Promise<ActionResult<TravelExpense>> {
  return { success: false, error: 'Expense tracking is not yet available' };
}

/**
 * Delete an expense
 * @stubbed Table golf_travel_expenses does not exist
 */
export async function deleteExpense(_id: string): Promise<ActionResult> {
  return { success: false, error: 'Expense tracking is not yet available' };
}

/**
 * Approve an expense
 * @stubbed Table golf_travel_expenses does not exist
 */
export async function approveExpense(_id: string): Promise<ActionResult<TravelExpense>> {
  return { success: false, error: 'Expense tracking is not yet available' };
}

/**
 * Reject an expense
 * @stubbed Table golf_travel_expenses does not exist
 */
export async function rejectExpense(
  _id: string,
  _reason: string
): Promise<ActionResult<TravelExpense>> {
  return { success: false, error: 'Expense tracking is not yet available' };
}

/**
 * Mark an expense as reimbursed
 * @stubbed Table golf_travel_expenses does not exist
 */
export async function markAsReimbursed(_id: string): Promise<ActionResult<TravelExpense>> {
  return { success: false, error: 'Expense tracking is not yet available' };
}

/**
 * Bulk approve expenses
 * @stubbed Table golf_travel_expenses does not exist
 */
export async function bulkApproveExpenses(_ids: string[]): Promise<ActionResult> {
  return { success: false, error: 'Expense tracking is not yet available' };
}

// -----------------------------------------------------------------------------
// Budget & Summary Actions
// -----------------------------------------------------------------------------

/**
 * Get budget summary for an itinerary
 * @stubbed Tables golf_travel_expenses and golf_travel_budgets do not exist
 */
export async function getItineraryBudget(
  itineraryId: string
): Promise<ActionResult<TravelBudget>> {
  // Return empty budget since tables don't exist
  const budget: TravelBudget = {
    itinerary_id: itineraryId,
    total_budget: 0,
    total_spent: 0,
    remaining: 0,
    by_category: {
      transportation: 0,
      lodging: 0,
      meals: 0,
      entry_fees: 0,
      equipment: 0,
      other: 0,
    },
    pending_count: 0,
    approved_count: 0,
  };

  return { success: true, data: budget };
}

/**
 * Get expense summary for a team over a date range
 * @stubbed Table golf_travel_expenses does not exist
 */
export async function getTeamExpenseSummary(
  teamId: string,
  dateRange?: DateRange
): Promise<ActionResult<ExpenseSummary>> {
  // Default date range: last 12 months
  const today = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(today.getFullYear() - 1);

  const endDate: string = dateRange?.end ?? today.toISOString().split('T')[0]!;
  const startDate: string = dateRange?.start ?? oneYearAgo.toISOString().split('T')[0]!;

  // Return empty summary since table doesn't exist
  const summary: ExpenseSummary = {
    team_id: teamId,
    total_expenses: 0,
    total_approved: 0,
    total_pending: 0,
    total_rejected: 0,
    by_category: {
      transportation: 0,
      lodging: 0,
      meals: 0,
      entry_fees: 0,
      equipment: 0,
      other: 0,
    } as Record<ExpenseCategory, number>,
    by_itinerary: [],
    by_player: [],
    date_range: {
      start: startDate,
      end: endDate,
    },
  };

  return { success: true, data: summary };
}

// -----------------------------------------------------------------------------
// Receipt Actions
// -----------------------------------------------------------------------------

/**
 * Upload a receipt for an expense
 * @stubbed Table golf_travel_expenses does not exist
 */
export async function uploadReceipt(
  _expenseId: string,
  _fileUrl: string
): Promise<ActionResult<TravelExpense>> {
  return { success: false, error: 'Expense tracking is not yet available' };
}

/**
 * Remove receipt from an expense
 * @stubbed Table golf_travel_expenses does not exist
 */
export async function removeReceipt(_expenseId: string): Promise<ActionResult<TravelExpense>> {
  return { success: false, error: 'Expense tracking is not yet available' };
}

// Unused imports kept for when table is created
void revalidatePath;
