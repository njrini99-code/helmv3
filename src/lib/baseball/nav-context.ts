'use server';

// =============================================================================
// src/lib/baseball/nav-context.ts
//
// Routes & Nav — capability context wiring (post-build review fix, critical).
//
// THE BUG THIS FIXES
//   The dashboard layouts rendered <BaseballDashboardShell role={role}> and
//   never passed a `navContext`. The shell therefore fell back to an empty
//   capability map ({ role, capabilities: {} }), and isBaseballNavEntryVisible()
//   fail-closes any entry with a `requiredCapability` when the cap is not
//   === true. Net effect: every capability-gated coach vertical (Import Center,
//   Postgame Review, Practice Effectiveness, Decision Room, Staff Settings,
//   Program Settings) was permanently hidden for ALL coaches — even a head
//   coach who implicitly holds every capability server-side — leaving six
//   Phase-1 feature verticals reachable only by typing the URL.
//
// THE FIX
//   Resolve the active team + the coach's real capability map ON THE SERVER and
//   hand the layouts a fully-resolved BaseballNavContext to pass down to the
//   shell (and thus to both <Sidebar baseballNavContext=... /> instances and the
//   mobile bottom nav). The layouts stay client components (they keep the
//   useBaseballAuth loading/redirect gate); this server action is the small
//   server hop they call to get real capabilities — option (a) in the review's
//   recommended fix, packaged so the client layout structure is untouched.
//
// SECURITY
//   - This is the SAME resolution the server actions use: getActiveBaseball
//     Context() re-validates the active-team cookie against real membership rows,
//     and resolveBaseballCapabilities() resolves caps from the coach's own staff
//     row (head/primary coach => all caps; suspended/removed/invited => none).
//   - Nav filtering is a UX affordance ONLY (see nav-registry.ts security note).
//     Every gated route is independently enforced server-side by middleware +
//     withBaseballAction({ requiredCapability }). A forged client navContext can
//     at most reveal a link the user still cannot act on — but because the map is
//     resolved here on the server and never read from client input, even that is
//     not possible through this path.
//
// This module is `'use server'`, so it exports ONLY async server actions. The
// BaseballNavContext shape lives in the pure, isomorphic nav-registry module.
// =============================================================================

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import { createClient } from '@/lib/supabase/server';
import { logServerException } from '@/lib/server-error-logger';
import { fromUntyped } from '@/lib/supabase/untyped';
import {
  getBaseballDefaultLandingHref,
  type BaseballNavContext,
} from '@/lib/baseball/nav-registry';
import {
  BASEBALL_PROGRAM_TYPES,
  type BaseballProgramType,
} from '@/lib/types/baseball-settings';

/**
 * Read the active team's program_type (the variant engine's selector). RLS-scoped
 * read; returns null on any miss so callers fall back to the college-neutral
 * default nav order. Never throws into the nav resolve.
 */
async function readActiveProgramType(
  teamId: string,
): Promise<BaseballProgramType | null> {
  try {
    const supabase = await createClient();
    const { data } = await fromUntyped(supabase, 'baseball_teams')
      .select('program_type')
      .eq('id', teamId)
      .maybeSingle();
    const raw = (data as { program_type?: unknown } | null)?.program_type;
    return typeof raw === 'string' &&
      (BASEBALL_PROGRAM_TYPES as readonly string[]).includes(raw)
      ? (raw as BaseballProgramType)
      : null;
  } catch (err) {
    await logServerException(err, {
      action: 'readActiveProgramType',
      featureArea: 'baseball-nav',
      source: 'server_action',
      handled: true,
      extra: { teamId },
    });
    return null;
  }
}

/**
 * Resolve the fully-populated nav context for the current request: the active
 * team's role plus — for coaches — the real, server-resolved capability map.
 *
 * Returns `null` only when the user has no active baseball team context
 * (unauthenticated, or no memberships). Callers should treat null as "render
 * the fail-closed role-only fallback" — the shell already does this.
 *
 * Players never carry staff capabilities, so for a player active-role we skip
 * the capability resolve entirely and return an empty map (the registry never
 * asks a player for a capability). This also saves a staff-row read for the
 * common player case.
 */
export async function getBaseballNavContext(): Promise<BaseballNavContext | null> {
  const active = await getActiveBaseballContext();
  if (!active) return null;

  // Program type drives mode-aware nav ORDER + default landing + terminology for
  // BOTH roles (players also get a mode-appropriate surface order). Resolved in
  // parallel with capabilities so it adds no latency for coaches.
  if (active.activeRole !== 'coach') {
    const programType = await readActiveProgramType(active.activeTeamId);
    return { role: active.activeRole, capabilities: {}, programType };
  }

  const [capabilities, programType] = await Promise.all([
    resolveBaseballCapabilities(active.activeTeamId),
    readActiveProgramType(active.activeTeamId),
  ]);
  return { role: 'coach', capabilities, programType };
}

/**
 * Resolve the VARIANT-DRIVEN default landing href for the current user.
 *
 * THE BUG THIS FIXES (post-build review, high / completeness)
 *   The player surface was selected by hard-forking on the PLAYER record's own
 *   `player_type` into four fixed route files
 *   (/baseball/player/{college|high-school|juco|showcase}). That contradicts the
 *   v4 Program Type Acceptance contract:
 *     - "player experience changes by context"
 *     - "settings control features instead of hard-coded copies"
 *   The variant engine (getProgramVariant(programType).playerDefaultLandingId /
 *   playerNavPriority) was built to be the single selector and is exercised by
 *   the sidebar/mobile nav already — but NO routing entry consumed it, so the
 *   player landing bypassed it entirely.
 *
 * THE FIX
 *   Land BOTH roles through the variant engine: resolve the active team's real
 *   nav context (role + program_type + — for coaches — capabilities) and return
 *   getBaseballDefaultLandingHref(ctx). The program's MODE (program_type), not
 *   the player's own type, now governs the player surface, and the resolved href
 *   is guaranteed VISIBLE for the context (capability-aware fallback chain). The
 *   four type-keyed player pages collapse into thin redirects that funnel through
 *   THIS one helper instead of four near-duplicate copies.
 *
 * Returns null when the user has no active baseball context (caller falls back to
 * the role-neutral safe home). Never throws into the redirect path.
 */
export async function resolveBaseballLandingHref(): Promise<string | null> {
  const ctx = await getBaseballNavContext();
  if (!ctx) return null;
  return getBaseballDefaultLandingHref(ctx);
}
