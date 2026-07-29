import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { resolveCoachChatContext, type CoachChatContext } from './context';
import { getProgramPulse, type ProgramPulse } from './program-pulse';

/**
 * ============================================================================
 * Request-scoped CoachHelm chat context + program pulse
 * ----------------------------------------------------------------------------
 * `resolveCoachChatContext` is SIX SERIAL round trips — `auth.getUser()` →
 * `golf_coaches` → `resolveCoachTeamIdWithCookie` → `golf_teams` →
 * `golf_team_members` → `golf_players`. `getProgramPulse` then adds a six-query
 * wave on top, including a `golf_rounds` read capped at 400 rows.
 *
 * That whole chain was running TWICE on `/golf/dashboard/intelligence` and
 * `/golf/dashboard/coachhelm/chat`: once in `(dashboard)/dashboard/layout.tsx`
 * for the chat drawer, and again in the page itself. Two independent callers,
 * same request, same answer, double the latency.
 *
 * The obvious fix — `cache(resolveCoachChatContext)` — does NOT work here, and
 * it is worth writing down why so nobody tries it again. `React.cache` keys on
 * the ARGUMENTS, and that function takes a Supabase client. `createClient()`
 * (src/lib/supabase/server.ts) is not itself cached, so every call site
 * constructs a fresh client object; two callers would pass two different
 * identities and miss the cache every time.
 *
 * So these wrappers take NO arguments and build their own client. A zero-arg
 * `cache()` is a guaranteed hit for the rest of the render pass, which is
 * exactly the scope we want: deduplicated within one request, never shared
 * across requests or across users.
 *
 * `cache()` memoises rejections too. That is correct here — a caller that would
 * have thrown `CoachContextError` (not a coach, no active team) still throws,
 * with the same error, rather than silently re-running six queries to arrive at
 * the same failure.
 * ========================================================================== */

/**
 * The coach's chat context for THIS request. Throws `CoachContextError` exactly
 * as `resolveCoachChatContext` does — callers that already handle it keep
 * working unchanged.
 */
export const getCoachChatContext = cache(async (): Promise<CoachChatContext> => {
  const sb = await createClient();
  return resolveCoachChatContext(sb);
});

/**
 * The program pulse for THIS request, or `null` if it cannot be read.
 *
 * Returns `null` rather than throwing because every current consumer already
 * degrades that way: the drawer drops its suggestions, the Brief omits the
 * composer. A pulse failure must never take the surrounding surface down.
 */
export const getCoachProgramPulse = cache(async (): Promise<ProgramPulse | null> => {
  try {
    const [sb, ctx] = await Promise.all([createClient(), getCoachChatContext()]);
    return await getProgramPulse(sb, ctx);
  } catch {
    return null;
  }
});
