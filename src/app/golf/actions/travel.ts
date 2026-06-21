'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';
import { logServerError } from '@/lib/server-error-logger';
import { validateCoachTeamAccess } from '@/lib/golf/resolve-team';

// ============================================================================
// VALIDATION SCHEMAS (Zod)
// ============================================================================

const uuidSchema = z.string().uuid();
const transportationTypeSchema = z.enum(['bus', 'van', 'flight', 'carpool']);

// Validates a date string coming from an HTML <input type="date">.
// The native iOS Safari date picker always returns YYYY-MM-DD; this regex
// also accepts the ISO subset used by Postgres. An empty string (returned
// when the iOS picker is dismissed without a selection) is rejected.
const dateStringSchema = z
  .string()
  .min(1, 'Departure date is required')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format — expected YYYY-MM-DD');

const createTravelItinerarySchema = z.object({
  team_id: z.string().uuid(),
  event_id: z.string().uuid().optional(),
  event_name: z.string().min(1).max(200),
  destination: z.string().min(1).max(200),
  transportation_type: transportationTypeSchema,
  departure_date: dateStringSchema,
  departure_time: z.string().optional(),
  departure_location: z.string().max(500).optional(),
  return_date: z.string().optional(),
  return_time: z.string().optional(),
  flight_info: z.string().max(1000).optional(),
  hotel_name: z.string().max(200).optional(),
  hotel_address: z.string().max(500).optional(),
  hotel_phone: z.string().max(50).optional(),
  hotel_confirmation: z.string().max(100).optional(),
  check_in_date: z.string().optional(),
  check_out_date: z.string().optional(),
  room_assignments: z.string().max(2000).optional(),
  uniform_requirements: z.string().max(1000).optional(),
  gear_list: z.string().max(2000).optional(),
  notes: z.string().max(5000).optional(),
  created_by: z.string().uuid().optional(),
});

const updateTravelItinerarySchema = z.object({
  id: z.string().uuid(),
  event_name: z.string().min(1).max(200).optional(),
  destination: z.string().min(1).max(200).optional(),
  transportation_type: transportationTypeSchema.optional(),
  departure_date: z.string().optional(),
  departure_time: z.string().optional(),
  departure_location: z.string().max(500).optional(),
  return_date: z.string().optional(),
  return_time: z.string().optional(),
  flight_info: z.string().max(1000).optional(),
  hotel_name: z.string().max(200).optional(),
  hotel_address: z.string().max(500).optional(),
  hotel_phone: z.string().max(50).optional(),
  hotel_confirmation: z.string().max(100).optional(),
  check_in_date: z.string().optional(),
  check_out_date: z.string().optional(),
  room_assignments: z.string().max(2000).optional(),
  uniform_requirements: z.string().max(1000).optional(),
  gear_list: z.string().max(2000).optional(),
  notes: z.string().max(5000).optional(),
});

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface CreateTravelItineraryInput {
  team_id: string;
  event_id?: string;
  event_name: string;
  destination: string;
  transportation_type: 'bus' | 'van' | 'flight' | 'carpool';
  departure_date: string;
  departure_time?: string;
  departure_location?: string;
  return_date?: string;
  return_time?: string;
  flight_info?: string;
  hotel_name?: string;
  hotel_address?: string;
  hotel_phone?: string;
  hotel_confirmation?: string;
  check_in_date?: string;
  check_out_date?: string;
  room_assignments?: string;
  uniform_requirements?: string;
  gear_list?: string;
  notes?: string;
  created_by?: string;
}

export interface UpdateTravelItineraryInput {
  id: string;
  event_name?: string;
  destination?: string;
  transportation_type?: 'bus' | 'van' | 'flight' | 'carpool';
  departure_date?: string;
  departure_time?: string;
  departure_location?: string;
  return_date?: string;
  return_time?: string;
  flight_info?: string;
  hotel_name?: string;
  hotel_address?: string;
  hotel_phone?: string;
  hotel_confirmation?: string;
  check_in_date?: string;
  check_out_date?: string;
  room_assignments?: string;
  uniform_requirements?: string;
  gear_list?: string;
  notes?: string;
}

