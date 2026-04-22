'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

export type ExpenseCategory = 'transport' | 'lodging' | 'meals' | 'equipment' | 'other';
export type ExpensePaidBy = 'team' | 'player' | 'pending_reimbursement' | 'split';

export interface BaseballTravelItinerary {
  id: string;
  team_id: string;
  event_name: string;
  departure_date: string | null;
  return_date: string | null;
  location: string | null;
  accommodation: string | null;
  transportation: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BaseballTravelExpense {
  id: string;
  itinerary_id: string;
  team_id: string;
  category: ExpenseCategory;
  amount: number;
  description: string | null;
  paid_by: ExpensePaidBy;
  expense_date: string | null;
  vendor_name: string | null;
  notes: string | null;
  receipt_url: string | null;
  created_by: string;
  created_at: string;
}

export interface BaseballExpenseSummary {
  total: number;
  byCategory: Record<ExpenseCategory, number>;
  byPaidBy: Record<ExpensePaidBy, number>;
  count: number;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createItinerarySchema = z.object({
  team_id: z.string().uuid(),
  event_name: z.string().min(1, 'Event name is required').max(200),
  departure_date: z.string().optional().nullable(),
  return_date: z.string().optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  accommodation: z.string().max(500).optional().nullable(),
  transportation: z.string().max(500).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

const updateItinerarySchema = z.object({
  id: z.string().uuid(),
  event_name: z.string().min(1).max(200).optional(),
  departure_date: z.string().optional().nullable(),
  return_date: z.string().optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  accommodation: z.string().max(500).optional().nullable(),
  transportation: z.string().max(500).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

const expenseCategorySchema = z.enum(['transport', 'lodging', 'meals', 'equipment', 'other']);
const expensePaidBySchema = z.enum(['team', 'player', 'pending_reimbursement', 'split']);

const createExpenseSchema = z.object({
  itinerary_id: z.string().uuid(),
  team_id: z.string().uuid(),
  category: expenseCategorySchema,
  amount: z.number().positive('Amount must be positive'),
  description: z.string().max(500).optional().nullable(),
  paid_by: expensePaidBySchema,
  expense_date: z.string().optional().nullable(),
  vendor_name: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// ============================================================================
// ITINERARY ACTIONS
// ============================================================================

export async function getTeamItineraries(teamId: string) {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('baseball_travel_itineraries')
    .select('*')
    .eq('team_id', teamId)
    .order('departure_date', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('[Baseball Travel] Error fetching itineraries:', error);
    return { success: false as const, error: 'Failed to fetch itineraries.', data: [] as BaseballTravelItinerary[] };
  }

  return { success: true as const, data: (data || []) as BaseballTravelItinerary[] };
}

export async function createItinerary(teamId: string, data: {
  event_name: string;
  departure_date?: string;
  return_date?: string;
  location?: string;
  accommodation?: string;
  transportation?: string;
  notes?: string;
}) {
  try {
    const validated = createItinerarySchema.parse({
      team_id: teamId,
      event_name: data.event_name,
      departure_date: data.departure_date || null,
      return_date: data.return_date || null,
      location: data.location || null,
      accommodation: data.accommodation || null,
      transportation: data.transportation || null,
      notes: data.notes || null,
    });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false as const, error: 'Unauthorized' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: created, error } = await (supabase as any)
      .from('baseball_travel_itineraries')
      .insert({
        ...validated,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[Baseball Travel] Create error:', error);
      return { success: false as const, error: 'Failed to create itinerary.' };
    }

    revalidatePath('/baseball/dashboard/travel');
    return { success: true as const, data: created as BaseballTravelItinerary };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false as const, error: err.issues[0]?.message || 'Invalid data.' };
    }
    console.error('[Baseball Travel] Unexpected error:', err);
    return { success: false as const, error: 'An unexpected error occurred.' };
  }
}

export async function updateItinerary(id: string, data: {
  event_name?: string;
  departure_date?: string | null;
  return_date?: string | null;
  location?: string | null;
  accommodation?: string | null;
  transportation?: string | null;
  notes?: string | null;
}) {
  try {
    const validated = updateItinerarySchema.parse({ id, ...data });
    const { id: _id, ...updateData } = validated;

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error } = await (supabase as any)
      .from('baseball_travel_itineraries')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[Baseball Travel] Update error:', error);
      return { success: false as const, error: 'Failed to update itinerary.' };
    }

    revalidatePath('/baseball/dashboard/travel');
    return { success: true as const, data: updated as BaseballTravelItinerary };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false as const, error: err.issues[0]?.message || 'Invalid data.' };
    }
    console.error('[Baseball Travel] Unexpected error:', err);
    return { success: false as const, error: 'An unexpected error occurred.' };
  }
}

export async function deleteItinerary(id: string) {
  const supabase = await createClient();

  // Delete associated expenses first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('baseball_travel_expenses')
    .delete()
    .eq('itinerary_id', id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('baseball_travel_itineraries')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[Baseball Travel] Delete error:', error);
    return { success: false as const, error: 'Failed to delete itinerary.' };
  }

  revalidatePath('/baseball/dashboard/travel');
  return { success: true as const };
}

// ============================================================================
// EXPENSE ACTIONS
// ============================================================================

export async function addExpense(itineraryId: string, teamId: string, data: {
  category: ExpenseCategory;
  amount: number;
  description?: string;
  paid_by?: ExpensePaidBy;
  expense_date?: string;
  vendor_name?: string;
  notes?: string;
}) {
  try {
    const validated = createExpenseSchema.parse({
      itinerary_id: itineraryId,
      team_id: teamId,
      category: data.category,
      amount: data.amount,
      description: data.description || null,
      paid_by: data.paid_by || 'team',
      expense_date: data.expense_date || null,
      vendor_name: data.vendor_name || null,
      notes: data.notes || null,
    });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false as const, error: 'Unauthorized' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: created, error } = await (supabase as any)
      .from('baseball_travel_expenses')
      .insert({
        ...validated,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[Baseball Travel] Add expense error:', error);
      return { success: false as const, error: 'Failed to add expense.' };
    }

    revalidatePath('/baseball/dashboard/travel');
    return { success: true as const, data: created as BaseballTravelExpense };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false as const, error: err.issues[0]?.message || 'Invalid data.' };
    }
    console.error('[Baseball Travel] Unexpected error:', err);
    return { success: false as const, error: 'An unexpected error occurred.' };
  }
}

