'use server';

// =============================================================================
// src/app/lifting/actions/athletes.ts
//
// Server actions for the Lifting Lab athlete roster.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';

export async function syncOrgAthletes(orgId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated.' };
  try {
    const { error } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id')
      .eq('organization_id', orgId)
      .limit(1);
    if (error) throw error;
    // The actual sync RPC is helm_lifting_sync_org_athletes — call it if it exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.rpc as any)('helm_lifting_sync_org_athletes', { p_org_id: orgId });
    revalidatePath('/lifting/dashboard/athletes');
    return { success: true };
  } catch {
    return { success: false, error: 'Sync failed. Try again.' };
  }
}