// Travel update data is same as UpdateTravelItineraryInput without id

/**
 * Create a new golf travel itinerary
 */
export async function createGolfTravelItinerary(input: CreateTravelItineraryInput) {
  try {
    // Validate input
    const validatedData = createTravelItinerarySchema.parse(input);

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a coach. The travel table's created_by column references
    // golf_coaches.id, so use the trusted row from auth instead of client input.
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!coach) {
      return { success: false, error: 'Only coaches can manage travel itineraries' };
    }

    // DB column types: flight_info=jsonb, room_assignments=jsonb, gear_list=text[]
    // check_in_date and check_out_date don't exist in the database
    // Convert empty strings to null for time/date columns (Postgres rejects "" for time type)
    const emptyToNull = (val: string | undefined) => (val && val.trim() !== '' ? val : null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('golf_travel_itineraries')
      .insert({
        team_id: validatedData.team_id,
        event_id: validatedData.event_id || null,
        event_name: validatedData.event_name,
        destination: validatedData.destination,
        transportation_type: validatedData.transportation_type,
        departure_date: validatedData.departure_date,
        departure_time: emptyToNull(validatedData.departure_time),
        departure_location: emptyToNull(validatedData.departure_location),
        return_date: emptyToNull(validatedData.return_date),
        return_time: emptyToNull(validatedData.return_time),
        flight_info: validatedData.flight_info ? { text: validatedData.flight_info } : null,
        hotel_name: emptyToNull(validatedData.hotel_name),
        hotel_address: emptyToNull(validatedData.hotel_address),
        hotel_phone: emptyToNull(validatedData.hotel_phone),
        hotel_confirmation: emptyToNull(validatedData.hotel_confirmation),
        room_assignments: validatedData.room_assignments ? { text: validatedData.room_assignments } : null,
        uniform_requirements: emptyToNull(validatedData.uniform_requirements),
        gear_list: validatedData.gear_list ? validatedData.gear_list.split(',').map((s: string) => s.trim()).filter(Boolean) : null,
        notes: emptyToNull(validatedData.notes),
        created_by: coach.id,
      })
      .select()
      .single();

    if (error) {
      return {
        success: false,
        error: 'Operation failed. Please try again.',
      };
    }

    revalidatePath('/golf/dashboard/travel');

    return {
      success: true,
      data,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Surface the departure-date message specifically. It's the one field an
      // iOS user can silently get wrong (the native date picker returns "" when
      // dismissed without a selection), and the new toast needs an actionable
      // message — not the generic "check your inputs" — to tell them what's
      // missing. Any OTHER field validation still falls back to the generic copy.
      const dateIssue = error.issues.find((i) => i.path[0] === 'departure_date');
      return {
        success: false,
        error: dateIssue?.message || 'Invalid travel itinerary data. Please check your inputs.',
      };
    }
    await logServerError(
      `Unexpected error in createGolfTravelItinerary: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'travel.createGolfTravelItinerary', featureArea: 'travel' }
    );
    return formatSafeErrorResponse(error);
  }
}

/**
 * Update a golf travel itinerary
 */
export async function updateGolfTravelItinerary(input: UpdateTravelItineraryInput) {
  try {
    // Validate input
    const validatedData = updateTravelItinerarySchema.parse(input);

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!coach) {
      return { success: false, error: 'Only coaches can manage travel itineraries' };
    }

    // Verify itinerary belongs to coach's team
    const { data: itineraryRecord } = await supabase
      .from('golf_travel_itineraries')
      .select('team_id')
      .eq('id', validatedData.id)
      .maybeSingle();
    if (!itineraryRecord) return { success: false, error: 'Itinerary not found' };
    // Staff-strict: the coach must be staffed on the itinerary's team (works for
    // a program head on both teams; not tied to the active toggle).
    if (!(await validateCoachTeamAccess(supabase, coach.id, itineraryRecord.team_id, coach.organization_id))) {
      return { success: false, error: 'Not authorized for this team' };
    }

    // Extract update data (omit id and fields that don't exist in the database)
    const { id, check_in_date: _checkIn, check_out_date: _checkOut, ...rawUpdateData } = validatedData;

    // Convert types to match DB schema: flight_info=jsonb, room_assignments=jsonb, gear_list=text[]
    // Convert empty strings to null for time/date columns (Postgres rejects "" for time type)
    const emptyToNull = (val: unknown) => (typeof val === 'string' && val.trim() === '' ? null : val);

    const updateData: Record<string, unknown> = { ...rawUpdateData };

    // Sanitize time/date fields that Postgres rejects as empty strings
    const timeAndDateFields = ['departure_time', 'return_time', 'departure_date', 'return_date'];
    for (const field of timeAndDateFields) {
      if (field in updateData) {
        updateData[field] = emptyToNull(updateData[field]);
      }
    }

    // Sanitize other optional string fields
    const optionalStringFields = ['departure_location', 'hotel_name', 'hotel_address', 'hotel_phone', 'hotel_confirmation', 'uniform_requirements', 'notes', 'event_id'];
    for (const field of optionalStringFields) {
      if (field in updateData) {
        updateData[field] = emptyToNull(updateData[field]);
      }
    }

    if ('flight_info' in updateData && typeof updateData.flight_info === 'string') {
      updateData.flight_info = updateData.flight_info ? { text: updateData.flight_info } : null;
    }
    if ('room_assignments' in updateData && typeof updateData.room_assignments === 'string') {
      updateData.room_assignments = updateData.room_assignments ? { text: updateData.room_assignments } : null;
    }
    if ('gear_list' in updateData && typeof updateData.gear_list === 'string') {
      updateData.gear_list = updateData.gear_list ? (updateData.gear_list as string).split(',').map((s: string) => s.trim()).filter(Boolean) : null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('golf_travel_itineraries')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return {
        success: false,
        error: 'Operation failed. Please try again.',
      };
    }

    revalidatePath('/golf/dashboard/travel');

    return {
      success: true,
      data,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid travel itinerary data. Please check your inputs.',
      };
    }
    await logServerError(
      `Unexpected error in updateGolfTravelItinerary: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'travel.updateGolfTravelItinerary', featureArea: 'travel' }
    );
    return formatSafeErrorResponse(error);
  }
}

