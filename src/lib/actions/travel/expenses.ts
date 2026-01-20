'use server';

import { createClient } from '@/lib/supabase/server';
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
// Helper to transform database expense to UI-compatible format
// -----------------------------------------------------------------------------

function transformExpense(dbExpense: Record<string, unknown>): TravelExpenseWithDetails {
  // Map paid_by to status for UI compatibility
  const paidBy = dbExpense.paid_by as string;
  let status: 'pending' | 'approved' | 'rejected' | 'reimbursed' = 'pending';
  if (paidBy === 'team') status = 'approved';
  else if (paidBy === 'pending_reimbursement') status = 'pending';
  else if (paidBy === 'player') status = 'reimbursed';

  return {
    id: dbExpense.id as string,
    itinerary_id: dbExpense.itinerary_id as string | null,
    team_id: dbExpense.team_id as string,
    category: dbExpense.category as ExpenseCategory,
    description: dbExpense.description as string,
    amount: Number(dbExpense.amount),
    receipt_url: dbExpense.receipt_url as string | null,
    paid_by: dbExpense.paid_by as TravelExpense['paid_by'],
    vendor_name: dbExpense.vendor_name as string | null,
    expense_date: dbExpense.expense_date as string | null,
    notes: dbExpense.notes as string | null,
    created_by: dbExpense.created_by as string,
    created_at: dbExpense.created_at as string,
    updated_at: dbExpense.updated_at as string,
    // UI compatibility fields
    currency: 'USD',
    status,
    per_player: paidBy === 'split',
    player_id: null,
    itinerary: dbExpense.itinerary ? {
      id: (dbExpense.itinerary as Record<string, unknown>).id as string,
      title: (dbExpense.itinerary as Record<string, unknown>).event_name as string | undefined,
      event_name: (dbExpense.itinerary as Record<string, unknown>).event_name as string | undefined,
    } : null,
    creator: dbExpense.creator ? {
      full_name: (dbExpense.creator as Record<string, unknown>).full_name as string,
      avatar_url: (dbExpense.creator as Record<string, unknown>).avatar_url as string | undefined,
    } : null,
  };
}

// -----------------------------------------------------------------------------
// Travel Expense Actions
// -----------------------------------------------------------------------------

/**
 * Get all expenses for an itinerary
 */
export async function getItineraryExpenses(
  itineraryId: string
): Promise<ActionResult<TravelExpenseWithDetails[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: expenses, error } = await supabase
    .from('golf_travel_expenses')
    .select(`
      *,
      itinerary:golf_travel_itineraries(id, event_name),
      creator:users!golf_travel_expenses_created_by_fkey(full_name, avatar_url)
    `)
    .eq('itinerary_id', itineraryId)
    .order('expense_date', { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  const transformedExpenses = (expenses || []).map(transformExpense);
  return { success: true, data: transformedExpenses };
}

/**
 * Get expenses with filters
 */
export async function getExpenses(
  filters?: ExpenseFilters
): Promise<ActionResult<TravelExpenseWithDetails[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  let query = supabase
    .from('golf_travel_expenses')
    .select(`
      *,
      itinerary:golf_travel_itineraries(id, event_name),
      creator:users!golf_travel_expenses_created_by_fkey(full_name, avatar_url)
    `);

  // Apply filters
  if (filters?.itinerary_id) {
    query = query.eq('itinerary_id', filters.itinerary_id);
  }
  if (filters?.team_id) {
    query = query.eq('team_id', filters.team_id);
  }
  if (filters?.category) {
    query = query.eq('category', filters.category);
  }
  if (filters?.paid_by) {
    query = query.eq('paid_by', filters.paid_by);
  }
  if (filters?.date_range?.start) {
    query = query.gte('expense_date', filters.date_range.start);
  }
  if (filters?.date_range?.end) {
    query = query.lte('expense_date', filters.date_range.end);
  }
  if (filters?.min_amount !== undefined) {
    query = query.gte('amount', filters.min_amount);
  }
  if (filters?.max_amount !== undefined) {
    query = query.lte('amount', filters.max_amount);
  }

  const { data: expenses, error } = await query.order('expense_date', { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  const transformedExpenses = (expenses || []).map(transformExpense);
  return { success: true, data: transformedExpenses };
}

/**
 * Get a single expense by ID
 */
export async function getExpense(id: string): Promise<ActionResult<TravelExpenseWithDetails>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: expense, error } = await supabase
    .from('golf_travel_expenses')
    .select(`
      *,
      itinerary:golf_travel_itineraries(id, event_name),
      creator:users!golf_travel_expenses_created_by_fkey(full_name, avatar_url)
    `)
    .eq('id', id)
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: transformExpense(expense) };
}

