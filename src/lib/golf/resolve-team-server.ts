/**
 * Server-only team resolution helper.
 *
 * This module wraps `resolveCoachActiveTeamId` with Next.js `cookies()` so
 * server pages (which run outside the layout's cookie read) still benefit
 * from the `golf_active_team` cookie.
 *
 * Import this INSTEAD of `resolveCoachTeamId` in server components / RSC
 * page files so the team switcher takes effect on every coach page.
 *
 * DO NOT import this in client components or edge middleware —
 * `next/headers` is server-only.
 */

import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { resolveCoachActiveTeamId } from '@/lib/golf/resolve-team';
import { ACTIVE_TEAM_COOKIE } from '@/lib/golf/team-switcher.constants';

type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Cookie-aware drop-in replacement for `resolveCoachTeamId`.
 *
 * Reads the `golf_active_team` cookie, validates the coach's access, and
 * falls back to the deterministic org-based resolution on any failure.
 * This is the canonical call site for server pages.
 *
 * @param supabase      A server-scoped Supabase client.
 * @param organizationId The coach's `organization_id` (may be null/undefined).
 * @param coachId       The coach's `golf_coaches.id` (may be null/undefined).
 * @returns The resolved team id, or `null` when no team can be found.
 */
export async function resolveCoachTeamIdWithCookie(
  supabase: TypedSupabaseClient,
  organizationId: string | null | undefined,
  coachId: string | null | undefined,
): Promise<string | null> {
  // `cookies()` throws outside a request scope (e.g. unit tests exercising a
  // server action directly, or background jobs). Degrade to "no cookie" — the
  // resolver then falls back to the coach's staffed/default team.
  let cookieTeamId: string | null = null;
  try {
    const cookieStore = await cookies();
    cookieTeamId = cookieStore.get(ACTIVE_TEAM_COOKIE)?.value ?? null;
  } catch {
    cookieTeamId = null;
  }
  return resolveCoachActiveTeamId(supabase, organizationId, coachId, cookieTeamId);
}
