'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type {
  TravelItinerary,
  TravelItineraryWithDetails,
  CreateItineraryData,
  UpdateItineraryData,
  ItineraryFilters,
  ActionResult,
} from '@/types/travel.types';

// -----------------------------------------------------------------------------
// Travel Itinerary Actions
// -----------------------------------------------------------------------------

/**
 * Get all itineraries for the current user's teams
 */
export async function getItineraries(
  filters?: ItineraryFilters
): Promise<ActionResult<TravelItineraryWithDetails[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  let query = supabase
    .from('travel_itineraries')
    .select(`
      *,
      travel_team:travel_teams(
        id,
        name,
        high_school_program:high_school_programs(id, name, city, state)
      ),
      creator:profiles!travel_itineraries_created_by_fkey(full_name, avatar_url)
    `);

  // Apply filters
  if (filters?.travel_team_id) {
    query = query.eq('travel_team_id', filters.travel_team_id);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.event_type) {
    query = query.eq('event_type', filters.event_type);
  }
  if (filters?.date_range?.start) {
    query = query.gte('departure_date', filters.date_range.start);
  }
  if (filters?.date_range?.end) {
    query = query.lte('return_date', filters.date_range.end);
  }

  const { data: itineraries, error } = await query.order('departure_date', { ascending: true });

  if (error) {
    return { success: false, error: error.message };
  }

  // Get expense counts for each itinerary
  const itinerariesWithCounts = await Promise.all(
    (itineraries || []).map(async (itinerary) => {
      const { count } = await supabase
        .from('travel_expenses')
        .select('*', { count: 'exact', head: true })
        .eq('itinerary_id', itinerary.id);

      return {
        ...itinerary,
        expenses_count: count || 0,
      };
    })
  );

  return { success: true, data: itinerariesWithCounts };
}

/**
 * Get a single itinerary by ID with full details
 */
export async function getItinerary(id: string): Promise<ActionResult<TravelItineraryWithDetails>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: itinerary, error } = await supabase
    .from('travel_itineraries')
    .select(`
      *,
      travel_team:travel_teams(
        id,
        name,
        coach_id,
        high_school_program:high_school_programs(id, name, city, state),
        coach:high_school_coaches(
          id,
          profile_id,
          title,
          profile:profiles(full_name, avatar_url)
        )
      ),
      creator:profiles!travel_itineraries_created_by_fkey(full_name, avatar_url)
    `)
    .eq('id', id)
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Get expense count
  const { count } = await supabase
    .from('travel_expenses')
    .select('*', { count: 'exact', head: true })
    .eq('itinerary_id', id);

  // Get budget summary using the database function
  const { data: budgetData } = await supabase
    .rpc('get_itinerary_budget_summary', { p_itinerary_id: id });

  const budgetSummary = budgetData?.[0] ? {
    itinerary_id: id,
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
  } : null;

  return {
    success: true,
    data: {
      ...itinerary,
      expenses_count: count || 0,
      budget_summary: budgetSummary,
    },
  };
}

/**
 * Create a new itinerary
 */
export async function createItinerary(
  data: CreateItineraryData
): Promise<ActionResult<TravelItinerary>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Validate dates
  if (new Date(data.return_date) < new Date(data.departure_date)) {
    return { success: false, error: 'Return date must be after departure date' };
  }

  const { data: itinerary, error } = await supabase
    .from('travel_itineraries')
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
  return { success: true, data: itinerary };
}

/**
 * Update an itinerary
 */
export async function updateItinerary(
  id: string,
  data: UpdateItineraryData
): Promise<ActionResult<TravelItinerary>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Validate dates if both are provided
  if (data.departure_date && data.return_date) {
    if (new Date(data.return_date) < new Date(data.departure_date)) {
      return { success: false, error: 'Return date must be after departure date' };
    }
  }

  const { data: itinerary, error } = await supabase
    .from('travel_itineraries')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/travel');
  revalidatePath(`/travel/itinerary/${id}`);
  return { success: true, data: itinerary };
}

/**
 * Delete an itinerary
 */
export async function deleteItinerary(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Check if there are any expenses attached
  const { count } = await supabase
    .from('travel_expenses')
    .select('*', { count: 'exact', head: true })
    .eq('itinerary_id', id);

  if (count && count > 0) {
    // Set status to cancelled instead of deleting
    const { error } = await supabase
      .from('travel_itineraries')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }
  } else {
    // Safe to delete
    const { error } = await supabase
      .from('travel_itineraries')
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }
  }

  revalidatePath('/travel');
  return { success: true };
}

/**
 * Update itinerary status
 */
export async function updateItineraryStatus(
  id: string,
  status: 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
): Promise<ActionResult<TravelItinerary>> {
  return updateItinerary(id, { status });
}

/**
 * Get upcoming itineraries (departure in the next 30 days)
 */
export async function getUpcomingItineraries(): Promise<ActionResult<TravelItineraryWithDetails[]>> {
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return getItineraries({
    date_range: {
      start: now.toISOString().split('T')[0],
      end: thirtyDaysLater.toISOString().split('T')[0],
    },
  });
}

/**
 * Get past itineraries
 */
export async function getPastItineraries(): Promise<ActionResult<TravelItineraryWithDetails[]>> {
  const now = new Date();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: itineraries, error } = await supabase
    .from('travel_itineraries')
    .select(`
      *,
      travel_team:travel_teams(
        id,
        name,
        high_school_program:high_school_programs(id, name, city, state)
      ),
      creator:profiles!travel_itineraries_created_by_fkey(full_name, avatar_url)
    `)
    .lt('return_date', now.toISOString().split('T')[0])
    .order('departure_date', { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: itineraries || [] };
}
