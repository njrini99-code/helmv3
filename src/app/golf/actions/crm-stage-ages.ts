'use server';

// ============================================================================
// CRM STAGE AGES — SERVER ACTION
// ============================================================================
//
// Reads `get_crm_stage_ages()` — the latest per-coach stage-entry timestamp,
// derived from the `crm_stage_transitions` table (see
// supabase/migrations/20260720150000_crm_stage_tracking.sql). The RPC is
// SECURITY DEFINER and self-gates on `users.role = 'admin'`, so we only need
// to authenticate the caller here, mirroring the getAuthedClient() pattern
// in crm-foundations.ts:36.
//
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { logServerException } from '@/lib/server-error-logger';

export interface StageAge {
  stageSince: string;
  isSeed: boolean;
}

interface StageAgeRow {
  coach_id: string;
  stage_since: string;
  is_seed: boolean;
}

async function getAuthedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return { supabase, user };
}

export async function getStageAges(): Promise<Record<string, StageAge>> {
  try {
    const { supabase } = await getAuthedClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_crm_stage_ages');

    if (error) {
      throw new Error(`Failed to load stage ages: ${error.message}`);
    }

    const out: Record<string, StageAge> = {};
    for (const row of (data ?? []) as StageAgeRow[]) {
      out[row.coach_id] = {
        stageSince: row.stage_since,
        isSeed: row.is_seed,
      };
    }
    return out;
  } catch (error) {
    void logServerException(error, {
      action: 'crm_stage_ages.getStageAges',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    return {};
  }
}
