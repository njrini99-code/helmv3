import 'server-only';

import { notFound } from 'next/navigation';
import type { createClient } from '@/lib/supabase/server';

export interface RecruitingViewerAccess {
  /** True when there is no signed-in user (logged-out visitor). */
  isPublicViewer: boolean;
  /** The signed-in viewer's coach row, resolved only for recruiting coach types. */
  coach: { coach_type: string } | null;
}

/**
 * Shared anon/authenticated tiered-access gate for the public team/[id] and
 * program/[id] profile pages. Extracted from near-verbatim duplicated logic in
 * both page components (W4d, docs/baseball/ui-migration-map.md) — presentation
 * and behavior are unchanged, this is a pure refactor.
 *
 * - Logged-out visitors: pass through as a public viewer (pages then read
 *   through the anon-safe `*_public_profile` views).
 * - Authenticated college/juco (recruiting) coaches: pass through with their
 *   `coach_type` resolved so the page can gate roster visibility.
 * - Any other authenticated user (player, HS/showcase coach, etc.): blocked
 *   via `notFound()` — unchanged pre-existing behavior.
 */
export async function resolveRecruitingViewerAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<RecruitingViewerAccess> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let coach: { coach_type: string } | null = null;
  if (user) {
    const { data } = await supabase
      .from('baseball_coaches')
      .select('coach_type')
      .eq('user_id', user.id)
      .single();

    if (!data || !['college', 'juco'].includes(data.coach_type)) {
      notFound(); // Block non-recruiting authenticated users (unchanged)
    }
    coach = data;
  }

  return { isPublicViewer: !user, coach };
}
