'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

interface CreateEventInput {
  title: string;
  eventType: string;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string;
  description?: string;
}

interface UpdateEventInput {
  title?: string;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string;
  description?: string;
}

export async function createBaseballEvent(input: CreateEventInput) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get the coach's team
  const { data: coach } = await supabase
    .from('coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!coach || !coach.organization_id) {
    return { success: false, error: 'Coach not found' };
  }

  // Get team for this coach
  const { data: team } = await supabase
    .from('teams')
    .select('id')
    .eq('organization_id', coach.organization_id)
    .single();

  if (!team) {
    return { success: false, error: 'Team not found' };
  }

  // Combine date and time
  const startDateTime = input.startTime
    ? `${input.startDate}T${input.startTime}`
    : `${input.startDate}T00:00:00`;

  const endDateTime = input.endTime && input.endDate
    ? `${input.endDate}T${input.endTime}`
    : input.endDate
      ? `${input.endDate}T23:59:59`
      : null;

  const { data, error } = await supabase
    .from('events')
    .insert({
      team_id: team.id,
      coach_id: coach.id,
      name: input.title,
      event_type: input.eventType,
      start_time: startDateTime,
      end_time: endDateTime,
      location_venue: input.location,
      description: input.description,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/baseball/dashboard/calendar');
  return { success: true, data };
}

export async function updateBaseballEvent(eventId: string, input: UpdateEventInput) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const updateData: Record<string, unknown> = {};

  if (input.title !== undefined) updateData.name = input.title;
  if (input.eventType !== undefined) updateData.event_type = input.eventType;
  if (input.location !== undefined) updateData.location_venue = input.location;
  if (input.description !== undefined) updateData.description = input.description;

  // Handle date/time updates
  if (input.startDate !== undefined) {
    const startDateTime = input.startTime
      ? `${input.startDate}T${input.startTime}`
      : `${input.startDate}T00:00:00`;
    updateData.start_time = startDateTime;
  }

  if (input.endDate !== undefined || input.endTime !== undefined) {
    const endDate = input.endDate || input.startDate;
    const endDateTime = input.endTime && endDate
      ? `${endDate}T${input.endTime}`
      : endDate
        ? `${endDate}T23:59:59`
        : null;
    updateData.end_time = endDateTime;
  }

  const { data, error } = await supabase
    .from('events')
    .update(updateData)
    .eq('id', eventId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/baseball/dashboard/calendar');
  return { success: true, data };
}

export async function deleteBaseballEvent(eventId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/baseball/dashboard/calendar');
  return { success: true };
}