/**
 * Create a new expense
 */
export async function createExpense(
  data: CreateExpenseData
): Promise<ActionResult<TravelExpense>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: expense, error } = await supabase
    .from('golf_travel_expenses')
    .insert({
      itinerary_id: data.itinerary_id || null,
      team_id: data.team_id,
      category: data.category,
      description: data.description,
      amount: data.amount,
      paid_by: data.paid_by || 'team',
      vendor_name: data.vendor_name || null,
      expense_date: data.expense_date || null,
      receipt_url: data.receipt_url || null,
      notes: data.notes || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');
  if (data.itinerary_id) {
    revalidatePath(`/golf/dashboard/travel/itinerary/${data.itinerary_id}`);
  }

  return { success: true, data: expense as TravelExpense };
}

/**
 * Update an expense
 */
export async function updateExpense(
  id: string,
  data: UpdateExpenseData
): Promise<ActionResult<TravelExpense>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Build update object with only provided fields
  const updateData: Record<string, unknown> = {};
  if (data.category !== undefined) updateData.category = data.category;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.amount !== undefined) updateData.amount = data.amount;
  if (data.paid_by !== undefined) updateData.paid_by = data.paid_by;
  if (data.vendor_name !== undefined) updateData.vendor_name = data.vendor_name;
  if (data.expense_date !== undefined) updateData.expense_date = data.expense_date;
  if (data.receipt_url !== undefined) updateData.receipt_url = data.receipt_url;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const { data: expense, error } = await supabase
    .from('golf_travel_expenses')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');
  if (expense.itinerary_id) {
    revalidatePath(`/golf/dashboard/travel/itinerary/${expense.itinerary_id}`);
  }

  return { success: true, data: expense as TravelExpense };
}

/**
 * Delete an expense
 */
export async function deleteExpense(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // First get the expense to know which itinerary to revalidate
  const { data: existingExpense } = await supabase
    .from('golf_travel_expenses')
    .select('itinerary_id')
    .eq('id', id)
    .single();

  const { error } = await supabase
    .from('golf_travel_expenses')
    .delete()
    .eq('id', id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');
  if (existingExpense?.itinerary_id) {
    revalidatePath(`/golf/dashboard/travel/itinerary/${existingExpense.itinerary_id}`);
  }

  return { success: true };
}

/**
 * Approve an expense (mark as paid by team)
 */
export async function approveExpense(id: string): Promise<ActionResult<TravelExpense>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: expense, error } = await supabase
    .from('golf_travel_expenses')
    .update({ paid_by: 'team' })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');
  if (expense.itinerary_id) {
    revalidatePath(`/golf/dashboard/travel/itinerary/${expense.itinerary_id}`);
  }

  return { success: true, data: expense as TravelExpense };
}

/**
 * Reject an expense (mark as pending_reimbursement with note)
 */
