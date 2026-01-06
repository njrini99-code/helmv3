'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// ============================================================================
// VALIDATION SCHEMAS (Zod)
// ============================================================================

const transportationTypeSchema = z.enum(['bus', 'van', 'fly', 'carpool']);

const createTravelItinerarySchema = z.object({
  team_id: z.string().uuid(),
  event_id: z.string().uuid().optional(),
  event_name: z.string().min(1).max(200),
  destination: z.string().min(1).max(200),
  transportation_type: transportationTypeSchema,
  departure_date: z.string(),
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
  created_by: z.string().uuid(),
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
  transportation_type: 'bus' | 'van' | 'fly' | 'carpool';
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
  created_by: string;
}

export interface UpdateTravelItineraryInput {
  id: string;
  event_name?: string;
  destination?: string;
  transportation_type?: 'bus' | 'van' | 'fly' | 'carpool';
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

type TravelItineraryUpdateData = Omit<UpdateTravelItineraryInput, 'id'>;

/**
 * Create a new golf travel itinerary
 */
export async function createGolfTravelItinerary(input: CreateTravelItineraryInput) {
  try {
    // Validate input
    const validatedData = createTravelItinerarySchema.parse(input);

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('golf_travel_itineraries')
      .insert({
        team_id: validatedData.team_id,
        event_id: validatedData.event_id,
        event_name: validatedData.event_name,
        destination: validatedData.destination,
        transportation_type: validatedData.transportation_type,
        departure_date: validatedData.departure_date,
        departure_time: validatedData.departure_time,
        departure_location: validatedData.departure_location,
        return_date: validatedData.return_date,
        return_time: validatedData.return_time,
        flight_info: validatedData.flight_info,
        hotel_name: validatedData.hotel_name,
        hotel_address: validatedData.hotel_address,
        hotel_phone: validatedData.hotel_phone,
        hotel_confirmation: validatedData.hotel_confirmation,
        check_in_date: validatedData.check_in_date,
        check_out_date: validatedData.check_out_date,
        room_assignments: validatedData.room_assignments,
        uniform_requirements: validatedData.uniform_requirements,
        gear_list: validatedData.gear_list,
        notes: validatedData.notes,
        created_by: validatedData.created_by,
      })
      .select()
      .single();

    if (error) {
      return {
        success: false,
        error: error.message,
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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
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

    // Extract update data (omit id)
    const { id, ...updateData } = validatedData;

    const { data, error } = await supabase
      .from('golf_travel_itineraries')
      .update(updateData as TravelItineraryUpdateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return {
        success: false,
        error: error.message,
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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}

/**
 * Delete a golf travel itinerary
 */
export async function deleteGolfTravelItinerary(itineraryId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('golf_travel_itineraries')
    .delete()
    .eq('id', itineraryId);

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath('/golf/dashboard/travel');

  return {
    success: true,
  };
}
