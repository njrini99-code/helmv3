// =============================================================================
// src/lib/baseball/ai-policy-server.ts
//
// Wave 4 / packet: qa-screens (AI-settings enforcement remediation)
//
// SERVER-side I/O wrapper for the pure AI-governance policy (ai-policy.ts). It is
// the AI-section mirror of player-access.ts: the pure module decides, this module
// READS the team's baseball_program_settings ai_* columns (RLS-scoped) and falls
// back to the program-type default when no settings row exists — so an
// un-configured team still gets the SAFE guarded posture, never an open door.
//
// readAiPolicy(teamId) is the single entry point the engine calls once per run
// (coachhelm.ts) before generating anything.
//
// SECURITY: the read uses the request-scoped RLS client; the caller's membership
// governs the row it can see. No service_role here. The policy itself is the
// team POLICY layer on top of RLS row-ownership.
// =============================================================================

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import type { BaseballProgramType } from '@/lib/types/baseball-settings';
import {
  AI_POLICY_COLUMN_LIST,
  DEFAULT_AI_POLICY,
  defaultAiPolicy,
  resolveAiPolicy,
  type AiPolicy,
} from '@/lib/baseball/ai-policy';

export type { AiPolicy } from '@/lib/baseball/ai-policy';
export {
  decideAiGenerationAllowed,
  decideStaffAiAllowed,
  decideAiOutput,
  isAiOutputStale,
  applyGuardrails,
  type AiOutputDecision,
  type AiWithholdReason,
} from '@/lib/baseball/ai-policy';

/**
 * Resolve the team's AI policy from baseball_program_settings using an ALREADY-
 * resolved client, fail-closed to the program-type default when no row exists.
 * Never throws — on any read miss it returns the safe default posture.
 *
 * The client is EITHER the RLS server client OR the service-role admin client
 * (both are SupabaseClient). RLS applies to the RLS client; the admin client is
 * ONLY ever used by the trusted scheduled evaluator, which scopes the read by
 * team_id itself. This is the client-agnostic core so the cron (admin client, no
 * session) reads the SAME policy the RLS engine does, instead of duplicating the
 * column mapping.
 */
export async function readAiPolicyWithClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any>,
  teamId: string,
): Promise<AiPolicy> {
  if (!teamId) return { ...DEFAULT_AI_POLICY };

  const { data: settings } = await fromUntyped(client, 'baseball_program_settings')
    .select(AI_POLICY_COLUMN_LIST.join(', '))
    .eq('team_id', teamId)
    .maybeSingle();

  // Resolve program type for accurate per-type defaults (today all share the safe
  // baseline, but the indirection keeps parity with the settings model).
  let programType: BaseballProgramType = 'college';
  if (!settings) {
    const { data: teamRow } = await fromUntyped(client, 'baseball_teams')
      .select('program_type')
      .eq('id', teamId)
      .maybeSingle();
    programType =
      (((teamRow as Record<string, unknown> | null)?.program_type as string) ??
        'college') as BaseballProgramType;
    return defaultAiPolicy(programType);
  }

  return resolveAiPolicy(settings as Record<string, unknown>, programType);
}

/**
 * Resolve the team's AI policy with the request-scoped RLS client (caller
 * membership governs the row). The single entry point the engine server action
 * calls once per run.
 */
export async function readAiPolicy(teamId: string): Promise<AiPolicy> {
  if (!teamId) return { ...DEFAULT_AI_POLICY };
  const supabase = await createClient();
  return readAiPolicyWithClient(supabase, teamId);
}
