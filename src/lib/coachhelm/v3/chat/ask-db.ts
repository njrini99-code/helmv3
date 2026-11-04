import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The one cast for the Ask lane's held tables (ask_credit_requests, ask_usage_weekly, golf_coachhelm_coach_facts and the
 * new columns on golf_coachhelm_action_runs and golf_coachhelm_chat_conversations). Untyped until their migrations are
 * applied and `npm run db:types` picks them up; callers type the rows they read.
 */
export function askTables(sb: unknown): SupabaseClient {
  return sb as SupabaseClient;
}
