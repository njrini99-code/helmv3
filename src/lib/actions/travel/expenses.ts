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
} from '@/types/travel.types';

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
    .from('travel_expenses')
    .select(`
      *,
      player:players(
        id,
        profile:profiles(full_name, avatar_url)
      ),
      approver:profiles!travel_expenses_approved_by_fkey(full_name, avatar_url),
      creator:profiles!travel_expenses_created_by_fkey(full_name, avatar_url),
      itinerary:travel_itineraries(title, event_name)
    `)
    .eq('itinerary_id', itineraryId)
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: expenses || [] };
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
    .from('travel_expenses')
    .select(`
      *,
      player:players(
        id,
        profile:profiles(full_name, avatar_url)
      ),
      approver:profiles!travel_expenses_approved_by_fkey(full_name, avatar_url),
      creator:profiles!travel_expenses_created_by_fkey(full_name, avatar_url),
      itinerary:travel_itineraries(title, event_name)
    `);

  // Apply filters
  if (filters?.itinerary_id) {
    query = query.eq('itinerary_id', filters.itinerary_id);
  }
  if (filters?.travel_team_id) {
    query = query.eq('travel_team_id', filters.travel_team_id);
  }
  if (filters?.category) {
    query = query.eq('category', filters.category);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.player_id) {
    query = query.eq('player_id', filters.player_id);
  }
  if (filters?.date_range?.start) {
    query = query.gte('created_at', filters.date_range.start);
  }
  if (filters?.date_range?.end) {
    query = query.lte('created_at', filters.date_range.end);
  }
  if (filters?.min_amount) {
    query = query.gte('amount', filters.min_amount);
  }
  if (filters?.max_amount) {
    query = query.lte('amount', filters.max_amount);
  }

  const { data: expenses, error } = await query.order('created_at', { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: expenses || [] };
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
    .from('travel_expenses')
    .select(`
      *,
      player:players(
        id,
        profile:profiles(full_name, avatar_url)
      ),
      approver:profiles!travel_expenses_approved_by_fkey(full_name, avatar_url),
      creator:profiles!travel_expenses_created_by_fkey(full_name, avatar_url),
      itinerary:travel_itineraries(title, event_name)
    `)
    .eq('id', id)
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: expense };
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

  // Validate amount
  if (data.amount <= 0) {
    return { success: false, error: 'Amount must be greater than 0' };
  }

  // If per_player is true, player_id is required
  if (data.per_player && !data.player_id) {
    return { success: false, error: 'Player ID is required for per-player expenses' };
  }

  const { data: expense, error } = await supabase
    .from('travel_expenses')
    .insert({
      ...data,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/travel');
  revalidatePath(`/travel/itinerary/${data.itinerary_id}`);
  return { success: true, data: expense };
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

  // Validate amount if provided
  if (data.amount !== undefined && data.amount <= 0) {
    return { success: false, error: 'Amount must be greater than 0' };
  }

  const { data: expense, error } = await supabase
    .from('travel_expenses')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/travel');
  return { success: true, data: expense };
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

  // Get the expense first to check status
  const { data: expense } = await supabase
    .from('travel_expenses')
    .select('status, itinerary_id')
    .eq('id', id)
    .single();

  if (expense?.status === 'approved' || expense?.status === 'reimbursed') {
    return { success: false, error: 'Cannot delete approved or reimbursed expenses' };
  }

  const { error } = await supabase
    .from('travel_expenses')
    .delete()
    .eq('id', id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/travel');
  if (expense?.itinerary_id) {
    revalidatePath(`/travel/itinerary/${expense.itinerary_id}`);
  }
  return { success: true };
}

/**
 * Approve an expense
 */
export async function approveExpense(id: string): Promise<ActionResult<TravelExpense>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: expense, error } = await supabase
    .from('travel_expenses')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/travel');
  return { success: true, data: expense };
}

/**
 * Reject an expense
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

  if (!reason || reason.trim() === '') {
    return { success: false, error: 'Rejection reason is required' };
  }

  const { data: expense, error } = await supabase
    .from('travel_expenses')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/travel');
  return { success: true, data: expense };
}

/**
 * Mark an expense as reimbursed
 */
