'use server';

import { createAdminClient } from '@/lib/supabase/admin';

export type ResolveJoinCodeResult =
  | { ok: true; sport: 'golf' | 'baseball' }
  | { ok: false; error: string };

/**
 * Sport-agnostic invite-code resolver for the public `/join` page.
 *
 * Every existing invite flow (`/golf/join/[code]`, `/baseball/join/[code]`)
 * requires the visitor to be authenticated BEFORE it even looks the code
 * up — by design, the underlying RLS policies (`golf_teams_select_by_join_code`,
 * `baseball_teams_select`, "Anyone can view active invitations by code")
 * are all `FOR SELECT TO authenticated`, with no anon grant. A single
 * sport-agnostic field on a public marketing page can't tell which product
 * a code belongs to through the normal RLS-scoped client (`@/lib/supabase/server`)
 * — an anonymous visitor would see zero rows for every code, valid or not.
 *
 * This narrow, read-only, minimal-column lookup uses the existing
 * service-role admin client (`@/lib/supabase/admin` — the same pattern
 * already used by public token-based routes like
 * `/api/calendar/feeds/[token]`) purely to answer "golf or baseball?". It
 * returns nothing but that classification — never a team name, id, or
 * roster — and performs zero writes. No new tables, no new migrations; the
 * actual join (auth check, membership check, expiry check, confirmation
 * UI) still happens entirely inside the existing per-sport `[code]` pages,
 * untouched.
 */
export async function resolveJoinCode(rawCode: string): Promise<ResolveJoinCodeResult> {
  const code = rawCode.trim().toUpperCase();

  if (code.length < 4 || code.length > 12) {
    return { ok: false, error: 'Enter the invite code your coach gave you.' };
  }

  const supabase = createAdminClient();

  const [golfTeam, baseballTeam, baseballInvite] = await Promise.all([
    supabase.from('golf_teams').select('id').eq('join_code', code).maybeSingle(),
    supabase.from('baseball_teams').select('id').eq('join_code', code).maybeSingle(),
    supabase.from('baseball_team_invitations').select('id').eq('code', code).maybeSingle(),
  ]);

  if (golfTeam.data) {
    return { ok: true, sport: 'golf' };
  }
  if (baseballTeam.data || baseballInvite.data) {
    return { ok: true, sport: 'baseball' };
  }

  return {
    ok: false,
    error: "We couldn't find a team with that code. Double-check with your coach and try again.",
  };
}
