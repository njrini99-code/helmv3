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
  Json,
} from '@/lib/types/travel';

// -----------------------------------------------------------------------------
// Helper to transform database itinerary to UI-compatible format
// -----------------------------------------------------------------------------

function transformItinerary(dbItinerary: Record<string, unknown>): TravelItineraryWithDetails {
  return {
    id: dbItinerary.id as string,
    team_id: dbItinerary.team_id as string,
    event_id: dbItinerary.event_id as string | null,
    event_name: dbItinerary.event_name as string | null,
    destination: dbItinerary.destination as string | null,
    transportation_type: dbItinerary.transportation_type as string | null,
    departure_date: dbItinerary.departure_date as string | null,
    departure_time: dbItinerary.departure_time as string | null,
    departure_location: dbItinerary.departure_location as string | null,
    return_date: dbItinerary.return_date as string | null,
    return_time: dbItinerary.return_time as string | null,
    flight_info: (dbItinerary.flight_info ?? null) as Json | null,
    hotel_name: dbItinerary.hotel_name as string | null,
    hotel_address: dbItinerary.hotel_address as string | null,
    hotel_phone: dbItinerary.hotel_phone as string | null,
    hotel_confirmation: dbItinerary.hotel_confirmation as string | null,
    room_assignments: (dbItinerary.room_assignments ?? null) as Json | null,
    uniform_requirements: dbItinerary.uniform_requirements as string | null,
    gear_list: dbItinerary.gear_list as string[] | null,
    notes: dbItinerary.notes as string | null,
    created_by: dbItinerary.created_by as string | null,
    created_at: dbItinerary.created_at as string | null,
    updated_at: dbItinerary.updated_at as string | null,
    // UI compatibility fields
    title: (dbItinerary.event_name as string | null) || undefined,
    status: 'active',
    team: dbItinerary.team ? {
      id: (dbItinerary.team as Record<string, unknown>).id as string,
      name: (dbItinerary.team as Record<string, unknown>).name as string,
    } : null,
  };
}

// -----------------------------------------------------------------------------
// Travel Itinerary Actions
// -----------------------------------------------------------------------------

/**
 * Get all itineraries for a team
 */