export async function rejectExpense(
  id: string,
  reason: string
): Promise<ActionResult<TravelExpense>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get existing expense to append rejection reason to notes
  const { data: existingExpense } = await supabase
    .from('golf_travel_expenses')
    .select('notes')
    .eq('id', id)
    .single();

  const existingNotes = existingExpense?.notes || '';
  const rejectionNote = `[REJECTED: ${reason}]`;
  const updatedNotes = existingNotes
    ? `${existingNotes}\n${rejectionNote}`
    : rejectionNote;

  const { data: expense, error } = await supabase
    .from('golf_travel_expenses')
    .update({
      paid_by: 'pending_reimbursement',
      notes: updatedNotes,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');
  if (expense.itinerary_id) {
    revalidatePath(`/golf/dashboard/travel/itinerary/${expense.itinerary_id}`);
  }

  return { success: true, data: expense as TravelExpense };
}

/**
 * Mark an expense as reimbursed (paid by player)
 */
export async function markAsReimbursed(id: string): Promise<ActionResult<TravelExpense>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: expense, error } = await supabase
    .from('golf_travel_expenses')
    .update({ paid_by: 'player' })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');
  if (expense.itinerary_id) {
    revalidatePath(`/golf/dashboard/travel/itinerary/${expense.itinerary_id}`);
  }

  return { success: true, data: expense as TravelExpense };
}

/**
 * Bulk approve expenses
 */
export async function bulkApproveExpenses(ids: string[]): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  if (!ids.length) {
    return { success: false, error: 'No expense IDs provided' };
  }

  const { error } = await supabase
    .from('golf_travel_expenses')
    .update({ paid_by: 'team' })
    .in('id', ids);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');

  return { success: true };
}

// -----------------------------------------------------------------------------
// Budget & Summary Actions
// -----------------------------------------------------------------------------

/**
 * Get budget summary for an itinerary
 */
export async function getItineraryBudget(
  itineraryId: string
): Promise<ActionResult<TravelBudget>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get budgets for this itinerary
  const { data: budgets, error: budgetsError } = await supabase
    .from('golf_travel_budgets')
    .select('category, budgeted_amount')
    .eq('itinerary_id', itineraryId);

  if (budgetsError) {
    return { success: false, error: budgetsError.message };
  }

  // Get expenses for this itinerary
  const { data: expenses, error: expensesError } = await supabase
    .from('golf_travel_expenses')
    .select('category, amount, paid_by')
    .eq('itinerary_id', itineraryId);

  if (expensesError) {
    return { success: false, error: expensesError.message };
  }

  // Calculate totals
  const categoryBudgets: Record<ExpenseCategory, number> = {
    transportation: 0,
    lodging: 0,
    meals: 0,
    entry_fees: 0,
    equipment: 0,
    other: 0,
  };

  const categorySpent: Record<ExpenseCategory, number> = {
    transportation: 0,
    lodging: 0,
    meals: 0,
    entry_fees: 0,
    equipment: 0,
    other: 0,
  };

  let totalBudget = 0;
  let totalSpent = 0;
  let pendingCount = 0;
  let approvedCount = 0;

  // Sum budgets by category
  for (const budget of budgets || []) {
    const category = budget.category as ExpenseCategory;
    const amount = Number(budget.budgeted_amount);
    categoryBudgets[category] += amount;
    totalBudget += amount;
  }

  // Sum expenses by category and count by status
  for (const expense of expenses || []) {
    const category = expense.category as ExpenseCategory;
    const amount = Number(expense.amount);
    categorySpent[category] += amount;
    totalSpent += amount;

    if (expense.paid_by === 'pending_reimbursement') {
      pendingCount++;
    } else if (expense.paid_by === 'team') {
      approvedCount++;
    }
  }

  const budget: TravelBudget = {
    itinerary_id: itineraryId,
    total_budget: totalBudget,
    total_spent: totalSpent,
    remaining: totalBudget - totalSpent,
    by_category: categorySpent,
    pending_count: pendingCount,
    approved_count: approvedCount,
  };

  return { success: true, data: budget };
}

/**
 * Get expense summary for a team over a date range
 */