export async function getItineraryExpenses(itineraryId: string) {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('baseball_travel_expenses')
    .select('*')
    .eq('itinerary_id', itineraryId)
    .order('expense_date', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('[Baseball Travel] Fetch expenses error:', error);
    return { success: false as const, error: 'Failed to fetch expenses.', data: [] as BaseballTravelExpense[] };
  }

  return { success: true as const, data: (data || []) as BaseballTravelExpense[] };
}

export async function deleteExpense(expenseId: string) {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('baseball_travel_expenses')
    .delete()
    .eq('id', expenseId);

  if (error) {
    console.error('[Baseball Travel] Delete expense error:', error);
    return { success: false as const, error: 'Failed to delete expense.' };
  }

  revalidatePath('/baseball/dashboard/travel');
  return { success: true as const };
}

export async function getExpenseSummary(itineraryId: string): Promise<{ success: boolean; data?: BaseballExpenseSummary; error?: string }> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('baseball_travel_expenses')
    .select('category, amount, paid_by')
    .eq('itinerary_id', itineraryId);

  if (error) {
    console.error('[Baseball Travel] Expense summary error:', error);
    return { success: false, error: 'Failed to fetch expense summary.' };
  }

  const expenses = data || [];
  const summary: BaseballExpenseSummary = {
    total: 0,
    byCategory: { transport: 0, lodging: 0, meals: 0, equipment: 0, other: 0 },
    byPaidBy: { team: 0, player: 0, pending_reimbursement: 0, split: 0 },
    count: expenses.length,
  };

  for (const expense of expenses) {
    const amount = parseFloat(expense.amount) || 0;
    summary.total += amount;
    if (expense.category in summary.byCategory) {
      summary.byCategory[expense.category as ExpenseCategory] += amount;
    }
    if (expense.paid_by in summary.byPaidBy) {
      summary.byPaidBy[expense.paid_by as ExpensePaidBy] += amount;
    }
  }

  return { success: true, data: summary };
}
