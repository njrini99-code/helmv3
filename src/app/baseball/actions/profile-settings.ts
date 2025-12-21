'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updatePlayerPrivacySettings(playerId: string, settings: any) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Verify player belongs to user
  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('user_id', user.id)
    .single();

  if (!player) {
    throw new Error('Unauthorized: Player not found');
  }

  // Update settings
  const { error } = await supabase
    .from('player_settings')
    .upsert({
      player_id: playerId,
      ...settings,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`Failed to update settings: ${error.message}`);
  }

  revalidatePath('/baseball/dashboard/settings');
  revalidatePath(`/player/${playerId}`);

  return { success: true };
}

export async function updateOrganizationProfile(organizationId: string, data: any) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Update organization
  const { error } = await supabase
    .from('organizations')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId);

  if (error) {
    throw new Error(`Failed to update organization: ${error.message}`);
  }

  revalidatePath('/baseball/dashboard/program');
  revalidatePath(`/program/${organizationId}`);
}

export async function updateOrganizationSettings(_organizationId: string, _settings: unknown) {
  // TODO: Implement when organization_settings table is created
  throw new Error('Not implemented');

  /* const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Update settings
  const { error } = await supabase
    .from('organization_settings')
    .upsert({
      organization_id: organizationId,
      ...settings,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`Failed to update settings: ${error.message}`);
  }

  revalidatePath('/baseball/dashboard/program');
  revalidatePath(`/program/${organizationId}`); */
}
