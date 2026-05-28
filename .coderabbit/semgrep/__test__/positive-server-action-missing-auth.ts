// Positive fixture for `helmv3-server-action-missing-auth-check`.
// This file MUST fire that rule. It exports an async server-action
// function that calls supabase.from() and supabase.rpc() without ever
// calling supabase.auth.getUser() — a class-1 RLS bypass risk.
//
// Mirrored under .coderabbit/semgrep/__test__/ so the rule pack has at
// least one known-positive that exercises both `from` and `rpc`
// branches of the rule. See
// docs/operations/2026-05-28-coderabbit-fails-investigation.md.

'use server';

import { createClient } from '@/lib/supabase/server';

// Missing auth check — fires the rule.
export async function leakyAction(playerId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('golf_players').select('*').eq('id', playerId);
  return data;
}

// Same shape with .rpc — also fires.
export async function leakyRpcAction(coachId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc('golf_get_coach_summary', { coach_id: coachId });
  return data;
}
