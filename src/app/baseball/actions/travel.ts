'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logServerError } from '@/lib/server-error-logger';
import { BaseballCapabilityError, requireBaseballCapability } from '@/lib/baseball/capabilities';
import {
  withBaseballAction,
  BaseballUnauthorizedError,
  BaseballNoActiveTeamError,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';

const TRAVEL_PATH = '/baseball/dashboard/travel';

type TravelMutationResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

function mapTravelActionError(error: unknown): TravelMutationResult {
  if (error instanceof BaseballUnauthorizedError) {
    return { success: false, error: 'Unauthorized' };
  }
  if (error instanceof BaseballNoActiveTeamError) {
    return { success: false, error: 'Coach or team not found' };
  }
  if (error instanceof BaseballCapabilityError) {
    return { success: false, error: 'You do not have permission to manage travel' };
  }
  if (error instanceof BaseballActionError) {
    return { success: false, error: 'Could not complete the travel action. Please try again.' };
  }
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: 'An unexpected error occurred.' };
}

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

async function getTeamItinerariesImpl(teamId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false as const, error: 'Not authenticated', data: [] as BaseballTravelItinerary[] };
  }

  const { data, error } = await supabase
    .from('baseball_travel_itineraries')
    .select('*')
    .eq('team_id', teamId)
    .order('departure_date', { ascending: true, nullsFirst: false });

  if (error) {
    await logServerError(`[Baseball Travel] Error fetching itineraries: ${error instanceof Error ? error.message : String(error)}`, { action: 'travel.getTeamItineraries' });
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
    return await createItineraryAction(teamId, data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false as const, error: err.issues[0]?.message || 'Invalid data.' };
    }
    await logServerError(`[Baseball Travel] Unexpected error: ${err instanceof Error ? err.message : String(err)}`, { action: 'travel.createItinerary' });
    return mapTravelActionError(err);
  }
}

const createItineraryAction = withBaseballAction(
  'createItinerary',
  { featureArea: 'baseball-travel', requiredCapability: 'can_manage_settings' },
  async (ctx, teamId: string, data: {
    event_name: string;
    departure_date?: string;
    return_date?: string;
    location?: string;
    accommodation?: string;
    transportation?: string;
    notes?: string;
  }) => {
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

    if (teamId !== ctx.activeTeamId) {
      await requireBaseballCapability(teamId, 'can_manage_settings');
    }

    const coachId = ctx.activeCoachId;
    if (!coachId) return { success: false as const, error: 'Coach profile not found.' };

    const supabase = await createClient();
    const { data: created, error } = await supabase
      .from('baseball_travel_itineraries')
      .insert({
        ...validated,
        created_by: coachId,
      })
      .select()
      .single();

    if (error) {
      await logServerError(`[Baseball Travel] Create error: ${error instanceof Error ? error.message : String(error)}`, { action: 'travel.createItinerary' });
      return { success: false as const, error: 'Failed to create itinerary.' };
    }

    revalidatePath(TRAVEL_PATH);
    return { success: true as const, data: created as BaseballTravelItinerary };
  },
);

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
    return await updateItineraryAction(id, data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false as const, error: err.issues[0]?.message || 'Invalid data.' };
    }
    await logServerError(`[Baseball Travel] Unexpected error: ${err instanceof Error ? err.message : String(err)}`, { action: 'travel.updateItinerary' });
    return mapTravelActionError(err);
  }
}

const updateItineraryAction = withBaseballAction(
  'updateItinerary',
  { featureArea: 'baseball-travel' },
  async (_ctx, id: string, data: {
    event_name?: string;
    departure_date?: string | null;
    return_date?: string | null;
    location?: string | null;
    accommodation?: string | null;
    transportation?: string | null;
    notes?: string | null;
  }) => {
    const validated = updateItinerarySchema.parse({ id, ...data });
    const { id: _id, ...updateData } = validated;
    void _id;

    const supabase = await createClient();
    const { data: existing } = await supabase
      .from('baseball_travel_itineraries')
      .select('team_id')
      .eq('id', id)
      .single();

    if (!existing?.team_id) {
      return { success: false as const, error: 'Itinerary not found.' };
    }

    await requireBaseballCapability(String(existing.team_id), 'can_manage_settings');

    const { data: updated, error } = await supabase
      .from('baseball_travel_itineraries')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      await logServerError(`[Baseball Travel] Update error: ${error instanceof Error ? error.message : String(error)}`, { action: 'travel.updateItinerary' });
      return { success: false as const, error: 'Failed to update itinerary.' };
    }

    revalidatePath(TRAVEL_PATH);
    return { success: true as const, data: updated as BaseballTravelItinerary };
  },
);

export async function deleteItinerary(id: string) {
  try {
    return await deleteItineraryAction(id);
  } catch (error) {
    return mapTravelActionError(error);
  }
}

const deleteItineraryAction = withBaseballAction(
  'deleteItinerary',
  { featureArea: 'baseball-travel' },
  async (_ctx, id: string) => {
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from('baseball_travel_itineraries')
      .select('team_id')
      .eq('id', id)
      .single();

    if (!existing?.team_id) {
      return { success: false as const, error: 'Itinerary not found.' };
    }

    await requireBaseballCapability(String(existing.team_id), 'can_manage_settings');

    await supabase
      .from('baseball_travel_expenses')
      .delete()
      .eq('itinerary_id', id);

    const { error } = await supabase
      .from('baseball_travel_itineraries')
      .delete()
      .eq('id', id);

    if (error) {
      await logServerError(`[Baseball Travel] Delete error: ${error instanceof Error ? error.message : String(error)}`, { action: 'travel.deleteItinerary' });
      return { success: false as const, error: 'Failed to delete itinerary.' };
    }

    revalidatePath(TRAVEL_PATH);
    return { success: true as const };
  },
);

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
    return await addExpenseAction(itineraryId, teamId, data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false as const, error: err.issues[0]?.message || 'Invalid data.' };
    }
    await logServerError(`[Baseball Travel] Unexpected error: ${err instanceof Error ? err.message : String(err)}`, { action: 'travel.addExpense' });
    return mapTravelActionError(err);
  }
}

