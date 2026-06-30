import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { ACTIVE_BASEBALL_TEAM_COOKIE } from '@/lib/baseball/active-context-shared';
import { resolveCoachActiveTeamId } from '@/lib/baseball/resolve-team';

type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Cookie-aware drop-in for server pages and actions that need the coach's
 * active baseball team id.
 */
export async function resolveCoachTeamIdWithCookie(
  supabase: TypedSupabaseClient,
  organizationId: string | null | undefined,
  coachId: string | null | undefined,
): Promise<string | null> {
  let cookieTeamId: string | null = null;
  try {
    const cookieStore = await cookies();
    cookieTeamId = cookieStore.get(ACTIVE_BASEBALL_TEAM_COOKIE)?.value ?? null;
  } catch {
    cookieTeamId = null;
  }
  return resolveCoachActiveTeamId(supabase, organizationId, coachId, cookieTeamId);
}