/**
 * Delete a golf travel itinerary
 */
export async function deleteGolfTravelItinerary(itineraryId: string) {
  const parsed = uuidSchema.safeParse(itineraryId);
  if (!parsed.success) {
    return { success: false, error: 'Invalid itinerary ID.' };
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Verify user is a coach
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach) {
    return { success: false, error: 'Only coaches can manage travel itineraries' };
  }

  // Verify itinerary belongs to coach's team
  const { data: itineraryRecord } = await supabase
    .from('golf_travel_itineraries')
    .select('team_id')
    .eq('id', parsed.data)
    .maybeSingle();
  if (!itineraryRecord) return { success: false, error: 'Itinerary not found' };
  // Staff-strict: the coach must be staffed on the itinerary's team.
  if (!(await validateCoachTeamAccess(supabase, coach.id, itineraryRecord.team_id, coach.organization_id))) {
    return { success: false, error: 'Not authorized for this team' };
  }

  const { error } = await supabase
    .from('golf_travel_itineraries')
    .delete()
    .eq('id', parsed.data);

  if (error) {
    return {
      success: false,
      error: 'Failed to delete travel itinerary. Please try again.',
    };
  }

  revalidatePath('/golf/dashboard/travel');

  return {
    success: true,
  };
}

// ============================================================================
// EXPENSE TRACKING
// ============================================================================

export type ExpenseCategory = 'lodging' | 'transportation' | 'meals' | 'entry_fees' | 'equipment' | 'other';
export type ExpensePaidBy = 'team' | 'player' | 'pending_reimbursement' | 'split';

const expenseCategorySchema = z.enum(['lodging', 'transportation', 'meals', 'entry_fees', 'equipment', 'other']);
const expensePaidBySchema = z.enum(['team', 'player', 'pending_reimbursement', 'split']);

