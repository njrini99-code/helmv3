'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

interface PhilosophySettings {
  coachId: string;
  alertSensitivity: 'conservative' | 'balanced' | 'aggressive';
  declineThreshold: number;
  pressureGapThreshold: number;
  bubbleZoneRange: number;
  priority_hitting: number;
  priority_power: number;
  priority_plate_discipline: number;
  priority_speed: number;
  priority_defense: number;
}

export async function savePhilosophySettings(
  settings: PhilosophySettings
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Verify coach ownership
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .eq('id', settings.coachId)
    .single();

  if (!coach) {
    return { success: false, error: 'Unauthorized' };
  }

  const philosophyData = {
    coach_id: settings.coachId,
    alert_sensitivity: settings.alertSensitivity,
    decline_threshold: settings.declineThreshold,
    pressure_gap_threshold: settings.pressureGapThreshold,
    bubble_zone_range: settings.bubbleZoneRange,
    priority_hitting: settings.priority_hitting,
    priority_power: settings.priority_power,
    priority_plate_discipline: settings.priority_plate_discipline,
    priority_speed: settings.priority_speed,
    priority_defense: settings.priority_defense,
    updated_at: new Date().toISOString(),
  };

  // Upsert philosophy settings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upsertError } = await (supabase as any)
    .from('baseball_coach_philosophy')
    .upsert(philosophyData, {
      onConflict: 'coach_id',
    });

  if (upsertError) {
    console.error('Failed to save philosophy:', upsertError);
    return { success: false, error: 'Failed to save settings' };
  }

  revalidatePath('/baseball/dashboard/settings/philosophy');
  revalidatePath('/baseball/dashboard/command-center');

  return { success: true };
}

export async function getPhilosophySettings(coachId: string) {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('baseball_coach_philosophy')
    .select('*')
    .eq('coach_id', coachId)
    .single();

  if (error) {
    return null;
  }

  return data;
}
