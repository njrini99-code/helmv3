'use server';

// ============================================================================
// CRM STAGE HISTORY — SERVER ACTION
// ============================================================================
//
// Wraps the get_crm_coach_stage_history(p_coach_id) RPC (SECURITY DEFINER,
// self-gates on users.role = 'admin' — see
// supabase/migrations for the stage-transition tracking foundation). Powers
// the "Stage history" block inside CoachDetailPanel's Quick Info section.
//
// Auth: mirrors getAuthedClient() in crm-foundations.ts:36 — we still call
// auth.getUser() here to fail fast on unauthenticated requests before the
// RPC's own role check runs.
//
// This is a read action: never throw. A failed/errored RPC degrades to []
// so the panel simply renders no stage-history block rather than breaking.
//
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { logServerException } from '@/lib/server-error-logger';

async function getAuthedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return { supabase, user };
}

export interface StageHistoryRow {
  from_status: string | null;
  to_status: string;
  changed_at: string;
  source: string;
}

export async function getCoachStageHistory(coachId: string): Promise<StageHistoryRow[]> {
  try {
    const { supabase } = await getAuthedClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_crm_coach_stage_history', {
      p_coach_id: coachId,
    });

    if (error) {
      throw new Error(`Failed to load stage history: ${error.message}`);
    }

    return (data ?? []) as StageHistoryRow[];
  } catch (error) {
    void logServerException(error, {
      action: 'crm_stage_history.getCoachStageHistory',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    return [];
  }
}