export async function getTeamExpenseSummary(
  teamId: string,
  dateRange?: DateRange
): Promise<ActionResult<ExpenseSummary>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Default date range: last 12 months
  const today = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(today.getFullYear() - 1);

  const endDate: string = dateRange?.end ?? today.toISOString().split('T')[0]!;
  const startDate: string = dateRange?.start ?? oneYearAgo.toISOString().split('T')[0]!;

  // Build query
  let query = supabase
    .from('golf_travel_expenses')
    .select(`
      id,
      category,
      amount,
      paid_by,
      itinerary_id,
      itinerary:golf_travel_itineraries(id, event_name)
    `)
    .eq('team_id', teamId);

  // Apply date filters if expense_date is set
  query = query.or(`expense_date.gte.${startDate},expense_date.is.null`);
  query = query.or(`expense_date.lte.${endDate},expense_date.is.null`);

  const { data: expenses, error } = await query;

  if (error) {
    return { success: false, error: error.message };
  }

  // Calculate totals
  const byCategory: Record<ExpenseCategory, number> = {
    transportation: 0,
    lodging: 0,
    meals: 0,
    entry_fees: 0,
    equipment: 0,
    other: 0,
  };

  const itineraryTotals: Record<string, { id: string; title: string; total: number }> = {};

  let totalExpenses = 0;
  let totalApproved = 0;
  let totalPending = 0;
  let totalRejected = 0;

  for (const expense of expenses || []) {
    const amount = Number(expense.amount);
    const category = expense.category as ExpenseCategory;

    totalExpenses += amount;
    byCategory[category] += amount;

    // Count by status based on paid_by
    if (expense.paid_by === 'team') {
      totalApproved += amount;
    } else if (expense.paid_by === 'pending_reimbursement') {
      totalPending += amount;
    } else if (expense.paid_by === 'player') {
      // Mark rejected if it was player-paid (could be reimbursed or rejected)
      totalRejected += amount;
    }

    // Group by itinerary
    if (expense.itinerary_id && expense.itinerary) {
      const itinerary = expense.itinerary as { id: string; event_name: string };
      const itineraryKey = expense.itinerary_id;
      if (!itineraryTotals[itineraryKey]) {
        itineraryTotals[itineraryKey] = {
          id: itineraryKey,
          title: itinerary.event_name || 'Unnamed Trip',
          total: 0,
        };
      }
      itineraryTotals[itineraryKey]!.total += amount;
    }
  }

  const summary: ExpenseSummary = {
    team_id: teamId,
    total_expenses: totalExpenses,
    total_approved: totalApproved,
    total_pending: totalPending,
    total_rejected: totalRejected,
    by_category: byCategory,
    by_itinerary: Object.values(itineraryTotals).map(it => ({
      id: it.id,
      itinerary_id: it.id,
      title: it.title,
      itinerary_title: it.title,
      total: it.total,
    })),
    by_player: [], // Would need expense_splits table query for per-player breakdown
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
 * Upload a receipt for an expense (update receipt_url)
 */
export async function uploadReceipt(
  expenseId: string,
  fileUrl: string
): Promise<ActionResult<TravelExpense>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: expense, error } = await supabase
    .from('golf_travel_expenses')
    .update({ receipt_url: fileUrl })
    .eq('id', expenseId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');
  if (expense.itinerary_id) {
    revalidatePath(`/golf/dashboard/travel/itinerary/${expense.itinerary_id}`);
  }

  return { success: true, data: expense as TravelExpense };
}

/**
 * Remove receipt from an expense
 */
export async function removeReceipt(expenseId: string): Promise<ActionResult<TravelExpense>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: expense, error } = await supabase
    .from('golf_travel_expenses')
    .update({ receipt_url: null })
    .eq('id', expenseId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');
  if (expense.itinerary_id) {
    revalidatePath(`/golf/dashboard/travel/itinerary/${expense.itinerary_id}`);
  }

  return { success: true, data: expense as TravelExpense };
}