const addExpenseAction = withBaseballAction(
  'addExpense',
  { featureArea: 'baseball-travel', requiredCapability: 'can_manage_settings' },
  async (ctx, itineraryId: string, teamId: string, data: {
    category: ExpenseCategory;
    amount: number;
    description?: string;
    paid_by?: ExpensePaidBy;
    expense_date?: string;
    vendor_name?: string;
    notes?: string;
  }) => {
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

    if (teamId !== ctx.activeTeamId) {
      await requireBaseballCapability(teamId, 'can_manage_settings');
    }

    const supabase = await createClient();

    const { data: itinerary } = await supabase
      .from('baseball_travel_itineraries')
      .select('team_id')
      .eq('id', itineraryId)
      .single();

    if (!itinerary?.team_id || String(itinerary.team_id) !== teamId) {
      return { success: false as const, error: 'Itinerary not found.' };
    }

    const { data: created, error } = await supabase
      .from('baseball_travel_expenses')
      .insert({
        ...validated,
        created_by: ctx.user.id,
      })
      .select()
      .single();

    if (error) {
      await logServerError(`[Baseball Travel] Add expense error: ${error instanceof Error ? error.message : String(error)}`, { action: 'travel.addExpense' });
      return { success: false as const, error: 'Failed to add expense.' };
    }

    revalidatePath(TRAVEL_PATH);
    return { success: true as const, data: created as BaseballTravelExpense };
  },
);

async function getItineraryExpensesImpl(itineraryId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false as const, error: 'Not authenticated', data: [] as BaseballTravelExpense[] };
  }

  const { data, error } = await supabase
    .from('baseball_travel_expenses')
    .select('*')
    .eq('itinerary_id', itineraryId)
    .order('expense_date', { ascending: false, nullsFirst: false });

  if (error) {
    await logServerError(`[Baseball Travel] Fetch expenses error: ${error instanceof Error ? error.message : String(error)}`, { action: 'travel.getItineraryExpenses' });
    return { success: false as const, error: 'Failed to fetch expenses.', data: [] as BaseballTravelExpense[] };
  }

  return { success: true as const, data: (data || []) as BaseballTravelExpense[] };
}

export async function deleteExpense(expenseId: string) {
  try {
    return await deleteExpenseAction(expenseId);
  } catch (error) {
    return mapTravelActionError(error);
  }
}

const deleteExpenseAction = withBaseballAction(
  'deleteExpense',
  { featureArea: 'baseball-travel' },
  async (_ctx, expenseId: string) => {
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from('baseball_travel_expenses')
      .select('team_id')
      .eq('id', expenseId)
      .single();

    if (!existing?.team_id) {
      return { success: false as const, error: 'Expense not found.' };
    }

    await requireBaseballCapability(String(existing.team_id), 'can_manage_settings');

    const { error } = await supabase
      .from('baseball_travel_expenses')
      .delete()
      .eq('id', expenseId);

    if (error) {
      await logServerError(`[Baseball Travel] Delete expense error: ${error instanceof Error ? error.message : String(error)}`, { action: 'travel.deleteExpense' });
      return { success: false as const, error: 'Failed to delete expense.' };
    }

    revalidatePath(TRAVEL_PATH);
    return { success: true as const };
  },
);

async function getExpenseSummaryImpl(itineraryId: string): Promise<{ success: boolean; data?: BaseballExpenseSummary; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data, error } = await supabase
    .from('baseball_travel_expenses')
    .select('category, amount, paid_by')
    .eq('itinerary_id', itineraryId);

  if (error) {
    await logServerError(`[Baseball Travel] Expense summary error: ${error instanceof Error ? error.message : String(error)}`, { action: 'travel.getExpenseSummary' });
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
    // amount comes back as a numeric-string from Postgres NUMERIC columns at
    // runtime even though the generated type says `number`; String() is a
    // no-op when it's already a number, so this is behavior-preserving.
    const amount = parseFloat(String(expense.amount)) || 0;
    summary.total += amount;
    if (expense.category in summary.byCategory) {
      summary.byCategory[expense.category as ExpenseCategory] += amount;
    }
    if (expense.paid_by && expense.paid_by in summary.byPaidBy) {
      summary.byPaidBy[expense.paid_by as ExpensePaidBy] += amount;
    }
  }

  return { success: true, data: summary };
}

export const getTeamItineraries = withAdminObserved(
  'getTeamItineraries',
  { sport: 'baseball', feature: 'baseball_travel', featureArea: 'baseball-travel' },
  getTeamItinerariesImpl,
);

export const getItineraryExpenses = withAdminObserved(
  'getItineraryExpenses',
  { sport: 'baseball', feature: 'baseball_travel', featureArea: 'baseball-travel' },
  getItineraryExpensesImpl,
);

export const getExpenseSummary = withAdminObserved(
  'getExpenseSummary',
  { sport: 'baseball', feature: 'baseball_travel', featureArea: 'baseball-travel' },
  getExpenseSummaryImpl,
);