const createExpenseSchema = z.object({
  itinerary_id: z.string().uuid().optional().nullable(),
  team_id: z.string().uuid(),
  category: expenseCategorySchema,
  description: z.string().min(1).max(500),
  amount: z.number().positive().max(1_000_000),
  receipt_url: z.string().url().max(1000).optional().nullable(),
  paid_by: expensePaidBySchema,
  vendor_name: z.string().max(200).optional().nullable(),
  expense_date: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const updateExpenseSchema = z.object({
  id: z.string().uuid(),
  category: expenseCategorySchema.optional(),
  description: z.string().min(1).max(500).optional(),
  amount: z.number().positive().max(1_000_000).optional(),
  receipt_url: z.string().url().max(1000).optional().nullable(),
  paid_by: expensePaidBySchema.optional(),
  vendor_name: z.string().max(200).optional().nullable(),
  expense_date: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export interface CreateExpenseInput {
  itinerary_id?: string | null;
  team_id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  receipt_url?: string | null;
  paid_by: ExpensePaidBy;
  vendor_name?: string | null;
  expense_date?: string | null;
  notes?: string | null;
}

export interface UpdateExpenseInput {
  id: string;
  category?: ExpenseCategory;
  description?: string;
  amount?: number;
  receipt_url?: string | null;
  paid_by?: ExpensePaidBy;
  vendor_name?: string | null;
  expense_date?: string | null;
  notes?: string | null;
}

export interface TravelExpense {
  id: string;
  itinerary_id: string | null;
  team_id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  receipt_url: string | null;
  paid_by: ExpensePaidBy;
  vendor_name: string | null;
  expense_date: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ExpenseSummary {
  total: number;
  byCategory: Record<ExpenseCategory, number>;
  byPaidBy: Record<ExpensePaidBy, number>;
  count: number;
}

/**
 * Create a new travel expense
 */
export async function createTravelExpense(input: CreateExpenseInput) {
  try {
    const validatedData = createExpenseSchema.parse(input);
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Verify user is a coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!coach) {
      return { success: false, error: 'Only coaches can manage expenses' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('golf_travel_expenses')
      .insert({
        itinerary_id: validatedData.itinerary_id || null,
        team_id: validatedData.team_id,
        category: validatedData.category,
        description: validatedData.description,
        amount: validatedData.amount,
        receipt_url: validatedData.receipt_url || null,
        paid_by: validatedData.paid_by,
        vendor_name: validatedData.vendor_name || null,
        expense_date: validatedData.expense_date || null,
        notes: validatedData.notes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: 'Failed to create expense. Please try again.' };
    }

    revalidatePath('/golf/dashboard/travel');
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid expense data. Please check your inputs.' };
    }
    await logServerError(
      `Unexpected error in createTravelExpense: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'travel.createTravelExpense', featureArea: 'travel' }
    );
    return formatSafeErrorResponse(error);
  }
}

/**
 * Update an existing travel expense
 */
export async function updateTravelExpense(input: UpdateExpenseInput) {
  try {
    const validatedData = updateExpenseSchema.parse(input);
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!coach) {
      return { success: false, error: 'Only coaches can manage expenses' };
    }

    const { id, ...updateData } = validatedData;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('golf_travel_expenses')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { success: false, error: 'Failed to update expense. Please try again.' };
    }

    revalidatePath('/golf/dashboard/travel');
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid expense data. Please check your inputs.' };
    }
    await logServerError(
      `Unexpected error in updateTravelExpense: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'travel.updateTravelExpense', featureArea: 'travel' }
    );
    return formatSafeErrorResponse(error);
  }
}

/**
 * Delete a travel expense
 */
export async function deleteTravelExpense(expenseId: string) {
  const parsed = uuidSchema.safeParse(expenseId);
  if (!parsed.success) {
    return { success: false, error: 'Invalid expense ID.' };
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Verify user is a coach
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach) {
    return { success: false, error: 'Only coaches can manage expenses' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('golf_travel_expenses')
    .delete()
    .eq('id', parsed.data);

  if (error) {
    return { success: false, error: 'Failed to delete expense. Please try again.' };
  }

  revalidatePath('/golf/dashboard/travel');
  return { success: true };
}

/**
 * Get expenses for an itinerary
 */
export async function getExpensesForItinerary(itineraryId: string): Promise<{ success: boolean; data?: TravelExpense[]; error?: string }> {
  const parsed = uuidSchema.safeParse(itineraryId);
  if (!parsed.success) {
    return { success: false, error: 'Invalid itinerary ID.' };
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('golf_travel_expenses')
    .select('*')
    .eq('itinerary_id', parsed.data)
    .order('expense_date', { ascending: false, nullsFirst: false });

  if (error) {
    return { success: false, error: 'Failed to fetch expenses.' };
  }

  return { success: true, data: data || [] };
}

/**
 * Get all expenses for a team
 */
export async function getExpensesForTeam(teamId: string): Promise<{ success: boolean; data?: TravelExpense[]; error?: string }> {
  const parsed = uuidSchema.safeParse(teamId);
  if (!parsed.success) {
    return { success: false, error: 'Invalid team ID.' };
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('golf_travel_expenses')
    .select('*')
    .eq('team_id', parsed.data)
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, error: 'Failed to fetch expenses.' };
  }

  return { success: true, data: data || [] };
}

/**
 * Get expense summary for an itinerary
 */
export async function getExpenseSummary(itineraryId: string): Promise<{ success: boolean; data?: ExpenseSummary; error?: string }> {
  const parsed = uuidSchema.safeParse(itineraryId);
  if (!parsed.success) {
    return { success: false, error: 'Invalid itinerary ID.' };
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('golf_travel_expenses')
    .select('category, amount, paid_by')
    .eq('itinerary_id', parsed.data);

  if (error) {
    return { success: false, error: 'Failed to fetch expense summary.' };
  }

  const expenses = data || [];
  const summary: ExpenseSummary = {
    total: 0,
    byCategory: {
      lodging: 0,
      transportation: 0,
      meals: 0,
      entry_fees: 0,
      equipment: 0,
      other: 0,
    },
    byPaidBy: {
      team: 0,
      player: 0,
      pending_reimbursement: 0,
      split: 0,
    },
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

/**
 * Upload receipt to Supabase Storage
 */
const ALLOWED_RECEIPT_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'pdf', 'heic']);
const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function uploadExpenseReceipt(
  file: File,
  teamId: string,
  expenseId?: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  const parsedTeamId = uuidSchema.safeParse(teamId);
  if (!parsedTeamId.success) {
    return { success: false, error: 'Invalid team ID.' };
  }
  if (expenseId !== undefined) {
    const parsedExpenseId = uuidSchema.safeParse(expenseId);
    if (!parsedExpenseId.success) {
      return { success: false, error: 'Invalid expense ID.' };
    }
  }

  if (file.size > MAX_RECEIPT_SIZE_BYTES) {
    return { success: false, error: 'File too large. Maximum size is 10MB.' };
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileExt = sanitizedName.split('.').pop()?.toLowerCase();
  if (!fileExt || !ALLOWED_RECEIPT_EXTENSIONS.has(fileExt)) {
    return { success: false, error: 'Invalid file type. Allowed: jpg, jpeg, png, pdf, heic.' };
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  const fileName = `${parsedTeamId.data}/${expenseId || 'new'}_${Date.now()}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from('expense-receipts')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    return { success: false, error: 'Failed to upload receipt.' };
  }

  const { data: urlData } = supabase.storage
    .from('expense-receipts')
    .getPublicUrl(data.path);

  return { success: true, url: urlData.publicUrl };
}

/**
 * Export expenses to CSV format
 */
export async function exportExpensesToCSV(itineraryId: string): Promise<{ success: boolean; csv?: string; error?: string }> {
  const parsed = uuidSchema.safeParse(itineraryId);
  if (!parsed.success) {
    return { success: false, error: 'Invalid itinerary ID.' };
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Verify user is a coach
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach) {
    return { success: false, error: 'Only coaches can manage expenses' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: itinerary } = await (supabase as any)
    .from('golf_travel_itineraries')
    .select('event_name, destination, departure_date')
    .eq('id', parsed.data)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: expenses, error } = await (supabase as any)
    .from('golf_travel_expenses')
    .select('*')
    .eq('itinerary_id', parsed.data)
    .order('expense_date', { ascending: true });

  if (error) {
    return { success: false, error: 'Failed to export expenses.' };
  }

  if (!expenses || expenses.length === 0) {
    return { success: false, error: 'No expenses to export.' };
  }

  // Build CSV
  const headers = ['Date', 'Category', 'Description', 'Vendor', 'Amount', 'Paid By', 'Notes'];
  const rows = expenses.map((exp: TravelExpense) => [
    exp.expense_date || '',
    exp.category,
    `"${(exp.description || '').replace(/"/g, '""')}"`,
    `"${(exp.vendor_name || '').replace(/"/g, '""')}"`,
    exp.amount.toFixed(2),
    exp.paid_by,
    `"${(exp.notes || '').replace(/"/g, '""')}"`,
  ]);

  const tripInfo = itinerary ? `# ${itinerary.event_name} - ${itinerary.destination} (${itinerary.departure_date})\n` : '';
  const csv = tripInfo + headers.join(',') + '\n' + rows.map((r: string[]) => r.join(',')).join('\n');

  return { success: true, csv };
}

// ============================================================================
// BUDGET TRACKING
// ============================================================================

const budgetSchema = z.object({
  itinerary_id: z.string().uuid(),
  category: expenseCategorySchema,
  budgeted_amount: z.number().nonnegative().max(10_000_000),
});

export interface TravelBudget {
  id: string;
  itinerary_id: string;
  category: ExpenseCategory;
  budgeted_amount: number;
}

/**
 * Set or update budget for a category
 */
export async function setBudget(input: { itinerary_id: string; category: ExpenseCategory; budgeted_amount: number }) {
  try {
    const validatedData = budgetSchema.parse(input);
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!coach) {
      return { success: false, error: 'Only coaches can manage expenses' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('golf_travel_budgets')
      .upsert({
        itinerary_id: validatedData.itinerary_id,
        category: validatedData.category,
        budgeted_amount: validatedData.budgeted_amount,
      }, {
        onConflict: 'itinerary_id,category',
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: 'Failed to set budget. Please try again.' };
    }

    revalidatePath('/golf/dashboard/travel');
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid budget data.' };
    }
    await logServerError(
      `Unexpected error in setBudget: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'travel.setBudget', featureArea: 'travel' }
    );
    return formatSafeErrorResponse(error);
  }
}

/**
 * Get budgets for an itinerary
 */
export async function getBudgetsForItinerary(itineraryId: string): Promise<{ success: boolean; data?: TravelBudget[]; error?: string }> {
  const parsed = uuidSchema.safeParse(itineraryId);
  if (!parsed.success) {
    return { success: false, error: 'Invalid itinerary ID.' };
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('golf_travel_budgets')
    .select('*')
    .eq('itinerary_id', parsed.data);

  if (error) {
    return { success: false, error: 'Failed to fetch budgets.' };
  }

  return { success: true, data: data || [] };
}

/**
 * The travel itinerary linked to a calendar event (calendar→travel cross-link).
 * The join already exists on the itinerary side (`event_id`); this is the reverse
 * lookup so the event-detail drawer can offer a "View itinerary" affordance.
 * Returns the minimal shape the link needs — id + display name — or `null` when
 * the event has no linked trip (honest: the caller hides the link entirely).
 * RLS on golf_travel_itineraries already scopes the read to the team.
 */
export async function getItineraryForEvent(
  eventId: string,
): Promise<{ success: boolean; data?: { id: string; event_name: string; destination: string } | null; error?: string }> {
  const parsed = uuidSchema.safeParse(eventId);
  if (!parsed.success) {
    return { success: false, error: 'Invalid event ID.' };
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('golf_travel_itineraries')
    .select('id, event_name, destination')
    .eq('event_id', parsed.data)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { success: false, error: 'Failed to look up linked itinerary.' };
  }

  return { success: true, data: data ?? null };
}
