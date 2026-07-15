// =============================================================================
// src/lib/baseball/insights/resolve-coach-id.ts
//
// Plain (non-'use server') helper — relocated out of actions/insights.ts
// (#394) so it stops being an accidental public server-action endpoint.
// `'use server'` files export ONLY server actions callable from the client;
// this resolver is an internal helper several actions in insights.ts call
// mid-body, not an entry point of its own.
// =============================================================================

/**
 * Resolve the caller's `baseball_coaches.id` from their auth user id.
 *
 * `baseball_coach_insights.coach_id` is a `baseball_coaches.id`, NOT the auth
 * uid — the same distinction the player-profile page makes when it scopes
 * insights with `coach.id` (src/app/baseball/(dashboard)/dashboard/players/[id]/page.tsx).
 * Comparing an insight's `coach_id` directly against `supabase.auth.getUser().id`
 * compares two different id domains and rejects every real coach. Returns
 * null when the user has no coach row.
 *
 * Takes an already-authenticated `supabase` client and `userId` from its
 * caller (every call site in actions/insights.ts derives `userId` from its
 * own prior `supabase.auth.getUser()` check, e.g. `dismissInsight`). Exported
 * as a plain function so insight-lifecycle.test.ts can unit-test it directly.
 */
export async function resolveCallerCoachId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<string | null> {
  // nosemgrep: helmv3-server-action-missing-auth-check -- see JSDoc above; this helper trusts its caller's already-authenticated `userId`, it doesn't own a session to re-check.
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', userId)
    .single();
  return (coach as { id: string } | null)?.id ?? null;
}