export async function markAsReimbursed(id: string): Promise<ActionResult<TravelExpense>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Check if expense is approved first
  const { data: existing } = await supabase
    .from('travel_expenses')
    .select('status')
    .eq('id', id)
    .single();

  if (existing?.status !== 'approved') {
    return { success: false, error: 'Only approved expenses can be marked as reimbursed' };
  }

  const { data: expense, error } = await supabase
    .from('travel_expenses')
    .update({ status: 'reimbursed' })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/travel');
  return { success: true, data: expense };
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

  const { error } = await supabase
    .from('travel_expenses')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .in('id', ids)
    .eq('status', 'pending');

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/travel');
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

  const { data: budgetData, error } = await supabase
    .rpc('get_itinerary_budget_summary', { p_itinerary_id: itineraryId });

  if (error) {
    return { success: false, error: error.message };
  }

  if (!budgetData || budgetData.length === 0) {
    return { success: false, error: 'Itinerary not found' };
  }

  const budget: TravelBudget = {
    itinerary_id: itineraryId,
    total_budget: budgetData[0].total_budget || 0,
    total_spent: budgetData[0].total_spent || 0,
    remaining: budgetData[0].remaining || 0,
    by_category: {
      transportation: budgetData[0].transportation_total || 0,
      lodging: budgetData[0].lodging_total || 0,
      meals: budgetData[0].meals_total || 0,
      entry_fees: budgetData[0].entry_fees_total || 0,
      equipment: budgetData[0].equipment_total || 0,
      other: budgetData[0].other_total || 0,
    },
    pending_count: budgetData[0].pending_count || 0,
    approved_count: budgetData[0].approved_count || 0,
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
  const endDate = dateRange?.end || new Date().toISOString().split('T')[0];
  const startDate = dateRange?.start || new Date(
    new Date().setFullYear(new Date().getFullYear() - 1)
  ).toISOString().split('T')[0];

  // Get all expenses for the team in the date range
  let query = supabase
    .from('travel_expenses')
    .select(`
      *,
      player:players(
        id,
        profile:profiles(full_name)
      ),
      itinerary:travel_itineraries(id, title)
    `)
    .eq('travel_team_id', teamId)
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  const { data: expenses, error } = await query;

  if (error) {
    return { success: false, error: error.message };
  }

  // Calculate summary
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
    },
    by_itinerary: [],
    by_player: [],
    date_range: {
      start: startDate,
      end: endDate,
    },
  };

  const itineraryTotals: Record<string, { id: string; title: string; total: number }> = {};
  const playerTotals: Record<string, { id: string; name: string; total: number }> = {};

  for (const expense of expenses || []) {
    const amount = expense.amount || 0;
    summary.total_expenses += amount;

    // By status
    if (expense.status === 'approved' || expense.status === 'reimbursed') {
      summary.total_approved += amount;
    } else if (expense.status === 'pending') {
      summary.total_pending += amount;
    } else if (expense.status === 'rejected') {
      summary.total_rejected += amount;
    }

    // By category
    if (expense.category && summary.by_category[expense.category as ExpenseCategory] !== undefined) {
      summary.by_category[expense.category as ExpenseCategory] += amount;
    }

    // By itinerary
    if (expense.itinerary?.id) {
      if (!itineraryTotals[expense.itinerary.id]) {
        itineraryTotals[expense.itinerary.id] = {
          id: expense.itinerary.id,
          title: expense.itinerary.title || 'Unknown',
          total: 0,
        };
      }
      itineraryTotals[expense.itinerary.id].total += amount;
    }

    // By player (for per-player expenses)
    if (expense.per_player && expense.player?.id) {
      if (!playerTotals[expense.player.id]) {
        playerTotals[expense.player.id] = {
          id: expense.player.id,
          name: expense.player.profile?.full_name || 'Unknown',
          total: 0,
        };
      }
      playerTotals[expense.player.id].total += amount;
    }
  }

  summary.by_itinerary = Object.values(itineraryTotals).sort((a, b) => b.total - a.total);
  summary.by_player = Object.values(playerTotals).sort((a, b) => b.total - a.total);

  return { success: true, data: summary };
}

// -----------------------------------------------------------------------------
// Receipt Actions
// -----------------------------------------------------------------------------

/**
 * Upload a receipt for an expense
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
    .from('travel_expenses')
    .update({
      receipt_url: fileUrl,
      receipt_uploaded_at: new Date().toISOString(),
    })
    .eq('id', expenseId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/travel');
  return { success: true, data: expense };
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
    .from('travel_expenses')
    .update({
      receipt_url: null,
      receipt_uploaded_at: null,
    })
    .eq('id', expenseId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/travel');
  return { success: true, data: expense };
}