export async function getTeamItineraries(
  teamId: string
): Promise<ActionResult<TravelItineraryWithDetails[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: itineraries, error } = await supabase
    .from('golf_travel_itineraries')
    .select(`
      *,
      team:golf_teams(id, name)
    `)
    .eq('team_id', teamId)
    .order('departure_date', { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  const transformedItineraries = (itineraries || []).map(transformItinerary);
  return { success: true, data: transformedItineraries };
}

/**
 * Get itineraries with filters
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
    .from('golf_travel_itineraries')
    .select(`
      *,
      team:golf_teams(id, name)
    `);

  // Apply filters
  if (filters?.team_id) {
    query = query.eq('team_id', filters.team_id);
  }
  if (filters?.event_id) {
    query = query.eq('event_id', filters.event_id);
  }
  if (filters?.date_range?.start) {
    query = query.gte('departure_date', filters.date_range.start);
  }
  if (filters?.date_range?.end) {
    query = query.lte('departure_date', filters.date_range.end);
  }

  const { data: itineraries, error } = await query.order('departure_date', { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  const transformedItineraries = (itineraries || []).map(transformItinerary);
  return { success: true, data: transformedItineraries };
}

/**
 * Get a single itinerary by ID
 */
export async function getItinerary(id: string): Promise<ActionResult<TravelItineraryWithDetails>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: itinerary, error } = await supabase
    .from('golf_travel_itineraries')
    .select(`
      *,
      team:golf_teams(id, name)
    `)
    .eq('id', id)
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: transformItinerary(itinerary) };
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

  // Get the coach record for created_by
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Coach record not found' };
  }

  const { data: itinerary, error } = await supabase
    .from('golf_travel_itineraries')
    .insert({
      team_id: data.team_id,
      event_id: data.event_id,
      event_name: data.event_name,
      destination: data.destination,
      transportation_type: data.transportation_type || 'team_bus',
      departure_date: data.departure_date,
      departure_time: data.departure_time,
      departure_location: data.departure_location,
      return_date: data.return_date,
      return_time: data.return_time,
      flight_info: data.flight_info,
      hotel_name: data.hotel_name,
      hotel_address: data.hotel_address,
      hotel_phone: data.hotel_phone,
      hotel_confirmation: data.hotel_confirmation,
      room_assignments: data.room_assignments,
      uniform_requirements: data.uniform_requirements,
      gear_list: data.gear_list,
      notes: data.notes,
      created_by: coach.id,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');
  return { success: true, data: itinerary as TravelItinerary };
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

  // Build update object with only the fields that match the database schema
  const updateData: Record<string, unknown> = {};
  if (data.event_name !== undefined) updateData.event_name = data.event_name;
  if (data.destination !== undefined) updateData.destination = data.destination;
  if (data.transportation_type !== undefined) updateData.transportation_type = data.transportation_type;
  if (data.departure_date !== undefined) updateData.departure_date = data.departure_date;
  if (data.departure_time !== undefined) updateData.departure_time = data.departure_time;
  if (data.departure_location !== undefined) updateData.departure_location = data.departure_location;
  if (data.return_date !== undefined) updateData.return_date = data.return_date;
  if (data.return_time !== undefined) updateData.return_time = data.return_time;
  if (data.flight_info !== undefined) updateData.flight_info = data.flight_info;
  if (data.hotel_name !== undefined) updateData.hotel_name = data.hotel_name;
  if (data.hotel_address !== undefined) updateData.hotel_address = data.hotel_address;
  if (data.hotel_phone !== undefined) updateData.hotel_phone = data.hotel_phone;
  if (data.hotel_confirmation !== undefined) updateData.hotel_confirmation = data.hotel_confirmation;
  if (data.room_assignments !== undefined) updateData.room_assignments = data.room_assignments;
  if (data.uniform_requirements !== undefined) updateData.uniform_requirements = data.uniform_requirements;
  if (data.gear_list !== undefined) updateData.gear_list = data.gear_list;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const { data: itinerary, error } = await supabase
    .from('golf_travel_itineraries')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');
  revalidatePath(`/golf/dashboard/travel/itinerary/${id}`);
  return { success: true, data: itinerary as TravelItinerary };
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

  const { error } = await supabase
    .from('golf_travel_itineraries')
    .delete()
    .eq('id', id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');
  return { success: true };
}

/**
 * Get upcoming itineraries for a team
 */
export async function getUpcomingItineraries(
  teamId: string,
  limit = 5
): Promise<ActionResult<TravelItineraryWithDetails[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const today = new Date().toISOString().split('T')[0];

  const { data: itineraries, error } = await supabase
    .from('golf_travel_itineraries')
    .select(`
      *,
      team:golf_teams(id, name)
    `)
    .eq('team_id', teamId)
    .gte('departure_date', today)
    .order('departure_date', { ascending: true })
    .limit(limit);

  if (error) {
    return { success: false, error: error.message };
  }

  const transformedItineraries = (itineraries || []).map(transformItinerary);
  return { success: true, data: transformedItineraries };
}

/**
 * Get past itineraries for a team
 */
export async function getPastItineraries(
  teamId: string,
  limit = 10
): Promise<ActionResult<TravelItineraryWithDetails[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const today = new Date().toISOString().split('T')[0];

  const { data: itineraries, error } = await supabase
    .from('golf_travel_itineraries')
    .select(`
      *,
      team:golf_teams(id, name)
    `)
    .eq('team_id', teamId)
    .lt('departure_date', today)
    .order('departure_date', { ascending: false })
    .limit(limit);

  if (error) {
    return { success: false, error: error.message };
  }

  const transformedItineraries = (itineraries || []).map(transformItinerary);
  return { success: true, data: transformedItineraries };
}
